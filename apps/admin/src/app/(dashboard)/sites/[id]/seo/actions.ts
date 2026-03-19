'use server';

import { createServiceClient } from '@/lib/supabase/service';
import { seoContentQueue } from '@monster/agents';
import type { SeoContentPayload } from '@monster/agents';

/**
 * Enqueue a homepage SEO content generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_homepage';
 * worker transitions pending→running→completed/failed; payload stored for S05 polling.
 */
export async function enqueueHomepageSeo(siteId: string): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = { siteId, jobType: 'seo_homepage' };

  const { data: jobRow, error: insertErr } = await supabase
    .from('ai_jobs')
    .insert({
      job_type: 'seo_homepage',
      site_id: siteId,
      status: 'pending',
      payload: { siteId, jobType: 'seo_homepage' },
    })
    .select('id')
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? 'Failed to create job record' };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add('seo_homepage', payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from('ai_jobs')
      .update({ bull_job_id: bullJob.id ?? null })
      .eq('id', jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
      .eq('id', jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}

/**
 * Enqueue a category SEO content generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_category';
 * payload.categoryId used by S05 polling action to filter by category entity.
 */
export async function enqueueCategorySeo(siteId: string, categoryId: string): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = { siteId, jobType: 'seo_category', categoryId };

  const { data: jobRow, error: insertErr } = await supabase
    .from('ai_jobs')
    .insert({
      job_type: 'seo_category',
      site_id: siteId,
      status: 'pending',
      payload: { siteId, jobType: 'seo_category', categoryId },
    })
    .select('id')
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? 'Failed to create job record' };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add('seo_category', payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from('ai_jobs')
      .update({ bull_job_id: bullJob.id ?? null })
      .eq('id', jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
      .eq('id', jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}

/**
 * Enqueue a single product SEO content generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_product';
 * payload.productId and payload.categoryId used by S05 polling for entity-level filtering.
 */
export async function enqueueProductSeo(siteId: string, productId: string, categoryId: string): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = { siteId, jobType: 'seo_product', productId, categoryId };

  const { data: jobRow, error: insertErr } = await supabase
    .from('ai_jobs')
    .insert({
      job_type: 'seo_product',
      site_id: siteId,
      status: 'pending',
      payload: { siteId, jobType: 'seo_product', productId, categoryId },
    })
    .select('id')
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? 'Failed to create job record' };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add('seo_product', payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from('ai_jobs')
      .update({ bull_job_id: bullJob.id ?? null })
      .eq('id', jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
      .eq('id', jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}

/**
 * Enqueue a batch products SEO content generation job (all products in a category).
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ seo-content queue.
 * Observability: ai_jobs row immediately visible in Supabase with job_type='seo_products_batch';
 * payload.categoryId used by S05 polling to identify which category batch is running.
 */
export async function enqueueAllProductsSeo(siteId: string, categoryId: string): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();
  const payload: SeoContentPayload = { siteId, jobType: 'seo_products_batch', categoryId };

  const { data: jobRow, error: insertErr } = await supabase
    .from('ai_jobs')
    .insert({
      job_type: 'seo_products_batch',
      site_id: siteId,
      status: 'pending',
      payload: { siteId, jobType: 'seo_products_batch', categoryId },
    })
    .select('id')
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? 'Failed to create job record' };
  }

  try {
    const queue = seoContentQueue();
    const bullJob = await queue.add('seo_products_batch', payload, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    await supabase
      .from('ai_jobs')
      .update({ bull_job_id: bullJob.id ?? null })
      .eq('id', jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
      .eq('id', jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}
