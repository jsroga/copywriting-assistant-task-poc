import type {
  ChatMessage,
  ExtractionResult,
  GeneratedCopy,
  MarketingEmail,
  ProductBrief,
  Violation,
} from "./domain/models.ts";

export interface LLMClient {
  extract(
    message: string,
    brief: ProductBrief,
    historyTail: ChatMessage[],
  ): Promise<ExtractionResult>;

  streamProductDescription(brief: ProductBrief): AsyncIterable<string>;

  streamEmailBody(
    brief: ProductBrief,
    productDescription: string,
  ): AsyncIterable<string>;

  generateEmail(
    brief: ProductBrief,
    productDescription: string,
    options: { body: string },
  ): Promise<MarketingEmail>;

  repair(
    brief: ProductBrief,
    previousOutput: GeneratedCopy,
    violations: Violation[],
  ): Promise<GeneratedCopy>;
}
