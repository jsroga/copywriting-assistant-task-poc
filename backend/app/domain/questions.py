from __future__ import annotations

from app.domain.models import ConflictRecord, GateDecision, GateStatus, ProductBrief

QUESTIONS: dict[str, str] = {
    "product_name": "What is the product called?",
    "key_features": (
        "What features should customers care about most?"
    ),
    "target_audience": "Who is the main customer for this product?",
    "tone": (
        "What tone should the copy use, for example premium, playful, "
        "technical, or minimal?"
    ),
    "price": (
        "What is the exact price I should use in the copy "
        "(for example 199 PLN or $49)?"
    ),
    "category": "Which product category should I use?",
    "brand_name": "Should the brand name appear in the copy?",
}


def _format_value(value: str | list[str] | None) -> str:
    if value is None:
        return "(unknown)"
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value)


def conflict_question(conflict: ConflictRecord) -> str:
    old = _format_value(conflict.old_value)
    new = _format_value(conflict.new_value)
    return f"I have both {old} and {new} for this value. Which one should I use?"


def latest_unresolved_conflict(
    brief: ProductBrief, field_name: str | None
) -> ConflictRecord | None:
    if field_name is None:
        return None
    for conflict in reversed(brief.conflicts):
        if conflict.field == field_name and not conflict.resolved:
            return conflict
    return None


def build_question(brief: ProductBrief, gate: GateDecision) -> str:
    if gate.status == GateStatus.READY or gate.next_field is None:
        return "Is there anything else you'd like to refine about the product?"

    if gate.status == GateStatus.NEEDS_CLARIFICATION:
        conflict = latest_unresolved_conflict(brief, gate.next_field)
        if conflict is not None:
            return conflict_question(conflict)

    return QUESTIONS.get(
        gate.next_field,
        f"Could you provide more detail about {gate.next_field.replace('_', ' ')}?",
    )
