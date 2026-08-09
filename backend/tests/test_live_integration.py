"""Live integration tests against OpenRouter (Kimi K3 by default).

Skipped automatically when no real API key is configured.
Run explicitly:

    npm run test:integration
    # or: cd backend && uv run pytest -m integration -q -s
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)

EXPECTED_MODEL = os.environ.get("OPENAI_MODEL", "moonshotai/kimi-k3")


def _has_live_key() -> bool:
    if os.environ.get("USE_FAKE_LLM", "").lower() in {"1", "true", "yes"}:
        return False
    key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        return False
    if key.startswith("sk-your-key") or "your-key-here" in key:
        return False
    return True


pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def live_creds() -> tuple[str, str, str]:
    if not _has_live_key():
        pytest.skip("No OPENROUTER_API_KEY / OPENAI_API_KEY configured for live tests")
    from app.llm.openai_client import resolve_llm_credentials

    api_key, base_url, model = resolve_llm_credentials()
    assert api_key
    assert "openrouter.ai" in (base_url or "") or os.environ.get("OPENAI_API_KEY")
    return api_key, base_url or "", model


@pytest.fixture(scope="module")
def live_client(live_creds: tuple[str, str, str]) -> TestClient:
    api_key, base_url, model = live_creds
    from app.llm.openai_client import OpenAILLMClient
    from app.main import app, override_llm, reset_store

    override_llm(
        OpenAILLMClient(api_key=api_key, base_url=base_url or None, model=model)
    )
    reset_store()
    return TestClient(app)


def test_configured_model_is_kimi_k3(live_creds: tuple[str, str, str]) -> None:
    _api_key, base_url, model = live_creds
    assert model == EXPECTED_MODEL
    assert "kimi" in model.lower()
    assert "openrouter.ai" in base_url


def test_health(live_client: TestClient) -> None:
    response = live_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_bot_returns_any_message(live_client: TestClient) -> None:
    """Smallest live smoke: send one product line, get a non-empty bot reply."""
    session_id = f"live-{uuid.uuid4()}"
    response = live_client.post(
        f"/api/chat/{session_id}",
        json={"message": "The product is called AquaPure Bottle."},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["type"] in {
        "question",
        "ready_for_confirmation",
        "generated_copy",
        "validation_failed",
    }
    assert isinstance(payload["message"], str)
    assert payload["message"].strip()
    assert "brief" in payload
    print(f"\n[live] type={payload['type']} message={payload['message']!r}")
    print(f"[live] product_name={payload['brief']['product_name']}")


def test_extracts_product_name_and_asks_followup(live_client: TestClient) -> None:
    session_id = f"live-extract-{uuid.uuid4()}"
    response = live_client.post(
        f"/api/chat/{session_id}",
        json={
            "message": (
                "Our product is called NightLight Pro. "
                "Please help me write marketing copy."
            )
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["message"].strip()
    name = payload["brief"]["product_name"]
    assert name["status"] == "confirmed", name
    assert isinstance(name["value"], str)
    assert "nightlight" in name["value"].lower().replace(" ", "")
    # Incomplete brief should still ask for more info rather than silently failing.
    assert payload["type"] == "question"
    assert payload["gate"]["status"] in {"needs_info", "needs_clarification"}
    print(f"\n[live] extracted name={name['value']!r}")
    print(f"[live] follow-up={payload['message']!r}")
    print(f"[live] gate={payload['gate']}")
