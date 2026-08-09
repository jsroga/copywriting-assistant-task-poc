from app.domain.models import ExtractionResult, Intent, ViolationCode
from app.llm.fake_client import (
    FakeLLMClient,
    make_complete_brief,
    make_invalid_copy_missing_price,
    make_valid_copy,
)
from app.orchestration import ConversationOrchestrator
from app.orchestration.messages import COPY_READY_MESSAGE, VALIDATION_FAILED_MESSAGE
from app.store import SessionStore


def _failing_orchestrator(
    store: SessionStore, invalid_copy, repaired_copy
) -> tuple[ConversationOrchestrator, FakeLLMClient]:
    llm = FakeLLMClient(
        extract_queue=[ExtractionResult(intent=Intent.REQUEST_GENERATION, updates=[])],
        generate_queue=[invalid_copy],
        repair_queue=[repaired_copy],
    )
    return ConversationOrchestrator(store=store, llm=llm), llm


def test_invalid_generation_repairs_exactly_once_and_passes():
    store = SessionStore()
    session = store.get_or_create("s1")
    session.brief = make_complete_brief(price="$299")
    store.save(session)

    llm = FakeLLMClient(
        extract_queue=[ExtractionResult(intent=Intent.REQUEST_GENERATION, updates=[])],
        generate_queue=[make_invalid_copy_missing_price(session.brief)],
        repair_fn=lambda brief, _prev, _violations: make_valid_copy(brief),
    )
    orch = ConversationOrchestrator(store=store, llm=llm)
    response = orch.handle_turn("s1", "Write the copy")
    assert response.type == "generated_copy"
    assert response.validation is not None
    assert response.validation.repaired is True
    assert response.validation.passed is True
    assert llm.generate_calls == 1
    assert llm.repair_calls == 1


def test_invalid_repair_returns_failure_without_second_repair():
    store = SessionStore()
    session = store.get_or_create("s1")
    session.brief = make_complete_brief(price="$299")
    store.save(session)

    invalid = make_invalid_copy_missing_price(session.brief)
    llm = FakeLLMClient(
        extract_queue=[ExtractionResult(intent=Intent.REQUEST_GENERATION, updates=[])],
        generate_queue=[invalid],
        repair_queue=[invalid],
    )
    orch = ConversationOrchestrator(store=store, llm=llm)
    response = orch.handle_turn("s1", "Write the copy")
    assert response.type == "validation_failed"
    assert response.validation is not None
    assert response.validation.repaired is True
    assert response.validation.passed is False
    assert response.validation.violations
    assert llm.generate_calls == 1
    assert llm.repair_calls == 1


def test_failed_validation_never_announces_ready_copy():
    """A failed turn must not tell the user the copy is ready, but the panel
    still receives the copy so the failure can be inspected."""
    store = SessionStore()
    session = store.get_or_create("s1")
    session.brief = make_complete_brief(price="$299")
    store.save(session)

    invalid = make_invalid_copy_missing_price(session.brief)
    orch, llm = _failing_orchestrator(store, invalid, invalid)
    response = orch.handle_turn("s1", "Write the copy")

    assert response.message == VALIDATION_FAILED_MESSAGE
    assert response.message != COPY_READY_MESSAGE
    assert response.copy is not None
    codes = [v.code for v in response.validation.violations]
    assert ViolationCode.MISSING_PRICE in codes

    session = store.get("s1")
    assert session is not None
    assert session.messages[-1].content == VALIDATION_FAILED_MESSAGE
    assert session.awaiting_generation_confirmation is False
    assert llm.repair_calls == 1


def test_failed_validation_resolves_before_the_terminal_frame():
    """Validation must be decided before the turn is delivered: the stream emits a
    done frame carrying passed=False and never emits generated_copy."""
    store = SessionStore()
    session = store.get_or_create("s1")
    session.brief = make_complete_brief(price="$299")
    store.save(session)

    invalid = make_valid_copy(session.brief)
    invalid.marketing_email.subject = "x" * 61
    orch, _llm = _failing_orchestrator(store, invalid, invalid)

    events = list(orch.iter_turn_events("s1", "Write the copy"))
    names = [name for name, _payload in events]
    assert "generated_copy" not in names
    assert names[-1] == "validation_failed"

    done_index = next(
        index
        for index, (name, payload) in enumerate(events)
        if name == "validation_status" and payload.get("phase") == "done"
    )
    assert done_index < len(events) - 1
    done_validation = events[done_index][1]["validation"]
    assert done_validation["passed"] is False
    assert any(
        item["code"] == ViolationCode.SUBJECT_TOO_LONG.value
        for item in done_validation["violations"]
    )


def test_validating_phase_starts_before_repair_not_after():
    """`validating` marks the first check. After a failure the stream stays on
    `repairing` until `done` — it must not re-emit validating when the retry fails."""
    store = SessionStore()
    session = store.get_or_create("s1")
    session.brief = make_complete_brief(price="$299")
    store.save(session)

    invalid = make_invalid_copy_missing_price(session.brief)
    orch, _llm = _failing_orchestrator(store, invalid, invalid)

    phases = [
        payload.get("phase")
        for name, payload in orch.iter_turn_events("s1", "Write the copy")
        if name == "validation_status" and isinstance(payload, dict)
    ]
    assert phases.count("validating") == 1
    assert phases.index("validating") < phases.index("repairing")
    assert phases.index("repairing") < phases.index("done")
    assert "validating" not in phases[phases.index("repairing") + 1 :]
