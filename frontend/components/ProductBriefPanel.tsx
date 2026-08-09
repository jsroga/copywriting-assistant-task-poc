'use client'

import {
  BRIEF_FIELD_LABELS,
  BRIEF_FIELD_ORDER,
  FIELD_STATUS,
  FIELD_STATUS_LABELS,
  HISTORY_JOIN,
  LIST_SEPARATOR,
  REQUIRED_BRIEF_FIELDS,
  REQUIREMENT_BADGE_CLASS,
  SPACE,
  UI_TEXT,
  UNDERSCORE,
} from '@/constants'
import type { FieldValue, ProductBrief } from '@/lib/types'
import { ValidationBadge } from './ValidationBadge'
import { CopyStreamSections } from './CopyStreamSections'
import { useChatSession, type ChatSession } from '@/lib/chat-runtime'

const EMPTY_FIELD: FieldValue = {
  value: null,
  raw_text: null,
  status: FIELD_STATUS.MISSING,
  updated_at_turn: null,
  history: [],
}

function formatValue(field: FieldValue): string {
  if (field.value === null || field.value === undefined) {
    if (field.raw_text) return field.raw_text
    return UI_TEXT.EMPTY_VALUE
  }
  if (Array.isArray(field.value)) {
    return field.value.join(LIST_SEPARATOR)
  }
  return field.value
}

function RequirementBadge({ fieldName }: { fieldName: string }) {
  const required = REQUIRED_BRIEF_FIELDS.some((name) => name === fieldName)
  return (
    <span
      className={
        required
          ? REQUIREMENT_BADGE_CLASS.REQUIRED
          : REQUIREMENT_BADGE_CLASS.OPTIONAL
      }
    >
      {required ? UI_TEXT.REQUIRED_BADGE : UI_TEXT.OPTIONAL_BADGE}
    </span>
  )
}

function fieldLabel(fieldName: string): string {
  for (const key of BRIEF_FIELD_ORDER) {
    if (key === fieldName) {
      return BRIEF_FIELD_LABELS[key]
    }
  }
  return fieldName.split(UNDERSCORE).join(SPACE)
}

function BriefFields({ brief }: { brief: ProductBrief | null }) {
  return (
    <div className="space-y-3">
      {BRIEF_FIELD_ORDER.map((fieldName) => {
        const field = brief?.[fieldName] ?? EMPTY_FIELD
        return (
          <div key={fieldName} className="border-b border-zinc-200 pb-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800">
                {BRIEF_FIELD_LABELS[fieldName]}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <RequirementBadge fieldName={fieldName} />
                <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs">
                  {FIELD_STATUS_LABELS[field.status]}
                </span>
              </span>
            </div>
            <div className="mt-1 text-sm text-zinc-900">{formatValue(field)}</div>
            {field.history.length > 0 ? (
              <div className="mt-1 text-xs text-zinc-500">
                {UI_TEXT.HISTORY_PREFIX}:{' '}
                {field.history
                  .map((item) =>
                    Array.isArray(item) ? item.join(LIST_SEPARATOR) : item,
                  )
                  .join(HISTORY_JOIN)}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function ProductBriefPanel() {
  const session: ChatSession = useChatSession()
  const {
    brief,
    validation,
    copy,
    gateStatus,
    streamingDescription,
    streamingEmail,
    validationPhase,
    liveViolations,
  } = session

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto bg-white px-4 pb-4">
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-white px-4 pb-3 pt-[10px]">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">{UI_TEXT.BRIEF_TITLE}</h2>
          <p className="text-sm text-zinc-600">
            {UI_TEXT.VERSION_PREFIX} {brief?.version ?? 0}
            {gateStatus ? ` · ${UI_TEXT.GATE_PREFIX}: ${gateStatus}` : ''}
          </p>
        </div>
        <ValidationBadge
          validation={validation}
          liveViolations={liveViolations}
          phase={validationPhase}
        />
      </div>

      <BriefFields brief={brief} />

      <CopyStreamSections
        copy={copy}
        streamingDescription={streamingDescription}
        streamingEmail={streamingEmail}
        validationPhase={validationPhase}
      />

      {brief && brief.assumptions.length > 0 ? (
        <div className="mt-4 text-sm">
          <div className="font-medium">{UI_TEXT.ASSUMPTIONS_LABEL}</div>
          <ul className="mt-1 list-disc pl-5">
            {brief.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief && brief.conflicts.length > 0 ? (
        <div className="mt-4 text-sm">
          <div className="font-medium">{UI_TEXT.CONFLICTS_LABEL}</div>
          <ul className="mt-1 list-disc pl-5">
            {brief.conflicts.map((conflict) => (
              <li key={`${conflict.field}-${conflict.turn}`}>
                {fieldLabel(conflict.field)}: {String(conflict.old_value)} vs{' '}
                {String(conflict.new_value)}
                {conflict.resolved ? ` ${UI_TEXT.RESOLVED_SUFFIX}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}
