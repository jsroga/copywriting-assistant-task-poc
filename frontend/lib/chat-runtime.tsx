'use client'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { isBriefRegression } from './brief-guard'
import { postChatTurnStream } from './chat-api'
import {
  DOUBLE_NEWLINE,
  EMPTY_JSON_OBJECT,
  MESSAGE_PART_TYPES,
  ROLES,
  UI_TEXT,
  VALIDATION_PHASES,
} from '@/constants'
import {
  getOrCreateSessionId,
  peekSessionId,
  startNewSessionId,
} from './session'
import type { ChatSession, SessionState } from './chat-session'
import type {
  ChatTurnResponse,
  ProductBrief,
  ThreadChatMessage,
} from './types'

export type { ChatSession, SessionState } from './chat-session'

const EMPTY_SESSION: SessionState = {
  brief: null,
  validation: null,
  copy: null,
  gateStatus: null,
  streamingDescription: '',
  streamingEmail: '',
  validationPhase: VALIDATION_PHASES.IDLE,
  liveViolations: [],
}

const ChatSessionContext = createContext<ChatSession>({
  ...EMPTY_SESSION,
  isRunning: false,
  startNewConversation: () => undefined,
  getConversationJson: () => EMPTY_JSON_OBJECT,
})

export function useChatSession(): ChatSession {
  return useContext(ChatSessionContext)
}

function textFromAppend(message: AppendMessage): string {
  const content = message.content
  if (typeof content === 'string') {
    return content
  }
  const parts: string[] = []
  for (const part of content) {
    if (part.type === MESSAGE_PART_TYPES.TEXT) {
      parts.push(part.text)
    }
  }
  return parts.join('')
}

function toThreadMessage(message: ThreadChatMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: [{ type: MESSAGE_PART_TYPES.TEXT, text: message.content }],
  }
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function upsertAssistantMessage(
  messages: ThreadChatMessage[],
  id: string,
  content: string,
): ThreadChatMessage[] {
  const index = messages.findIndex((item) => item.id === id)
  const next: ThreadChatMessage = {
    id,
    role: ROLES.ASSISTANT,
    content,
  }
  if (index === -1) {
    return [...messages, next]
  }
  const copy = [...messages]
  copy[index] = next
  return copy
}

type ChatRuntimeProviderProps = {
  children: ReactNode
}

export function ChatRuntimeProvider({ children }: ChatRuntimeProviderProps) {
  // Page load / refresh always starts a brand-new session — never resume an old brief.
  const bootstrapped = useRef(false)
  if (!bootstrapped.current) {
    bootstrapped.current = true
    startNewSessionId()
  }

  const [messages, setMessages] = useState<ThreadChatMessage[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [sessionState, setSessionState] = useState<SessionState>(EMPTY_SESSION)
  const briefRef = useRef<ProductBrief | null>(null)

  const startNewConversation = useCallback(() => {
    startNewSessionId()
    briefRef.current = null
    setMessages([])
    setIsRunning(false)
    setSessionState(EMPTY_SESSION)
  }, [])

  const getConversationJson = useCallback(() => {
    const payload = {
      session_id: peekSessionId(),
      gate_status: sessionState.gateStatus,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      brief: sessionState.brief,
      copy: sessionState.copy,
      validation: sessionState.validation,
      validation_phase: sessionState.validationPhase,
    }
    return JSON.stringify(payload, null, 2)
  }, [messages, sessionState])

  const applyTurn = useCallback((turn: ChatTurnResponse): boolean => {
    const regressing = isBriefRegression(briefRef.current, turn.brief)
    const nextBrief = regressing ? briefRef.current : turn.brief
    briefRef.current = nextBrief
    const hasCopy = turn.copy !== null
    setSessionState((prev) => ({
      brief: nextBrief,
      validation: turn.validation ?? prev.validation,
      copy: turn.copy ?? prev.copy,
      gateStatus: turn.gate.status,
      streamingDescription: hasCopy ? '' : prev.streamingDescription,
      streamingEmail: hasCopy ? '' : prev.streamingEmail,
      validationPhase:
        turn.validation !== null
          ? VALIDATION_PHASES.DONE
          : prev.validationPhase,
      liveViolations:
        turn.validation?.pre_repair_violations ?? prev.liveViolations,
    }))
    return regressing
  }, [])

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const userText = textFromAppend(message).trim()
      if (!userText) return

      const userMessage: ThreadChatMessage = {
        id: nextId(ROLES.USER),
        role: ROLES.USER,
        content: userText,
      }
      const assistantId = nextId(ROLES.ASSISTANT)
      setMessages((prev) => [...prev, userMessage])
      setIsRunning(true)
      setSessionState((prev) => ({
        ...prev,
        streamingDescription: '',
        streamingEmail: '',
        validationPhase: VALIDATION_PHASES.IDLE,
        liveViolations: [],
      }))

      try {
        const sessionId = getOrCreateSessionId()
        let sawRegression = false
        const turn = await postChatTurnStream(sessionId, userText, {
          // Copy streams into the Product Brief panel only. The chat thread must
          // never show text that has not cleared validation yet.
          onDelta: (text) => {
            setSessionState((prev) => ({
              ...prev,
              streamingDescription: `${prev.streamingDescription}${text}`,
              validationPhase: VALIDATION_PHASES.GENERATING,
            }))
          },
          onEmailDelta: (text) => {
            setSessionState((prev) => ({
              ...prev,
              streamingEmail: `${prev.streamingEmail}${text}`,
              validationPhase: VALIDATION_PHASES.BUILDING_EMAIL,
            }))
          },
          onValidationStatus: (status) => {
            setSessionState((prev) => ({
              ...prev,
              validationPhase: status.phase,
              validation: status.validation ?? prev.validation,
              liveViolations:
                status.preRepairViolations.length > 0
                  ? status.preRepairViolations
                  : prev.liveViolations,
            }))
          },
          onTurn: (nextTurn) => {
            if (applyTurn(nextTurn)) {
              sawRegression = true
            }
          },
        })
        if (applyTurn(turn)) {
          sawRegression = true
        }
        const statusText = sawRegression
          ? `${turn.message}${DOUBLE_NEWLINE}${UI_TEXT.SESSION_STALE_KEPT}`
          : turn.message
        // Only validated copy reaches the thread; a failed turn shows the status alone.
        const validatedDescription = turn.validation?.passed
          ? turn.copy?.product_description
          : null
        const finalContent = validatedDescription
          ? `${validatedDescription}${DOUBLE_NEWLINE}${statusText}`
          : statusText
        setMessages((prev) =>
          upsertAssistantMessage(prev, assistantId, finalContent),
        )
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        const errorText = `${UI_TEXT.ERROR_PREFIX} ${detail}`
        setMessages((prev) =>
          upsertAssistantMessage(prev, assistantId, errorText),
        )
        setSessionState((prev) => ({
          ...prev,
          validationPhase: VALIDATION_PHASES.IDLE,
        }))
      } finally {
        setIsRunning(false)
      }
    },
    [applyTurn],
  )

  const replaceMessages = useCallback((next: readonly ThreadChatMessage[]) => {
    setMessages([...next])
  }, [])

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    setMessages: replaceMessages,
    onNew,
    convertMessage: toThreadMessage,
  })

  const contextValue = useMemo<ChatSession>(
    () => ({
      brief: sessionState.brief,
      validation: sessionState.validation,
      copy: sessionState.copy,
      gateStatus: sessionState.gateStatus,
      streamingDescription: sessionState.streamingDescription,
      streamingEmail: sessionState.streamingEmail,
      validationPhase: sessionState.validationPhase,
      liveViolations: sessionState.liveViolations,
      isRunning,
      startNewConversation,
      getConversationJson,
    }),
    [sessionState, isRunning, startNewConversation, getConversationJson],
  )

  return (
    <ChatSessionContext.Provider value={contextValue}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </ChatSessionContext.Provider>
  )
}
