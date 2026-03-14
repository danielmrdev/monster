export * from './customization.js';
export * from './research-report.js';

// ── String-literal union types ─────────────────────────────────────────────

export type SiteStatus =
  | 'draft'
  | 'generating'
  | 'deploying'
  | 'dns_pending'
  | 'ssl_pending'
  | 'live'
  | 'paused'
  | 'error';

export type AmazonMarket =
  | 'ES'
  | 'US'
  | 'UK'
  | 'DE'
  | 'FR'
  | 'IT'
  | 'MX'
  | 'CA'
  | 'JP'
  | 'AU';

export type Language = 'es' | 'en' | 'de' | 'fr' | 'it' | 'ja';

export type SiteTemplate = 'classic' | 'modern' | 'minimal';

// ── Domain interfaces (fields narrowed to union types where applicable) ─────

/** Matches the `sites` table Row shape with string fields narrowed to union types. */
export interface Site {
  id: string;
  name: string;
  domain: string | null;
  niche: string | null;
  site_type_slug: string;
  /** Narrowed — one of the 8 defined statuses. */
  status: SiteStatus;
  /** Amazon market code. Null if not yet assigned. */
  market: AmazonMarket | null;
  /** BCP-47-style language code. Null if not yet assigned. */
  language: Language | null;
  currency: string | null;
  /** Template slug. Narrowed to the three supported variants. */
  template_slug: SiteTemplate;
  affiliate_tag: string | null;
  /** JSON blob for colors, typography, logo, favicon customization. */
  customization: Record<string, unknown> | null;
  company_name: string | null;
  contact_email: string | null;
  focus_keyword: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches the `tsa_categories` table Row shape. */
export interface TsaCategory {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  description: string | null;
  seo_text: string | null;
  focus_keyword: string | null;
  keywords: string[] | null;
  /** Path to the representative product image (local WebP asset). */
  category_image: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches the `tsa_products` table Row shape. */
export interface TsaProduct {
  id: string;
  site_id: string;
  asin: string;
  title: string | null;
  slug: string | null;
  current_price: number | null;
  original_price: number | null;
  /** Local WebP asset paths (downloaded from Amazon, optimized). */
  images: string[] | null;
  rating: number | null;
  review_count: number | null;
  is_prime: boolean;
  availability: string | null;
  condition: string | null;
  detailed_description: string | null;
  focus_keyword: string | null;
  /** JSON: { pros: string[]; cons: string[] } */
  pros_cons: Record<string, unknown> | null;
  user_opinions_summary: string | null;
  /** JSON: Array of { date: string; price: number } snapshots. */
  price_history: Record<string, unknown> | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}
