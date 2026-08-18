import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BRIEF_FIELDS,
  FieldStatus,
  IncomingStatus,
  OPTIONAL_FIELDS,
  QUESTION_PRIORITY,
  REQUIRED_FIELDS,
  productBriefObjectKeys,
} from "../src/domain/models.ts";
import { TRANSITIONS } from "../src/domain/reducer.ts";
import { RESPONSE_TYPES, TERMINAL_EVENTS } from "../src/orchestration/responses.ts";

const BRIEF_METADATA_FIELDS = new Set(["assumptions", "conflicts", "version"]);
const FRONTEND_CONSTANTS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../frontend/constants/index.ts",
);

function tsStringArray(source: string, name: string): string[] {
  const block = source.match(
    new RegExp(`export const ${name} = \\[(.*?)\\] as const`, "s"),
  );
  expect(block).not.toBeNull();
  return [...(block?.[1].matchAll(/'([^']+)'/g) ?? [])].map((match) => match[1]);
}

describe("domain contracts", () => {
  it("test_product_brief_carries_exactly_the_declared_fields", () => {
    const modelled = new Set(
      productBriefObjectKeys().filter((key) => !BRIEF_METADATA_FIELDS.has(key)),
    );
    expect(modelled).toEqual(new Set(BRIEF_FIELDS));
  });

  it("test_required_and_optional_partition_the_brief", () => {
    expect(
      REQUIRED_FIELDS.some((field) => OPTIONAL_FIELDS.includes(field)),
    ).toBe(false);
    expect(new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS])).toEqual(
      new Set(BRIEF_FIELDS),
    );
  });

  it("test_question_priority_covers_every_field_once", () => {
    expect(new Set(QUESTION_PRIORITY)).toEqual(new Set(BRIEF_FIELDS));
    expect(QUESTION_PRIORITY).toHaveLength(BRIEF_FIELDS.length);
  });

  it("test_terminal_events_match_the_response_types", () => {
    expect(TERMINAL_EVENTS).toEqual(new Set(RESPONSE_TYPES));
  });

  it("test_reducer_transition_table_is_exhaustive", () => {
    const incoming = Object.values(IncomingStatus);
    const current = Object.values(FieldStatus);
    const expected = new Set(
      incoming.flatMap((left) => current.map((right) => `${left}|${right}`)),
    );
    expect(new Set(Object.keys(TRANSITIONS))).toEqual(expected);
  });

  it("test_frontend_brief_field_constants_match_the_backend", () => {
    const source = readFileSync(FRONTEND_CONSTANTS, "utf-8");
    expect(new Set(tsStringArray(source, "BRIEF_FIELD_ORDER"))).toEqual(
      new Set(BRIEF_FIELDS),
    );
    expect(new Set(tsStringArray(source, "REQUIRED_BRIEF_FIELDS"))).toEqual(
      new Set(REQUIRED_FIELDS),
    );
  });
});
