# AI-Powered E-Commerce Copywriting Assistant

Conversational take-home prototype: gather product facts into a typed `ProductBrief`, ask deterministic follow-ups, confirm, then generate a validated product description and marketing email with at most one automatic repair. The web UI is a thin demo — interface polish is not the deliverable.

## Architecture

```text
User → Next.js + assistant-ui → FastAPI → Orchestrator
  → LLM extract (delta) → deterministic reducer → readiness gate
    → ask question / ask confirm  OR  stream description → email → validators → (one) repair
```

- **LLM**: structured extraction, description/email generation, and repair only
- **Reducer / gate / validators / repair budget**: deterministic Python (control flow stays outside the LLM)
- **UI**: chat, live Product Brief (all fields, always visible, toggleable panel), token-streamed description and email body (UX addition beyond the minimum), HTML email preview, validation badge with pass/fail details

## Key decisions and trade-offs

### Local JSON session files (not a database)
Benefit: `uvicorn --reload` / process restart no longer wipe a mid-demo brief. Trade-off: slightly beyond pure in-memory; still zero ops (files under `backend/.data/sessions/`, gitignored).

### Deterministic readiness gate
Benefit: testable “enough info?” decision. Required: `product_name`, `key_features` (≥1 meaningful item — trim, length ≥3, ≥1 alphanumeric), `target_audience`, `tone`, `price`. Optional: `category`, `brand_name` — asked once each; explicit “generate” may skip remaining empties (recorded as assumptions). Price is required because it materially changes both outputs (task leaves field choice to the implementer).

### Confirm before generate
Benefit: user can still correct price/brand before spendy generation. Trade-off: one extra turn vs auto-generate.

### Stream description and email tokens, validate after full copy
Benefit: better UX; early SSE frame before extract. Trade-off: validation/repair run only on completed artifacts — tokens are UX, not truth. Confirmed price must appear as a whole token (`$49` ≠ `$499`).

### Browser refresh starts a new session
Benefit: clean demos. Trade-off: accidental reload loses the in-progress brief (backend reloads survive via JSON files).

### One repair maximum
Benefit: bounded cost/latency. Trade-off: second invalid output surfaces as failure.

`feat/strands` explored a Strands Agents harness with the same domain layer; `main` keeps the Python orchestrator.

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
