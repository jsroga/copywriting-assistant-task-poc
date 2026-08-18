import type {
  ConflictRecord,
  FieldValue,
  GateDecision,
  GeneratedCopy,
  ProductBrief,
  Session,
  ValidationResult,
  Violation,
} from "./models.ts";
import { BRIEF_FIELDS } from "./models.ts";

export function fieldValueToJson(field: FieldValue): Record<string, unknown> {
  return {
    value: field.value,
    raw_text: field.raw_text,
    status: field.status,
    updated_at_turn: field.updated_at_turn,
    history: field.history,
  };
}

export function conflictToJson(conflict: ConflictRecord): Record<string, unknown> {
  return {
    field: conflict.field,
    old_value: conflict.old_value,
    new_value: conflict.new_value,
    turn: conflict.turn,
    resolved: conflict.resolved,
  };
}

export function serializeBrief(brief: ProductBrief): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    assumptions: [...brief.assumptions],
    conflicts: brief.conflicts.map(conflictToJson),
    version: brief.version,
  };
  for (const name of BRIEF_FIELDS) {
    payload[name] = fieldValueToJson(brief[name]);
  }
  return payload;
}

export function gateToJson(gate: GateDecision): Record<string, unknown> {
  return {
    status: gate.status,
    fields: [...gate.fields],
    next_field: gate.next_field,
  };
}

export function violationToJson(violation: Violation): Record<string, unknown> {
  return {
    code: violation.code,
    message: violation.message,
    artifact: violation.artifact,
  };
}

export function validationToJson(
  validation: ValidationResult,
): Record<string, unknown> {
  return {
    repaired: validation.repaired,
    passed: validation.passed,
    violations: validation.violations.map(violationToJson),
    pre_repair_violations: validation.pre_repair_violations.map(violationToJson),
  };
}

export function generatedCopyToJson(copy: GeneratedCopy): Record<string, unknown> {
  return {
    product_description: copy.product_description,
    marketing_email: {
      subject: copy.marketing_email.subject,
      body: copy.marketing_email.body,
      cta: copy.marketing_email.cta,
    },
  };
}

export function sessionToJson(session: Session): Record<string, unknown> {
  return {
    id: session.id,
    brief: serializeBrief(session.brief),
    messages: session.messages.map((message) => ({ ...message })),
    turn_number: session.turn_number,
    last_copy: session.last_copy ? generatedCopyToJson(session.last_copy) : null,
    last_validation: session.last_validation
      ? validationToJson(session.last_validation)
      : null,
    clarified_vague_optionals: [...session.clarified_vague_optionals],
    optional_fields_prompted: [...session.optional_fields_prompted],
    last_asked_field: session.last_asked_field,
    awaiting_generation_confirmation: session.awaiting_generation_confirmation,
    streaming_description: session.streaming_description,
  };
}
