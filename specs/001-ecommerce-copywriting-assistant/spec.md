# Feature Specification: AI-Powered E-Commerce Copywriting Assistant

**Feature Branch**: `001-ecommerce-copywriting-assistant`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "PROJECT_BRIEF.md §3 — conversational copywriting assistant that extracts structured product facts, asks follow-ups, handles corrections/contradictions/vagueness, generates validated product description + marketing email with one repair, and exposes live structured state in a simple web UI."

## Clarifications

### Session 2026-08-09

- Clarification scan completed against PROJECT_BRIEF §3–§4. No critical product-behavior ambiguities remain that require stakeholder choice.
- Q: When readiness becomes ready mid-conversation, should copy generate automatically? → A: Yes — generate both artifacts immediately when the deterministic gate returns ready (unless the turn is only a contained meta/off-topic instruction with no readiness-advancing updates).
- Q: After successful delivery, does a later correction auto-regenerate? → A: Yes — after state reduce + gate ready, regenerate (still subject to validation + one-repair budget per generation operation).
- Q: Should REQUEST_GENERATION while not ready force generation? → A: No — respond with the next deterministic follow-up; readiness remains deterministic.
- Technology choices listed in PROJECT_BRIEF §4 are fixed and deferred to the plan phase (not reopened here).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversational product briefing and copy delivery (Priority: P1)

A store operator chats naturally about a product. The assistant gathers required product information through concise follow-ups, decides when enough information exists, and delivers a product description plus a marketing email with subject, body, and CTA. Generated copy is validated before it is presented as successful output.

**Why this priority**: This is the core take-home value: natural conversation → structured understanding → useful copy.

**Independent Test**: Provide a complete product conversation covering name, at least one feature, audience, tone, and price; observe follow-ups until ready; confirm both artifacts are returned and marked validated.

**Acceptance Scenarios**:

1. **Given** a new session, **When** the user provides partial product facts, **Then** the assistant extracts them into structured state and asks one concise follow-up for the next missing required field.
2. **Given** all required fields are usable, **When** the readiness decision is ready, **Then** the system generates a product description (60–200 words) and a marketing email (subject ≤60 chars, body 80–250 words, non-empty CTA) in one generation operation.
3. **Given** generated copy fails objective validation, **When** repair has not yet been used, **Then** the system performs exactly one automatic repair using the brief, previous output, and exact violations, then re-validates.
4. **Given** repaired copy still fails validation, **When** presenting results, **Then** the system returns a visible validation-failure state and does not attempt another automatic repair.

---

### User Story 2 - Editable context with corrections and contradictions (Priority: P1)

The same operator can correct facts at any time, including after copy was delivered. Explicit corrections update canonical state immediately and retain history. Ambiguous contradictions mark the field conflicted, block readiness, and ask which value to use.

**Why this priority**: Evaluation heavily weights correction vs contradiction semantics and editable context.

**Independent Test**: Set a price, then issue an explicit correction; separately set a size and later contradict it without correction language; verify distinct outcomes.

**Acceptance Scenarios**:

1. **Given** a confirmed price of `$299`, **When** the user says to change the price to `$199`, **Then** canonical price becomes `$199`, `$299` remains in field history, no second confirmation is required, and future generation uses `$199`.
2. **Given** a confirmed value of `750 ml`, **When** the user later says `The bottle is 1 litre` without clear correction intent, **Then** the field becomes conflicted, both values are retained as evidence, readiness stays blocked, and the assistant asks which value to use.
3. **Given** a conflicted required field, **When** the user resolves which value is correct, **Then** the field becomes confirmed with the chosen value and readiness may proceed.

---

### User Story 3 - Vague input and prompt-injection containment (Priority: P2)

The assistant must not invent precise facts from vague language, and must resist role-override attempts while continuing the copywriting flow. Legitimate product facts in a hostile message may still be extracted if safely separable.

**Why this priority**: Demonstrates explicit uncertainty handling and pragmatic containment required by acceptance criteria.

**Independent Test**: Send “It's cheap.” and verify no fabricated numeric price; send an ignore-previous-instructions attack after legitimate context and verify purpose/state remain intact.

**Acceptance Scenarios**:

1. **Given** the user says a product is “cheap”, **When** extraction runs, **Then** the system preserves raw text, marks price as vague, does not invent a number, and may ask one useful clarification for optional vague data.
2. **Given** the user declines precision after one optional clarification, **When** continuing, **Then** the system records a documented assumption and continues without inventing a number (no infinite clarification loop).
3. **Given** legitimate product context exists, **When** the user attempts to override the assistant role or demand hidden prompts, **Then** no hidden prompt is revealed, purpose does not change, product state is not corrupted by the hostile instruction, and the assistant returns to the copywriting flow.

---

### User Story 4 - Live structured state and demo evidence (Priority: P2)

Operators and evaluators can see current structured product brief, field statuses, and generation validation status in a simple web UI. Difficult-user scenarios are documented as readable transcripts.

**Why this priority**: UI polish is secondary, but visible architecture and demo transcripts are required deliverables.

**Independent Test**: Complete a short chat in the UI and confirm the brief panel updates; open the three required transcripts.

**Acceptance Scenarios**:

1. **Given** an active chat session, **When** the user sends a message that updates product facts, **Then** the UI shows updated field values, statuses (Missing/Vague/Conflicted/Confirmed), and brief version.
2. **Given** generation has completed, **When** viewing the session, **Then** the UI shows validation status including whether repair was used and whether validation passed or failed.
3. **Given** the repository deliverables, **When** reviewing demos, **Then** readable transcripts exist for contradiction, prompt injection, and vague input (correction-after-delivery strongly recommended).

---

### Edge Cases

- Explicit correction after successful copy delivery updates state and regenerates using new values without restarting the session.
- Ambiguous contradiction on an optional field still requires clarification before treating that field as usable; required conflicts block readiness.
- Vague optional field: at most one clarification attempt; then assume and continue.
- Message mixes hostile meta-instruction with legitimate product facts: hostile intent is contained; safe product facts may still update state.
- Generation readiness is never inferred from free-text model wording such as “I think we have enough.”
- No meaningful confirmed key feature keeps the session not ready.
- Obvious unfinished placeholders (`[TODO]`, `{{product_name}}`, `Lorem ipsum`) fail validation.
- Unsupported high-risk claims (`FDA approved`, `clinically proven`, `guaranteed results`, `#1`) fail validation when unsupported by the brief (rule name: ForbiddenClaims, not “NoHallucinatedClaims”).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to provide product information over multiple natural-language chat turns in a web UI.
- **FR-002**: After each relevant user turn, the system MUST extract newly supplied product facts into a typed structured delta (not a full replacement of canonical state).
- **FR-003**: Application logic MUST merge extraction deltas into a canonical typed ProductBrief that is the source of truth for product data.
- **FR-004**: Required fields before automatic generation are `product_name`, `key_features` (at least one meaningful item), `target_audience`, `tone`, and `price`.
- **FR-005**: Optional fields `price`, `brand_name`, and `category` MUST be retained when supplied and reflected in generated content when relevant and usable.
- **FR-006**: Field uncertainty MUST be represented with at least statuses Missing, Vague, Confirmed, and Conflicted; only Confirmed fields count as usable for readiness.
- **FR-007**: An explicit, inspectable readiness decision MUST be produced by deterministic application code with status `needs_info | needs_clarification | ready`, affected fields, and `next_field`.
- **FR-008**: When not ready, the assistant MUST ask exactly one concise deterministic follow-up for the next prioritized missing/ambiguous field (or conflict comparison question).
- **FR-009**: Explicit corrections MUST overwrite the canonical value immediately, append the previous value to history, avoid creating an unresolved conflict, and must not require a second confirmation.
- **FR-010**: Ambiguous contradictions against a confirmed value MUST mark the field Conflicted, retain evidence of both values, block readiness until resolved for relevant required conflicts, and ask which value is correct.
- **FR-011**: Vague values MUST preserve raw text, remain Vague, and MUST NOT be converted into fabricated precise facts (especially numeric prices).
- **FR-012**: For optional vague data, the system MUST allow at most one clarification attempt; if the user declines precision, record a documented assumption and continue.
- **FR-013**: Prompt-injection / meta-instruction attempts MUST NOT reveal hidden prompts, change assistant purpose, or corrupt canonical state via the hostile instruction; safely separable product facts MAY still be extracted; flow returns to copywriting.
- **FR-014**: When readiness is ready, the system MUST generate both a product description and a marketing email (subject, body, CTA) in one generation operation.
- **FR-015**: Product description length MUST be 60–200 words; email body 80–250 words; subject non-empty and ≤60 characters; email MUST include a CTA.
- **FR-016**: Generated output MUST be validated before being treated as successful final copy.
- **FR-017**: Validation MUST enforce: confirmed exact price presence in description and email body; length rules; CTA presence; subject rules; ≥70% coverage of normalized key features; rejection of obvious placeholders; ForbiddenClaims blacklist for unsupported high-risk claims.
- **FR-018**: On first validation failure, the system MUST perform exactly one automatic repair that receives brief, previous output, and exact violations; then re-validate.
- **FR-019**: If repaired output still fails, the system MUST return a visible failed-validation state and MUST NOT perform another automatic repair.
- **FR-020**: The session MUST remain editable after copy has been generated.
- **FR-021**: The web UI MUST show chat messages, assistant responses, live ProductBrief values/statuses/version, and generation validation status.
- **FR-022**: The repository MUST include at least three difficult-user transcripts (contradiction, prompt injection, vague input) under demos, plus a root README of roughly one page covering architecture, trade-offs, local setup, and future improvements.
- **FR-023**: Core extraction integration, reducer, readiness gate, validators, retry logic, and orchestration MUST be testable without network model calls via a deterministic fake/mock LLM, including generate/repair call-count assertions.
- **FR-024**: Extractor intent classification MUST NOT decide whether generation is allowed; readiness remains deterministic application logic.
- **FR-025**: Scope MUST exclude authentication, database persistence, RAG/vector DBs, runtime multi-agent frameworks, background jobs, production deployment infrastructure, and token streaming until required acceptance criteria are complete.

### Key Entities

- **ProductBrief**: Canonical product state with required/optional fields, assumptions, conflicts, and version.
- **FieldValue**: Value/raw text/status/history/updated turn for a single brief field.
- **ConflictRecord**: Evidence of an ambiguous contradiction (field, old/new values, turn, resolved flag).
- **ExtractionResult**: Intent plus field update deltas and off-schema requests.
- **GateDecision**: Deterministic readiness status, fields list, and next field.
- **GeneratedCopy**: Product description plus marketing email (subject, body, CTA).
- **Violation**: Structured validation failure with code, message, and artifact scope.
- **Chat Session**: In-memory conversation plus canonical brief and last generation/validation metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete a multi-turn product briefing and receive both copy artifacts without restarting the session.
- **SC-002**: 100% of readiness decisions in the prototype are produced by inspectable deterministic logic (never by opaque free-text model claims of readiness).
- **SC-003**: Explicit corrections update canonical state on the same turn and retain prior values in history in demonstrated scenarios.
- **SC-004**: Ambiguous contradictions produce Conflicted state and a clarification question in the contradiction demo transcript.
- **SC-005**: Vague price language never becomes a fabricated numeric price in the vague-input demo.
- **SC-006**: Prompt-injection demo shows unchanged assistant purpose, no hidden-prompt disclosure, and uncorrupted product state.
- **SC-007**: Invalid first generation triggers exactly one repair attempt; a second failure surfaces as failed validation with no further automatic repair (proven by call-count tests).
- **SC-008**: Objective validation rules for price, lengths, CTA, subject, feature coverage, placeholders, and ForbiddenClaims are enforced before successful final output.
- **SC-009**: Demo UI exposes live structured brief statuses and validation status during a local session.
- **SC-010**: Deliverables include working demo, tests with mocked LLM, ≥3 difficult-user transcripts, Spec Kit artifacts, and a roughly one-page README.

## Assumptions

- Single local operator / evaluator; no multi-user auth or roles.
- English product copy only for the prototype.
- “Meaningful” key features means non-empty items of at least two characters after light normalization (trim/case), at least one confirmed item (`MIN_KEY_FEATURES` in `backend/app/domain/gate.py`). This relaxes PROJECT_BRIEF §3.2 / §5.10 / §11.2, which asked for two — changed on explicit user instruction because real product titles often carry only one distinguishing feature.
- Feature coverage ≥70% uses simple normalized substring/token matching, not semantic embeddings.
- In-memory sessions may be lost on process restart (documented trade-off).
- Optional fourth scenario (correction after delivery) is strongly recommended and included if time allows.
- Stack and API shape are fixed in the technical plan phase and intentionally omitted from this product spec.
- Clarification policy from PROJECT_BRIEF §4: decisions already fixed there are not reopened.
