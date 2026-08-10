# Evaluation Requirements Checklist: AI Copywriting Assistant

**Purpose**: Requirement-quality checklist focused on take-home evaluation criteria (unit tests for English requirements)  
**Created**: 2026-08-09  
**Feature**: [spec.md](../spec.md)  
**Audience**: Spec author / implementer before task execution  
**Depth**: Formal gate before `/speckit-tasks` / implementation

## Structured extraction & state

- [x] CHK001 Spec explicitly defines structured extraction into a typed schema after relevant turns (FR-002)
- [x] CHK002 Spec states extractor returns deltas and application owns merge/canonical state (FR-003, AC-03)
- [x] CHK003 Spec identifies ProductBrief as source of truth vs transcript (Key Entities / FR-003)
- [x] CHK004 Field uncertainty statuses MISSING/VAGUE/CONFIRMED/CONFLICTED are explicit (FR-006)

## Readiness & questions

- [x] CHK005 Deterministic readiness decision shape (`needs_info | needs_clarification | ready`, fields, next_field) is specified (FR-007)
- [x] CHK006 Spec forbids readiness decisions hidden in free-text LLM claims (SC-002 / Edge Cases)
- [x] CHK007 Missing required info triggers concise follow-up (FR-008, FR-004)
- [x] CHK008 Required fields and ≥1 meaningful key feature rule are explicit (FR-004)

## Editable context, corrections, contradictions, vagueness

- [x] CHK009 Explicit correction semantics (overwrite, history, no second confirm) are unambiguous (FR-009)
- [x] CHK010 Ambiguous contradiction semantics (conflicted, both values, ask which) are unambiguous (FR-010)
- [x] CHK011 Spec distinguishes correction vs contradiction (US2)
- [x] CHK012 Vague input must not fabricate precise facts; raw text preserved (FR-011)
- [x] CHK013 Optional vague clarification is bounded (one attempt + assumption) (FR-012)
- [x] CHK014 Session remains editable after delivery (FR-020)

## Prompt injection

- [x] CHK015 Prompt injection expected behavior is containment-oriented (no prompt leak, no purpose change, no state corruption, continue flow) (FR-013)
- [x] CHK016 Spec does not claim unrealistic complete security immunity (Assumptions / FR-013)

## Generation, validation, repair

- [x] CHK017 Product description and marketing email (subject/body/CTA) requirements and length targets are explicit (FR-014, FR-015)
- [x] CHK018 Validation-before-success is required (FR-016)
- [x] CHK019 Objective validation rules include price, lengths, CTA, subject, feature coverage, placeholders, ForbiddenClaims (FR-017)
- [x] CHK020 ForbiddenClaims naming (not NoHallucinatedClaims) is explicit (Edge Cases / FR-017)
- [x] CHK021 Exactly one automatic repair is unambiguous (FR-018)
- [x] CHK022 No second automatic repair on continued failure is unambiguous (FR-019)

## Testing & demos

- [x] CHK023 Mocked/fake LLM testing without network is required (FR-023)
- [x] CHK024 Call-count / bounded retry evidence is required (SC-007 / FR-023)
- [x] CHK025 Three difficult-user demonstrations (contradiction, injection, vague) are required (FR-022)
- [x] CHK026 Live structured state + validation visibility in UI are required (FR-021)
- [x] CHK027 README roughly one page with architecture, trade-offs, future improvements is required (FR-022)

## Scope discipline

- [x] CHK028 Out-of-scope items (auth, DB, RAG, multi-agent, streaming, etc.) are explicit (FR-025)
- [x] CHK029 6–8 hour prototype scope discipline is reflected (Assumptions / FR-025)

## Notes

- All items PASS against `spec.md` + clarifications session 2026-08-09.
- This checklist validates requirement completeness only; implementation tests remain separate.
- Depth/audience fixed by PROJECT_BRIEF §8 — no stakeholder quiz required.
