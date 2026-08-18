import { meaningfulFeatures } from "../domain/gate.ts";
import {
  type BriefFieldName,
  type ExtractionResult,
  type FieldUpdate,
  type Session,
  REQUIRED_FIELDS,
} from "../domain/models.ts";

const PRICE_CONFIRMED_RE = /\d|(?:pln|usd|eur|gbp|zł)\b|[$€£]/i;
const PRICE_VAGUE_RE =
  /\b(cheap|cheaper|cheapest|expensive|affordable|budget|pricey|inexpensive|costly|reasonable|low[\s-]?cost|high[\s-]?end|around|about|approximately|roughly|starting|from)\b/i;

function priceText(update: FieldUpdate): string {
  if (update.status === "confirmed" && update.value !== null) {
    if (Array.isArray(update.value)) {
      return update.value.map((item) => String(item)).join(" ");
    }
    return String(update.value);
  }
  return update.raw_text ?? "";
}

function isAcceptablePrice(update: FieldUpdate): boolean {
  const text = priceText(update).trim();
  if (!text) {
    return false;
  }
  if (update.status === "confirmed") {
    return PRICE_CONFIRMED_RE.test(text);
  }
  return PRICE_VAGUE_RE.test(text);
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
