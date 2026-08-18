import { describe, expect, it } from "vitest";
import {
  FieldStatus,
  Intent,
  createExtractionResult,
  createFieldUpdate,
  createFieldValue,
  createProductBrief,
} from "../src/domain/models.ts";
import { reduceBrief } from "../src/domain/reducer.ts";

describe("reducer", () => {
  it("test_new_value_populates_missing_field", () => {
    const brief = createProductBrief();
    const extraction = createExtractionResult({
      intent: Intent.PROVIDE_INFO,
      updates: [
        createFieldUpdate({
          field: "product_name",
          value: "AquaPure",
          status: "confirmed",
        }),
      ],
    });
    const result = reduceBrief(brief, extraction, 1);
    expect(result.product_name.value).toBe("AquaPure");
    expect(result.product_name.status).toBe(FieldStatus.CONFIRMED);
    expect(result.version).toBe(1);
  });

  it("test_explicit_correction_overwrites_and_keeps_history", () => {
    const brief = createProductBrief({
      price: createFieldValue({ value: "$299", status: FieldStatus.CONFIRMED }),
      version: 1,
    });
    const extraction = createExtractionResult({
      intent: Intent.CORRECT_INFO,
      updates: [
        createFieldUpdate({ field: "price", value: "$199", status: "confirmed" }),
      ],
    });
    const result = reduceBrief(brief, extraction, 2);
    expect(result.price.value).toBe("$199");
    expect(result.price.status).toBe(FieldStatus.CONFIRMED);
    expect(result.price.history).toEqual(["$299"]);
    expect(result.version).toBe(2);
    expect(result.conflicts.every((item) => item.resolved) || result.conflicts.length === 0).toBe(true);
  });

  it("test_ambiguous_contradiction_becomes_conflicted", () => {
    const brief = createProductBrief({
      category: createFieldValue({ value: "750 ml", status: FieldStatus.CONFIRMED }),
      version: 1,
    });
    const extraction = createExtractionResult({
      intent: Intent.PROVIDE_INFO,
      updates: [
        createFieldUpdate({ field: "category", value: "1 litre", status: "confirmed" }),
      ],
    });
    const result = reduceBrief(brief, extraction, 2);
    expect(result.category.status).toBe(FieldStatus.CONFLICTED);
    expect(result.category.value).toBe("750 ml");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].old_value).toBe("750 ml");
    expect(result.conflicts[0].new_value).toBe("1 litre");
    expect(result.conflicts[0].resolved).toBe(false);
    expect(result.version).toBe(2);
  });

  it("test_vague_value_remains_vague", () => {
    const brief = createProductBrief();
    const extraction = createExtractionResult({
      intent: Intent.PROVIDE_INFO,
      updates: [
        createFieldUpdate({
          field: "price",
          value: null,
          raw_text: "cheap",
          status: "vague",
        }),
      ],
    });
    const result = reduceBrief(brief, extraction, 1);
    expect(result.price.status).toBe(FieldStatus.VAGUE);
    expect(result.price.value).toBeNull();
    expect(result.price.raw_text).toBe("cheap");
    expect(result.version).toBe(1);
  });

  it("test_version_unchanged_when_same_confirmed_value", () => {
    const brief = createProductBrief({
      product_name: createFieldValue({
        value: "AquaPure",
        status: FieldStatus.CONFIRMED,
      }),
      version: 3,
    });
    const extraction = createExtractionResult({
      intent: Intent.PROVIDE_INFO,
      updates: [
        createFieldUpdate({
          field: "product_name",
          value: "AquaPure",
          status: "confirmed",
        }),
      ],
    });
    const result = reduceBrief(brief, extraction, 4);
    expect(result.product_name.value).toBe("AquaPure");
    expect(result.version).toBe(3);
  });
});
