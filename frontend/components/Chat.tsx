'use client'

import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import type { FC } from 'react'

import { EMAIL_BODY_HTML_CLASS, UI_TEXT } from '@/constants'
import { useChatSession, type ChatSession } from '@/lib/chat-runtime'
import { sanitizeEmailHtml } from '@/lib/sanitize-html'
import type { GeneratedCopy } from '@/lib/types'

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-start">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

/** The marketing email that accompanies the delivered description. Rendered as
 * sanitized HTML so the chat shows the real email, CTA button included. */
function AssistantEmail({ copy }: { copy: GeneratedCopy }) {
  return (
    <div className="mb-3 flex justify-start">
      <div className="max-w-[85%] space-y-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900">
        <div>
          <div className="font-roboto text-xs font-bold uppercase text-zinc-500">
            {UI_TEXT.EMAIL_SUBJECT_LABEL}
          </div>
          <p className="mt-1">{copy.marketing_email.subject}</p>
        </div>
        <div>
          <div className="font-roboto text-xs font-bold uppercase text-zinc-500">
            {UI_TEXT.EMAIL_BODY_LABEL}
          </div>
          <div
            className={EMAIL_BODY_HTML_CLASS}
            dangerouslySetInnerHTML={{
              __html: sanitizeEmailHtml(copy.marketing_email.body),
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function Chat() {
  const session: ChatSession = useChatSession()
  const { isRunning, streamingDescription, copy, validation } = session
  const showThinking = isRunning && !streamingDescription
  // Same rule as the thread text: only validated copy reaches the chat.
  const deliveredEmail = validation?.passed ? copy : null

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-white">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto p-4">
        <ThreadPrimitive.Empty>
          <p className="text-sm text-zinc-500">{UI_TEXT.APP_SUBTITLE}</p>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
        {deliveredEmail && !isRunning ? (
          <AssistantEmail copy={deliveredEmail} />
        ) : null}
        {showThinking ? (
          <p className="text-sm text-zinc-500">{UI_TEXT.LOADING}</p>
        ) : null}
        {isRunning && streamingDescription ? (
          <p className="mt-1 text-xs text-zinc-500">{UI_TEXT.STREAMING_CHAT}</p>
        ) : null}
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-zinc-200 p-3">
        <ComposerPrimitive.Input
          className="min-h-[44px] flex-1 resize-none rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          placeholder={UI_TEXT.CHAT_PLACEHOLDER}
          rows={2}
        />
        <ComposerPrimitive.Send className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {UI_TEXT.SEND}
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
