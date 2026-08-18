import type { GeneratedCopy } from "../models.ts";

export function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

export function wordCount(text: string): number {
  const plain = stripHtml(text);
  return plain.split(/\s+/).filter((part) => part.trim()).length;
}

export function visibleText(output: GeneratedCopy): string {
  return [
    output.product_description,
    output.marketing_email.subject,
    stripHtml(output.marketing_email.body),
    output.marketing_email.cta,
  ].join("\n");
}

export function priceTokenInText(price: string, text: string): boolean {
  const token = price.trim();
  if (!token) {
    return false;
  }
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<!\\w)${escaped}(?!\\w)`);
  return pattern.test(text);
}
