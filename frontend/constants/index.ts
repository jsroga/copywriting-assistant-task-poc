export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5001'

export const SESSION_STORAGE_KEY = 'copywriter-session-id'

export const HTTP = {
  POST: 'POST',
  CONTENT_TYPE: 'Content-Type',
  APPLICATION_JSON: 'application/json',
  ACCEPT: 'Accept',
  TEXT_EVENT_STREAM: 'text/event-stream',
} as const

export const CHAT_PATH_PREFIX = '/api/chat/'
export const CHAT_STREAM_SUFFIX = '/stream'

export const SSE_EVENTS = {
  QUESTION: 'question',
  READY_FOR_CONFIRMATION: 'ready_for_confirmation',
  DESCRIPTION_DELTA: 'description_delta',
  EMAIL_DELTA: 'email_delta',
  VALIDATION_STATUS: 'validation_status',
  GENERATED_COPY: 'generated_copy',
  VALIDATION_FAILED: 'validation_failed',
  ERROR: 'error',
} as const

export const VALIDATION_PHASES = {
  IDLE: 'idle',
  EXTRACTING: 'extracting',
  GENERATING: 'generating',
  BUILDING_EMAIL: 'building_email',
  VALIDATING: 'validating',
  REPAIRING: 'repairing',
  DONE: 'done',
} as const

export const ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const

export const FIELD_STATUS = {
  MISSING: 'missing',
  VAGUE: 'vague',
  CONFLICTED: 'conflicted',
  CONFIRMED: 'confirmed',
} as const

export const FIELD_STATUS_LABELS = {
  [FIELD_STATUS.MISSING]: 'Missing',
  [FIELD_STATUS.VAGUE]: 'Vague',
  [FIELD_STATUS.CONFLICTED]: 'Conflicted',
  [FIELD_STATUS.CONFIRMED]: 'Confirmed',
} as const

export const BRIEF_FIELD_ORDER = [
  'product_name',
  'key_features',
  'target_audience',
  'tone',
  'price',
  'category',
  'brand_name',
] as const

/** Fields the readiness gate requires before generation (mirrors backend REQUIRED_FIELDS). */
export const REQUIRED_BRIEF_FIELDS = [
  'product_name',
  'key_features',
  'target_audience',
  'tone',
  'price',
] as const

export const BRIEF_FIELD_LABELS = {
  product_name: 'Product name',
  key_features: 'Key features',
  target_audience: 'Target audience',
  tone: 'Tone',
  price: 'Price',
  category: 'Category',
  brand_name: 'Brand name',
} as const

export const UI_TEXT = {
  APP_TITLE: 'E-Commerce Copywriting Assistant',
  APP_SUBTITLE: 'Chat to gather product facts, then generate validated copy.',
  CHAT_PLACEHOLDER: 'Describe your product…',
  SEND: 'Send',
  BRIEF_TITLE: 'Product Brief',
  VERSION_PREFIX: 'Version',
  GATE_PREFIX: 'Gate',
  VALIDATION_TITLE: 'Validation',
  VALIDATION_NONE: 'No generation yet',
  VALIDATION_PASS: 'Validation: PASS',
  VALIDATION_PASS_REPAIR: 'Validation: PASS after automatic repair',
  VALIDATION_FAIL: 'Validation: FAILED',
  PRE_REPAIR_LABEL: 'Before repair',
  FINAL_VIOLATIONS_LABEL: 'What failed',
  COPY_TITLE: 'Generated copy',
  DESCRIPTION_LABEL: 'Product description',
  DESCRIPTION_STREAMING_LABEL: 'Generating description…',
  EMAIL_SUBJECT_LABEL: 'Subject',
  EMAIL_BODY_LABEL: 'Email body',
  EMAIL_STREAMING_LABEL: 'Generating email…',
  EMAIL_CTA_LABEL: 'Call to action',
  EXTRACTING_LABEL: 'Reading your message…',
  VALIDATING_LABEL: 'Running validation checks…',
  REPAIRING_LABEL: 'Validation failed — retrying once…',
  ASSUMPTIONS_LABEL: 'Assumptions',
  CONFLICTS_LABEL: 'Conflicts',
  HISTORY_PREFIX: 'History',
  EMPTY_BRIEF: 'Send a message to start building the brief.',
  EMPTY_VALUE: '—',
  LOADING: 'Thinking…',
  STREAMING_CHAT: 'Writing…',
  VALIDATING_CHAT: 'Validating copy…',
  ERROR_PREFIX: 'Request failed:',
  RESOLVED_SUFFIX: '(resolved)',
  INVALID_RESPONSE: 'Invalid chat response shape',
  HTTP_ERROR_PREFIX: 'HTTP',
  STREAM_ERROR: 'Stream failed',
  SESSION_STALE_KEPT:
    'Server returned an empty brief; kept your previous Product Brief (session may have restarted).',
  NEW_CONVERSATION: 'New conversation',
  COPY_CONVERSATION_JSON: 'Copy JSON',
  COPIED_CONVERSATION_JSON: 'Copied',
  COPY_CONVERSATION_FAILED: 'Copy failed',
  HIDE_BRIEF: 'Hide brief',
  SHOW_BRIEF: 'Show brief',
  REQUIRED_BADGE: 'Required',
  OPTIONAL_BADGE: 'Optional',
} as const

export const REQUIREMENT_BADGE_CLASS = {
  REQUIRED: 'rounded bg-zinc-800 px-2 py-0.5 text-xs text-white',
  OPTIONAL: 'rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500',
} as const

/** Plain-language headline per validation violation code. */
export const VIOLATION_LABELS: Readonly<Record<string, string>> = {
  missing_price: 'The price you confirmed is missing from the copy',
  description_length: 'The product description is the wrong length',
  email_length: 'The email body is the wrong length',
  missing_cta: 'The email has no call to action',
  subject_too_long: 'The email subject line is too long',
  feature_coverage: 'Some of your key features are not mentioned',
  placeholder_text: 'The copy still contains placeholder text',
  forbidden_claim: 'The copy makes a claim your brief does not support',
}

export const MAIN_GRID_CLASS = {
  WITH_BRIEF: 'grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2',
  WITHOUT_BRIEF: 'grid min-h-0 flex-1 grid-cols-1',
} as const

export const COPY_FEEDBACK_MS = 1500
export const EMPTY_JSON_OBJECT = '{}'

export const VALIDATION_STATUS_CLASS = {
  IDLE: 'text-zinc-600',
  LIVE: 'text-amber-700',
  PASS: 'text-green-700',
  FAIL: 'text-red-700',
} as const

export const EMAIL_BODY_HTML_CLASS =
  'prose prose-sm mt-1 max-w-none text-zinc-900 [&_a]:mx-auto [&_a]:mt-[12px] [&_a]:flex [&_a]:w-fit [&_a]:rounded-md [&_a]:bg-zinc-900 [&_a]:px-4 [&_a]:py-2 [&_a]:font-semibold [&_a]:text-white [&_a]:no-underline [&_button]:mx-auto [&_button]:mt-[12px] [&_button]:flex [&_button]:w-fit [&_button]:rounded-md [&_button]:bg-zinc-900 [&_button]:px-4 [&_button]:py-2 [&_button]:font-semibold [&_button]:text-white'

export const RESPONSE_TYPES = {
  QUESTION: 'question',
  READY_FOR_CONFIRMATION: 'ready_for_confirmation',
  GENERATED_COPY: 'generated_copy',
  VALIDATION_FAILED: 'validation_failed',
} as const

export const MESSAGE_PART_TYPES = {
  TEXT: 'text',
} as const

export const CRYPTO_KEYS = {
  RANDOM_UUID: 'randomUUID',
} as const

export const LIST_SEPARATOR = ', '
export const HISTORY_JOIN = ' | '
export const UNDERSCORE = '_'
export const SPACE = ' '
export const DOUBLE_NEWLINE = '\n\n'

export const SSE_LINE = {
  EVENT_PREFIX: 'event:',
  DATA_PREFIX: 'data:',
} as const

export const SSE_SEPARATOR = '\n\n'
export const SSE_NEWLINE = '\n'

export const SSE_PAYLOAD_KEYS = {
  TEXT: 'text',
  DETAIL: 'detail',
  PHASE: 'phase',
  VALIDATION: 'validation',
  PRE_REPAIR_VIOLATIONS: 'pre_repair_violations',
} as const

/** DOMPurify options for marketing email HTML (keeps CTA buttons). */
export const EMAIL_HTML_DOMPURIFY = {
  PROFILE_HTML: 'html',
  ADD_TAGS: ['button'],
  ADD_ATTR: ['target', 'rel', 'type'],
} as const
