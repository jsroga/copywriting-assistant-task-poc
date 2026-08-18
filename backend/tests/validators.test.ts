import { describe, expect, it } from "vitest";
import { type Violation, ViolationCode } from "../src/domain/models.ts";
import { validate } from "../src/domain/validation/index.ts";
import { wordCount } from "../src/domain/validation/text.ts";
import { makeCompleteBrief, makeValidCopy } from "../src/llm/fake_client.ts";

function pad(text: string, minWords: number): string {
  const count = wordCount(text);
  if (count >= minWords) {
    return text;
  }
  return `${text} ${Array.from({ length: minWords - count }, (_, index) => `pad${index}`).join(" ")}`;
}

describe("validators", () => {
  it("test_price_presence_pass_and_fail", () => {
    const brief = makeCompleteBrief({ price: "$299" });
    const good = makeValidCopy(brief);
    expect(
      validate(good, brief).some((item) => item.code === ViolationCode.MISSING_PRICE),
    ).toBe(false);

    const bad = makeValidCopy(brief);
    bad.product_description = bad.product_description.replace("$299", "affordable");
    bad.marketing_email.body = bad.marketing_email.body.replace("$299", "affordable");
    const codes = new Set(validate(bad, brief).map((item) => item.code));
    expect(codes.has(ViolationCode.MISSING_PRICE)).toBe(true);
  });

  it("test_price_presence_rejects_substring_of_longer_price", () => {
    const brief = makeCompleteBrief({ price: "$49" });
    const copy = makeValidCopy(brief);
    copy.product_description = copy.product_description.replace("$49", "$499");
    copy.marketing_email.body = copy.marketing_email.body.replace("$49", "$499");
    const codes = new Set(validate(copy, brief).map((item) => item.code));
    expect(codes.has(ViolationCode.MISSING_PRICE)).toBe(true);

    const exact = makeValidCopy(brief);
    expect(
      validate(exact, brief).some((item) => item.code === ViolationCode.MISSING_PRICE),
    ).toBe(false);
  });

  it("test_description_and_email_length", () => {
    const brief = makeCompleteBrief({ price: null });
    const short = {
      product_description: "Too short",
      marketing_email: { subject: "Hi", body: "Short", cta: "Buy" },
    };
    const codes = new Set(validate(short, brief).map((item) => item.code));
    expect(codes.has(ViolationCode.DESCRIPTION_LENGTH)).toBe(true);
    expect(codes.has(ViolationCode.EMAIL_LENGTH)).toBe(true);

    const good = makeValidCopy(brief);
    expect(
      validate(good, brief).some(
        (item) => item.code === ViolationCode.DESCRIPTION_LENGTH,
      ),
    ).toBe(false);
    expect(
      validate(good, brief).some((item) => item.code === ViolationCode.EMAIL_LENGTH),
    ).toBe(false);
  });

  it("test_cta_and_subject", () => {
    const brief = makeCompleteBrief({ price: null });
    const copy = makeValidCopy(brief);
    copy.marketing_email.cta = "";
    copy.marketing_email.subject = "";
    const codes = new Set(validate(copy, brief).map((item) => item.code));
    expect(codes.has(ViolationCode.MISSING_CTA)).toBe(true);
    expect(codes.has(ViolationCode.SUBJECT_TOO_LONG)).toBe(true);

    const longSubject = makeValidCopy(brief);
    longSubject.marketing_email.subject = "x".repeat(61);
    expect(
      validate(longSubject, brief).some(
        (item) => item.code === ViolationCode.SUBJECT_TOO_LONG,
      ),
    ).toBe(true);
  });

  it("test_placeholder_detection", () => {
    const brief = makeCompleteBrief({ price: null });
    const copy = makeValidCopy(brief);
    copy.product_description = pad(`Intro [TODO] ${copy.product_description}`, 60);
    expect(
      validate(copy, brief).some((item) => item.code === ViolationCode.PLACEHOLDER_TEXT),
    ).toBe(true);
  });

  it("test_validate_uses_injected_chain_in_order", () => {
    const brief = makeCompleteBrief({ price: null });
    const copy = {
      product_description: "Too short",
      marketing_email: { subject: "Hi", body: "Short", cta: "Buy" },
    };

    function first(): Violation[] {
      return [
        {
          code: ViolationCode.MISSING_CTA,
          message: "first",
          artifact: "email",
        },
      ];
    }

    function second(): Violation[] {
      return [
        {
          code: ViolationCode.MISSING_PRICE,
          message: "second",
          artifact: "description",
        },
      ];
    }

    const violations = validate(copy, brief, [first, second]);
    expect(violations.map((item) => item.message)).toEqual(["first", "second"]);
    expect(violations.map((item) => item.code)).toEqual([
      ViolationCode.MISSING_CTA,
      ViolationCode.MISSING_PRICE,
    ]);
    expect(violations.some((item) => item.code === ViolationCode.DESCRIPTION_LENGTH)).toBe(
      false,
    );
    expect(violations.some((item) => item.code === ViolationCode.EMAIL_LENGTH)).toBe(false);
  });
});
