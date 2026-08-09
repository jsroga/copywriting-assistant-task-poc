import DOMPurify from 'dompurify'

import { EMAIL_HTML_DOMPURIFY } from '@/constants'

/** Sanitize generated marketing email HTML with DOMPurify. */
export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { [EMAIL_HTML_DOMPURIFY.PROFILE_HTML]: true },
    ADD_TAGS: [...EMAIL_HTML_DOMPURIFY.ADD_TAGS],
    ADD_ATTR: [...EMAIL_HTML_DOMPURIFY.ADD_ATTR],
  })
}
