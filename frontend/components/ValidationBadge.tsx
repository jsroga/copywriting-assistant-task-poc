'use client'

import {
  UI_TEXT,
  VALIDATION_PHASES,
  VALIDATION_STATUS_CLASS,
} from '@/constants'
import type { ValidationResult, Violation } from '@/lib/types'
import type { ValidationPhase } from '@/lib/validation-status'
import { violationHeadline } from '@/lib/violation-text'

type ValidationBadgeProps = {
  validation: ValidationResult | null
  liveViolations: Violation[]
  phase: ValidationPhase
}

/** Phases where validation is still working, so the badge reports progress
 * instead of a stale pass/fail verdict from the previous turn. */
const LIVE_PHASE_LABELS: Partial<Record<ValidationPhase, string>> = {
  [VALIDATION_PHASES.VALIDATING]: UI_TEXT.VALIDATING_LABEL,
  [VALIDATION_PHASES.REPAIRING]: UI_TEXT.REPAIRING_LABEL,
}

function resolveStatus(validation: ValidationResult | null): {
  text: string
  className: string
} {
  if (!validation) {
    return {
      text: UI_TEXT.VALIDATION_NONE,
      className: VALIDATION_STATUS_CLASS.IDLE,
    }
  }
  if (validation.passed && validation.repaired) {
    return {
      text: UI_TEXT.VALIDATION_PASS_REPAIR,
      className: VALIDATION_STATUS_CLASS.PASS,
    }
  }
  if (validation.passed) {
    return {
      text: UI_TEXT.VALIDATION_PASS,
      className: VALIDATION_STATUS_CLASS.PASS,
    }
  }
  return {
    text: UI_TEXT.VALIDATION_FAIL,
    className: VALIDATION_STATUS_CLASS.FAIL,
  }
}

function ViolationList({
  title,
  violations,
}: {
  title: string
  violations: Violation[]
}) {
  if (violations.length === 0) return null
  return (
    <div className="mt-2">
      <div className="text-xs font-medium text-zinc-600">{title}</div>
      <ul className="mt-1 space-y-1.5">
        {violations.map((violation) => (
          <li key={`${violation.code}-${violation.message}`}>
            <div className="text-zinc-900">
              {violationHeadline(violation.code)}
            </div>
            <div className="text-xs text-zinc-500">{violation.message}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}

function ValidationDetails({
  validation,
  liveViolations,
  live,
}: {
  validation: ValidationResult | null
  liveViolations: Violation[]
  live: boolean
}) {
  // While validating or retrying, the failures streamed with the repairing frame
  // are the reason for the retry — surface them the moment they arrive.
  if (live) {
    return (
      <ViolationList
        title={UI_TEXT.FINAL_VIOLATIONS_LABEL}
        violations={liveViolations}
      />
    )
  }
  if (!validation) return null
  const preRepair = validation.pre_repair_violations ?? []
  if (validation.passed) {
    return (
      <ViolationList title={UI_TEXT.PRE_REPAIR_LABEL} violations={preRepair} />
    )
  }
  const failed =
    validation.violations.length > 0 ? validation.violations : liveViolations
  return (
    <>
      <ViolationList title={UI_TEXT.FINAL_VIOLATIONS_LABEL} violations={failed} />
      <ViolationList title={UI_TEXT.PRE_REPAIR_LABEL} violations={preRepair} />
    </>
  )
}

export function ValidationBadge({
  validation,
  liveViolations,
  phase,
}: ValidationBadgeProps) {
  const liveLabel = LIVE_PHASE_LABELS[phase]
  const status = liveLabel
    ? { text: liveLabel, className: VALIDATION_STATUS_CLASS.LIVE }
    : resolveStatus(validation)

  return (
    <div className="rounded border border-zinc-300 bg-zinc-50 p-3 text-sm shadow-sm">
      <div className="font-medium">{UI_TEXT.VALIDATION_TITLE}</div>
      <div
        className={`mt-1 flex items-center gap-2 font-medium ${status.className}`}
      >
        {liveLabel ? <Spinner /> : null}
        <span>{status.text}</span>
      </div>
      <ValidationDetails
        validation={validation}
        liveViolations={liveViolations}
        live={liveLabel !== undefined}
      />
    </div>
  )
}
