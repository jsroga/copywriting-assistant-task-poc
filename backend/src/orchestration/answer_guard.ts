import { meaningfulFeatures } from "../domain/gate.ts";
import {
  type BriefFieldName,
  type ExtractionResult,
  type FieldUpdate,
  type Session,
  REQUIRED_FIELDS,
} from "../domain/models.ts";

function nonEmptyText(value: string | string[] | null): boolean {
  if (typeof value === "string") {
    return Boolean(value.trim());
  }
  if (Array.isArray(value)) {
    return value.some((item) => String(item).trim());
  }
  return false;
}

function isAcceptablePrice(update: FieldUpdate): boolean {
  if (update.status === "confirmed") {
    return nonEmptyText(update.value);
  }
  return Boolean((update.raw_text ?? "").trim());
}

function isAcceptableAnswer(field: BriefFieldName, update: FieldUpdate): boolean {
  if (field === "price") {
    return isAcceptablePrice(update);
  }
  if (update.status !== "confirmed") {
    return false;
  }
  if (update.value === null) {
    return false;
  }
  if (field === "key_features") {
    return meaningfulFeatures(update.value).length > 0;
  }
  if (typeof update.value === "string") {
    return Boolean(update.value.trim());
  }
  if (Array.isArray(update.value)) {
    return meaningfulFeatures(update.value).length > 0;
  }
  return true;
}

export function filterInvalidAskedFieldUpdates(
  session: Session,
  extraction: ExtractionResult,
): { extraction: ExtractionResult; rejectedField: BriefFieldName | null } {
  const asked = session.last_asked_field;
  if (asked === null || !REQUIRED_FIELDS.includes(asked as BriefFieldName)) {
    return { extraction, rejectedField: null };
  }

  const field = asked as BriefFieldName;
  const kept: FieldUpdate[] = [];
  let rejectedAsked = false;
  for (const update of extraction.updates) {
    if (update.field !== field) {
      kept.push(update);
      continue;
    }
    if (isAcceptableAnswer(field, update)) {
      kept.push(update);
    } else {
      rejectedAsked = true;
    }
  }

  if (!rejectedAsked) {
    return { extraction, rejectedField: null };
  }

  return {
    extraction: { ...extraction, updates: kept },
    rejectedField: field,
  };
}
