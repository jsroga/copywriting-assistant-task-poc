'use client'

import { useState } from 'react'

import { Chat } from '@/components/Chat'
import { ProductBriefPanel } from '@/components/ProductBriefPanel'
import { ChatRuntimeProvider, useChatSession } from '@/lib/chat-runtime'
import { COPY_FEEDBACK_MS, MAIN_GRID_CLASS, UI_TEXT } from '@/constants'

type AppHeaderProps = {
  briefVisible: boolean
  onToggleBrief: () => void
}

function AppHeader({ briefVisible, onToggleBrief }: AppHeaderProps) {
  const { startNewConversation, getConversationJson, isRunning } =
    useChatSession()
  const [copyLabel, setCopyLabel] = useState<string>(UI_TEXT.COPY_CONVERSATION_JSON)

  const onCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(getConversationJson())
      setCopyLabel(UI_TEXT.COPIED_CONVERSATION_JSON)
    } catch {
      setCopyLabel(UI_TEXT.COPY_CONVERSATION_FAILED)
    }
    window.setTimeout(() => {
      setCopyLabel(UI_TEXT.COPY_CONVERSATION_JSON)
    }, COPY_FEEDBACK_MS)
  }

  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">
          {UI_TEXT.APP_TITLE}
        </h1>
        <p className="text-sm text-zinc-600">{UI_TEXT.APP_SUBTITLE}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleBrief}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          {briefVisible ? UI_TEXT.HIDE_BRIEF : UI_TEXT.SHOW_BRIEF}
        </button>
        <button
          type="button"
          disabled={isRunning}
          onClick={() => {
            void onCopyJson()
          }}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {copyLabel}
        </button>
        <button
          type="button"
          disabled={isRunning}
          onClick={startNewConversation}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {UI_TEXT.NEW_CONVERSATION}
        </button>
      </div>
    </header>
  )
}

export default function HomePage() {
  const [briefVisible, setBriefVisible] = useState(true)

  return (
    <ChatRuntimeProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-zinc-50">
        <AppHeader
          briefVisible={briefVisible}
          onToggleBrief={() => {
            setBriefVisible((visible) => !visible)
          }}
        />
        <main
          className={
            briefVisible
              ? MAIN_GRID_CLASS.WITH_BRIEF
              : MAIN_GRID_CLASS.WITHOUT_BRIEF
          }
        >
          <section className="min-h-0 overflow-hidden border-r border-zinc-200">
            <Chat />
          </section>
          {briefVisible ? (
            <section className="min-h-0 overflow-hidden">
              <ProductBriefPanel />
            </section>
          ) : null}
        </main>
      </div>
    </ChatRuntimeProvider>
  )
}
