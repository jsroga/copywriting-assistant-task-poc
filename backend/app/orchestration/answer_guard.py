from __future__ import annotations

import re
from typing import cast

from app.domain.gate import meaningful_features
from app.domain.models import (
    REQUIRED_FIELDS,
    BriefFieldName,
    ExtractionResult,
    FieldUpdate,
    Session,
)

# Confirmed prices need a numeral or currency marker — "premium" is not a price.
_PRICE_CONFIRMED_RE = re.compile(
    r"\d|(?:pln|usd|eur|gbp|zł)\b|[$€£]",
    re.IGNORECASE,
)
# Qualitative price language may stay vague; unrelated words must not.
_PRICE_VAGUE_RE = re.compile(
    r"\b("
    r"cheap|cheaper|cheapest|expensive|affordable|budget|pricey|"
    r"inexpensive|costly|reasonable|low[\s-]?cost|high[\s-]?end|"
    r"around|about|approximately|roughly|starting|from"
    r")\b",
    re.IGNORECASE,
)


def _price_text(update: FieldUpdate) -> str:
    if update.status == "confirmed" and update.value is not None:
        if isinstance(update.value, list):
            return " ".join(str(item) for item in update.value)
        return str(update.value)
    return update.raw_text or ""


def _is_acceptable_price(update: FieldUpdate) -> bool:
    text = _price_text(update).strip()
    if not text:
        return False
    if update.status == "confirmed":
        return _PRICE_CONFIRMED_RE.search(text) is not None
    return _PRICE_VAGUE_RE.search(text) is not None


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
