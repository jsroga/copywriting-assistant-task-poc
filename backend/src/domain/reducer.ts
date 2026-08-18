import {
  type ExtractionResult,
  type FieldUpdate,
  type FieldValue,
  type IncomingStatus,
  type Intent,
  type ProductBrief,
  FieldStatus,
  Intent as IntentValues,
  cloneProductBrief,
  getBriefField,
  setBriefField,
} from "./models.ts";

function normalizeComparable(
  value: string | string[] | null,
): string | readonly string[] | null {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase());
  }
  return String(value).trim().toLowerCase();
}

function valuesEqual(
  a: string | string[] | null,
  b: string | string[] | null,
): boolean {
  const left = normalizeComparable(a);
  const right = normalizeComparable(b);
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  return left === right;
}

function markConflictsResolved(brief: ProductBrief, fieldName: string): void {
  for (const conflict of brief.conflicts) {
    if (conflict.field === fieldName && !conflict.resolved) {
      conflict.resolved = true;
    }
  }
}

function vagueRawText(update: FieldUpdate, field: FieldValue): string | null {
  if (update.raw_text !== null) {
    return update.raw_text;
  }
  if (typeof update.value === "string") {
    return update.value;
  }
  return field.raw_text;
}

function cloneField(field: FieldValue): FieldValue {
  return {
    value: Array.isArray(field.value) ? [...field.value] : field.value,
    raw_text: field.raw_text,
    status: field.status,
    updated_at_turn: field.updated_at_turn,
    history: field.history.map((item) => (Array.isArray(item) ? [...item] : item)),
  };
}

function applyWrite(
  field: FieldValue,
  update: FieldUpdate,
  turnNumber: number,
  appendHistory: boolean,
): FieldValue {
  const updated = cloneField(field);
  const hadValue =
    field.status === FieldStatus.CONFIRMED || field.status === FieldStatus.CONFLICTED;
  if (appendHistory && hadValue && field.value !== null) {
    updated.history = [...field.history, field.value];
  }
  if (update.status === "vague") {
    updated.value = null;
    updated.raw_text = vagueRawText(update, field);
    updated.status = FieldStatus.VAGUE;
  } else {
    updated.value = update.value;
    updated.raw_text = update.raw_text;
    updated.status = FieldStatus.CONFIRMED;
  }
  updated.updated_at_turn = turnNumber;
  return updated;
}

function matchesConflictSide(brief: ProductBrief, update: FieldUpdate): boolean {
  for (const conflict of brief.conflicts) {
    if (conflict.field !== update.field || conflict.resolved) {
      continue;
    }
    if (
      valuesEqual(conflict.old_value, update.value) ||
      valuesEqual(conflict.new_value, update.value)
    ) {
      return true;
    }
  }
  return false;
}

interface Change {
  brief: ProductBrief;
  field: FieldValue;
  update: FieldUpdate;
  intent: Intent;
  turnNumber: number;
}

function write(change: Change, appendHistory: boolean): void {
  setBriefField(
    change.brief,
    change.update.field,
    applyWrite(change.field, change.update, change.turnNumber, appendHistory),
  );
}

function resolveConflicts(change: Change): void {
  markConflictsResolved(change.brief, change.update.field);
}

function accept(change: Change): boolean {
  write(change, false);
  return true;
}

function ignore(_change: Change): boolean {
  return false;
}

function vagueOverConfirmed(change: Change): boolean {
  if (change.intent !== IntentValues.CORRECT_INFO) {
    return false;
  }
  write(change, true);
  resolveConflicts(change);
  return true;
}

function resolveConflicted(change: Change): boolean {
  if (
    change.intent !== IntentValues.CORRECT_INFO &&
    !matchesConflictSide(change.brief, change.update)
  ) {
    return false;
  }
  const written = applyWrite(
    change.field,
    change.update,
    change.turnNumber,
    true,
  );
  written.status = FieldStatus.CONFIRMED;
  setBriefField(change.brief, change.update.field, written);
  resolveConflicts(change);
  return true;
}

function refreshMetadata(change: Change): boolean {
  const meta = cloneField(change.field);
  meta.updated_at_turn = change.turnNumber;
  if (change.update.raw_text !== null) {
    meta.raw_text = change.update.raw_text;
  }
  setBriefField(change.brief, change.update.field, meta);
  return false;
}

function recordConflict(change: Change): boolean {
  const conflicted = cloneField(change.field);
  conflicted.status = FieldStatus.CONFLICTED;
  conflicted.updated_at_turn = change.turnNumber;
  setBriefField(change.brief, change.update.field, conflicted);
  change.brief.conflicts.push({
    field: change.update.field,
    old_value: change.field.value,
    new_value: change.update.value,
    turn: change.turnNumber,
    resolved: false,
  });
  return true;
}

function replaceConfirmed(change: Change): boolean {
  if (valuesEqual(change.field.value, change.update.value)) {
    return refreshMetadata(change);
  }
  if (change.intent === IntentValues.CORRECT_INFO) {
    write(change, true);
    resolveConflicts(change);
    return true;
  }
  return recordConflict(change);
}

type Transition = (change: Change) => boolean;

export const TRANSITIONS: Record<`${IncomingStatus}|${FieldStatus}`, Transition> = {
  "vague|missing": accept,
  "vague|vague": accept,
  "vague|confirmed": vagueOverConfirmed,
  "vague|conflicted": ignore,
  "confirmed|missing": accept,
  "confirmed|vague": accept,
  "confirmed|confirmed": replaceConfirmed,
  "confirmed|conflicted": resolveConflicted,
};

function applyUpdate(
  brief: ProductBrief,
  update: FieldUpdate,
  intent: Intent,
  turnNumber: number,
): boolean {
  const field = getBriefField(brief, update.field);
  const key = `${update.status}|${field.status}` as `${IncomingStatus}|${FieldStatus}`;
  const transition = TRANSITIONS[key];
  return transition({
    brief,
    field,
    update,
    intent,
    turnNumber,
  });
}

export function reduceBrief(
  brief: ProductBrief,
  extraction: ExtractionResult,
  turnNumber: number,
): ProductBrief {
  const result = cloneProductBrief(brief);
  let mutated = false;

  for (const update of extraction.updates) {
    if (extraction.intent === IntentValues.META_INSTRUCTION) {
      if (update.value === null && update.raw_text === null) {
        continue;
      }
    }
    if (applyUpdate(result, update, extraction.intent, turnNumber)) {
      mutated = true;
    }
  }

  if (mutated) {
    result.version += 1;
  }
  return result;
}
