from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from threading import Thread
from typing import Any

from app.domain.models import ChatMessage
from app.ports import LLMClient
from app.orchestration.responses import TERMINAL_EVENTS, TurnResponse
from app.store import SessionStore
from app.strands_runtime.agent_factory import build_turn_agent
from app.strands_runtime.context import TurnContext
from app.strands_runtime.policy import TurnTool

STRANDS_AGENT_LOOP_ENV = "STRANDS_AGENT_LOOP"


class StrandsTurnBridge:
    """Run a chat turn through Strands tools/hooks and yield existing SSE events."""

    def __init__(self, store: SessionStore, llm: LLMClient) -> None:
        self.store = store
        self.llm = llm

    def handle_turn(self, session_id: str, message: str) -> TurnResponse:
        final: TurnResponse | None = None
        for event_name, payload in self.iter_turn_events(session_id, message):
            if event_name in TERMINAL_EVENTS:
                final = payload
        if final is None:
            raise RuntimeError("turn produced no response")
        return final

    def iter_turn_events(
        self, session_id: str, message: str
    ) -> Iterator[tuple[str, Any]]:
        text = message.strip()
        if not text:
            raise ValueError("message must not be empty")

        session = self.store.get_or_create(session_id)
        session.turn_number += 1
        turn = session.turn_number
        session.streaming_description = ""
        session.messages.append(ChatMessage(role="user", content=text, turn=turn))
        self.store.save(session)

        ctx = TurnContext(
            store=self.store,
            llm=self.llm,
            session=session,
            user_text=text,
        )
        agent = build_turn_agent(ctx, self.llm)

        # Early SSE frame before blocking extract (product invariant).
        yield ("validation_status", {"phase": "extracting"})

        use_agent_loop = os.environ.get(STRANDS_AGENT_LOOP_ENV, "").lower() in {
            "1",
            "true",
            "yes",
        }
        if use_agent_loop:
            yield from self._run_agent_stream(agent, ctx, text)
            return

        yield from self._run_tool_sequence(agent, ctx)

    def _invoke_named_tool(self, agent, name: str) -> None:
        if name == TurnTool.INGEST:
            agent.tool.ingest_user_turn()
        elif name == TurnTool.ASK:
            agent.tool.ask_clarifying_question()
        elif name == TurnTool.CONFIRM:
            agent.tool.request_generation_confirmation()
        elif name == TurnTool.GENERATE:
            agent.tool.generate_copy()
        elif name == TurnTool.REPAIR:
            agent.tool.repair_copy()
        else:
            raise RuntimeError(f"unknown tool: {name}")

    def _invoke_and_stream(
        self, agent, ctx: TurnContext, name: str
    ) -> Iterator[tuple[str, Any]]:
        """Run a tool on a worker thread and flush SSE events as they are emitted.

        Without this, generate_copy buffers every description/email delta until the
        whole tool returns — the UI sits silent for the full LLM stream.
        """
        errors: list[Exception] = []

        def _run() -> None:
            try:
                self._invoke_named_tool(agent, name)
            except Exception as exc:
                errors.append(exc)

        worker = Thread(target=_run, name=f"strands-tool-{name}", daemon=True)
        worker.start()
        while worker.is_alive():
            ctx.wait_for_events(timeout=0.05)
            yield from ctx.drain()
        worker.join()
        yield from ctx.drain()
        if errors:
            raise errors[0]

    def _run_tool_sequence(self, agent, ctx: TurnContext) -> Iterator[tuple[str, Any]]:
        """Invoke Strands tools in deterministic policy order (hooks still enforce)."""
        yield from self._invoke_and_stream(agent, ctx, TurnTool.INGEST)
        while ctx.terminal is None and ctx.next_tool:
            yield from self._invoke_and_stream(agent, ctx, ctx.next_tool)
        if ctx.terminal is None:
            raise RuntimeError("turn produced no terminal response")

    def _run_agent_stream(
        self, agent, ctx: TurnContext, text: str
    ) -> Iterator[tuple[str, Any]]:
        """Optional model-driven Strands loop (STRANDS_AGENT_LOOP=1)."""

        async def _consume() -> None:
            prompt = (
                f"User message:\n{text}\n\n"
                "Call ingest_user_turn first, then follow next_tool until the turn ends."
            )
            async for _event in agent.stream_async(prompt):
                del _event

        loop = asyncio.new_event_loop()
        try:
            task = loop.create_task(_consume())
            while not task.done():
                loop.run_until_complete(asyncio.sleep(0.01))
                yield from ctx.drain()
            exc = task.exception()
            if exc is not None:
                raise exc
            yield from ctx.drain()
        finally:
            loop.close()

        if ctx.terminal is None:
            # Complete remaining policy steps without re-running ingest.
            if ctx.extraction is None:
                yield from self._run_tool_sequence(agent, ctx)
                return
            while ctx.terminal is None and ctx.next_tool:
                yield from self._invoke_and_stream(agent, ctx, ctx.next_tool)
            if ctx.terminal is None:
                raise RuntimeError("turn produced no terminal response")
