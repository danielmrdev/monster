"use server";

/**
 * Enqueue a homepage SEO content generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_homepage';
 * worker transitions pending→running→completed/failed; payload stored for S05 polling.
 */

/**
 * Enqueue a category SEO content generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_category';
 * payload.categoryId used by S05 polling action to filter by category entity.
 */

/**
 * Enqueue a single product SEO content generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_product';
 * payload.productId and payload.categoryId used by S05 polling for entity-level filtering.
 */

/**
 * Enqueue a batch products SEO content generation job (all products in a category).
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_products_batch';
 * payload.categoryId used by S05 polling to identify which category batch is running.
 */

/**
 * Fetch the latest ai_jobs row for a SEO content job.
 * Used by SeoJobStatus client component on each poll cycle.
 * - For seo_homepage: filter by site_id + job_type only
 * - For seo_category / seo_products_batch: also filter payload->>categoryId
 * - For seo_product: also filter payload->>productId
 *
 * Observability: returns null when no job exists (compact SeoJobStatus renders nothing),
 * returns the row with status/result/error when a job exists. The ->> JSON path operator
 * extracts JSONB fields as text for equality comparison.
 */
// seo_category, seo_products_batch

/**
 * Enqueue a product SEO content generation job from the product edit panel.
 * Unlike enqueueProductSeo (which is called from the category table row),
 * this version accepts currentScore so the worker can surface it in the result.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { seoContentQueue } from "@monster/agents";
import type { SeoContentPayload } from "@monster/agents";
export async function enqueueHomepageSeo(
  siteId: string,
  options?: {
    fields?: Array<"meta_description" | "intro" | "seo_text">;
    currentContent?: {
      focus_keyword?: string | null;
      meta_description?: string | null;
      intro?: string | null;
      seo_text?: string | null;
    };
    currentScore?: number | null;
  },
): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = {
    siteId,
    jobType: "seo_homepage",
    ...(options?.fields && options.fields.length > 0 ? { homepageFields: options.fields } : {}),
    ...(options?.currentContent ? { currentContent: options.currentContent } : {}),
    ...(options?.currentScore != null ? { currentScore: options.currentScore } : {}),
  };

  const { data: jobRow, error: insertErr } = await supabase
    .from("ai_jobs")
    .insert({
      job_type: "seo_homepage",
      site_id: siteId,
      status: "pending",
      payload: { siteId, jobType: "seo_homepage" },
    })
    .select("id")
    .single();

  if (insertErr || !jobRow) {
    return {
      jobId: null,
      error: insertErr?.message ?? "Failed to create job record",
    };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add("seo_homepage", payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from("ai_jobs")
      .update({
        bull_job_id: bullJob.id ?? null,
      })
      .eq("id", jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}
export async function enqueueCategorySeo(
  siteId: string,
  categoryId: string,
  options?: {
    fields?: Array<"focus_keyword" | "description" | "seo_text">;
    currentContent?: {
      focus_keyword?: string | null;
      seo_text?: string | null;
      description?: string | null;
    };
    currentScore?: number | null;
  },
): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = {
    siteId,
    jobType: "seo_category",
    categoryId,
    ...(options?.fields && options.fields.length > 0 ? { categoryFields: options.fields } : {}),
    ...(options?.currentContent ? { currentCategoryContent: options.currentContent } : {}),
    ...(options?.currentScore != null ? { currentCategoryScore: options.currentScore } : {}),
  };

  const { data: jobRow, error: insertErr } = await supabase
    .from("ai_jobs")
    .insert({
      job_type: "seo_category",
      site_id: siteId,
      status: "pending",
      payload: { siteId, jobType: "seo_category", categoryId },
    })
    .select("id")
    .single();

  if (insertErr || !jobRow) {
    return {
      jobId: null,
      error: insertErr?.message ?? "Failed to create job record",
    };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add("seo_category", payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from("ai_jobs")
      .update({
        bull_job_id: bullJob.id ?? null,
      })
      .eq("id", jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}
export async function enqueueProductSeo(
  siteId: string,
  productId: string,
  categoryId: string,
): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = {
    siteId,
    jobType: "seo_product",
    productId,
    categoryId,
  };

  const { data: jobRow, error: insertErr } = await supabase
    .from("ai_jobs")
    .insert({
      job_type: "seo_product",
      site_id: siteId,
      status: "pending",
      payload: { siteId, jobType: "seo_product", productId, categoryId },
    })
    .select("id")
    .single();

  if (insertErr || !jobRow) {
    return {
      jobId: null,
      error: insertErr?.message ?? "Failed to create job record",
    };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add("seo_product", payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from("ai_jobs")
      .update({
        bull_job_id: bullJob.id ?? null,
      })
      .eq("id", jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}
export async function enqueueAllProductsSeo(
  siteId: string,
  categoryId: string,
): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = {
    siteId,
    jobType: "seo_products_batch",
    categoryId,
  };

  const { data: jobRow, error: insertErr } = await supabase
    .from("ai_jobs")
    .insert({
      job_type: "seo_products_batch",
      site_id: siteId,
      status: "pending",
      payload: { siteId, jobType: "seo_products_batch", categoryId },
    })
    .select("id")
    .single();

  if (insertErr || !jobRow) {
    return {
      jobId: null,
      error: insertErr?.message ?? "Failed to create job record",
    };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add("seo_products_batch", payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from("ai_jobs")
      .update({
        bull_job_id: bullJob.id ?? null,
      })
      .eq("id", jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}
export async function getLatestSeoJobStatus(
  siteId: string,
  jobType: "seo_homepage" | "seo_category" | "seo_product" | "seo_products_batch",
  entityId?: string,
) {
  const supabase = createServiceClient();
  let query = supabase
    .from("ai_jobs")
    .select("id, status, started_at, completed_at, error, result, created_at")
    .eq("site_id", siteId)
    .eq("job_type", jobType)
    .order("created_at", { ascending: false })
    .limit(1);

  if (entityId) {
    if (jobType === "seo_product") {
      query = query.eq("payload->>productId", entityId);
    } else {
      query = query.eq("payload->>categoryId", entityId);
    }
  }

  const { data } = await query.maybeSingle();
  return data;
}
export async function enqueueProductSeoFromPanel(
  siteId: string,
  productId: string,
  options?: {
    currentScore?: number | null;
  },
): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = {
    siteId,
    jobType: "seo_product",
    productId,
  };

  const { data: jobRow, error: insertErr } = await supabase
    .from("ai_jobs")
    .insert({
      job_type: "seo_product",
      site_id: siteId,
      status: "pending",
      payload: { siteId, jobType: "seo_product", productId },
    })
    .select("id")
    .single();

  if (insertErr || !jobRow) {
    return {
      jobId: null,
      error: insertErr?.message ?? "Failed to create job record",
    };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add("seo_product", payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from("ai_jobs")
      .update({ bull_job_id: bullJob.id ?? null })
      .eq("id", jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}
