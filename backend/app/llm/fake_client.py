from __future__ import annotations

from collections.abc import Callable, Iterator, Sequence

from app.domain.models import (
    ChatMessage,
    ExtractionResult,
    FieldStatus,
    FieldValue,
    GeneratedCopy,
    Intent,
    MarketingEmail,
    ProductBrief,
    Violation,
)

ExtractFn = Callable[[str, ProductBrief, list[ChatMessage]], ExtractionResult]
GenerateFn = Callable[[ProductBrief], GeneratedCopy]
RepairFn = Callable[[ProductBrief, GeneratedCopy, list[Violation]], GeneratedCopy]


def make_complete_brief(
    *,
    product_name: str = "AquaPure Bottle",
    key_features: list[str] | None = None,
    target_audience: str = "busy professionals",
    tone: str = "premium",
    price: str | None = "$299",
    category: str | None = "drinkware",
    brand_name: str | None = "AquaPure",
) -> ProductBrief:
    features = key_features or ["keeps drinks cold for 24 hours", "leak-proof lid"]
    brief = ProductBrief(
        product_name=FieldValue(value=product_name, status=FieldStatus.CONFIRMED),
        key_features=FieldValue(value=features, status=FieldStatus.CONFIRMED),
        target_audience=FieldValue(value=target_audience, status=FieldStatus.CONFIRMED),
        tone=FieldValue(value=tone, status=FieldStatus.CONFIRMED),
        version=1,
    )
    if price is not None:
        brief.price = FieldValue(value=price, status=FieldStatus.CONFIRMED)
    if category is not None:
        brief.category = FieldValue(value=category, status=FieldStatus.CONFIRMED)
    if brand_name is not None:
        brief.brand_name = FieldValue(value=brand_name, status=FieldStatus.CONFIRMED)
    return brief


def _words(n: int, seed: str = "word") -> str:
    return " ".join(f"{seed}{i}" for i in range(n))


def make_valid_copy(brief: ProductBrief) -> GeneratedCopy:
    name = str(brief.product_name.value or "Product")
    features = brief.key_features.value if isinstance(brief.key_features.value, list) else []
    feature_text = " ".join(str(f) for f in features)
    price = (
        str(brief.price.value)
        if brief.price.status == FieldStatus.CONFIRMED and brief.price.value
        else ""
    )
    price_clause = f" Priced at {price}." if price else ""
    description = (
        f"{name} is designed for {brief.target_audience.value}. "
        f"It highlights {feature_text}. "
        f"The tone is {brief.tone.value}.{price_clause} "
        f"{_words(70, 'desc')}"
    )
    body = (
        f"<p>Hello, discover <strong>{name}</strong>.</p>"
        f"<p>Key benefits include {feature_text}.{price_clause}</p>"
        f"<p>{_words(90, 'email')}</p>"
    )
    return GeneratedCopy(
        product_description=description,
        marketing_email=MarketingEmail(
            subject=f"Meet {name}"[:60],
            body=body,
            cta="Shop now",
        ),
    )


def make_invalid_copy_missing_price(brief: ProductBrief) -> GeneratedCopy:
    copy = make_valid_copy(brief)
    if brief.price.value:
        price = str(brief.price.value)
        copy.product_description = copy.product_description.replace(
            price, "an attractive price"
        )
        copy.marketing_email.body = copy.marketing_email.body.replace(
            price, "an attractive price"
        )
    return copy


class FakeLLMClient:
    """Scriptable LLM double with call counters for deterministic tests."""

    def __init__(
        self,
        *,
        extract_queue: Sequence[ExtractionResult] | None = None,
        generate_queue: Sequence[GeneratedCopy] | None = None,
        repair_queue: Sequence[GeneratedCopy] | None = None,
        extract_fn: ExtractFn | None = None,
        generate_fn: GenerateFn | None = None,
        repair_fn: RepairFn | None = None,
        default_extract: ExtractionResult | None = None,
    ) -> None:
        self._extract_queue = list(extract_queue or [])
        self._generate_queue = list(generate_queue or [])
        self._repair_queue = list(repair_queue or [])
        self._extract_fn = extract_fn
        self._generate_fn = generate_fn
        self._repair_fn = repair_fn
        self._default_extract = default_extract or ExtractionResult(
            intent=Intent.PROVIDE_INFO
        )
        self._stream_cache: GeneratedCopy | None = None
        self._email_body_cache: MarketingEmail | None = None
        self.extract_calls = 0
        self.generate_calls = 0
        self.repair_calls = 0
        self.stream_calls = 0
        self.last_generate_brief: ProductBrief | None = None
        self.last_repair_brief: ProductBrief | None = None

    def extract(
        self,
        message: str,
        brief: ProductBrief,
        history_tail: list[ChatMessage],
    ) -> ExtractionResult:
        self.extract_calls += 1
        if self._extract_fn is not None:
            return self._extract_fn(message, brief, history_tail)
        if self._extract_queue:
            return self._extract_queue.pop(0)
        return self._default_extract.model_copy(deep=True)

    def stream_product_description(self, brief: ProductBrief) -> Iterator[str]:
        self.stream_calls += 1
        self.generate_calls += 1
        self.last_generate_brief = brief.model_copy(deep=True)
        self._stream_cache = self._next_generated(brief, consume=True)
        words = self._stream_cache.product_description.split(" ")
        for index, word in enumerate(words):
            yield word if index == 0 else f" {word}"

    def stream_email_body(
        self, brief: ProductBrief, product_description: str
    ) -> Iterator[str]:
        del product_description
        email = (
            self._stream_cache.marketing_email
            if self._stream_cache is not None
            else self._next_generated(brief, consume=False).marketing_email
        )
        self._email_body_cache = email
        tokens = email.body.replace(">", "> ").split(" ")
        for index, token in enumerate(tokens):
            yield token if index == 0 else f" {token}"

    def generate_email(
        self,
        brief: ProductBrief,
        product_description: str,
        *,
        body: str,
    ) -> MarketingEmail:
        del product_description
        if self._email_body_cache is not None:
            email = self._email_body_cache.model_copy(deep=True)
            email.body = body
            self._email_body_cache = None
            self._stream_cache = None
            return email
        if self._stream_cache is not None:
            email = self._stream_cache.marketing_email
            self._stream_cache = None
            return email
        return self._next_generated(brief, consume=False).marketing_email

    def repair(
        self,
        brief: ProductBrief,
        previous_output: GeneratedCopy,
        violations: list[Violation],
    ) -> GeneratedCopy:
        self.repair_calls += 1
        self.last_repair_brief = brief.model_copy(deep=True)
        if self._repair_fn is not None:
            return self._repair_fn(brief, previous_output, violations)
        if self._repair_queue:
            return self._repair_queue.pop(0)
        return make_valid_copy(brief)

    def _next_generated(self, brief: ProductBrief, *, consume: bool) -> GeneratedCopy:
        if self._generate_fn is not None:
            return self._generate_fn(brief)
        if self._generate_queue:
            if consume:
                return self._generate_queue.pop(0)
            return self._generate_queue[0].model_copy(deep=True)
        return make_valid_copy(brief)
