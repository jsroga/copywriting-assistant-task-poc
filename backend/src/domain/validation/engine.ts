import type { GeneratedCopy, ProductBrief, Violation } from "../models.ts";
import type { Validator } from "./types.ts";

export function validate(
  output: GeneratedCopy,
  brief: ProductBrief,
  validators: Validator[] | null = null,
): Violation[] {
  const chain = validators ?? [];
  const violations: Violation[] = [];
  for (const validator of chain) {
    violations.push(...validator(output, brief));
  }
  return violations;
}
