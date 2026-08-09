from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from app.domain.models import (
    ChatMessage,
    GateDecision,
    GeneratedCopy,
    Session,
    ValidationResult,
)
from app.llm.base import LLMClient
from app.orchestration.messages import (
    COPY_READY_AFTER_REPAIR_MESSAGE,
    COPY_READY_MESSAGE,
    VALIDATION_FAILED_MESSAGE,
)
from app.orchestration.responses import ResponseType, TurnResponse, serialize_brief
from app.store import SessionStore
from app.validation.base import validate


class CopyPipeline:
    """Generate → validate → at most one repair → deliver, as a stream of SSE events.

    The repair budget lives here and is structural: there is one call to
    `llm.repair`, so no prompt or retry loop can spend a second attempt.
    """

    def __init__(self, store: SessionStore, llm: LLMClient) -> None:
        self.store = store
        self.llm = llm

    def run(self, session: Session, gate: GateDecision) -> Iterator[tuple[str, Any]]:
        yield ("validation_status", {"phase": "generating"})
        chunks: list[str] = []
        for chunk in self.llm.stream_product_description(session.brief):
            chunks.append(chunk)
            session.streaming_description = "".join(chunks)
            yield ("description_delta", {"text": chunk})
        description = "".join(chunks).strip()

        yield ("validation_status", {"phase": "building_email"})
        email_chunks: list[str] = []
        for chunk in self.llm.stream_email_body(session.brief, description):
            email_chunks.append(chunk)
            yield ("email_delta", {"text": chunk})
        email_body = "".join(email_chunks).strip()

        # The streamed draft is complete. Announce validating *before* the blocking
        # subject/CTA call so the phase arrives when post-stream checks begin —
        # not after a silent wait that makes validating look tied to a failure.
        yield ("validation_status", {"phase": "validating"})
        email = self.llm.generate_email(session.brief, description, body=email_body)
        generated = GeneratedCopy(
            product_description=description,
            marketing_email=email,
        )
        yield from self._validate_then_deliver_or_fail(session, gate, generated)

    def _validate_then_deliver_or_fail(
        self,
        session: Session,
        gate: GateDecision,
        generated: GeneratedCopy,
    ) -> Iterator[tuple[str, Any]]:
        violations = validate(generated, session.brief)

        if not violations:
            validation = ValidationResult(repaired=False, passed=True)
            yield (
                "validation_status",
                {"phase": "done", "validation": validation.model_dump(mode="json")},
            )
            yield ("generated_copy", self._deliver(session, gate, generated, validation))
            return

        # Stay on "repairing" through the LLM call and the re-check — a second
        # "validating" here looks like validation only started once it failed.
        yield (
            "validation_status",
            {
                "phase": "repairing",
                "pre_repair_violations": [
                    item.model_dump(mode="json") for item in violations
                ],
            },
        )
        repaired = self.llm.repair(
            brief=session.brief,
            previous_output=generated,
            violations=violations,
        )
        final_violations = validate(repaired, session.brief)
        validation = ValidationResult(
            repaired=True,
            passed=not final_violations,
            violations=final_violations,
            pre_repair_violations=violations,
        )
        yield (
            "validation_status",
            {"phase": "done", "validation": validation.model_dump(mode="json")},
        )

        if validation.passed:
            yield ("generated_copy", self._deliver(session, gate, repaired, validation))
            return
        yield ("validation_failed", self._fail(session, gate, repaired, validation))

    def _deliver(
        self,
        session: Session,
        gate: GateDecision,
        copy: GeneratedCopy,
        validation: ValidationResult,
    ) -> TurnResponse:
        message = (
            COPY_READY_AFTER_REPAIR_MESSAGE
            if validation.repaired and validation.passed
            else COPY_READY_MESSAGE
        )
        return self._finish(session, gate, copy, validation, "generated_copy", message)

    def _fail(
        self,
        session: Session,
        gate: GateDecision,
        copy: GeneratedCopy,
        validation: ValidationResult,
    ) -> TurnResponse:
        return self._finish(
            session,
            gate,
            copy,
            validation,
            "validation_failed",
            VALIDATION_FAILED_MESSAGE,
        )

    def _finish(
        self,
        session: Session,
        gate: GateDecision,
        copy: GeneratedCopy,
        validation: ValidationResult,
        response_type: ResponseType,
        message: str,
    ) -> TurnResponse:
        """Persist the outcome and build the terminal turn payload."""
        session.awaiting_generation_confirmation = False
        session.last_copy = copy
        session.last_validation = validation
        session.streaming_description = ""
        session.messages.append(
            ChatMessage(role="assistant", content=message, turn=session.turn_number)
        )
        self.store.save(session)
        return TurnResponse(
            type=response_type,
            message=message,
            brief=serialize_brief(session.brief),
            gate=gate,
            copy=copy,
            validation=validation,
        )
