/**
 * seo-files.ts — SEO static file generation for generated sites.
 *
 * Writes sitemap.xml, robots.txt, llm.txt, and the IndexNow key file
 * directly into the site's dist/ directory after astro build().
 *
 * D134: Post-build file writing, not an Astro integration.
 * D133: IndexNow key file = 'buildermonster.txt' with content 'buildermonster'.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface SeoSiteInfo {
  domain: string;
  name: string;
  niche: string;
  language: string;
}

/** IndexNow key — must match the buildermonster.txt file at site root */
export const INDEXNOW_KEY = "buildermonster";

/**
 * Write sitemap.xml, robots.txt, llm.txt, and {INDEXNOW_KEY}.txt to distDir.
 * Non-fatal — throws only if distDir doesn't exist (caller should catch).
 *
 * @param distDir Absolute path to the site's dist/ directory
 * @param site    Site metadata
 * @param pageUrls Relative page URLs to include in sitemap (e.g. '/', '/categories/air-fryers')
 */
export function writeSeoFiles(distDir: string, site: SeoSiteInfo, pageUrls: string[]): void {
  const baseUrl = `https://${site.domain}`;
  const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // ── sitemap.xml ────────────────────────────────────────────────────────────
  const urlEntries = pageUrls
    .map((p) => {
      const loc = `${baseUrl}${p}`;
      const priority = p === "/" ? "1.0" : p.startsWith("/categories/") ? "0.9" : "0.8";
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${now}</lastmod>`,
        `    <changefreq>weekly</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlEntries,
    "</urlset>",
  ].join("\n");

  writeFileSync(join(distDir, "sitemap.xml"), sitemap, "utf-8");

  // ── robots.txt ─────────────────────────────────────────────────────────────
  const robots = ["User-agent: *", "Allow: /", "", `Sitemap: ${baseUrl}/sitemap.xml`, ""].join(
    "\n",
  );

  writeFileSync(join(distDir, "robots.txt"), robots, "utf-8");

  // ── llm.txt ────────────────────────────────────────────────────────────────
  // Emerging convention for AI agent crawlers — describes the site content
  const topPages = pageUrls
    .slice(0, 20)
    .map((p) => `- ${baseUrl}${p}`)
    .join("\n");

  const llmTxt = [
    `# ${site.name}`,
    "",
    `> This is an Amazon affiliate site about ${site.niche}, published in ${site.language}.`,
    "",
    "## Site Info",
    "",
    `- **Domain:** ${site.domain}`,
    `- **Niche:** ${site.niche}`,
    `- **Language:** ${site.language}`,
    `- **Site Map:** ${baseUrl}/sitemap.xml`,
    "",
    "## Main Pages",
    "",
    topPages,
    "",
    "## Notes for AI Agents",
    "",
    "- Product prices are regularly updated.",
    "- All affiliate links point to Amazon.",
    "- Content is SEO-optimized and written for human readers.",
    "",
    `*Last generated: ${now}*`,
    "",
  ].join("\n");

  writeFileSync(join(distDir, "llm.txt"), llmTxt, "utf-8");

  // ── IndexNow key file ──────────────────────────────────────────────────────
  // Must be present at https://{domain}/{key}.txt for IndexNow verification
  writeFileSync(join(distDir, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY, "utf-8");

  console.log(
    `[seo-files] wrote sitemap.xml (${pageUrls.length} URLs), robots.txt, llm.txt, ${INDEXNOW_KEY}.txt → ${distDir}`,
  );
}
