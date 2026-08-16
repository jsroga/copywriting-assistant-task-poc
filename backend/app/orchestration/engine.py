from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from app.ports import LLMClient
from app.orchestration.responses import TurnResponse
from app.store import SessionStore
from app.strands_runtime.bridge import StrandsTurnBridge


class ConversationOrchestrator:
    """Turn entrypoint: delegates to the Strands Agents harness (tools + hooks)."""

    def __init__(self, store: SessionStore, llm: LLMClient) -> None:
        self.store = store
        self.llm = llm
        self._bridge = StrandsTurnBridge(store=store, llm=llm)

    def handle_turn(self, session_id: str, message: str) -> TurnResponse:
        return self._bridge.handle_turn(session_id, message)

    def iter_turn_events(
        self, session_id: str, message: str
    ) -> Iterator[tuple[str, Any]]:
        return self._bridge.iter_turn_events(session_id, message)
