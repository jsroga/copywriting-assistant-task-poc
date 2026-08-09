import {
  API_BASE_URL,
  CHAT_PATH_PREFIX,
  CHAT_STREAM_SUFFIX,
  HTTP,
  RESPONSE_TYPES,
  SSE_EVENTS,
  SSE_LINE,
  SSE_NEWLINE,
  SSE_PAYLOAD_KEYS,
  SSE_SEPARATOR,
  UI_TEXT,
  VALIDATION_PHASES,
} from '@/constants'
import type { ChatTurnResponse } from './types'
import {
  parseValidationStatus,
  type ValidationStatusEvent,
} from './validation-status'

export type StreamHandlers = {
  onDelta?: (text: string) => void
  onEmailDelta?: (text: string) => void
  onValidationStatus?: (status: ValidationStatusEvent) => void
  onTurn?: (turn: ChatTurnResponse) => void
}

/** Phases the Validation badge shows live — give React a frame to paint them
 * before the next SSE event in the same TCP chunk overwrites the phase. */
const LIVE_VALIDATION_PHASES = new Set<string>([
  VALIDATION_PHASES.VALIDATING,
  VALIDATION_PHASES.REPAIRING,
])

function paintFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })
}

export async function postChatTurnStream(
  sessionId: string,
  message: string,
  handlers: StreamHandlers,
): Promise<ChatTurnResponse> {
  const response = await fetchStreamResponse(sessionId, message)
  if (!response.body) {
    throw new Error(UI_TEXT.STREAM_ERROR)
  }

  const finalTurn = await consumeSseStream(response.body, handlers)
  if (!finalTurn) {
    throw new Error(UI_TEXT.INVALID_RESPONSE)
  }
  return finalTurn
}

async function fetchStreamResponse(
  sessionId: string,
  message: string,
): Promise<Response> {
  const response = await fetch(
    `${API_BASE_URL}${CHAT_PATH_PREFIX}${sessionId}${CHAT_STREAM_SUFFIX}`,
    {
      method: HTTP.POST,
      headers: {
        [HTTP.CONTENT_TYPE]: HTTP.APPLICATION_JSON,
        [HTTP.ACCEPT]: HTTP.TEXT_EVENT_STREAM,
      },
      body: JSON.stringify({ message }),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `${UI_TEXT.HTTP_ERROR_PREFIX} ${response.status}`)
  }
  return response
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<ChatTurnResponse | null> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalTurn: ChatTurnResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(SSE_SEPARATOR)
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const turn = await handleSseBlock(part, handlers)
      if (turn) finalTurn = turn
    }
  }

  return finalTurn
}

async function handleSseBlock(
  part: string,
  handlers: StreamHandlers,
): Promise<ChatTurnResponse | null> {
  const parsed = parseSseBlock(part)
  if (!parsed) return null

  if (parsed.event === SSE_EVENTS.DESCRIPTION_DELTA) {
    dispatchDelta(parsed.data, handlers.onDelta)
    return null
  }

  if (parsed.event === SSE_EVENTS.EMAIL_DELTA) {
    dispatchDelta(parsed.data, handlers.onEmailDelta)
    return null
  }

  if (parsed.event === SSE_EVENTS.VALIDATION_STATUS) {
    await dispatchValidationStatus(parsed.data, handlers)
    return null
  }

  if (parsed.event === SSE_EVENTS.ERROR) {
    throw new Error(readErrorDetail(parsed.data) || UI_TEXT.STREAM_ERROR)
  }

  if (!isChatTurnResponse(parsed.data)) {
    throw new Error(UI_TEXT.INVALID_RESPONSE)
  }

  handlers.onTurn?.(parsed.data)
  return parsed.data
}

function dispatchDelta(
  data: unknown,
  onDelta: ((text: string) => void) | undefined,
): void {
  const text = readDeltaText(data)
  if (text) onDelta?.(text)
}

async function dispatchValidationStatus(
  data: unknown,
  handlers: StreamHandlers,
): Promise<void> {
  const status = parseValidationStatus(data)
  if (!status) return
  handlers.onValidationStatus?.(status)
  if (LIVE_VALIDATION_PHASES.has(status.phase)) {
    await paintFrame()
  }
}

type SseBlock = {
  event: string
  data: unknown
}

function parseSseBlock(block: string): SseBlock | null {
  const lines = block.split(SSE_NEWLINE)
  let event = ''
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith(SSE_LINE.EVENT_PREFIX)) {
      event = line.slice(SSE_LINE.EVENT_PREFIX.length).trim()
    } else if (line.startsWith(SSE_LINE.DATA_PREFIX)) {
      dataLines.push(line.slice(SSE_LINE.DATA_PREFIX.length).trim())
    }
  }
  if (!event || dataLines.length === 0) return null
  try {
    return { event, data: JSON.parse(dataLines.join(SSE_NEWLINE)) }
  } catch {
    return null
  }
}

function readDeltaText(data: unknown): string {
  if (typeof data !== 'object' || data === null) return ''
  if (!(SSE_PAYLOAD_KEYS.TEXT in data)) return ''
  const text = Reflect.get(data, SSE_PAYLOAD_KEYS.TEXT)
  return typeof text === 'string' ? text : ''
}

function readErrorDetail(data: unknown): string {
  if (typeof data !== 'object' || data === null) return ''
  if (!(SSE_PAYLOAD_KEYS.DETAIL in data)) return ''
  const detail = Reflect.get(data, SSE_PAYLOAD_KEYS.DETAIL)
  return typeof detail === 'string' ? detail : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isChatTurnResponse(value: unknown): value is ChatTurnResponse {
  if (!isRecord(value)) return false
  if (typeof value.type !== 'string') return false
  if (
    value.type !== RESPONSE_TYPES.QUESTION &&
    value.type !== RESPONSE_TYPES.READY_FOR_CONFIRMATION &&
    value.type !== RESPONSE_TYPES.GENERATED_COPY &&
    value.type !== RESPONSE_TYPES.VALIDATION_FAILED
  ) {
    return false
  }
  if (typeof value.message !== 'string') return false
  if (!isRecord(value.brief)) return false
  if (!isRecord(value.gate)) return false
  return true
}
