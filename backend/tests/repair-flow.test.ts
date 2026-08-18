import { describe, expect, it } from "vitest";
import { Intent, ViolationCode, createExtractionResult } from "../src/domain/models.ts";
import type { GeneratedCopy } from "../src/domain/models.ts";
import {
  FakeLLMClient,
  makeCompleteBrief,
  makeInvalidCopyMissingPrice,
  makeValidCopy,
} from "../src/llm/fake_client.ts";
import { ConversationOrchestrator } from "../src/orchestration/engine.ts";
import {
  COPY_READY_MESSAGE,
  VALIDATION_FAILED_MESSAGE,
} from "../src/orchestration/messages.ts";
import { SessionStore } from "../src/store.ts";

function failingOrchestrator(
  store: SessionStore,
  invalidCopy: GeneratedCopy,
  repairedCopy: GeneratedCopy,
): { orch: ConversationOrchestrator; llm: FakeLLMClient } {
  const llm = new FakeLLMClient({
    extractQueue: [
      createExtractionResult({ intent: Intent.REQUEST_GENERATION, updates: [] }),
    ],
    generateQueue: [invalidCopy],
    repairQueue: [repairedCopy],
  });
  return {
    orch: new ConversationOrchestrator({ store, llm }),
    llm,
  };
}

async function collectEvents(
  orch: ConversationOrchestrator,
  sessionId: string,
  message: string,
): Promise<Array<[string, unknown]>> {
  const events: Array<[string, unknown]> = [];
  for await (const event of orch.iterTurnEvents(sessionId, message)) {
    events.push(event);
  }
  return events;
}

describe("repair flow", () => {
  it("test_invalid_generation_repairs_exactly_once_and_passes", async () => {
    const store = new SessionStore();
    const session = store.getOrCreate("s1");
    session.brief = makeCompleteBrief({ price: "$299" });
    store.save(session);

    const llm = new FakeLLMClient({
      extractQueue: [
        createExtractionResult({ intent: Intent.REQUEST_GENERATION, updates: [] }),
      ],
      generateQueue: [makeInvalidCopyMissingPrice(session.brief)],
      repairFn: (brief) => makeValidCopy(brief),
    });
    const response = await new ConversationOrchestrator({ store, llm }).handleTurn(
      "s1",
      "Write the copy",
    );
    expect(response.type).toBe("generated_copy");
    expect(response.validation?.repaired).toBe(true);
    expect(response.validation?.passed).toBe(true);
    expect(llm.generateCalls).toBe(1);
    expect(llm.repairCalls).toBe(1);
  });

  it("test_invalid_repair_returns_failure_without_second_repair", async () => {
    const store = new SessionStore();
    const session = store.getOrCreate("s1");
    session.brief = makeCompleteBrief({ price: "$299" });
    store.save(session);

    const invalid = makeInvalidCopyMissingPrice(session.brief);
    const llm = new FakeLLMClient({
      extractQueue: [
        createExtractionResult({ intent: Intent.REQUEST_GENERATION, updates: [] }),
      ],
      generateQueue: [invalid],
      repairQueue: [invalid],
    });
    const response = await new ConversationOrchestrator({ store, llm }).handleTurn(
      "s1",
      "Write the copy",
    );
    expect(response.type).toBe("validation_failed");
    expect(response.validation?.repaired).toBe(true);
    expect(response.validation?.passed).toBe(false);
    expect(response.validation?.violations.length).toBeGreaterThan(0);
    expect(llm.generateCalls).toBe(1);
    expect(llm.repairCalls).toBe(1);
  });

  it("test_failed_validation_never_announces_ready_copy", async () => {
    const store = new SessionStore();
    const session = store.getOrCreate("s1");
    session.brief = makeCompleteBrief({ price: "$299" });
    store.save(session);

    const invalid = makeInvalidCopyMissingPrice(session.brief);
    const { orch, llm } = failingOrchestrator(store, invalid, invalid);
    const response = await orch.handleTurn("s1", "Write the copy");

    expect(response.message).toBe(VALIDATION_FAILED_MESSAGE);
    expect(response.message).not.toBe(COPY_READY_MESSAGE);
    expect(response.copy).not.toBeNull();
    const codes = response.validation?.violations.map((item) => item.code) ?? [];
    expect(codes).toContain(ViolationCode.MISSING_PRICE);

    const saved = store.get("s1");
    expect(saved?.messages.at(-1)?.content).toBe(VALIDATION_FAILED_MESSAGE);
    expect(saved?.awaiting_generation_confirmation).toBe(false);
    expect(llm.repairCalls).toBe(1);
  });

  it("test_failed_validation_resolves_before_the_terminal_frame", async () => {
    const store = new SessionStore();
    const session = store.getOrCreate("s1");
    session.brief = makeCompleteBrief({ price: "$299" });
    store.save(session);

    const invalid = makeValidCopy(session.brief);
    invalid.marketing_email.subject = "x".repeat(61);
    const { orch } = failingOrchestrator(store, invalid, invalid);

    const events = await collectEvents(orch, "s1", "Write the copy");
    const names = events.map(([name]) => name);
    expect(names).not.toContain("generated_copy");
    expect(names.at(-1)).toBe("validation_failed");

    const doneIndex = events.findIndex(
      ([name, payload]) =>
        name === "validation_status" &&
        typeof payload === "object" &&
        payload !== null &&
        "phase" in payload &&
        payload.phase === "done",
    );
    expect(doneIndex).toBeGreaterThan(-1);
    expect(doneIndex).toBeLessThan(events.length - 1);
    const doneValidation = (
      events[doneIndex][1] as {
        validation: { passed: boolean; violations: Array<{ code: string }> };
      }
    ).validation;
    expect(doneValidation.passed).toBe(false);
    expect(
      doneValidation.violations.some(
        (item) => item.code === ViolationCode.SUBJECT_TOO_LONG,
      ),
    ).toBe(true);
  });

  it("test_validating_phase_starts_before_repair_not_after", async () => {
    const store = new SessionStore();
    const session = store.getOrCreate("s1");
    session.brief = makeCompleteBrief({ price: "$299" });
    store.save(session);

    const invalid = makeInvalidCopyMissingPrice(session.brief);
    const { orch } = failingOrchestrator(store, invalid, invalid);
    const events = await collectEvents(orch, "s1", "Write the copy");
    const phases = events
      .filter(
        ([name, payload]) =>
          name === "validation_status" &&
          typeof payload === "object" &&
          payload !== null,
      )
      .map(([, payload]) => (payload as { phase?: string }).phase);

    expect(phases.filter((phase) => phase === "validating")).toHaveLength(1);
    expect(phases.indexOf("validating")).toBeLessThan(phases.indexOf("repairing"));
    expect(phases.indexOf("repairing")).toBeLessThan(phases.indexOf("done"));
    expect(
      phases.slice(phases.indexOf("repairing") + 1).includes("validating"),
    ).toBe(false);
  });
});
