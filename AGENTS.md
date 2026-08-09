# Project Instructions

## NEVER (highest priority — overrides everything)

Two rules. They apply to every agent and every change:

1. **NEVER ADD ANYTHING ON YOUR OWN.** No features, UI, labels, status text, or "improvements" beyond the exact ask.
2. **NEVER REMOVE ANYTHING ON YOUR OWN.** Never delete, comment out, disable, or hide features, UI, tests, or checks. Broken means iterate — grind for hours if needed — until it is fixed.

If the ask seems to require adding or removing something the user did not mention, stop and ask first.

**Never hand over without a green verification pass** (run independent checks in parallel): `npm run typecheck` + `npm run lint` + affected tests, clear terminal, healthy localhost (`:5100` / `:5001`). Targeted `npm run test:e2e` when the chat/stream/validation flow changed. Details: `.cursor/rules/handover-verify-live.mdc`.

Product invariants (asked for by the user — do not regress):

- Product Brief panel always shows all brief fields (including empty/`missing` rows).
- Page refresh = new session; never resume a previous ProductBrief.
- Gate READY via fact fill → ask confirmation before generating.
- Validation box shows pass/fail, failure details, and its own live phases (`validating` / `repairing`, with a spinner and the failures that triggered the retry). Copy-generation progress (`extracting` / `generating` / `building_email`) stays in the description/email sections — it does not belong under Validation.
- Stream endpoint emits an early SSE frame before the blocking extract call; description/email stream token-by-token.

`next/font` loader options must be **literal** values in the calling file (`frontend/lib/fonts-wire.ts`) — imported consts crash the Next build.

Also encoded in `.cursor/rules/never-remove-or-scope-creep.mdc` and `.cursor/rules/handover-verify-live.mdc` (`alwaysApply: true`).

## Source of truth

The active Spec Kit artifacts under `specs/` are the implementation contract.

Read the active specification, plan, and tasks before modifying application code.

`PROJECT_BRIEF.md` is the original product and architecture brief.

If generated Spec Kit artifacts conflict with `PROJECT_BRIEF.md`, stop and reconcile the artifacts before implementation.

## Development process

1. Follow the Spec Kit phase order.
2. Implement only tasks represented in the active task list.
3. Keep task status accurate.
4. Run relevant tests after each meaningful task group.
5. Run the verifier before declaring the project complete.
6. Run Spec Kit convergence after implementation.

## How to run tests

**ALWAYS SHOW FULL OUTPUT, NEVER GREP, THEN FIX IT.** Never pipe a test command
through `grep` / `rg` / `tail` / `head` / `sed` / `awk`. Run it bare, read all of
it, fix what it reports. Filtering hides the failing assertion, the traceback,
and the slow phase — the three things needed to fix anything.

Per-command table and the e2e timeout playbook: `.cursor/skills/run-tests/SKILL.md`.

```bash
npm test                    # offline unit tests (FakeLLM, no network)
npm run test:workers -- 5   # same suite across 5 workers (pytest-xdist)
npm run test:integration    # live provider smoke (needs key)
npm run test:e2e            # live flow + LLM judge, hard 180s budget (needs key)
```

Target a file or node id for focused changes:

```bash
cd backend && uv run pytest tests/test_reducer.py
cd backend && uv run pytest tests/test_orchestrator.py::test_name
```

Never skip, xfail, comment out, weaken, or delete a test to get green. An e2e
timeout is a performance failure to fix, never a timeout to raise.

## Quality gates (blocking before handover)

Never claim frontend or “done” without these passing from repo root:

```bash
npm run quality
# equivalent:
#   npm run lint
#   npm run typecheck   # frontend tsc --noEmit
#   npm test            # backend unit tests (offline)
```

For live end-to-end validation:

```bash
npm run test:e2e
```

### E2E timeout = performance budget

- `test:e2e` / `tests/test_live_e2e_imba_seat.py` has a hard **180 second** timeout.
- Timeout is a **fail**: treat as a performance / round-trip regression to fix.
- Do **not** raise the timeout to make the gate pass.
- On timeout: inspect turn count, LLM call volume, streaming stalls, and optional-field loops; reduce work.

### How agents should validate

| Gate | Command | Meaning |
|------|---------|---------|
| ESLint | `npm run lint` | Frontend local rules + no `any` / no type assertions |
| TypeScript | `npm run typecheck` | `frontend` `tsc --noEmit` must be clean |
| Unit | `npm test` | Offline FakeLLM / domain tests |
| Unit (parallel) | `npm run test:workers -- --workers=5` | Same offline suite via pytest-xdist |
| E2E | `npm run test:e2e` | Live IMBA SEAT flow + LLM-as-judge; streams to console; ≤180s |
| Live UI | terminal + `http://localhost:5100` | No Next Build Error / overlay; page renders |

If any gate fails, fix the code and re-run. Do not hand over with red TSC, lint, or a broken localhost page.

When handing over after a focused change: run **only the affected tests** (file or node id), not the entire suite, unless the change is cross-cutting.

## Project agents

| Agent | Role |
|-------|------|
| `architect` | Spec Kit / architecture / contracts; reconcile with `PROJECT_BRIEF.md` |
| `backend-engineer` | FastAPI, domain, LLM boundary, tests |
| `frontend-engineer` | Next.js + assistant-ui demo |
| `verifier` | Read-only acceptance verification |

When delegating, pass active spec/plan/tasks paths and relevant task IDs.

## Architecture invariants

The Strands Agents SDK may own turn sequencing (tool choice). Readiness, reduce,
validation, and the one-repair budget remain deterministic Python tools/hooks.

The canonical product state is a typed ProductBrief.

The extractor returns deltas.

The reducer owns state mutation.

The readiness gate is deterministic.

Confirm before generation when the gate becomes ready via fact fill (not on every READY turn that already requested generation).

Objective validation is deterministic.

There is exactly one automatic repair attempt.

Explicit corrections overwrite immediately and preserve history.

Ambiguous contradictions become conflicted and require clarification.

Vague data is not converted into fabricated precise facts.

The generator receives normalized brief state rather than the raw conversation whenever possible.

## Testing

Core logic must be testable without network access.

Use FakeLLMClient or mocks for orchestrator tests.

Tests must verify LLM call counts for the repair flow.

## Frontend lint + typecheck gate

Frontend TypeScript under `frontend/` MUST pass:

- root `npm run lint`
- root `npm run typecheck`

Rules come from `eslint-rules/` (copied from tilemap): `local/no-magic-string`,
`local/max-lines-strict`, `local/complexity-strict`, `local/no-repeated-array-filter`,
plus no `any` and no type assertions (`as const` only).

Cursor stop hook `.cursor/hooks/eslint-frontend-on-stop.sh` re-runs lint **and** `npm run typecheck`. Still run `npm run quality` before handover.

Do not disable `local/*` rules to make the gate pass.

## Scope

This is a 6 to 8 hour take-home prototype.

Prefer simple code over speculative abstractions.

Do not add a database, auth, RAG, multi-agent swarms, background jobs, or production infrastructure unless every required acceptance criterion is already complete. A single Strands Agents SDK agent with deterministic domain tools is allowed as the turn harness.

Do not spend time on visual polish before the deterministic core, tests, and difficult-user demos pass.
