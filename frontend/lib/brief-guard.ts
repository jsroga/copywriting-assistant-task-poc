import { FIELD_STATUS } from '@/constants'
import type { ProductBrief } from './types'

/** Detect wiped/new empty briefs so the UI never silently resets on its own. */
export function isBriefRegression(
  previous: ProductBrief | null,
  next: ProductBrief,
): boolean {
  if (!previous) return false
  if (next.version < previous.version) return true
  const hadName =
    previous.product_name.status === FIELD_STATUS.CONFIRMED &&
    previous.product_name.value !== null
  const lostName =
    next.product_name.status === FIELD_STATUS.MISSING ||
    next.product_name.value === null
  return hadName && lostName && next.version === 0
}
