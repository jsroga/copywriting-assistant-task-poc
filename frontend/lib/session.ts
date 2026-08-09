import { CRYPTO_KEYS, SESSION_STORAGE_KEY } from '@/constants'

function createSessionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    CRYPTO_KEYS.RANDOM_UUID in crypto
  ) {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function persistSessionId(id: string): string {
  window.localStorage.setItem(SESSION_STORAGE_KEY, id)
  return id
}

/**
 * Always mint a fresh session id (page refresh / New conversation).
 * Never reuse a previous ProductBrief across reloads.
 */
export function startNewSessionId(): string {
  if (typeof window === 'undefined') {
    return createSessionId()
  }
  return persistSessionId(createSessionId())
}

/** Current id after bootstrap; creates one if missing (should be rare). */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return createSessionId()
  }
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) {
    return existing
  }
  return startNewSessionId()
}

export function peekSessionId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage.getItem(SESSION_STORAGE_KEY)
}
