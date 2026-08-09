# Research: AI-Powered E-Commerce Copywriting Assistant

**Date**: 2026-08-09  
**Feature**: `001-ecommerce-copywriting-assistant`

All Technical Context items were pre-decided by `PROJECT_BRIEF.md`. This document records decisions, rationale, and rejected alternatives so plan/tasks stay aligned.

## Decision 1: Strands harness; deterministic domain tools

- **Decision**: Strands Agents SDK (single agent) owns turn sequencing via tools. Deterministic Python tools/hooks own reduce, gate, questions, validation, repair budget. LLM content calls (extract / generate / repair) stay behind `LLMClient` inside tools.
- **Rationale**: Matches amended constitution principle I (1.1.0) and keeps readiness/repair inspectable while adopting Strands as the harness.
- **Alternatives considered**: LangGraph/CrewAI/AutoGen multi-agent swarms — rejected as out of scope; pure Python orchestrator without Strands — prior baseline, replaced on `feat/strands`.

## Decision 2: OpenAI Structured Outputs behind LLMClient

- **Decision**: `OpenAILLMClient` uses OpenAI Structured Outputs with Pydantic schemas; `FakeLLMClient` for tests; model via `OPENAI_MODEL`, key via `OPENAI_API_KEY`.
- **Rationale**: Brief-fixed stack; schema conformance contains output shape for extract/generate/repair.
- **Alternatives considered**: Free-form JSON parsing — weaker guarantees; vendor SDK calls scattered in orchestrator — hard to mock.

## Decision 3: Delta extraction + pure reducer

- **Decision**: Extractor returns `ExtractionResult` deltas; `reduce_brief(brief, extraction, turn)` is a pure function merging into `ProductBrief`.
- **Rationale**: LLM must not own canonical state; correction vs contradiction semantics need deterministic tests.
- **Alternatives considered**: Full-state rewrite by LLM each turn — fails AC-03 and makes history/conflicts unreliable.

## Decision 4: Deterministic readiness gate + question templates

- **Decision**: `GateDecision` from code using REQUIRED_FIELDS / QUESTION_PRIORITY; questions from templates; conflict comparison questions deterministic.
- **Rationale**: Readiness must never hide in model prose; avoid extra LLM call for common follow-ups.
- **Alternatives considered**: LLM-chosen next question — less testable; multi-question turns — violates “ask one at a time.”

## Decision 5: Validation chain + exactly one repair

- **Decision**: Deterministic validators return structured `Violation`s; orchestrator calls repair at most once; failed second validation surfaces failure.
- **Rationale**: Bounded cost; visible uncertainty; call-count assertions in tests.
- **Alternatives considered**: Unbounded retries — forbidden; streaming partial display before validation — rejected for MVP.

## Decision 6: In-memory sessions + turn-based API

- **Decision**: `dict[str, Session]`; `POST /api/chat/{session_id}` request/response (no token streaming); return full brief + gate/validation each turn.
- **Rationale**: Zero DB setup; validation-before-display requires buffering anyway.
- **Alternatives considered**: Persistent DB — scope creep; SSE/streaming — complexity without evaluation benefit.

## Decision 7: Prompt-injection containment (4 layers)

- **Decision**: Role separation; structured extraction schema; META_INSTRUCTION intent handling; generate from normalized brief not raw transcript.
- **Rationale**: Prototype needs clear pragmatic containment, not a security product claim.
- **Alternatives considered**: Claiming complete prompt-injection immunity — dishonest; ignoring META_INSTRUCTION — fails AC-11.

## Decision 8: Frontend assistant-ui custom adapter

- **Decision**: Next.js + assistant-ui with custom request/response adapter; left chat / right ProductBrief + validation panel.
- **Rationale**: Brief-fixed UI stack; panel demonstrates architecture more than polish.
- **Alternatives considered**: CLI-only — excluded by brief; heavy custom chat UI — unnecessary time sink.

## Decision 9: Demo transcripts via deterministic runner

- **Decision**: JSON scenarios under `demos/scenarios/` plus Markdown transcripts under `demos/transcripts/`, generated or assembled via FakeLLMClient/integration runs.
- **Rationale**: Reproducible evaluation evidence without video.
- **Alternatives considered**: Manual-only screenshots — brittle; video recording — out of time budget.
