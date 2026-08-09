"""Strands Agents turn harness: tools, hooks, and SSE bridge."""

__all__ = ["StrandsTurnBridge"]


def __getattr__(name: str):
    if name == "StrandsTurnBridge":
        from app.strands_runtime.bridge import StrandsTurnBridge

        return StrandsTurnBridge
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
