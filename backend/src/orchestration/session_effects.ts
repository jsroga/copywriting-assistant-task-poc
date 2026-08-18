import {
  type ExtractionResult,
  type GateDecision,
  type Session,
  FieldStatus,
  OPTIONAL_FIELDS,
  GateStatus,
} from "../domain/models.ts";
import {
  OPTIONAL_SKIPPED_ASSUMPTION,
  isDeclineOptional,
} from "./messages.ts";

export function recordVagueClarification(
  session: Session,
  gate: GateDecision,
): void {
  if (gate.status !== GateStatus.NEEDS_CLARIFICATION) {
    return;
  }
  const nextField = gate.next_field;
  if (
    nextField === null ||
    !OPTIONAL_FIELDS.includes(nextField as (typeof OPTIONAL_FIELDS)[number])
  ) {
    return;
  }
  const field = session.brief[nextField as (typeof OPTIONAL_FIELDS)[number]];
  if (field.status === FieldStatus.VAGUE) {
    session.clarified_vague_optionals.add(nextField);
  }
}

export function addVagueAssumptions(session: Session): void {
  for (const fieldName of session.clarified_vague_optionals) {
    const field =
      session.brief[fieldName as (typeof OPTIONAL_FIELDS)[number]];
    if (field.status !== FieldStatus.VAGUE) {
      continue;
    }
    const assumption =
      `${fieldName} kept qualitative from raw text ` +
      `('${field.raw_text}') without inventing a precise value.`;
    if (!session.brief.assumptions.includes(assumption)) {
      session.brief.assumptions.push(assumption);
    }
  }
}

export function recordOptionalProgress(
  session: Session,
  extraction: ExtractionResult,
  text: string,
  turn: number,
): void {
  for (const name of OPTIONAL_FIELDS) {
    const field = session.brief[name];
    if (
      field.updated_at_turn === turn &&
      (field.status === FieldStatus.CONFIRMED || field.status === FieldStatus.VAGUE)
    ) {
      session.optional_fields_prompted.add(name);
    }
  }

  const asked = session.last_asked_field;
  if (
    asked !== null &&
    OPTIONAL_FIELDS.includes(asked as (typeof OPTIONAL_FIELDS)[number]) &&
    isDeclineOptional(text) &&
    extraction.updates.length === 0
  ) {
    session.optional_fields_prompted.add(asked);
    const assumption = OPTIONAL_SKIPPED_ASSUMPTION.replace("{field}", asked);
    if (!session.brief.assumptions.includes(assumption)) {
      session.brief.assumptions.push(assumption);
    }
  }
}

export function rememberAskedField(session: Session, gate: GateDecision): void {
  session.last_asked_field = gate.next_field;
}
