from __future__ import annotations

from strands.models.openai import OpenAIModel

from app.llm.openai_compatible_client import resolve_llm_credentials

DEFAULT_STRANDS_MODEL = "gpt-4o-mini"


def build_openai_model(
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model_id: str | None = None,
) -> OpenAIModel:
    """OpenAI-compatible Strands model (OpenRouter preferred when configured)."""
    resolved_key, resolved_base, resolved_model = resolve_llm_credentials()
    key = api_key or resolved_key
    if not key:
        raise RuntimeError(
            "OPENROUTER_API_KEY or OPENAI_API_KEY is required for Strands OpenAIModel"
        )
    client_args: dict[str, str] = {"api_key": key}
    url = base_url if base_url is not None else resolved_base
    if url:
        client_args["base_url"] = url
    return OpenAIModel(
        client_args=client_args,
        model_id=model_id or resolved_model or DEFAULT_STRANDS_MODEL,
    )
