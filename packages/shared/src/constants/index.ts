import type { AmazonMarket, Language, SiteStatus } from '../types/index.js';

// ── Amazon Markets ─────────────────────────────────────────────────────────

export const AMAZON_MARKETS = [
  { slug: 'ES' as AmazonMarket, label: 'Spain',         domain: 'amazon.es',     currency: 'EUR' },
  { slug: 'US' as AmazonMarket, label: 'United States', domain: 'amazon.com',    currency: 'USD' },
  { slug: 'UK' as AmazonMarket, label: 'United Kingdom',domain: 'amazon.co.uk',  currency: 'GBP' },
  { slug: 'DE' as AmazonMarket, label: 'Germany',       domain: 'amazon.de',     currency: 'EUR' },
  { slug: 'FR' as AmazonMarket, label: 'France',        domain: 'amazon.fr',     currency: 'EUR' },
  { slug: 'IT' as AmazonMarket, label: 'Italy',         domain: 'amazon.it',     currency: 'EUR' },
  { slug: 'MX' as AmazonMarket, label: 'Mexico',        domain: 'amazon.com.mx', currency: 'MXN' },
  { slug: 'CA' as AmazonMarket, label: 'Canada',        domain: 'amazon.ca',     currency: 'CAD' },
  { slug: 'JP' as AmazonMarket, label: 'Japan',         domain: 'amazon.co.jp',  currency: 'JPY' },
  { slug: 'AU' as AmazonMarket, label: 'Australia',     domain: 'amazon.com.au', currency: 'AUD' },
] as const satisfies ReadonlyArray<{ slug: AmazonMarket; label: string; domain: string; currency: string }>;

// ── Supported Languages ────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
  { code: 'es' as Language, label: 'Spanish'  },
  { code: 'en' as Language, label: 'English'  },
  { code: 'de' as Language, label: 'German'   },
  { code: 'fr' as Language, label: 'French'   },
  { code: 'it' as Language, label: 'Italian'  },
  { code: 'ja' as Language, label: 'Japanese' },
] as const satisfies ReadonlyArray<{ code: Language; label: string }>;

// ── Site Status Flow ───────────────────────────────────────────────────────
// Defines valid next-state transitions per status.
// Terminal states (live, error) still list reachable states for clarity.

export const SITE_STATUS_FLOW: Record<SiteStatus, SiteStatus[]> = {
  draft:       ['generating'],
  generating:  ['generated', 'deploying', 'error'],
  generated:   ['deploying'],
  deploying:   ['dns_pending', 'error'],
  dns_pending: ['ssl_pending', 'error'],
  ssl_pending: ['live', 'error'],
  live:        ['paused', 'generating'],
  paused:      ['generating', 'live'],
  error:       ['draft', 'generating'],
} as const;

// ── Rebuild Triggers ───────────────────────────────────────────────────────
// Product-data fields that trigger a site rebuild when changed (per D008).

export const REBUILD_TRIGGERS = ['price', 'availability', 'images'] as const;

export type RebuildTrigger = (typeof REBUILD_TRIGGERS)[number];
