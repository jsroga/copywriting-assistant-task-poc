from __future__ import annotations

import re

META_CONTAINMENT_MESSAGE = (
    "I can't reveal hidden instructions or change my role. "
    "I'm here to help gather product facts and write store copy."
)
OFF_TOPIC_MESSAGE = (
    "Let's stay focused on your product so I can write useful copy."
)
NOT_READY_GENERATION_MESSAGE = (
    "I still need a bit more product information before generating copy."
)
PRICE_REQUIRED_MESSAGE = (
    "I need a confirmed exact price before I can generate and validate copy."
)
CONFIRMATION_MESSAGE = (
    "Fields are ready to generate description, please confirm."
)
CONFIRMATION_PENDING_MESSAGE = (
    "Fields are ready to generate description, please confirm."
)
OPTIONAL_SKIPPED_ASSUMPTION = "{field} skipped by user; omitted from copy requirements."
COPY_READY_MESSAGE = "Your copy is ready."
COPY_READY_AFTER_REPAIR_MESSAGE = "Your copy is ready after one automatic repair."
VALIDATION_FAILED_MESSAGE = (
    "Copy was generated but still failed validation after one repair attempt."
)
CANNOT_EXTRACT_MESSAGE = "I couldn't extract {field} from your message."

FIELD_DISPLAY_NAMES: dict[str, str] = {
    "product_name": "a product name",
    "key_features": "key features",
    "target_audience": "a target audience",
    "tone": "a tone",
    "price": "a price",
    "category": "a category",
    "brand_name": "a brand name",
}


def cannot_extract_message(field: str) -> str:
    label = FIELD_DISPLAY_NAMES.get(field, field.replace("_", " "))
    return CANNOT_EXTRACT_MESSAGE.format(field=label)

AFFIRMATIVE_RE = re.compile(
    r"^\s*(yes|yep|yeah|yup|ok|okay|sure|confirm|confirmed|go ahead|"
    r"please (do|generate|write|confirm)|generate|write (it|the copy)|"
    r"do it|sounds good|ready|accept)\b",
    re.IGNORECASE,
)
DECLINE_OPTIONAL_RE = re.compile(
    r"\b(skip|no thanks|no need|don'?t (need|include|want)|do not include|"
    r"without (a )?brand|n/?a|none|not needed)\b",
    re.IGNORECASE,
)


def is_affirmative(text: str) -> bool:
    return AFFIRMATIVE_RE.search(text) is not None


def is_decline_optional(text: str) -> bool:
    return DECLINE_OPTIONAL_RE.search(text) is not None
