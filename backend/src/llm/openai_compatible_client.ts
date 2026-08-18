import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  type ChatMessage,
  type ExtractionResult,
  type GeneratedCopy,
  type JudgeVerdict,
  type MarketingEmail,
  type ProductBrief,
  type Violation,
  BRIEF_FIELDS,
  FieldStatus,
  extractionResultSchema,
  generatedCopySchema,
  judgeVerdictSchema,
  marketingEmailMetaSchema,
} from "../domain/models.ts";
import { generatedCopyToJson, serializeBrief, violationToJson } from "../domain/serialize.ts";
import type { LLMClient } from "../ports.ts";
import { parseModelFromText } from "./json_utils.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(HERE, "prompts");
loadDotenv({ path: join(HERE, "../../../.env") });
loadDotenv({ path: join(HERE, "../../.env"), override: true });
export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "moonshotai/kimi-k3";

const NO_REASONING = { reasoning: { enabled: false } };

function loadPrompt(name: string): string {
  return readFileSync(join(PROMPTS_DIR, name), "utf-8");
}

function normalizedBriefPayload(brief: ProductBrief): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    assumptions: [...brief.assumptions],
    version: brief.version,
  };
  for (const name of BRIEF_FIELDS) {
    const field = brief[name];
    if (field.status === FieldStatus.CONFIRMED) {
      payload[name] = { value: field.value, status: field.status };
    } else if (field.status === FieldStatus.VAGUE) {
      payload[name] = {
        value: null,
        raw_text: field.raw_text,
        status: field.status,
      };
    }
  }
  return payload;
}

export function resolveLlmCredentials(): {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
} {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;

  if (openrouterKey) {
    return {
      apiKey: openrouterKey,
      baseUrl: baseUrl || DEFAULT_OPENROUTER_BASE_URL,
      model: model || DEFAULT_MODEL,
    };
  }
  return {
    apiKey: openaiKey,
    baseUrl: baseUrl || "",
    model: model || "gpt-4o-mini",
  };
}

export class OpenAICompatibleLLMClient implements LLMClient {
  readonly apiKey: string | undefined;
  readonly model: string;
  readonly baseUrl: string;
  private readonly client: OpenAI;
  private readonly extractPrompt: string;
  private readonly generateDescriptionPrompt: string;
  private readonly generateEmailBodyPrompt: string;
  private readonly generateEmailMetaPrompt: string;
  private readonly repairPrompt: string;
  private readonly judgePrompt: string;

  constructor(options: {
    apiKey?: string | null;
    model?: string | null;
    baseUrl?: string | null;
    client?: OpenAI;
  } = {}) {
    const resolved = resolveLlmCredentials();
    this.apiKey = options.apiKey ?? resolved.apiKey;
    this.model = options.model ?? resolved.model;
    this.baseUrl =
      options.baseUrl !== undefined && options.baseUrl !== null
        ? options.baseUrl
        : resolved.baseUrl;
    if (!this.apiKey && options.client === undefined) {
      throw new Error(
        "OPENROUTER_API_KEY or OPENAI_API_KEY is required for OpenAICompatibleLLMClient",
      );
    }
    if (options.client !== undefined) {
      this.client = options.client;
    } else if (this.baseUrl) {
      this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseUrl });
    } else {
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
    this.extractPrompt = loadPrompt("extract.md");
    this.generateDescriptionPrompt = loadPrompt("generate_description.md");
    this.generateEmailBodyPrompt = loadPrompt("generate_email_body.md");
    this.generateEmailMetaPrompt = loadPrompt("generate_email_meta.md");
    this.repairPrompt = loadPrompt("repair.md");
    this.judgePrompt = loadPrompt("judge_chat.md");
  }

  private async parse<S extends z.ZodTypeAny>(
    system: string,
    user: string,
    schema: S,
    schemaName: string,
  ): Promise<z.output<S>> {
    const completion = await this.client.beta.chat.completions.parse({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: zodResponseFormat(schema, schemaName),
      ...NO_REASONING,
    });
    const message = completion.choices[0]?.message;
    if (message?.parsed !== undefined && message.parsed !== null) {
      return schema.parse(message.parsed);
    }
    const content = message?.content;
    if (typeof content === "string" && content.trim()) {
      try {
        return parseModelFromText(schema, content);
      } catch (error) {
        throw new Error(
          `LLM returned unparseable output for ${schemaName}: ${JSON.stringify(content)}`,
          { cause: error },
        );
      }
    }
    throw new Error(
      `LLM returned no parsed output for ${schemaName}: ${JSON.stringify(message?.refusal ?? content)}`,
    );
  }

  async extract(
    message: string,
    brief: ProductBrief,
    historyTail: ChatMessage[],
  ): Promise<ExtractionResult> {
    const historyPayload = historyTail.map((item) => ({
      role: item.role,
      content: item.content,
      turn: item.turn,
    }));
    return this.parse(
      this.extractPrompt,
      JSON.stringify({
        latest_user_message: message,
        current_brief: serializeBrief(brief),
        history_tail: historyPayload,
      }),
      extractionResultSchema,
      "ExtractionResult",
    );
  }

  async *streamProductDescription(brief: ProductBrief): AsyncIterable<string> {
    const userPayload = {
      brief: normalizedBriefPayload(brief),
      requirements: {
        description_words: "60-200",
        include_confirmed_price: true,
      },
    };
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.generateDescriptionPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      stream: true,
      ...NO_REASONING,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  async *streamEmailBody(
    brief: ProductBrief,
    productDescription: string,
  ): AsyncIterable<string> {
    const userPayload = {
      brief: normalizedBriefPayload(brief),
      product_description: productDescription,
      requirements: {
        email_body_words: "80-250",
        body_format: "html",
        include_confirmed_price: true,
      },
    };
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.generateEmailBodyPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      stream: true,
      ...NO_REASONING,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  async generateEmail(
    brief: ProductBrief,
    productDescription: string,
    options: { body: string },
  ): Promise<MarketingEmail> {
    const meta = await this.parse(
      this.generateEmailMetaPrompt,
      JSON.stringify({
        brief: normalizedBriefPayload(brief),
        product_description: productDescription,
        email_body_html: options.body,
        requirements: { subject_max_chars: 60 },
      }),
      marketingEmailMetaSchema,
      "MarketingEmailMeta",
    );
    return { subject: meta.subject, body: options.body, cta: meta.cta };
  }

  async repair(
    brief: ProductBrief,
    previousOutput: GeneratedCopy,
    violations: Violation[],
  ): Promise<GeneratedCopy> {
    return this.parse(
      this.repairPrompt,
      JSON.stringify({
        brief: normalizedBriefPayload(brief),
        previous_output: generatedCopyToJson(previousOutput),
        violations: violations.map(violationToJson),
      }),
      generatedCopySchema,
      "GeneratedCopy",
    );
  }

  async judgeChat(conversation: Record<string, unknown>): Promise<JudgeVerdict> {
    return this.parse(
      this.judgePrompt,
      JSON.stringify(conversation),
      judgeVerdictSchema,
      "JudgeVerdict",
    );
  }
}
