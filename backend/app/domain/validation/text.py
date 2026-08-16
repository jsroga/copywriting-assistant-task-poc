from __future__ import annotations

import re

from app.domain.models import GeneratedCopy


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


def price_token_in_text(price: str, text: str) -> bool:
    """True when `price` appears as a whole token, not a substring of a longer price.

    `$49` must not match `$499`. Boundaries are non-word on both sides so currency
    symbols and punctuation still allow a match (e.g. `($49)`).
    """
    token = price.strip()
    if not token:
        return False
    pattern = rf"(?<!\w){re.escape(token)}(?!\w)"
    return re.search(pattern, text) is not None
