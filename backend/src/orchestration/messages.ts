export const META_CONTAINMENT_MESSAGE =
  "I can't reveal hidden instructions or change my role. " +
  "I'm here to help gather product facts and write store copy.";
export const OFF_TOPIC_MESSAGE =
  "Let's stay focused on your product so I can write useful copy.";
export const NOT_READY_GENERATION_MESSAGE =
  "I still need a bit more product information before generating copy.";
export const PRICE_REQUIRED_MESSAGE =
  "I need a confirmed exact price before I can generate and validate copy.";
export const CONFIRMATION_MESSAGE =
  "Fields are ready to generate description, please confirm.";
export const CONFIRMATION_PENDING_MESSAGE =
  "Fields are ready to generate description, please confirm.";
export const OPTIONAL_SKIPPED_ASSUMPTION =
  "{field} skipped by user; omitted from copy requirements.";
export const COPY_READY_MESSAGE = "Your copy is ready.";
export const COPY_READY_AFTER_REPAIR_MESSAGE =
  "Your copy is ready after one automatic repair.";
export const VALIDATION_FAILED_MESSAGE =
  "Copy was generated but still failed validation after one repair attempt.";
export const CANNOT_EXTRACT_MESSAGE = "I couldn't extract {field} from your message.";

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  product_name: "a product name",
  key_features: "key features",
  target_audience: "a target audience",
  tone: "a tone",
  price: "a price",
  category: "a category",
  brand_name: "a brand name",
};

export function cannotExtractMessage(field: string): string {
  const label = FIELD_DISPLAY_NAMES[field] ?? field.replaceAll("_", " ");
  return CANNOT_EXTRACT_MESSAGE.replace("{field}", label);
}

export const AFFIRMATIVE_RE =
  /^\s*(yes|yep|yeah|yup|ok|okay|sure|confirm|confirmed|go ahead|please (do|generate|write|confirm)|generate|write (it|the copy)|do it|sounds good|ready|accept)\b/i;

export const DECLINE_OPTIONAL_RE =
  /\b(skip|no thanks|no need|don'?t (need|include|want)|do not include|without (a )?brand|n\/?a|none|not needed)\b/i;

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE_RE.test(text);
}

export function isDeclineOptional(text: string): boolean {
  return DECLINE_OPTIONAL_RE.test(text);
}
