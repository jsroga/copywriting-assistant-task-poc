import type {
  ChatMessage,
  ExtractionResult,
  FieldValue,
  GeneratedCopy,
  MarketingEmail,
  ProductBrief,
  Violation,
} from "../domain/models.ts";
import {
  FieldStatus,
  Intent,
  cloneProductBrief,
  createExtractionResult,
  createFieldValue,
  createProductBrief,
} from "../domain/models.ts";
import type { LLMClient } from "../ports.ts";

export type ExtractFn = (
  message: string,
  brief: ProductBrief,
  historyTail: ChatMessage[],
) => ExtractionResult | Promise<ExtractionResult>;

export type GenerateFn = (brief: ProductBrief) => GeneratedCopy;
export type RepairFn = (
  brief: ProductBrief,
  previous: GeneratedCopy,
  violations: Violation[],
) => GeneratedCopy;

export function makeCompleteBrief(options: {
  product_name?: string;
  key_features?: string[] | null;
  target_audience?: string;
  tone?: string;
  price?: string | null;
  category?: string | null;
  brand_name?: string | null;
} = {}): ProductBrief {
  const features =
    options.key_features ?? ["keeps drinks cold for 24 hours", "leak-proof lid"];
  const brief = createProductBrief({
    product_name: createFieldValue({
      value: options.product_name ?? "AquaPure Bottle",
      status: FieldStatus.CONFIRMED,
    }),
    key_features: createFieldValue({
      value: features,
      status: FieldStatus.CONFIRMED,
    }),
    target_audience: createFieldValue({
      value: options.target_audience ?? "busy professionals",
      status: FieldStatus.CONFIRMED,
    }),
    tone: createFieldValue({
      value: options.tone ?? "premium",
      status: FieldStatus.CONFIRMED,
    }),
    version: 1,
  });
  if (options.price !== undefined) {
    if (options.price !== null) {
      brief.price = createFieldValue({
        value: options.price,
        status: FieldStatus.CONFIRMED,
      });
    }
  } else {
    brief.price = createFieldValue({
      value: "$299",
      status: FieldStatus.CONFIRMED,
    });
  }
  if (options.category !== undefined) {
    if (options.category !== null) {
      brief.category = createFieldValue({
        value: options.category,
        status: FieldStatus.CONFIRMED,
      });
    }
  } else {
    brief.category = createFieldValue({
      value: "drinkware",
      status: FieldStatus.CONFIRMED,
    });
  }
  if (options.brand_name !== undefined) {
    if (options.brand_name !== null) {
      brief.brand_name = createFieldValue({
        value: options.brand_name,
        status: FieldStatus.CONFIRMED,
      });
    }
  } else {
    brief.brand_name = createFieldValue({
      value: "AquaPure",
      status: FieldStatus.CONFIRMED,
    });
  }
  return brief;
}

function words(n: number, seed = "word"): string {
  return Array.from({ length: n }, (_, index) => `${seed}${index}`).join(" ");
}

export function makeValidCopy(brief: ProductBrief): GeneratedCopy {
  const name = String(brief.product_name.value ?? "Product");
  const features = Array.isArray(brief.key_features.value)
    ? brief.key_features.value
    : [];
  const featureText = features.map((item) => String(item)).join(" ");
  const price =
    brief.price.status === FieldStatus.CONFIRMED && brief.price.value
      ? String(brief.price.value)
      : "";
  const priceClause = price ? ` Priced at ${price}.` : "";
  const description =
    `${name} is designed for ${brief.target_audience.value}. ` +
    `It highlights ${featureText}. ` +
    `The tone is ${brief.tone.value}.${priceClause} ` +
    `${words(70, "desc")}`;
  const body =
    `<p>Hello, discover <strong>${name}</strong>.</p>` +
    `<p>Key benefits include ${featureText}.${priceClause}</p>` +
    `<p>${words(90, "email")}</p>`;
  return {
    product_description: description,
    marketing_email: {
      subject: `Meet ${name}`.slice(0, 60),
      body,
      cta: "Shop now",
    },
  };
}

export function makeInvalidCopyMissingPrice(brief: ProductBrief): GeneratedCopy {
  const copy = makeValidCopy(brief);
  if (brief.price.value) {
    const price = String(brief.price.value);
    copy.product_description = copy.product_description.replaceAll(
      price,
      "an attractive price",
    );
    copy.marketing_email.body = copy.marketing_email.body.replaceAll(
      price,
      "an attractive price",
    );
  }
  return copy;
}

function cloneCopy(copy: GeneratedCopy): GeneratedCopy {
  return structuredClone(copy);
}

function cloneEmail(email: MarketingEmail): MarketingEmail {
  return { ...email };
}

export class FakeLLMClient implements LLMClient {
  private extractQueue: ExtractionResult[];
  private generateQueue: GeneratedCopy[];
  private repairQueue: GeneratedCopy[];
  private extractFn: ExtractFn | null;
  private generateFn: GenerateFn | null;
  private repairFn: RepairFn | null;
  private defaultExtract: ExtractionResult;
  private streamCache: GeneratedCopy | null = null;
  private emailBodyCache: MarketingEmail | null = null;

  extractCalls = 0;
  generateCalls = 0;
  repairCalls = 0;
  streamCalls = 0;
  lastGenerateBrief: ProductBrief | null = null;
  lastRepairBrief: ProductBrief | null = null;

  constructor(options: {
    extractQueue?: ExtractionResult[];
    generateQueue?: GeneratedCopy[];
    repairQueue?: GeneratedCopy[];
    extractFn?: ExtractFn;
    generateFn?: GenerateFn;
    repairFn?: RepairFn;
    defaultExtract?: ExtractionResult;
  } = {}) {
    this.extractQueue = [...(options.extractQueue ?? [])];
    this.generateQueue = [...(options.generateQueue ?? [])];
    this.repairQueue = [...(options.repairQueue ?? [])];
    this.extractFn = options.extractFn ?? null;
    this.generateFn = options.generateFn ?? null;
    this.repairFn = options.repairFn ?? null;
    this.defaultExtract =
      options.defaultExtract ??
      createExtractionResult({ intent: Intent.PROVIDE_INFO });
  }

  async extract(
    message: string,
    brief: ProductBrief,
    historyTail: ChatMessage[],
  ): Promise<ExtractionResult> {
    this.extractCalls += 1;
    if (this.extractFn !== null) {
      return this.extractFn(message, brief, historyTail);
    }
    if (this.extractQueue.length > 0) {
      return this.extractQueue.shift() as ExtractionResult;
    }
    return structuredClone(this.defaultExtract);
  }

  async *streamProductDescription(brief: ProductBrief): AsyncIterable<string> {
    this.streamCalls += 1;
    this.generateCalls += 1;
    this.lastGenerateBrief = cloneProductBrief(brief);
    this.streamCache = this.nextGenerated(brief, true);
    const wordList = this.streamCache.product_description.split(" ");
    for (const [index, word] of wordList.entries()) {
      yield index === 0 ? word : ` ${word}`;
    }
  }

  async *streamEmailBody(
    brief: ProductBrief,
    productDescription: string,
  ): AsyncIterable<string> {
    void productDescription;
    const email =
      this.streamCache !== null
        ? this.streamCache.marketing_email
        : this.nextGenerated(brief, false).marketing_email;
    this.emailBodyCache = email;
    const tokens = email.body.replaceAll(">", "> ").split(" ");
    for (const [index, token] of tokens.entries()) {
      yield index === 0 ? token : ` ${token}`;
    }
  }

  async generateEmail(
    brief: ProductBrief,
    productDescription: string,
    options: { body: string },
  ): Promise<MarketingEmail> {
    void productDescription;
    if (this.emailBodyCache !== null) {
      const email = cloneEmail(this.emailBodyCache);
      email.body = options.body;
      this.emailBodyCache = null;
      this.streamCache = null;
      return email;
    }
    if (this.streamCache !== null) {
      const email = this.streamCache.marketing_email;
      this.streamCache = null;
      return email;
    }
    return this.nextGenerated(brief, false).marketing_email;
  }

  async repair(
    brief: ProductBrief,
    previousOutput: GeneratedCopy,
    violations: Violation[],
  ): Promise<GeneratedCopy> {
    this.repairCalls += 1;
    this.lastRepairBrief = cloneProductBrief(brief);
    if (this.repairFn !== null) {
      return this.repairFn(brief, previousOutput, violations);
    }
    if (this.repairQueue.length > 0) {
      return this.repairQueue.shift() as GeneratedCopy;
    }
    return makeValidCopy(brief);
  }

  private nextGenerated(brief: ProductBrief, consume: boolean): GeneratedCopy {
    if (this.generateFn !== null) {
      return this.generateFn(brief);
    }
    if (this.generateQueue.length > 0) {
      if (consume) {
        return this.generateQueue.shift() as GeneratedCopy;
      }
      return cloneCopy(this.generateQueue[0]);
    }
    return makeValidCopy(brief);
  }
}

export type { FieldValue };
