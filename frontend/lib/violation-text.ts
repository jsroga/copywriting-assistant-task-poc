import { SPACE, UNDERSCORE, VIOLATION_LABELS } from '@/constants'

/** Plain-language headline for a violation code, falling back to the code itself. */
export function violationHeadline(code: string): string {
  return VIOLATION_LABELS[code] ?? code.split(UNDERSCORE).join(SPACE)
}
