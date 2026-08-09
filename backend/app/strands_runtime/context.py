from __future__ import annotations

from collections import deque
from collections.abc import Iterator
from dataclasses import dataclass, field
from threading import Condition
from typing import Any

from app.domain.models import (
    ExtractionResult,
    GateDecision,
    GeneratedCopy,
    Session,
    Violation,
)
from app.llm.base import LLMClient
from app.orchestration.responses import TurnResponse
from app.store import SessionStore

HISTORY_TAIL = 4


@dataclass
class TurnContext:
    """Per-turn mutable state shared by Strands tools (via closure)."""

    store: SessionStore
    llm: LLMClient
    session: Session
    user_text: str
    events: deque[tuple[str, Any]] = field(default_factory=deque)
    extraction: ExtractionResult | None = None
    gate: GateDecision | None = None
    rejected_field: str | None = None
    terminal: TurnResponse | None = None
    repair_used: bool = False
    pending_copy: GeneratedCopy | None = None
    pending_violations: list[Violation] = field(default_factory=list)
    next_tool: str | None = None
    _event_lock: Condition = field(default_factory=Condition, repr=False)

    def emit(self, event_name: str, payload: Any) -> None:
        with self._event_lock:
            self.events.append((event_name, payload))
            self._event_lock.notify_all()

    def drain(self) -> Iterator[tuple[str, Any]]:
        with self._event_lock:
            while self.events:
                yield self.events.popleft()

    def wait_for_events(self, timeout: float = 0.05) -> bool:
        """Block briefly until at least one event is queued (or timeout)."""
        with self._event_lock:
            if self.events:
                return True
            self._event_lock.wait(timeout=timeout)
            return bool(self.events)
