import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OpenAICompatibleLLMClient, resolveLlmCredentials } from "../src/llm/openai_compatible_client.ts";
import { app, overrideLlm, resetStore } from "../src/main.ts";

function readJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("expected JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}

function readLiveTurn(value: unknown): {
  type: string;
  message: string;
  brief: { product_name: { status: string; value: string } };
  gate: { status: string };
} {
  const record = readJsonObject(value);
  const brief = readJsonObject(record.brief);
  const productName = readJsonObject(brief.product_name);
  const gate = readJsonObject(record.gate);
  if (typeof record.type !== "string" || typeof record.message !== "string") {
    throw new Error("expected live turn payload");
  }
  if (typeof productName.status !== "string") {
    throw new Error("expected product_name.status");
  }
  if (typeof gate.status !== "string") {
    throw new Error("expected gate.status");
  }
  return {
    type: record.type,
    message: record.message,
    brief: {
      product_name: {
        status: productName.status,
        value: typeof productName.value === "string" ? productName.value : "",
      },
    },
    gate: { status: gate.status },
  };
}

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

const EXPECTED_MODEL = process.env.OPENAI_MODEL ?? "moonshotai/kimi-k3";

describe.skipIf(!hasLiveKey())("live integration", () => {
  const creds = resolveLlmCredentials();

  it("test_configured_model_is_kimi_k3", () => {
    expect(creds.model).toBe(EXPECTED_MODEL);
    expect(creds.model.toLowerCase()).toContain("kimi");
    expect(creds.baseUrl).toContain("openrouter.ai");
  });

  it("test_health", async () => {
    overrideLlm(
      new OpenAICompatibleLLMClient({
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl || null,
        model: creds.model,
      }),
    );
    resetStore();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    const health = readJsonObject(await response.json());
    expect(health.status).toBe("ok");
  });

  it("test_bot_returns_any_message", async () => {
    overrideLlm(
      new OpenAICompatibleLLMClient({
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl || null,
        model: creds.model,
      }),
    );
    resetStore();
    const sessionId = `live-${randomUUID()}`;
    const response = await app.request(`/api/chat/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "The product is called AquaPure Bottle." }),
    });
    expect(response.status).toBe(200);
    const payload = readLiveTurn(await response.json());
    expect(["question", "ready_for_confirmation", "generated_copy", "validation_failed"]).toContain(
      payload.type,
    );
    expect(typeof payload.message).toBe("string");
    expect(payload.message.trim()).toBeTruthy();
    expect(payload.brief).toBeDefined();
    console.log(`\n[live] type=${payload.type} message=${JSON.stringify(payload.message)}`);
    console.log(`[live] product_name=${JSON.stringify(payload.brief.product_name)}`);
  });

  it("test_extracts_product_name_and_asks_followup", async () => {
    overrideLlm(
      new OpenAICompatibleLLMClient({
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl || null,
        model: creds.model,
      }),
    );
    resetStore();
    const sessionId = `live-extract-${randomUUID()}`;
    const response = await app.request(`/api/chat/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "Our product is called NightLight Pro. Please help me write marketing copy.",
      }),
    });
    expect(response.status).toBe(200);
    const payload = readLiveTurn(await response.json());
    expect(payload.message.trim()).toBeTruthy();
    const name = payload.brief.product_name;
    expect(name.status).toBe("confirmed");
    expect(typeof name.value).toBe("string");
    expect(name.value.toLowerCase().replaceAll(" ", "")).toContain("nightlight");
    expect(payload.type).toBe("question");
    expect(["needs_info", "needs_clarification"]).toContain(payload.gate.status);
    console.log(`\n[live] extracted name=${JSON.stringify(name.value)}`);
    console.log(`[live] follow-up=${JSON.stringify(payload.message)}`);
    console.log(`[live] gate=${JSON.stringify(payload.gate)}`);
  });
});
