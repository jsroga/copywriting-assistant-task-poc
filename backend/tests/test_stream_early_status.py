"""Streaming must emit an early status frame before the blocking extract call."""

from app.domain.models import ExtractionResult, Intent
from app.llm.fake_client import FakeLLMClient, make_complete_brief, make_valid_copy
from app.orchestration import ConversationOrchestrator
from app.store import SessionStore


def test_iter_turn_events_emits_extracting_before_any_llm_work():
    store = SessionStore()
    session = store.get_or_create("early-1")
    session.brief = make_complete_brief()
    session.awaiting_generation_confirmation = True
    store.save(session)

    llm = FakeLLMClient(
        extract_queue=[ExtractionResult(intent=Intent.PROVIDE_INFO, updates=[])],
        generate_fn=make_valid_copy,
    )
    orch = ConversationOrchestrator(store=store, llm=llm)
    events = list(orch.iter_turn_events("early-1", "confirm"))

    assert events, "expected stream events"
    assert events[0][0] == "validation_status"
    assert events[0][1]["phase"] == "extracting"

    phases = [
        payload.get("phase")
        for name, payload in events
        if name == "validation_status" and isinstance(payload, dict)
    ]
    assert "generating" in phases
    assert "building_email" in phases
    assert "validating" in phases
    assert phases.index("building_email") < phases.index("validating")

    delta_texts = [
        payload.get("text")
        for name, payload in events
        if name == "description_delta" and isinstance(payload, dict)
    ]
    assert delta_texts, "expected description token deltas"
    assert all(isinstance(text, str) and text for text in delta_texts)

    email_deltas = [
        payload.get("text")
        for name, payload in events
        if name == "email_delta" and isinstance(payload, dict)
    ]
    assert email_deltas, "expected email token deltas"


def test_sessions_are_isolated_by_id():
    store = SessionStore()
    a = store.get_or_create("product-a")
    a.brief = make_complete_brief(product_name="FOTEL ROZOWY")
    store.save(a)

    b = store.get_or_create("product-b")
    assert b.brief.product_name.value is None
    assert b.id != a.id
