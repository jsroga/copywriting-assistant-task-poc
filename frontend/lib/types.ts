import {
  BRIEF_FIELD_ORDER,
  FIELD_STATUS_LABELS,
  RESPONSE_TYPES,
} from '@/constants'

export type FieldStatus = keyof typeof FIELD_STATUS_LABELS

export type BriefFieldName = (typeof BRIEF_FIELD_ORDER)[number]

export type FieldValue = {
  value: string | string[] | null
  raw_text: string | null
  status: FieldStatus
  updated_at_turn: number | null
  history: Array<string | string[]>
}

export type ConflictRecord = {
  field: string
  old_value: string | string[] | null
  new_value: string | string[] | null
  turn: number
  resolved: boolean
}

export type ProductBrief = Record<BriefFieldName, FieldValue> & {
  assumptions: string[]
  conflicts: ConflictRecord[]
  version: number
}

export type GateDecision = {
  status: 'needs_info' | 'needs_clarification' | 'ready'
  fields: string[]
  next_field: string | null
}

export type MarketingEmail = {
  subject: string
  body: string
  cta: string
}

export type GeneratedCopy = {
  product_description: string
  marketing_email: MarketingEmail
}

export type Violation = {
  code: string
  message: string
  artifact: string
}

export type ValidationResult = {
  repaired: boolean
  passed: boolean
  violations: Violation[]
  pre_repair_violations: Violation[]
}

export type ResponseType = (typeof RESPONSE_TYPES)[keyof typeof RESPONSE_TYPES]

export type ChatTurnResponse = {
  type: ResponseType
  message: string
  brief: ProductBrief
  gate: GateDecision
  copy: GeneratedCopy | null
  validation: ValidationResult | null
}

export type ThreadChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}
