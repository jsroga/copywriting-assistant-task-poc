import {
  type BriefFieldName,
  type FieldValue,
  type GateDecision,
  type ProductBrief,
  FieldStatus,
  GateStatus,
  OPTIONAL_FIELDS,
  QUESTION_PRIORITY,
  REQUIRED_FIELDS,
  createGateDecision,
} from "./models.ts";

export const MIN_KEY_FEATURES = 1;
export const MIN_MEANINGFUL_FEATURE_CHARS = 3;

export function meaningfulFeatures(
  value: string | string[] | null,
): string[] {
  if (value === null) {
    return [];
  }
  const items = Array.isArray(value) ? value : [value];
  const features: string[] = [];
  for (const item of items) {
    const text = String(item).trim();
    if (
      text.length >= MIN_MEANINGFUL_FEATURE_CHARS &&
      /[0-9A-Za-z]/.test(text)
    ) {
      features.push(text);
    }
  }
  return features;
}

export function isUsable(fieldName: string, field: FieldValue): boolean {
  if (field.status !== FieldStatus.CONFIRMED) {
    return false;
  }
  if (fieldName === "key_features") {
    return meaningfulFeatures(field.value).length >= MIN_KEY_FEATURES;
  }
  if (field.value === null) {
    return false;
  }
  if (typeof field.value === "string" && !field.value.trim()) {
    return false;
  }
  return true;
}

export function unresolvedConflictFields(brief: ProductBrief): string[] {
  const unresolved = new Set<string>();
  for (const conflict of brief.conflicts) {
    if (!conflict.resolved) {
      unresolved.add(conflict.field);
    }
  }
  for (const name of QUESTION_PRIORITY) {
    if (brief[name].status === FieldStatus.CONFLICTED) {
      unresolved.add(name);
    }
  }
  return QUESTION_PRIORITY.filter((name) => unresolved.has(name));
}

export function missingRequiredFields(brief: ProductBrief): string[] {
  const missing: string[] = [];
  for (const name of QUESTION_PRIORITY) {
    if (!REQUIRED_FIELDS.includes(name)) {
      continue;
    }
    if (!isUsable(name, brief[name])) {
      missing.push(name);
    }
  }
  return missing;
}

export function pendingOptionalFields(
  brief: ProductBrief,
  optionalFieldsPrompted: Iterable<string> | null = null,
): string[] {
  const prompted = new Set(optionalFieldsPrompted ?? []);
  const pending: string[] = [];
  for (const name of QUESTION_PRIORITY) {
    if (!OPTIONAL_FIELDS.includes(name)) {
      continue;
    }
    if (prompted.has(name)) {
      continue;
    }
    const field = brief[name];
    if (field.status === FieldStatus.MISSING || field.status === FieldStatus.VAGUE) {
      pending.push(name);
    }
  }
  return pending;
}

export function vagueOptionalFields(
  brief: ProductBrief,
  clarifiedVagueOptionals: Iterable<string> | null = null,
): string[] {
  return pendingOptionalFields(brief, clarifiedVagueOptionals).filter(
    (name) => brief[name as BriefFieldName].status === FieldStatus.VAGUE,
  );
}

export function evaluateReadiness(
  brief: ProductBrief,
  clarifiedVagueOptionals: Iterable<string> | null = null,
  optionalFieldsPrompted: Iterable<string> | null = null,
): GateDecision {
  const prompted = new Set(optionalFieldsPrompted ?? []);
  for (const name of clarifiedVagueOptionals ?? []) {
    prompted.add(name);
  }

  const conflicts = unresolvedConflictFields(brief);
  if (conflicts.length > 0) {
    return createGateDecision({
      status: GateStatus.NEEDS_CLARIFICATION,
      fields: conflicts,
      next_field: conflicts[0],
    });
  }

  const missing = missingRequiredFields(brief);
  if (missing.length > 0) {
    return createGateDecision({
      status: GateStatus.NEEDS_INFO,
      fields: missing,
      next_field: missing[0],
    });
  }

  const pendingOptional = pendingOptionalFields(brief, prompted);
  if (pendingOptional.length > 0) {
    const nextField = pendingOptional[0];
    const field = brief[nextField as BriefFieldName];
    const status =
      field.status === FieldStatus.VAGUE
        ? GateStatus.NEEDS_CLARIFICATION
        : GateStatus.NEEDS_INFO;
    return createGateDecision({
      status,
      fields: pendingOptional,
      next_field: nextField,
    });
  }

  return createGateDecision({
    status: GateStatus.READY,
    fields: [],
    next_field: null,
  });
}
