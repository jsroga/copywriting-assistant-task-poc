import { evaluateReadiness, isUsable } from "../domain/gate.ts";
import {
  type ExtractionResult,
  type GateDecision,
  type Session,
  GateStatus,
  Intent,
  OPTIONAL_FIELDS,
  createGateDecision,
} from "../domain/models.ts";
import { buildQuestion } from "../domain/questions.ts";
import { reduceBrief } from "../domain/reducer.ts";
import type { LLMClient } from "../ports.ts";
import type { SessionStore } from "../store.ts";
import { filterInvalidAskedFieldUpdates } from "./answer_guard.ts";
import { CopyPipeline } from "./generation.ts";
import {
  CONFIRMATION_MESSAGE,
  CONFIRMATION_PENDING_MESSAGE,
  META_CONTAINMENT_MESSAGE,
  NOT_READY_GENERATION_MESSAGE,
  OFF_TOPIC_MESSAGE,
  OPTIONAL_SKIPPED_ASSUMPTION,
  PRICE_REQUIRED_MESSAGE,
  cannotExtractMessage,
  isAffirmative,
} from "./messages.ts";
import {
  TERMINAL_EVENTS,
  type TurnEvent,
  type TurnResponse,
  createTurnResponse,
  priceGate,
  serializeBrief,
} from "./responses.ts";
import {
  addVagueAssumptions,
  recordOptionalProgress,
  recordVagueClarification,
  rememberAskedField,
} from "./session_effects.ts";

const HISTORY_TAIL = 4;

function historyTail(session: Session) {
  return session.messages.slice(-HISTORY_TAIL);
}

function hasBriefUpdates(extraction: ExtractionResult): boolean {
  if (extraction.updates.length > 0) {
    return true;
  }
  return (
    extraction.intent === Intent.CORRECT_INFO ||
    extraction.intent === Intent.REFINE_OUTPUT
  );
}

function blockedOnlyByOptional(gate: GateDecision): boolean {
  if (gate.status === GateStatus.READY) {
    return false;
  }
  return (
    gate.fields.length > 0 &&
    gate.fields.every((name) =>
      OPTIONAL_FIELDS.includes(name as (typeof OPTIONAL_FIELDS)[number]),
    )
  );
}

function shouldGenerateNow(
  session: Session,
  extraction: ExtractionResult,
  text: string,
): boolean {
  if (extraction.intent === Intent.REQUEST_GENERATION) {
    return true;
  }
  if (!session.awaiting_generation_confirmation) {
    return false;
  }
  if (hasBriefUpdates(extraction)) {
    return false;
  }
  return isAffirmative(text);
}

export class ConversationOrchestrator {
  readonly store: SessionStore;
  readonly llm: LLMClient;
  readonly copyPipeline: CopyPipeline;

  constructor(options: { store: SessionStore; llm: LLMClient }) {
    this.store = options.store;
    this.llm = options.llm;
    this.copyPipeline = new CopyPipeline(options.store, options.llm);
  }

  async handleTurn(sessionId: string, message: string): Promise<TurnResponse> {
    let final: TurnResponse | null = null;
    for await (const [eventName, payload] of this.iterTurnEvents(
      sessionId,
      message,
    )) {
      if (TERMINAL_EVENTS.has(eventName)) {
        final = payload as TurnResponse;
      }
    }
    if (final === null) {
      throw new Error("turn produced no response");
    }
    return final;
  }

  async *iterTurnEvents(
    sessionId: string,
    message: string,
  ): AsyncGenerator<TurnEvent> {
    const text = message.trim();
    if (!text) {
      throw new Error("message must not be empty");
    }

    const session = this.store.getOrCreate(sessionId);
    session.turn_number += 1;
    const turn = session.turn_number;
    session.streaming_description = "";
    session.messages.push({ role: "user", content: text, turn });
    this.store.save(session);

    yield ["validation_status", { phase: "extracting" }];

    const extracted = await this.llm.extract(
      text,
      session.brief,
      historyTail(session),
    );
    const { extraction, rejectedField } = filterInvalidAskedFieldUpdates(
      session,
      extracted,
    );
    session.brief = reduceBrief(session.brief, extraction, turn);
    recordOptionalProgress(session, extraction, text, turn);
    addVagueAssumptions(session);
    this.store.save(session);

    let gate = evaluateReadiness(
      session.brief,
      session.clarified_vague_optionals,
      session.optional_fields_prompted,
    );

    if (
      extraction.intent === Intent.REQUEST_GENERATION &&
      blockedOnlyByOptional(gate)
    ) {
      gate = this.skipPendingOptionals(session, gate);
    }

    if (rejectedField !== null) {
      gate = createGateDecision({
        status: GateStatus.NEEDS_INFO,
        fields: [rejectedField],
        next_field: rejectedField,
      });
      rememberAskedField(session, gate);
      yield [
        "question",
        this.finishQuestion(
          session,
          gate,
          `${cannotExtractMessage(rejectedField)} ${buildQuestion(session.brief, gate)}`,
        ),
      ];
      return;
    }

    const early = this.earlyExit(session, extraction, gate, text);
    if (early !== null) {
      yield early;
      return;
    }

    if (!isUsable("price", session.brief.price)) {
      gate = priceGate();
      rememberAskedField(session, gate);
      yield [
        "question",
        this.finishQuestion(
          session,
          gate,
          `${PRICE_REQUIRED_MESSAGE} ${buildQuestion(session.brief, gate)}`,
        ),
      ];
      return;
    }

    yield* this.readyPath(session, extraction, gate, text);
  }

  private skipPendingOptionals(
    session: Session,
    gate: GateDecision,
  ): GateDecision {
    for (const name of gate.fields) {
      session.optional_fields_prompted.add(name);
      const assumption = OPTIONAL_SKIPPED_ASSUMPTION.replace("{field}", name);
      if (!session.brief.assumptions.includes(assumption)) {
        session.brief.assumptions.push(assumption);
      }
    }
    this.store.save(session);
    return evaluateReadiness(
      session.brief,
      session.clarified_vague_optionals,
      session.optional_fields_prompted,
    );
  }

  private earlyExit(
    session: Session,
    extraction: ExtractionResult,
    gate: GateDecision,
    text: string,
  ): TurnEvent | null {
    void text;
    if (extraction.intent === Intent.META_INSTRUCTION) {
      return [
        "question",
        this.finishQuestion(
          session,
          gate,
          `${META_CONTAINMENT_MESSAGE} ${buildQuestion(session.brief, gate)}`.trim(),
        ),
      ];
    }

    if (extraction.intent === Intent.OFF_TOPIC && extraction.updates.length === 0) {
      return [
        "question",
        this.finishQuestion(
          session,
          gate,
          `${OFF_TOPIC_MESSAGE} ${buildQuestion(session.brief, gate)}`.trim(),
        ),
      ];
    }

    if (
      extraction.intent === Intent.REQUEST_GENERATION &&
      gate.status !== GateStatus.READY
    ) {
      rememberAskedField(session, gate);
      recordVagueClarification(session, gate);
      return [
        "question",
        this.finishQuestion(
          session,
          gate,
          `${NOT_READY_GENERATION_MESSAGE} ${buildQuestion(session.brief, gate)}`,
        ),
      ];
    }

    if (gate.status !== GateStatus.READY) {
      rememberAskedField(session, gate);
      recordVagueClarification(session, gate);
      return [
        "question",
        this.finishQuestion(session, gate, buildQuestion(session.brief, gate)),
      ];
    }
    return null;
  }

  private async *readyPath(
    session: Session,
    extraction: ExtractionResult,
    gate: GateDecision,
    text: string,
  ): AsyncGenerator<TurnEvent> {
    if (shouldGenerateNow(session, extraction, text)) {
      yield* this.copyPipeline.run(session, gate);
      return;
    }

    const message = session.awaiting_generation_confirmation
      ? CONFIRMATION_PENDING_MESSAGE
      : CONFIRMATION_MESSAGE;
    yield [
      "ready_for_confirmation",
      this.askGenerationConfirmation(session, gate, message),
    ];
  }

  private askGenerationConfirmation(
    session: Session,
    gate: GateDecision,
    message: string,
  ): TurnResponse {
    session.awaiting_generation_confirmation = true;
    session.streaming_description = "";
    session.messages.push({
      role: "assistant",
      content: message,
      turn: session.turn_number,
    });
    this.store.save(session);
    return createTurnResponse({
      type: "ready_for_confirmation",
      message,
      brief: serializeBrief(session.brief),
      gate,
      copy: null,
      validation: null,
    });
  }

  private finishQuestion(
    session: Session,
    gate: GateDecision,
    message: string,
  ): TurnResponse {
    session.messages.push({
      role: "assistant",
      content: message,
      turn: session.turn_number,
    });
    this.store.save(session);
    return createTurnResponse({
      type: "question",
      message,
      brief: serializeBrief(session.brief),
      gate,
    });
  }
}
