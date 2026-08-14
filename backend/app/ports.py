from __future__ import annotations

from collections.abc import Iterator
from typing import Protocol

from app.domain.models import (
    ChatMessage,
    ExtractionResult,
    GeneratedCopy,
    MarketingEmail,
    ProductBrief,
    Violation,
)


class LLMClient(Protocol):
    def extract(
        self,
        message: str,
        brief: ProductBrief,
        history_tail: list[ChatMessage],
    ) -> ExtractionResult: ...

    def stream_product_description(self, brief: ProductBrief) -> Iterator[str]: ...

    def stream_email_body(
        self, brief: ProductBrief, product_description: str
    ) -> Iterator[str]: ...

    def generate_email(
        self,
        brief: ProductBrief,
        product_description: str,
        *,
        body: str,
    ) -> MarketingEmail: ...

    def repair(
        self,
        brief: ProductBrief,
        previous_output: GeneratedCopy,
        violations: list[Violation],
    ) -> GeneratedCopy: ...
