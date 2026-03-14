import * as cheerio from 'cheerio';
import readability from 'text-readability';
import type { PageType, SeoScore } from './types.js';

export type { PageType, SeoScore } from './types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function containsKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function keywordCount(text: string, keyword: string): number {
  if (!keyword || !text) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'gi');
  return (text.match(re) ?? []).length;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ─── word-count thresholds by page type ─────────────────────────────────────

const WORD_COUNT_THRESHOLDS: Record<PageType, { min: number; good: number }> = {
  homepage: { min: 200, good: 400 },
  category: { min: 100, good: 200 },
  product: { min: 200, good: 300 },
  legal: { min: 300, good: 500 },
};

// ─── 1. Content Quality (30%) ────────────────────────────────────────────────

function scoreContentQuality(
  bodyText: string,
  firstParaText: string,
  words: number,
  keyword: string,
  pageType: PageType,
  flesch: number,
): number {
  const isLegal = pageType === 'legal';
  const thresholds = WORD_COUNT_THRESHOLDS[pageType];
  let score = 0;

  // Word count sub-score (0–30 pts)
  if (words >= thresholds.good) {
    score += 30;
  } else if (words >= thresholds.min) {
    score += 15 + Math.round(((words - thresholds.min) / (thresholds.good - thresholds.min)) * 15);
  } else if (words > 0) {
    score += Math.round((words / thresholds.min) * 10);
  }

  // Keyword density sub-score (0–30 pts) — skipped for legal
  if (!isLegal && keyword) {
    const density = words > 0 ? (keywordCount(bodyText, keyword) / words) * 100 : 0;
    if (density >= 0.5 && density <= 3) {
      score += 30;
    } else if (density > 3) {
      score += 10; // over-optimized, partial
    } else if (density > 0) {
      score += 15;
    }
    // density === 0 → 0 pts

    // Keyword in first paragraph sub-score (0–20 pts) — skipped for legal
    if (firstParaText && containsKeyword(firstParaText, keyword)) {
      score += 20;
    }
  } else {
    // Legal page — allocate those sub-scores to word count bonus
    score += 30; // keyword density exempted → full marks
    if (!keyword || isLegal) score += 20; // first para exempted → full marks
  }

  // Flesch reading ease sub-score (0–20 pts)
  if (flesch >= 60) {
    score += 20;
  } else if (flesch >= 30) {
    score += 10;
  } else {
    score += 0;
  }

  return clamp(score);
}

// ─── 2. Meta Elements (20%) ──────────────────────────────────────────────────

function scoreMetaElements(
  $: cheerio.CheerioAPI,
  keyword: string,
  pageType: PageType,
): number {
  const isLegal = pageType === 'legal';
  let score = 0;

  // Title (0–40 pts)
  const titleText = $('title').first().text().trim();
  if (titleText) {
    const len = titleText.length;
    if (len >= 50 && len <= 60) {
      score += 25; // optimal length
    } else if (len > 0) {
      score += 15; // present but not optimal
    }
    // keyword in title (skip for legal)
    if (!isLegal && keyword && containsKeyword(titleText, keyword)) {
      score += 15;
    } else if (isLegal) {
      score += 15; // exempted → full
    }
  }

  // Meta description (0–40 pts)
  const descContent = $('meta[name="description"]').attr('content') ?? '';
  if (descContent) {
    const len = descContent.length;
    if (len >= 120 && len <= 157) {
      score += 40;
    } else if (len > 0) {
      score += 20;
    }
  }

  // Canonical (0–20 pts)
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    score += 20;
  }

  return clamp(score);
}

// ─── 3. Structure (15%) ──────────────────────────────────────────────────────

function scoreStructure(
  $: cheerio.CheerioAPI,
  bodyText: string,
  keyword: string,
  pageType: PageType,
): number {
  const isLegal = pageType === 'legal';
  let score = 0;

  // Single H1 (0–35 pts)
  const h1s = $('h1');
  const h1Count = h1s.length;
  if (h1Count === 1) {
    score += 20;
    // H1 contains keyword (skip for legal)
    const h1Text = h1s.first().text().trim();
    if (!isLegal && keyword && containsKeyword(h1Text, keyword)) {
      score += 15;
    } else if (isLegal) {
      score += 15; // exempted
    }
  } else if (h1Count > 1) {
    score += 0; // multiple H1s penalized
  }

  // Heading hierarchy (0–30 pts)
  // Check no skipped heading levels
  const headings = $('h1, h2, h3, h4, h5, h6').toArray();
  let hierarchyOk = true;
  let lastLevel = 0;
  for (const el of headings) {
    const tagName = ('name' in el ? (el as { name: string }).name : '') as string;
    const level = parseInt(tagName.replace('h', ''), 10);
    if (!isNaN(level) && lastLevel > 0 && level > lastLevel + 1) {
      hierarchyOk = false;
      break;
    }
    if (!isNaN(level)) lastLevel = level;
  }
  if (hierarchyOk) score += 30;

  // Subheadings every ≤300 words (0–35 pts)
  const words = wordCount(bodyText);
  if (words <= 300) {
    // Short page — no subheading requirement
    score += 35;
  } else {
    const h2s = $('h2, h3').length;
    const expectedSubheadings = Math.floor(words / 300);
    if (h2s >= expectedSubheadings) {
      score += 35;
    } else if (h2s > 0) {
      score += Math.round((h2s / expectedSubheadings) * 35);
    }
  }

  return clamp(score);
}

// ─── 4. Links (12%) ──────────────────────────────────────────────────────────

function scoreLinks(
  $: cheerio.CheerioAPI,
  pageType: PageType,
): number {
  let score = 0;

  const allLinks = $('a[href]');

  // Internal links: relative hrefs or same-domain paths
  let internalCount = 0;
  let amazonLinksWithoutSponsored = 0;
  let amazonLinkCount = 0;

  allLinks.each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const rel = $(el).attr('rel') ?? '';
    const isInternal =
      href.startsWith('/') ||
      href.startsWith('./') ||
      href.startsWith('../') ||
      (!href.startsWith('http') && !href.startsWith('//'));
    if (isInternal) internalCount++;

    // Affiliate link compliance for product pages
    if (href.includes('amazon.')) {
      amazonLinkCount++;
      if (!rel.includes('sponsored') && !rel.includes('nofollow')) {
        amazonLinksWithoutSponsored++;
      }
    }
  });

  // Internal links (0–70 pts)
  if (internalCount >= 3) {
    score += 70;
  } else if (internalCount >= 1) {
    score += 50;
  }

  // Affiliate link compliance (0–30 pts) — mainly for product pages
  if (pageType === 'product') {
    if (amazonLinkCount === 0) {
      score += 15; // no amazon links present — neutral
    } else if (amazonLinksWithoutSponsored === 0) {
      score += 30; // all amazon links properly attributed
    } else {
      score += 0; // missing rel="sponsored"
    }
  } else {
    score += 30; // not applicable, full marks
  }

  return clamp(score);
}

// ─── 5. Media (8%) ───────────────────────────────────────────────────────────

function scoreMedia(
  $: cheerio.CheerioAPI,
  keyword: string,
): number {
  let score = 0;

  const imgs = $('img');
  const imgCount = imgs.length;

  if (imgCount === 0) return 0;

  // At least 1 image (0–40 pts)
  score += 40;

  // All imgs have alt (0–30 pts)
  let withAlt = 0;
  let withKeywordAlt = false;

  imgs.each((_, el) => {
    const alt = $(el).attr('alt') ?? '';
    if (alt.trim()) {
      withAlt++;
      if (keyword && containsKeyword(alt, keyword)) {
        withKeywordAlt = true;
      }
    }
  });

  if (withAlt === imgCount) {
    score += 30;
  } else if (withAlt > 0) {
    score += Math.round((withAlt / imgCount) * 30);
  }

  // At least 1 alt contains keyword (0–30 pts)
  if (withKeywordAlt) {
    score += 30;
  } else if (!keyword) {
    score += 30; // no keyword provided — exempted
  }

  return clamp(score);
}

// ─── 6. Schema (8%) ──────────────────────────────────────────────────────────

const SCHEMA_TYPES: Record<PageType, string[]> = {
  product: ['product'],
  category: ['collectionpage', 'itemlist'],
  homepage: ['organization', 'website'],
  legal: ['webpage'],
};

function scoreSchema(
  $: cheerio.CheerioAPI,
  pageType: PageType,
): number {
  const scripts = $('script[type="application/ld+json"]');
  if (scripts.length === 0) return 0;

  let found = false;
  let typeMatches = false;

  scripts.each((_, el) => {
    try {
      const json = JSON.parse($(el).html() ?? '{}') as Record<string, unknown>;
      found = true;
      const rawType = (json['@type'] as string | undefined) ?? '';
      const schemaType = rawType.toLowerCase();
      const expected = SCHEMA_TYPES[pageType];
      if (expected.some((t) => schemaType.includes(t))) {
        typeMatches = true;
      }
    } catch {
      // malformed JSON — treat as missing
    }
  });

  if (!found) return 0;
  if (typeMatches) return 100;
  return 40; // JSON-LD present but wrong type
}

// ─── 7. Technical (5%) ───────────────────────────────────────────────────────

function scoreTechnical($: cheerio.CheerioAPI): number {
  let score = 0;

  // Viewport meta (0–60 pts)
  const viewport = $('meta[name="viewport"]').attr('content') ?? '';
  if (viewport.includes('width=device-width')) {
    score += 60;
  } else if (viewport) {
    score += 30;
  }

  // <html lang> attribute (0–40 pts)
  const lang = $('html').attr('lang') ?? '';
  if (lang.trim()) {
    score += 40;
  }

  return clamp(score);
}

// ─── 8. Social (2%) ──────────────────────────────────────────────────────────

function scoreSocial($: cheerio.CheerioAPI): number {
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogType = $('meta[property="og:type"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const ogUrl = $('meta[property="og:url"]').attr('content');

  const present = [ogTitle, ogType, ogImage, ogUrl].filter(Boolean).length;
  return clamp(present * 25);
}

// ─── suggestions ─────────────────────────────────────────────────────────────

function buildSuggestions(scores: {
  content_quality: number;
  meta_elements: number;
  structure: number;
  links: number;
  media: number;
  schema: number;
  technical: number;
  social: number;
}): string[] {
  const suggestions: string[] = [];

  if (scores.content_quality < 50) suggestions.push('Increase body content length and ensure keyword is used naturally throughout.');
  if (scores.meta_elements < 50) suggestions.push('Add or optimise the <title> tag (50–60 chars) and meta description (120–157 chars).');
  if (scores.structure < 50) suggestions.push('Add a single H1 containing the focus keyword and use subheadings every 300 words.');
  if (scores.links < 50) suggestions.push('Add at least one internal link to related pages.');
  if (scores.media < 50) suggestions.push('Add images with descriptive alt text containing the focus keyword.');
  if (scores.schema < 30) suggestions.push('Add JSON-LD structured data matching the page type (e.g. Product, CollectionPage).');
  if (scores.technical < 60) suggestions.push('Add a viewport meta tag and set the <html lang> attribute.');
  if (scores.social < 50) suggestions.push('Add Open Graph meta tags (og:title, og:type, og:image, og:url).');

  return suggestions;
}

// ─── grade ───────────────────────────────────────────────────────────────────

function toGrade(overall: number): SeoScore['grade'] {
  if (overall >= 90) return 'A';
  if (overall >= 70) return 'B';
  if (overall >= 50) return 'C';
  if (overall >= 30) return 'D';
  return 'F';
}

// ─── main export ─────────────────────────────────────────────────────────────

export function scorePage(
  html: string,
  focusKeyword: string,
  pageType: PageType,
): SeoScore {
  const $ = cheerio.load(html || '', { xmlMode: false });

  // Extract body text excluding nav/header/footer
  const bodyText = $('body')
    .clone()
    .find('nav, header, footer')
    .remove()
    .end()
    .text()
    .replace(/\s+/g, ' ')
    .trim();

  const words = wordCount(bodyText);

  // First paragraph text
  const firstParaText = $('p').first().text().trim();

  // Flesch reading ease — guard null/undefined
  let flesch = 60;
  try {
    const raw = readability.fleschReadingEase(bodyText);
    if (typeof raw === 'number' && !isNaN(raw)) {
      flesch = raw;
    }
  } catch {
    flesch = 60;
  }

  // Score all 8 categories
  const content_quality = scoreContentQuality(
    bodyText,
    firstParaText,
    words,
    focusKeyword,
    pageType,
    flesch,
  );

  const meta_elements = scoreMetaElements($, focusKeyword, pageType);
  const structure = scoreStructure($, bodyText, focusKeyword, pageType);
  const links = scoreLinks($, pageType);
  const media = scoreMedia($, focusKeyword);
  const schema = scoreSchema($, pageType);
  const technical = scoreTechnical($);
  const social = scoreSocial($);

  // Weighted overall
  const overall = clamp(
    content_quality * 0.30 +
    meta_elements * 0.20 +
    structure * 0.15 +
    links * 0.12 +
    media * 0.08 +
    schema * 0.08 +
    technical * 0.05 +
    social * 0.02,
  );

  const grade = toGrade(overall);

  const scores = { content_quality, meta_elements, structure, links, media, schema, technical, social };
  const suggestions = buildSuggestions(scores);

  return {
    overall,
    grade,
    ...scores,
    suggestions,
  };
}
