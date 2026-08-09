from app.orchestration.responses import TurnResponse, sse_frame

__all__ = ["ConversationOrchestrator", "TurnResponse", "sse_frame"]


def __getattr__(name: str):
    if name == "ConversationOrchestrator":
        from app.orchestration.engine import ConversationOrchestrator

        return ConversationOrchestrator
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
