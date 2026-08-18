import type { z } from "zod";

const FENCE_START = /^```(?:json)?\s*/i;
const FENCE_END = /\s*```$/;

export function stripJsonFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(FENCE_START, "");
    cleaned = cleaned.replace(FENCE_END, "");
  }
  return cleaned.trim();
}

export function parseModelFromText<T>(schema: z.ZodType<T>, text: string): T {
  const cleaned = stripJsonFences(text);
  try {
    return schema.parse(JSON.parse(cleaned));
  } catch (firstError) {
    const startObj = cleaned.indexOf("{");
    const startArr = cleaned.indexOf("[");
    const starts = [startObj, startArr].filter((index) => index >= 0);
    if (starts.length === 0) {
      throw firstError;
    }
    const start = Math.min(...starts);
    const endObj = cleaned.lastIndexOf("}");
    const endArr = cleaned.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end <= start) {
      throw firstError;
    }
    return schema.parse(JSON.parse(cleaned.slice(start, end + 1)));
  }
}
