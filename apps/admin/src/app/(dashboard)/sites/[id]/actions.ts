"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { generateQueue, deployQueue, productRefreshQueue } from "@monster/agents";
import { SpaceshipClient } from "@monster/domains";

/**
 * Enqueue a site generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ queue.
 * The worker upserts the row to 'running' when it picks up the job.
 */
export async function enqueueSiteGeneration(
  siteId: string,
): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();

  // Insert pending ai_jobs row first so UI can show 'Pending' immediately
  const { data: jobRow, error: insertErr } = await supabase
    .from("ai_jobs")
    .insert({
      job_type: "generate_site",
      site_id: siteId,
      status: "pending",
      payload: { phase: "queued" },
    })
    .select("id")
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? "Failed to create job record" };
  }

  try {
    const queue = generateQueue();
    const bullJob = await queue.add(
      "generate-site",
      { siteId },
      {
        jobId: jobRow.id,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    // Update the ai_jobs row with the bull_job_id
    await supabase
      .from("ai_jobs")
      .update({ bull_job_id: bullJob.id ?? null })
      .eq("id", jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
      .eq("id", jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}

/**
 * Fetch the latest ai_jobs row for a given site.
 * Used by JobStatus client component on each poll cycle.
 */
export async function getLatestJobStatus(siteId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("ai_jobs")
    .select("id, status, started_at, completed_at, error, payload, created_at")
    .eq("site_id", siteId)
    .eq("job_type", "generate_site")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Enqueue a standalone site deploy job (DeploySiteJob).
 * Mirrors enqueueSiteGeneration but targets the 'deploy' queue.
 * Observability: creates ai_jobs row (job_type='deploy_site') visible in Supabase;
 * worker transitions status pending→running→completed/failed; payload.phase tracks
 * rsync/caddy/cloudflare steps and is surfaced in DeployStatus component.
 */
export async function enqueueSiteDeploy(
  siteId: string,
): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();

  const { data: jobRow, error: insertErr } = await supabase
    .from("ai_jobs")
    .insert({
      job_type: "deploy_site",
      site_id: siteId,
      status: "pending",
      payload: { phase: "queued" },
    })
    .select("id")
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? "Failed to create deploy job record" };
  }

  try {
    const queue = deployQueue();
    const bullJob = await queue.add(
      "deploy-site",
      { siteId },
      {
        jobId: jobRow.id,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    await supabase
      .from("ai_jobs")
      .update({ bull_job_id: bullJob.id ?? null })
      .eq("id", jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ai_jobs")
      .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
      .eq("id", jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}

/**
 * Fetch the latest deploy ai_jobs row for a given site.
 * Used by DeployStatus client component on each poll cycle.
 * Filters job_type = 'deploy_site' — separate from generate_site jobs.
 */
export async function getLatestDeployStatus(siteId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("ai_jobs")
    .select("id, status, started_at, completed_at, error, payload, created_at")
    .eq("site_id", siteId)
    .eq("job_type", "deploy_site")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Fetch all data needed for the Deployment card on the site detail page.
 * Returns: sites.status, latest deployments row, domains row (with cf_nameservers).
 * Called server-side in page.tsx for SSR — DeployStatus polls separately.
 */
export async function getDeploymentCard(siteId: string) {
  const supabase = createServiceClient();

  const [siteResult, deploymentResult, domainResult] = await Promise.all([
    supabase.from("sites").select("id, status").eq("id", siteId).single(),
    supabase
      .from("deployments")
      .select("id, status, deployed_at, duration_ms, error, created_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("domains")
      .select("cf_zone_id, cf_nameservers, dns_status")
      .eq("site_id", siteId)
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    siteStatus: siteResult.data?.status ?? null,
    latestDeployment: deploymentResult.data ?? null,
    domain: domainResult.data ?? null,
  };
}

/**
 * Check whether a domain name is available via Spaceship API.
 * Pure read — no DB writes. Errors are returned (not thrown) for inline UI display.
 * Observability: on failure, error message includes Spaceship response body for diagnosis.
 */
export async function checkDomainAvailability(
  domain: string,
): Promise<{ available: boolean; price?: string; error?: string }> {
  try {
    const client = new SpaceshipClient();
    const result = await client.checkAvailability(domain);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { available: false, error: message };
  }
}

/**
 * Register a domain via Spaceship, then update nameservers to Cloudflare.
 * R031 gate: this action is only called from an explicit form submit — never autonomously.
 *
 * Guards:
 *  1. domains row must exist (site must have been deployed)
 *  2. cf_nameservers must be populated (deploy must have completed Cloudflare zone setup)
 *  3. spaceship_contact_id must be set in Settings
 *
 * On success: polls operation (10 × 2s), calls updateNameservers, updates domains row.
 * Observability: each phase logged; domains.registrar/registered_at/spaceship_id updated.
 */
export async function registerDomain(
  siteId: string,
  domain: string,
): Promise<{ success?: boolean; nameservers?: string[]; error?: string }> {
  const supabase = createServiceClient();

  // Guard 1: domains row must exist
  const { data: domainRow } = await supabase
    .from("domains")
    .select("cf_nameservers, spaceship_id")
    .eq("site_id", siteId)
    .limit(1)
    .maybeSingle();

  if (!domainRow) {
    return { error: "Deploy the site first to generate Cloudflare nameservers." };
  }

  // Guard 2: cf_nameservers must be populated
  if (!domainRow.cf_nameservers || domainRow.cf_nameservers.length === 0) {
    return { error: "Cloudflare nameservers not yet assigned — deploy the site first." };
  }

  // Guard 3: spaceship_contact_id must be in settings (D028 pattern)
  const { data: contactRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "spaceship_contact_id")
    .maybeSingle();

  const contactId = contactRow ? (contactRow.value as { value: string }).value : null;
  if (!contactId) {
    return { error: "spaceship_contact_id not configured — add it in Settings." };
  }

  try {
    const client = new SpaceshipClient();

    // Register domain → async operation
    console.log(`[registerDomain] Starting registration for ${domain} (site ${siteId})`);
    const { operationId } = await client.registerDomain(domain, contactId);
    console.log(`[registerDomain] Operation ${operationId} submitted for ${domain}`);

    // Poll up to 10 × 2s
    let finalStatus: string = "pending";
    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      finalStatus = await client.pollOperation(operationId);
      console.log(`[registerDomain] Poll ${attempt}/10 for op ${operationId}: ${finalStatus}`);
      if (finalStatus === "success" || finalStatus === "failed") break;
    }

    if (finalStatus === "failed") {
      return { error: `Spaceship registration failed (operation: ${operationId})` };
    }
    if (finalStatus !== "success") {
      return {
        error: `Registration timed out — check Spaceship account for operation ${operationId}`,
      };
    }

    // Update nameservers to Cloudflare
    console.log(`[registerDomain] Updating nameservers for ${domain}`);
    await client.updateNameservers(domain, domainRow.cf_nameservers);

    // Persist result to domains row
    await supabase
      .from("domains")
      .update({
        registrar: "spaceship",
        registered_at: new Date().toISOString(),
        spaceship_id: operationId,
      })
      .eq("site_id", siteId);

    console.log(`[registerDomain] Registration complete for ${domain}, op ${operationId}`);
    return { success: true, nameservers: domainRow.cf_nameservers };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

/**
 * Enqueue a product refresh job for a site.
 * Fire-and-forget — no ai_jobs row in S01 (job tracking is S02+).
 * Observability: job appears in BullMQ 'product-refresh' queue in Redis;
 *   worker logs [ProductRefreshJob] lines; sites.last_refreshed_at updates in DB after completion.
 */
export async function enqueueProductRefresh(
  siteId: string,
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    const queue = productRefreshQueue();
    const job = await queue.add(
      "refresh-site",
      { siteId },
      { removeOnComplete: true, removeOnFail: false },
    );
    console.log(`[enqueueProductRefresh] Queued job ${job.id} for site ${siteId}`);
    return { ok: true, jobId: job.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[enqueueProductRefresh] Failed to enqueue for site ${siteId}: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Swap the sort_order of two adjacent categories in the given direction.
 *
 * Edge-case normalization: if all sort_order values are equal (DEFAULT 0 initial state),
 * the action assigns sequential values (0, 1, 2…) first, then executes the swap.
 *
 * Observability: logs [reorderCategory] prefix on error paths; returns { error } on
 * Supabase failure so the UI can surface the message to the user.
 * Inspect via: pm2 logs monster-admin --lines 50 | grep reorderCategory
 */
export async function reorderCategory(
  siteId: string,
  categoryId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  const supabase = createServiceClient();

  // Fetch all categories for this site ordered by sort_order
  const { data: rows, error: fetchErr } = await supabase
    .from("tsa_categories")
    .select("id, sort_order")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });

  if (fetchErr || !rows) {
    const msg = fetchErr?.message ?? "Failed to fetch categories";
    console.error(`[reorderCategory] Fetch failed for site ${siteId}: ${msg}`);
    return { error: msg };
  }

  // Normalize: if all sort_order values are identical, assign 0, 1, 2, ...
  const allSame = rows.every((r) => r.sort_order === rows[0]?.sort_order);
  if (allSame && rows.length > 1) {
    for (let i = 0; i < rows.length; i++) {
      const { error: normErr } = await supabase
        .from("tsa_categories")
        .update({ sort_order: i })
        .eq("id", rows[i].id);
      if (normErr) {
        const msg = `Normalization failed at index ${i}: ${normErr.message}`;
        console.error(`[reorderCategory] ${msg}`);
        return { error: msg };
      }
      rows[i].sort_order = i;
    }
  }

  // Find target index
  const idx = rows.findIndex((r) => r.id === categoryId);
  if (idx === -1) return {}; // noop: category not found
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= rows.length) return {}; // noop: boundary

  const current = rows[idx];
  const adjacent = rows[targetIdx];

  // Swap sort_order values
  const { error: e1 } = await supabase
    .from("tsa_categories")
    .update({ sort_order: adjacent.sort_order })
    .eq("id", current.id);
  if (e1) {
    const msg = `Update failed for category ${current.id}: ${e1.message}`;
    console.error(`[reorderCategory] ${msg}`);
    return { error: msg };
  }

  const { error: e2 } = await supabase
    .from("tsa_categories")
    .update({ sort_order: current.sort_order })
    .eq("id", adjacent.id);
  if (e2) {
    const msg = `Update failed for category ${adjacent.id}: ${e2.message}`;
    console.error(`[reorderCategory] ${msg}`);
    return { error: msg };
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/sites/${siteId}`, "page");
  return {};
}
