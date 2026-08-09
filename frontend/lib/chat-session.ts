import type {
  GeneratedCopy,
  ProductBrief,
  ValidationResult,
  Violation,
} from './types'
import type { ValidationPhase } from './validation-status'

export type ChatSession = {
  brief: ProductBrief | null
  validation: ValidationResult | null
  copy: GeneratedCopy | null
  gateStatus: string | null
  streamingDescription: string
  streamingEmail: string
  validationPhase: ValidationPhase
  liveViolations: Violation[]
  isRunning: boolean
  startNewConversation: () => void
  getConversationJson: () => string
}

export type SessionState = Pick<
  ChatSession,
  | 'brief'
  | 'validation'
  | 'copy'
  | 'gateStatus'
  | 'streamingDescription'
  | 'streamingEmail'
  | 'validationPhase'
  | 'liveViolations'
>
