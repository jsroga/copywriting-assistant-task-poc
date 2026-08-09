# AI-Powered E-Commerce Copywriting Assistant

Conversational take-home prototype: gather product facts into a typed `ProductBrief`, ask deterministic follow-ups, confirm, then generate a validated product description and marketing email with at most one automatic repair.

## Architecture

```text
User → Next.js + assistant-ui → FastAPI → Orchestrator
  → LLM extract (delta) → deterministic reducer → readiness gate
    → ask question / ask confirm  OR  stream description → email → validators → (one) repair
```

- **LLM**: structured extraction, description/email generation, and repair only
- **Reducer / gate / validators / repair budget**: deterministic Python (control flow stays outside the LLM)
- **UI**: chat, live Product Brief (all fields, always visible, toggleable panel), token-streamed description and email body, HTML email preview (in both the brief panel and the delivered chat message), validation badge showing pass/fail plus plain-language failure details, and a live spinner while validating or retrying a failed check

## Key decisions and trade-offs

### Local JSON session files (not a database)
Benefit: `uvicorn --reload` / process restart no longer wipe a mid-demo brief. Trade-off: slightly beyond pure in-memory; still zero ops (files under `backend/.data/sessions/`, gitignored).

### Deterministic readiness gate
Benefit: testable and explainable “enough info?” decision. Trade-off: less flexible for unusual categories. Required: `product_name`, `key_features` (≥1 meaningful item — `MIN_KEY_FEATURES`), `target_audience`, `tone`, `price`. Optional: `category`, `brand_name` — asked once each, and an explicit “generate the description” skips whichever are still empty rather than blocking on them (the skip is recorded as an assumption). The panel labels every field Required or Optional so the gate's demands are visible.

### Confirm before generate
Benefit: user can still correct price/brand before spendy generation. Trade-off: one extra turn vs auto-generate.

### Stream description and email tokens, validate after full copy
Benefit: better UX while writing; an early SSE frame goes out before the blocking extract call so the connection is never silent. Trade-off: validation/repair still run only on the completed description+email (not mid-token) — tokens are UX, not truth.

### Browser refresh starts a new session
Benefit: each demo run is clean and never resumes or merges an earlier brief. Trade-off: an accidental reload loses the in-progress brief (backend reloads, by contrast, survive — see below).

### One repair maximum
Benefit: bounded cost/latency. Trade-off: second invalid output surfaces as failure.

## Difficult scenarios

Transcripts in `demos/transcripts/`; handling notes in `demos/NOTES.md`.

## Run locally

Prereqs: Node 20+, Python 3.12+, [`uv`](https://docs.astral.sh/uv/).

```bash
npm run setup
# .env: OPENROUTER_API_KEY=...  OPENAI_BASE_URL=https://openrouter.ai/api/v1
#       OPENAI_MODEL=moonshotai/kimi-k3
npm run dev   # API :5001 + UI :5100
```

Open [http://localhost:5100](http://localhost:5100). Avoid `:5000` (macOS AirPlay → HTTP 403).

| Script | What |
|--------|------|
| `npm run dev` | Backend + frontend |
| `npm test` | Offline unit tests (FakeLLM) |
| `npm run test:workers -- 5` | Same offline suite across 5 workers (pytest-xdist) |
| `npm run test:integration` | Live OpenRouter smoke |
| `npm run test:e2e` | Live IMBA SEAT flow + LLM judge (hard 180s budget) |
| `npm run lint` / `npm run typecheck` | Frontend ESLint / `tsc --noEmit` |
| `npm run quality` | lint + typecheck + offline tests |
| `npm run build` | Frontend production build |

Without a key (or `USE_FAKE_LLM=1`) the API uses `FakeLLMClient`.

## With more time

Semantic feature coverage, richer contradiction UX, factual consistency judge, evaluation set, observability, auth/rate limits, true multi-tab session sync.
