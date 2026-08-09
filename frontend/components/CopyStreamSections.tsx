'use client'

import {
  EMAIL_BODY_HTML_CLASS,
  UI_TEXT,
  VALIDATION_PHASES,
} from '@/constants'
import { sanitizeEmailHtml } from '@/lib/sanitize-html'
import type { GeneratedCopy } from '@/lib/types'
import type { ValidationPhase } from '@/lib/validation-status'

type CopyStreamSectionsProps = {
  copy: GeneratedCopy | null
  streamingDescription: string
  streamingEmail: string
  validationPhase: ValidationPhase
}

function descriptionTextFor(
  streamingDescription: string,
  copy: GeneratedCopy | null,
): string {
  if (streamingDescription) return streamingDescription
  if (copy?.product_description) return copy.product_description
  return ''
}

function emailHtmlFor(
  streamingEmail: string,
  copy: GeneratedCopy | null,
): string {
  if (streamingEmail) return streamingEmail
  if (copy?.marketing_email.body) return copy.marketing_email.body
  return ''
}

function emailSubjectFor(copy: GeneratedCopy | null): string {
  if (!copy) return ''
  return copy.marketing_email.subject
}

function shouldShowDescription(
  text: string,
  phase: ValidationPhase,
): boolean {
  if (text) return true
  return phase === VALIDATION_PHASES.GENERATING
}

function shouldShowEmail(
  html: string,
  subject: string,
  phase: ValidationPhase,
): boolean {
  if (html) return true
  if (subject) return true
  return phase === VALIDATION_PHASES.BUILDING_EMAIL
}

function DescriptionStream({
  text,
  phase,
}: {
  text: string
  phase: ValidationPhase
}) {
  const waiting = phase === VALIDATION_PHASES.GENERATING && !text
  return (
    <div className="mt-4 space-y-2 rounded border border-zinc-300 p-3 text-sm">
      <div className="font-roboto text-xs font-bold uppercase text-zinc-500">
        {UI_TEXT.DESCRIPTION_LABEL}
      </div>
      {waiting ? (
        <p className="text-amber-700">{UI_TEXT.DESCRIPTION_STREAMING_LABEL}</p>
      ) : null}
      {text ? (
        <p className="whitespace-pre-wrap text-zinc-900">{text}</p>
      ) : null}
    </div>
  )
}

function EmailStream({
  subject,
  html,
  phase,
}: {
  subject: string
  html: string
  phase: ValidationPhase
}) {
  const waiting = phase === VALIDATION_PHASES.BUILDING_EMAIL && !html
  return (
    <div className="mt-4 space-y-3 rounded border border-zinc-300 p-3 text-sm">
      <div className="font-medium">{UI_TEXT.COPY_TITLE}</div>
      {subject ? (
        <div>
          <div className="font-roboto text-xs font-bold uppercase text-zinc-500">
            {UI_TEXT.EMAIL_SUBJECT_LABEL}
          </div>
          <p className="mt-1">{subject}</p>
        </div>
      ) : null}
      <div>
        <div className="font-roboto text-xs font-bold uppercase text-zinc-500">
          {UI_TEXT.EMAIL_BODY_LABEL}
        </div>
        {waiting ? (
          <p className="mt-1 text-amber-700">{UI_TEXT.EMAIL_STREAMING_LABEL}</p>
        ) : null}
        {html ? (
          <div
            className={EMAIL_BODY_HTML_CLASS}
            dangerouslySetInnerHTML={{
              __html: sanitizeEmailHtml(html),
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

export function CopyStreamSections({
  copy,
  streamingDescription,
  streamingEmail,
  validationPhase,
}: CopyStreamSectionsProps) {
  const descriptionText = descriptionTextFor(streamingDescription, copy)
  const emailHtml = emailHtmlFor(streamingEmail, copy)
  const emailSubject = emailSubjectFor(copy)
  const showDescription = shouldShowDescription(
    descriptionText,
    validationPhase,
  )
  const showEmail = shouldShowEmail(emailHtml, emailSubject, validationPhase)

  if (!showDescription && !showEmail) {
    return null
  }

  return (
    <>
      {showDescription ? (
        <DescriptionStream text={descriptionText} phase={validationPhase} />
      ) : null}
      {showEmail ? (
        <EmailStream
          subject={emailSubject}
          html={emailHtml}
          phase={validationPhase}
        />
      ) : null}
    </>
  )
}
