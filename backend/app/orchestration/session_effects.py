from __future__ import annotations

from app.domain.models import (
    OPTIONAL_FIELDS,
    ExtractionResult,
    FieldStatus,
    GateDecision,
    GateStatus,
    Session,
)
from app.orchestration.messages import (
    OPTIONAL_SKIPPED_ASSUMPTION,
    is_decline_optional,
)


def record_vague_clarification(session: Session, gate: GateDecision) -> None:
    if gate.status != GateStatus.NEEDS_CLARIFICATION:
        return
    next_field = gate.next_field
    if next_field is None or next_field not in OPTIONAL_FIELDS:
        return
    field = getattr(session.brief, next_field)
    if field.status == FieldStatus.VAGUE:
        session.clarified_vague_optionals.add(next_field)


def add_vague_assumptions(session: Session) -> None:
    for field_name in list(session.clarified_vague_optionals):
        field = getattr(session.brief, field_name)
        if field.status != FieldStatus.VAGUE:
            continue
        assumption = (
            f"{field_name} kept qualitative from raw text "
            f"({field.raw_text!r}) without inventing a precise value."
        )
        if assumption not in session.brief.assumptions:
            session.brief.assumptions.append(assumption)


def record_optional_progress(
    session: Session, extraction: ExtractionResult, text: str, turn: int
) -> None:
    """Mark optionals only when answered or explicitly skipped."""
    for name in OPTIONAL_FIELDS:
        field = getattr(session.brief, name)
        if field.updated_at_turn == turn and field.status in {
            FieldStatus.CONFIRMED,
            FieldStatus.VAGUE,
        }:
            session.optional_fields_prompted.add(name)

    asked = session.last_asked_field
    if (
        asked in OPTIONAL_FIELDS
        and is_decline_optional(text)
        and not extraction.updates
    ):
        session.optional_fields_prompted.add(asked)
        assumption = OPTIONAL_SKIPPED_ASSUMPTION.format(field=asked)
        if assumption not in session.brief.assumptions:
            session.brief.assumptions.append(assumption)


def remember_asked_field(session: Session, gate: GateDecision) -> None:
    session.last_asked_field = gate.next_field
