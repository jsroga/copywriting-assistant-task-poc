from __future__ import annotations

from app.domain.models import (
    ExtractionResult,
    GateDecision,
    GateStatus,
    Intent,
)
from app.llm.fake_client import FakeLLMClient, make_complete_brief
from app.store import SessionStore
from app.strands_runtime.context import TurnContext
from app.strands_runtime.hooks import TurnGuardHooks
from app.strands_runtime.policy import TurnTool, allowed_tools, next_tool_after_ingest


def _ctx(**kwargs) -> TurnContext:
    store = SessionStore()
    session = store.get_or_create("t1")
    session.brief = make_complete_brief()
    return TurnContext(
        store=store,
        llm=FakeLLMClient(),
        session=session,
        user_text="hello",
        **kwargs,
    )


def test_allowed_tools_before_ingest_only_ingest():
    ctx = _ctx()
    assert allowed_tools(ctx) == frozenset({TurnTool.INGEST})


def test_next_tool_after_ingest_ready_confirms():
    ctx = _ctx(
        extraction=ExtractionResult(intent=Intent.PROVIDE_INFO, updates=[]),
        gate=GateDecision(status=GateStatus.READY, fields=[], next_field=None),
    )
    assert next_tool_after_ingest(ctx) == TurnTool.CONFIRM


def test_next_tool_request_generation_when_ready_generates():
    ctx = _ctx(
        extraction=ExtractionResult(intent=Intent.REQUEST_GENERATION, updates=[]),
        gate=GateDecision(status=GateStatus.READY, fields=[], next_field=None),
    )
    assert next_tool_after_ingest(ctx) == TurnTool.GENERATE


def test_guard_cancels_second_repair():
    ctx = _ctx(repair_used=True, next_tool=TurnTool.REPAIR)
    ctx.extraction = ExtractionResult(intent=Intent.REQUEST_GENERATION, updates=[])
    hooks = TurnGuardHooks(ctx)

    class _Event:
        tool_use = {"name": TurnTool.REPAIR}
        cancel_tool: bool | str = False

    event = _Event()
    # Bypass typed event — exercise cancel logic the same way the hook does.
    hooks._before_tool(event)  # type: ignore[arg-type]
    assert event.cancel_tool
