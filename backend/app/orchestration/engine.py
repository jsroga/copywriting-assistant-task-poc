from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from app.domain.gate import evaluate_readiness, is_usable
from app.domain.models import (
    OPTIONAL_FIELDS,
    ChatMessage,
    ExtractionResult,
    GateDecision,
    GateStatus,
    Intent,
    Session,
)
from app.domain.questions import build_question
from app.domain.reducer import reduce_brief
from app.ports import LLMClient
from app.orchestration.answer_guard import filter_invalid_asked_field_updates
from app.orchestration.generation import CopyPipeline
from app.orchestration.messages import (
    CONFIRMATION_MESSAGE,
    CONFIRMATION_PENDING_MESSAGE,
    META_CONTAINMENT_MESSAGE,
    NOT_READY_GENERATION_MESSAGE,
    OFF_TOPIC_MESSAGE,
    OPTIONAL_SKIPPED_ASSUMPTION,
    PRICE_REQUIRED_MESSAGE,
    cannot_extract_message,
    is_affirmative,
)
from app.orchestration.responses import (
    TERMINAL_EVENTS,
    TurnResponse,
    price_gate,
    serialize_brief,
)
from app.orchestration.session_effects import (
    add_vague_assumptions,
    record_optional_progress,
    record_vague_clarification,
    remember_asked_field,
)
from app.store import SessionStore

HISTORY_TAIL = 4


def _history_tail(session: Session) -> list[ChatMessage]:
    return session.messages[-HISTORY_TAIL:]


def _has_brief_updates(extraction: ExtractionResult) -> bool:
    if extraction.updates:
        return True
    return extraction.intent in {Intent.CORRECT_INFO, Intent.REFINE_OUTPUT}


def _blocked_only_by_optional(gate: GateDecision) -> bool:
    """True when the gate is held up purely by optional fields the user never filled."""
    if gate.status == GateStatus.READY:
        return False
    return bool(gate.fields) and all(name in OPTIONAL_FIELDS for name in gate.fields)


def _should_generate_now(
    session: Session, extraction: ExtractionResult, text: str
) -> bool:
    if extraction.intent == Intent.REQUEST_GENERATION:
        return True
    if not session.awaiting_generation_confirmation:
        return False
    if _has_brief_updates(extraction):
        return False
    return is_affirmative(text)


class ConversationOrchestrator:
    """Owns the turn decision loop: extract → reduce → gate → ask, confirm, or hand
    off to the copy pipeline. Control flow lives here, never in the model."""

    def __init__(self, store: SessionStore, llm: LLMClient) -> None:
        self.store = store
        self.llm = llm
        self.copy_pipeline = CopyPipeline(store=store, llm=llm)

    def handle_turn(self, session_id: str, message: str) -> TurnResponse:
        final: TurnResponse | None = None
        for event_name, payload in self.iter_turn_events(session_id, message):
            if event_name in TERMINAL_EVENTS:
                final = payload
        if final is None:
            raise RuntimeError("turn produced no response")
        return final

    def iter_turn_events(
        self, session_id: str, message: str
    ) -> Iterator[tuple[str, Any]]:
        text = message.strip()
        if not text:
            raise ValueError("message must not be empty")

        session = self.store.get_or_create(session_id)
        session.turn_number += 1
        turn = session.turn_number
        session.streaming_description = ""
        session.messages.append(ChatMessage(role="user", content=text, turn=turn))
        self.store.save(session)

        # Flush an early SSE frame before the blocking extract LLM call so the
        # client is not stuck waiting on a silent connection.
        yield ("validation_status", {"phase": "extracting"})

        extraction = self.llm.extract(text, session.brief, _history_tail(session))
        extraction, rejected_field = filter_invalid_asked_field_updates(
            session, extraction
        )
        session.brief = reduce_brief(session.brief, extraction, turn)
        record_optional_progress(session, extraction, text, turn)
        add_vague_assumptions(session)
        self.store.save(session)

        gate = evaluate_readiness(
            session.brief,
            session.clarified_vague_optionals,
            session.optional_fields_prompted,
        )

        if extraction.intent == Intent.REQUEST_GENERATION and _blocked_only_by_optional(
            gate
        ):
            gate = self._skip_pending_optionals(session, gate)

        if rejected_field is not None:
            gate = GateDecision(
                status=GateStatus.NEEDS_INFO,
                fields=[rejected_field],
                next_field=rejected_field,
            )
            remember_asked_field(session, gate)
            yield (
                "question",
                self._finish_question(
                    session,
                    gate,
                    f"{cannot_extract_message(rejected_field)} "
                    f"{build_question(session.brief, gate)}",
                ),
            )
            return

        early = self._early_exit(session, extraction, gate, text)
        if early is not None:
            yield early
            return

        if not is_usable("price", session.brief.price):
            gate = price_gate()
            remember_asked_field(session, gate)
            yield (
                "question",
                self._finish_question(
                    session,
                    gate,
                    f"{PRICE_REQUIRED_MESSAGE} {build_question(session.brief, gate)}",
                ),
            )
            return

        yield from self._ready_path(session, extraction, gate, text)

    def _skip_pending_optionals(
        self, session: Session, gate: GateDecision
    ) -> GateDecision:
        """Honour an explicit generate request: stop asking for optional fields."""
        for name in gate.fields:
            session.optional_fields_prompted.add(name)
            assumption = OPTIONAL_SKIPPED_ASSUMPTION.format(field=name)
            if assumption not in session.brief.assumptions:
                session.brief.assumptions.append(assumption)
        self.store.save(session)
        return evaluate_readiness(
            session.brief,
            session.clarified_vague_optionals,
            session.optional_fields_prompted,
        )

    def _early_exit(
        self,
        session: Session,
        extraction: ExtractionResult,
        gate: GateDecision,
        text: str,
    ) -> tuple[str, TurnResponse] | None:
        del text
        if extraction.intent == Intent.META_INSTRUCTION:
            return (
                "question",
                self._finish_question(
                    session,
                    gate,
                    f"{META_CONTAINMENT_MESSAGE} "
                    f"{build_question(session.brief, gate)}".strip(),
                ),
            )

        if extraction.intent == Intent.OFF_TOPIC and not extraction.updates:
            return (
                "question",
                self._finish_question(
                    session,
                    gate,
                    f"{OFF_TOPIC_MESSAGE} "
                    f"{build_question(session.brief, gate)}".strip(),
                ),
            )

        if (
            extraction.intent == Intent.REQUEST_GENERATION
            and gate.status != GateStatus.READY
        ):
            remember_asked_field(session, gate)
            record_vague_clarification(session, gate)
            return (
                "question",
                self._finish_question(
                    session,
                    gate,
                    f"{NOT_READY_GENERATION_MESSAGE} "
                    f"{build_question(session.brief, gate)}",
                ),
            )

        if gate.status != GateStatus.READY:
            remember_asked_field(session, gate)
            record_vague_clarification(session, gate)
            return (
                "question",
                self._finish_question(
                    session, gate, build_question(session.brief, gate)
                ),
            )
        return None

    def _ready_path(
        self,
        session: Session,
        extraction: ExtractionResult,
        gate: GateDecision,
        text: str,
    ) -> Iterator[tuple[str, Any]]:
        if _should_generate_now(session, extraction, text):
            yield from self.copy_pipeline.run(session, gate)
            return

        message = (
            CONFIRMATION_PENDING_MESSAGE
            if session.awaiting_generation_confirmation
            else CONFIRMATION_MESSAGE
        )
        yield (
            "ready_for_confirmation",
            self._ask_generation_confirmation(session, gate, message),
        )

    def _ask_generation_confirmation(
        self, session: Session, gate: GateDecision, message: str
    ) -> TurnResponse:
        session.awaiting_generation_confirmation = True
        session.streaming_description = ""
        session.messages.append(
            ChatMessage(role="assistant", content=message, turn=session.turn_number)
        )
        self.store.save(session)
        return TurnResponse(
            type="ready_for_confirmation",
            message=message,
            brief=serialize_brief(session.brief),
            gate=gate,
            copy=None,
            validation=None,
        )

    def _finish_question(
        self, session: Session, gate: GateDecision, message: str
    ) -> TurnResponse:
        session.messages.append(
            ChatMessage(role="assistant", content=message, turn=session.turn_number)
        )
        self.store.save(session)
        return TurnResponse(
            type="question",
            message=message,
            brief=serialize_brief(session.brief),
            gate=gate,
        )
