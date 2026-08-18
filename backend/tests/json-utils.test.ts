import { describe, expect, it } from "vitest";
import { Intent, extractionResultSchema } from "../src/domain/models.ts";
import { parseModelFromText, stripJsonFences } from "../src/llm/json_utils.ts";

describe("json utils", () => {
  it("test_strip_json_fences_removes_markdown_wrapper", () => {
    const raw =
      '```{\n "intent": "provide_info", "updates": [], "off_schema_requests": []\n}\n```';
    const cleaned = stripJsonFences(raw);
    expect(cleaned.startsWith("{")).toBe(true);
    const parsed = parseModelFromText(extractionResultSchema, raw);
    expect(parsed.intent).toBe(Intent.PROVIDE_INFO);
  });

  it("test_parse_model_from_json_fence_label", () => {
    const raw =
      '```json\n{"intent":"provide_info","updates":[],' +
      '"off_schema_requests":[]}\n```';
    const parsed = parseModelFromText(extractionResultSchema, raw);
    expect(parsed.intent).toBe(Intent.PROVIDE_INFO);
  });
});
