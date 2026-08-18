import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OpenAICompatibleLLMClient, resolveLlmCredentials } from "../src/llm/openai_compatible_client.ts";
import { ConversationOrchestrator } from "../src/orchestration/engine.ts";
import { generatedCopyToJson, validationToJson } from "../src/domain/serialize.ts";
import { SessionStore } from "../src/store.ts";
import type { TurnResponse } from "../src/orchestration/responses.ts";

const PRODUCT_LINE =
  "Fotel Gamingowy IMBA SEAT Biurowy Obrotowy Regulowany Materiał";

const FIELD_ANSWERS: Record<string, string> = {
  key_features:
    "Obrotowy, regulowany, tapicerka materiałowa, biurowy i gamingowy w jednym",
  target_audience: "gamers and office workers",
  tone: "playful",
  price: "899 PLN",
  category: "skip",
  brand_name: "IMBA SEAT",
  product_name: PRODUCT_LINE,
};

function hasLiveKey(): boolean {
  const fakeFlag = (process.env.USE_FAKE_LLM ?? "").toLowerCase();
  if (["1", "true", "yes"].includes(fakeFlag)) {
    return false;
  }
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return false;
  }
  if (key.startsWith("sk-your-key") || key.includes("your-key-here")) {
    return false;
  }
  return true;
}

function log(message: string): void {
  console.log(message);
}

function answerFor(gate: { next_field?: string | null }, assistantMessage: string): string {
  const nextField = gate.next_field;
  if (typeof nextField === "string" && nextField in FIELD_ANSWERS) {
    return FIELD_ANSWERS[nextField];
  }
  const lowered = assistantMessage.toLowerCase();
  if (lowered.includes("price")) {
    return FIELD_ANSWERS.price;
  }
  if (lowered.includes("tone")) {
    return FIELD_ANSWERS.tone;
  }
  if (lowered.includes("audience") || lowered.includes("customer")) {
    return FIELD_ANSWERS.target_audience;
  }
  if (lowered.includes("feature")) {
    return FIELD_ANSWERS.key_features;
  }
  if (lowered.includes("brand")) {
    return FIELD_ANSWERS.brand_name;
  }
  if (lowered.includes("category")) {
    return FIELD_ANSWERS.category;
  }
  return "confirm";
}

describe.skipIf(!hasLiveKey())("live e2e imba seat", () => {
  it(
    "test_imba_seat_full_flow_with_llm_judge",
    async () => {
      const { apiKey, baseUrl, model } = resolveLlmCredentials();
      const liveLlm = new OpenAICompatibleLLMClient({
        apiKey,
        baseUrl: baseUrl || null,
        model,
      });
      log(`\n[e2e] model=${model} base_url=${baseUrl}`);

      const store = new SessionStore();
      const orch = new ConversationOrchestrator({ store, llm: liveLlm });
      const sessionId = `e2e-imba-${randomUUID()}`;

      let askedQuestions = 0;
      let sawDescriptionStream = false;
      let finalTurn: TurnResponse | null = null;
      const transcript: Array<{ role: string; content: string }> = [];

      let userMessage = PRODUCT_LINE;
      const maxTurns = 12;

      for (let turnIndex = 1; turnIndex <= maxTurns; turnIndex += 1) {
        log(`\n[e2e] ——— turn ${turnIndex} ———`);
        log(`[e2e] USER: ${userMessage}`);
        transcript.push({ role: "user", content: userMessage });

        let terminal: TurnResponse | null = null;
        for await (const [eventName, payload] of orch.iterTurnEvents(
          sessionId,
          userMessage,
        )) {
          if (eventName === "description_delta") {
            const text =
              typeof payload === "object" && payload !== null && "text" in payload
                ? String((payload as { text: string }).text)
                : "";
            sawDescriptionStream = true;
            process.stdout.write(text);
            continue;
          }
          if (eventName === "validation_status") {
            const phase =
              typeof payload === "object" && payload !== null && "phase" in payload
                ? (payload as { phase: string }).phase
                : payload;
            log(`\n[e2e] validation_status: ${phase}`);
            if (
              typeof payload === "object" &&
              payload !== null &&
              "pre_repair_violations" in payload &&
              (payload as { pre_repair_violations?: unknown }).pre_repair_violations
            ) {
              log(
                `[e2e] pre_repair_violations: ${JSON.stringify((payload as { pre_repair_violations: unknown }).pre_repair_violations)}`,
              );
            }
            continue;
          }
          if (
            eventName === "question" ||
            eventName === "ready_for_confirmation" ||
            eventName === "generated_copy" ||
            eventName === "validation_failed"
          ) {
            terminal = payload as TurnResponse;
            log(`\n[e2e] EVENT: ${eventName}`);
            log(`[e2e] ASSISTANT: ${terminal.message}`);
            log(
              `[e2e] gate=${JSON.stringify(terminal.gate)} brief.version=${(terminal.brief as { version?: number }).version} price=${JSON.stringify((terminal.brief as { price?: unknown }).price)}`,
            );
            if (terminal.validation !== null) {
              log(`[e2e] validation=${JSON.stringify(validationToJson(terminal.validation))}`);
            }
          }
        }

        expect(terminal).not.toBeNull();
        if (terminal === null) {
          throw new Error("turn produced no terminal event");
        }
        transcript.push({ role: "assistant", content: terminal.message });
        finalTurn = terminal;

        if (terminal.type === "question") {
          askedQuestions += 1;
          userMessage = answerFor(terminal.gate, terminal.message);
          continue;
        }

        if (terminal.type === "ready_for_confirmation") {
          expect(terminal.copy).toBeNull();
          expect(terminal.validation).toBeNull();
          userMessage = "confirm";
          continue;
        }

        if (terminal.type === "generated_copy" || terminal.type === "validation_failed") {
          break;
        }
      }

      expect(finalTurn).not.toBeNull();
      expect(askedQuestions).toBeGreaterThanOrEqual(1);
      expect(sawDescriptionStream).toBe(true);
      expect(finalTurn?.type).toBe("generated_copy");
      expect(finalTurn?.copy).not.toBeNull();
      expect(finalTurn?.validation?.passed).toBe(true);

      const description = finalTurn?.copy?.product_description ?? "";
      const price = (finalTurn?.brief.price as { value?: string } | undefined)?.value;
      expect(typeof price).toBe("string");
      expect(price).toBeTruthy();
      expect(description).toContain(price as string);
      expect(description.toLowerCase()).toContain("imba");

      const conversation = {
        product_seed: PRODUCT_LINE,
        messages: transcript,
        brief: finalTurn?.brief,
        copy: finalTurn?.copy ? generatedCopyToJson(finalTurn.copy) : null,
        validation: finalTurn?.validation
          ? validationToJson(finalTurn.validation)
          : null,
        gate: finalTurn?.gate,
      };
      log("\n[e2e] ——— LLM-as-judge ———");
      log(JSON.stringify(conversation).slice(0, 4000));
      const verdict = await liveLlm.judgeChat(conversation);
      log(`[e2e] judge.passed=${verdict.passed} score=${verdict.score}`);
      log(`[e2e] judge.summary=${verdict.summary}`);
      log(`[e2e] judge.strengths=${JSON.stringify(verdict.strengths)}`);
      log(`[e2e] judge.issues=${JSON.stringify(verdict.issues)}`);

      expect(verdict.passed).toBe(true);
      expect(verdict.score).toBeGreaterThanOrEqual(6);
    },
    180_000,
  );
});
