import { z } from "zod";

export const FieldStatus = {
  MISSING: "missing",
  VAGUE: "vague",
  CONFIRMED: "confirmed",
  CONFLICTED: "conflicted",
} as const;
export type FieldStatus = (typeof FieldStatus)[keyof typeof FieldStatus];

export const Intent = {
  PROVIDE_INFO: "provide_info",
  CORRECT_INFO: "correct_info",
  REQUEST_GENERATION: "request_generation",
  REFINE_OUTPUT: "refine_output",
  META_INSTRUCTION: "meta_instruction",
  OFF_TOPIC: "off_topic",
} as const;
export type Intent = (typeof Intent)[keyof typeof Intent];

export const GateStatus = {
  NEEDS_INFO: "needs_info",
  NEEDS_CLARIFICATION: "needs_clarification",
  READY: "ready",
} as const;
export type GateStatus = (typeof GateStatus)[keyof typeof GateStatus];

export const ViolationCode = {
  MISSING_PRICE: "missing_price",
  DESCRIPTION_LENGTH: "description_length",
  EMAIL_LENGTH: "email_length",
  MISSING_CTA: "missing_cta",
  SUBJECT_TOO_LONG: "subject_too_long",
  PLACEHOLDER_TEXT: "placeholder_text",
} as const;
export type ViolationCode = (typeof ViolationCode)[keyof typeof ViolationCode];

export const BRIEF_FIELDS = [
  "product_name",
  "key_features",
  "target_audience",
  "tone",
  "category",
  "price",
  "brand_name",
] as const;
export type BriefFieldName = (typeof BRIEF_FIELDS)[number];

export const REQUIRED_FIELDS: readonly BriefFieldName[] = [
  "product_name",
  "key_features",
  "target_audience",
  "tone",
  "price",
];

export const OPTIONAL_FIELDS: readonly BriefFieldName[] = [
  "category",
  "brand_name",
];

export const QUESTION_PRIORITY: readonly BriefFieldName[] = [
  "product_name",
  "key_features",
  "target_audience",
  "tone",
  "price",
  "category",
  "brand_name",
];

export const BRIEF_METADATA_FIELDS = [
  "assumptions",
  "conflicts",
  "version",
] as const;

export type FieldScalar = string | string[] | null;

export interface FieldValue {
  value: FieldScalar;
  raw_text: string | null;
  status: FieldStatus;
  updated_at_turn: number | null;
  history: Array<string | string[]>;
}

export interface ConflictRecord {
  field: string;
  old_value: FieldScalar;
  new_value: FieldScalar;
  turn: number;
  resolved: boolean;
}

export type ProductBrief = {
  [K in BriefFieldName]: FieldValue;
} & {
  assumptions: string[];
  conflicts: ConflictRecord[];
  version: number;
};

export const IncomingStatus = {
  CONFIRMED: "confirmed",
  VAGUE: "vague",
} as const;
export type IncomingStatus = (typeof IncomingStatus)[keyof typeof IncomingStatus];

export interface FieldUpdate {
  field: BriefFieldName;
  value: FieldScalar;
  raw_text: string | null;
  status: IncomingStatus;
}

export interface ExtractionResult {
  intent: Intent;
  updates: FieldUpdate[];
  off_schema_requests: string[];
}

export interface GateDecision {
  status: GateStatus;
  fields: string[];
  next_field: string | null;
}

export interface MarketingEmail {
  subject: string;
  body: string;
  cta: string;
}

export interface MarketingEmailMeta {
  subject: string;
  cta: string;
}

export interface GeneratedCopy {
  product_description: string;
  marketing_email: MarketingEmail;
}

export type ViolationArtifact = "description" | "email" | "both";

export interface Violation {
  code: ViolationCode;
  message: string;
  artifact: ViolationArtifact;
}

export interface ValidationResult {
  repaired: boolean;
  passed: boolean;
  violations: Violation[];
  pre_repair_violations: Violation[];
}

export interface JudgeVerdict {
  passed: boolean;
  score: number;
  summary: string;
  strengths: string[];
  issues: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  turn: number;
}

export interface Session {
  id: string;
  brief: ProductBrief;
  messages: ChatMessage[];
  turn_number: number;
  last_copy: GeneratedCopy | null;
  last_validation: ValidationResult | null;
  clarified_vague_optionals: Set<string>;
  optional_fields_prompted: Set<string>;
  last_asked_field: string | null;
  awaiting_generation_confirmation: boolean;
  streaming_description: string;
}

const fieldScalarSchema: z.ZodType<FieldScalar> = z.union([
  z.string(),
  z.array(z.string()),
  z.null(),
]);

export const fieldValueSchema = z.object({
  value: fieldScalarSchema.optional().default(null),
  raw_text: z.string().nullable().optional().default(null),
  status: z.enum(["missing", "vague", "confirmed", "conflicted"]).default("missing"),
  updated_at_turn: z.number().int().nullable().optional().default(null),
  history: z.array(z.union([z.string(), z.array(z.string())])).default([]),
});

export const conflictRecordSchema = z.object({
  field: z.string(),
  old_value: fieldScalarSchema,
  new_value: fieldScalarSchema,
  turn: z.number().int(),
  resolved: z.boolean().default(false),
});

export const productBriefSchema = z.object({
  product_name: fieldValueSchema.default({}),
  key_features: fieldValueSchema.default({}),
  target_audience: fieldValueSchema.default({}),
  tone: fieldValueSchema.default({}),
  category: fieldValueSchema.default({}),
  price: fieldValueSchema.default({}),
  brand_name: fieldValueSchema.default({}),
  assumptions: z.array(z.string()).default([]),
  conflicts: z.array(conflictRecordSchema).default([]),
  version: z.number().int().default(0),
});

export const fieldUpdateSchema = z.object({
  field: z.enum(BRIEF_FIELDS),
  value: fieldScalarSchema,
  raw_text: z.string().nullable(),
  status: z.enum(["confirmed", "vague"]),
});

export const extractionResultSchema = z.object({
  intent: z.enum([
    "provide_info",
    "correct_info",
    "request_generation",
    "refine_output",
    "meta_instruction",
    "off_topic",
  ]),
  updates: z.array(fieldUpdateSchema),
  off_schema_requests: z.array(z.string()),
});

export const marketingEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  cta: z.string(),
});

export const marketingEmailMetaSchema = z.object({
  subject: z.string(),
  cta: z.string(),
});

export const generatedCopySchema = z.object({
  product_description: z.string(),
  marketing_email: marketingEmailSchema,
});

export const violationSchema = z.object({
  code: z.enum([
    "missing_price",
    "description_length",
    "email_length",
    "missing_cta",
    "subject_too_long",
    "placeholder_text",
  ]),
  message: z.string(),
  artifact: z.enum(["description", "email", "both"]),
});

export const validationResultSchema = z.object({
  repaired: z.boolean().default(false),
  passed: z.boolean().default(false),
  violations: z.array(violationSchema).default([]),
  pre_repair_violations: z.array(violationSchema).default([]),
});

export const judgeVerdictSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(1).max(10),
  summary: z.string(),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
});

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  turn: z.number().int(),
});

const stringSetFromArray = z
  .array(z.string())
  .default([])
  .transform((items) => new Set(items));

export const sessionSchema = z.object({
  id: z.string(),
  brief: productBriefSchema.default({}),
  messages: z.array(chatMessageSchema).default([]),
  turn_number: z.number().int().default(0),
  last_copy: generatedCopySchema.nullable().default(null),
  last_validation: validationResultSchema.nullable().default(null),
  clarified_vague_optionals: stringSetFromArray,
  optional_fields_prompted: stringSetFromArray,
  last_asked_field: z.string().nullable().default(null),
  awaiting_generation_confirmation: z.boolean().default(false),
  streaming_description: z.string().default(""),
});

export function createFieldValue(partial: Partial<FieldValue> = {}): FieldValue {
  return {
    value: partial.value ?? null,
    raw_text: partial.raw_text ?? null,
    status: partial.status ?? FieldStatus.MISSING,
    updated_at_turn: partial.updated_at_turn ?? null,
    history: partial.history ? [...partial.history] : [],
  };
}

export function createProductBrief(
  partial: Partial<ProductBrief> = {},
): ProductBrief {
  const brief = {
    product_name: createFieldValue(),
    key_features: createFieldValue(),
    target_audience: createFieldValue(),
    tone: createFieldValue(),
    category: createFieldValue(),
    price: createFieldValue(),
    brand_name: createFieldValue(),
    assumptions: [] as string[],
    conflicts: [] as ConflictRecord[],
    version: 0,
  } satisfies ProductBrief;
  return {
    ...brief,
    ...partial,
    product_name: partial.product_name ?? brief.product_name,
    key_features: partial.key_features ?? brief.key_features,
    target_audience: partial.target_audience ?? brief.target_audience,
    tone: partial.tone ?? brief.tone,
    category: partial.category ?? brief.category,
    price: partial.price ?? brief.price,
    brand_name: partial.brand_name ?? brief.brand_name,
    assumptions: partial.assumptions ? [...partial.assumptions] : brief.assumptions,
    conflicts: partial.conflicts ? [...partial.conflicts] : brief.conflicts,
  };
}

export function createSession(
  id: string,
  partial: Partial<Session> = {},
): Session {
  return {
    id,
    brief: partial.brief ?? createProductBrief(),
    messages: partial.messages ? [...partial.messages] : [],
    turn_number: partial.turn_number ?? 0,
    last_copy: partial.last_copy ?? null,
    last_validation: partial.last_validation ?? null,
    clarified_vague_optionals: partial.clarified_vague_optionals
      ? new Set(partial.clarified_vague_optionals)
      : new Set(),
    optional_fields_prompted: partial.optional_fields_prompted
      ? new Set(partial.optional_fields_prompted)
      : new Set(),
    last_asked_field: partial.last_asked_field ?? null,
    awaiting_generation_confirmation:
      partial.awaiting_generation_confirmation ?? false,
    streaming_description: partial.streaming_description ?? "",
  };
}

export function createExtractionResult(
  partial: Partial<ExtractionResult> & Pick<ExtractionResult, "intent">,
): ExtractionResult {
  return {
    intent: partial.intent,
    updates: partial.updates ? [...partial.updates] : [],
    off_schema_requests: partial.off_schema_requests
      ? [...partial.off_schema_requests]
      : [],
  };
}

export function createFieldUpdate(
  partial: Pick<FieldUpdate, "field" | "status"> & Partial<FieldUpdate>,
): FieldUpdate {
  return {
    field: partial.field,
    value: partial.value ?? null,
    raw_text: partial.raw_text ?? null,
    status: partial.status,
  };
}

export function createGateDecision(
  partial: Pick<GateDecision, "status"> & Partial<GateDecision>,
): GateDecision {
  return {
    status: partial.status,
    fields: partial.fields ? [...partial.fields] : [],
    next_field: partial.next_field ?? null,
  };
}

export function createValidationResult(
  partial: Partial<ValidationResult> = {},
): ValidationResult {
  return {
    repaired: partial.repaired ?? false,
    passed: partial.passed ?? false,
    violations: partial.violations ? [...partial.violations] : [],
    pre_repair_violations: partial.pre_repair_violations
      ? [...partial.pre_repair_violations]
      : [],
  };
}

export function cloneProductBrief(brief: ProductBrief): ProductBrief {
  return structuredClone(brief);
}

export function getBriefField(
  brief: ProductBrief,
  name: BriefFieldName,
): FieldValue {
  return brief[name];
}

export function setBriefField(
  brief: ProductBrief,
  name: BriefFieldName,
  field: FieldValue,
): void {
  brief[name] = field;
}

export function productBriefObjectKeys(): string[] {
  return [...BRIEF_FIELDS, ...BRIEF_METADATA_FIELDS];
}
