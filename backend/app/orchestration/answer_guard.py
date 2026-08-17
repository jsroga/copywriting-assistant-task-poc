from __future__ import annotations

from typing import cast

from app.domain.gate import meaningful_features
from app.domain.models import (
    REQUIRED_FIELDS,
    BriefFieldName,
    ExtractionResult,
    FieldUpdate,
    Session,
)


def _non_empty_text(value: str | list[str] | None) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(str(item).strip() for item in value)
    return False


def _is_acceptable_price(update: FieldUpdate) -> bool:
    """Accept structured extractor output; do not re-parse natural-language meaning."""
    if update.status == "confirmed":
        return _non_empty_text(update.value)
    return bool((update.raw_text or "").strip())


def _is_acceptable_answer(field: BriefFieldName, update: FieldUpdate) -> bool:
    """True when the update is a real answer for the field we just asked about."""
    if field == "price":
        return _is_acceptable_price(update)
    if update.status != "confirmed":
        return False
    if update.value is None:
        return False
    if field == "key_features":
        return bool(meaningful_features(update.value))
    if isinstance(update.value, str):
        return bool(update.value.strip())
    if isinstance(update.value, list):
        return bool(meaningful_features(update.value))
    return True


def filter_invalid_asked_field_updates(
    session: Session, extraction: ExtractionResult
) -> tuple[ExtractionResult, BriefFieldName | None]:
    """Drop unusable answers to the field we asked for so they never hit the brief.

    Returns the filtered extraction and the rejected field name (if any).
    """
    asked = session.last_asked_field
    if asked is None or asked not in REQUIRED_FIELDS:
        return extraction, None

    field = cast(BriefFieldName, asked)
    kept: list[FieldUpdate] = []
    rejected_asked = False
    for update in extraction.updates:
        if update.field != field:
            kept.append(update)
            continue
        if _is_acceptable_answer(field, update):
            kept.append(update)
        else:
            rejected_asked = True

    if not rejected_asked:
        return extraction, None

    return extraction.model_copy(update={"updates": kept}), field
