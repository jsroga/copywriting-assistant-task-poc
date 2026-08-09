from __future__ import annotations

from strands.hooks import BeforeToolCallEvent, HookProvider, HookRegistry
from strands.vended_plugins.steering import Guide, Proceed, SteeringHandler

from app.strands_runtime.context import TurnContext
from app.strands_runtime.policy import TurnTool, allowed_tools


class TurnGuardHooks(HookProvider):
    """Cancel illegal tool calls (e.g. second repair, generate before ready)."""

    def __init__(self, ctx: TurnContext) -> None:
        self._ctx = ctx

    def register_hooks(self, registry: HookRegistry, **kwargs: object) -> None:
        del kwargs
        registry.add_callback(BeforeToolCallEvent, self._before_tool)

    def _before_tool(self, event: BeforeToolCallEvent) -> None:
        name = event.tool_use.get("name", "")
        allowed = allowed_tools(self._ctx)
        if name and name not in allowed:
            event.cancel_tool = (
                f"Tool {name!r} is not allowed now. "
                f"Allowed: {sorted(allowed) or ['(none — turn complete)']}."
            )
            return
        if name == TurnTool.REPAIR and self._ctx.repair_used:
            event.cancel_tool = "Repair budget already spent (exactly one repair)."


class TurnSteering(SteeringHandler):
    """Steer the agent toward the deterministic next_tool from domain policy."""

    def __init__(self, ctx: TurnContext) -> None:
        super().__init__()
        self._ctx = ctx

    async def steer_before_tool(self, *, agent, tool_use, **kwargs):
        del agent, kwargs
        name = tool_use.get("name", "")
        allowed = allowed_tools(self._ctx)
        if name and name not in allowed:
            if self._ctx.next_tool:
                return Guide(
                    reason=(
                        f"Call {self._ctx.next_tool} next. "
                        f"{name} is not allowed in the current turn state."
                    )
                )
            return Guide(reason="Turn is complete; do not call more tools.")
        return Proceed(reason="Tool matches deterministic turn policy.")
