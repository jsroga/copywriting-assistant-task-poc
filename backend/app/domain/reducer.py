from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass

from app.domain.models import (
    ConflictRecord,
    ExtractionResult,
    FieldStatus,
    FieldUpdate,
    FieldValue,
    IncomingStatus,
    Intent,
    ProductBrief,
)


def _normalize_comparable(value: str | list[str] | None) -> str | tuple[str, ...] | None:
    if value is None:
        return None
    if isinstance(value, list):
        return tuple(str(item).strip().lower() for item in value)
    return str(value).strip().lower()


def _values_equal(a: str | list[str] | None, b: str | list[str] | None) -> bool:
    return _normalize_comparable(a) == _normalize_comparable(b)


def _get_field(brief: ProductBrief, name: str) -> FieldValue:
    return getattr(brief, name)


def _set_field(brief: ProductBrief, name: str, field: FieldValue) -> None:
    setattr(brief, name, field)


def _mark_conflicts_resolved(brief: ProductBrief, field_name: str) -> None:
    for conflict in brief.conflicts:
        if conflict.field == field_name and not conflict.resolved:
            conflict.resolved = True


def _vague_raw_text(update: FieldUpdate, field: FieldValue) -> str | None:
    """Preserve whatever wording the user actually used for a vague value."""
    if update.raw_text is not None:
        return update.raw_text
    if isinstance(update.value, str):
        return update.value
    return field.raw_text


def _apply_write(
    field: FieldValue,
    update: FieldUpdate,
    turn_number: int,
    *,
    append_history: bool,
) -> FieldValue:
    updated = field.model_copy(deep=True)
    had_value = field.status in {FieldStatus.CONFIRMED, FieldStatus.CONFLICTED}
    if append_history and had_value and field.value is not None:
        updated.history = [*field.history, field.value]
    if update.status == "vague":
        updated.value = None
        updated.raw_text = _vague_raw_text(update, field)
        updated.status = FieldStatus.VAGUE
    else:
        updated.value = update.value
        updated.raw_text = update.raw_text
        updated.status = FieldStatus.CONFIRMED
    updated.updated_at_turn = turn_number
    return updated


def _matches_conflict_side(brief: ProductBrief, update: FieldUpdate) -> bool:
    """True when the incoming value is one of the two sides of an open conflict."""
    for conflict in brief.conflicts:
        if conflict.field != update.field or conflict.resolved:
            continue
        if _values_equal(conflict.old_value, update.value) or _values_equal(
            conflict.new_value, update.value
        ):
            return True
    return False


@dataclass(frozen=True)
class _Change:
    """One proposed field change and everything a transition needs to judge it."""

    brief: ProductBrief
    field: FieldValue
    update: FieldUpdate
    intent: Intent
    turn_number: int

    def write(self, *, append_history: bool) -> None:
        _set_field(
            self.brief,
            self.update.field,
            _apply_write(
                self.field,
                self.update,
                self.turn_number,
                append_history=append_history,
            ),
        )

    def resolve_conflicts(self) -> None:
        _mark_conflicts_resolved(self.brief, self.update.field)


def _accept(change: _Change) -> bool:
    """Nothing usable on record — take the new value as given."""
    change.write(append_history=False)
    return True


def _ignore(change: _Change) -> bool:
    """Vague text must not disturb a value the user is already disputing."""
    del change
    return False


def _vague_over_confirmed(change: _Change) -> bool:
    """Downgrading a confirmed fact to vague requires explicit correction language."""
    if change.intent != Intent.CORRECT_INFO:
        return False
    change.write(append_history=True)
    change.resolve_conflicts()
    return True


def _resolve_conflicted(change: _Change) -> bool:
    """A conflict clears when the user corrects it or restates one of the two sides."""
    if change.intent != Intent.CORRECT_INFO and not _matches_conflict_side(
        change.brief, change.update
    ):
        return False
    written = _apply_write(
        change.field, change.update, change.turn_number, append_history=True
    )
    written.status = FieldStatus.CONFIRMED
    _set_field(change.brief, change.update.field, written)
    change.resolve_conflicts()
    return True


def _refresh_metadata(change: _Change) -> bool:
    """Same value restated: keep the value, record that this turn touched it."""
    meta = change.field.model_copy(deep=True)
    meta.updated_at_turn = change.turn_number
    if change.update.raw_text is not None:
        meta.raw_text = change.update.raw_text
    _set_field(change.brief, change.update.field, meta)
    return False


def _record_conflict(change: _Change) -> bool:
    """A different value with no correction language is ambiguous — never guess."""
    conflicted = change.field.model_copy(deep=True)
    conflicted.status = FieldStatus.CONFLICTED
    conflicted.updated_at_turn = change.turn_number
    _set_field(change.brief, change.update.field, conflicted)
    change.brief.conflicts.append(
        ConflictRecord(
            field=change.update.field,
            old_value=change.field.value,
            new_value=change.update.value,
            turn=change.turn_number,
            resolved=False,
        )
    )
    return True


def _replace_confirmed(change: _Change) -> bool:
    """Confirmed over confirmed: identical restatement, explicit correction, or clash."""
    if _values_equal(change.field.value, change.update.value):
        return _refresh_metadata(change)
    if change.intent == Intent.CORRECT_INFO:
        change.write(append_history=True)
        change.resolve_conflicts()
        return True
    return _record_conflict(change)


_Transition = Callable[[_Change], bool]

# (incoming update status, status already on record) -> how the brief reacts.
# This table *is* the correction/contradiction policy; it is exhaustive over both
# enums, and each cell returns whether the brief version should bump.
TRANSITIONS: dict[tuple[IncomingStatus, FieldStatus], _Transition] = {
    ("vague", FieldStatus.MISSING): _accept,
    ("vague", FieldStatus.VAGUE): _accept,
    ("vague", FieldStatus.CONFIRMED): _vague_over_confirmed,
    ("vague", FieldStatus.CONFLICTED): _ignore,
    ("confirmed", FieldStatus.MISSING): _accept,
    ("confirmed", FieldStatus.VAGUE): _accept,
    ("confirmed", FieldStatus.CONFIRMED): _replace_confirmed,
    ("confirmed", FieldStatus.CONFLICTED): _resolve_conflicted,
}


def _apply_update(
    brief: ProductBrief,
    update: FieldUpdate,
    intent: Intent,
    turn_number: int,
) -> bool:
    """Apply one field update. Returns True if brief version should bump."""
    field = _get_field(brief, update.field)
    transition = TRANSITIONS[(update.status, field.status)]
    return transition(
        _Change(
            brief=brief,
            field=field,
            update=update,
            intent=intent,
            turn_number=turn_number,
        )
    )


def reduce_brief(
    brief: ProductBrief,
    extraction: ExtractionResult,
    turn_number: int,
) -> ProductBrief:
    """Pure reducer: merge extraction deltas into a new ProductBrief."""
    result = deepcopy(brief)
    mutated = False

    # Hostile meta text must not drive state; only apply updates for non-meta intents,
    # except safely extracted product facts may still be present — apply updates when
    # intent is META_INSTRUCTION only if extractor returned concrete product updates.
    # Off-topic with no product updates is a no-op.
    for update in extraction.updates:
        if extraction.intent == Intent.META_INSTRUCTION:
            # Apply only clearly product-shaped confirmed/vague field updates;
            # ignore empty/null junk that could come from hostile text.
            if update.value is None and update.raw_text is None:
                continue
        if _apply_update(result, update, extraction.intent, turn_number):
            mutated = True

    if mutated:
        result.version += 1
    return result
