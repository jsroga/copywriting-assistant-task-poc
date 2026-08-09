from __future__ import annotations

import json
import re
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

_FENCE_START = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_FENCE_END = re.compile(r"\s*```$")


def strip_json_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = _FENCE_START.sub("", cleaned)
        cleaned = _FENCE_END.sub("", cleaned)
    return cleaned.strip()


def parse_model_from_text(schema: type[T], text: str) -> T:
    cleaned = strip_json_fences(text)
    try:
        return schema.model_validate_json(cleaned)
    except Exception:
        # Last resort: locate the outermost JSON object/array.
        start_obj = cleaned.find("{")
        start_arr = cleaned.find("[")
        starts = [index for index in (start_obj, start_arr) if index >= 0]
        if not starts:
            raise
        start = min(starts)
        end_obj = cleaned.rfind("}")
        end_arr = cleaned.rfind("]")
        end = max(end_obj, end_arr)
        if end <= start:
            raise
        return schema.model_validate(json.loads(cleaned[start : end + 1]))
