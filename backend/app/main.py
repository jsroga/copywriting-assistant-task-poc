from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.llm.fake_client import FakeLLMClient
from app.llm.openai_compatible_client import (
    OpenAICompatibleLLMClient,
    resolve_llm_credentials,
)
from app.ports import LLMClient
from app.orchestration import ConversationOrchestrator, TurnResponse, sse_frame
from app.store import FileSessionStore, SessionStore

# Load repo-root .env then backend/.env (later wins).
_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_BACKEND_ROOT / ".env", override=True)

app = FastAPI(title="E-Commerce Copywriting Assistant", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5100",
        "http://127.0.0.1:5100",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persist sessions across uvicorn --reload so confirm/generate never wipes briefs.
store: SessionStore = FileSessionStore(_BACKEND_ROOT / ".data" / "sessions")


def build_llm() -> LLMClient:
    if os.environ.get("USE_FAKE_LLM", "").lower() in {"1", "true", "yes"}:
        return FakeLLMClient()
    api_key, base_url, model = resolve_llm_credentials()
    if not api_key or api_key.startswith("sk-your-key"):
        return FakeLLMClient()
    return OpenAICompatibleLLMClient(
        api_key=api_key, base_url=base_url or None, model=model
    )


llm = build_llm()
orchestrator = ConversationOrchestrator(store=store, llm=llm)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat/{session_id}", response_model=TurnResponse)
def chat(session_id: str, body: ChatRequest) -> TurnResponse:
    try:
        return orchestrator.handle_turn(session_id, body.message)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM/chat failure: {exc}") from exc


@app.post("/api/chat/{session_id}/stream")
def chat_stream(session_id: str, body: ChatRequest) -> StreamingResponse:
    def event_stream() -> Iterator[str]:
        try:
            for event_name, payload in orchestrator.iter_turn_events(
                session_id, body.message
            ):
                yield sse_frame(event_name, payload)
        except ValueError as exc:
            yield sse_frame("error", {"detail": str(exc)})
        except Exception as exc:
            yield sse_frame("error", {"detail": f"LLM/chat failure: {exc}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/session/{session_id}")
def get_session(session_id: str) -> dict[str, Any]:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return {
        "id": session.id,
        "brief": session.brief.model_dump(mode="json"),
        "messages": [m.model_dump(mode="json") for m in session.messages],
        "turn_number": session.turn_number,
        "last_copy": (
            session.last_copy.model_dump(mode="json") if session.last_copy else None
        ),
        "last_validation": (
            session.last_validation.model_dump(mode="json")
            if session.last_validation
            else None
        ),
        "awaiting_generation_confirmation": session.awaiting_generation_confirmation,
        "streaming_description": session.streaming_description,
    }


def override_llm(client: LLMClient) -> None:
    """Test helper to swap the LLM client."""
    global llm, orchestrator
    llm = client
    orchestrator = ConversationOrchestrator(store=store, llm=llm)


def reset_store() -> None:
    store.clear()
