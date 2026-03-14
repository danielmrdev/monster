import { Worker } from 'bullmq';
import { createServiceClient } from '@monster/db';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRedisOptions } from '../queue.js';
import { Redis } from 'ioredis';
import { DataForSEOClient } from '../clients/dataforseo.js';
import type { DataForSEOProduct } from '../clients/dataforseo.js';
import { processImages } from '../pipeline/images.js';

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
// Slug helper
// ---------------------------------------------------------------------------

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
              payload: { phase: 'fetch_products', slug },
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
              payload: { phase: 'fetch_products', slug },
            });
          if (insertErr) {
            console.error(`[GenerateSiteJob] Failed to insert ai_jobs: ${insertErr.message}`);
            // Non-fatal — continue build; status tracking degrades but build should succeed
          }
        }

        // ── 3. fetch_products phase ───────────────────────────────────────
        const niche = (site.niche ?? site.name) as string;
        const market = (site.market ?? 'ES') as string;

        await supabase
          .from('ai_jobs')
          .update({ payload: { phase: 'fetch_products', done: 0, total: 2 } })
          .eq('bull_job_id', job.id ?? '');

        console.log(`[GenerateSiteJob] fetch_products: niche="${niche}", market="${market}"`);

        const client = new DataForSEOClient();

        // Primary keyword fetch — required, throws on failure
        const keyword1 = niche;
        const products1 = await client.searchProducts(keyword1, market);
        console.log(`[GenerateSiteJob] fetch_products: fetched ${products1.length} products for "${keyword1}"`);

        // Secondary keyword fetch — non-fatal; job continues with one category if it fails
        const keyword2 = `accesorios ${niche}`;
        let products2: DataForSEOProduct[] = [];
        try {
          products2 = await client.searchProducts(keyword2, market);
          console.log(`[GenerateSiteJob] fetch_products: fetched ${products2.length} products for "${keyword2}"`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[GenerateSiteJob] fetch_products: secondary keyword failed (non-fatal) — ${msg}`);
        }

        await supabase
          .from('ai_jobs')
          .update({ payload: { phase: 'fetch_products', done: 2, total: 2 } })
          .eq('bull_job_id', job.id ?? '');

        // De-dupe across both lists by ASIN
        const seenAsins = new Set<string>();
        const cat1Products: DataForSEOProduct[] = [];
        for (const p of products1) {
          if (!seenAsins.has(p.asin)) {
            seenAsins.add(p.asin);
            cat1Products.push(p);
          }
        }
        const cat2Products: DataForSEOProduct[] = [];
        for (const p of products2) {
          if (!seenAsins.has(p.asin)) {
            seenAsins.add(p.asin);
            cat2Products.push(p);
          }
        }

        // Top 15 per category
        const cat1 = cat1Products.slice(0, 15);
        const cat2 = cat2Products.slice(0, 15);
        const allProducts = [...cat1, ...cat2];

        console.log(`[GenerateSiteJob] fetch_products: ${cat1.length} cat1 products, ${cat2.length} cat2 products`);

        // ── 4. Upsert categories + products to Supabase ───────────────────
        const categories: Array<{ id: string; name: string; slug: string; keyword: string; products: DataForSEOProduct[] }> = [];

        const catDefs = [
          { keyword: keyword1, products: cat1 },
          ...(cat2.length > 0 ? [{ keyword: keyword2, products: cat2 }] : []),
        ];

        for (const catDef of catDefs) {
          const catName = catDef.keyword;
          const catSlug = slugify(catName);

          const { data: catRow, error: catErr } = await supabase
            .from('tsa_categories')
            .upsert(
              {
                site_id: siteId,
                name: catName,
                slug: catSlug,
                seo_text: '',
                keywords: [catDef.keyword],
                category_image: null,
              },
              { onConflict: 'site_id,slug', ignoreDuplicates: false }
            )
            .select('id')
            .single();

          if (catErr || !catRow) {
            throw new Error(`Failed to upsert category "${catName}": ${catErr?.message ?? 'null row'}`);
          }

          categories.push({
            id: catRow.id,
            name: catName,
            slug: catSlug,
            keyword: catDef.keyword,
            products: catDef.products,
          });
        }

        // Upsert products — images: [] initially; imageUrl stored in local map only
        const productIdMap = new Map<string, string>(); // asin → db product id

        for (const p of allProducts) {
          const { data: prodRow, error: prodErr } = await supabase
            .from('tsa_products')
            .upsert(
              {
                site_id: siteId,
                asin: p.asin,
                title: p.title,
                slug: slugify(p.title || p.asin),
                current_price: p.price ?? 0,
                images: [] as string[],
                rating: p.rating,
                review_count: p.reviewCount,
                is_prime: p.isPrime,
                availability: 'available',
                last_checked_at: new Date().toISOString(),
              },
              { onConflict: 'site_id,asin', ignoreDuplicates: false }
            )
            .select('id')
            .single();

          if (prodErr || !prodRow) {
            console.log(`[GenerateSiteJob] product upsert warning for ASIN ${p.asin}: ${prodErr?.message ?? 'null row'}`);
            continue;
          }

          productIdMap.set(p.asin, prodRow.id);
        }

        // Upsert category_products join rows
        for (const cat of categories) {
          for (let i = 0; i < cat.products.length; i++) {
            const p = cat.products[i];
            const productId = productIdMap.get(p.asin);
            if (!productId) continue;

            const { error: joinErr } = await supabase
              .from('category_products')
              .upsert(
                { category_id: cat.id, product_id: productId, position: i },
                { onConflict: 'category_id,product_id', ignoreDuplicates: true }
              );

            if (joinErr) {
              console.log(`[GenerateSiteJob] category_products upsert warning: ${joinErr.message}`);
            }
          }
        }

        // ── 5. process_images phase ───────────────────────────────────────
        const publicDir = join(GENERATOR_ROOT, '.generated-sites', slug, 'public');
        mkdirSync(publicDir, { recursive: true });

        await supabase
          .from('ai_jobs')
          .update({ payload: { phase: 'process_images', done: 0, total: allProducts.length } })
          .eq('bull_job_id', job.id ?? '');

        console.log(`[GenerateSiteJob] process_images: processing ${allProducts.length} product images`);

        const imageMap = await processImages(allProducts, publicDir);

        // Update tsa_products with local WebP paths
        for (const [asin, localPaths] of imageMap.entries()) {
          if (localPaths.length === 0) continue;

          const { error: imgErr } = await supabase
            .from('tsa_products')
            .update({ images: localPaths })
            .eq('site_id', siteId)
            .eq('asin', asin);

          if (imgErr) {
            console.log(`[GenerateSiteJob] process_images: image update warning for ASIN ${asin}: ${imgErr.message}`);
          }
        }

        // Set category_image on each category (first product's first image)
        for (const cat of categories) {
          let categoryImage: string | null = null;
          for (const p of cat.products) {
            const paths = imageMap.get(p.asin);
            if (paths && paths.length > 0) {
              categoryImage = paths[0];
              break;
            }
          }

          if (categoryImage) {
            const { error: catImgErr } = await supabase
              .from('tsa_categories')
              .update({ category_image: categoryImage })
              .eq('id', cat.id);

            if (catImgErr) {
              console.log(`[GenerateSiteJob] process_images: category_image update warning for "${cat.name}": ${catImgErr.message}`);
            }
          }
        }

        const imagesDownloaded = [...imageMap.values()].filter((p) => p.length > 0).length;
        console.log(`[GenerateSiteJob] process_images: ${imagesDownloaded}/${allProducts.length} images downloaded`);

        await supabase
          .from('ai_jobs')
          .update({ payload: { phase: 'process_images', done: allProducts.length, total: allProducts.length } })
          .eq('bull_job_id', job.id ?? '');

        // ── 6. Assemble SiteData from DB (post-upsert) ────────────────────
        // Fetch fresh rows so we use what's actually in Supabase
        const { data: dbCategories, error: catFetchErr } = await supabase
          .from('tsa_categories')
          .select('*')
          .eq('site_id', siteId);

        if (catFetchErr || !dbCategories) {
          throw new Error(`Failed to fetch categories for site ${siteId}: ${catFetchErr?.message ?? 'null'}`);
        }

        const { data: dbProducts, error: prodFetchErr } = await supabase
          .from('tsa_products')
          .select('*')
          .eq('site_id', siteId);

        if (prodFetchErr || !dbProducts) {
          throw new Error(`Failed to fetch products for site ${siteId}: ${prodFetchErr?.message ?? 'null'}`);
        }

        // Build a map of category_id → first product ASIN for category_slug assignment
        const { data: catProducts } = await supabase
          .from('category_products')
          .select('category_id, product_id, position')
          .in('category_id', dbCategories.map((c) => c.id))
          .order('position');

        // Map product_id → category slug (first category wins)
        const productCategorySlug = new Map<string, string>();
        for (const cp of catProducts ?? []) {
          if (!productCategorySlug.has(cp.product_id)) {
            const cat = dbCategories.find((c) => c.id === cp.category_id);
            if (cat) {
              productCategorySlug.set(cp.product_id, cat.slug);
            }
          }
        }

        const customization = site.customization as {
          primaryColor?: string;
          accentColor?: string;
          fontFamily?: string;
        } | null;

        const siteData = {
          site: {
            name: site.name as string,
            domain: (site.domain ?? `${slugify(site.name as string)}.example.com`) as string,
            market: (site.market ?? 'US') as string,
            language: (site.language ?? 'en') as string,
            currency: (site.currency ?? 'USD') as string,
            affiliate_tag: (site.affiliate_tag ?? 'default-20') as string,
            template_slug: site.template_slug as string,
            customization: {
              primaryColor: customization?.primaryColor ?? '#4f46e5',
              accentColor: customization?.accentColor ?? '#7c3aed',
              fontFamily: customization?.fontFamily ?? 'sans-serif',
            },
            company_name: (site.company_name ?? site.name) as string,
            contact_email: (site.contact_email ?? `contact@${site.domain ?? 'example.com'}`) as string,
          },
          categories: dbCategories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            seo_text: cat.seo_text ?? '',
            category_image: cat.category_image ?? null,
            keywords: (cat.keywords as string[]) ?? [],
          })),
          products: dbProducts
            .filter((p) => productCategorySlug.has(p.id))
            .map((p) => ({
              id: p.id,
              asin: p.asin,
              title: p.title,
              slug: p.slug,
              current_price: p.current_price ?? 0,
              images: (p.images as string[]) ?? [],
              rating: p.rating ?? 0,
              is_prime: p.is_prime ?? false,
              detailed_description: p.detailed_description ?? null,
              pros_cons: (p.pros_cons as { pros: string[]; cons: string[] } | null) ?? null,
              category_slug: productCategorySlug.get(p.id) ?? '',
            })),
        };

        // ── 4. Write site.json to apps/generator/src/data/<slug>/ ─────────
        const dataDir = join(GENERATOR_ROOT, 'src', 'data', slug);
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(join(dataDir, 'site.json'), JSON.stringify(siteData, null, 2), 'utf-8');
        console.log(`[GenerateSiteJob] Wrote site.json to ${dataDir} (${siteData.categories.length} categories, ${siteData.products.length} products)`);

        // ── 5. Run Astro build programmatically ───────────────────────────
        await supabase
          .from('ai_jobs')
          .update({ payload: { phase: 'build', done: 0, total: 1 } })
          .eq('bull_job_id', job.id ?? '');

        console.log(`[GenerateSiteJob] build: starting Astro build for slug "${slug}"`);
        process.env.SITE_SLUG = slug;

        const prevCwd = process.cwd();
        process.chdir(GENERATOR_ROOT);
        try {
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
