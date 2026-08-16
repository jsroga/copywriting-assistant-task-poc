"""Live end-to-end flow: IMBA SEAT chair → questions → validated copy → LLM judge.

Streams progress to the console in real time. Hard timeout: 180s (perf budget).

Run with:

    npm run test:e2e
    # or: cd backend && uv run pytest -m integration tests/test_live_e2e_imba_seat.py -q -s

If this times out, treat it as a performance regression: reduce LLM round-trips,
tighten prompts, or skip optional elicitation — do not raise the timeout.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import pytest
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.timeout(180),
]

PRODUCT_LINE = (
    "Fotel Gamingowy IMBA SEAT Biurowy Obrotowy Regulowany Materiał"
)

FIELD_ANSWERS = {
    "key_features": (
        "Obrotowy, regulowany, tapicerka materiałowa, biurowy i gamingowy w jednym"
    ),
    "target_audience": "gamers and office workers",
    "tone": "playful",
    "price": "899 PLN",
    "category": "skip",
    "brand_name": "IMBA SEAT",
    "product_name": PRODUCT_LINE,
}


def _has_live_key() -> bool:
    if os.environ.get("USE_FAKE_LLM", "").lower() in {"1", "true", "yes"}:
        return False
    key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        return False
    if key.startswith("sk-your-key") or "your-key-here" in key:
        return False
    return True


def _log(message: str) -> None:
    print(message, flush=True)


def _answer_for(gate: dict, assistant_message: str) -> str:
    next_field = gate.get("next_field")
    if isinstance(next_field, str) and next_field in FIELD_ANSWERS:
        return FIELD_ANSWERS[next_field]
    lowered = assistant_message.lower()
    if "price" in lowered:
        return FIELD_ANSWERS["price"]
    if "tone" in lowered:
        return FIELD_ANSWERS["tone"]
    if "audience" in lowered or "customer" in lowered:
        return FIELD_ANSWERS["target_audience"]
    if "feature" in lowered:
        return FIELD_ANSWERS["key_features"]
    if "brand" in lowered:
        return FIELD_ANSWERS["brand_name"]
    if "category" in lowered:
        return FIELD_ANSWERS["category"]
    return "confirm"


@pytest.fixture(scope="module")
def live_llm():
    if not _has_live_key():
        pytest.skip("No OPENROUTER_API_KEY / OPENAI_API_KEY configured for live tests")
    from app.llm.openai_compatible_client import (
        OpenAICompatibleLLMClient,
        resolve_llm_credentials,
    )

    api_key, base_url, model = resolve_llm_credentials()
    assert api_key
    _log(f"\n[e2e] model={model} base_url={base_url}")
    return OpenAICompatibleLLMClient(
        api_key=api_key, base_url=base_url or None, model=model
    )


def test_imba_seat_full_flow_with_llm_judge(live_llm) -> None:
    from app.orchestration import ConversationOrchestrator
    from app.store import SessionStore

    store = SessionStore()
    orch = ConversationOrchestrator(store=store, llm=live_llm)
    session_id = f"e2e-imba-{uuid.uuid4()}"

    asked_questions = 0
    saw_description_stream = False
    final_turn = None
    transcript: list[dict] = []

    user_message = PRODUCT_LINE
    max_turns = 12

    for turn_index in range(1, max_turns + 1):
        _log(f"\n[e2e] ——— turn {turn_index} ———")
        _log(f"[e2e] USER: {user_message}")
        transcript.append({"role": "user", "content": user_message})

        terminal = None
        streamed_chars = 0
        for event_name, payload in orch.iter_turn_events(session_id, user_message):
            if event_name == "description_delta":
                text = payload.get("text", "") if isinstance(payload, dict) else ""
                streamed_chars += len(text)
                saw_description_stream = True
                print(text, end="", flush=True)
                continue
            if event_name == "validation_status":
                phase = payload.get("phase") if isinstance(payload, dict) else payload
                _log(f"\n[e2e] validation_status: {phase}")
                if isinstance(payload, dict) and payload.get("pre_repair_violations"):
                    _log(
                        "[e2e] pre_repair_violations: "
                        f"{json.dumps(payload['pre_repair_violations'], ensure_ascii=False)}"
                    )
                continue
            if event_name in {
                "question",
                "ready_for_confirmation",
                "generated_copy",
                "validation_failed",
            }:
                terminal = payload
                _log(f"\n[e2e] EVENT: {event_name}")
                _log(f"[e2e] ASSISTANT: {payload.message}")
                _log(
                    "[e2e] gate="
                    f"{payload.gate.model_dump(mode='json')} "
                    f"brief.version={payload.brief.get('version')} "
                    f"price={payload.brief.get('price')}"
                )
                if payload.validation is not None:
                    _log(
                        "[e2e] validation="
                        f"{payload.validation.model_dump(mode='json')}"
                    )

        assert terminal is not None, "turn produced no terminal event"
        transcript.append({"role": "assistant", "content": terminal.message})
        final_turn = terminal

        if terminal.type == "question":
            asked_questions += 1
            user_message = _answer_for(
                terminal.gate.model_dump(mode="json"), terminal.message
            )
            continue

        if terminal.type == "ready_for_confirmation":
            # Pre-generation confirm: copy is produced only after the user affirms.
            assert terminal.copy is None
            assert terminal.validation is None
            user_message = "confirm"
            continue

        if terminal.type in {"generated_copy", "validation_failed"}:
            break

    assert final_turn is not None
    assert asked_questions >= 1, "expected at least one follow-up question"
    assert saw_description_stream, "expected streamed description tokens"
    assert final_turn.type == "generated_copy", final_turn.type
    assert final_turn.copy is not None
    assert final_turn.validation is not None
    assert final_turn.validation.passed is True

    description = final_turn.copy.product_description
    price = final_turn.brief["price"]["value"]
    assert isinstance(price, str) and price
    assert price in description, f"price {price!r} missing from description"
    assert "imba" in description.lower()

    conversation = {
        "product_seed": PRODUCT_LINE,
        "messages": transcript,
        "brief": final_turn.brief,
        "copy": final_turn.copy.model_dump(mode="json"),
        "validation": final_turn.validation.model_dump(mode="json"),
        "gate": final_turn.gate.model_dump(mode="json"),
    }
    _log("\n[e2e] ——— LLM-as-judge ———")
    _log(json.dumps(conversation, ensure_ascii=False, indent=2)[:4000])
    verdict = live_llm.judge_chat(conversation)
    _log(f"[e2e] judge.passed={verdict.passed} score={verdict.score}")
    _log(f"[e2e] judge.summary={verdict.summary}")
    _log(f"[e2e] judge.strengths={verdict.strengths}")
    _log(f"[e2e] judge.issues={verdict.issues}")

    assert verdict.passed is True, verdict.model_dump()
    assert verdict.score >= 6
