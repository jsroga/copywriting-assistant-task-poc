<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles: none
- Modified Architecture Constraints: FastAPI + Python 3.12+ + Pydantic → Hono + Node + TypeScript + Zod
- Added sections: none
- Removed sections: none
- Follow-up TODOs: none
-->

# AI Copywriting Assistant Constitution

## Core Principles

### I. Deterministic Control Flow
The LLM MUST NOT own application control flow. The LLM MAY extract structured
facts, classify intent, generate copy, repair copy after failed validation, and
optionally judge subjective tone. Deterministic application code MUST merge
extracted facts, apply corrections, track contradictions, decide readiness,
select the next missing or ambiguous field, validate objective output
requirements, enforce the retry budget, and prevent more than one automatic
repair attempt. The readiness decision MUST NEVER be hidden inside one large
prompt.

### II. Structured State as Source of Truth
The conversation transcript is NOT the source of truth for product data. A typed
`ProductBrief` is the source of truth. The generator SHOULD consume normalized
structured state rather than the complete raw conversation whenever possible.

### III. Mockable LLM Boundaries
All real model calls MUST sit behind an explicit `LLMClient` abstraction. Core
extraction integration, reducer, readiness gate, validators, retry logic, and
orchestration MUST be testable without network access. Tests MUST use a
deterministic fake or mock LLM.

### IV. Explicit Uncertainty
The system MUST NOT silently guess precise facts from vague user language. The
state model MUST distinguish at least `MISSING`, `VAGUE`, `CONFIRMED`, and
`CONFLICTED`. Explicit corrections and ambiguous contradictions are different
cases and MUST be handled differently.

### V. Bounded Generation Repair
Generated content MUST be validated before being treated as successful final
output. If validation fails, the system MUST perform exactly one automatic
repair attempt. Unbounded generation retry loops are FORBIDDEN.

### VI. Scope Discipline
This is a 6 to 8 hour prototype. The implementation MUST prefer the smallest
solution that proves the evaluation criteria. Authentication, database
persistence, RAG, vector databases, runtime multi-agent frameworks, background
jobs, complex observability platforms, production deployment infrastructure,
elaborate UI animation, and unnecessary abstractions MUST NOT be added until all
required functionality is complete.

### VII. Spec First, Implementation Second
The active Spec Kit specification, plan, and task list are binding
implementation contracts. Implementation MUST NOT silently change product
requirements or architecture. If implementation reveals a real specification
problem: (1) update the relevant Spec Kit artifact, (2) re-run consistency
analysis if needed, (3) then continue implementation.

### VIII. Tests Before Polish
The deterministic core and its tests have higher priority than frontend polish.
If time becomes constrained, cut optional UI and judge functionality before
cutting testable core behavior.

## Architecture Constraints

- Stack is fixed for this prototype: Next.js + TypeScript + assistant-ui frontend;
  Hono + Node 20+ + Zod backend; OpenAI Structured Outputs for LLM
  calls; in-memory session storage.
- Extractor returns deltas only; reducer owns canonical state mutation.
- Completeness/readiness gate and objective validators are deterministic code.
- No token streaming in MVP; validate before presenting final copy.
- Prompt injection handling is pragmatic containment, not a security product claim.
- No LangGraph, CrewAI, AutoGen, Squad, or equivalent runtime multi-agent
  orchestration.

## Development Workflow

1. Follow Spec Kit phase order: constitution → specify → clarify → plan →
   checklist → tasks → analyze → implement → converge.
2. Implement only tasks represented in the active task list; keep task status
   accurate.
3. Run relevant tests after each meaningful task group.
4. Core orchestration tests MUST run with `FakeLLMClient` (or equivalent) and
   MUST assert generate/repair call counts for the one-repair rule.
5. Run the verifier before declaring the project complete; then run Spec Kit
   convergence.
6. If Spec Kit artifacts conflict with `PROJECT_BRIEF.md`, stop and reconcile
   before continuing implementation.

## Governance

This constitution supersedes informal implementation preferences. Amendments
require updating `.specify/memory/constitution.md`, bumping
`CONSTITUTION_VERSION` using semantic versioning, and documenting the change in
the Sync Impact Report comment. MAJOR bumps remove or redefine principles; MINOR
adds material guidance; PATCH clarifies wording.

All implementation and review MUST verify compliance with the Core Principles and
Architecture Constraints. Complexity beyond the prototype scope MUST be justified
against unmet acceptance criteria. `PROJECT_BRIEF.md` remains the original product
and architecture brief; active Spec Kit artifacts under `specs/` are the binding
implementation contract once reconciled with the brief.

**Version**: 1.1.0 | **Ratified**: 2026-08-09 | **Last Amended**: 2026-08-16
