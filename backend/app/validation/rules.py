from __future__ import annotations

import re
from typing import Literal

from app.domain.gate import meaningful_features
from app.domain.models import (
    BRIEF_FIELDS,
    FieldStatus,
    GeneratedCopy,
    ProductBrief,
    Violation,
    ViolationCode,
)

DESCRIPTION_MIN_WORDS = 60
DESCRIPTION_MAX_WORDS = 200
EMAIL_MIN_WORDS = 80
EMAIL_MAX_WORDS = 250
SUBJECT_MAX_CHARS = 60

PLACEHOLDER_PATTERNS = (
    r"\[TODO\]",
    r"\{\{product_name\}\}",
    r"lorem ipsum",
)

FORBIDDEN_CLAIMS = (
    "fda approved",
    "clinically proven",
    "guaranteed results",
    "#1",
)


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text)


def word_count(text: str) -> int:
    plain = strip_html(text)
    return len([part for part in plain.split() if part.strip()])


def visible_text(output: GeneratedCopy) -> str:
    """All copy as the reader sees it, email markup stripped. Text rules scan this
    so they never match hex colours, urls, or attribute names hiding in the HTML."""
    return "\n".join(
        (
            output.product_description,
            output.marketing_email.subject,
            strip_html(output.marketing_email.body),
            output.marketing_email.cta,
        )
    )


def validate_price_presence(output: GeneratedCopy, brief: ProductBrief) -> list[Violation]:
    if brief.price.status != FieldStatus.CONFIRMED or not brief.price.value:
        return []
    price = str(brief.price.value).strip()
    if not price:
        return []
    in_description = price in output.product_description
    in_email = price in strip_html(output.marketing_email.body)
    if in_description and in_email:
        return []
    artifact: Literal["description", "email", "both"]
    if not in_description and not in_email:
        artifact = "both"
        message = "Confirmed price missing from description and email body"
    elif not in_description:
        artifact = "description"
        message = "Confirmed price missing from product description"
    else:
        artifact = "email"
        message = "Confirmed price missing from email body"
    return [
        Violation(
            code=ViolationCode.MISSING_PRICE,
            message=message,
            artifact=artifact,
        )
    ]


def validate_description_length(
    output: GeneratedCopy, brief: ProductBrief
) -> list[Violation]:
    del brief
    count = word_count(output.product_description)
    if DESCRIPTION_MIN_WORDS <= count <= DESCRIPTION_MAX_WORDS:
        return []
    return [
        Violation(
            code=ViolationCode.DESCRIPTION_LENGTH,
            message=(
                f"Product description has {count} words; "
                f"expected {DESCRIPTION_MIN_WORDS}-{DESCRIPTION_MAX_WORDS}"
            ),
            artifact="description",
        )
    ]


def validate_email_length(output: GeneratedCopy, brief: ProductBrief) -> list[Violation]:
    del brief
    count = word_count(output.marketing_email.body)
    if EMAIL_MIN_WORDS <= count <= EMAIL_MAX_WORDS:
        return []
    return [
        Violation(
            code=ViolationCode.EMAIL_LENGTH,
            message=(
                f"Email body has {count} words; "
                f"expected {EMAIL_MIN_WORDS}-{EMAIL_MAX_WORDS}"
            ),
            artifact="email",
        )
    ]


def validate_cta(output: GeneratedCopy, brief: ProductBrief) -> list[Violation]:
    del brief
    if output.marketing_email.cta and output.marketing_email.cta.strip():
        return []
    return [
        Violation(
            code=ViolationCode.MISSING_CTA,
            message="Marketing email CTA is missing",
            artifact="email",
        )
    ]


def validate_subject(output: GeneratedCopy, brief: ProductBrief) -> list[Violation]:
    del brief
    subject = output.marketing_email.subject or ""
    if subject.strip() and len(subject) <= SUBJECT_MAX_CHARS:
        return []
    if not subject.strip():
        message = "Email subject is empty"
    else:
        message = (
            f"Email subject is {len(subject)} characters; "
            f"maximum is {SUBJECT_MAX_CHARS}"
        )
    return [
        Violation(
            code=ViolationCode.SUBJECT_TOO_LONG,
            message=message,
            artifact="email",
        )
    ]


def _feature_covered(feature: str, text: str) -> bool:
    normalized = re.sub(r"\s+", " ", feature.strip().lower())
    haystack = text.lower()
    if normalized and normalized in haystack:
        return True
    words = [w for w in re.split(r"\W+", normalized) if len(w) > 2]
    if not words:
        return bool(normalized) and normalized in haystack
    hits = sum(1 for word in words if word in haystack)
    return (hits / len(words)) >= 0.5


def validate_feature_coverage(
    output: GeneratedCopy, brief: ProductBrief
) -> list[Violation]:
    features = meaningful_features(brief.key_features.value)
    if not features:
        return []
    covered = sum(
        1 for feature in features if _feature_covered(feature, output.product_description)
    )
    ratio = covered / len(features)
    if ratio >= 0.7:
        return []
    return [
        Violation(
            code=ViolationCode.FEATURE_COVERAGE,
            message=(
                f"Product description covers {covered}/{len(features)} "
                f"key features ({ratio:.0%}); need at least 70%"
            ),
            artifact="description",
        )
    ]


def validate_placeholders(output: GeneratedCopy, brief: ProductBrief) -> list[Violation]:
    del brief
    blob = visible_text(output)
    for pattern in PLACEHOLDER_PATTERNS:
        if re.search(pattern, blob, flags=re.IGNORECASE):
            return [
                Violation(
                    code=ViolationCode.PLACEHOLDER_TEXT,
                    message=f"Generated copy contains placeholder text matching {pattern}",
                    artifact="both",
                )
            ]
    return []


def _brief_text_blob(brief: ProductBrief) -> str:
    parts: list[str] = []
    for name in BRIEF_FIELDS:
        field = getattr(brief, name)
        if field.value is None:
            continue
        if isinstance(field.value, list):
            parts.extend(str(v) for v in field.value)
        else:
            parts.append(str(field.value))
        if field.raw_text:
            parts.append(field.raw_text)
    parts.extend(brief.assumptions)
    return " ".join(parts).lower()


def validate_forbidden_claims(
    output: GeneratedCopy, brief: ProductBrief
) -> list[Violation]:
    blob = visible_text(output).lower()
    supported = _brief_text_blob(brief)
    violations: list[Violation] = []
    for claim in FORBIDDEN_CLAIMS:
        if claim in blob and claim not in supported:
            violations.append(
                Violation(
                    code=ViolationCode.FORBIDDEN_CLAIM,
                    message=f"Unsupported claim detected: {claim}",
                    artifact="both",
                )
            )
    return violations
