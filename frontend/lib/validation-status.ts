import {
  SSE_PAYLOAD_KEYS,
  VALIDATION_PHASES,
} from '@/constants'
import type { ValidationResult, Violation } from './types'

export type ValidationPhase =
  (typeof VALIDATION_PHASES)[keyof typeof VALIDATION_PHASES]

export type ValidationStatusEvent = {
  phase: ValidationPhase
  validation: ValidationResult | null
  preRepairViolations: Violation[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isViolation(value: unknown): value is Violation {
  if (!isRecord(value)) return false
  return (
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.artifact === 'string'
  )
}

function isValidationResult(value: unknown): value is ValidationResult {
  if (!isRecord(value)) return false
  if (typeof value.repaired !== 'boolean') return false
  if (typeof value.passed !== 'boolean') return false
  if (!Array.isArray(value.violations)) return false
  if (!Array.isArray(value.pre_repair_violations)) return false
  return (
    value.violations.every(isViolation) &&
    value.pre_repair_violations.every(isViolation)
  )
}

function isValidationPhase(value: unknown): value is ValidationPhase {
  return (
    value === VALIDATION_PHASES.IDLE ||
    value === VALIDATION_PHASES.EXTRACTING ||
    value === VALIDATION_PHASES.GENERATING ||
    value === VALIDATION_PHASES.BUILDING_EMAIL ||
    value === VALIDATION_PHASES.VALIDATING ||
    value === VALIDATION_PHASES.REPAIRING ||
    value === VALIDATION_PHASES.DONE
  )
}

export function parseValidationStatus(
  data: unknown,
): ValidationStatusEvent | null {
  if (!isRecord(data)) return null
  if (!(SSE_PAYLOAD_KEYS.PHASE in data)) return null
  const phase = Reflect.get(data, SSE_PAYLOAD_KEYS.PHASE)
  if (!isValidationPhase(phase)) return null

  let validation: ValidationResult | null = null
  if (SSE_PAYLOAD_KEYS.VALIDATION in data) {
    const raw = Reflect.get(data, SSE_PAYLOAD_KEYS.VALIDATION)
    if (isValidationResult(raw)) {
      validation = raw
    }
  }

  let preRepairViolations: Violation[] = []
  if (SSE_PAYLOAD_KEYS.PRE_REPAIR_VIOLATIONS in data) {
    const raw = Reflect.get(data, SSE_PAYLOAD_KEYS.PRE_REPAIR_VIOLATIONS)
    if (Array.isArray(raw) && raw.every(isViolation)) {
      preRepairViolations = raw
    }
  }

  return { phase, validation, preRepairViolations }
}
