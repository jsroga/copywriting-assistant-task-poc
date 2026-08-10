from __future__ import annotations

from app.domain.models import (
    OPTIONAL_FIELDS,
    QUESTION_PRIORITY,
    REQUIRED_FIELDS,
    FieldStatus,
    FieldValue,
    GateDecision,
    GateStatus,
    ProductBrief,
)

MIN_KEY_FEATURES = 1

# Single rule for "meaningful" key features (gate + feature-coverage validator).
# After trim: at least 3 characters and at least one alphanumeric — rejects
# empty/noise fillers like "x" or "ok" without a stopword list.
MIN_MEANINGFUL_FEATURE_CHARS = 3


def meaningful_features(value: str | list[str] | None) -> list[str]:
    if value is None:
        return []
    items = value if isinstance(value, list) else [value]
    features: list[str] = []
    for item in items:
        text = str(item).strip()
        if len(text) >= MIN_MEANINGFUL_FEATURE_CHARS and any(ch.isalnum() for ch in text):
            features.append(text)
    return features


def is_usable(field_name: str, field: FieldValue) -> bool:
    if field.status != FieldStatus.CONFIRMED:
        return False
    if field_name == "key_features":
        return len(meaningful_features(field.value)) >= MIN_KEY_FEATURES
    if field.value is None:
        return False
    if isinstance(field.value, str) and not field.value.strip():
        return False
    return True


def unresolved_conflict_fields(brief: ProductBrief) -> list[str]:
    unresolved = {
        c.field
        for c in brief.conflicts
        if not c.resolved
    }
    for name in QUESTION_PRIORITY:
        field = getattr(brief, name)
        if field.status == FieldStatus.CONFLICTED:
            unresolved.add(name)
    return [name for name in QUESTION_PRIORITY if name in unresolved]


def missing_required_fields(brief: ProductBrief) -> list[str]:
    missing: list[str] = []
    for name in QUESTION_PRIORITY:
        if name not in REQUIRED_FIELDS:
            continue
        field: FieldValue = getattr(brief, name)
        if not is_usable(name, field):
            missing.append(name)
    return missing


def pending_optional_fields(
    brief: ProductBrief,
    optional_fields_prompted: set[str] | None = None,
) -> list[str]:
    """Missing or vague optionals that still deserve one prompt."""
    prompted = optional_fields_prompted or set()
    pending: list[str] = []
    for name in QUESTION_PRIORITY:
        if name not in OPTIONAL_FIELDS:
            continue
        if name in prompted:
            continue
        field: FieldValue = getattr(brief, name)
        if field.status in {FieldStatus.MISSING, FieldStatus.VAGUE}:
            pending.append(name)
    return pending


def vague_optional_fields(
    brief: ProductBrief,
    clarified_vague_optionals: set[str] | None = None,
) -> list[str]:
    """Backward-compatible helper used by older tests."""
    return [
        name
        for name in pending_optional_fields(brief, clarified_vague_optionals)
        if getattr(brief, name).status == FieldStatus.VAGUE
    ]


def evaluate_readiness(
    brief: ProductBrief,
    clarified_vague_optionals: set[str] | None = None,
    optional_fields_prompted: set[str] | None = None,
) -> GateDecision:
    prompted = set(optional_fields_prompted or set())
    prompted.update(clarified_vague_optionals or set())

    conflicts = unresolved_conflict_fields(brief)
    if conflicts:
        return GateDecision(
            status=GateStatus.NEEDS_CLARIFICATION,
            fields=conflicts,
            next_field=conflicts[0],
        )

    missing = missing_required_fields(brief)
    if missing:
        return GateDecision(
            status=GateStatus.NEEDS_INFO,
            fields=missing,
            next_field=missing[0],
        )

    pending_optional = pending_optional_fields(brief, prompted)
    if pending_optional:
        next_field = pending_optional[0]
        field = getattr(brief, next_field)
        status = (
            GateStatus.NEEDS_CLARIFICATION
            if field.status == FieldStatus.VAGUE
            else GateStatus.NEEDS_INFO
        )
        return GateDecision(
            status=status,
            fields=pending_optional,
            next_field=next_field,
        )

    return GateDecision(status=GateStatus.READY, fields=[], next_field=None)
