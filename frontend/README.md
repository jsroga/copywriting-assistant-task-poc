# Frontend — Next.js + assistant-ui

Thin client over the FastAPI chat contract. All product logic (extraction, reducer, readiness gate, validation, repair) lives in `backend/`; this app renders conversation, live `ProductBrief` state, streaming copy, and validation status.

Run everything from the repo root (`npm run dev` starts API `:5001` + UI `:5100`). To run only the UI:

```bash
npm --prefix frontend run dev -- --hostname localhost --port 5100
```

Open [http://localhost:5100](http://localhost:5100). Avoid `:5000` (macOS AirPlay returns HTTP 403).

## Layout

| Path | Role |
|------|------|
| `app/page.tsx` | Header (brief toggle, copy JSON, new conversation) + chat / brief split |
| `app/layout.tsx` | Root layout; applies the Roboto CSS variable from `lib/fonts-wire.ts` |
| `components/Chat.tsx` | assistant-ui thread + composer |
| `components/ProductBriefPanel.tsx` | Always-visible brief fields, assumptions, conflicts |
| `components/ValidationBadge.tsx` | Pass/fail plus plain-language failure details |
| `components/CopyStreamSections.tsx` | Token-streamed description and email body |
| `lib/chat-runtime.tsx` | assistant-ui external store + session context |
| `lib/chat-api.ts` | SSE parsing for the stream endpoint |
| `lib/chat-session.ts`, `lib/types.ts` | Shared contract types |
| `constants/` | All runtime strings, labels, and class bundles |

## Fonts

`next/font` loads Roboto in `lib/fonts-wire.ts`. Loader options **must be literal values in that file** — imported constants break the Next build. `layout.tsx` puts `roboto.variable` on `<body>`, exposing `--font-roboto`, which the `font-roboto` Tailwind utility consumes.

## Gates

Run from the repo root; both must be clean before handover:

```bash
npm run lint       # incl. local/no-magic-string, max-lines, complexity
npm run typecheck  # tsc --noEmit
```

No `any`, no type assertions except `as const`, and no `eslint-disable` for `local/*` rules.
