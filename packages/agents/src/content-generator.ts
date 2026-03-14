/**
 * ContentGenerator — Claude API structured-output generation for TSA sites.
 *
 * Uses @anthropic-ai/sdk messages.parse() with zodOutputFormat for type-safe
 * structured outputs. Pacing: 1.5s sleep between successful calls. Idempotency:
 * returns null immediately if `alreadyHasFocusKeyword` is true (skip path).
 *
 * NOT exported from packages/agents/src/index.ts — used only inside the worker.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod v4 schemas
// ---------------------------------------------------------------------------

export const CategoryContentSchema = z.object({
  seo_text: z
    .string()
    .describe('SEO-optimised category text, approximately 400 words'),
  focus_keyword: z
    .string()
    .describe('Primary focus keyword phrase, 3-5 words'),
  meta_description: z
    .string()
    .describe('Page meta description, 120-155 characters'),
});

export const ProductContentSchema = z.object({
  detailed_description: z
    .string()
    .describe('Engaging product description, 150-250 words'),
  pros: z
    .array(z.string())
    .describe('List of 3-5 product advantages'),
  cons: z
    .array(z.string())
    .describe('List of 2-4 product disadvantages'),
  user_opinions_summary: z
    .string()
    .describe('Summary of user opinions and sentiment, 80-120 words'),
  focus_keyword: z
    .string()
    .describe('Primary focus keyword phrase, 3-5 words'),
  meta_description: z
    .string()
    .describe('Page meta description, 120-155 characters'),
});

export type CategoryContent = z.infer<typeof CategoryContentSchema>;
export type ProductContent = z.infer<typeof ProductContentSchema>;

// ---------------------------------------------------------------------------
// ContentGenerator class
// ---------------------------------------------------------------------------

export class ContentGenerator {
  private readonly client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        '[ContentGenerator] ANTHROPIC_API_KEY is not set. ' +
          'Set it in the environment before starting the worker.',
      );
    }
    this.client = new Anthropic({ apiKey, maxRetries: 5 });
    console.log('[ContentGenerator] initialised — ANTHROPIC_API_KEY present');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Category content
  // -------------------------------------------------------------------------

  async generateCategoryContent(params: {
    name: string;
    keyword: string;
    language: string;
    alreadyHasFocusKeyword: boolean;
  }): Promise<CategoryContent | null> {
    const { name, keyword, language, alreadyHasFocusKeyword } = params;

    if (alreadyHasFocusKeyword) {
      console.log(
        `[ContentGenerator] category "${name}" — skipped (already generated)`,
      );
      return null;
    }

    const message = await this.client.messages.parse({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: `Generate all content in the following language: ${language}`,
      messages: [
        {
          role: 'user',
          content:
            `Generate SEO content for the product category "${name}" ` +
            `targeting the keyword "${keyword}". ` +
            `The seo_text should be approximately 400 words. ` +
            `The meta_description must be between 120 and 155 characters. ` +
            `The focus_keyword should be a specific 3-5 word phrase.`,
        },
      ],
      output_config: {
        format: zodOutputFormat(CategoryContentSchema),
      },
    });

    const content = message.parsed_output;
    if (!content) {
      throw new Error(
        `[ContentGenerator] category "${name}" — failed to parse structured output`,
      );
    }

    console.log(
      `[ContentGenerator] category "${name}" — generated focus_keyword="${content.focus_keyword}"`,
    );

    await this.sleep(1500);
    return content;
  }

  // -------------------------------------------------------------------------
  // Product content
  // -------------------------------------------------------------------------

  async generateProductContent(params: {
    asin: string;
    title: string;
    price: number;
    language: string;
    alreadyHasFocusKeyword: boolean;
  }): Promise<ProductContent | null> {
    const { asin, title, price, language, alreadyHasFocusKeyword } = params;

    if (alreadyHasFocusKeyword) {
      console.log(
        `[ContentGenerator] product "${asin}" — skipped (already generated)`,
      );
      return null;
    }

    const message = await this.client.messages.parse({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: `Generate all content in the following language: ${language}`,
      messages: [
        {
          role: 'user',
          content:
            `Generate SEO content for the product titled "${title}" ` +
            `priced at ${price}. ` +
            `The detailed_description should be 150-250 words. ` +
            `List 3-5 pros and 2-4 cons. ` +
            `The user_opinions_summary should be 80-120 words. ` +
            `The meta_description must be between 120 and 155 characters. ` +
            `The focus_keyword should be a specific 3-5 word phrase.`,
        },
      ],
      output_config: {
        format: zodOutputFormat(ProductContentSchema),
      },
    });

    const content = message.parsed_output;
    if (!content) {
      throw new Error(
        `[ContentGenerator] product "${asin}" — failed to parse structured output`,
      );
    }

    console.log(
      `[ContentGenerator] product "${asin}" — generated focus_keyword="${content.focus_keyword}"`,
    );

    await this.sleep(1500);
    return content;
  }
}
