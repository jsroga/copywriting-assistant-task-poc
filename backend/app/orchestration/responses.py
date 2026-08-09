from __future__ import annotations

import json
from typing import Any, Literal, get_args

from pydantic import BaseModel

from app.domain.models import (
    GateDecision,
    GateStatus,
    GeneratedCopy,
    ProductBrief,
    ValidationResult,
)

ResponseType = Literal[
    "question",
    "ready_for_confirmation",
    "generated_copy",
    "validation_failed",
]

"""Events that carry a full TurnResponse and end the turn."""
TERMINAL_EVENTS: frozenset[str] = frozenset(get_args(ResponseType))


class TurnResponse(BaseModel):
    type: ResponseType
    message: str
    brief: dict[str, Any]
    gate: GateDecision
    # Named `copy` to match the HTTP contract (shadows BaseModel.copy — intentional).
    copy: GeneratedCopy | None = None
    validation: ValidationResult | None = None
    streaming: bool = False


def serialize_brief(brief: ProductBrief) -> dict[str, Any]:
    return brief.model_dump(mode="json")


def sse_frame(event: str, data: Any) -> str:
    payload = data.model_dump(mode="json") if isinstance(data, BaseModel) else data
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def price_gate() -> GateDecision:
    return GateDecision(
        status=GateStatus.NEEDS_INFO,
        fields=["price"],
        next_field="price",
    )
