from __future__ import annotations

from enum import StrEnum

from app.domain.gate import is_usable
from app.domain.models import (
    OPTIONAL_FIELDS,
    ExtractionResult,
    GateDecision,
    GateStatus,
    Intent,
    Session,
)
from app.orchestration.messages import is_affirmative
from app.strands_runtime.context import TurnContext


class TurnTool(StrEnum):
    INGEST = "ingest_user_turn"
    ASK = "ask_clarifying_question"
    CONFIRM = "request_generation_confirmation"
    GENERATE = "generate_copy"
    REPAIR = "repair_copy"


def has_brief_updates(extraction: ExtractionResult) -> bool:
    if extraction.updates:
        return True
    return extraction.intent in {Intent.CORRECT_INFO, Intent.REFINE_OUTPUT}


def blocked_only_by_optional(gate: GateDecision) -> bool:
    if gate.status == GateStatus.READY:
        return False
    return bool(gate.fields) and all(name in OPTIONAL_FIELDS for name in gate.fields)


def should_generate_now(
    session: Session, extraction: ExtractionResult, text: str
) -> bool:
    if extraction.intent == Intent.REQUEST_GENERATION:
        return True
    if not session.awaiting_generation_confirmation:
        return False
    if has_brief_updates(extraction):
        return False
    return is_affirmative(text)


def next_tool_after_ingest(ctx: TurnContext) -> str:
    """Deterministic next tool after ingest — readiness never lives in free-form prose."""
    if ctx.terminal is not None:
        return ""
    session = ctx.session
    extraction = ctx.extraction
    gate = ctx.gate
    if extraction is None or gate is None:
        return TurnTool.ASK

    if ctx.rejected_field is not None:
        return TurnTool.ASK

    if extraction.intent == Intent.META_INSTRUCTION:
        return TurnTool.ASK
    if extraction.intent == Intent.OFF_TOPIC and not extraction.updates:
        return TurnTool.ASK
    if (
        extraction.intent == Intent.REQUEST_GENERATION
        and gate.status != GateStatus.READY
    ):
        return TurnTool.ASK
    if gate.status != GateStatus.READY:
        return TurnTool.ASK
    if not is_usable("price", session.brief.price):
        return TurnTool.ASK
    if should_generate_now(session, extraction, ctx.user_text):
        return TurnTool.GENERATE
    return TurnTool.CONFIRM


def next_tool_after_generate(ctx: TurnContext) -> str:
    if ctx.terminal is not None:
        return ""
    if ctx.pending_violations and not ctx.repair_used:
        return TurnTool.REPAIR
    return ""


def allowed_tools(ctx: TurnContext) -> frozenset[str]:
    """Tools legal to call given current turn state (hook enforcement)."""
    if ctx.terminal is not None:
        return frozenset()
    if ctx.extraction is None:
        return frozenset({TurnTool.INGEST})
    nxt = ctx.next_tool
    if nxt:
        return frozenset({nxt})
    return frozenset()
