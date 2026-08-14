from __future__ import annotations

import json
import os
from collections.abc import Iterator
from pathlib import Path
from typing import TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.domain.models import (
    BRIEF_FIELDS,
    ChatMessage,
    ExtractionResult,
    FieldStatus,
    GeneratedCopy,
    JudgeVerdict,
    MarketingEmail,
    MarketingEmailMeta,
    ProductBrief,
    Violation,
)
from app.llm.json_utils import parse_model_from_text

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "moonshotai/kimi-k3"

# Thinking models emit reasoning deltas that carry no copy text. Streaming them
# would stall the first visible token by ~25-30s, so copy streams opt out.
NO_REASONING = {"reasoning": {"enabled": False}}

T = TypeVar("T", bound=BaseModel)


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def _normalized_brief_payload(brief: ProductBrief) -> dict:
    """Project the brief to confirmed/vague facts only — the generator never
    sees raw conversation text or missing/conflicted fields."""
    payload: dict = {"assumptions": list(brief.assumptions), "version": brief.version}
    for name in BRIEF_FIELDS:
        field = getattr(brief, name)
        if field.status is FieldStatus.CONFIRMED:
            payload[name] = {"value": field.value, "status": field.status.value}
        elif field.status is FieldStatus.VAGUE:
            payload[name] = {
                "value": None,
                "raw_text": field.raw_text,
                "status": field.status.value,
            }
    return payload


def resolve_llm_credentials() -> tuple[str | None, str, str]:
    """Return (api_key, base_url, model) preferring OpenRouter when present."""
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("OPENAI_BASE_URL")
    model = os.environ.get("OPENAI_MODEL")

    if openrouter_key:
        return (
            openrouter_key,
            base_url or DEFAULT_OPENROUTER_BASE_URL,
            model or DEFAULT_MODEL,
        )
    return (
        openai_key,
        base_url or "",
        model or "gpt-4o-mini",
    )


class OpenAILLMClient:
    """OpenAI-compatible Structured Outputs client (OpenAI or OpenRouter)."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        client: OpenAI | None = None,
    ) -> None:
        resolved_key, resolved_base, resolved_model = resolve_llm_credentials()
        self.api_key = api_key or resolved_key
        self.model = model or resolved_model
        self.base_url = base_url if base_url is not None else resolved_base
        if not self.api_key and client is None:
            raise RuntimeError(
                "OPENROUTER_API_KEY or OPENAI_API_KEY is required for OpenAILLMClient"
            )
        if client is not None:
            self._client = client
        elif self.base_url:
            self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        else:
            self._client = OpenAI(api_key=self.api_key)
        self._extract_prompt = _load_prompt("extract.md")
        self._generate_description_prompt = _load_prompt("generate_description.md")
        self._generate_email_body_prompt = _load_prompt("generate_email_body.md")
        self._generate_email_meta_prompt = _load_prompt("generate_email_meta.md")
        self._repair_prompt = _load_prompt("repair.md")
        self._judge_prompt = _load_prompt("judge_chat.md")

    def _parse(self, *, system: str, user: str, schema: type[T]) -> T:
        completion = self._client.beta.chat.completions.parse(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format=schema,
        )
        message = completion.choices[0].message
        if message.parsed is not None:
            return message.parsed

        content = message.content
        if isinstance(content, str) and content.strip():
            try:
                return parse_model_from_text(schema, content)
            except Exception as exc:
                raise RuntimeError(
                    f"LLM returned unparseable output for {schema.__name__}: "
                    f"{content!r}"
                ) from exc

        raise RuntimeError(
            f"LLM returned no parsed output for {schema.__name__}: "
            f"{message.refusal or content!r}"
        )

    def extract(
        self,
        message: str,
        brief: ProductBrief,
        history_tail: list[ChatMessage],
    ) -> ExtractionResult:
        history_payload = [
            {"role": m.role, "content": m.content, "turn": m.turn} for m in history_tail
        ]
        user_payload = {
            "latest_user_message": message,
            "current_brief": brief.model_dump(mode="json"),
            "history_tail": history_payload,
        }
        return self._parse(
            system=self._extract_prompt,
            user=json.dumps(user_payload),
            schema=ExtractionResult,
        )

    def stream_product_description(self, brief: ProductBrief) -> Iterator[str]:
        user_payload = {
            "brief": _normalized_brief_payload(brief),
            "requirements": {
                "description_words": "60-200",
                "include_confirmed_price": True,
            },
        }
        stream = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self._generate_description_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            stream=True,
            extra_body=NO_REASONING,
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def stream_email_body(
        self, brief: ProductBrief, product_description: str
    ) -> Iterator[str]:
        user_payload = {
            "brief": _normalized_brief_payload(brief),
            "product_description": product_description,
            "requirements": {
                "email_body_words": "80-250",
                "body_format": "html",
                "include_confirmed_price": True,
            },
        }
        stream = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self._generate_email_body_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            stream=True,
            extra_body=NO_REASONING,
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def generate_email(
        self,
        brief: ProductBrief,
        product_description: str,
        *,
        body: str,
    ) -> MarketingEmail:
        meta = self._parse(
            system=self._generate_email_meta_prompt,
            user=json.dumps(
                {
                    "brief": _normalized_brief_payload(brief),
                    "product_description": product_description,
                    "email_body_html": body,
                    "requirements": {"subject_max_chars": 60},
                }
            ),
            schema=MarketingEmailMeta,
        )
        return MarketingEmail(subject=meta.subject, body=body, cta=meta.cta)

    def repair(
        self,
        brief: ProductBrief,
        previous_output: GeneratedCopy,
        violations: list[Violation],
    ) -> GeneratedCopy:
        user_payload = {
            "brief": _normalized_brief_payload(brief),
            "previous_output": previous_output.model_dump(mode="json"),
            "violations": [v.model_dump(mode="json") for v in violations],
        }
        return self._parse(
            system=self._repair_prompt,
            user=json.dumps(user_payload),
            schema=GeneratedCopy,
        )

    def judge_chat(self, conversation: dict) -> JudgeVerdict:
        return self._parse(
            system=self._judge_prompt,
            user=json.dumps(conversation),
            schema=JudgeVerdict,
        )
