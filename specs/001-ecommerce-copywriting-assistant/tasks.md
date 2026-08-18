# Tasks: AI-Powered E-Commerce Copywriting Assistant

**Input**: Design documents from `/specs/001-ecommerce-copywriting-assistant/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by PROJECT_BRIEF §11 and FR-023 — include unit/integration tests with FakeLLMClient.

**Organization**: Phases follow PROJECT_BRIEF §9 (A–H) mapped to user stories US1–US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / US4 where applicable
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository scaffolding and project instructions

- [x] T001 Create root `AGENTS.md` with rules from PROJECT_BRIEF §6
- [x] T002 [P] Create `.cursor/agents/backend-engineer.md` from PROJECT_BRIEF §7.1
- [x] T003 [P] Create `.cursor/agents/frontend-engineer.md` from PROJECT_BRIEF §7.2
- [x] T004 [P] Create `.cursor/agents/verifier.md` from PROJECT_BRIEF §7.3
- [x] T005 Create root `.gitignore` covering Python/Node/env secrets and local artifacts
- [x] T006 Scaffold `backend/` with `pyproject.toml`, package layout under `backend/app/`, and `backend/.env.example` (`OPENAI_API_KEY`, `OPENAI_MODEL`)
- [x] T007 [P] Scaffold `frontend/` Next.js + TypeScript app under `frontend/` with assistant-ui dependency plan; keep code compliant with root `npm run lint` (tilemap `eslint-rules/` via `eslint.config.js` + stop hook)
- [x] T008 [P] Create `demos/scenarios/` and `demos/transcripts/` directories with `.gitkeep` if empty

---

## Phase 2: Foundational — Deterministic Domain Core

**Purpose**: Models, reducer, gate, questions — blocking for all stories

**⚠️ CRITICAL**: No story orchestration/API until this phase passes tests

- [x] T009 Implement Pydantic domain models in `backend/app/domain/models.py` per data-model.md
- [x] T010 [P] Implement pure `reduce_brief` in `backend/app/domain/reducer.py` (correction vs contradiction vs vague)
- [x] T011 [P] Implement deterministic readiness gate in `backend/app/domain/gate.py`
- [x] T012 [P] Implement deterministic question builder in `backend/app/domain/questions.py`
- [x] T013 Unit tests for reducer in `backend/tests/test_reducer.py` covering PROJECT_BRIEF §11.1
- [x] T014 Unit tests for readiness gate in `backend/tests/test_gate.py` covering PROJECT_BRIEF §11.2

**Checkpoint**: Domain core green under pytest

---

## Phase 3: User Story 1 — Conversational briefing + validated copy (P1) 🎯 MVP

**Goal**: Extract → reduce → gate → generate → validate → one repair → API responses for ready/not-ready

**Independent Test**: FakeLLMClient integration: incomplete brief asks follow-up with 0 generate calls; complete brief generates; invalid then repair once; second fail surfaces failure

### Validation & LLM boundary

- [x] T015 [US1] Implement violation models + `validate()` chain in `backend/app/validation/base.py` and `backend/app/validation/rules.py` (price, lengths, CTA, subject, feature coverage, placeholders, ForbiddenClaims)
- [x] T016 [US1] Unit tests for validators in `backend/tests/test_validators.py` covering PROJECT_BRIEF §11.3
- [x] T017 [P] [US1] Define `LLMClient` protocol in `backend/app/llm/base.py`
- [x] T018 [P] [US1] Implement `FakeLLMClient` in `backend/app/llm/fake_client.py` with call counters
- [x] T019 [US1] Implement prompt files `backend/app/llm/prompts/extract.md`, `generate.md`, `repair.md`
- [x] T020 [US1] Implement `OpenAICompatibleLLMClient` in `backend/src/llm/openai_compatible_client.ts` (Structured Outputs only inside this module)

### Orchestrator & API

- [x] T021 [US1] Implement in-memory session store in `backend/app/store.py`
- [x] T022 [US1] Implement turn orchestrator in `backend/app/orchestration/engine.py` (extract→reduce→gate→ask/generate→validate→one repair)
- [x] T023 [US1] Integration tests in `backend/tests/test_orchestrator.py` and `backend/tests/test_repair_flow.py` covering PROJECT_BRIEF §11.4 including call-count asserts
- [x] T024 [US1] Implement FastAPI app + `POST /api/chat/{session_id}` in `backend/app/main.py` per `contracts/chat-api.md` (CORS for local frontend)
- [x] T025 [US1] Wire dependency injection so tests use FakeLLMClient and runtime uses OpenAICompatibleLLMClient based on env

**Checkpoint**: US1 backend MVP demonstrable via API + pytest

---

## Phase 4: User Story 2 — Editable corrections & contradictions (P1)

**Goal**: Correction history and conflicted clarification flows correct end-to-end

**Independent Test**: Orchestrator tests for explicit correction overwrite+history; contradiction → CONFLICTED → clarification → resolution

- [x] T026 [US2] Ensure reducer/orchestrator conflict comparison questions use `backend/app/domain/questions.py` conflict template
- [x] T027 [US2] Add/extend tests in `backend/tests/test_reducer.py` and `backend/tests/test_orchestrator.py` for correction-after-state and contradiction resolution
- [x] T028 [US2] Ensure session remains editable after `generated_copy` and regenerates when gate ready again

---

## Phase 5: User Story 3 — Vague input & prompt-injection containment (P2)

**Goal**: Vague price stays vague; META_INSTRUCTION containment without state corruption

**Independent Test**: Orchestrator tests for vague price + meta-instruction; no fabricated number; brief intact

- [x] T029 [US3] Implement optional vague clarification tracking (one attempt) + assumptions in orchestrator/`ProductBrief.assumptions`
- [x] T030 [US3] Intent handling for `META_INSTRUCTION` / `OFF_TOPIC` / `REQUEST_GENERATION` / `REFINE_OUTPUT` in `backend/app/orchestration/engine.py` without agent framework
- [x] T031 [US3] Tests: vague remains vague; meta-instruction does not corrupt canonical state (`backend/tests/test_orchestrator.py`)

---

## Phase 6: User Story 4 — Live UI + demo transcripts (P2)

**Goal**: Simple web UI with live brief/validation; three required transcripts (+ optional fourth)

**Independent Test**: Local UI shows chat + brief statuses + validation; transcripts exist under `demos/transcripts/`

- [x] T032 [US4] Implement chat adapter in `frontend/lib/chat-adapter.ts` over POST `/api/chat/{session_id}` (no streaming)
- [x] T033 [US4] Implement `frontend/components/Chat.tsx` using assistant-ui + adapter
- [x] T034 [P] [US4] Implement `frontend/components/ProductBriefPanel.tsx` (values, status labels, version)
- [x] T035 [P] [US4] Implement `frontend/components/ValidationBadge.tsx` (pass / pass-after-repair / failed-after-repair)
- [x] T036 [US4] Wire desktop layout left chat / right panel in `frontend/app/page.tsx`
- [x] T037 [US4] Create scenario JSON files in `demos/scenarios/` for contradiction, prompt-injection, vague-input
- [x] T038 [US4] Generate Markdown transcripts in `demos/transcripts/` for those three scenarios
- [x] T039 [P] [US4] [Optional] Add correction-after-delivery scenario + transcript

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: README, verification, converge

- [x] T040 Write root `README.md` (~one page) per PROJECT_BRIEF §13
- [x] T041 Run backend tests (`cd backend && uv run pytest`) and fix failures
- [x] T042 Run root `npm run lint` (tilemap local rules) + frontend production build; fix failures without disabling `local/*` rules
- [x] T043 Run read-only verifier subagent against AC-01…AC-31; fix blocking findings
- [x] T044 Run Spec Kit converge; implement only convergence tasks required for unmet acceptance criteria
- [x] T045 Produce final Completion Report in chat per PROJECT_BRIEF §17

---

## Dependencies & Execution Order

```text
Phase 1 Setup
  → Phase 2 Domain core + tests
    → Phase 3 US1 (validation, LLM, orchestrator, API)  [MVP]
      → Phase 4 US2 (corrections/contradictions)  [can overlap late US1 tests]
      → Phase 5 US3 (vague/injection)
        → Phase 6 US4 (UI + demos)
          → Phase 7 Polish / verify / converge
```

**User story independence**:
- US1 delivers MVP value alone via API + FakeLLM tests
- US2/US3 deepen deterministic semantics (mostly backend)
- US4 is presentation + evidence; does not change domain rules

## Parallel Opportunities

- T002–T004 agents in parallel after T001
- T010–T012 domain modules in parallel after T009
- T017–T018 LLM stubs in parallel with T015 validators
- T034–T035 UI panels in parallel after adapter contract stable
- T039 optional after required transcripts

## Implementation Strategy

1. Finish Phase 2 tests before any LLM/network code.
2. Stabilize FakeLLM orchestrator tests before OpenAI client.
3. Freeze API contract before frontend.
4. Cut order if needed: optional judge → UI polish → T039 → GET session → animations → refactors. Never cut required ACs.

---

## Phase 8: Convergence (2026-08-09)

**Assessment**: Codebase reviewed against spec.md, plan.md, constitution, and AC-01…AC-31.
**Blocking unmet acceptance criteria**: none.
**Verifier**: PASS (AC table green; frontend production build green in agent session; pytest 26 passed; root `npm run lint` PASS).

### Optional non-blocking follow-ups (not required for acceptance)

- [ ] T046 [Optional] Suppress Pydantic warning for `TurnResponse.copy` field naming without breaking API contract alias
- [ ] T047 [Optional] Deduplicate root vs `frontend/package-lock.json` via npm workspaces or documented dual-lock approach
- [ ] T048 [Optional] Add HTTP-level FastAPI contract test for `POST /api/chat/{session_id}` response envelope

