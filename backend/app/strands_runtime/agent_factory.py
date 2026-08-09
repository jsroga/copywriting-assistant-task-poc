from __future__ import annotations

from strands import Agent

from app.llm.fake_client import FakeLLMClient
from app.llm.base import LLMClient
from app.strands_runtime.context import TurnContext
from app.strands_runtime.hooks import TurnGuardHooks, TurnSteering
from app.strands_runtime.model import build_openai_model
from app.strands_runtime.prompts import SYSTEM_PROMPT
from app.strands_runtime.tools import build_turn_tools


def build_turn_agent(ctx: TurnContext, llm: LLMClient) -> Agent:
    """Create a Strands Agent bound to this turn's tools, hooks, and steering."""
    tools = build_turn_tools(ctx)
    hooks = [TurnGuardHooks(ctx)]
    plugins = [TurnSteering(ctx)]

    if isinstance(llm, FakeLLMClient):
        # Direct tool calls do not need a live model; placeholder id is fine.
        return Agent(
            model="fake-llm-placeholder",
            system_prompt=SYSTEM_PROMPT,
            tools=tools,
            hooks=hooks,
            plugins=plugins,
            callback_handler=None,
        )

    model = build_openai_model()
    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=tools,
        hooks=hooks,
        plugins=plugins,
        callback_handler=None,
    )
