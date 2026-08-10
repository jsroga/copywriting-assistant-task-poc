# Data Model: AI-Powered E-Commerce Copywriting Assistant

**Date**: 2026-08-09  
**Feature**: `001-ecommerce-copywriting-assistant`

## Enums

### FieldStatus
- `missing` | `vague` | `confirmed` | `conflicted`

### Intent
- `provide_info` | `correct_info` | `request_generation` | `refine_output` | `meta_instruction` | `off_topic`

### GateStatus
- `needs_info` | `needs_clarification` | `ready`

### ViolationCode
- `missing_price` | `description_length` | `email_length` | `missing_cta` | `subject_too_long` | `feature_coverage` | `placeholder_text` | `forbidden_claim`

## Entities

### FieldValue
| Field | Type | Notes |
|-------|------|-------|
| value | `str \| list[str] \| null` | Normalized usable value when confirmed |
| raw_text | `str \| null` | Preserved especially for vague inputs |
| status | FieldStatus | Default `missing` |
| updated_at_turn | `int \| null` | Last mutating turn |
| history | `list[str \| list[str]]` | Prior values after corrections |

### ConflictRecord
| Field | Type | Notes |
|-------|------|-------|
| field | str | Brief field name |
| old_value | `str \| list[str] \| null` | Prior confirmed value |
| new_value | `str \| list[str] \| null` | Conflicting incoming value |
| turn | int | Turn when conflict detected |
| resolved | bool | Default false |

### ProductBrief
Required fields (as FieldValue): `product_name`, `key_features`, `target_audience`, `tone`, `price`  
Optional fields (as FieldValue): `category`, `brand_name`  
Also: `assumptions: list[str]`, `conflicts: list[ConflictRecord]`, `version: int`

**Usable field rule**: status MUST be `confirmed`. For `key_features`, confirmed list MUST contain ≥ `MIN_KEY_FEATURES` (1) meaningful items (trim; length ≥ 3; ≥1 alphanumeric — see `meaningful_features` in `gate.py`).

### FieldUpdate (extraction delta item)
| Field | Type | Notes |
|-------|------|-------|
| field | literal field name | One of the seven brief fields |
| value | `str \| list[str] \| null` | Extracted candidate |
| raw_text | `str \| null` | Source snippet |
| status | `confirmed \| vague` | Extractor may not emit conflicted |

### ExtractionResult
- `intent: Intent`
- `updates: list[FieldUpdate]`
- `off_schema_requests: list[str]`

### GateDecision
- `status: GateStatus`
- `fields: list[str]`
- `next_field: str \| null`

### MarketingEmail / GeneratedCopy
- Email: `subject`, `body`, `cta`
- Copy: `product_description`, `marketing_email`

### Violation
- `code: ViolationCode`
- `message: str`
- `artifact: description \| email \| both`

### ChatMessage
- `role: user \| assistant`
- `content: str`
- `turn: int`

### Session
- `id: str`
- `brief: ProductBrief`
- `messages: list[ChatMessage]`
- `turn_number: int`
- `last_copy: GeneratedCopy \| null`
- `last_validation: ValidationResult \| null`
- `clarified_vague_optionals: set[str]`
- `optional_fields_prompted: set[str]` (ask optional category/brand at most once)
- `awaiting_generation_confirmation: bool`
- Persistence: local JSON via `FileSessionStore` (`backend/.data/sessions/`)

### ValidationResult
- `repaired: bool`
- `passed: bool`
- `violations: list[Violation]`
- `pre_repair_violations: list[Violation]` (optional evidence)

## Reducer rules (state transitions)

1. **Missing → write**: set value/status/raw_text; bump version.
2. **Same confirmed value**: keep value; update metadata only if useful.
3. **Explicit correction** (`CORRECT_INFO` + changed value): append old to history; write new; status `confirmed`; do not create unresolved conflict; bump version.
4. **Ambiguous contradiction** (confirmed exists + non-correction different confirmed): add ConflictRecord; status `conflicted`; not usable.
5. **Vague**: preserve `raw_text`; status `vague`; do not fabricate concrete value.
6. **Conflict resolution**: user selects one value → confirmed; mark ConflictRecord resolved; bump version.

## Gate evaluation order

1. Unresolved relevant conflicts → `needs_clarification`
2. Missing/unusable required fields → `needs_info`
3. User-supplied vague optional fields still deserving one clarification → `needs_clarification`
4. Else → `ready`

**QUESTION_PRIORITY**: product_name → key_features → target_audience → tone → price → category → brand_name

## Validation rules

1. Confirmed exact price must appear in description and email body as a **whole token** (e.g. `$49` does not match `$499`).
2. Description word count 60–200.
3. Email body word count 80–250.
4. CTA non-empty.
5. Subject non-empty and ≤60 characters.
6. ≥70% of normalized key features covered in description.
7. Reject placeholders: `[TODO]`, `{{product_name}}`, `Lorem ipsum` (case-insensitive where sensible).
8. ForbiddenClaims: `FDA approved`, `clinically proven`, `guaranteed results`, `#1` when unsupported by brief.
