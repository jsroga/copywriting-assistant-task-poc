# Online validation call — talk track & Q&A

Use this during a live walkthrough / interview for the e-commerce copywriting assistant take-home.

**They are evaluating:** uncertainty & edge cases, architectural clarity, LLM vs deterministic separation (testability), trade-offs under a 6–8h budget.  
**They are not evaluating:** UI polish, feature count, prompt cleverness alone, production-grade architecture.

---

## 1. Opening script (~90–120 seconds)

> Thanks for the time. I’ll keep this focused on the problem you care about: making an LLM useful without letting it own control flow or invent facts.
>
> The product is a conversational copywriting assistant. The user chats about a product; we continuously extract structured deltas into a typed **ProductBrief**. A **deterministic readiness gate** decides whether to ask another question, ask for confirmation, or generate. Generation produces a product description and a marketing email, then **rule-based validation** runs. If validation fails, we attempt **exactly one** automatic repair — then we either show the result or surface failure.
>
> Important design choice: the LLM only does extraction, generation, and repair. The reducer, gate, validators, and repair budget are plain Python and covered by unit tests with a **FakeLLMClient**, so the core logic is demonstrable without trusting model creativity.
>
> I’ll show a happy path, then the three difficult-user scenarios: contradiction, prompt injection, and vague price. Happy to dive into any trade-off after that.

---

## 2. Demo order (what to click / say)

1. **Happy path (2–3 min)**  
   - Paste a product with name, at least one feature, audience, tone.  
   - Answer the price question (price is required), then optional prompts (category / brand) — or say **generate the description** to skip the remaining optionals outright.  
   - When you hear *“Fields are ready to generate description, please confirm.”* → say **confirm**.  
   - If a marketplace title packs attributes into one line, the extractor should lift size/finish/material into **Key features** on the first turn; the follow-up is only *“What features should customers care about most?”* when that list is still empty (the gate needs ≥1 meaningful feature — the old “two or three” wording is gone).  
   - Point at: Product Brief updating live (all fields visible including empty ones, each tagged **Required** or **Optional** so the gate’s demands are legible), description **and** email body streaming token-by-token into their panel sections, validation badge flipping to green PASS / red FAILED. On failure it lists each problem in plain language (“Some of your key features are not mentioned”) with the exact rule detail underneath — no violation codes in the user’s face.  
   - Worth narrating the split: the panel is the **draft** (tokens land there as they arrive); the **chat** only receives copy once validation passes. Say it out loud — it’s the answer to “doesn’t streaming let unvalidated text reach the user?” before they ask.  
   - The brief panel toggles with **Hide brief / Show brief** if you want the chat full-width.  
   - **Do not refresh mid-demo** — a page refresh deliberately starts a brand-new session (product requirement), so the brief resets.

2. **Correction (30 sec)**  
   - After copy exists: *“Actually, change the price to …”*  
   - Show brief history + regenerated copy reflecting the new price.

3. **Difficult scenarios (point at `demos/` if time is short)**  
   - Contradiction → conflicted field, clarification before generate.  
   - Injection → contained; brief not corrupted.  
   - Vague (“cheap”) → stays vague / assumption; no fabricated `$X`.

4. **Close the demo**  
   > That’s the loop: extract → reduce → gate → (confirm) → generate → validate → one repair. Happy to take questions on architecture or what I’d do with more time.

---

## 3. Short architecture line (if they ask “how does it work?”)

> User message → structured **extract** (delta) → **reducer** merges into ProductBrief → **gate** asks / confirms / generates → **validators** → optional **repair once**. UI is a thin client over that contract. Sessions are local JSON files so a backend reload (`uvicorn --reload`) doesn’t wipe state mid-conversation — pragmatic for a prototype, not a database. A **browser refresh** intentionally starts a new session.

### Code map (if they ask “walk me through the repo”)

- `backend/app/domain/` — the deterministic core: `models.py` (typed ProductBrief, field statuses, violations), `reducer.py` (pure delta merge; an exhaustive `TRANSITIONS` table decides correction vs contradiction vs ignore), `gate.py` (readiness decision), `questions.py` (next question).
- `backend/app/llm/` — the LLM boundary: `base.py` (Protocol), `openai_client.py` (OpenAI/OpenRouter structured outputs + token streaming, prompts in `prompts/`), `fake_client.py` (scriptable test double with call counters).
- `backend/app/orchestration/` — `engine.py` (the turn decision loop: extract → reduce → gate → ask, confirm, or hand off), `generation.py` (`CopyPipeline`: generate → validate → one repair → deliver, emitted as SSE events), `messages.py` (canned assistant messages + affirmative/decline regexes), `responses.py` (wire contract), `session_effects.py` (optional-field bookkeeping).
- `backend/app/validation/` — pure rule functions (`rules.py`) composed in `base.py`.
- `backend/app/main.py` + `store.py` — FastAPI endpoints (JSON + SSE stream) and the file-backed session store.
- `frontend/lib/` — `chat-runtime.tsx` (assistant-ui external store + session context), `chat-api.ts` (SSE parsing), `chat-session.ts`/`types.ts` (contract types), `sanitize-html.ts` (DOMPurify).
- `frontend/components/` — `Chat.tsx` (thread; delivers the validated description plus the marketing email as sanitized HTML, nothing unvalidated), `ProductBriefPanel.tsx` (always-visible brief fields with Required/Optional tags), `ValidationBadge.tsx` (pass/fail, failure details, and live validating/retrying state), `CopyStreamSections.tsx` (the streaming draft region for description/email).
- `backend/tests/` — offline suite (FakeLLM), incl. `test_acceptance_criteria.py` (injection, structured extraction, editable context, difficult users, deterministic validation, mocked-LLM decoupling), `test_repair_flow.py` (repair budget + the two failed-validation paths), `test_domain_contracts.py` (structural guards: field-list partitions, reducer table exhaustiveness, frontend/backend field agreement) and `test_stream_early_status.py`; `tests/test_live_e2e_imba_seat.py` is the live e2e with an LLM judge (≤180s budget).

---

## 4. Ten likely interview questions — with answers

### Q1. Why doesn’t the LLM decide when to generate?

**A:** Because “enough information” is a product rule, not a creative judgment. If the model owns that, you get silent early generation, skipped clarifications, and untestable behavior. We use a deterministic gate over field statuses (`missing` / `vague` / `confirmed` / `conflicted`). The LLM proposes deltas; the system decides the next move. That’s what you can unit-test with a fake LLM.

Two details worth calling out, both deliberate: `status: confirmed` and “usable by the gate” are separate ideas — `key_features` additionally needs at least one *meaningful* item (≥2 characters after normalization), so a confirmed-but-empty list still blocks. And optional fields (`category`, `brand_name`) get exactly one prompt, but an explicit “generate the description” skips whichever are still empty and records the skip as an assumption — the gate should never hold the user hostage over a field the product marked optional.

If they notice the original brief asked for **two** key features: that was the rule at first, and real input killed it. A single-line product title like *“Tornister szkolny plecak dla chłopca piłka nożna”* legitimately yields one distinguishing feature — the football theme — because the rest of the title is already the name, category, and audience. The gate then re-asked the same question forever while the panel cheerfully showed “Key features: Confirmed”. The minimum is now one (`MIN_KEY_FEATURES` in `gate.py`), the deviation is recorded in `spec.md`, and the honest lesson is that the threshold was guessing at how much information a title carries.

### Q2. How do you keep the brief correct when the user changes their mind?

**A:** Corrections are an explicit intent path in the reducer. Confirmed values are overwritten, previous values go into field history, conflicts resolve. The UI always shows the latest ProductBrief; generation (when it runs) reads that normalized state, not the raw chat transcript. So “change the price to $199” updates source of truth first, then copy.

Worth opening `reducer.py` if they want the mechanism: the policy is a `TRANSITIONS` table keyed by `(status the extractor proposes, status already on record)`, and each of the eight cells is a named rule — `_accept`, `_vague_over_confirmed`, `_replace_confirmed`, `_resolve_conflicted`, `_ignore`. It started as a nested if/elif chain, which hid both a duplicated branch and the fact that nobody could tell at a glance whether every combination was handled. A test asserts the table is exhaustive over both enums, so “what happens when vague text hits a conflicted field?” is a lookup rather than a code-reading exercise.

### Q3. What happens with contradictory information?

**A:** If the user restates a different value without clear correction language, we don’t silently pick a side. The field becomes `conflicted`, we store both sides, and the gate blocks generation until they choose. That’s intentional: ambiguity should force clarification, not a coin flip inside a prompt.

### Q4. How do you handle prompt injection?

**A:** Extraction classifies hostile turns as `meta_instruction`. The orchestrator returns a containment message and continues asking product questions. We don’t apply junk updates that would rewrite the brief from the attack text. The model is never the policy engine for “ignore previous instructions.”

### Q5. What about vague inputs like “it’s cheap”?

**A:** Vague stays vague: we keep `raw_text`, leave precise `value` unset, and don’t invent “$19.99”. We may ask once for precision; if they decline, we record an assumption and can still generate without fabricating a price. Validation then only requires the price string when a confirmed exact price exists.

### Q6. Why rule-based validation instead of LLM-as-a-judge?

**A:** Under a short time budget, deterministic checks are cheaper, stable, and easy to test: length bounds, CTA present, subject length, confirmed price present, feature coverage, placeholder / high-risk claim patterns. An LLM judge would need calibration and still wouldn’t prove the repair budget. With more time I’d add a narrow factual-consistency judge *on top*, not instead of rules. Each rule returns a typed `Violation` (code, message, artifact); the code drives the plain-language headline in the UI, so the same structured result serves both the repair prompt and the human reader.

Good story if they ask whether deterministic means correct: a valid email once failed with “Unsupported claim detected: #1”, and there was no `#1` anywhere in the copy. The claim scanner was substring-matching the raw email HTML, and the CTA button’s inline style contained `background-color:#1a7a3c`. Deterministic rules are only as good as the text you feed them — validators now scan the **visible** copy (`strip_html` on the email body), with a regression test pinning both halves: hex colours don’t trip it, a real “#1” still does.

The follow-up worth volunteering: fixing only the rule that broke would have left the placeholder scanner reading raw markup and exposed to the identical bug. Both text rules now share one `visible_text(output)` helper, so “what the reader sees” is defined once instead of being re-derived per rule. That is the general lesson from the incident — the bug wasn’t the `#1` pattern, it was two rules disagreeing about their input.

### Q7. Why only one repair attempt?

**A:** Bounds latency and cost, and forces an honest failure mode. Infinite repair loops hide systemic prompt/schema bugs and make demos flaky. Tests assert `generate_calls == 1` and `repair_calls == 1` on the failure path. If repair still fails, we show the output with a clear validation-failed state rather than pretending success.

The budget is structural rather than a counter: the whole pipeline lives in `CopyPipeline` (`orchestration/generation.py`) as one straight-line method with a single `llm.repair` call, so there is no loop for a future prompt tweak to spend a second attempt in. It’s a good page to open — generate, validate, repair, re-validate, deliver-or-fail reads top to bottom in one ~160-line module, with the success and failure paths sharing the same persist-and-respond helper so they cannot drift apart.

### Q8. Isn’t streaming risky if you validate after generation?

**A:** Yes — tokens are UX, not truth. We emit an early `extracting` SSE frame before the blocking extract call (so the client is never stuck on a silent connection), stream the description token-by-token, then stream the email body the same way, then run validators (and one repair) on the **full** artifacts before treating the turn as success. So streaming doesn’t bypass the quality gate; it only improves perceived latency. Tokens stream into the Product Brief panel as a draft; the chat thread is only handed the copy once validation passes, so the user never reads unvalidated text — and never reads a pre-repair draft that the repair has since changed.

**If they ask about latency** (or you want a debugging story): streaming was on, yet the UI sat silent for ~30 seconds after the `generating` frame before any token appeared. Instrumenting the raw stream explained it — the first chunk arrived at 3.3s, but the first *content* token not until 27.8s, and the gap was full of `reasoning` deltas: 3688 characters of the model thinking against 813 characters of actual copy, all of which we discard. The default model (`moonshotai/kimi-k3`) is a thinking model. Copy generation doesn’t need deliberation, so the two copy streams now pass `reasoning: {enabled: false}`; time-to-first-token went 33.3s → 2.5s with output length unchanged, and the live e2e dropped from 157.8s to 75.3s. Extraction keeps reasoning on — that feeds the deterministic core, where accuracy beats latency, and the early `extracting` frame already tells the client something is happening. The transferable point: “we stream” and “the user sees text quickly” are different claims, and only measurement connects them.

### Q9. Why local JSON sessions instead of pure in-memory?

**A:** Pure in-memory matches the “no DB” spirit, but it failed a real demo reliability need: backend process reload (`uvicorn --reload`) wiped the brief to version 0 mid-conversation. Local gitignored JSON is still zero-ops and not a database — a pragmatic prototype choice. Note the deliberate asymmetry: the backend survives its own reloads, but a **browser refresh starts a new session by design** — the frontend mints a fresh session id on page load, so old briefs are never resumed or merged. I’d call out in the README that production would use a real store with TTLs/auth; for 6–8h, surviving backend reload mattered more than doctrinal purity.

### Q10. What would you improve with more time? What did you deliberately skip?

**A:** Skip (on purpose): auth, multi-tenant DB, RAG, multi-agent frameworks, visual polish, background jobs.  
Improve next: larger eval set of hard dialogues, semantic feature coverage (not only string checks), better contradiction UX, observability of extract/repair rates, and maybe a second validation layer for factual consistency. I’d also tighten live extraction quality (e.g. capturing price while tone is still missing) with golden transcripts, not by stuffing more control flow into the prompt.

Two known rough edges I’d rather name than have them found: the frontend still keeps its own copy of the required-field list to render the Required/Optional tags — a test pins it against the backend, but the honest fix is shipping the list in the gate payload so the UI renders what it’s told. And the frontend is held to strict ESLint plus `tsc --noEmit` while the backend has no linter or type checker at all; that asymmetry is what let over-long lines and a duplicated branch survive in the reducer until I read it closely. Adding `ruff` to the quality gate is a ten-minute job I’d do before adding any new feature.

---

## 5. Sound bites if you get stuck

| Pressure point | Line |
|---|---|
| “Why so much structure?” | “Because evaluation is about uncertainty handling, not chat UI.” |
| “Could this be one big prompt?” | “Yes, and it would be undemoable and untestable under edge cases.” |
| “Is FakeLLM cheating?” | “No — it proves the system around the model: 59 offline tests, incl. call-count assertions on the repair budget and two failure-path tests that pin ordering. A live e2e with an LLM judge covers the provider separately.” |
| “What stops the two halves drifting?” | “Six structural tests. The seven field names exist once as a `Literal`; required/optional must partition them; the reducer table must cover every status pair; and one test parses the frontend constants so a stale UI list fails the suite.” |
| “How do you know a failure is honest?” | “Validation resolves before the chat is handed anything — a test drives the event stream and asserts `generated_copy` is never emitted on a failed turn.” |
| “Production ready?” | “No, and that wasn’t the ask. Prototype with clear failure modes and a ‘more time’ list.” |

---

## 6. Closing script (~20 seconds)

> To summarize: structured deltas into a ProductBrief, deterministic gate and validators, one repair, and demos for contradiction, injection, and vagueness — with the LLM kept at the boundary. Happy to go deeper on any piece of that design.
