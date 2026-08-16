from __future__ import annotations

from app.domain.models import GeneratedCopy, ProductBrief, Violation
from .types import Validator


def validate(
    output: GeneratedCopy,
    brief: ProductBrief,
    validators: list[Validator] | None = None,
) -> list[Violation]:
    chain = validators if validators is not None else []
    violations: list[Violation] = []
    for validator in chain:
        violations.extend(validator(output, brief))
    return violations
