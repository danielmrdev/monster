import { z } from 'zod';

// ---------------------------------------------------------------------------
// ResearchReport — structured output of the NicheResearcher agent.
//
// The agent is instructed to emit JSON matching this schema as its final turn.
// The BullMQ job handler parses SDKResultMessage.result (string) with:
//   ResearchReportSchema.parse(JSON.parse(result))
//
// On parse failure the job stores { raw: result, error: 'parse_failed' }
// in research_sessions.report rather than failing the job entirely.
// ---------------------------------------------------------------------------

export const ResearchReportSchema = z.object({
  /** The original niche idea as submitted by the user. */
  niche_idea: z.string(),

  /** Amazon market code (e.g. "ES", "US"). */
  market: z.string(),

  /** 0–100 viability score assigned by the agent. */
  viability_score: z.number().min(0).max(100),

  /** Executive summary of the research findings. */
  summary: z.string(),

  /** Keywords researched via DataForSEO Labs. */
  keywords: z.array(
    z.object({
      keyword: z.string(),
      search_volume: z.number().nullable(),
      cpc: z.number().nullable(),
      competition: z.number().nullable(), // 0–1 scale
    })
  ),

  /** Competitor domains identified via DataForSEO Labs SERP competitors. */
  competitors: z.array(
    z.object({
      domain: z.string(),
      median_position: z.number().nullable(),
      relevance: z.string(),
    })
  ),

  /** Amazon products found via DataForSEO Merchant API. */
  amazon_products: z.array(
    z.object({
      asin: z.string(),
      title: z.string(),
      price: z.number().nullable(),
      rating: z.number(),
      review_count: z.number(),
      is_prime: z.boolean(),
    })
  ),

  /**
   * Domain suggestions with availability status.
   * available=null means not yet checked; true/false = checked via Spaceship API.
   */
  domain_suggestions: z.array(
    z.object({
      domain: z.string(),
      available: z.boolean().nullable(),
      price: z.string().optional(),
    })
  ),

  /** Agent's actionable recommendation for whether to pursue this niche. */
  recommendation: z.string(),

  /** ISO 8601 timestamp of when the report was generated. */
  generated_at: z.string(),
});

export type ResearchReport = z.infer<typeof ResearchReportSchema>;
