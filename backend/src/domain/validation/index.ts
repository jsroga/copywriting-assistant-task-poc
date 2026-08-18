import type { GeneratedCopy, ProductBrief, Violation } from "../models.ts";
import { validate as runValidators } from "./engine.ts";
import { DEFAULT_VALIDATORS } from "./registry.ts";
import type { Validator } from "./types.ts";

export type { Validator } from "./types.ts";
export { DEFAULT_VALIDATORS } from "./registry.ts";

export function validate(
  output: GeneratedCopy,
  brief: ProductBrief,
  validators: Validator[] | null = null,
): Violation[] {
  const chain = validators ?? DEFAULT_VALIDATORS;
  return runValidators(output, brief, chain);
}
