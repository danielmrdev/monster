import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AmazonMarket, Language, SiteTemplate } from "@monster/shared";
import { AMAZON_MARKETS } from "@monster/shared";

// ── Types ─────────────────────────────────────────────────────────────────

export interface SiteCustomization {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
}

export interface SiteInfo {
  name: string;
  domain: string;
  market: AmazonMarket;
  language: Language;
  currency: string;
  affiliate_tag: string;
  template_slug: SiteTemplate;
  customization: SiteCustomization;
  focus_keyword: string | null;
  /** Site UUID — used by the analytics tracker as the `site_id` POST field. */
  id: string;
  /** Supabase project URL — baked into the tracker at Astro build time. */
  supabase_url: string;
  /** Supabase anon key — INSERT-only RLS, safe to expose in static HTML. */
  supabase_anon_key: string;
}

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  seo_text: string;
  category_image: string | null;
  keywords: string[];
  focus_keyword: string | null;
  meta_description: string | null;
}

export interface ProsCons {
  pros: string[];
  cons: string[];
}

export interface ProductData {
  id: string;
  asin: string;
  title: string;
  slug: string;
  current_price: number;
  images: string[];
  rating: number;
  is_prime: boolean;
  detailed_description: string | null;
  pros_cons: ProsCons | null;
  category_slug: string;
  focus_keyword: string | null;
  user_opinions_summary: string | null;
  meta_description: string | null;
}

export interface SiteData {
  site: SiteInfo;
  categories: CategoryData[];
  products: ProductData[];
}

// ── Loader ────────────────────────────────────────────────────────────────

/**
 * Read `src/data/<slug>/site.json` at build time.
 * Call this from getStaticPaths() — it runs in Node.js during the Astro SSG build.
 *
 * Uses process.cwd() (the generator project root) rather than import.meta.url,
 * because getStaticPaths() executes from a prerender chunk in dist/.prerender/,
 * not from src/. process.cwd() is always the generator root during `astro build`.
 */
export function loadSiteData(slug: string): SiteData {
  const jsonPath = join(process.cwd(), "src", "data", slug, "site.json");
  const raw = readFileSync(jsonPath, "utf-8");
  return JSON.parse(raw) as SiteData;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Derive the Amazon domain string (e.g. "amazon.es") for a given market code. */
export function getAmazonDomain(market: AmazonMarket): string {
  const found = AMAZON_MARKETS.find((m) => m.slug === market);
  return found?.domain ?? "amazon.com";
}

/** Build the affiliate URL for a product ASIN. */
export function buildAffiliateUrl(
  asin: string,
  market: AmazonMarket,
  affiliateTag: string
): string {
  const domain = getAmazonDomain(market);
  return `https://www.${domain}/dp/${asin}?tag=${affiliateTag}`;
}
