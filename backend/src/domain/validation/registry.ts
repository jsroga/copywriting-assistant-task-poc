import {
  validateCta,
  validateDescriptionLength,
  validateEmailLength,
  validateFeatureCoverage,
  validateForbiddenClaims,
  validatePlaceholders,
  validatePricePresence,
  validateSubject,
} from "./rules.ts";
import type { Validator } from "./types.ts";

export const DEFAULT_VALIDATORS: Validator[] = [
  validatePricePresence,
  validateDescriptionLength,
  validateEmailLength,
  validateCta,
  validateSubject,
  validateFeatureCoverage,
  validatePlaceholders,
  validateForbiddenClaims,
];
