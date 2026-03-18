/**
 * Link cloaking module — template-agnostic, reusable by all future TSA templates.
 *
 * Why cloaking?
 * - Cleaner URLs: `/go/product-slug/` instead of `https://www.amazon.es/dp/ASIN?tag=...`
 * - Better CTR: affiliate URLs look native and trustworthy
 * - Centralised tracking: all affiliate exits go through a single URL pattern
 * - `rel="nofollow sponsored"` on the `/go/` link is sufficient for compliance
 *
 * The actual redirect is a static HTML page at `/go/{slug}/index.html` using
 * a meta-refresh to the real Amazon URL. HTTP 302 redirects require Caddy rules
 * (deferred — see DECISIONS.md).
 *
 * Usage:
 *   import { buildCloakUrl, buildCloakMap } from "../lib/cloaking";
 *   const href = buildCloakUrl(product.slug);        // "/go/my-product-slug/"
 *   const map = buildCloakMap(products, market, tag); // { slug → amazonUrl }
 */

import type { AmazonMarket } from "@monster/shared";
import { buildAffiliateUrl } from "./data";
import type { ProductData } from "./data";

/**
 * Return the cloaked URL path for a product.
 * Always returns a root-relative path with trailing slash.
 */
export function buildCloakUrl(productSlug: string): string {
  return `/go/${productSlug}/`;
}

/**
 * Build a map of product slug → real affiliate URL for use in the
 * `/go/[slug].astro` getStaticPaths().
 */
export function buildCloakMap(
  products: ProductData[],
  market: AmazonMarket,
  affiliateTag: string
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const product of products) {
    map[product.slug] = buildAffiliateUrl(product.asin, market, affiliateTag);
  }
  return map;
}
