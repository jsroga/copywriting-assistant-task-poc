import { config as loadDotenv } from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sessionToJson } from "./domain/serialize.ts";
import { FakeLLMClient } from "./llm/fake_client.ts";
import { OpenAICompatibleLLMClient, resolveLlmCredentials } from "./llm/openai_compatible_client.ts";
import { ConversationOrchestrator } from "./orchestration/engine.ts";
import { sseFrame, turnResponseToJson } from "./orchestration/responses.ts";
import type { LLMClient } from "./ports.ts";
import { FileSessionStore, type SessionStore } from "./store.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: join(REPO_ROOT, ".env") });
loadDotenv({ path: join(BACKEND_ROOT, ".env"), override: true });

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5100", "http://127.0.0.1:5100"],
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
  }),
);

export const store: SessionStore = new FileSessionStore(
  join(BACKEND_ROOT, ".data", "sessions"),
);

export function buildLlm(): LLMClient {
  const fakeFlag = (process.env.USE_FAKE_LLM ?? "").toLowerCase();
  if (["1", "true", "yes"].includes(fakeFlag)) {
    return new FakeLLMClient();
  }
  const { apiKey, baseUrl, model } = resolveLlmCredentials();
  if (!apiKey || apiKey.startsWith("sk-your-key")) {
    return new FakeLLMClient();
  }
  return new OpenAICompatibleLLMClient({
    apiKey,
    baseUrl: baseUrl || null,
    model,
  });
}

let llm: LLMClient = buildLlm();
let orchestrator = new ConversationOrchestrator({ store, llm });

const chatRequestSchema = z.object({
  message: z.string().min(1),
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/api/chat/:session_id", async (c) => {
  const sessionId = c.req.param("session_id");
  const parsed = chatRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ detail: "message must not be empty" }, 400);
  }
  try {
    const response = await orchestrator.handleTurn(sessionId, parsed.data.message);
    return c.json(turnResponseToJson(response));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "message must not be empty") {
      return c.json({ detail: message }, 400);
    }
    return c.json({ detail: `LLM/chat failure: ${message}` }, 502);
  }
});

app.post("/api/chat/:session_id/stream", async (c) => {
  const sessionId = c.req.param("session_id");
  const parsed = chatRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ detail: "message must not be empty" }, 400);
  }
  c.header("Cache-Control", "no-cache");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    try {
      for await (const [eventName, payload] of orchestrator.iterTurnEvents(
        sessionId,
        parsed.data.message,
      )) {
        const frame = sseFrame(eventName, payload);
        const match = /^event: (.*)\ndata: (.*)\n\n$/s.exec(frame);
        await stream.writeSSE({
          event: match?.[1] ?? eventName,
          data: match?.[2] ?? JSON.stringify(payload),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const detail =
        message === "message must not be empty"
          ? message
          : `LLM/chat failure: ${message}`;
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ detail }),
      });
    }
  });
});

app.get("/api/session/:session_id", (c) => {
  const session = store.get(c.req.param("session_id"));
  if (session === undefined) {
    return c.json({ detail: "session not found" }, 404);
  }
  const dumped = sessionToJson(session);
  return c.json({
    id: dumped.id,
    brief: dumped.brief,
    messages: dumped.messages,
    turn_number: dumped.turn_number,
    last_copy: dumped.last_copy,
    last_validation: dumped.last_validation,
    awaiting_generation_confirmation: dumped.awaiting_generation_confirmation,
    streaming_description: dumped.streaming_description,
  });
});

export function overrideLlm(client: LLMClient): void {
  llm = client;
  orchestrator = new ConversationOrchestrator({ store, llm });
}

export function resetStore(): void {
  store.clear();
}

const isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("main.ts") || process.argv[1].endsWith("main.js"));

if (isDirectRun) {
  const port = 5001;
  serve({ fetch: app.fetch, hostname: "localhost", port });
  console.log(`API listening on http://localhost:${port}`);
}
