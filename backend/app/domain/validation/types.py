from __future__ import annotations

from collections.abc import Callable

from app.domain.models import GeneratedCopy, ProductBrief, Violation

Validator = Callable[[GeneratedCopy, ProductBrief], list[Violation]]
