"""Structural contracts that keep duplicated lists from drifting apart.

None of these test behaviour — they fail when someone adds a brief field, a
response type, or a field status without updating everything that must agree.
"""

from __future__ import annotations

import re
from itertools import product
from pathlib import Path
from typing import get_args

from app.domain.models import (
    BRIEF_FIELDS,
    OPTIONAL_FIELDS,
    QUESTION_PRIORITY,
    REQUIRED_FIELDS,
    BriefFieldName,
    FieldStatus,
    IncomingStatus,
    ProductBrief,
)
from app.domain.reducer import TRANSITIONS
from app.orchestration.responses import TERMINAL_EVENTS, ResponseType

_BRIEF_METADATA_FIELDS = {"assumptions", "conflicts", "version"}
_FRONTEND_CONSTANTS = (
    Path(__file__).resolve().parents[2] / "frontend" / "constants" / "index.ts"
)


def test_product_brief_carries_exactly_the_declared_fields():
    """A new field on the model must be registered in BriefFieldName to be
    extractable, gated, and validated."""
    modelled = set(ProductBrief.model_fields) - _BRIEF_METADATA_FIELDS
    assert modelled == set(BRIEF_FIELDS)


def test_required_and_optional_partition_the_brief():
    assert set(REQUIRED_FIELDS).isdisjoint(OPTIONAL_FIELDS)
    assert set(REQUIRED_FIELDS) | set(OPTIONAL_FIELDS) == set(BRIEF_FIELDS)


def test_question_priority_covers_every_field_once():
    """The gate asks in priority order; a field missing here can never be asked for."""
    assert set(QUESTION_PRIORITY) == set(BRIEF_FIELDS)
    assert len(QUESTION_PRIORITY) == len(BRIEF_FIELDS)


def test_terminal_events_match_the_response_types():
    assert TERMINAL_EVENTS == frozenset(get_args(ResponseType))


def test_reducer_transition_table_is_exhaustive():
    """Every (incoming status, current status) pair has a rule, so _apply_update
    can never fall through to an unhandled combination."""
    expected = set(product(get_args(IncomingStatus), FieldStatus))
    assert set(TRANSITIONS) == expected


def _ts_string_array(source: str, name: str) -> list[str]:
    block = re.search(rf"export const {name} = \[(.*?)\] as const", source, re.DOTALL)
    assert block is not None, f"{name} not found in {_FRONTEND_CONSTANTS}"
    return re.findall(r"'([^']+)'", block.group(1))


def test_frontend_brief_field_constants_match_the_backend():
    """The panel's Required/Optional badges are hand-mirrored from the backend.
    Nothing else would notice if the two lists diverged, so pin them here."""
    source = _FRONTEND_CONSTANTS.read_text(encoding="utf-8")
    assert set(_ts_string_array(source, "BRIEF_FIELD_ORDER")) == set(BRIEF_FIELDS)
    assert set(_ts_string_array(source, "REQUIRED_BRIEF_FIELDS")) == set(REQUIRED_FIELDS)
