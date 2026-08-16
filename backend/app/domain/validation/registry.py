from __future__ import annotations

from . import rules
from .types import Validator

DEFAULT_VALIDATORS: list[Validator] = [
    rules.validate_price_presence,
    rules.validate_description_length,
    rules.validate_email_length,
    rules.validate_cta,
    rules.validate_subject,
    rules.validate_placeholders,
]
