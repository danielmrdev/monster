import { query } from "@anthropic-ai/claude-agent-sdk";
import { Worker } from "bullmq";
import { createServiceClient } from "@monster/db";
import { createRedisConnection } from "../queue.js";
import { scoreMarkdown } from "../seo-scorer-wrapper.js";

// ---------------------------------------------------------------------------
// SeoContentPayload
// ---------------------------------------------------------------------------

export type HomepageField = "meta_description" | "intro" | "seo_text";
export type CategoryField = "focus_keyword" | "description" | "seo_text";

export interface HomepageCurrentContent {
  focus_keyword?: string | null;
  meta_description?: string | null;
  intro?: string | null;
  seo_text?: string | null;
}

export interface CategoryCurrentContent {
  focus_keyword?: string | null;
  seo_text?: string | null;
  description?: string | null;
}

export interface SeoContentPayload {
  siteId: string;
  jobType: "seo_homepage" | "seo_category" | "seo_product" | "seo_products_batch";
  categoryId?: string; // for category/product/batch jobs
  productId?: string; // for single product job
  // homepage-only extras:
  homepageFields?: HomepageField[]; // undefined = all three
  currentContent?: HomepageCurrentContent; // existing content for reference
  currentScore?: number | null; // content_quality_score from seo_scores
  // category-only extras:
  categoryFields?: CategoryField[]; // undefined = all three
  currentCategoryContent?: CategoryCurrentContent; // existing category content for reference
  currentCategoryScore?: number | null; // content_quality_score from seo_scores
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

    const worker = new Worker<SeoContentPayload>("seo-content", handler, {
      connection,
      lockDuration: 120000, // 2 min — maxTurns:3 scoring loop
    });

    worker.on("failed", (job, err) => {
      console.error(
        `[SeoContentJob] Job ${job?.id} type=${job?.data?.jobType} siteId=${job?.data?.siteId} failed: ${err.message}`,
      );
    });

    return worker;
  }
}

// ---------------------------------------------------------------------------
// Top-level dispatcher
// ---------------------------------------------------------------------------

async function handler(job: import("bullmq").Job<SeoContentPayload>): Promise<void> {
  const { jobType } = job.data;
  switch (jobType) {
    case "seo_homepage":
      return handleHomepage(job);
    case "seo_category":
      return handleCategory(job);
    case "seo_product":
      return handleProduct(job);
    case "seo_products_batch":
      return handleProductsBatch(job);
    default:
      console.warn(`[seo-content] Unknown jobType: ${jobType}`);
  }
}

// ---------------------------------------------------------------------------
// handleHomepage — generates homepage SEO text with 3-attempt scoring loop
// ---------------------------------------------------------------------------

async function handleHomepage(job: import("bullmq").Job<SeoContentPayload>): Promise<void> {
  const { siteId, homepageFields, currentContent, currentScore } = job.data;
  const supabase = createServiceClient();

  // Which fields to regenerate — undefined means all three
  const ALL_FIELDS: HomepageField[] = ["meta_description", "intro", "seo_text"];
  const fieldsToGenerate: HomepageField[] =
    homepageFields && homepageFields.length > 0 ? homepageFields : ALL_FIELDS;

  // Step A: mark running
  await supabase
    .from("ai_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id!);

  // Step B: fetch site context
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("name, niche, market, language, currency, affiliate_tag, focus_keyword")
    .eq("id", siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? "Site not found";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step B (cont): fetch category names for richer prompt context
  const { data: categoryRows } = await supabase
    .from("tsa_categories")
    .select("name")
    .eq("site_id", siteId)
    .order("name");
  const categoryNames = (categoryRows ?? []).map((c) => c.name).filter(Boolean) as string[];

  // Step C: scoring loop (max 3 attempts)
  const MAX_ATTEMPTS = 3;
  const lang = site.language ?? "es";
  // Threshold 70: Flesch is bypassed for non-English (Spanish scores -30 to +30 on the
  // English formula, permanently losing 20 pts). With language-aware scoring, 80 is
  // achievable but tight; 70 is the practical ceiling for a well-written 400-word text.
  const THRESHOLD = 70;
  let bestResult: {
    keyword: string;
    text: string;
    metaDescription: string;
    intro: string;
    score: number;
  } | null = null;
  let attempts = 0;
  let scoreFeedback = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const prompt = buildPrompt(
      site,
      categoryNames,
      fieldsToGenerate,
      currentContent ?? null,
      currentScore ?? null,
      scoreFeedback,
    );

    const sdkQuery = query({
      prompt,
      options: {
        maxTurns: 3,
        persistSession: false,
        tools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultStr = "";
    for await (const msg of sdkQuery) {
      if (msg.type === "result" && !msg.is_error) {
        resultStr = "result" in msg ? (msg.result as string) : "";
      }
    }

    // Parse JSON response: { focus_keyword, seo_text, meta_description, intro }
    let keyword = "";
    let seoText = "";
    let metaDescription = "";
    let intro = "";
    try {
      const stripped = resultStr
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(stripped);
      keyword = String(parsed.focus_keyword ?? "").trim();
      seoText = String(parsed.seo_text ?? "").trim();
      metaDescription = String(parsed.meta_description ?? "").trim();
      intro = String(parsed.intro ?? "").trim();
    } catch {
      console.warn(
        `[seo-content] jobId=${job.id} attempt=${attempt} JSON parse failed — raw: ${resultStr.slice(0, 200)}`,
      );
      continue; // try again
    }

    const score = scoreMarkdown(
      seoText || (currentContent?.seo_text ?? ""),
      keyword,
      "homepage",
      lang,
    );
    console.log(
      `[seo-content] jobId=${job.id} jobType=seo_homepage siteId=${siteId} attempt=${attempt} score=${score}`,
    );

    if (!bestResult || score > bestResult.score) {
      bestResult = { keyword, text: seoText, metaDescription, intro, score };
    }
    if (score >= THRESHOLD) break;

    scoreFeedback = `Previous attempt scored ${score}/100. Critical issues to fix: (1) The focus keyword must appear in the FIRST sentence and at least 4 times total — density ~1%. (2) Use 2-3 H2 subheadings, one every ~150 words. (3) Each section must be 100-150 words. (4) Vary phrasing — do not just repeat the keyword robotically.`;
  }

  if (!bestResult) {
    const msg = "All attempts failed to produce parseable content";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step D: write only the requested fields to sites (always update focus_keyword)
  const updatePayload: Record<string, string | null> = {
    focus_keyword: bestResult.keyword,
  };
  if (fieldsToGenerate.includes("seo_text")) {
    updatePayload.homepage_seo_text = bestResult.text || null;
  }
  if (fieldsToGenerate.includes("meta_description")) {
    updatePayload.homepage_meta_description = bestResult.metaDescription || null;
  }
  if (fieldsToGenerate.includes("intro")) {
    updatePayload.homepage_intro = bestResult.intro || null;
  }

  const { error: siteUpdateErr } = await supabase
    .from("sites")
    .update(updatePayload)
    .eq("id", siteId);

  if (siteUpdateErr) {
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: siteUpdateErr.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(siteUpdateErr.message);
  }

  // Step E: mark completed
  await supabase
    .from("ai_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result: {
        score: bestResult.score,
        attempts,
        keyword: bestResult.keyword,
        fields: fieldsToGenerate,
      },
    })
    .eq("id", job.id!);

  console.log(
    `[seo-content] jobId=${job.id} jobType=seo_homepage siteId=${siteId} status=completed attempts=${attempts} score=${bestResult.score} fields=${fieldsToGenerate.join(",")}`,
  );
}

// ---------------------------------------------------------------------------
// handleCategory — generates category SEO text, keyword, and description
//                  with 3-attempt scoring loop
// ---------------------------------------------------------------------------

async function handleCategory(job: import("bullmq").Job<SeoContentPayload>): Promise<void> {
  const { siteId, categoryId, categoryFields, currentCategoryContent, currentCategoryScore } =
    job.data;
  const supabase = createServiceClient();

  // Which fields to regenerate — undefined means all three
  const ALL_CAT_FIELDS: CategoryField[] = ["focus_keyword", "description", "seo_text"];
  const fieldsToGenerate: CategoryField[] =
    categoryFields && categoryFields.length > 0 ? categoryFields : ALL_CAT_FIELDS;

  // Step A: mark running
  await supabase
    .from("ai_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id!);

  // Step B: fetch site context (focus_keyword + homepage_meta_description give the agent niche tone)
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("name, niche, market, language, currency, focus_keyword, homepage_meta_description")
    .eq("id", siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? "Site not found";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step B (cont): fetch category context (include existing focus_keyword so prompt can reuse it)
  const { data: category, error: catErr } = await supabase
    .from("tsa_categories")
    .select("name, slug, keywords, focus_keyword")
    .eq("id", categoryId!)
    .eq("site_id", siteId)
    .single();

  if (catErr || !category) {
    const msg = catErr?.message ?? "Category not found";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step C: scoring loop (max 3 attempts)
  const MAX_ATTEMPTS = 3;
  const lang = site.language ?? "es";
  const THRESHOLD = 70;
  let bestResult: {
    keyword: string;
    seoText: string;
    description: string;
    score: number;
  } | null = null;
  let attempts = 0;
  let scoreFeedback = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const prompt = buildCategoryPrompt(
      site,
      category,
      fieldsToGenerate,
      currentCategoryContent ?? null,
      currentCategoryScore ?? null,
      scoreFeedback,
    );

    const sdkQuery = query({
      prompt,
      options: {
        maxTurns: 3,
        persistSession: false,
        tools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultStr = "";
    for await (const msg of sdkQuery) {
      if (msg.type === "result" && !msg.is_error && "result" in msg) {
        resultStr = msg.result as string;
      }
    }

    // Parse JSON response: { focus_keyword, seo_text, description }
    let keyword = "";
    let seoText = "";
    let description = "";
    try {
      const stripped = resultStr
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(stripped);
      keyword = String(parsed.focus_keyword ?? "").trim();
      seoText = String(parsed.seo_text ?? "").trim();
      description = String(parsed.description ?? "").trim();
    } catch {
      console.warn(
        `[seo-content] jobId=${job.id} jobType=seo_category attempt=${attempt} JSON parse failed — raw: ${resultStr.slice(0, 200)}`,
      );
      continue; // try again
    }

    // Only score seo_text — description (~100 chars) is not suitable for SEO scoring
    const score = scoreMarkdown(seoText, keyword, "category", lang);
    console.log(
      `[seo-content] jobId=${job.id} jobType=seo_category siteId=${siteId} categoryId=${categoryId} attempt=${attempt} score=${score}`,
    );

    if (!bestResult || score > bestResult.score) {
      bestResult = { keyword, seoText, description, score };
    }
    if (score >= THRESHOLD) break;

    scoreFeedback = `Previous attempt scored ${score}/100. Critical issues to fix: (1) The focus keyword must appear in the FIRST sentence and at least 4 times total — density ~1%. (2) Use 2-3 H2 subheadings, one every ~150 words. (3) Each section must be 100-150 words. (4) Do not just pad or repeat keywords robotically — vary phrasing.`;
  }

  if (!bestResult) {
    const msg = "All attempts failed to produce parseable content";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step D: write only the requested fields to tsa_categories
  const catUpdatePayload: Record<string, string | null> = {};
  if (fieldsToGenerate.includes("focus_keyword")) {
    catUpdatePayload.focus_keyword = bestResult.keyword || null;
  }
  if (fieldsToGenerate.includes("seo_text")) {
    catUpdatePayload.seo_text = bestResult.seoText || null;
  }
  if (fieldsToGenerate.includes("description")) {
    catUpdatePayload.description = bestResult.description || null;
  }

  const { error: catUpdateErr } = await supabase
    .from("tsa_categories")
    .update(catUpdatePayload)
    .eq("id", categoryId!);

  if (catUpdateErr) {
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: catUpdateErr.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(catUpdateErr.message);
  }

  // Step E: mark completed
  await supabase
    .from("ai_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result: {
        score: bestResult.score,
        attempts,
        keyword: bestResult.keyword,
        fields: fieldsToGenerate,
      },
    })
    .eq("id", job.id!);

  console.log(
    `[seo-content] jobId=${job.id} jobType=seo_category siteId=${siteId} categoryId=${categoryId} status=completed attempts=${attempts} score=${bestResult.score} fields=${fieldsToGenerate.join(",")}`,
  );
}

// ---------------------------------------------------------------------------
// handleProduct — generates product SEO content with 3-attempt scoring loop
// ---------------------------------------------------------------------------

async function handleProduct(job: import("bullmq").Job<SeoContentPayload>): Promise<void> {
  const { siteId, productId } = job.data;
  const supabase = createServiceClient();

  // Step A: mark running
  await supabase
    .from("ai_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id!);

  // Step B: fetch site context
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("name, niche, market, language, currency, affiliate_tag")
    .eq("id", siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? "Site not found";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step B (cont): fetch product context
  const { data: product, error: productErr } = await supabase
    .from("tsa_products")
    .select("id, asin, title, current_price, rating, review_count, focus_keyword")
    .eq("id", productId!)
    .eq("site_id", siteId)
    .single();

  if (productErr || !product) {
    const msg = productErr?.message ?? "Product not found";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step C: scoring loop (max 3 attempts)
  const MAX_ATTEMPTS = 3;
  const lang = site.language ?? "es";
  const THRESHOLD = 70;
  let bestResult: {
    keyword: string;
    detailedDescription: string;
    prosCons: { pros: string[]; cons: string[] };
    userOpinionsSummary: string;
    metaDescription: string;
    score: number;
  } | null = null;
  let attempts = 0;
  let scoreFeedback = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    const prompt = buildProductPrompt(site, product, scoreFeedback);

    const sdkQuery = query({
      prompt,
      options: {
        maxTurns: 3,
        persistSession: false,
        tools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultStr = "";
    for await (const msg of sdkQuery) {
      if (msg.type === "result" && !msg.is_error && "result" in msg) {
        resultStr = msg.result as string;
      }
    }

    // Parse JSON response: { focus_keyword, detailed_description, pros_cons, user_opinions_summary, meta_description }
    let keyword = "";
    let detailedDescription = "";
    let prosCons: { pros: string[]; cons: string[] } = { pros: [], cons: [] };
    let userOpinionsSummary = "";
    let metaDescription = "";
    try {
      const stripped = resultStr
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(stripped);
      keyword = String(parsed.focus_keyword ?? "").trim();
      detailedDescription = String(parsed.detailed_description ?? "").trim();
      const rawProsCons = parsed.pros_cons;
      prosCons = {
        pros: Array.isArray(rawProsCons?.pros) ? rawProsCons.pros.map(String) : [],
        cons: Array.isArray(rawProsCons?.cons) ? rawProsCons.cons.map(String) : [],
      };
      userOpinionsSummary = String(parsed.user_opinions_summary ?? "").trim();
      metaDescription = String(parsed.meta_description ?? "").trim();
    } catch {
      console.warn(
        `[seo-content] jobId=${job.id} jobType=seo_product attempt=${attempt} JSON parse failed — raw: ${resultStr.slice(0, 200)}`,
      );
      continue; // try again
    }

    // Only score detailed_description — pros_cons and meta_description are structured/short
    const score = scoreMarkdown(detailedDescription, keyword, "product", lang);
    console.log(
      `[seo-content] jobId=${job.id} jobType=seo_product siteId=${siteId} productId=${productId} attempt=${attempt} score=${score}`,
    );

    if (!bestResult || score > bestResult.score) {
      bestResult = {
        keyword,
        detailedDescription,
        prosCons,
        userOpinionsSummary,
        metaDescription,
        score,
      };
    }
    if (score >= THRESHOLD) break;

    scoreFeedback = `Previous attempt scored ${score}/100. Focus on: more natural keyword usage, longer paragraphs (100+ words each), clearer product value proposition. Do not just repeat keywords.`;
  }

  if (!bestResult) {
    const msg = "All attempts failed to produce parseable content";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step D: write 5 fields to tsa_products (KN024: double-cast pros_cons to satisfy Json type)
  const { error: productUpdateErr } = await supabase
    .from("tsa_products")
    .update({
      detailed_description: bestResult.detailedDescription,
      pros_cons: bestResult.prosCons as unknown as import("@monster/db").Json,
      user_opinions_summary: bestResult.userOpinionsSummary,
      meta_description: bestResult.metaDescription,
      focus_keyword: bestResult.keyword,
    })
    .eq("id", productId!);

  if (productUpdateErr) {
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: productUpdateErr.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(productUpdateErr.message);
  }

  // Step E: mark completed
  await supabase
    .from("ai_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result: {
        score: bestResult.score,
        attempts,
        keyword: bestResult.keyword,
      },
    })
    .eq("id", job.id!);

  console.log(
    `[seo-content] jobId=${job.id} jobType=seo_product siteId=${siteId} productId=${productId} status=completed attempts=${attempts} score=${bestResult.score}`,
  );
}

// ---------------------------------------------------------------------------
// handleProductsBatch — generates product SEO content for all ungenerated
//                       products in a category (single ai_jobs row for the batch)
// ---------------------------------------------------------------------------

async function handleProductsBatch(job: import("bullmq").Job<SeoContentPayload>): Promise<void> {
  const { siteId, categoryId } = job.data;
  const supabase = createServiceClient();

  // Step A: mark running
  await supabase
    .from("ai_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id!);

  // Step B: fetch products with detailed_description IS NULL scoped to category via !inner join (KN020)
  const { data: rawProducts, error: productsErr } = await supabase
    .from("tsa_products")
    .select(
      "id, asin, title, current_price, rating, review_count, category_products!inner(category_id)",
    )
    .eq("site_id", siteId)
    .eq("category_products.category_id", categoryId!)
    .is("detailed_description", null);

  if (productsErr) {
    const msg = productsErr.message;
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Strip the category_products join column — not needed for content generation
  const products = (rawProducts ?? []).map(({ category_products: _cp, ...p }) => p);

  // Step B (cont): fetch site context
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("name, niche, market, language, currency, affiliate_tag")
    .eq("id", siteId)
    .single();

  if (siteErr || !site) {
    const msg = siteErr?.message ?? "Site not found";
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id!);
    throw new Error(msg);
  }

  // Step C: process in chunks of 10 with 500ms sleep between products
  const CHUNK_SIZE = 10;
  const MAX_ATTEMPTS = 3;
  const lang = site.language ?? "es";
  const THRESHOLD = 70;
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
      let scoreFeedback = "";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = buildProductPrompt(site, product, scoreFeedback);

        const sdkQuery = query({
          prompt,
          options: {
            maxTurns: 3,
            persistSession: false,
            tools: [],
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
          },
        });

        let resultStr = "";
        for await (const msg of sdkQuery) {
          if (msg.type === "result" && !msg.is_error && "result" in msg) {
            resultStr = msg.result as string;
          }
        }

        let keyword = "";
        let detailedDescription = "";
        let prosCons: { pros: string[]; cons: string[] } = { pros: [], cons: [] };
        let userOpinionsSummary = "";
        let metaDescription = "";
        try {
          const stripped = resultStr
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim();
          const parsed = JSON.parse(stripped);
          keyword = String(parsed.focus_keyword ?? "").trim();
          detailedDescription = String(parsed.detailed_description ?? "").trim();
          const rawProsCons = parsed.pros_cons;
          prosCons = {
            pros: Array.isArray(rawProsCons?.pros) ? rawProsCons.pros.map(String) : [],
            cons: Array.isArray(rawProsCons?.cons) ? rawProsCons.cons.map(String) : [],
          };
          userOpinionsSummary = String(parsed.user_opinions_summary ?? "").trim();
          metaDescription = String(parsed.meta_description ?? "").trim();
        } catch {
          console.warn(
            `[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} attempt=${attempt} JSON parse failed`,
          );
          continue;
        }

        // Only score detailed_description — pros_cons and meta_description are structured/short
        const score = scoreMarkdown(detailedDescription, keyword, "product", lang);
        console.log(
          `[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} attempt=${attempt} score=${score}`,
        );

        if (!bestResult || score > bestResult.score) {
          bestResult = {
            keyword,
            detailedDescription,
            prosCons,
            userOpinionsSummary,
            metaDescription,
            score,
          };
        }
        if (score >= THRESHOLD) break;

        scoreFeedback = `Previous attempt scored ${score}/100. Focus on: more natural keyword usage, longer paragraphs (100+ words each), clearer product value proposition. Do not just repeat keywords.`;
      }

      if (bestResult) {
        const { error: updateErr } = await supabase
          .from("tsa_products")
          .update({
            detailed_description: bestResult.detailedDescription,
            pros_cons: bestResult.prosCons as unknown as import("@monster/db").Json,
            user_opinions_summary: bestResult.userOpinionsSummary,
            meta_description: bestResult.metaDescription,
            focus_keyword: bestResult.keyword,
          })
          .eq("id", product.id);

        if (updateErr) {
          console.error(
            `[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} update failed: ${updateErr.message}`,
          );
        } else {
          totalProcessed++;
        }
      } else {
        console.warn(
          `[seo-content] jobId=${job.id} jobType=seo_products_batch productId=${product.id} asin=${product.asin} all attempts failed — skipping`,
        );
      }

      // 500ms sleep between products to avoid rate-limiting
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Step E: mark completed
  await supabase
    .from("ai_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result: { totalProcessed, siteId, categoryId },
    })
    .eq("id", job.id!);

  console.log(
    `[seo-content] jobId=${job.id} jobType=seo_products_batch siteId=${siteId} categoryId=${categoryId} status=completed totalProcessed=${totalProcessed}`,
  );
}

// ---------------------------------------------------------------------------
// buildCategoryPrompt — constructs the category SEO prompt with optional feedback
// ---------------------------------------------------------------------------

function buildCategoryPrompt(
  site: {
    name: string | null;
    niche: string | null;
    market: string | null;
    language: string | null;
    currency: string | null;
    focus_keyword?: string | null;
    homepage_meta_description?: string | null;
  },
  category: {
    name: string | null;
    slug: string | null;
    keywords: string[] | null;
    focus_keyword?: string | null;
  },
  fieldsToGenerate: CategoryField[],
  currentContent: CategoryCurrentContent | null,
  currentScore: number | null,
  scoreFeedback: string,
): string {
  const lang = site.language ?? "es";
  const ALL_CAT_FIELDS: CategoryField[] = ["focus_keyword", "description", "seo_text"];
  const generatingAll = ALL_CAT_FIELDS.every((f) => fieldsToGenerate.includes(f));

  const keywordList =
    Array.isArray(category.keywords) && category.keywords.length > 0
      ? category.keywords.join(", ")
      : "none provided";

  // Prefer existing keyword from currentContent, then from category row, to keep it stable across regenerations
  const existingKeyword = (currentContent?.focus_keyword ?? category.focus_keyword)?.trim();
  const keywordInstruction = existingKeyword
    ? `- Use "${existingKeyword}" as the focus keyword (already established for this category)`
    : `- Choose the most effective focus keyword for this category in ${lang} (3-5 words)`;

  // Current content reference block
  const hasCurrentContent =
    currentContent && (currentContent.seo_text || currentContent.description);
  const currentContentBlock = hasCurrentContent
    ? `

Current content (for reference — improve on this, do not copy verbatim):${
        currentContent.seo_text
          ? `
- SEO text (first 300 chars): "${currentContent.seo_text.slice(0, 300)}..."`
          : ""
      }${
        currentContent.description
          ? `
- Description: "${currentContent.description}"`
          : ""
      }`
    : "";

  const scoreBlock =
    currentScore != null
      ? `
Current content quality score: ${currentScore}/100 — your output must score strictly higher than ${currentScore}/100.`
      : "";

  const fieldsNote = generatingAll
    ? ""
    : `
Fields to regenerate: ${fieldsToGenerate.join(", ")} — generate ALL JSON keys but only these fields need to be high quality; the rest can be brief placeholders.`;

  const seoTextReq = fieldsToGenerate.includes("seo_text")
    ? `
Requirements for seo_text (400-500 words):
- ${keywordInstruction}
- The focus keyword MUST appear in the very first sentence of the first paragraph
- The focus keyword MUST appear at least 4 times total (density ~1%) — vary phrasing naturally
- Structure: use 2-3 H2 subheadings to break the text into sections (one subheading every ~150 words)
- Each section must be 120-160 words of flowing prose
- Clear value proposition: why explore this category, what products the user will find
- Mention Amazon affiliate context naturally (best products, expert reviews, comparisons)`
    : `
Requirements for seo_text: reuse existing or write a brief placeholder (this field is NOT being regenerated).`;

  const descReq = fieldsToGenerate.includes("description")
    ? `
Requirements for description (1-2 sentences, ~100 characters):
- Concise summary of the category in ${lang}
- Include the focus keyword naturally${
        site.focus_keyword
          ? `\n- Also reference the site topic ("${site.focus_keyword}") if it fits naturally`
          : ""
      }
- Should encourage clicks from the category grid on the homepage`
    : `
Requirements for description: reuse existing or write a brief placeholder (this field is NOT being regenerated).`;

  const keywordReq = fieldsToGenerate.includes("focus_keyword")
    ? `
Requirements for focus_keyword:
- ${keywordInstruction}`
    : `
Requirements for focus_keyword: reuse the existing keyword "${existingKeyword ?? "none"}" — do NOT change it.`;

  return `You are an expert SEO copywriter. Generate category SEO content for an Amazon affiliate site.

Site details:
- Name: ${site.name ?? "Unknown"}
- Niche: ${site.niche ?? "Unknown"}
- Amazon market: ${site.market ?? "ES"} (${site.currency ?? "EUR"})
- Content language: ${lang}${
    site.focus_keyword ? `\n- Site focus keyword: ${site.focus_keyword}` : ""
  }${
    site.homepage_meta_description
      ? `\n- Site meta description: ${site.homepage_meta_description}`
      : ""
  }

Category details:
- Name: ${category.name ?? "Unknown"}
- Slug: ${category.slug ?? "unknown"}
- Keywords: ${keywordList}${currentContentBlock}${scoreBlock}${fieldsNote}
${keywordReq}
${seoTextReq}
${descReq}
${scoreFeedback ? `\nImprovement feedback from previous attempt:\n${scoreFeedback}` : ""}
IMPORTANT: seo_text must be written in plain Markdown — use ## for subheadings, plain paragraphs for body text. Never use HTML tags (<p>, <h2>, <strong>, etc.).
Respond ONLY with a valid JSON object — no prose, no markdown fences before or after:
{
  "focus_keyword": "<main SEO keyword for this category in ${lang}>",
  "seo_text": "<category SEO text of 400-500 words>",
  "description": "<1-2 sentence category description, ~100 chars>"
}`;
}

// ---------------------------------------------------------------------------
// buildProductPrompt — constructs the product SEO prompt with optional feedback
// ---------------------------------------------------------------------------

function buildProductPrompt(
  site: {
    name: string | null;
    niche: string | null;
    market: string | null;
    language: string | null;
    currency: string | null;
  },
  product: {
    asin: string | null;
    title: string | null;
    current_price: number | null;
    rating: number | null;
    review_count: number | null;
    focus_keyword?: string | null;
  },
  scoreFeedback: string,
): string {
  const lang = site.language ?? "es";
  const existingKeyword = product.focus_keyword?.trim();
  const keywordInstruction = existingKeyword
    ? `- Use "${existingKeyword}" as the focus keyword (already established for this product)`
    : `- Choose the most effective SEO focus keyword for this product in ${lang} (3-5 words)`;

  return `You are an expert SEO copywriter. Generate product SEO content for an Amazon affiliate site.

Site details:
- Name: ${site.name ?? "Unknown"}
- Niche: ${site.niche ?? "Unknown"}
- Amazon market: ${site.market ?? "ES"} (${site.currency ?? "EUR"})
- Content language: ${lang}

Product details:
- Title: ${product.title ?? "Unknown"}
- ASIN: ${product.asin ?? "Unknown"}
- Price: ${
    product.current_price != null ? `${product.current_price} ${site.currency ?? "EUR"}` : "N/A"
  }
- Rating: ${product.rating != null ? `${product.rating}/5` : "N/A"}
- Reviews: ${product.review_count != null ? product.review_count : "N/A"}

Requirements:
- ${keywordInstruction}
- The focus keyword MUST appear in the very first sentence of the description
- The focus keyword MUST appear at least 4 times in the description (density ~1.5%)
- Write a detailed product description of 320-400 words in ${lang} — use 2-3 H2 subheadings (## Heading) to structure it
- Each section must be 100-150 words of flowing prose
- List 3-5 pros and 2-4 cons for this product
- Write a ~100 word summary of what users typically say about this product
- Write a meta description under 155 characters including the focus keyword
- All content must be in ${lang} language
${scoreFeedback ? `\nImprovement feedback from previous attempt:\n${scoreFeedback}` : ""}

IMPORTANT: detailed_description must be written in plain Markdown — use ## for subheadings, plain paragraphs for body text. Never use HTML tags.
Respond ONLY with a valid JSON object — no prose, no markdown fences before or after:
{
  "focus_keyword": "<main SEO keyword for this product in ${lang}>",
  "detailed_description": "<320-400 word product description in ${lang}, with ## subheadings>",
  "pros_cons": { "pros": ["<pro 1>", "<pro 2>", "<pro 3>"], "cons": ["<con 1>", "<con 2>", "<con 3>"] },
  "user_opinions_summary": "<~100 word summary of what users typically say in ${lang}>",
  "meta_description": "<155-char meta description in ${lang}>"
}`;
}

// ---------------------------------------------------------------------------
// buildPrompt — constructs the SEO copywriter prompt with optional feedback
// ---------------------------------------------------------------------------

function buildPrompt(
  site: {
    name: string | null;
    niche: string | null;
    market: string | null;
    language: string | null;
    currency: string | null;
    affiliate_tag: string | null;
    focus_keyword?: string | null;
  },
  categoryNames: string[],
  fieldsToGenerate: HomepageField[],
  currentContent: HomepageCurrentContent | null,
  currentScore: number | null,
  scoreFeedback: string,
): string {
  const lang = site.language ?? "es";
  const ALL_FIELDS: HomepageField[] = ["meta_description", "intro", "seo_text"];
  const generatingAll = ALL_FIELDS.every((f) => fieldsToGenerate.includes(f));

  // Keyword: prefer existing in currentContent, then site.focus_keyword
  const existingKeyword = (currentContent?.focus_keyword ?? site.focus_keyword)?.trim();
  const categoriesBlock =
    categoryNames.length > 0 ? `\nSite categories: ${categoryNames.join(", ")}` : "";
  const keywordInstruction = existingKeyword
    ? `- Use "${existingKeyword}" as the focus keyword (already established for this site)`
    : `- Choose the most effective focus keyword for this niche in ${lang}`;

  // Current content reference block
  const hasCurrentContent =
    currentContent &&
    (currentContent.meta_description || currentContent.intro || currentContent.seo_text);
  const currentContentBlock = hasCurrentContent
    ? `

Current content (for reference — improve on this, do not copy verbatim):${
        currentContent.meta_description
          ? `
- Meta description: "${currentContent.meta_description}"`
          : ""
      }${
        currentContent.intro
          ? `
- Intro: "${currentContent.intro}"`
          : ""
      }${
        currentContent.seo_text
          ? `
- SEO text (first 300 chars): "${currentContent.seo_text.slice(0, 300)}..."`
          : ""
      }`
    : "";

  const scoreBlock =
    currentScore != null
      ? `
Current content quality score: ${currentScore}/100 — your output must score strictly higher than ${currentScore}/100.`
      : "";

  const fieldsNote = generatingAll
    ? ""
    : `
Fields to regenerate: ${fieldsToGenerate.join(", ")} — generate ALL JSON keys but only these fields need to be high quality; the rest can be brief placeholders.`;

  const seoTextReq = fieldsToGenerate.includes("seo_text")
    ? `
Requirements for seo_text (400-500 words):
- ${keywordInstruction}
- The focus keyword MUST appear in the very first sentence of the first paragraph
- The focus keyword MUST appear at least 4 times total (density ~1%) — vary phrasing naturally
- Structure: use 2-3 H2 subheadings to break the text into sections (one subheading every ~150 words)
- Each section must be 120-160 words of flowing prose
- Clear value proposition for users: why visit this site, what they will find
- Mention Amazon affiliate context naturally (best products, reviews, comparisons)`
    : `
Requirements for seo_text: reuse existing or write a brief placeholder (this field is NOT being regenerated).`;

  const metaReq = fieldsToGenerate.includes("meta_description")
    ? `
Requirements for meta_description (optimal: 140-155 characters):
- Include the focus keyword near the beginning
- Compelling call-to-action that drives clicks from search results
- Accurately describe the site content — do NOT keyword-stuff
- Must be exactly 140-155 characters (count carefully)`
    : `
Requirements for meta_description: reuse existing or write a brief placeholder (this field is NOT being regenerated).`;

  const introReq = fieldsToGenerate.includes("intro")
    ? `
Requirements for intro (optimal: 120-160 characters):
- 1 sentence shown below the H1 title and above the category grid
- Reinforce the focus keyword naturally
- Engaging hook that motivates the user to explore the categories
- Must be exactly 120-160 characters (count carefully)`
    : `
Requirements for intro: reuse existing or write a brief placeholder (this field is NOT being regenerated).`;

  return `You are an expert SEO copywriter. Generate homepage SEO content for an Amazon affiliate site.

Site details:
- Name: ${site.name ?? "Unknown"}
- Niche: ${site.niche ?? "Unknown"}
- Amazon market: ${site.market ?? "ES"} (${site.currency ?? "EUR"})
- Content language: ${lang}${categoriesBlock}${currentContentBlock}${scoreBlock}${fieldsNote}
${seoTextReq}
${metaReq}
${introReq}
${scoreFeedback ? `\nImprovement feedback from previous attempt:\n${scoreFeedback}` : ""}
IMPORTANT: seo_text must be written in plain Markdown — use ## for subheadings, plain paragraphs for body text. Never use HTML tags (<p>, <h2>, <strong>, etc.).
Respond ONLY with a valid JSON object — no prose, no markdown fences before or after:
{
  "focus_keyword": "<the main SEO keyword for this niche in ${lang}>",
  "seo_text": "<homepage SEO text, 400-500 words>",
  "meta_description": "<meta description>",
  "intro": "<1-sentence intro>"
}`;
}
