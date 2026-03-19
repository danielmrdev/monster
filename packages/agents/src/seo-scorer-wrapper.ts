import { marked } from "marked";
import { scorePage } from "@monster/seo-scorer";
import type { PageType } from "@monster/seo-scorer";

/**
 * Score raw markdown text for content quality.
 * Wraps markdown in a minimal HTML stub (H1 + meta description + body) so scorePage()
 * can compute word count, keyword density, heading structure, and Flesch score.
 * Returns only content_quality_score (0–100) — the sole iteration signal (D178).
 *
 * The overall SeoScore will be low (~30–40) because meta/links/schema/technical/social
 * all need the built Astro site. Only content_quality_score is meaningful here.
 *
 * KN009: marked(text) is synchronous in v17 — no await needed.
 *
 * @param language  BCP-47 language code (e.g. 'es', 'en', 'fr'). Passed to scorePage()
 *                  so the Flesch sub-score is bypassed for non-English languages —
 *                  the Flesch-Kincaid formula is calibrated for English only.
 */
export function scoreMarkdown(
  text: string,
  keyword: string,
  pageType: PageType,
  language = "en",
): number {
  const htmlBody = marked(text) as string;
  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
<title>${keyword}</title>
<meta name="description" content="${keyword}">
</head>
<body>
<h1>${keyword}</h1>
${htmlBody}
</body>
</html>`;
  const result = scorePage(html, keyword, pageType, language);
  return result.content_quality;
}
