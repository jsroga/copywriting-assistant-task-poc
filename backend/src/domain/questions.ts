import {
  type ConflictRecord,
  type GateDecision,
  type ProductBrief,
  GateStatus,
} from "./models.ts";

export const QUESTIONS: Record<string, string> = {
  product_name: "What is the product called?",
  key_features: "What features should customers care about most?",
  target_audience: "Who is the main customer for this product?",
  tone:
    "What tone should the copy use, for example premium, playful, " +
    "technical, or minimal?",
  price:
    "What is the exact price I should use in the copy " +
    "(for example 199 PLN or $49)?",
  category: "Which product category should I use?",
  brand_name: "Should the brand name appear in the copy?",
};

function formatValue(value: string | string[] | null): string {
  if (value === null) {
    return "(unknown)";
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }
  return String(value);
}

export function conflictQuestion(conflict: ConflictRecord): string {
  const oldValue = formatValue(conflict.old_value);
  const newValue = formatValue(conflict.new_value);
  return `I have both ${oldValue} and ${newValue} for this value. Which one should I use?`;
}

export function latestUnresolvedConflict(
  brief: ProductBrief,
  fieldName: string | null,
): ConflictRecord | null {
  if (fieldName === null) {
    return null;
  }
  for (let index = brief.conflicts.length - 1; index >= 0; index -= 1) {
    const conflict = brief.conflicts[index];
    if (conflict.field === fieldName && !conflict.resolved) {
      return conflict;
    }
  }
  return null;
}

export function buildQuestion(brief: ProductBrief, gate: GateDecision): string {
  if (gate.status === GateStatus.READY || gate.next_field === null) {
    return "Is there anything else you'd like to refine about the product?";
  }

  if (gate.status === GateStatus.NEEDS_CLARIFICATION) {
    const conflict = latestUnresolvedConflict(brief, gate.next_field);
    if (conflict !== null) {
      return conflictQuestion(conflict);
    }
  }

  return (
    QUESTIONS[gate.next_field] ??
    `Could you provide more detail about ${gate.next_field.replaceAll("_", " ")}?`
  );
}
