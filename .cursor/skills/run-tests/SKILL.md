---
name: run-tests
description: Run this project's tests (offline unit, parallel workers, live integration, live e2e) and the lint/typecheck gates. Use whenever tests must be run, a test fails or times out, or before handing work over.
---

# Running tests

## The rule

**ALWAYS SHOW FULL OUTPUT, NEVER GREP, THEN FIX IT.**

- Never pipe test commands through `grep`, `rg`, `tail`, `head`, `sed`, or `awk`.
- Never add `-q`-style filtering on top of what the script already does.
- Run the command bare, read the whole output, then fix what it tells you.
- Filtering output hides the failing assertion, the traceback, and the slow phase — the three things needed to fix anything.

Large output is fine: it is captured to the terminal file and can be read in full.

## Commands

Run all from the repo root.

| Command | What it runs | Needs a key |
|---------|--------------|-------------|
| `npm test` | Offline unit tests (FakeLLM, no network) | No |
| `npm run test:workers -- 5` | Same offline suite across 5 workers (pytest-xdist) | No |
| `npm run test:integration` | Live provider smoke tests | Yes |
| `npm run test:e2e` | Live IMBA SEAT flow + LLM judge, hard 180s budget | Yes |
| `npm run lint` | Frontend ESLint incl. `local/*` rules | No |
| `npm run typecheck` | `frontend` `tsc --noEmit` | No |
| `npm run quality` | lint + typecheck + offline unit tests | No |

Target a single file or node id when the change is focused:

```bash
cd backend && uv run pytest tests/test_reducer.py
cd backend && uv run pytest tests/test_orchestrator.py::test_ready_brief_generates
npm run test:workers -- 5 tests/test_validators.py
```

## Which tests to run

- Focused change → only the affected test files, plus `lint` and `typecheck`.
- Change to chat / orchestration / stream / validation / confirm flow → add `npm run test:e2e`.
- Cross-cutting change → `npm run quality`.
- Run independent commands in parallel; chain only what depends on the previous step.

## When something fails

1. Read the full output. Find the actual assertion or exception, not the summary line.
2. Fix the root cause in the code.
3. Re-run the same command bare and read the full output again.
4. Never skip, xfail, comment out, weaken an assertion, or delete a test to get green.

## When e2e timeses out

The 180s timeout is a performance budget, not a flake. A timeout is a failure.

1. Do **not** raise the timeout.
2. Re-run with the console stream visible and find which phase stalls: `cd backend && uv run pytest -m integration tests/test_live_e2e_imba_seat.py -s --timeout=180`
3. Count LLM round-trips for the run. Each conversation turn costs one extract call; generation costs a description stream, an email body stream, and an email meta call; a repair adds one more; the judge adds one.
4. Reduce work: fewer elicitation turns, fewer optional-field loops, tighter prompts, no redundant calls.
5. If the provider itself is slow, say so explicitly with the measured evidence rather than reporting a pass.
