/**
 * Market options for niche research.
 * Not in actions.ts — 'use server' files must export only async functions (D034).
 */
export const MARKET_OPTIONS = [
  { value: "ES", label: "Spain (Amazon.es)" },
  { value: "US", label: "USA (Amazon.com)" },
  { value: "UK", label: "UK (Amazon.co.uk)" },
] as const;

export type MarketValue = (typeof MARKET_OPTIONS)[number]["value"];

/**
 * Server action state type — kept here (not in actions.ts) per D034:
 * 'use server' files must export only async functions.
 */
export type EnqueueResearchState = { error: string } | null;
