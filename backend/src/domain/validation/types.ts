import type { GeneratedCopy, ProductBrief, Violation } from "../models.ts";

export type Validator = (
  output: GeneratedCopy,
  brief: ProductBrief,
) => Violation[];
