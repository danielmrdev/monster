import { Worker } from 'bullmq';
import { createServiceClient } from '@monster/db';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRedisOptions } from '../queue.js';
import { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to `apps/generator/` from the monorepo root.
 * packages/agents/dist/worker.js → ../../../apps/generator
 */
const GENERATOR_ROOT = resolve(__dirname, '../../../apps/generator');

// ---------------------------------------------------------------------------
// Fixture data assembler (S01 stub — no DataForSEO yet)
// ---------------------------------------------------------------------------

interface SiteRow {
  id: string;
  name: string;
  domain: string | null;
  market: string | null;
  language: string | null;
  currency: string | null;
  affiliate_tag: string | null;
  template_slug: string;
  customization: Record<string, unknown> | null;
  niche: string | null;
  company_name: string | null;
  contact_email: string | null;
  focus_keyword: string | null;
}

/**
 * Build a minimal fixture SiteData JSON from the sites row.
 * S01 stub: 2 placeholder categories + 4 placeholder products.
 * Real product fetch (DataForSEO) is S02's job.
 */
function buildFixtureSiteData(site: SiteRow) {
  const niche = site.niche ?? 'General';
  const slug1 = slugify(`${niche} Category 1`);
  const slug2 = slugify(`${niche} Category 2`);

  const categories = [
    {
      id: 'cat-001',
      name: `${niche} - Category 1`,
      slug: slug1,
      seo_text: `Explore our curated selection of the best ${niche} products. Expert reviews, price comparisons, and honest recommendations to help you make the right choice.`,
      category_image: null,
      keywords: [niche.toLowerCase(), `best ${niche.toLowerCase()}`, `${niche.toLowerCase()} reviews`],
    },
    {
      id: 'cat-002',
      name: `${niche} - Category 2`,
      slug: slug2,
      seo_text: `Discover top-rated ${niche} products with detailed comparisons and buying guides. Updated regularly with the latest deals and recommendations.`,
      category_image: null,
      keywords: [`${niche.toLowerCase()} guide`, `${niche.toLowerCase()} comparison`, `buy ${niche.toLowerCase()}`],
    },
  ];

  const products = [
    {
      id: 'prod-001',
      asin: 'B000000001',
      title: `${niche} Product - Model A`,
      slug: `${slugify(niche)}-product-model-a`,
      current_price: 49.99,
      images: [],
      rating: 4.5,
      is_prime: true,
      detailed_description: null,
      pros_cons: null,
      category_slug: slug1,
    },
    {
      id: 'prod-002',
      asin: 'B000000002',
      title: `${niche} Product - Model B`,
      slug: `${slugify(niche)}-product-model-b`,
      current_price: 79.99,
      images: [],
      rating: 4.3,
      is_prime: true,
      detailed_description: null,
      pros_cons: { pros: ['Quality build', 'Good value'], cons: ['Limited availability'] },
      category_slug: slug1,
    },
    {
      id: 'prod-003',
      asin: 'B000000003',
      title: `${niche} Premium - Model C`,
      slug: `${slugify(niche)}-premium-model-c`,
      current_price: 129.99,
      images: [],
      rating: 4.7,
      is_prime: false,
      detailed_description: null,
      pros_cons: null,
      category_slug: slug2,
    },
    {
      id: 'prod-004',
      asin: 'B000000004',
      title: `${niche} Budget - Model D`,
      slug: `${slugify(niche)}-budget-model-d`,
      current_price: 29.99,
      images: [],
      rating: 4.1,
      is_prime: true,
      detailed_description: null,
      pros_cons: null,
      category_slug: slug2,
    },
  ];

  const customization = site.customization as {
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
  } | null;

  return {
    site: {
      name: site.name,
      domain: site.domain ?? `${slugify(site.name)}.example.com`,
      market: (site.market ?? 'US') as string,
      language: (site.language ?? 'en') as string,
      currency: site.currency ?? 'USD',
      affiliate_tag: site.affiliate_tag ?? 'default-20',
      template_slug: site.template_slug as string,
      customization: {
        primaryColor: customization?.primaryColor ?? '#4f46e5',
        accentColor: customization?.accentColor ?? '#7c3aed',
        fontFamily: customization?.fontFamily ?? 'sans-serif',
      },
      company_name: site.company_name ?? site.name,
      contact_email: site.contact_email ?? `contact@${site.domain ?? 'example.com'}`,
    },
    categories,
    products,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// GenerateSiteJob
// ---------------------------------------------------------------------------

export interface GenerateSitePayload {
  siteId: string;
}

export class GenerateSiteJob {
  register(): Worker {
    const connection = new Redis(createRedisOptions());

    const worker = new Worker<GenerateSitePayload>(
      'generate',
      async (job) => {
        const { siteId } = job.data;
        const supabase = createServiceClient();

        console.log(`[GenerateSiteJob] Starting job ${job.id} for site ${siteId}`);

        // ── 1. Fetch site row ─────────────────────────────────────────────
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('*')
          .eq('id', siteId)
          .single();

        if (siteError || !site) {
          throw new Error(`Site not found: ${siteId} — ${siteError?.message ?? 'null row'}`);
        }

        const slug = site.domain
          ? site.domain.replace(/\./g, '-')
          : site.id;

        console.log(`[GenerateSiteJob] Site: "${site.name}", slug: "${slug}"`);

        // ── 2. Insert or update ai_jobs row to 'running' ─────────────────
        // Try updating an existing row with this bull_job_id first; if none, insert new.
        const { data: existingJob } = await supabase
          .from('ai_jobs')
          .select('id')
          .eq('bull_job_id', job.id ?? '')
          .maybeSingle();

        if (existingJob) {
          await supabase
            .from('ai_jobs')
            .update({
              status: 'running',
              started_at: new Date().toISOString(),
              payload: { phase: 'build', slug },
            })
            .eq('id', existingJob.id);
        } else {
          const { error: insertErr } = await supabase
            .from('ai_jobs')
            .insert({
              bull_job_id: job.id ?? null,
              job_type: 'generate_site',
              site_id: siteId,
              status: 'running',
              started_at: new Date().toISOString(),
              payload: { phase: 'build', slug },
            });
          if (insertErr) {
            console.error(`[GenerateSiteJob] Failed to insert ai_jobs: ${insertErr.message}`);
            // Non-fatal — continue build; status tracking degrades but build should succeed
          }
        }

        // ── 3. Assemble fixture SiteData ──────────────────────────────────
        console.log(`[GenerateSiteJob] Assembling fixture site data for "${slug}"`);
        const siteData = buildFixtureSiteData(site as SiteRow);

        // ── 4. Write site.json to apps/generator/src/data/<slug>/ ─────────
        const dataDir = join(GENERATOR_ROOT, 'src', 'data', slug);
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(join(dataDir, 'site.json'), JSON.stringify(siteData, null, 2), 'utf-8');
        console.log(`[GenerateSiteJob] Wrote site.json to ${dataDir}`);

        // ── 5. Run Astro build programmatically ───────────────────────────
        console.log(`[GenerateSiteJob] Running Astro build for slug "${slug}"`);
        process.env.SITE_SLUG = slug;

        // process.chdir() so loadSiteData's process.cwd() resolves correctly inside the build
        const prevCwd = process.cwd();
        process.chdir(GENERATOR_ROOT);
        try {
          // Dynamic import avoids top-level resolution; Astro reads SITE_SLUG at config load
          const { build } = await import('astro');
          await build({ root: GENERATOR_ROOT });
        } finally {
          process.chdir(prevCwd);
        }

        console.log(`[GenerateSiteJob] Astro build complete for "${slug}"`);

        // ── 6. Mark ai_jobs 'completed' ───────────────────────────────────
        await supabase
          .from('ai_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('bull_job_id', job.id ?? '');

        console.log(`[GenerateSiteJob] Job ${job.id} completed`);
      },
      { connection }
    );

    worker.on('failed', async (job, err) => {
      console.error(`[GenerateSiteJob] Job ${job?.id} failed: ${err.message}`);
      if (!job?.id) return;

      const supabase = createServiceClient();
      await supabase
        .from('ai_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: err.message,
        })
        .eq('bull_job_id', job.id);
    });

    return worker;
  }
}
