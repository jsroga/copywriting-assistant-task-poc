from __future__ import annotations

from collections.abc import Callable

from app.domain.models import GeneratedCopy, ProductBrief, Violation
from app.validation import rules

Validator = Callable[[GeneratedCopy, ProductBrief], list[Violation]]

DEFAULT_VALIDATORS: list[Validator] = [
    rules.validate_price_presence,
    rules.validate_description_length,
    rules.validate_email_length,
    rules.validate_cta,
    rules.validate_subject,
    rules.validate_feature_coverage,
    rules.validate_placeholders,
    rules.validate_forbidden_claims,
]


def validate(
    output: GeneratedCopy,
    brief: ProductBrief,
    validators: list[Validator] | None = None,
) -> list[Violation]:
    chain = validators if validators is not None else DEFAULT_VALIDATORS
    violations: list[Violation] = []
    for validator in chain:
        violations.extend(validator(output, brief))
    return violations
