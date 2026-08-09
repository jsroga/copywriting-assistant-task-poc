# Online validation call — talk track & Q&A

Use this for a live walkthrough of the e-commerce copywriting assistant take-home.

**What they evaluate:** uncertainty & edge cases, architectural clarity, LLM vs deterministic separation (testability), trade-offs under a **6–8h** budget.  
**What they do not evaluate:** UI polish, feature count, prompt cleverness alone, production-grade architecture.

**Branches:** `main` = Python `ConversationOrchestrator` owns turn sequencing. `feat/strands` = Strands Agents SDK harness (tools + hooks) with the **same** domain/validators/`LLMClient`. Defend both; the product contract is identical.

---

## 1. Opening script (~90–120 seconds)

> Thanks for the time. I’ll keep this focused on what you actually evaluate: a reliable system *around* an LLM under a short time budget — not prompt cleverness or UI polish.
>
> The assistant chats about a product, continuously extracts structured **deltas** into a typed **ProductBrief**, and uses an **explicit readiness gate** (not a hidden “do we have enough?” prompt) to ask, confirm, or generate. It produces a product description and marketing email, runs **rule-based validation**, and allows **exactly one** automatic repair.
>
> The LLM only does extract / generate / repair behind `LLMClient`. Reducer, gate, validators, and the repair budget are plain Python, covered by offline tests with **FakeLLMClient**. I’ll show a happy path, then contradiction, prompt injection, and vague price — then I’m happy to walk any trade-off in the decision table.

---

## 2. Decision log (defend these)

Each row is a choice you can stand behind: **what**, **why**, **what you rejected**.

### 2.1 Product & control flow (both branches)

| Decision | Choice | Why (defend) | Alternative rejected |
|---|---|---|---|
| Canonical state | Typed `ProductBrief` + field statuses (`missing` / `vague` / `confirmed` / `conflicted`) | Transcript is not source of truth; UI and generator share one schema; statuses make uncertainty visible | Re-read the whole chat each turn; one free-form “summary” blob |
| Extraction shape | **Deltas** (`ExtractionResult`) → pure `reduce_brief` | LLM never rewrites whole brief; corrections/history/conflicts are testable | Full-state rewrite by the model each turn |
| “Enough info?” | Deterministic **gate** over field statuses (+ `MIN_KEY_FEATURES ≥ 1`) | Task requires the decision to be **explicit**, not buried in one big prompt; FakeLLM can assert ask vs generate | Model decides readiness via free-form intent alone |
| Required vs optional | Required: name, features, audience, tone, **price**. Optional: category, brand (ask once; explicit “generate” may skip) | Price is needed for honest marketing copy; optionals must not hostage the user | Everything required; or LLM invents category/brand |
| Confirm before generate | When READY via fact-fill → ask confirm; `REQUEST_GENERATION` / affirmative can proceed | Avoid burning tokens on copy the user still wants to edit | Auto-generate on first READY |
| Generation input | Normalized brief (confirmed/vague only), not raw chat | Less prompt injection surface; generator sees facts, not argument | Stuff full transcript into generate prompt |
| Validation | Deterministic rules (price presence, lengths, CTA, subject, feature coverage, placeholders, forbidden claims) | Stable, cheap, unit-testable; repair gets structured `Violation`s | LLM-as-judge as the only gate |
| Repair budget | **Exactly one** automatic repair, then fail visibly | Bounds cost/latency; forces honest failure; FakeLLM asserts `repair_calls == 1` | Unbounded retry loop; silent “best effort” |
| Vague data | Keep `raw_text`, no fabricated precise `$X` | Task rewards handling uncertainty, not inventing facts | Guess `$19.99` from “cheap” |
| Contradiction | Ambiguous restatement → `conflicted` + clarify; explicit correction → overwrite + history | Don’t coin-flip inside a prompt | Always take latest utterance silently |
| Prompt injection | Intent `meta_instruction` + containment; don’t apply hostile deltas | Model is not the policy engine | Trust system prompt alone |
| Model | OpenRouter + **`moonshotai/kimi-k3`** (override via `OPENAI_MODEL`) | One provider path; thinking model for extract accuracy; disable reasoning on **copy streams** for TTFT | Hard-code Bedrock/OpenAI-only; leave reasoning on for streams |

### 2.2 Turn harness — `main` vs `feat/strands`

| Decision | `main` | `feat/strands` | Why / trade-off |
|---|---|---|---|
| Who sequences the turn? | `ConversationOrchestrator` + `CopyPipeline` (straight-line Python) | Strands `Agent` + `@tool`s; **deterministic policy + hooks** choose/enforce next tool | Both keep readiness/repair **out of free-form prompts**. Strands makes the tool surface explicit for an agent-SDK story; Python is simpler to read top-to-bottom |
| Where does repair budget live? | Structural: one `llm.repair` in `CopyPipeline` | Structural: `repair_copy` tool + `repair_used` / hook cancel | Same invariant; different packaging |
| Offline tests | FakeLLM through orchestrator | FakeLLM through Strands tools (direct tool calls; no model tool-choice) | FakeLLM proves **system around** the model on both branches |
| Live model tool-choice | N/A | Default = policy-driven tool sequence; optional `STRANDS_AGENT_LOOP=1` for `stream_async` | Full model-driven tool choice is flaky for e2e ≤180s; policy + hooks still use Strands as harness |
| Spec / constitution | “LLM must not own control flow” | Amended: Strands may sequence **tools**; reduce/gate/validate/repair stay deterministic tools/hooks | Explicit Spec Kit reconciliation — not silent drift |

### 2.3 Transport, UX, prototype ops (both)

| Decision | Choice | Why | Alternative rejected |
|---|---|---|---|
| API | FastAPI JSON + **SSE** (`extracting` early, then deltas / phases / terminal) | Early frame + token streaming = perceived latency; contract stays simple | Wait for full turn JSON only; WebSockets |
| Stream vs truth | Tokens → draft panels; chat gets copy only after validation pass | Answers “doesn’t streaming show unvalidated text?” | Stream final chat message mid-token |
| Mid-tool SSE flush (`feat/strands`) | Run tools on a worker thread; drain event queue as emits happen | Without this, UI sits silent until `generate_copy` returns | Buffer all deltas until tool exit |
| Thinking model on copy | `reasoning: {enabled: false}` on description/email streams | Measured: TTFT ~33s → ~2.5s; extract keeps reasoning | Leave reasoning on for everything |
| Sessions | Gitignored local JSON files | Survive `uvicorn --reload` mid-demo; still no DB | Pure in-memory (reload wipes brief) |
| Browser refresh | **New session** (fresh id) | Clean demos; never resume/merge old ProductBrief | Resume last brief from localStorage |
| UI stack | Next.js + assistant-ui, thin client | Interface “not important”; spend hours on domain | Heavy design system / polish |
| Scope skips | No auth, multi-tenant DB, RAG, multi-agent swarms, background jobs | Matches task + 6–8h budget; write “more time” instead of burning hours | Pretend production platform |

### 2.4 Testing strategy (both)

| Decision | Choice | Why | Alternative rejected |
|---|---|---|---|
| Offline suite | FakeLLM + call counters; gate/reducer/validators unit tests | Proves extraction/validation/retry **decoupled** from model creativity (task requirement) | Only live API tests |
| Live e2e | IMBA SEAT flow + LLM judge, hard **180s** | Catches provider/prompt regressions; timeout = performance fail, not “raise the limit” | No live proof; inflate timeout |
| Structural guards | Field partitions, reducer transition table exhaustiveness, FE/BE field agreement tests | Stops silent drift between UI labels and gate | Hope code review catches it |

---

## 3. Demo order (what to click / say)

1. **Happy path (2–3 min)**  
   - Product with name, ≥1 feature, audience, tone.  
   - Answer **price** (required). Optionals once — or say **generate the description** to skip remaining optionals.  
   - On *“Fields are ready… please confirm.”* → **confirm**.  
   - Point at: live Product Brief (all fields, Required/Optional), description **and** email streaming into panels, validation PASS/FAIL with plain-language failures.  
   - Narrate: panel = **draft** tokens; chat receives copy only after validation.  
   - **Do not refresh** mid-demo — refresh = new session by design.

2. **Correction (30 sec)** — *“Actually, change the price to …”* → brief history + regen path.

3. **Difficult scenarios** (`demos/` if short on time)  
   - Contradiction → `conflicted` + clarify.  
   - Injection → contained; brief intact.  
   - Vague (“cheap”) → stays vague; no fabricated price.

4. **Close**  
   > Extract → reduce → gate → (confirm) → generate → validate → one repair. Happy to take architecture questions.

---

## 4. Short architecture lines

### `main`

> User message → **extract** (delta) → **reducer** → **gate** → ask / confirm / **CopyPipeline** (stream → validate → one repair). UI is a thin client. Sessions = local JSON (backend reload safe); browser refresh = new session.

### `feat/strands`

> Same domain and `LLMClient`. Turn harness is a Strands agent with tools (`ingest_user_turn`, `ask_clarifying_question`, `request_generation_confirmation`, `generate_copy`, `repair_copy`). Deterministic **policy + hooks** enforce next tool and the one-repair budget. SSE bridge flushes status/deltas **while** tools run.

### Code map (both)

| Area | Path | Role |
|---|---|---|
| Domain | `backend/app/domain/` | models, reducer, gate, questions |
| LLM boundary | `backend/app/llm/` | Protocol, OpenAI/OpenRouter client (Kimi), FakeLLM, prompts |
| Validation | `backend/app/validation/` | Deterministic rules |
| `main` harness | `backend/app/orchestration/` | engine + CopyPipeline |
| `feat/strands` harness | `backend/app/strands_runtime/` | tools, policy, hooks, bridge |
| API / store | `backend/app/main.py`, `store.py` | FastAPI + SSE + file sessions |
| UI | `frontend/` | chat, brief panel, stream sections, validation badge |
| Proof | `backend/tests/`, `demos/` | FakeLLM suite, live e2e, difficult-user transcripts |

---

## 5. Likely questions — answers tied to the task

### Q1. How is “enough information” decided? (task §1)

**A:** Explicitly in code — `evaluate_readiness` over field statuses — not inside one giant prompt. The extractor may classify intent; it does **not** authorize generation. On `feat/strands`, the gate still runs inside `ingest_user_turn`; hooks refuse `generate_copy` when policy says otherwise.

### Q2. Editable context? (task §2)

**A:** Reducer `TRANSITIONS` table: explicit correction overwrites + history; ambiguous contradiction → `conflicted`. Generation reads normalized brief, not the raw transcript.

### Q3–Q5. Difficult users? (task §3)

- **Contradiction:** conflicted + clarify; demos in `demos/`.  
- **Injection:** `meta_instruction` containment; no hostile brief writes.  
- **Vague:** status `vague` / assumption; never invent exact price.

### Q6. Why rule-based validation, not only LLM-as-judge? (task §4)

**A:** Rules are stable, offline-testable, and feed repair structured violations. Judge is great *on top* (we use one in live e2e); it is a poor sole gate under 6–8h. Visible-text vs raw HTML lesson: scanners must see what the user sees (`strip_html`), or CSS hex codes false-positive as “#1”.

### Q7. Why one repair? (task §4)

**A:** Task asks for one automatic correction. We made it **structural** (one call site / one tool), not a soft counter a prompt can burn twice. Failures surface as `validation_failed`.

### Q8. Are core tests independent of the model? (task §5)

**A:** Yes — FakeLLM queues/fns + call counters for extract/generate/repair. Acceptance and repair-flow tests never need a network. Live e2e is separate proof of the provider path (Kimi via OpenRouter).

### Q9. Streaming vs validation?

**A:** Tokens are UX. Early `extracting` frame; stream description/email; validate full artifacts; chat only after pass. On `feat/strands`, mid-tool flush so confirm→generate is not a silent wait.

### Q10. What did you skip / what with more time?

**Skip:** auth, DB, RAG, multi-agent swarms, visual polish, background jobs.  
**Next:** semantic feature coverage, richer contradiction UX, factual-consistency judge layer, larger hard-dialogue eval set, observability, `ruff` on backend, ship required/optional lists in the gate payload so the UI does not duplicate them.

---

## 6. Sound bites

| Pressure | Line |
|---|---|
| “Why so much structure?” | “You’re evaluating uncertainty handling and testable architecture, not chat UI.” |
| “One big prompt?” | “Allowed by freedom of choice — and it would fail your ‘show how readiness is decided’ and FakeLLM criteria.” |
| “Is FakeLLM cheating?” | “It proves the system around the model: offline call-count and gate tests. Live e2e + judge covers the provider.” |
| “Why Strands if policy still decides?” | “Same product invariants; tools/hooks make the control surface explicit. Optional agent loop exists; default path keeps e2e ≤180s reliable.” |
| “Production ready?” | “No — and that wasn’t the ask. Prototype with clear failure modes and a written ‘more time’ list.” |

---

## 7. Closing (~20 seconds)

> Structured deltas into a ProductBrief, explicit gate and validators, one repair, demos for contradiction / injection / vagueness, and the LLM kept behind a mockable boundary — on `main` as a Python orchestrator, on `feat/strands` as a Strands tool harness. Happy to go deeper on any row of the decision table.
