/**
 * AmazonScraper — Node.js port of tsa-monster's AmazonScraperService.php
 *
 * Scrapes Amazon search results using fetch + cheerio HTML parsing.
 * Rotates User-Agent strings and sends human-like headers.
 * Used for PRODUCT SEARCH only — ASIN lookup still uses DataForSEO.
 *
 * D129: Uses cheerio (no Puppeteer/Playwright). Rotate UAs on each request.
 * Rate limiting: callers are responsible for delays between requests.
 */
import * as cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapedProduct {
  asin: string;
  title: string;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  isPrime: boolean;
}

export class AmazonBlockedError extends Error {
  constructor(market: string) {
    super(
      `Amazon is blocking scraper requests for market "${market}". ` +
        'This typically resolves after a few minutes. Try again later.',
    );
    this.name = 'AmazonBlockedError';
  }
}

// ---------------------------------------------------------------------------
// Market configuration
// ---------------------------------------------------------------------------

const MARKET_DOMAINS: Record<string, string> = {
  ES: 'amazon.es',
  US: 'amazon.com',
  UK: 'amazon.co.uk',
  DE: 'amazon.de',
  FR: 'amazon.fr',
  IT: 'amazon.it',
  CA: 'amazon.ca',
  AU: 'amazon.com.au',
  JP: 'amazon.co.jp',
  BR: 'amazon.com.br',
};

const MARKET_LANGUAGE: Record<string, string> = {
  ES: 'es-ES,es;q=0.9,en;q=0.8',
  US: 'en-US,en;q=0.9',
  UK: 'en-GB,en;q=0.9',
  DE: 'de-DE,de;q=0.9,en;q=0.8',
  FR: 'fr-FR,fr;q=0.9,en;q=0.8',
  IT: 'it-IT,it;q=0.9,en;q=0.8',
  CA: 'en-CA,en;q=0.9',
  AU: 'en-AU,en;q=0.9',
  JP: 'ja-JP,ja;q=0.9,en;q=0.8',
  BR: 'pt-BR,pt;q=0.9,en;q=0.8',
};

// ---------------------------------------------------------------------------
// User agents (ported from PHP AmazonScraperService)
// ---------------------------------------------------------------------------

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ---------------------------------------------------------------------------
// Price parsing (handles ES decimal comma and EN decimal dot)
// ---------------------------------------------------------------------------

function parsePrice(raw: string): number | null {
  // Strip currency symbols and whitespace
  const cleaned = raw.replace(/[^\d,.\s]/g, '').trim();
  if (!cleaned) return null;

  // European format: 1.299,99 or 29,99
  const euroMatch = cleaned.match(/^(\d{1,3}(?:\.\d{3})*),(\d{2})$/);
  if (euroMatch) {
    const int = euroMatch[1].replace(/\./g, '');
    return parseFloat(`${int}.${euroMatch[2]}`);
  }

  // US format: 1,299.99 or 29.99
  const usMatch = cleaned.match(/^(\d{1,3}(?:,\d{3})*)\.(\d{2})$/);
  if (usMatch) {
    const int = usMatch[1].replace(/,/g, '');
    return parseFloat(`${int}.${usMatch[2]}`);
  }

  // Fallback: strip separators, treat last comma/dot as decimal
  const fallback = parseFloat(cleaned.replace(/[^0-9.]/g, '').replace(',', '.'));
  return isNaN(fallback) ? null : fallback;
}

// ---------------------------------------------------------------------------
// Block detection
// ---------------------------------------------------------------------------

const BLOCK_INDICATORS = [
  'Enter the characters you see below',
  "Sorry, we just need to make sure you're not a robot",
  'Robot Check',
  'api-services-support@amazon.com',
  'captcha',
  'CAPTCHA',
  'automated access',
];

function isBlocked(html: string): boolean {
  return BLOCK_INDICATORS.some((indicator) => html.includes(indicator));
}

// ---------------------------------------------------------------------------
// Image resolution upgrade
// ---------------------------------------------------------------------------

function upgradeImageResolution(url: string): string {
  // Upgrade small Amazon image sizes to 400px
  return url
    .replace(/_AC_UL\d+_/g, '_AC_UL400_')
    .replace(/_AC_SX\d+_/g, '_AC_SX400_')
    .replace(/_SL\d+_/g, '_SL400_')
    .replace(/_SS\d+_/g, '_SS400_');
}

// ---------------------------------------------------------------------------
// AmazonScraper
// ---------------------------------------------------------------------------

export class AmazonScraper {
  private readonly maxResults = 20;
  private readonly timeoutMs = 15_000;

  /**
   * Search Amazon for products matching the keyword in the given market.
   * Throws AmazonBlockedError if Amazon returns a CAPTCHA or robot-check page.
   */
  async search(
    keyword: string,
    market = 'ES',
    page = 1,
  ): Promise<ScrapedProduct[]> {
    const domain = MARKET_DOMAINS[market.toUpperCase()] ?? MARKET_DOMAINS['ES'];
    const lang = MARKET_LANGUAGE[market.toUpperCase()] ?? MARKET_LANGUAGE['ES'];
    const baseUrl = `https://www.${domain}`;

    const params = new URLSearchParams({
      k: keyword,
      ref: 'nb_sb_noss',
    });
    if (page > 1) params.set('page', String(page));

    const url = `${baseUrl}/s?${params.toString()}`;
    const ua = getRandomUA();

    console.log(`[AmazonScraper] search market=${market} keyword="${keyword}" page=${page}`);

    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': lang,
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          Referer: baseUrl,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      html = await res.text();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`[AmazonScraper] fetch failed for "${keyword}": ${msg}`);
    }

    if (isBlocked(html)) {
      console.warn(`[AmazonScraper] blocked by Amazon market=${market} keyword="${keyword}"`);
      throw new AmazonBlockedError(market);
    }

    const products = this.parseSearchResults(html, baseUrl);
    console.log(`[AmazonScraper] parsed ${products.length} products for "${keyword}"`);
    return products;
  }

  // -------------------------------------------------------------------------
  // Private: HTML parsing
  // -------------------------------------------------------------------------

  private parseSearchResults(html: string, baseUrl: string): ScrapedProduct[] {
    const $ = cheerio.load(html);
    const products: ScrapedProduct[] = [];
    const seen = new Set<string>();

    // Primary selector matching PHP scraper
    const items = $('[data-component-type="s-search-result"][data-asin]');

    items.each((_i, el) => {
      try {
        const asin = $(el).attr('data-asin') ?? '';
        if (!asin || asin.length !== 10 || seen.has(asin)) return;
        seen.add(asin);

        // Title
        const titleEl =
          $(el).find('h2 a span').first() ||
          $(el).find('h2 span').first() ||
          $(el).find('[data-cy="title-recipe"] span').first();
        const title = $(el).find('h2 a span').first().text().trim() ||
          $(el).find('h2 span').first().text().trim() ||
          $(el).find('[data-cy="title-recipe"] span').first().text().trim();

        if (!title) return;

        // Price — try multiple selectors
        let price: number | null = null;
        const priceText =
          $(el).find('.a-price .a-offscreen').first().text().trim() ||
          $(el).find('[data-cy="price-recipe"] .a-offscreen').first().text().trim() ||
          '';
        if (priceText) price = parsePrice(priceText);

        // Image
        let imageUrl: string | null =
          $(el).find('.s-image').attr('src') ?? null;
        if (imageUrl) imageUrl = upgradeImageResolution(imageUrl);

        // Rating
        let rating: number | null = null;
        const ratingText =
          $(el).find('.a-icon-alt').first().text().trim() ||
          $(el).find('[aria-label*="estrellas"]').first().attr('aria-label') ||
          $(el).find('[aria-label*="stars"]').first().attr('aria-label') ||
          '';
        const ratingMatch = ratingText.match(/(\d+[,.]?\d*)/);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1].replace(',', '.'));
        }

        // Review count
        let reviewCount: number | null = null;
        const reviewEl = $(el).find('a[href*="customerReviews"] span.a-size-base').first();
        const reviewText = reviewEl.text().replace(/[.,]/g, '').trim();
        if (reviewText) {
          const reviewMatch = reviewText.match(/(\d+)/);
          if (reviewMatch) reviewCount = parseInt(reviewMatch[1], 10);
        }

        // Prime
        const isPrime =
          $(el).find('.a-icon-prime').length > 0 ||
          $(el).find('[aria-label*="Prime"]').length > 0 ||
          $(el).find('[class*="prime"]').length > 0 ||
          html.includes(`data-asin="${asin}"`) && $(el).text().includes('Prime');

        products.push({ asin, title, price, rating, reviewCount, imageUrl, isPrime });

        if (products.length >= this.maxResults) return false; // cheerio each exit
      } catch (e) {
        // Skip malformed items silently
        const msg = e instanceof Error ? e.message : String(e);
        console.debug(`[AmazonScraper] parse error for item: ${msg}`);
      }
    });

    // Fallback: try broader selector if primary yielded nothing
    if (products.length === 0) {
      $('[data-asin]:not([data-asin=""])').each((_i, el) => {
        try {
          const asin = $(el).attr('data-asin') ?? '';
          if (!asin || asin.length !== 10 || seen.has(asin)) return;
          seen.add(asin);

          const title =
            $(el).find('h2 a span').first().text().trim() ||
            $(el).find('h2 span').first().text().trim();
          if (!title) return;

          const priceText = $(el).find('.a-price .a-offscreen').first().text().trim();
          const price = priceText ? parsePrice(priceText) : null;
          const imageUrl = $(el).find('img').first().attr('src') ?? null;

          products.push({
            asin,
            title,
            price,
            rating: null,
            reviewCount: null,
            imageUrl: imageUrl ? upgradeImageResolution(imageUrl) : null,
            isPrime: $(el).find('.a-icon-prime').length > 0,
          });

          if (products.length >= this.maxResults) return false;
        } catch {
          // skip
        }
      });
    }

    return products;
  }
}
