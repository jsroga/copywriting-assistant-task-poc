from __future__ import annotations

from collections.abc import Callable
from typing import Any

from strands import tool

from app.strands_runtime.context import TurnContext
from app.strands_runtime.tool_impl import (
    run_ask_clarifying_question,
    run_generate_copy,
    run_ingest_user_turn,
    run_repair_copy,
    run_request_generation_confirmation,
)


def build_turn_tools(ctx: TurnContext) -> list[Callable[..., Any]]:
    """Strands @tool wrappers closed over the current TurnContext."""

    @tool(name="ingest_user_turn")
    def ingest_user_turn() -> dict:
        """Extract facts from the user message, reduce the ProductBrief, and evaluate readiness.

        Call this first on every turn. Returns gate status and the required next_tool.
        """
        return run_ingest_user_turn(ctx)

    @tool(name="ask_clarifying_question")
    def ask_clarifying_question() -> dict:
        """Ask the user one clarifying question when the brief is not ready to generate.

        Use when next_tool is ask_clarifying_question (missing fields, conflicts, price,
        meta/off-topic, or not-ready generation request).
        """
        return run_ask_clarifying_question(ctx)

    @tool(name="request_generation_confirmation")
    def request_generation_confirmation() -> dict:
        """Ask the user to confirm before generating copy when the gate is READY.

        Use when next_tool is request_generation_confirmation.
        """
        return run_request_generation_confirmation(ctx)

    @tool(name="generate_copy")
    def generate_copy() -> dict:
        """Stream product description and email, then validate.

        Use only when the gate is READY and generation was confirmed or explicitly
        requested. If validation fails, next_tool will be repair_copy.
        """
        return run_generate_copy(ctx)

    @tool(name="repair_copy")
    def repair_copy() -> dict:
        """Run the single automatic repair after generate_copy validation failure.

        May be called at most once per turn.
        """
        return run_repair_copy(ctx)

    return [
        ingest_user_turn,
        ask_clarifying_question,
        request_generation_confirmation,
        generate_copy,
        repair_copy,
    ]
