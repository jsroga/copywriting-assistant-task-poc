import type { GateDecision, GeneratedCopy, ValidationResult } from "../domain/models.ts";
import { GateStatus, createGateDecision } from "../domain/models.ts";
import { serializeBrief } from "../domain/serialize.ts";
import type { ProductBrief } from "../domain/models.ts";

export const RESPONSE_TYPES = [
  "question",
  "ready_for_confirmation",
  "generated_copy",
  "validation_failed",
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

export const TERMINAL_EVENTS: ReadonlySet<string> = new Set(RESPONSE_TYPES);

export type TurnEvent = [string, unknown];

export interface TurnResponse {
  type: ResponseType;
  message: string;
  brief: Record<string, unknown>;
  gate: GateDecision;
  copy: GeneratedCopy | null;
  validation: ValidationResult | null;
  streaming: boolean;
}

export function createTurnResponse(partial: {
  type: ResponseType;
  message: string;
  brief: Record<string, unknown>;
  gate: GateDecision;
  copy?: GeneratedCopy | null;
  validation?: ValidationResult | null;
  streaming?: boolean;
}): TurnResponse {
  return {
    type: partial.type,
    message: partial.message,
    brief: partial.brief,
    gate: partial.gate,
    copy: partial.copy ?? null,
    validation: partial.validation ?? null,
    streaming: partial.streaming ?? false,
  };
}

export { serializeBrief };

export function turnResponseToJson(response: TurnResponse): Record<string, unknown> {
  return {
    type: response.type,
    message: response.message,
    brief: response.brief,
    gate: {
      status: response.gate.status,
      fields: [...response.gate.fields],
      next_field: response.gate.next_field,
    },
    copy: response.copy
      ? {
          product_description: response.copy.product_description,
          marketing_email: { ...response.copy.marketing_email },
        }
      : null,
    validation: response.validation
      ? {
          repaired: response.validation.repaired,
          passed: response.validation.passed,
          violations: response.validation.violations.map((item) => ({ ...item })),
          pre_repair_violations: response.validation.pre_repair_violations.map(
            (item) => ({ ...item }),
          ),
        }
      : null,
    streaming: response.streaming,
  };
}

export function sseFrame(event: string, data: unknown): string {
  const payload =
    data !== null &&
    typeof data === "object" &&
    "type" in data &&
    "message" in data &&
    "brief" in data &&
    "gate" in data
      ? turnResponseToJson(data as TurnResponse)
      : data;
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function priceGate(): GateDecision {
  return createGateDecision({
    status: GateStatus.NEEDS_INFO,
    fields: ["price"],
    next_field: "price",
  });
}
