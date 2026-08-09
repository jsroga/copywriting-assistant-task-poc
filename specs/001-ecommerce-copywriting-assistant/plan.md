# Implementation Plan: AI-Powered E-Commerce Copywriting Assistant

**Branch**: `001-ecommerce-copywriting-assistant` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-ecommerce-copywriting-assistant/spec.md`

**Note**: Technical choices are fixed by `PROJECT_BRIEF.md` §5 and clarification policy §4.

## Summary

Build a conversational e-commerce copywriting assistant where the LLM extracts structured deltas and generates/repairs copy, while deterministic Python code owns reduce, readiness, questions, validation, and the one-repair budget. Deliver a minimal Next.js + assistant-ui chat demo with a live ProductBrief/validation panel, mocked-LLM tests, and difficult-user transcripts.

## Technical Context

**Language/Version**: Python 3.12+ (backend), TypeScript (frontend / Next.js)

**Primary Dependencies**: FastAPI, Pydantic, OpenAI Python SDK (Structured Outputs); Next.js, assistant-ui, minimal shadcn-style primitives

**Storage**: In-memory `dict[str, Session]` (no database)

**Testing**: pytest with FakeLLMClient; frontend lint/build

**Target Platform**: Local developer machines (macOS/Linux); browser UI + local API

**Project Type**: Web application (frontend + backend)

**Performance Goals**: Interactive local demo; no production SLA. Bound LLM cost via one repair maximum and no streaming.

**Constraints**: 6–8 hour prototype; no auth/DB/RAG/multi-agent/streaming; LLM behind `LLMClient`; readiness + validators deterministic; OPENAI_API_KEY / OPENAI_MODEL via env

**Scale/Scope**: Single-process demo; one operator session at a time is sufficient; ~one-page README; ≥3 difficult-user transcripts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Deterministic control flow | PASS | Orchestrator + gate + validators own flow |
| II. Structured state source of truth | PASS | Typed ProductBrief; generator uses normalized brief |
| III. Mockable LLM boundaries | PASS | LLMClient + FakeLLMClient + OpenAILLMClient |
| IV. Explicit uncertainty | PASS | MISSING/VAGUE/CONFIRMED/CONFLICTED |
| V. Bounded generation repair | PASS | Exactly one automatic repair |
| VI. Scope discipline | PASS | No DB/auth/RAG/multi-agent/streaming |
| VII. Spec first | PASS | Implementing from Spec Kit artifacts |
| VIII. Tests before polish | PASS | Core pytest contract before UI polish |

Post-design re-check: PASS — design artifacts introduce no constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-ecommerce-copywriting-assistant/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-api.md
├── checklists/
└── tasks.md
```

### Source Code (repository root)

```text
.
├── AGENTS.md
├── PROJECT_BRIEF.md
├── README.md
├── .cursor/agents/
│   ├── backend-engineer.md
│   ├── frontend-engineer.md
│   └── verifier.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── store.py
│   │   ├── orchestration/
│   │   │   ├── engine.py          # ConversationOrchestrator turn loop
│   │   │   ├── generation.py      # CopyPipeline: generate → validate → one repair
│   │   │   ├── messages.py        # canned assistant messages + intent regexes
│   │   │   ├── responses.py       # TurnResponse wire contract + SSE framing
│   │   │   └── session_effects.py # optional-field / assumption bookkeeping
│   │   ├── domain/
│   │   │   ├── models.py
│   │   │   ├── reducer.py
│   │   │   ├── gate.py
│   │   │   └── questions.py
│   │   ├── llm/
│   │   │   ├── base.py
│   │   │   ├── openai_client.py
│   │   │   ├── fake_client.py
│   │   │   ├── json_utils.py
│   │   │   └── prompts/
│   │   └── validation/
│   │       ├── base.py
│   │       └── rules.py
│   ├── tests/
│   ├── pyproject.toml
│   └── .env.example
├── frontend/
│   ├── app/
│   ├── components/
│   └── lib/
└── demos/
    ├── scenarios/
    └── transcripts/
```

**Structure Decision**: Split frontend/backend as specified in PROJECT_BRIEF §5.19. No `.squad/`. Cursor + Spec Kit orchestrate development.

One deviation from §5.19: the single `app/orchestrator.py` became the `app/orchestration/` package. The turn loop plus wire contract, canned messages, and session bookkeeping exceeded the repo's file-length gate in one module; splitting them keeps each concern independently readable and testable. `ConversationOrchestrator`, `TurnResponse`, and `sse_frame` are re-exported from `app.orchestration`, so the import surface is still a single module path.

## Complexity Tracking

> No constitution violations requiring justification.
