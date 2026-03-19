import { query } from '@anthropic-ai/claude-agent-sdk';
import { Worker } from 'bullmq';
import { createServiceClient } from '@monster/db';
import { createRedisConnection } from '../queue.js';
import { scoreMarkdown } from '../seo-scorer-wrapper.js';

// ---------------------------------------------------------------------------
// SeoContentPayload
// ---------------------------------------------------------------------------

export interface SeoContentPayload {
  siteId: string;
  jobType: 'seo_homepage' | 'seo_category' | 'seo_product' | 'seo_products_batch';
  categoryId?: string; // for category/product/batch jobs
  productId?: string;  // for single product job
}

// ---------------------------------------------------------------------------
// SeoContentJob
//
// Queue: 'seo-content'
// lockDuration: 120000ms (2 min) — Agent SDK query with maxTurns:3 + scoring is short
// Handler dispatches on jobType; seo_homepage case implemented in S02.
// ---------------------------------------------------------------------------

export class SeoContentJob {
  /**
   * Creates a BullMQ Worker on queue 'seo-content'.
   * Returns the Worker so the caller can add it to the shutdown array.
   */
  register(): Worker {
    const connection = createRedisConnection();

    const worker = new Worker<SeoContentPayload>(
      'seo-content',
      handler,
      {
        connection,
        lockDuration: 120000, // 2 min — maxTurns:3 scoring loop
      },
    );

    worker.on('failed', (job, err) => {
      console.error(`[SeoContentJob] Job ${job?.id} type=${job?.data?.jobType} siteId=${job?.data?.siteId} failed: ${err.message}`);
    });

    return worker;
  }
}

// ---------------------------------------------------------------------------
// Top-level dispatcher
// ---------------------------------------------------------------------------

async function handler(job: import('bullmq').Job<SeoContentPayload>): Promise<void> {
  const { jobType } = job.data;
  switch (jobType) {
    case 'seo_homepage': return handleHomepage(job);
    case 'seo_category': return handleCategory(job);
    case 'seo_product': return handleProduct(job);
    case 'seo_products_batch': return handleProductsBatch(job);
    default:
      console.warn(`[seo-content] Unknown jobType: ${jobType}`);
  }
}

// ---------------------------------------------------------------------------
// handleHomepage — generates homepage SEO text with 3-attempt scoring loop
// ---------------------------------------------------------------------------

async function handleHomepage(job: import('bullmq').Job<SeoContentPayload>): Promise<void> {
  const { siteId } = job.data;
  const supabase = createServiceClient();

  // Step A: mark running
  await supabase
    .from('ai_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id!);

  // Step B: fetch site context
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('name, niche, market, language, currency, affiliate_tag')
    .eq('id', siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? 'Site not found';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step C: scoring loop (max 3 attempts)
  const MAX_ATTEMPTS = 3;
  const THRESHOLD = 80;
  let bestResult: { keyword: string; text: string; score: number } | null = null;
  let attempts = 0;
  let scoreFeedback = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const prompt = buildPrompt(site, scoreFeedback);

    const sdkQuery = query({
      prompt,
      options: {
        maxTurns: 3,
        persistSession: false,
        tools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultStr = '';
    for await (const msg of sdkQuery) {
      if (msg.type === 'result' && !msg.is_error) {
        resultStr = 'result' in msg ? (msg.result as string) : '';
      }
    }

    // Parse JSON response: { focus_keyword, seo_text }
    let keyword = '';
    let seoText = '';
    try {
      const stripped = resultStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(stripped);
      keyword = String(parsed.focus_keyword ?? '').trim();
      seoText = String(parsed.seo_text ?? '').trim();
    } catch {
      console.warn(`[seo-content] jobId=${job.id} attempt=${attempt} JSON parse failed — raw: ${resultStr.slice(0, 200)}`);
      continue; // try again
    }

    const score = scoreMarkdown(seoText, keyword, 'homepage');
    console.log(`[seo-content] jobId=${job.id} jobType=seo_homepage siteId=${siteId} attempt=${attempt} score=${score}`);

    if (!bestResult || score > bestResult.score) {
      bestResult = { keyword, text: seoText, score };
    }
    if (score >= THRESHOLD) break;

    scoreFeedback = `Previous attempt scored ${score}/100. Focus on: more natural keyword usage, longer paragraphs (150+ words each), clearer value proposition. Do not just repeat keywords.`;
  }

  if (!bestResult) {
    const msg = 'All attempts failed to produce parseable content';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step D: write to sites
  const { error: siteUpdateErr } = await supabase
    .from('sites')
    .update({ homepage_seo_text: bestResult.text, focus_keyword: bestResult.keyword })
    .eq('id', siteId);

  if (siteUpdateErr) {
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: siteUpdateErr.message, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(siteUpdateErr.message);
  }

  // Step E: mark completed
  await supabase
    .from('ai_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { score: bestResult.score, attempts, keyword: bestResult.keyword },
    })
    .eq('id', job.id!);

  console.log(`[seo-content] jobId=${job.id} jobType=seo_homepage siteId=${siteId} status=completed attempts=${attempts} score=${bestResult.score}`);
}

// ---------------------------------------------------------------------------
// handleCategory — generates category SEO text, keyword, and description
//                  with 3-attempt scoring loop
// ---------------------------------------------------------------------------

async function handleCategory(job: import('bullmq').Job<SeoContentPayload>): Promise<void> {
  const { siteId, categoryId } = job.data;
  const supabase = createServiceClient();

  // Step A: mark running
  await supabase
    .from('ai_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id!);

  // Step B: fetch site context
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('name, niche, market, language, currency')
    .eq('id', siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? 'Site not found';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step B (cont): fetch category context
  const { data: category, error: catErr } = await supabase
    .from('tsa_categories')
    .select('name, slug, keywords')
    .eq('id', categoryId!)
    .eq('site_id', siteId)
    .single();

  if (catErr || !category) {
    const msg = catErr?.message ?? 'Category not found';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step C: scoring loop (max 3 attempts)
  const MAX_ATTEMPTS = 3;
  const THRESHOLD = 80;
  let bestResult: { keyword: string; seoText: string; description: string; score: number } | null = null;
  let attempts = 0;
  let scoreFeedback = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const prompt = buildCategoryPrompt(site, category, scoreFeedback);

    const sdkQuery = query({
      prompt,
      options: {
        maxTurns: 3,
        persistSession: false,
        tools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultStr = '';
    for await (const msg of sdkQuery) {
      if (msg.type === 'result' && !msg.is_error && 'result' in msg) {
        resultStr = msg.result as string;
      }
    }

    // Parse JSON response: { focus_keyword, seo_text, description }
    let keyword = '';
    let seoText = '';
    let description = '';
    try {
      const stripped = resultStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(stripped);
      keyword = String(parsed.focus_keyword ?? '').trim();
      seoText = String(parsed.seo_text ?? '').trim();
      description = String(parsed.description ?? '').trim();
    } catch {
      console.warn(`[seo-content] jobId=${job.id} jobType=seo_category attempt=${attempt} JSON parse failed — raw: ${resultStr.slice(0, 200)}`);
      continue; // try again
    }

    // Only score seo_text — description (~100 chars) is not suitable for SEO scoring
    const score = scoreMarkdown(seoText, keyword, 'category');
    console.log(`[seo-content] jobId=${job.id} jobType=seo_category siteId=${siteId} categoryId=${categoryId} attempt=${attempt} score=${score}`);

    if (!bestResult || score > bestResult.score) {
      bestResult = { keyword, seoText, description, score };
    }
    if (score >= THRESHOLD) break;

    scoreFeedback = `Previous attempt scored ${score}/100. Focus on: more natural keyword usage, longer paragraphs (150+ words each), clearer value proposition for the category. Do not just repeat keywords.`;
  }

  if (!bestResult) {
    const msg = 'All attempts failed to produce parseable content';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step D: write seo_text, focus_keyword, description to tsa_categories in one call
  const { error: catUpdateErr } = await supabase
    .from('tsa_categories')
    .update({ seo_text: bestResult.seoText, focus_keyword: bestResult.keyword, description: bestResult.description })
    .eq('id', categoryId!);

  if (catUpdateErr) {
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: catUpdateErr.message, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(catUpdateErr.message);
  }

  // Step E: mark completed
  await supabase
    .from('ai_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { score: bestResult.score, attempts, keyword: bestResult.keyword },
    })
    .eq('id', job.id!);

  console.log(`[seo-content] jobId=${job.id} jobType=seo_category siteId=${siteId} categoryId=${categoryId} status=completed attempts=${attempts} score=${bestResult.score}`);
}

// ---------------------------------------------------------------------------
// handleProduct — generates product SEO content with 3-attempt scoring loop
// ---------------------------------------------------------------------------

async function handleProduct(job: import('bullmq').Job<SeoContentPayload>): Promise<void> {
  const { siteId, productId } = job.data;
  const supabase = createServiceClient();

  // Step A: mark running
  await supabase
    .from('ai_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id!);

  // Step B: fetch site context
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('name, niche, market, language, currency, affiliate_tag')
    .eq('id', siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? 'Site not found';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step B (cont): fetch product context
  const { data: product, error: productErr } = await supabase
    .from('tsa_products')
    .select('id, asin, title, current_price, rating, review_count')
    .eq('id', productId!)
    .eq('site_id', siteId)
    .single();

  if (productErr || !product) {
    const msg = productErr?.message ?? 'Product not found';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step C: scoring loop (max 3 attempts)
  const MAX_ATTEMPTS = 3;
  const THRESHOLD = 80;
  let bestResult: {
    keyword: string;
    detailedDescription: string;
    prosCons: { pros: string[]; cons: string[] };
    userOpinionsSummary: string;
    metaDescription: string;
    score: number;
  } | null = null;
  let attempts = 0;
  let scoreFeedback = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const prompt = buildProductPrompt(site, product, scoreFeedback);

    const sdkQuery = query({
      prompt,
      options: {
        maxTurns: 3,
        persistSession: false,
        tools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultStr = '';
    for await (const msg of sdkQuery) {
      if (msg.type === 'result' && !msg.is_error && 'result' in msg) {
        resultStr = msg.result as string;
      }
    }

    // Parse JSON response: { focus_keyword, detailed_description, pros_cons, user_opinions_summary, meta_description }
    let keyword = '';
    let detailedDescription = '';
    let prosCons: { pros: string[]; cons: string[] } = { pros: [], cons: [] };
    let userOpinionsSummary = '';
    let metaDescription = '';
    try {
      const stripped = resultStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(stripped);
      keyword = String(parsed.focus_keyword ?? '').trim();
      detailedDescription = String(parsed.detailed_description ?? '').trim();
      const rawProsCons = parsed.pros_cons;
      prosCons = {
        pros: Array.isArray(rawProsCons?.pros) ? rawProsCons.pros.map(String) : [],
        cons: Array.isArray(rawProsCons?.cons) ? rawProsCons.cons.map(String) : [],
      };
      userOpinionsSummary = String(parsed.user_opinions_summary ?? '').trim();
      metaDescription = String(parsed.meta_description ?? '').trim();
    } catch {
      console.warn(`[seo-content] jobId=${job.id} jobType=seo_product attempt=${attempt} JSON parse failed — raw: ${resultStr.slice(0, 200)}`);
      continue; // try again
    }

    // Only score detailed_description — pros_cons and meta_description are structured/short
    const score = scoreMarkdown(detailedDescription, keyword, 'product');
    console.log(`[seo-content] jobId=${job.id} jobType=seo_product siteId=${siteId} productId=${productId} attempt=${attempt} score=${score}`);

    if (!bestResult || score > bestResult.score) {
      bestResult = { keyword, detailedDescription, prosCons, userOpinionsSummary, metaDescription, score };
    }
    if (score >= THRESHOLD) break;

    scoreFeedback = `Previous attempt scored ${score}/100. Focus on: more natural keyword usage, longer paragraphs (100+ words each), clearer product value proposition. Do not just repeat keywords.`;
  }

  if (!bestResult) {
    const msg = 'All attempts failed to produce parseable content';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step D: write 5 fields to tsa_products (KN024: double-cast pros_cons to satisfy Json type)
  const { error: productUpdateErr } = await supabase
    .from('tsa_products')
    .update({
      detailed_description: bestResult.detailedDescription,
      pros_cons: bestResult.prosCons as unknown as import('@monster/db').Json,
      user_opinions_summary: bestResult.userOpinionsSummary,
      meta_description: bestResult.metaDescription,
      focus_keyword: bestResult.keyword,
    })
    .eq('id', productId!);

  if (productUpdateErr) {
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: productUpdateErr.message, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(productUpdateErr.message);
  }

  // Step E: mark completed
  await supabase
    .from('ai_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { score: bestResult.score, attempts, keyword: bestResult.keyword },
    })
    .eq('id', job.id!);

  console.log(`[seo-content] jobId=${job.id} jobType=seo_product siteId=${siteId} productId=${productId} status=completed attempts=${attempts} score=${bestResult.score}`);
}

// ---------------------------------------------------------------------------
// handleProductsBatch — generates product SEO content for all ungenerated
//                       products in a category (single ai_jobs row for the batch)
// ---------------------------------------------------------------------------

async function handleProductsBatch(job: import('bullmq').Job<SeoContentPayload>): Promise<void> {
  const { siteId, categoryId } = job.data;
  const supabase = createServiceClient();

  // Step A: mark running
  await supabase
    .from('ai_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id!);

  // Step B: fetch products with detailed_description IS NULL scoped to category via !inner join (KN020)
  const { data: rawProducts, error: productsErr } = await supabase
    .from('tsa_products')
    .select('id, asin, title, current_price, rating, review_count, category_products!inner(category_id)')
    .eq('site_id', siteId)
    .eq('category_products.category_id', categoryId!)
    .is('detailed_description', null);

  if (productsErr) {
    const msg = productsErr.message;
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Strip the category_products join column — not needed for content generation
  const products = (rawProducts ?? []).map(({ category_products: _cp, ...p }) => p);

  // Step B (cont): fetch site context
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('name, niche, market, language, currency, affiliate_tag')
    .eq('id', siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? 'Site not found';
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', job.id!);
    throw new Error(msg);
  }

  // Step C: process in chunks of 10 with 500ms sleep between products
  const CHUNK_SIZE = 10;
  const MAX_ATTEMPTS = 3;
  const THRESHOLD = 80;
  let totalProcessed = 0;

  for (let chunkStart = 0; chunkStart < products.length; chunkStart += CHUNK_SIZE) {
    const chunk = products.slice(chunkStart, chunkStart + CHUNK_SIZE);

    for (const product of chunk) {
      let bestResult: {
        keyword: string;
        detailedDescription: string;
        prosCons: { pros: string[]; cons: string[] };
        userOpinionsSummary: string;
        metaDescription: string;
        score: number;
      } | null = null;
      let scoreFeedback = '';

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = buildProductPrompt(site, product, scoreFeedback);

        const sdkQuery = query({
          prompt,
          options: {
            maxTurns: 3,
            persistSession: false,
            tools: [],
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
          },
        });

        let resultStr = '';
        for await (const msg of sdkQuery) {
          if (msg.type === 'result' && !msg.is_error && 'result' in msg) {
            resultStr = msg.result as string;
          }
        }

        let keyword = '';
        let detailedDescription = '';
        let prosCons: { pros: string[]; cons: string[] } = { pros: [], cons: [] };
        let userOpinionsSummary = '';
        let metaDescription = '';
        try {
          const stripped = resultStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
          const parsed = JSON.parse(stripped);
          keyword = String(parsed.focus_keyword ?? '').trim();
          detailedDescription = String(parsed.detailed_description ?? '').trim();
          const rawProsCons = parsed.pros_cons;
          prosCons = {
            pros: Array.isArray(rawProsCons?.pros) ? rawProsCons.pros.map(String) : [],
            cons: Array.isArray(rawProsCons?.cons) ? rawProsCons.cons.map(String) : [],
          };
          userOpinionsSummary = String(parsed.user_opinions_summary ?? '').trim();
          metaDescription = String(parsed.meta_description ?? '').trim();
        } catch {
          console.warn(`[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} attempt=${attempt} JSON parse failed`);
          continue;
        }

        // Only score detailed_description — pros_cons and meta_description are structured/short
        const score = scoreMarkdown(detailedDescription, keyword, 'product');
        console.log(`[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} attempt=${attempt} score=${score}`);

        if (!bestResult || score > bestResult.score) {
          bestResult = { keyword, detailedDescription, prosCons, userOpinionsSummary, metaDescription, score };
        }
        if (score >= THRESHOLD) break;

        scoreFeedback = `Previous attempt scored ${score}/100. Focus on: more natural keyword usage, longer paragraphs (100+ words each), clearer product value proposition. Do not just repeat keywords.`;
      }

      if (bestResult) {
        const { error: updateErr } = await supabase
          .from('tsa_products')
          .update({
            detailed_description: bestResult.detailedDescription,
            pros_cons: bestResult.prosCons as unknown as import('@monster/db').Json,
            user_opinions_summary: bestResult.userOpinionsSummary,
            meta_description: bestResult.metaDescription,
            focus_keyword: bestResult.keyword,
          })
          .eq('id', product.id);

        if (updateErr) {
          console.error(`[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} update failed: ${updateErr.message}`);
        } else {
          totalProcessed++;
        }
      } else {
        console.warn(`[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} all attempts failed — skipping`);
      }

      // 500ms sleep between products to avoid rate-limiting
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Step E: mark completed
  await supabase
    .from('ai_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { totalProcessed, siteId, categoryId },
    })
    .eq('id', job.id!);

  console.log(`[seo-content] jobId=${job.id} jobType=seo_products_batch siteId=${siteId} categoryId=${categoryId} status=completed totalProcessed=${totalProcessed}`);
}

// ---------------------------------------------------------------------------
// buildCategoryPrompt — constructs the category SEO prompt with optional feedback
// ---------------------------------------------------------------------------

function buildCategoryPrompt(
  site: { name: string | null; niche: string | null; market: string | null; language: string | null; currency: string | null },
  category: { name: string | null; slug: string | null; keywords: string[] | null },
  scoreFeedback: string,
): string {
  const keywordList = Array.isArray(category.keywords) && category.keywords.length > 0
    ? category.keywords.join(', ')
    : 'none provided';

  return `You are an expert SEO copywriter. Generate category SEO content for an Amazon affiliate site.

Site details:
- Name: ${site.name ?? 'Unknown'}
- Niche: ${site.niche ?? 'Unknown'}
- Amazon market: ${site.market ?? 'ES'} (${site.currency ?? 'EUR'})
- Content language: ${site.language ?? 'es'}

Category details:
- Name: ${category.name ?? 'Unknown'}
- Slug: ${category.slug ?? 'unknown'}
- Keywords: ${keywordList}

Requirements:
- Write a category SEO text of 350-450 words in ${site.language ?? 'es'} language
- Naturally incorporate the focus keyword 3-5 times
- Include 2-3 paragraphs presenting the category value proposition for users
- Mention Amazon affiliate context naturally (best products, reviews, comparisons)
- Write a short description of 1-2 sentences (~100 characters) in ${site.language ?? 'es'} summarising the category
${scoreFeedback ? `\nImprovement feedback from previous attempt:\n${scoreFeedback}` : ''}

Respond ONLY with a valid JSON object — no prose, no markdown fences before or after:
{
  "focus_keyword": "<the main SEO keyword for this category in ${site.language ?? 'es'}>",
  "seo_text": "<the full category SEO text of 350-450 words>",
  "description": "<1-2 sentence category description, ~100 chars>"
}`;
}

// ---------------------------------------------------------------------------
// buildProductPrompt — constructs the product SEO prompt with optional feedback
// ---------------------------------------------------------------------------

function buildProductPrompt(
  site: { name: string | null; niche: string | null; market: string | null; language: string | null; currency: string | null },
  product: { asin: string | null; title: string | null; current_price: number | null; rating: number | null; review_count: number | null },
  scoreFeedback: string,
): string {
  return `You are an expert SEO copywriter. Generate product SEO content for an Amazon affiliate site.

Site details:
- Name: ${site.name ?? 'Unknown'}
- Niche: ${site.niche ?? 'Unknown'}
- Amazon market: ${site.market ?? 'ES'} (${site.currency ?? 'EUR'})
- Content language: ${site.language ?? 'es'}

Product details:
- Title: ${product.title ?? 'Unknown'}
- ASIN: ${product.asin ?? 'Unknown'}
- Price: ${product.current_price != null ? `${product.current_price} ${site.currency ?? 'EUR'}` : 'N/A'}
- Rating: ${product.rating != null ? `${product.rating}/5` : 'N/A'}
- Reviews: ${product.review_count != null ? product.review_count : 'N/A'}

Requirements:
- Write a detailed product description of 280-320 words in ${site.language ?? 'es'} language
- Naturally incorporate the focus keyword 3-5 times in the description
- List 3-5 pros and 3-5 cons for this product
- Write a ~100 word summary of what users typically say about this product
- Write a meta description under 155 characters
- All content must be in ${site.language ?? 'es'} language
${scoreFeedback ? `\nImprovement feedback from previous attempt:\n${scoreFeedback}` : ''}

Respond ONLY with a valid JSON object — no prose, no markdown fences before or after:
{
  "focus_keyword": "<main SEO keyword for this product in ${site.language ?? 'es'}>",
  "detailed_description": "<280-320 word product description in ${site.language ?? 'es'}>",
  "pros_cons": { "pros": ["<pro 1>", "<pro 2>", "<pro 3>"], "cons": ["<con 1>", "<con 2>", "<con 3>"] },
  "user_opinions_summary": "<~100 word summary of what users typically say in ${site.language ?? 'es'}>",
  "meta_description": "<155-char meta description in ${site.language ?? 'es'}>"
}`;
}

// ---------------------------------------------------------------------------
// buildPrompt — constructs the SEO copywriter prompt with optional feedback
// ---------------------------------------------------------------------------

function buildPrompt(
  site: { name: string | null; niche: string | null; market: string | null; language: string | null; currency: string | null; affiliate_tag: string | null },
  scoreFeedback: string,
): string {
  return `You are an expert SEO copywriter. Generate homepage SEO content for an Amazon affiliate site.

Site details:
- Name: ${site.name ?? 'Unknown'}
- Niche: ${site.niche ?? 'Unknown'}
- Amazon market: ${site.market ?? 'ES'} (${site.currency ?? 'EUR'})
- Content language: ${site.language ?? 'es'}

Requirements:
- Write a homepage SEO text of 350-450 words in ${site.language ?? 'es'} language
- Naturally incorporate the focus keyword 3-5 times
- Include 2-3 paragraphs with clear value propositions for users
- Mention Amazon affiliate context naturally (best products, reviews, comparisons)
${scoreFeedback ? `\nImprovement feedback from previous attempt:\n${scoreFeedback}` : ''}

Respond ONLY with a valid JSON object — no prose, no markdown fences before or after:
{
  "focus_keyword": "<the main SEO keyword for this niche in ${site.language ?? 'es'}>",
  "seo_text": "<the full homepage SEO text>"
}`;
}
