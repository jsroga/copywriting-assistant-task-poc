# API Contract: Chat Turn

**Base URL** (local): `http://localhost:5001`  
**Style**: Turn-based. Two transports over the same turn semantics — plain JSON (`POST /api/chat/{id}`) and Server-Sent Events (`POST /api/chat/{id}/stream`). The stream carries the same terminal turn payload as its last frame, so both transports are interchangeable for correctness; streaming only improves perceived latency.

## Create / use session

Clients generate a `session_id` (UUID string) and use it for all turns. The first POST creates the session if missing. Sessions are held in memory and mirrored to gitignored JSON under `backend/.data/sessions/` so a backend reload does not wipe a mid-conversation brief. The web client mints a fresh `session_id` on every page load, so a browser refresh deliberately starts a new session.

## POST `/api/chat/{session_id}`

### Request

```json
{
  "message": "Actually, change the price to $199"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| message | string | yes | Latest user utterance |

Response `type` is one of `question`, `ready_for_confirmation`, `generated_copy`, `validation_failed`. `ready_for_confirmation` is returned when the gate reaches READY through fact fill — generation waits for an explicit confirmation (or a `request_generation` intent) rather than firing on the turn that completes the brief.

### Response — gathering (`type: question`)

```json
{
  "type": "question",
  "message": "Who is the main customer for this product?",
  "brief": {},
  "gate": {
    "status": "needs_info",
    "fields": ["target_audience", "tone"],
    "next_field": "target_audience"
  },
  "copy": null,
  "validation": null
}
```

### Response — generated copy (`type: generated_copy`)

```json
{
  "type": "generated_copy",
  "message": "Your copy is ready.",
  "brief": {},
  "gate": {
    "status": "ready",
    "fields": [],
    "next_field": null
  },
  "copy": {
    "product_description": "...",
    "marketing_email": {
      "subject": "...",
      "body": "...",
      "cta": "..."
    }
  },
  "validation": {
    "repaired": false,
    "passed": true,
    "violations": [],
    "pre_repair_violations": []
  }
}
```

### Response — validation failure after one repair (`type: validation_failed`)

```json
{
  "type": "validation_failed",
  "message": "Copy was generated but still failed validation after one repair attempt.",
  "brief": {},
  "gate": {
    "status": "ready",
    "fields": [],
    "next_field": null
  },
  "copy": {
    "product_description": "...",
    "marketing_email": {
      "subject": "...",
      "body": "...",
      "cta": "..."
    }
  },
  "validation": {
    "repaired": true,
    "passed": false,
    "violations": [
      {
        "code": "missing_price",
        "message": "Confirmed price missing from description and email body",
        "artifact": "both"
      }
    ],
    "pre_repair_violations": []
  }
}
```

### Response — meta / off-topic containment (`type: question` or informational)

When intent is `meta_instruction` or `off_topic`, assistant message refuses role override / redirects, returns next product question if not ready, and does not corrupt brief from hostile instruction text. Same envelope; `type` remains `question` (or `generated_copy` if already ready and generation proceeds from prior confirmed state without hostile mutations).

## Brief payload shape (returned every POST)

Each field object:

```json
{
  "value": null,
  "raw_text": null,
  "status": "missing",
  "updated_at_turn": null,
  "history": []
}
```

Plus top-level:

```json
{
  "product_name": {},
  "key_features": {},
  "target_audience": {},
  "tone": {},
  "category": {},
  "price": {},
  "brand_name": {},
  "assumptions": [],
  "conflicts": [],
  "version": 0
}
```

## POST `/api/chat/{session_id}/stream`

Same request body. Responds `text/event-stream` (`Cache-Control: no-cache`, `X-Accel-Buffering: no`). Frames are `event: <name>` + `data: <json>`. The client treats the first terminal frame it sees as the turn result.

| Event | Payload | Notes |
|-------|---------|-------|
| `validation_status` | `{"phase": ...}` | Progress only. `extracting` is emitted **before** the blocking extract call so the connection is never silent. Later phases: `generating`, `building_email`, `validating`, `repairing`, `done`. `repairing` also carries `pre_repair_violations`; `done` carries the final `validation`. |
| `description_delta` | `{"text": "..."}` | Product description tokens |
| `email_delta` | `{"text": "..."}` | Email body tokens |
| `question` / `ready_for_confirmation` / `generated_copy` / `validation_failed` | Full turn envelope (below) | **Terminal** — identical shape to the JSON endpoint |
| `error` | `{"detail": "..."}` | Failure mid-stream; must not leak system prompts |

Ordering guarantee: tokens stream before validation runs, but validators and the single repair always execute on the **complete** artifacts before a terminal frame is emitted. Streamed tokens are presentation, never a validated result.

## GET `/api/session/{session_id}`

Implemented convenience endpoint returning current brief, messages, turn number, last copy/validation, and confirmation state. `404` when the session is unknown.

## Errors

| Status | When |
|--------|------|
| 400 | Empty message |
| 404 | Unknown session on GET (if implemented); POST creates session so usually not needed |
| 500 | Unexpected server/LLM failure; message must not leak hidden system prompts |

## CORS

Enable CORS for local Next.js origin (e.g. `http://localhost:5100`) only as needed for the demo.
