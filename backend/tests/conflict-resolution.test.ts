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

describe("conflict resolution", () => {
  it("test_conflict_resolution_via_correction", () => {
    const brief = createProductBrief({
      category: createFieldValue({
        value: "750 ml",
        status: FieldStatus.CONFIRMED,
      }),
      version: 1,
    });
    const conflicted = reduceBrief(
      brief,
      createExtractionResult({
        intent: Intent.PROVIDE_INFO,
        updates: [
          createFieldUpdate({
            field: "category",
            value: "1 litre",
            status: "confirmed",
          }),
        ],
      }),
      2,
    );
    expect(conflicted.category.status).toBe(FieldStatus.CONFLICTED);

    const resolved = reduceBrief(
      conflicted,
      createExtractionResult({
        intent: Intent.CORRECT_INFO,
        updates: [
          createFieldUpdate({
            field: "category",
            value: "750 ml",
            status: "confirmed",
          }),
        ],
      }),
      3,
    );
    expect(resolved.category.status).toBe(FieldStatus.CONFIRMED);
    expect(resolved.category.value).toBe("750 ml");
    expect(resolved.conflicts.every((item) => item.resolved)).toBe(true);
  });
});
