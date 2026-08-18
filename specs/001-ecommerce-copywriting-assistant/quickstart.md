# Quickstart Validation Guide

**Feature**: `001-ecommerce-copywriting-assistant`  
**Date**: 2026-08-09

## Prerequisites

- Node.js 20+ (or current LTS supporting Next.js scaffold)
- An LLM key for live runs — `OPENROUTER_API_KEY` (preferred, with `OPENAI_BASE_URL`/`OPENAI_MODEL`) or `OPENAI_API_KEY`. Not required for Vitest: the offline suite uses `FakeLLMClient`, and the API falls back to it when no key is present or `USE_FAKE_LLM=1`.

## Setup

```bash
npm run setup   # root deps + frontend deps + backend deps
npm run dev     # API :5001 + UI :5100
```

Open [http://localhost:5100](http://localhost:5100). Avoid `:5000` (macOS AirPlay returns HTTP 403).

## Automated verification

```bash
npm run quality              # lint + typecheck + offline unit tests
npm run test:workers -- 5    # same offline suite across 5 workers
npm run test:e2e             # live flow + LLM judge, hard 180s budget
npm run build                # frontend production build
```

Expected: offline tests pass with no network model calls; ESLint and `tsc --noEmit` clean. A `test:e2e` timeout counts as a performance failure to investigate, not a flake to retry.

## Manual smoke path

1. Open the web UI. The ProductBrief panel already lists every field (empty ones show `—`), each labelled Required or Optional; `Hide brief` collapses it.
2. Chat product facts until required fields are confirmed; watch statuses and version update.
3. When the gate reaches READY the assistant asks for confirmation — reply `confirm` to generate. Asking to generate while only optional fields are empty skips them instead of blocking.
4. Watch the description and then the email body stream token-by-token into their own sections.
5. Confirm the Validation badge shows green PASS / PASS-after-repair, or red FAILED with each problem in plain language plus the rule detail underneath.
6. Correct a price; confirm history retains the old value and regenerated copy uses the new one.
7. Do not refresh mid-demo: a page reload intentionally starts a new session.

## Difficult-user demos

Scenario JSON: `demos/scenarios/`  
Transcripts: `demos/transcripts/`

Validate presence of at least:

- contradiction
- prompt-injection
- vague-input

Optional: correction-after-delivery.

## Contract reference

See [contracts/chat-api.md](./contracts/chat-api.md) and [data-model.md](./data-model.md).
