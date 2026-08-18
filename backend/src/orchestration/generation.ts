import type { GateDecision, GeneratedCopy, Session, ValidationResult } from "../domain/models.ts";
import { validate } from "../domain/validation/index.ts";
import { validationToJson, violationToJson } from "../domain/serialize.ts";
import { createValidationResult } from "../domain/models.ts";
import type { LLMClient } from "../ports.ts";
import type { SessionStore } from "../store.ts";
import {
  COPY_READY_AFTER_REPAIR_MESSAGE,
  COPY_READY_MESSAGE,
  VALIDATION_FAILED_MESSAGE,
} from "./messages.ts";
import {
  type ResponseType,
  type TurnEvent,
  createTurnResponse,
  serializeBrief,
} from "./responses.ts";

export class CopyPipeline {
  constructor(
    private readonly store: SessionStore,
    private readonly llm: LLMClient,
  ) {}

  async *run(
    session: Session,
    gate: GateDecision,
  ): AsyncGenerator<TurnEvent> {
    yield ["validation_status", { phase: "generating" }];
    const chunks: string[] = [];
    for await (const chunk of this.llm.streamProductDescription(session.brief)) {
      chunks.push(chunk);
      session.streaming_description = chunks.join("");
      yield ["description_delta", { text: chunk }];
    }
    const description = chunks.join("").trim();

    yield ["validation_status", { phase: "building_email" }];
    const emailChunks: string[] = [];
    for await (const chunk of this.llm.streamEmailBody(session.brief, description)) {
      emailChunks.push(chunk);
      yield ["email_delta", { text: chunk }];
    }
    const emailBody = emailChunks.join("").trim();

    yield ["validation_status", { phase: "validating" }];
    const email = await this.llm.generateEmail(session.brief, description, {
      body: emailBody,
    });
    const generated: GeneratedCopy = {
      product_description: description,
      marketing_email: email,
    };
    yield* this.validateThenDeliverOrFail(session, gate, generated);
  }

  private async *validateThenDeliverOrFail(
    session: Session,
    gate: GateDecision,
    generated: GeneratedCopy,
  ): AsyncGenerator<TurnEvent> {
    const violations = validate(generated, session.brief);

    if (violations.length === 0) {
      const validation = createValidationResult({ repaired: false, passed: true });
      yield [
        "validation_status",
        { phase: "done", validation: validationToJson(validation) },
      ];
      yield ["generated_copy", this.deliver(session, gate, generated, validation)];
      return;
    }

    yield [
      "validation_status",
      {
        phase: "repairing",
        pre_repair_violations: violations.map(violationToJson),
      },
    ];
    const repaired = await this.llm.repair(session.brief, generated, violations);
    const finalViolations = validate(repaired, session.brief);
    const validation = createValidationResult({
      repaired: true,
      passed: finalViolations.length === 0,
      violations: finalViolations,
      pre_repair_violations: violations,
    });
    yield [
      "validation_status",
      { phase: "done", validation: validationToJson(validation) },
    ];

    if (validation.passed) {
      yield ["generated_copy", this.deliver(session, gate, repaired, validation)];
      return;
    }
    yield ["validation_failed", this.fail(session, gate, repaired, validation)];
  }

  private deliver(
    session: Session,
    gate: GateDecision,
    copy: GeneratedCopy,
    validation: ValidationResult,
  ) {
    const message =
      validation.repaired && validation.passed
        ? COPY_READY_AFTER_REPAIR_MESSAGE
        : COPY_READY_MESSAGE;
    return this.finish(session, gate, copy, validation, "generated_copy", message);
  }

  private fail(
    session: Session,
    gate: GateDecision,
    copy: GeneratedCopy,
    validation: ValidationResult,
  ) {
    return this.finish(
      session,
      gate,
      copy,
      validation,
      "validation_failed",
      VALIDATION_FAILED_MESSAGE,
    );
  }

  private finish(
    session: Session,
    gate: GateDecision,
    copy: GeneratedCopy,
    validation: ValidationResult,
    responseType: ResponseType,
    message: string,
  ) {
    session.awaiting_generation_confirmation = false;
    session.last_copy = copy;
    session.last_validation = validation;
    session.streaming_description = "";
    session.messages.push({
      role: "assistant",
      content: message,
      turn: session.turn_number,
    });
    this.store.save(session);
    return createTurnResponse({
      type: responseType,
      message,
      brief: serializeBrief(session.brief),
      gate,
      copy,
      validation,
    });
  }
}