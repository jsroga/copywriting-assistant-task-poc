import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "../src/domain/gate.ts";
import {
  FieldStatus,
  GateStatus,
  createFieldValue,
  createProductBrief,
} from "../src/domain/models.ts";
import { makeCompleteBrief } from "../src/llm/fake_client.ts";

describe("gate", () => {
  it("test_missing_required_returns_needs_info", () => {
    const brief = createProductBrief({
      product_name: createFieldValue({ value: "Bottle", status: FieldStatus.CONFIRMED }),
    });
    const decision = evaluateReadiness(brief);
    expect(decision.status).toBe(GateStatus.NEEDS_INFO);
    expect(decision.next_field).toBe("key_features");
    expect(decision.fields).toContain("key_features");
  });

  it("test_vague_required_not_usable", () => {
    const brief = makeCompleteBrief();
    brief.target_audience = createFieldValue({
      raw_text: "people",
      status: FieldStatus.VAGUE,
    });
    const decision = evaluateReadiness(brief);
    expect(decision.status).toBe(GateStatus.NEEDS_INFO);
    expect(decision.next_field).toBe("target_audience");
  });

  it("test_vague_price_does_not_satisfy_readiness", () => {
    const brief = makeCompleteBrief({ price: null });
    brief.price = createFieldValue({
      value: null,
      raw_text: "cheap",
      status: FieldStatus.VAGUE,
    });
    const decision = evaluateReadiness(brief, null, ["category", "brand_name"]);
    expect(decision.status).toBe(GateStatus.NEEDS_INFO);
    expect(decision.next_field).toBe("price");
    expect(brief.price.value).toBeNull();
  });

  it("test_single_key_feature_is_enough_to_be_ready", () => {
    const brief = makeCompleteBrief({ key_features: ["only one"] });
    const decision = evaluateReadiness(brief);
    expect(decision.status).toBe(GateStatus.READY);
  });

  it("test_no_meaningful_key_features_not_ready", () => {
    const brief = makeCompleteBrief();
    brief.key_features = createFieldValue({
      value: [],
      status: FieldStatus.CONFIRMED,
    });
    let decision = evaluateReadiness(brief);
    expect(decision.status).toBe(GateStatus.NEEDS_INFO);
    expect(decision.next_field).toBe("key_features");

    for (const noise of [["x"], ["ok"], ["!!"]]) {
      const noisy = makeCompleteBrief({ key_features: noise });
      decision = evaluateReadiness(noisy);
      expect(decision.status).toBe(GateStatus.NEEDS_INFO);
      expect(decision.next_field).toBe("key_features");
    }
  });

  it("test_unresolved_conflict_needs_clarification", () => {
    const brief = makeCompleteBrief();
    brief.category = createFieldValue({
      value: "750 ml",
      status: FieldStatus.CONFLICTED,
    });
    brief.conflicts.push({
      field: "category",
      old_value: "750 ml",
      new_value: "1 litre",
      turn: 2,
      resolved: false,
    });
    const decision = evaluateReadiness(brief);
    expect(decision.status).toBe(GateStatus.NEEDS_CLARIFICATION);
    expect(decision.next_field).toBe("category");
  });

  it("test_complete_brief_ready", () => {
    const brief = makeCompleteBrief();
    const decision = evaluateReadiness(brief);
    expect(decision.status).toBe(GateStatus.READY);
    expect(decision.fields).toEqual([]);
    expect(decision.next_field).toBeNull();
  });

  it("test_missing_price_blocks_ready_even_if_marked_prompted", () => {
    const brief = makeCompleteBrief({
      price: null,
      category: null,
      brand_name: null,
    });
    let decision = evaluateReadiness(brief);
    expect(decision.status).toBe(GateStatus.NEEDS_INFO);
    expect(decision.next_field).toBe("price");

    decision = evaluateReadiness(brief, null, ["price", "category", "brand_name"]);
    expect(decision.status).toBe(GateStatus.NEEDS_INFO);
    expect(decision.next_field).toBe("price");
  });

  it("test_optional_category_brand_can_be_skipped_after_prompted", () => {
    const brief = makeCompleteBrief({ category: null, brand_name: null });
    let decision = evaluateReadiness(brief);
    expect(decision.next_field).toBe("category");

    decision = evaluateReadiness(brief, null, ["category", "brand_name"]);
    expect(decision.status).toBe(GateStatus.READY);
  });

  it("test_field_priority_is_deterministic", () => {
    const brief = createProductBrief();
    let decision = evaluateReadiness(brief);
    expect(decision.next_field).toBe("product_name");

    brief.product_name = createFieldValue({
      value: "X",
      status: FieldStatus.CONFIRMED,
    });
    decision = evaluateReadiness(brief);
    expect(decision.next_field).toBe("key_features");
  });
});
