import { meaningfulFeatures } from "../gate.ts";
import {
  type GeneratedCopy,
  type ProductBrief,
  type Violation,
  type ViolationArtifact,
  BRIEF_FIELDS,
  FieldStatus,
  ViolationCode,
} from "../models.ts";
import {
  priceTokenInText,
  stripHtml,
  visibleText,
  wordCount,
} from "./text.ts";

export const DESCRIPTION_MIN_WORDS = 60;
export const DESCRIPTION_MAX_WORDS = 200;
export const EMAIL_MIN_WORDS = 80;
export const EMAIL_MAX_WORDS = 250;
export const SUBJECT_MAX_CHARS = 60;
/** Deliberate POC heuristic, not a tuned value. */
export const FEATURE_COVERAGE_MIN_RATIO = 0.7;
/** Deliberate POC heuristic, not a tuned value. */
export const FEATURE_WORD_MATCH_MIN_RATIO = 0.5;

export const PLACEHOLDER_PATTERNS = [
  "\\[TODO\\]",
  "\\{\\{product_name\\}\\}",
  "lorem ipsum",
] as const;

export const FORBIDDEN_CLAIMS = [
  "fda approved",
  "clinically proven",
  "guaranteed results",
  "#1",
] as const;

export function validatePricePresence(
  output: GeneratedCopy,
  brief: ProductBrief,
): Violation[] {
  if (brief.price.status !== FieldStatus.CONFIRMED || !brief.price.value) {
    return [];
  }
  const price = String(brief.price.value).trim();
  if (!price) {
    return [];
  }
  const inDescription = priceTokenInText(price, output.product_description);
  const inEmail = priceTokenInText(price, stripHtml(output.marketing_email.body));
  if (inDescription && inEmail) {
    return [];
  }
  let artifact: ViolationArtifact;
  let message: string;
  if (!inDescription && !inEmail) {
    artifact = "both";
    message = "Confirmed price missing from description and email body";
  } else if (!inDescription) {
    artifact = "description";
    message = "Confirmed price missing from product description";
  } else {
    artifact = "email";
    message = "Confirmed price missing from email body";
  }
  return [
    {
      code: ViolationCode.MISSING_PRICE,
      message,
      artifact,
    },
  ];
}

export function validateDescriptionLength(
  output: GeneratedCopy,
  _brief: ProductBrief,
): Violation[] {
  const count = wordCount(output.product_description);
  if (count >= DESCRIPTION_MIN_WORDS && count <= DESCRIPTION_MAX_WORDS) {
    return [];
  }
  return [
    {
      code: ViolationCode.DESCRIPTION_LENGTH,
      message:
        `Product description has ${count} words; ` +
        `expected ${DESCRIPTION_MIN_WORDS}-${DESCRIPTION_MAX_WORDS}`,
      artifact: "description",
    },
  ];
}

export function validateEmailLength(
  output: GeneratedCopy,
  _brief: ProductBrief,
): Violation[] {
  const count = wordCount(output.marketing_email.body);
  if (count >= EMAIL_MIN_WORDS && count <= EMAIL_MAX_WORDS) {
    return [];
  }
  return [
    {
      code: ViolationCode.EMAIL_LENGTH,
      message:
        `Email body has ${count} words; ` +
        `expected ${EMAIL_MIN_WORDS}-${EMAIL_MAX_WORDS}`,
      artifact: "email",
    },
  ];
}

export function validateCta(
  output: GeneratedCopy,
  _brief: ProductBrief,
): Violation[] {
  if (output.marketing_email.cta && output.marketing_email.cta.trim()) {
    return [];
  }
  return [
    {
      code: ViolationCode.MISSING_CTA,
      message: "Marketing email CTA is missing",
      artifact: "email",
    },
  ];
}

export function validateSubject(
  output: GeneratedCopy,
  _brief: ProductBrief,
): Violation[] {
  const subject = output.marketing_email.subject || "";
  if (subject.trim() && subject.length <= SUBJECT_MAX_CHARS) {
    return [];
  }
  const message = !subject.trim()
    ? "Email subject is empty"
    : `Email subject is ${subject.length} characters; maximum is ${SUBJECT_MAX_CHARS}`;
  return [
    {
      code: ViolationCode.SUBJECT_TOO_LONG,
      message,
      artifact: "email",
    },
  ];
}

function featureCovered(feature: string, text: string): boolean {
  const normalized = feature.trim().toLowerCase().replace(/\s+/g, " ");
  const haystack = text.toLowerCase();
  if (normalized && haystack.includes(normalized)) {
    return true;
  }
  const words = normalized.split(/\W+/).filter((word) => word.length > 2);
  if (words.length === 0) {
    return Boolean(normalized) && haystack.includes(normalized);
  }
  const hits = words.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
  }).length;
  return hits / words.length >= FEATURE_WORD_MATCH_MIN_RATIO;
}

export function validateFeatureCoverage(
  output: GeneratedCopy,
  brief: ProductBrief,
): Violation[] {
  const features = meaningfulFeatures(brief.key_features.value);
  if (features.length === 0) {
    return [];
  }
  const covered = features.filter((feature) =>
    featureCovered(feature, output.product_description),
  ).length;
  const ratio = covered / features.length;
  if (ratio >= FEATURE_COVERAGE_MIN_RATIO) {
    return [];
  }
  return [
    {
      code: ViolationCode.FEATURE_COVERAGE,
      message:
        `Product description covers ${covered}/${features.length} ` +
        `key features (${Math.round(ratio * 100)}%); need at least 70%`,
      artifact: "description",
    },
  ];
}

export function validatePlaceholders(
  output: GeneratedCopy,
  _brief: ProductBrief,
): Violation[] {
  const blob = visibleText(output);
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (new RegExp(pattern, "i").test(blob)) {
      return [
        {
          code: ViolationCode.PLACEHOLDER_TEXT,
          message: `Generated copy contains placeholder text matching ${pattern}`,
          artifact: "both",
        },
      ];
    }
  }
  return [];
}

function briefTextBlob(brief: ProductBrief): string {
  const parts: string[] = [];
  for (const name of BRIEF_FIELDS) {
    const field = brief[name];
    if (field.value === null) {
      continue;
    }
    if (Array.isArray(field.value)) {
      parts.push(...field.value.map((item) => String(item)));
    } else {
      parts.push(String(field.value));
    }
    if (field.raw_text) {
      parts.push(field.raw_text);
    }
  }
  parts.push(...brief.assumptions);
  return parts.join(" ").toLowerCase();
}

export function validateForbiddenClaims(
  output: GeneratedCopy,
  brief: ProductBrief,
): Violation[] {
  const blob = visibleText(output).toLowerCase();
  const supported = briefTextBlob(brief);
  const violations: Violation[] = [];
  for (const claim of FORBIDDEN_CLAIMS) {
    if (blob.includes(claim) && !supported.includes(claim)) {
      violations.push({
        code: ViolationCode.FORBIDDEN_CLAIM,
        message: `Unsupported claim detected: ${claim}`,
        artifact: "both",
      });
    }
  }
  return violations;
}
