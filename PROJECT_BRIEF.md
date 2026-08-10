# PROJECT_BRIEF — delivered system

Internal design note for the e-commerce copywriting assistant take-home.
This describes **what was built**, not the pre-implementation wish list.
The graded surface is the one-page `README.md`; Spec Kit under `specs/` is the
implementation contract. Where this brief and the code disagree, the code wins
until the brief is updated.

**Out of scope for evaluation (per assignment):** UI polish, feature count.
**In scope:** uncertainty handling, explicit readiness, LLM vs deterministic
separation, testability with a mocked LLM, trade-offs under a 6–8h budget.

---

## 1. Product shape

Conversational assistant that:

1. Extracts product facts as **deltas** into a typed `ProductBrief`
2. Merges deltas in a deterministic **reducer** (history, corrections, conflicts)
3. Decides readiness with a deterministic **gate**
4. Asks one follow-up (or confirm) when not generating
5. Generates a product description + marketing email
6. Runs deterministic validators; **exactly one** automatic repair on failure

The LLM does extract / generate / repair only. Control flow stays in Python.

---

## 2. Schema and readiness

### Required (gate blocks READY until confirmed and usable)

| Field | Rule |
|-------|------|
| `product_name` | confirmed, non-empty |
| `key_features` | confirmed; ≥ `MIN_KEY_FEATURES` (1) **meaningful** items |
| `target_audience` | confirmed, non-empty |
| `tone` | confirmed, non-empty |
| `price` | confirmed exact price string |

### Optional (asked once; may be skipped)

`category`, `brand_name` — prompted at most once via `optional_fields_prompted`.
An explicit generate request may skip remaining empty optionals (recorded as
assumptions). They do not block READY once prompted or skipped.

### Field statuses

`missing` | `vague` | `confirmed` | `conflicted` — only `confirmed` counts as
usable for readiness. Vague values keep `raw_text`; no fabricated precision.
Explicit correction overwrites + history; ambiguous contradiction → `conflicted`
+ clarification.

### Decisions (defend these)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Price required | In `REQUIRED_FIELDS` | Task leaves required-field choice to the implementer; price materially changes both description and email, and the price-presence validator needs a confirmed exact string. |
| Feature threshold | `MIN_KEY_FEATURES = 1` | One distinguishing confirmed feature is enough for useful copy; forcing two padded the brief with noise. |
| Meaningful feature | After trim: length ≥ 3 and ≥1 alphanumeric char (`meaningful_features` in `gate.py`) | Rejects empty/noise fillers like `"x"` or `"ok"` while staying a single inspectable rule. |
| Session store | Gitignored JSON under `backend/.data/sessions/` (`FileSessionStore`) | Survives `uvicorn --reload` mid-demo without a database. |
| Token streaming | SSE early `extracting` frame + description/email token deltas | **Addition beyond the minimum** — UX only; validation still runs on complete artifacts; chat copy is delivered after pass. |
| Web UI | Next.js + assistant-ui thin client | Required for a working demo; **the interface is not the deliverable**. |
| Strands | Explored on `feat/strands`, **not adopted** on `main` | Same domain/validators/`LLMClient`; harness packaging differed. Delivered path is `ConversationOrchestrator` on `main`. |
| Confirm before generate | READY via fact-fill → ask confirm | Avoid burning generation tokens on copy the user still wants to edit. Explicit `REQUEST_GENERATION` / affirmative proceeds. |
| LLM access | OpenAI-compatible client (OpenRouter); model via `OPENAI_MODEL` | One provider path; FakeLLM when no key / `USE_FAKE_LLM=1`. |
| Browser refresh | New `session_id` | Clean demos; never resume/merge an earlier brief. |

---

## 3. Architecture (as shipped)

```text
User → Next.js + assistant-ui → FastAPI
  → Orchestrator → LLM extract (delta) → reducer → gate
    → ask question / ask confirm
    OR stream description → email → validators → (one) repair
```

| Layer | Location | Role |
|-------|----------|------|
| Domain | `backend/app/domain/` | models, reducer, gate, questions |
| LLM | `backend/app/llm/` | `LLMClient`, OpenAI-compatible client, FakeLLM, prompts |
| Validation | `backend/app/validation/` | Deterministic rules (price token, lengths, CTA, subject, features, placeholders, ForbiddenClaims) |
| Orchestration | `backend/app/orchestration/` | Turn loop + copy pipeline |
| Store | `backend/app/store.py` | File-backed sessions |
| API | `backend/app/main.py` | `POST /api/chat/{id}`, `/stream`, `GET /api/session/{id}` |
| UI | `frontend/` | Chat, live brief panel, stream drafts, validation badge |

**Price presence:** confirmed price must appear in description and email body as a
**whole token** (not a substring), so `$49` does not pass against `$499`.

**Artifacts:** description 60–200 words; email subject ≤60 chars, body 80–250
words, non-empty CTA; ≥70% key-feature coverage; no placeholders; ForbiddenClaims
blacklist when unsupported by the brief.

---

## 4. Scope boundaries

**Included:** working demo UI, FakeLLM unit tests, ≥3 difficult-user transcripts
(`demos/`), roughly one-page README, Spec Kit artifacts.

**Excluded (prototype):** auth, multi-tenant DB, RAG, production deploy, unbounded
repair, treating the LLM as the readiness oracle.

**Explored elsewhere:** Strands Agents turn harness on branch `feat/strands`
(not the `main` deliverable).

---

## 5. Testing

Offline: `npm test` — FakeLLM, no network; gate/reducer/validators/orchestrator
including generate/repair call counts.

Live (optional proof): `npm run test:e2e` — needs API key; hard 180s budget.

---

## 6. Open items for the author

None for the decisions listed above — rationales are stated.
