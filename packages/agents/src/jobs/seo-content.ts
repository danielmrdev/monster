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
    // TODO S04: case 'seo_product'
    // TODO S04: case 'seo_products_batch'
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
