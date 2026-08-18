import { describe, expect, it } from "vitest";
import { Intent, createExtractionResult } from "../src/domain/models.ts";
import {
  FakeLLMClient,
  makeCompleteBrief,
  makeValidCopy,
} from "../src/llm/fake_client.ts";
import { ConversationOrchestrator } from "../src/orchestration/engine.ts";
import { SessionStore } from "../src/store.ts";

describe("stream early status", () => {
  it("test_iter_turn_events_emits_extracting_before_any_llm_work", async () => {
    const store = new SessionStore();
    const session = store.getOrCreate("early-1");
    session.brief = makeCompleteBrief();
    session.awaiting_generation_confirmation = true;
    store.save(session);

    const llm = new FakeLLMClient({
      extractQueue: [
        createExtractionResult({ intent: Intent.PROVIDE_INFO, updates: [] }),
      ],
      generateFn: makeValidCopy,
    });
    const orch = new ConversationOrchestrator({ store, llm });
    const events: Array<[string, unknown]> = [];
    for await (const event of orch.iterTurnEvents("early-1", "confirm")) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0][0]).toBe("validation_status");
    expect((events[0][1] as { phase: string }).phase).toBe("extracting");

    const phases = events
      .filter(
        ([name, payload]) =>
          name === "validation_status" &&
          typeof payload === "object" &&
          payload !== null,
      )
      .map(([, payload]) => (payload as { phase?: string }).phase);
    expect(phases).toContain("generating");
    expect(phases).toContain("building_email");
    expect(phases).toContain("validating");
    expect(phases.indexOf("building_email")).toBeLessThan(phases.indexOf("validating"));

    const deltaTexts = events
      .filter(
        ([name, payload]) =>
          name === "description_delta" &&
          typeof payload === "object" &&
          payload !== null,
      )
      .map(([, payload]) => (payload as { text?: string }).text);
    expect(deltaTexts.length).toBeGreaterThan(0);
    expect(deltaTexts.every((text) => typeof text === "string" && text)).toBe(true);

    const emailDeltas = events
      .filter(
        ([name, payload]) =>
          name === "email_delta" && typeof payload === "object" && payload !== null,
      )
      .map(([, payload]) => (payload as { text?: string }).text);
    expect(emailDeltas.length).toBeGreaterThan(0);
  });

  it("test_sessions_are_isolated_by_id", () => {
    const store = new SessionStore();
    const a = store.getOrCreate("product-a");
    a.brief = makeCompleteBrief({ product_name: "FOTEL ROZOWY" });
    store.save(a);

    const b = store.getOrCreate("product-b");
    expect(b.brief.product_name.value).toBeNull();
    expect(b.id).not.toBe(a.id);
  });
});
