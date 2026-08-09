from __future__ import annotations

from pathlib import Path

from app.domain.models import ProductBrief, Session


class SessionStore:
    """In-memory session store. Process restart loses sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def get_or_create(self, session_id: str) -> Session:
        session = self.get(session_id)
        if session is None:
            session = Session(id=session_id, brief=ProductBrief())
            self.save(session)
        return session

    def save(self, session: Session) -> None:
        self._sessions[session.id] = session

    def clear(self) -> None:
        self._sessions.clear()


class FileSessionStore(SessionStore):
    """Disk-backed store so uvicorn --reload does not wipe ProductBrief state."""

    def __init__(self, directory: Path) -> None:
        super().__init__()
        self._directory = directory
        self._directory.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in session_id)
        return self._directory / f"{safe}.json"

    def get(self, session_id: str) -> Session | None:
        cached = self._sessions.get(session_id)
        if cached is not None:
            return cached
        path = self._path(session_id)
        if not path.exists():
            return None
        session = Session.model_validate_json(path.read_text(encoding="utf-8"))
        self._sessions[session_id] = session
        return session

    def save(self, session: Session) -> None:
        self._sessions[session.id] = session
        self._path(session.id).write_text(
            session.model_dump_json(),
            encoding="utf-8",
        )

    def clear(self) -> None:
        self._sessions.clear()
        for path in self._directory.glob("*.json"):
            path.unlink(missing_ok=True)
