# SEO Scoring Research — On-Page Factors for Automated Scoring

Research compiled: 2026-03-13
Purpose: Define factors, thresholds, and weights for BuilderMonster's automated SEO scoring tool.

---

## 1. Core On-Page SEO Factors

### 1.1 Title Tag

**What it is:** The HTML `<title>` element displayed in SERPs and browser tabs. One of the strongest on-page ranking signals (14% of Google's algorithm per First Page Sage).

**Optimal values:**
- Length: 50-60 characters (max ~600px width)
- Primary keyword placed in the first 50% of the title
- Exact match of focus keyword at the beginning = best signal
- Each page must have a unique title
- Pixel width matters more than character count ("W"/"M" consume more than "i"/"l")

**Programmatic measurement:**
- Parse `<title>` tag from `<head>`
- Count characters and estimate pixel width (avg ~6px per character, or use a font metrics library)
- Check if focus keyword appears and its position
- Compare against other pages for uniqueness

**Scoring thresholds (Yoast model):**
| Condition | Score |
|---|---|
| Missing title | Red (1) |
| Title > 600px | Red (3) |
| Title 1-600px with keyword at beginning | Green (9) |
| Title 1-600px, keyword present but not at beginning | Orange (6) |
| Keyword missing from title | Red (2) |

**Weight: HIGH (Critical / prerequisite factor)**

Sources:
- [Search Engine Land — Title tag length 2025](https://searchengineland.com/title-tag-length-388468)
- [Zyppy — Meta title tag length data](https://zyppy.com/title-tags/meta-title-tag-length/)
- [SISTRIX — How long should a title tag be](https://www.sistrix.com/ask-sistrix/onpage-optimisation/title-element-title-tag/length)

---

### 1.2 Meta Description

**What it is:** The `<meta name="description">` tag. Not a direct ranking factor, but impacts CTR significantly. Google rewrites 60-70% of meta descriptions.

**Optimal values:**
- Length: 120-157 characters (desktop); 110-120 characters (mobile)
- Must include focus keyword (1-2 times, not more)
- Unique per page
- Compelling, action-oriented language

**Programmatic measurement:**
- Parse `<meta name="description">` from `<head>`
- Count characters
- Check focus keyword presence and frequency

**Scoring thresholds (Yoast model):**
| Condition | Score |
|---|---|
| Missing | Red (1) |
| < 120 characters | Orange (6) |
| > 157 characters | Orange (6) |
| 120-157 characters, keyword present 1-2x | Green (9) |
| Keyword appears > 2 times | Red (3) |
| Keyword absent | Red (3) |

**Weight: MEDIUM**

Sources:
- [Search Engine Land — Meta descriptions 2025](https://searchengineland.com/seo-meta-descriptions-everything-to-know-447910)
- [Yoast — Meta descriptions](https://yoast.com/meta-descriptions/)
- [Analytify — How to write meta descriptions 2026](https://analytify.io/how-to-write-meta-descriptions-for-seo-and-ctr/)

---

### 1.3 Heading Structure (H1-H6)

**What it is:** HTML heading elements that define content hierarchy. H1 = main topic; H2 = sections; H3 = subsections.

**Optimal values:**
- Exactly 1 `<h1>` per page
- H1 must contain focus keyword (naturally)
- Sequential hierarchy: H1 → H2 → H3 (no skipping levels)
- Focus keyword in 30-75% of H2/H3 subheadings
- Subheadings every 250-300 words maximum
- No keyword stuffing in headings

**Programmatic measurement:**
- Count all `<h1>` through `<h6>` tags
- Validate hierarchy (no H3 without parent H2, etc.)
- Check focus keyword presence in H1
- Calculate % of H2/H3 containing keyword or synonyms
- Measure word count between consecutive headings

**Scoring thresholds:**
| Condition | Score |
|---|---|
| No H1 | Red |
| Multiple H1 | Red (Yoast: 1) |
| H1 present, keyword included | Green |
| Heading hierarchy broken (skipped levels) | Orange |
| < 30% subheadings reflect topic | Red (Yoast: 3) |
| 30-75% subheadings reflect topic | Green (Yoast: 9) |
| > 75% subheadings reflect topic | Red (Yoast: 3) — over-optimization |
| > 300 words between subheadings | Orange; > 350 words = Red |

**Weight: MEDIUM-HIGH**

Sources:
- [Yoast — How to use headings](https://yoast.com/how-to-use-headings-on-your-site/)
- [Conductor — H1-H6 heading tags](https://www.conductor.com/academy/headings/)
- [SEO Sherpa — Header tags guide](https://seosherpa.com/header-tags/)

---

### 1.4 Keyword Density & Usage

**What it is:** Frequency of focus keyword relative to total word count. Modern SEO values natural usage over strict percentages.

**Optimal values:**
- Primary keyword density: 0.5-1.5% (safe range)
- Yoast green zone: 0.5-3% (for texts 100+ words)
- Keyword stuffing threshold: > 3% is risky; > 7% is penalizable
- Top-ranking pages average ~0.04% in competitive SERPs (research shows very low density + high quality wins)
- Keyword must appear in first paragraph/first 10% of content
- Keyword distribution should be even throughout text (not clustered)

**Programmatic measurement:**
- Tokenize text content (strip HTML)
- Count occurrences of exact keyword + partial matches
- Calculate density = (keyword count / total words) * 100
- Check first paragraph for keyword presence
- Measure distribution evenness (standard deviation of keyword positions)

**Scoring thresholds (Yoast model):**
| Condition | Score |
|---|---|
| Keyword absent from text | Red (-50) |
| Density < 0.5% (text 100+ words) | Red (4) |
| Density 0.5-3% | Green (9) |
| Density > 3% | Red (-10) |
| Keyword not in first paragraph | Red (3) |
| Keyword in first paragraph, same sentence | Green (9) |
| Distribution uneven (score > 0.5) | Red (1) |
| Distribution moderate (0.3-0.5) | Orange (6) |
| Distribution even (< 0.3) | Green (9) |

**Weight: MEDIUM**

Sources:
- [Content Hero — Best keyword density 2025](https://www.contenthero.co.uk/best-keyword-density-for-seo/)
- [Rankability — Keyword density research 2026](https://www.rankability.com/ranking-factors/google/keyword-density/)
- [Yoast — Keyphrase density](https://yoast.com/what-is-keyphrase-density-and-why-is-it-important/)

---

### 1.5 Content Length

**What it is:** Total word count of the page body content. Importance varies by page type.

**Optimal values by page type:**

| Page Type | Minimum | Optimal | Notes |
|---|---|---|---|
| Blog article | 1,000 | 1,500-2,500 | Long-form ranks better for informational queries |
| Category page | 100 | 200-400 | Most top-ranking categories have 200-400 words |
| Product page | 200 | 300-500 | Description + pros/cons + opinion |
| Homepage | 200 | 400-800 | Hero + category descriptions + SEO text |
| Legal page | 300 | 500-1,000 | Must be comprehensive for compliance |

**Programmatic measurement:**
- Strip HTML tags, count words in body content
- Exclude navigation, footer, sidebar (use `<main>` or content selectors)

**Scoring thresholds (Yoast model, general page):**
| Condition | Score |
|---|---|
| < 100 words | Red (-20) |
| 100-199 words | Red (-10) |
| 200-249 words | Red (3) |
| 250-299 words | Orange (6) |
| 300+ words | Green (9) |

**Rank Math content length scoring:**
| Word Count | Score % |
|---|---|
| 2500+ | 100% |
| 2000-2500 | 70% |
| 1500-2000 | 60% |
| 1000-1500 | 40% |
| 600-1000 | 20% |
| < 600 | 0% |

Note: For BuilderMonster, thresholds should be page-type-aware.

**Weight: MEDIUM-HIGH**

Sources:
- [Search Engine Land — Content length and SEO 2025](https://searchengineland.com/content-length-depth-and-seo-everything-you-need-to-know-in-2025-447197)
- [Digitaloft — Category page content length 2025](https://digitaloft.co.uk/category-page-content-length/)
- [seo.co — Content length ideal blog post 2026](https://seo.co/content-length/)

---

### 1.6 Internal Links

**What it is:** Links pointing to other pages within the same website. Distribute link equity, aid crawlability, and improve user navigation.

**Optimal values:**
- Minimum: 1 internal link per page (more is better)
- 2-5 contextual internal links per 1,000 words
- Total page links (internal + external): under 150
- Anchor text: descriptive, keyword-relevant, varied (not all exact-match)
- Links should be dofollow (nofollow on internal links = unusual)
- Every important page should be linked from at least one other page

**Programmatic measurement:**
- Parse all `<a>` tags
- Classify as internal (same domain) vs external
- Count internal links
- Extract anchor text
- Check for `rel="nofollow"` attribute
- (Cross-page analysis) Check if orphan pages exist

**Scoring thresholds (Yoast model):**
| Condition | Score |
|---|---|
| No internal links | Red (3) |
| All internal links nofollowed | Orange (7) |
| Followed internal links present | Green (9) |

**Weight: MEDIUM**

Sources:
- [Semrush — Internal links guide](https://www.semrush.com/blog/internal-links/)
- [Google — SEO link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Upward Engine — Internal linking 2026](https://upwardengine.com/internal-linking-best-practices-seo/)

---

### 1.7 External (Outbound) Links

**What it is:** Links pointing to other domains. Signal content quality and trustworthiness to search engines.

**Optimal values:**
- At least 1 outbound link to a relevant, authoritative source
- Affiliate links MUST use `rel="sponsored"` or `rel="nofollow"`
- Editorial/citation links should be dofollow
- Avoid excessive outbound links (dilutes focus)
- Use descriptive anchor text
- Open external links in new tab (`target="_blank"`)

**Programmatic measurement:**
- Parse all `<a>` tags, filter external (different domain)
- Count total external links
- Check `rel` attributes (nofollow, sponsored, ugc)
- Verify affiliate links have proper `rel` attributes

**Scoring thresholds (Yoast model):**
| Condition | Score |
|---|---|
| No outbound links | Red (3) |
| All outbound links nofollowed | Orange (7) |
| Mix of followed/nofollowed | Green (8) |
| All followed | Green (9) |
| Affiliate links without rel="sponsored" | Red (custom) |

**Weight: LOW-MEDIUM**

Sources:
- [Google — Qualify outbound links](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)
- [Post Affiliate Pro — Outbound links SEO](https://www.postaffiliatepro.com/faq/do-outbound-links-matter-for-seo/)
- [Rank Studio — Nofollow outbound links 2025](https://rankstudio.net/articles/en/nofollow-outbound-links-seo-2025)

---

### 1.8 Images

**What it is:** Image optimization includes alt text, file size, format, and loading strategy.

**Optimal values:**
- Every page should have at least 1 image
- Alt text: < 125 characters, descriptive, include keyword when relevant (30-75% of images for 5+ images)
- File size: < 200 KB per image
- Preferred formats: WebP, AVIF (AVIF ~50% smaller than JPEG)
- Lazy loading: `loading="lazy"` on below-fold images
- Descriptive filenames (not IMG_001.jpg)
- Width: 1280-1920px max

**Programmatic measurement:**
- Parse all `<img>` tags
- Check for `alt` attribute presence and content
- Check keyword presence in alt attributes
- Detect `loading="lazy"` attribute
- Check `src` file extension for format
- (Static analysis) Check image file sizes if accessible
- Count images per page

**Scoring thresholds:**
| Condition | Score |
|---|---|
| No images | Red (3) |
| Images without alt text | Orange |
| Alt text present but no keyword | Orange (6) |
| Alt text with keyword (appropriate %) | Green (9) |
| Images not using modern format (WebP/AVIF) | Orange (informational) |
| No lazy loading on below-fold images | Orange |
| At least 1 image present | Green (basic) |
| 4+ images present (Rank Math) | Green (full marks) |

**Weight: MEDIUM**

Sources:
- [Wellows — Image SEO 2025](https://wellows.com/blog/image-seo/)
- [Alttextify — Image SEO best practices 2025](https://alttextify.net/blog/the-ultimate-image-seo-best-practices-in-2025-with-tools-real-stats/)
- [Imagify — Image optimization SEO](https://imagify.io/blog/image-optimization-seo/)

---

### 1.9 URL Structure

**What it is:** The page URL/slug. Impacts both SEO and user experience.

**Optimal values:**
- Total URL length: < 60 characters (slug: 3-5 words, ~25-30 chars)
- Include 1-2 target keywords
- Lowercase only
- Hyphens to separate words (not underscores)
- Remove stop words (and, the, of, etc.)
- No numbers or dates (unless integral to content)
- Readable by humans

**Programmatic measurement:**
- Extract URL path/slug
- Count characters
- Check for keyword presence
- Validate format (lowercase, hyphens, no special chars)
- Check for stop words

**Scoring thresholds:**
| Condition | Score |
|---|---|
| URL > 75 characters (Rank Math threshold) | Red |
| URL 60-75 characters | Orange |
| URL < 60 characters | Green |
| Keyword in URL | Green (9) |
| Keyword partially in URL (> 50%) | Orange (6) |
| Keyword missing from URL | Red (3) |
| Contains uppercase, underscores, or special chars | Orange |

**Weight: LOW-MEDIUM**

Sources:
- [Briskon — SEO-friendly URL structure 2025](https://www.briskon.com/blog/best-practices-for-seo-friendly-url-structure/)
- [Backlinko — URL slug](https://backlinko.com/hub/seo/url-slug)
- [Yoast — What is a slug](https://yoast.com/slug/)

---

### 1.10 Schema Markup / Structured Data

**What it is:** JSON-LD structured data that helps search engines understand page content. Enables rich results (stars, prices, FAQs in SERPs). Rich results achieve 58% CTR vs 41% for standard results.

**Schema types relevant by page type:**

| Page Type | Required Schema | Optional Schema |
|---|---|---|
| Homepage | Organization, WebSite, BreadcrumbList | SiteNavigationElement |
| Category page | BreadcrumbList, CollectionPage, ItemList | |
| Product page | Product (review variant for affiliate), BreadcrumbList, Review | AggregateRating, Offer |
| Blog article | Article/BlogPosting, BreadcrumbList | FAQPage, HowTo |
| Legal page | BreadcrumbList, WebPage | |

**Important for affiliate sites:**
- Use Product Snippet markup (NOT Merchant Listing) on affiliate/review pages
- Merchant Listing on affiliate pages violates Google guidelines
- Product snippet = pages that discuss/review products without direct purchase

**Required Product properties:** name + (review OR aggregateRating OR offers)

**Programmatic measurement:**
- Parse `<script type="application/ld+json">` blocks
- Validate JSON-LD structure
- Check `@type` matches page type
- Verify required properties are present
- Validate against schema.org specification

**Scoring thresholds:**
| Condition | Score |
|---|---|
| No structured data | Red |
| Structured data present but wrong type for page | Orange |
| Correct type, missing required properties | Orange |
| Correct type with all required properties | Green |
| BreadcrumbList missing | Orange |

**Weight: MEDIUM** (no direct ranking impact, but significant CTR impact)

Sources:
- [SEO Clarity — Product schema for ecommerce](https://www.seoclarity.net/blog/product-schema-seo)
- [Google — Structured data for ecommerce](https://developers.google.com/search/docs/specialty/ecommerce/include-structured-data-relevant-to-ecommerce)
- [Google — Review snippet structured data](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)

---

### 1.11 Page Speed Indicators (Static Analysis)

**What it is:** Factors affecting page load speed that can be detected from static HTML analysis (without runtime measurement).

**Checkable statically:**
- Total HTML document size
- Number and size of CSS files linked
- Number and size of JS files linked
- Image count and estimated total size
- Whether CSS/JS appears minified
- Presence of `loading="lazy"` on images
- Inline vs external CSS/JS
- Number of external resource requests (fonts, scripts, etc.)
- Presence of `<link rel="preload">` for critical resources
- Presence of `async` or `defer` on script tags

**Optimal values:**
- Total page weight: < 1.5 MB (ideally < 500 KB for static sites)
- CSS files: minimize number, minified
- JS files: minimize number, minified, async/defer
- Images: WebP/AVIF, < 200 KB each, lazy loaded
- Fonts: preloaded, limited to 2-3 font files

**Scoring thresholds (custom for static analysis):**
| Condition | Score |
|---|---|
| Page weight > 3 MB | Red |
| Page weight 1.5-3 MB | Orange |
| Page weight < 1.5 MB | Green |
| No async/defer on JS | Orange |
| Unminified CSS/JS detected | Orange |
| No lazy loading on images | Orange |
| Critical resources preloaded | Green |

**Weight: MEDIUM** (Page speed = 3% of Google algorithm per First Page Sage, but a prerequisite factor)

Sources:
- [Google — Minify resources](https://developers.google.com/speed/docs/insights/MinifyResources)
- [BrightEdge — Minification and SEO](https://www.brightedge.com/blog/minification-and-seo-complete-guide)
- [Elegant Themes — Improve page load speed 2025](https://www.elegantthemes.com/blog/marketing/how-to-improve-website-speed)

---

### 1.12 Mobile-Friendliness Indicators

**What it is:** Signals that a page is optimized for mobile devices. Google uses mobile-first indexing.

**Checkable statically:**
- Viewport meta tag present: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- No `user-scalable=no` (accessibility issue)
- No fixed-width CSS declarations (check for `width: XXXpx` on body/container)
- Responsive images (`srcset`, `<picture>`, max-width CSS)
- Touch-friendly tap targets (minimum 48x48px — hard to check statically)
- Font size > 16px base (check inline styles)

**Scoring thresholds:**
| Condition | Score |
|---|---|
| Missing viewport meta tag | Red |
| Viewport present but misconfigured | Orange |
| Viewport correctly configured | Green |
| Fixed-width containers detected | Orange |
| user-scalable=no present | Orange |

**Weight: HIGH** (Mobile-friendliness = 5% of Google algorithm, prerequisite factor)

Sources:
- [WooRank — Mobile viewport for SEO](https://www.woorank.com/en/edu/seo-guides/how-to-use-the-mobile-viewport-for-seo)
- [ClickRank — Viewport meta tag 2025](https://www.clickrank.ai/seo-academy/technical-seo/viewport-meta-tag/)
- [MDN — Viewport meta tag](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport)

---

### 1.13 Content Readability

**What it is:** How easy the content is to read and understand. Affects user engagement (dwell time, bounce rate) which impacts rankings.

**Metrics:**
- **Flesch Reading Ease**: 0-100 scale. Target: 60-70+ (8th grade level). Score of 70+ = readable by 80% of adults
- **Sentence length**: < 25% of sentences should exceed 20 words
- **Paragraph length**: < 150 words per paragraph (Yoast green)
- **Passive voice**: < 10% of sentences (Yoast green)
- **Transition words**: > 30% of sentences should contain them
- **Subheading distribution**: every 250-300 words max
- **Consecutive sentences**: < 3 starting with same word

**Programmatic measurement:**
- Libraries: `text-readability` (npm), `flesch-kincaid` (npm), `flesch` (npm)
- Parse text, calculate syllables/words/sentences
- Count passive constructions
- Measure paragraph lengths
- Detect transition word usage

**Scoring thresholds (Yoast readability model):**

| Check | Red (3) | Orange (6) | Green (9) |
|---|---|---|---|
| Sentence length | > 30% over 20 words | 25-30% | < 25% |
| Paragraph length | > 200 words | 150-200 words | < 150 words |
| Passive voice | > 15% | 10-15% | < 10% |
| Transition words | < 20% | 20-30% | > 30% |
| Subheading dist. | > 350 words between | 300-350 words | < 300 words |
| Consecutive sentences | 3+ same start | — | < 3 same start |
| Flesch Reading Ease | < 30 | 30-60 | > 60 |

**Weight: MEDIUM**

Sources:
- [Yoast — Flesch reading ease score](https://yoast.com/flesch-reading-ease-score/)
- [Page Traffic — Flesch Kincaid grade level for SEO](https://www.pagetraffic.com/blog/flesch-kincaid-grade-level-seo/)
- [Yoast — Readability analysis](https://yoast.com/yoast-seo-readability-analysis/)

---

### 1.14 Canonical Tags & Robots Directives

**What it is:** Technical SEO elements that control indexing behavior and prevent duplicate content.

**Requirements:**
- Every indexable page should have a `<link rel="canonical" href="...">` pointing to itself
- Canonical URL must be absolute (not relative)
- `<meta name="robots" content="index, follow">` or omitted (default is index, follow)
- Legal pages may use `noindex, follow` to save crawl budget
- Never combine `noindex` with `canonical` to another page (contradictory signals)
- Must be in `<head>`, not `<body>`

**Programmatic measurement:**
- Parse `<link rel="canonical">` — check presence and validity
- Parse `<meta name="robots">` — check directives
- Verify canonical URL matches current page URL
- Check for conflicting directives

**Scoring thresholds:**
| Condition | Score |
|---|---|
| No canonical tag (on indexable pages) | Orange |
| Canonical pointing to different page (unexpected) | Red |
| Self-referencing canonical present | Green |
| noindex + canonical to another page | Red |
| Canonical URL is relative, not absolute | Orange |
| robots meta correctly configured | Green |

**Weight: LOW-MEDIUM**

Sources:
- [Google — Robots meta tag specifications](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [OnCrawl — Robots.txt, meta robots, canonical](https://www.oncrawl.com/technical-seo/use-robots-txt-meta-robots-canonical-tags-correctly/)
- [Google — Block search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

---

### 1.15 Open Graph / Social Meta Tags

**What it is:** Meta tags controlling appearance when shared on social platforms. Not a direct ranking factor, but impacts social CTR and traffic.

**Required OG tags:**
- `og:title` (55-60 characters)
- `og:type` (website, article, product)
- `og:image` (1200x630px recommended)
- `og:url` (canonical URL)

**Recommended OG tags:**
- `og:description` (< 200 characters)
- `og:site_name`
- `og:locale`
- `og:image:alt`

**Twitter Card tags:**
- `twitter:card` (summary_large_image)
- `twitter:title`
- `twitter:description`
- `twitter:image`

**Programmatic measurement:**
- Parse all `<meta property="og:*">` and `<meta name="twitter:*">` tags
- Validate required properties exist
- Check og:image dimensions (if accessible)
- Validate og:url matches canonical

**Scoring thresholds:**
| Condition | Score |
|---|---|
| No OG tags at all | Red |
| Missing required OG tags (title, type, image, url) | Orange |
| All required OG tags present | Green |
| Missing Twitter Card | Orange (minor) |
| og:url doesn't match canonical | Orange |

**Weight: LOW** (no direct SEO impact, but affects social sharing and traffic)

Sources:
- [Open Graph Protocol](https://ogp.me/)
- [Semrush — Open Graph tags](https://www.semrush.com/blog/open-graph/)
- [Rank Math — Open Graph meta tags](https://rankmath.com/kb/open-graph-meta-tags/)

---

## 2. Page-Type Specific Criteria

### 2.1 Homepage (Affiliate / E-commerce)

| Factor | Specification |
|---|---|
| Content length | 400-800 words |
| H1 | Site name or main value proposition with primary niche keyword |
| Keyword strategy | Brand + niche keyword (e.g., "Best Kitchen Gadgets") |
| Internal links | Links to ALL main categories (critical) |
| External links | Optional (trust signals, brand mentions) |
| Images | Hero image + category thumbnails |
| Schema | Organization, WebSite (with SearchAction), BreadcrumbList |
| Unique factors | Category grid, featured products, trust signals, clear CTA |
| Meta description | Brand + niche + value prop |
| Content structure | Hero → Categories → Featured → SEO text → Trust badges |

### 2.2 Category / Collection Page

| Factor | Specification |
|---|---|
| Content length | 200-400 words SEO text (above or below product grid) |
| H1 | Category name with target keyword (e.g., "Best Air Fryers 2025") |
| Keyword strategy | Category keyword + modifiers ("best", "top", year) |
| Internal links | Links to all products in category + related categories + homepage |
| External links | Not critical; informational links optional |
| Images | Product thumbnails (alt text with product name + category keyword) |
| Schema | BreadcrumbList, CollectionPage, ItemList (with ListItem for each product) |
| Unique factors | Product grid, price display, Prime badge, comparison potential |
| Meta description | "Best [category] [year]. Compare [N] products with prices and reviews." |

### 2.3 Product Page (Affiliate)

| Factor | Specification |
|---|---|
| Content length | 300-500 words (description + pros/cons + opinion) |
| H1 | Product name (exact match, no keyword stuffing) |
| Keyword strategy | Product name + category + "review" / "analysis" |
| Internal links | Back to category, related products, homepage |
| External links | Amazon affiliate link (rel="sponsored"), Amazon reviews link |
| Images | Large product image + gallery. Alt text = product name |
| Schema | Product (snippet variant, NOT merchant listing), Review, BreadcrumbList |
| Unique factors | Affiliate CTA button, price, Prime badge, pros/cons list, AI-generated opinion |
| Meta description | Product name + key benefit + price range + CTA |
| Affiliate compliance | Amazon disclaimer visible, rel="sponsored" on affiliate links |

### 2.4 Blog Article (Informational)

| Factor | Specification |
|---|---|
| Content length | 1,500-2,500 words |
| H1 | Target keyword phrase (question or topic) |
| Keyword strategy | Long-tail keyword + related LSI terms |
| Internal links | 5-10+ links to products, categories, related articles |
| External links | 2-5 authoritative citation links (dofollow) |
| Images | 4+ images, charts, or infographics. Alt text keyword-rich |
| Schema | Article/BlogPosting, BreadcrumbList, FAQPage (if Q&A sections exist) |
| Unique factors | Table of contents, FAQ section, clear sections with H2/H3 |
| Meta description | Answer the search query + compelling reason to click |
| Readability | Flesch score > 60, short paragraphs, transition words |

### 2.5 Legal Pages (Privacy, Terms, Contact)

| Factor | Specification |
|---|---|
| Content length | 500-1,000+ words (privacy/terms); 200-400 (contact) |
| H1 | "Privacy Policy" / "Legal Notice" / "Contact" |
| Keyword strategy | N/A (not targeting keywords) |
| Internal links | Link to homepage, other legal pages |
| External links | Links to regulatory bodies, Amazon Associates program |
| Images | Not critical |
| Schema | WebPage, BreadcrumbList |
| Unique factors | Must be comprehensive for legal compliance |
| Robots | Can use noindex (save crawl budget) but not required |
| Canonical | Self-referencing |

---

## 3. SEO Scoring Models

### 3.1 How Major Tools Score Pages

#### Yoast SEO (Open Source — Most Transparent)
- **Scale:** Traffic light (Red/Orange/Green per check) → Overall bullet
- **Individual scores:** Red = 1-3, Orange = 6, Green = 8-9
- **Overall formula:** `(sum of scores) / (count * 9) * 100`
- **Checks:** ~15 SEO checks + ~8 readability checks
- **Keyphrase-centric:** Most checks require a focus keyphrase
- **Source code available:** [GitHub — Yoast wordpress-seo](https://github.com/Yoast/wordpress-seo/tree/trunk/packages/yoastseo/src/scoring)

#### Rank Math
- **Scale:** 0-100 numeric score
- **Color coding:** Green (> 80), Orange (50-80), Red (< 50)
- **Categories:** Basic SEO, Additional SEO, Title Readability, Content Readability
- **Checks:** 24+ checks including sentiment, power words, number in title
- **Content length emphasis:** Full marks only at 2500+ words

#### Surfer SEO
- **Scale:** 0-100 Content Score
- **Methodology:** Competitor-based (analyzes top 10 SERP results for target keyword)
- **Factors:** 500+ signals — keyword usage, NLP terms, True Density, heading structure, content length
- **Interpretation:** < 33 = poor, 33-66 = decent, > 66 = good
- **Unique:** Uses TF-IDF analysis, topic modeling, entity evaluation

#### Clearscope / MarketMuse / Frase
- **Focus:** Topical coverage and semantic completeness
- **Compare content against:** What top-ranking pages cover
- **Grade systems:** A++ to F (Clearscope), 0-100 (MarketMuse)

### 3.2 Recommended Scoring Scale

**For BuilderMonster: 0-100 numeric score with color bands**

| Range | Label | Color | Meaning |
|---|---|---|---|
| 90-100 | Excellent | Green | Fully optimized, ready to rank |
| 70-89 | Good | Light Green | Well optimized, minor improvements possible |
| 50-69 | Needs Work | Orange | Missing significant optimization opportunities |
| 30-49 | Poor | Red/Orange | Major issues that will hurt ranking |
| 0-29 | Critical | Red | Fundamental SEO problems |

This aligns with industry convention (Rank Math 80+ = green, Yoast overall green/orange/red).

### 3.3 Proposed Weight Distribution

Based on research across all tools and Google's confirmed factors:

| Category | Weight | Factors Included |
|---|---|---|
| **Content Quality** | 30% | Content length (by page type), keyword density, keyword in first paragraph, keyword distribution, readability score |
| **Meta Elements** | 20% | Title tag (length + keyword), meta description (length + keyword), canonical tag, robots directives |
| **Structure** | 15% | H1 (single, with keyword), heading hierarchy, subheading distribution, URL structure |
| **Links** | 12% | Internal links (count + dofollow), external links (count + rel attributes), affiliate link compliance |
| **Media** | 8% | Image count, alt text (presence + keyword), image format, lazy loading |
| **Schema / Structured Data** | 8% | Correct schema type for page, required properties present, BreadcrumbList |
| **Technical** | 5% | Viewport meta, page weight estimation, OG tags, CSS/JS optimization signals |
| **Social** | 2% | OG required tags, Twitter Card |

**Total: 100%**

### 3.4 Minimum Viable Factor Set (80/20 Rule)

These factors capture ~80% of on-page SEO quality with minimal implementation complexity:

1. **Title tag** — present, correct length, contains keyword
2. **Meta description** — present, correct length, contains keyword
3. **H1** — exactly one, contains keyword
4. **Content length** — meets minimum for page type
5. **Keyword in first paragraph** — present
6. **Keyword density** — 0.5-3% range
7. **Internal links** — at least 1 present
8. **Images with alt text** — at least 1 image with descriptive alt
9. **URL structure** — keyword present, reasonable length
10. **Canonical tag** — self-referencing present
11. **Viewport meta tag** — correctly configured
12. **Schema markup** — appropriate type present

These 12 factors cover the fundamentals. Everything else is incremental improvement.

---

## 4. Programmatic Implementation

### 4.1 What Can Be Computed from Static HTML

**Fully measurable from HTML string:**

| Factor | Method |
|---|---|
| Title tag (presence, length, keyword) | Parse `<title>` |
| Meta description (presence, length, keyword) | Parse `<meta name="description">` |
| Heading structure (H1-H6 count, hierarchy, keywords) | Parse all `<hN>` tags |
| Content length (word count) | Strip tags, count words |
| Keyword density | Tokenize + count |
| Keyword in first paragraph | Find first `<p>`, check content |
| Internal/external links | Parse `<a>` tags, classify by domain |
| Link attributes (nofollow, sponsored) | Check `rel` attribute |
| Anchor text analysis | Extract text content of `<a>` tags |
| Image count, alt text, format, lazy loading | Parse `<img>` tags |
| URL structure | Analyze page URL string |
| Schema / structured data | Parse `<script type="application/ld+json">` |
| Canonical tag | Parse `<link rel="canonical">` |
| Robots meta | Parse `<meta name="robots">` |
| Viewport meta | Parse `<meta name="viewport">` |
| OG / Twitter tags | Parse `<meta property="og:*">` and `<meta name="twitter:*">` |
| CSS/JS file count | Count `<link rel="stylesheet">` and `<script>` |
| Inline styles detection | Check for `<style>` blocks and `style=` attributes |
| Page HTML size | Byte length of document |
| Readability (Flesch, sentence length, etc.) | Text analysis libraries |
| Paragraph length | Parse `<p>` tags, count words |
| Passive voice detection | NLP analysis |
| Transition words | Pattern matching |

### 4.2 What Requires External Data

| Factor | External Dependency |
|---|---|
| Search volume for keyword | Keyword research API |
| Competitor content analysis | SERP API + crawler |
| Backlink count/quality | Ahrefs/Moz/Majestic API |
| Core Web Vitals (LCP, INP, CLS) | Lighthouse / PageSpeed Insights API |
| Actual page load time | HTTP request timing |
| Image file sizes (from URL) | HTTP HEAD requests |
| Search ranking position | SERP tracking |
| Click-through rate | Google Search Console API |
| Domain authority | Third-party APIs |

**For BuilderMonster Phase 1:** Focus exclusively on static HTML analysis. No external APIs needed.

### 4.3 Recommended Libraries (Node.js / TypeScript)

| Purpose | Library | npm |
|---|---|---|
| HTML parsing | cheerio | `cheerio` |
| Readability scoring | text-readability | `text-readability` |
| Flesch-Kincaid specific | flesch-kincaid | `flesch-kincaid` |
| Flesch reading ease | flesch | `flesch` |
| TypeScript readability | text-readability-ts | `text-readability-ts` |
| JSON-LD validation | jsonld | `jsonld` |
| Word counting | word-count | `word-count` |
| Syllable counting | syllable | `syllable` |
| Natural language | compromise | `compromise` |
| URL parsing | Built-in URL class | — |

### 4.4 Architecture Suggestion

```
packages/seo-scorer/
  src/
    index.ts              — Main scoring orchestrator
    types.ts              — SeoScore, FactorScore, PageType, ScoringConfig
    parser.ts             — HTML parsing with cheerio (extract all elements)
    factors/
      title.ts            — Title tag analysis
      meta-description.ts — Meta description analysis
      headings.ts         — H1-H6 structure analysis
      content.ts          — Content length, keyword density, distribution
      links.ts            — Internal + external link analysis
      images.ts           — Image optimization analysis
      url.ts              — URL structure analysis
      schema.ts           — Structured data validation
      technical.ts        — Viewport, canonical, robots, OG tags
      readability.ts      — Flesch score, sentence/paragraph length
    configs/
      weights.ts          — Weight configuration per factor
      thresholds.ts       — Page-type-specific thresholds
    scorer.ts             — Weighted score aggregation
```

**API surface:**

```typescript
interface SeoScorerInput {
  html: string;
  url: string;
  focusKeyword: string;
  pageType: 'homepage' | 'category' | 'product' | 'article' | 'legal';
  synonyms?: string[];
}

interface SeoScore {
  overall: number;           // 0-100
  grade: 'excellent' | 'good' | 'needs_work' | 'poor' | 'critical';
  categories: {
    contentQuality: CategoryScore;
    metaElements: CategoryScore;
    structure: CategoryScore;
    links: CategoryScore;
    media: CategoryScore;
    schema: CategoryScore;
    technical: CategoryScore;
    social: CategoryScore;
  };
  factors: FactorScore[];    // Individual factor results
  suggestions: Suggestion[]; // Actionable improvement tips
}

interface FactorScore {
  name: string;
  score: number;             // 0-9 (Yoast-compatible)
  status: 'green' | 'orange' | 'red';
  weight: number;
  message: string;
  details?: Record<string, unknown>;
}
```

---

## 5. Reference: Complete Yoast Scoring Algorithm

### SEO Score Formula
```
overallScore = (sum of all factor scores) / (number of factors * 9) * 100
```

Where each factor scores: Red = 1-3, Orange = 6, Green = 8-9.

### All Yoast SEO Checks (with exact thresholds)

| # | Check | Green (9) | Orange (6) | Red (1-3) |
|---|---|---|---|---|
| 1 | Keyphrase in introduction | All words in one sentence, first paragraph | Words present but not in same sentence | Missing from first paragraph |
| 2 | Keyphrase length | 1-4 content words | 5-8 words | > 8 words |
| 3 | Keyphrase density | 0.5-3% (100+ words) | — | < 0.5% or > 3% |
| 4 | Keyphrase in meta description | 1-2 sentence matches | — | 0 matches or > 2 |
| 5 | Keyphrase in subheadings | 30-75% of H2/H3 | — | < 30% or > 75% |
| 6 | Competing links | No internal links with keyphrase anchor | — | Link uses keyphrase as anchor |
| 7 | Keyphrase in image alt | 30-75% of images (5+) or >= 1 | No alt with keyphrase | No images |
| 8 | Keyphrase in SEO title | Exact match at beginning | Present but not at start | Missing |
| 9 | Keyphrase in slug | All words present | > 50% words present | Missing |
| 10 | Previously used keyphrase | Unique | Used once before | Used multiple times |
| 11 | Text length | 300+ words | 250-299 | < 250 |
| 12 | Outbound links | Followed links present | All nofollowed | None |
| 13 | Internal links | Followed links present | All nofollowed | None |
| 14 | SEO title width | 1-600px | — | Missing or > 600px |
| 15 | Meta description length | 120-157 chars | < 120 or > 157 chars | Missing |
| 16 | Single H1 | One H1 | — | Multiple H1s |
| 17 | Images | At least 1 image | — | No images |

### All Yoast Readability Checks (with exact thresholds)

| # | Check | Green (9) | Orange (6) | Red (3) |
|---|---|---|---|---|
| 1 | Subheading distribution | All sections < 300 words | Section 300-350 words | Section > 350 words or none in 300+ word text |
| 2 | Paragraph length | All < 150 words | Has 150-200 word paragraph | Has > 200 word paragraph |
| 3 | Sentence length | < 25% over 20 words | 25-30% over 20 words | > 30% over 20 words |
| 4 | Consecutive sentences | < 3 same start | — | 3+ same start |
| 5 | Passive voice | < 10% | 10-15% | > 15% |
| 6 | Transition words | > 30% sentences | 20-30% | < 20% |
| 7 | Text presence | 50+ characters | — | < 50 characters |
| 8 | Word complexity (Premium) | < 10% complex | > 10% complex | — |

---

## 6. Key Takeaways for BuilderMonster Implementation

1. **Page-type awareness is critical.** A 300-word category page is well-optimized; a 300-word blog article is not. Thresholds must vary by type.

2. **Keyword-centric scoring.** Every major SEO tool centers scoring around a focus keyword. BuilderMonster already has this data (category keywords, product names).

3. **Start with the 12 MVP factors** (Section 3.4). They cover the essentials and can be computed purely from HTML.

4. **Use Yoast's open-source scoring model as the baseline.** It's transparent, battle-tested, and the thresholds are documented in their source code.

5. **Differentiate affiliate-specific requirements:** rel="sponsored" on Amazon links, proper Product Snippet schema (not Merchant Listing), Amazon disclaimer presence.

6. **All computation is static HTML analysis.** No crawling, no external APIs, no runtime measurement needed for Phase 1.

7. **Readability matters for affiliate sites.** Target audience is consumers, not experts. Flesch score > 60 is the floor.

8. **Schema markup has outsized CTR impact** (58% vs 41% CTR for rich results) despite not being a direct ranking factor.
