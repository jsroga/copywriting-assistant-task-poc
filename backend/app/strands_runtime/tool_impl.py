from __future__ import annotations

from app.domain.gate import evaluate_readiness, is_usable
from app.domain.models import (
    ChatMessage,
    ExtractionResult,
    GateDecision,
    GateStatus,
    Intent,
    Session,
)
from app.domain.questions import build_question
from app.domain.reducer import reduce_brief
from app.orchestration.answer_guard import filter_invalid_asked_field_updates
from app.orchestration.messages import (
    CONFIRMATION_MESSAGE,
    CONFIRMATION_PENDING_MESSAGE,
    META_CONTAINMENT_MESSAGE,
    NOT_READY_GENERATION_MESSAGE,
    OFF_TOPIC_MESSAGE,
    OPTIONAL_SKIPPED_ASSUMPTION,
    PRICE_REQUIRED_MESSAGE,
    cannot_extract_message,
)
from app.orchestration.responses import TurnResponse, price_gate, serialize_brief
from app.orchestration.session_effects import (
    add_vague_assumptions,
    record_optional_progress,
    record_vague_clarification,
    remember_asked_field,
)
from app.strands_runtime.context import HISTORY_TAIL, TurnContext
from app.strands_runtime.policy import (
    blocked_only_by_optional,
    next_tool_after_generate,
    next_tool_after_ingest,
)


def _history_tail(session: Session) -> list[ChatMessage]:
    return session.messages[-HISTORY_TAIL:]


def _finish_question(
    ctx: TurnContext, gate: GateDecision, message: str
) -> TurnResponse:
    session = ctx.session
    session.messages.append(
        ChatMessage(role="assistant", content=message, turn=session.turn_number)
    )
    ctx.store.save(session)
    response = TurnResponse(
        type="question",
        message=message,
        brief=serialize_brief(session.brief),
        gate=gate,
    )
    ctx.terminal = response
    ctx.next_tool = None
    ctx.emit("question", response)
    return response


def _ask_confirmation(
    ctx: TurnContext, gate: GateDecision, message: str
) -> TurnResponse:
    session = ctx.session
    session.awaiting_generation_confirmation = True
    session.streaming_description = ""
    session.messages.append(
        ChatMessage(role="assistant", content=message, turn=session.turn_number)
    )
    ctx.store.save(session)
    response = TurnResponse(
        type="ready_for_confirmation",
        message=message,
        brief=serialize_brief(session.brief),
        gate=gate,
        copy=None,
        validation=None,
    )
    ctx.terminal = response
    ctx.next_tool = None
    ctx.emit("ready_for_confirmation", response)
    return response


def _skip_pending_optionals(ctx: TurnContext, gate: GateDecision) -> GateDecision:
    session = ctx.session
    for name in gate.fields:
        session.optional_fields_prompted.add(name)
        assumption = OPTIONAL_SKIPPED_ASSUMPTION.format(field=name)
        if assumption not in session.brief.assumptions:
            session.brief.assumptions.append(assumption)
    ctx.store.save(session)
    return evaluate_readiness(
        session.brief,
        session.clarified_vague_optionals,
        session.optional_fields_prompted,
    )


def run_ingest_user_turn(ctx: TurnContext) -> dict:
    """Extract → guard → reduce → gate; set next_tool via deterministic policy."""
    session = ctx.session
    text = ctx.user_text
    extraction = ctx.llm.extract(text, session.brief, _history_tail(session))
    extraction, rejected_field = filter_invalid_asked_field_updates(session, extraction)
    session.brief = reduce_brief(session.brief, extraction, session.turn_number)
    record_optional_progress(session, extraction, text, session.turn_number)
    add_vague_assumptions(session)
    ctx.store.save(session)

    gate = evaluate_readiness(
        session.brief,
        session.clarified_vague_optionals,
        session.optional_fields_prompted,
    )
    if extraction.intent == Intent.REQUEST_GENERATION and blocked_only_by_optional(
        gate
    ):
        gate = _skip_pending_optionals(ctx, gate)

    ctx.extraction = extraction
    ctx.gate = gate
    ctx.rejected_field = rejected_field
    ctx.next_tool = next_tool_after_ingest(ctx)
    return {
        "intent": extraction.intent.value,
        "updates": len(extraction.updates),
        "gate_status": gate.status.value,
        "gate_fields": list(gate.fields),
        "rejected_field": rejected_field,
        "next_tool": ctx.next_tool,
        "awaiting_confirmation": session.awaiting_generation_confirmation,
    }


def run_ask_clarifying_question(ctx: TurnContext) -> dict:
    session = ctx.session
    extraction = ctx.extraction
    gate = ctx.gate
    if extraction is None or gate is None:
        raise RuntimeError("ask_clarifying_question requires ingest first")

    if ctx.rejected_field is not None:
        gate = GateDecision(
            status=GateStatus.NEEDS_INFO,
            fields=[ctx.rejected_field],
            next_field=ctx.rejected_field,
        )
        remember_asked_field(session, gate)
        message = (
            f"{cannot_extract_message(ctx.rejected_field)} "
            f"{build_question(session.brief, gate)}"
        )
        response = _finish_question(ctx, gate, message)
        return {"type": response.type, "message": response.message}

    if extraction.intent == Intent.META_INSTRUCTION:
        message = (
            f"{META_CONTAINMENT_MESSAGE} "
            f"{build_question(session.brief, gate)}".strip()
        )
        response = _finish_question(ctx, gate, message)
        return {"type": response.type, "message": response.message}

    if extraction.intent == Intent.OFF_TOPIC and not extraction.updates:
        message = (
            f"{OFF_TOPIC_MESSAGE} {build_question(session.brief, gate)}".strip()
        )
        response = _finish_question(ctx, gate, message)
        return {"type": response.type, "message": response.message}

    if (
        extraction.intent == Intent.REQUEST_GENERATION
        and gate.status != GateStatus.READY
    ):
        remember_asked_field(session, gate)
        record_vague_clarification(session, gate)
        message = (
            f"{NOT_READY_GENERATION_MESSAGE} "
            f"{build_question(session.brief, gate)}"
        )
        response = _finish_question(ctx, gate, message)
        return {"type": response.type, "message": response.message}

    if gate.status != GateStatus.READY:
        remember_asked_field(session, gate)
        record_vague_clarification(session, gate)
        response = _finish_question(
            ctx, gate, build_question(session.brief, gate)
        )
        return {"type": response.type, "message": response.message}

    if not is_usable("price", session.brief.price):
        gate = price_gate()
        remember_asked_field(session, gate)
        message = (
            f"{PRICE_REQUIRED_MESSAGE} {build_question(session.brief, gate)}"
        )
        response = _finish_question(ctx, gate, message)
        return {"type": response.type, "message": response.message}

    response = _finish_question(
        ctx, gate, build_question(session.brief, gate)
    )
    return {"type": response.type, "message": response.message}


def run_request_generation_confirmation(ctx: TurnContext) -> dict:
    gate = ctx.gate
    if gate is None:
        raise RuntimeError("request_generation_confirmation requires ingest first")
    session = ctx.session
    message = (
        CONFIRMATION_PENDING_MESSAGE
        if session.awaiting_generation_confirmation
        else CONFIRMATION_MESSAGE
    )
    response = _ask_confirmation(ctx, gate, message)
    return {"type": response.type, "message": response.message}


def run_generate_copy(ctx: TurnContext) -> dict:
    gate = ctx.gate
    if gate is None:
        raise RuntimeError("generate_copy requires ingest first")
    session = ctx.session
    from app.domain.models import GeneratedCopy, ValidationResult
    from app.validation.base import validate

    ctx.emit("validation_status", {"phase": "generating"})
    chunks: list[str] = []
    for chunk in ctx.llm.stream_product_description(session.brief):
        chunks.append(chunk)
        session.streaming_description = "".join(chunks)
        ctx.emit("description_delta", {"text": chunk})
    description = "".join(chunks).strip()

    ctx.emit("validation_status", {"phase": "building_email"})
    email_chunks: list[str] = []
    for chunk in ctx.llm.stream_email_body(session.brief, description):
        email_chunks.append(chunk)
        ctx.emit("email_delta", {"text": chunk})
    email_body = "".join(email_chunks).strip()

    ctx.emit("validation_status", {"phase": "validating"})
    email = ctx.llm.generate_email(session.brief, description, body=email_body)
    generated = GeneratedCopy(
        product_description=description,
        marketing_email=email,
    )

    violations = validate(generated, session.brief)
    if not violations:
        validation = ValidationResult(repaired=False, passed=True)
        ctx.emit(
            "validation_status",
            {"phase": "done", "validation": validation.model_dump(mode="json")},
        )
        response = _deliver_copy(ctx, gate, generated, validation)
        return {"type": response.type, "passed": True, "next_tool": None}

    ctx.pending_copy = generated
    ctx.pending_violations = violations
    ctx.next_tool = next_tool_after_generate(ctx)
    ctx.emit(
        "validation_status",
        {
            "phase": "repairing",
            "pre_repair_violations": [
                item.model_dump(mode="json") for item in violations
            ],
        },
    )
    return {
        "type": "needs_repair",
        "violation_count": len(violations),
        "next_tool": ctx.next_tool,
    }


def _deliver_copy(ctx, gate, copy, validation):
    from app.orchestration.messages import (
        COPY_READY_AFTER_REPAIR_MESSAGE,
        COPY_READY_MESSAGE,
    )

    session = ctx.session
    message = (
        COPY_READY_AFTER_REPAIR_MESSAGE
        if validation.repaired and validation.passed
        else COPY_READY_MESSAGE
    )
    session.awaiting_generation_confirmation = False
    session.last_copy = copy
    session.last_validation = validation
    session.streaming_description = ""
    session.messages.append(
        ChatMessage(role="assistant", content=message, turn=session.turn_number)
    )
    ctx.store.save(session)
    response = TurnResponse(
        type="generated_copy",
        message=message,
        brief=serialize_brief(session.brief),
        gate=gate,
        copy=copy,
        validation=validation,
    )
    ctx.terminal = response
    ctx.next_tool = None
    ctx.emit("generated_copy", response)
    return response


def _fail_copy(ctx, gate, copy, validation):
    from app.orchestration.messages import VALIDATION_FAILED_MESSAGE

    session = ctx.session
    message = VALIDATION_FAILED_MESSAGE
    session.awaiting_generation_confirmation = False
    session.last_copy = copy
    session.last_validation = validation
    session.streaming_description = ""
    session.messages.append(
        ChatMessage(role="assistant", content=message, turn=session.turn_number)
    )
    ctx.store.save(session)
    response = TurnResponse(
        type="validation_failed",
        message=message,
        brief=serialize_brief(session.brief),
        gate=gate,
        copy=copy,
        validation=validation,
    )
    ctx.terminal = response
    ctx.next_tool = None
    ctx.emit("validation_failed", response)
    return response


def run_repair_copy(ctx: TurnContext) -> dict:
    from app.domain.models import ValidationResult
    from app.validation.base import validate

    gate = ctx.gate
    if gate is None or ctx.pending_copy is None:
        raise RuntimeError("repair_copy requires a failed generate_copy first")
    if ctx.repair_used:
        raise RuntimeError("repair budget already spent")

    ctx.repair_used = True
    repaired = ctx.llm.repair(
        brief=ctx.session.brief,
        previous_output=ctx.pending_copy,
        violations=ctx.pending_violations,
    )
    final_violations = validate(repaired, ctx.session.brief)
    validation = ValidationResult(
        repaired=True,
        passed=not final_violations,
        violations=final_violations,
        pre_repair_violations=ctx.pending_violations,
    )
    ctx.emit(
        "validation_status",
        {"phase": "done", "validation": validation.model_dump(mode="json")},
    )
    if validation.passed:
        response = _deliver_copy(ctx, gate, repaired, validation)
        return {"type": response.type, "passed": True}
    response = _fail_copy(ctx, gate, repaired, validation)
    return {"type": response.type, "passed": False}
