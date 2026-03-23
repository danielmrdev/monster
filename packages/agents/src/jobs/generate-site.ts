import { Worker } from "bullmq";
import { createServiceClient } from "@monster/db";
import type { TablesInsert } from "@monster/db";
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync, cpSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRedisOptions } from "../queue.js";
import { Redis } from "ioredis";
import { writeSeoFiles } from "../seo-files.js";
import { processImages } from "../pipeline/images.js";
import { scorePage } from "@monster/seo-scorer";
import type { PageType } from "@monster/seo-scorer";
import { runDeployPhase } from "./deploy-site.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to `apps/generator/` from the monorepo root.
 * packages/agents/dist/worker.js → ../../../apps/generator
 */
const GENERATOR_ROOT = resolve(__dirname, "../../../apps/generator");

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// SEO scorer helpers
// ---------------------------------------------------------------------------

function inferPageType(filePath: string): PageType {
  const rel = filePath.replace(/\\/g, "/");
  if (rel === "index.html") return "homepage";
  if (rel.startsWith("categories/")) return "category";
  if (rel.startsWith("products/")) return "product";
  return "legal";
}

function filePathToPagePath(filePath: string): string {
  // filePath is relative to dist/ (from glob)
  let p = filePath.replace(/\\/g, "/");
  p = p.replace(/index\.html$/, "").replace(/\.html$/, "/");
  if (!p.startsWith("/")) p = "/" + p;
  return p || "/";
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
      "generate",
      async (job) => {
        const { siteId } = job.data;
        const supabase = createServiceClient();

        console.log(`[GenerateSiteJob] Starting job ${job.id} for site ${siteId}`);

        // ── 1. Fetch site row ─────────────────────────────────────────────
        const { data: site, error: siteError } = await supabase
          .from("sites")
          .select("*")
          .eq("id", siteId)
          .single();

        if (siteError || !site) {
          throw new Error(`Site not found: ${siteId} — ${siteError?.message ?? "null row"}`);
        }

        const slug = site.domain ? site.domain.replace(/\./g, "-") : site.id;

        // Remember the status before we transition — determines whether to auto-deploy at the end.
        // Sites coming from 'live' (automated refresh) get a full generate + deploy cycle.
        // Sites coming from 'draft'/'error' (first deploy, manual) stop at 'generated'.
        const previousStatus = (site.status ?? "draft") as string;
        const autoDeployAfterGenerate = previousStatus === "live" || previousStatus === "paused";

        console.log(
          `[GenerateSiteJob] Site: "${site.name}", slug: "${slug}", previousStatus: "${previousStatus}", autoDeployAfterGenerate: ${autoDeployAfterGenerate}`,
        );

        // ── 2. Insert or update ai_jobs row to 'running' ─────────────────
        const { data: existingJob } = await supabase
          .from("ai_jobs")
          .select("id")
          .eq("bull_job_id", job.id ?? "")
          .maybeSingle();

        if (existingJob) {
          await supabase
            .from("ai_jobs")
            .update({
              status: "running",
              started_at: new Date().toISOString(),
              payload: { phase: "fetch_products", slug },
            })
            .eq("id", existingJob.id);
        } else {
          const { error: insertErr } = await supabase.from("ai_jobs").insert({
            bull_job_id: job.id ?? null,
            job_type: "generate_site",
            site_id: siteId,
            status: "running",
            started_at: new Date().toISOString(),
            payload: { phase: "fetch_products", slug },
          });
          if (insertErr) {
            console.error(`[GenerateSiteJob] Failed to insert ai_jobs: ${insertErr.message}`);
            // Non-fatal — continue build; status tracking degrades but build should succeed
          }
        }

        // ── Transition site: draft/error → generating ─────────────────────
        await supabase
          .from("sites")
          .update({
            status: "generating",
            updated_at: new Date().toISOString(),
          })
          .eq("id", siteId);
        console.log(`[GenerateSiteJob] site ${siteId}: → generating`);

        // ── 3. Read categories + products from DB ─────────────────────────
        // Products are managed via the admin panel (added/refreshed separately).
        // Generate only reads what's already in DB — no DataForSEO calls here.
        await supabase
          .from("ai_jobs")
          .update({ payload: { phase: "process_images", done: 0, total: 0 } })
          .eq("bull_job_id", job.id ?? "");

        const { data: dbCategoriesRaw, error: catReadErr } = await supabase
          .from("tsa_categories")
          .select("*")
          .eq("site_id", siteId)
          .order("sort_order", { ascending: true });

        if (catReadErr || !dbCategoriesRaw) {
          throw new Error(
            `Failed to fetch categories for site ${siteId}: ${catReadErr?.message ?? "null"}`,
          );
        }

        const { data: dbProductsRaw, error: prodReadErr } = await supabase
          .from("tsa_products")
          .select("*")
          .eq("site_id", siteId);

        if (prodReadErr || !dbProductsRaw) {
          throw new Error(
            `Failed to fetch products for site ${siteId}: ${prodReadErr?.message ?? "null"}`,
          );
        }

        console.log(
          `[GenerateSiteJob] read from DB: ${dbCategoriesRaw.length} categories, ${dbProductsRaw.length} products`,
        );

        // ── 4. process_images phase ───────────────────────────────────────
        const publicDir = join(GENERATOR_ROOT, ".generated-sites", slug, "public");
        mkdirSync(publicDir, { recursive: true });

        const allProductsForImages = dbProductsRaw.map((p) => ({
          asin: p.asin,
          imageUrl: p.source_image_url ?? null,
        }));

        await supabase
          .from("ai_jobs")
          .update({
            payload: {
              phase: "process_images",
              done: 0,
              total: allProductsForImages.length,
            },
          })
          .eq("bull_job_id", job.id ?? "");

        console.log(
          `[GenerateSiteJob] process_images: processing ${allProductsForImages.length} product images`,
        );

        const imageMap = await processImages(allProductsForImages, publicDir);

        // Update tsa_products with local WebP paths (idempotent — skipped if already exists)
        for (const [asin, localPaths] of imageMap.entries()) {
          if (localPaths.length === 0) continue;
          const { error: imgErr } = await supabase
            .from("tsa_products")
            .update({ images: localPaths })
            .eq("site_id", siteId)
            .eq("asin", asin);
          if (imgErr) {
            console.log(
              `[GenerateSiteJob] process_images: image update warning for ASIN ${asin}: ${imgErr.message}`,
            );
          }
        }

        // Set category_image on each category (first product's first image)
        const { data: catProductLinks } = await supabase
          .from("category_products")
          .select("category_id, product_id, position")
          .in(
            "category_id",
            dbCategoriesRaw.map((c) => c.id),
          )
          .order("position");

        for (const cat of dbCategoriesRaw) {
          if (cat.category_image) continue; // already set — skip
          const links = (catProductLinks ?? []).filter((cp) => cp.category_id === cat.id);
          let categoryImage: string | null = null;
          for (const link of links) {
            const prod = dbProductsRaw.find((p) => p.id === link.product_id);
            const paths = prod ? imageMap.get(prod.asin) : undefined;
            if (paths && paths.length > 0) {
              categoryImage = paths[0];
              break;
            }
          }
          if (categoryImage) {
            const { error: catImgErr } = await supabase
              .from("tsa_categories")
              .update({ category_image: categoryImage })
              .eq("id", cat.id);
            if (catImgErr) {
              console.log(
                `[GenerateSiteJob] process_images: category_image update warning for "${cat.name}": ${catImgErr.message}`,
              );
            }
          }
        }

        const imagesDownloaded = [...imageMap.values()].filter((p) => p.length > 0).length;
        console.log(
          `[GenerateSiteJob] process_images: ${imagesDownloaded}/${allProductsForImages.length} images downloaded`,
        );

        await supabase
          .from("ai_jobs")
          .update({
            payload: {
              phase: "process_images",
              done: allProductsForImages.length,
              total: allProductsForImages.length,
            },
          })
          .eq("bull_job_id", job.id ?? "");

        // ── 5. Assemble SiteData from DB ──────────────────────────────────
        // Re-fetch to get updated image paths
        const { data: dbCategories, error: catFetchErr } = await supabase
          .from("tsa_categories")
          .select("*")
          .eq("site_id", siteId)
          .order("sort_order", { ascending: true });

        if (catFetchErr || !dbCategories) {
          throw new Error(
            `Failed to fetch categories for site ${siteId}: ${catFetchErr?.message ?? "null"}`,
          );
        }

        const { data: dbProducts, error: prodFetchErr } = await supabase
          .from("tsa_products")
          .select("*")
          .eq("site_id", siteId);

        if (prodFetchErr || !dbProducts) {
          throw new Error(
            `Failed to fetch products for site ${siteId}: ${prodFetchErr?.message ?? "null"}`,
          );
        }

        // ── 6. Assemble SiteData from DB ─────────────────────────────────
        // Build a map of category_id → first product ASIN for category_slug assignment
        const { data: catProducts } = await supabase
          .from("category_products")
          .select("category_id, product_id, position")
          .in(
            "category_id",
            dbCategories.map((c) => c.id),
          )
          .order("position");

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
          headingFont?: string;
          bodyFont?: string;
          fontFamily?: string; // @deprecated — kept for backward compat with existing DB rows
          logoUrl?: string;
          faviconDir?: string;
        } | null;

        const siteData = {
          site: {
            name: site.name as string,
            domain: (site.domain ?? `${slugify(site.name as string)}.example.com`) as string,
            market: (site.market ?? "US") as string,
            language: (site.language ?? "en") as string,
            currency: (site.currency ?? "USD") as string,
            affiliate_tag: (site.affiliate_tag ?? "default-20") as string,
            template_slug: site.template_slug as string,
            customization: {
              primaryColor: customization?.primaryColor ?? "#4f46e5",
              accentColor: customization?.accentColor ?? "#7c3aed",
              headingFont: customization?.headingFont,
              bodyFont: customization?.bodyFont,
              fontFamily: customization?.fontFamily, // @deprecated — kept for backward compat with existing DB rows
              // logoUrl in site.json must be the static path in dist/ — not the admin upload path.
              // The file is copied to dist/logo.webp in step 5b, so we use '/logo.webp' here.
              logoUrl: customization?.logoUrl ? "/logo.webp" : undefined,
              faviconDir: customization?.faviconDir,
            },
            focus_keyword: (site.focus_keyword ?? null) as string | null,
            homepage_seo_text: (site.homepage_seo_text ?? null) as string | null,
            homepage_meta_description: ((site as Record<string, unknown>)
              .homepage_meta_description ?? null) as string | null,
            homepage_intro: ((site as Record<string, unknown>).homepage_intro ?? null) as
              | string
              | null,
            company_name: (site.company_name ?? site.name) as string,
            contact_email: (site.contact_email ??
              `contact@${site.domain ?? "example.com"}`) as string,
            id: siteId,
            supabase_url: (() => {
              const val = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
              if (!val)
                console.warn(
                  "[GenerateSiteJob] NEXT_PUBLIC_SUPABASE_URL is not set — analytics tracker will fail silently",
                );
              return val;
            })(),
            supabase_anon_key: (() => {
              const val = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
              if (!val)
                console.warn(
                  "[GenerateSiteJob] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — analytics tracker will fail silently",
                );
              return val;
            })(),
          },
          categories: dbCategories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            seo_text: cat.seo_text ?? "",
            category_image: cat.category_image ?? null,
            keywords: (cat.keywords as string[]) ?? [],
            focus_keyword: cat.focus_keyword ?? null,
            description: cat.description ?? null,
            meta_description: cat.meta_description ?? null,
          })),
          products: dbProducts
            .filter((p) => productCategorySlug.has(p.id))
            .map((p) => ({
              id: p.id,
              asin: p.asin,
              title: p.title,
              slug: p.slug,
              current_price: p.current_price ?? 0,
              original_price: p.original_price ?? null,
              images: (p.images as string[]) ?? [],
              rating: p.rating ?? 0,
              is_prime: p.is_prime ?? false,
              detailed_description: p.detailed_description ?? null,
              pros_cons: (p.pros_cons as { pros: string[]; cons: string[] } | null) ?? null,
              category_slug: productCategorySlug.get(p.id) ?? "",
              focus_keyword: p.focus_keyword ?? null,
              user_opinions_summary: p.user_opinions_summary ?? null,
              meta_description: p.meta_description ?? null,
              optimized_title: p.optimized_title ?? null,
            })),
        };

        // ── Fetch legal template assignments ──────────────────────────────
        // legal_template_assignments is not yet in generated Supabase types,
        // so we query via two typed-as-unknown raw fetches to avoid unsafe casts.
        let legalTemplates: {
          privacy?: string | null;
          terms?: string | null;
          cookies?: string | null;
          contact?: string | null;
        } = {};

        try {
          const { data: assignments, error: assignErr } = await (
            supabase as unknown as {
              from: (table: string) => {
                select: (cols: string) => {
                  eq: (
                    col: string,
                    val: string,
                  ) => Promise<{
                    data: Array<{
                      template_type: string;
                      template_id: string;
                    }> | null;
                    error: unknown;
                  }>;
                };
              };
            }
          )
            .from("legal_template_assignments")
            .select("template_type, template_id")
            .eq("site_id", siteId);

          if (assignErr) throw assignErr;

          if (assignments && assignments.length > 0) {
            const templateIds = assignments.map((a) => a.template_id);

            const { data: templates, error: tplErr } = await (
              supabase as unknown as {
                from: (table: string) => {
                  select: (cols: string) => {
                    in: (
                      col: string,
                      vals: string[],
                    ) => Promise<{
                      data: Array<{ id: string; content: string }> | null;
                      error: unknown;
                    }>;
                  };
                };
              }
            )
              .from("legal_templates")
              .select("id, content")
              .in("id", templateIds);

            if (tplErr) throw tplErr;

            const templateMap = new Map((templates ?? []).map((t) => [t.id, t.content]));

            for (const a of assignments) {
              const type = a.template_type as "privacy" | "terms" | "cookies" | "contact";
              const content = templateMap.get(a.template_id) ?? null;
              if (type && content) legalTemplates[type] = content;
            }
          }
        } catch (e) {
          console.warn("[GenerateSiteJob] legal templates fetch failed (non-fatal):", e);
        }

        // Add legalTemplates to siteData
        (
          siteData as typeof siteData & {
            legalTemplates: typeof legalTemplates;
          }
        ).legalTemplates = legalTemplates;

        // ── 4. Write site.json to apps/generator/src/data/<slug>/ ─────────
        const dataDir = join(GENERATOR_ROOT, "src", "data", slug);
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(join(dataDir, "site.json"), JSON.stringify(siteData, null, 2), "utf-8");
        console.log(
          `[GenerateSiteJob] Wrote site.json to ${dataDir} (${siteData.categories.length} categories, ${siteData.products.length} products)`,
        );

        // ── 5. Run Astro build programmatically ───────────────────────────
        await supabase
          .from("ai_jobs")
          .update({ payload: { phase: "build", done: 0, total: 1 } })
          .eq("bull_job_id", job.id ?? "");

        console.log(`[GenerateSiteJob] build: starting Astro build for slug "${slug}"`);
        process.env.SITE_SLUG = slug;

        const prevCwd = process.cwd();
        process.chdir(GENERATOR_ROOT);
        try {
          const { build } = await import("astro");
          await build({ root: GENERATOR_ROOT });
        } finally {
          process.chdir(prevCwd);
        }

        console.log(`[GenerateSiteJob] Astro build complete for "${slug}"`);

        // ── 5b. Copy logo and favicon assets into dist/ ───────────────────
        const distDir = join(GENERATOR_ROOT, ".generated-sites", slug, "dist");
        const adminPublicRoot = resolve(__dirname, "../../../apps/admin/public");
        // Use the original upload path from DB (customization?.logoUrl), NOT siteData.site.customization.logoUrl
        // which has already been rewritten to '/logo.webp' (the static dest path).
        const logoSrc = customization?.logoUrl;
        const faviconSrc = customization?.faviconDir;

        if (logoSrc) {
          const srcPath = join(adminPublicRoot, logoSrc);
          const destPath = join(distDir, "logo.webp");
          if (existsSync(srcPath)) {
            copyFileSync(srcPath, destPath);
            console.log(`[GenerateSiteJob] Copied logo → dist/logo.webp`);
          } else {
            console.warn(`[GenerateSiteJob] logo source not found: ${srcPath} — skipping`);
          }
        }

        if (faviconSrc) {
          const srcDir = join(adminPublicRoot, faviconSrc);
          if (existsSync(srcDir)) {
            cpSync(srcDir, distDir, { recursive: true });
            console.log(`[GenerateSiteJob] Copied favicon dir → dist/`);
          } else {
            console.warn(`[GenerateSiteJob] favicon source dir not found: ${srcDir} — skipping`);
          }
        }

        // ── 5c. Copy custom category images (admin-uploaded) → dist/ ─────
        for (const cat of siteData.categories) {
          const img = cat.category_image;
          if (img && img.startsWith("/uploads/sites/")) {
            const srcPath = join(adminPublicRoot, img);
            const destPath = join(distDir, img);
            if (existsSync(srcPath)) {
              mkdirSync(dirname(destPath), { recursive: true });
              copyFileSync(srcPath, destPath);
              console.log(`[GenerateSiteJob] Copied category image → dist${img}`);
            } else {
              console.warn(
                `[GenerateSiteJob] category image source not found: ${srcPath} — skipping`,
              );
            }
          }
        }

        // ── 6. Score pages ────────────────────────────────────────────────
        await supabase
          .from("ai_jobs")
          .update({ payload: { phase: "score_pages", done: 0, total: 0 } })
          .eq("bull_job_id", job.id ?? "");

        // Build focus keyword map from siteData (assembled above)
        const keywordMap = new Map<string, string>();
        keywordMap.set("/", siteData.site.focus_keyword ?? "");
        for (const cat of siteData.categories) {
          keywordMap.set(`/categories/${cat.slug}/`, cat.focus_keyword ?? "");
        }
        for (const prod of siteData.products) {
          keywordMap.set(`/products/${prod.slug}/`, prod.focus_keyword ?? "");
        }

        const { glob } = await import("node:fs/promises");
        const allHtmlFiles: string[] = [];
        for await (const f of glob("**/*.html", { cwd: distDir })) {
          allHtmlFiles.push(f);
        }
        // Filter out redirect stubs (/go/) and legal pages — they score poorly by design
        const htmlFiles = allHtmlFiles.filter(
          (f) => !f.startsWith("go/") && inferPageType(f) !== "legal",
        );
        const total = htmlFiles.length;
        console.log(
          `[GenerateSiteJob] score_pages: ${total} pages to score (${allHtmlFiles.length - total} skipped)`,
        );

        const scoreRows: TablesInsert<"seo_scores">[] = [];
        let done = 0;
        for (const relPath of htmlFiles) {
          try {
            const absPath = join(distDir, relPath);
            const html = readFileSync(absPath, "utf-8");
            const pageType = inferPageType(relPath);
            const pagePath = filePathToPagePath(relPath);
            const focusKeyword = keywordMap.get(pagePath) ?? "";
            const score = scorePage(html, focusKeyword, pageType, siteData.site.language);
            console.log(
              `[GenerateSiteJob] score_pages: ${pagePath} → ${score.overall} (${score.grade})`,
            );
            scoreRows.push({
              site_id: site.id,
              page_path: pagePath,
              page_type: pageType,
              overall_score: score.overall,
              grade: score.grade,
              content_quality_score: score.content_quality,
              meta_elements_score: score.meta_elements,
              structure_score: score.structure,
              links_score: score.links,
              media_score: score.media,
              schema_score: score.schema,
              technical_score: score.technical,
              social_score: score.social,
              suggestions: score.suggestions ?? [],
            });
            done++;
            await supabase
              .from("ai_jobs")
              .update({ payload: { phase: "score_pages", done, total } })
              .eq("bull_job_id", job.id ?? "");
          } catch (err) {
            console.error(`[GenerateSiteJob] score_pages: error scoring ${relPath}:`, err);
          }
        }

        if (scoreRows.length > 0) {
          const { error: upsertError } = await supabase
            .from("seo_scores")
            .upsert(scoreRows, { onConflict: "site_id,page_path" });
          if (upsertError) {
            console.error("[GenerateSiteJob] score_pages: upsert error:", upsertError.message);
          } else {
            console.log(
              `[GenerateSiteJob] score_pages: ${scoreRows.length}/${total} pages scored and persisted`,
            );
          }
        }

        // ── 7.5. SEO files phase ─────────────────────────────────────────
        // Write sitemap.xml, robots.txt, llm.txt, and IndexNow key file to dist/
        // Non-fatal: log warning and continue to deploy if writing fails.
        try {
          await supabase
            .from("ai_jobs")
            .update({ payload: { phase: "seo_files", done: 0, total: 1 } })
            .eq("bull_job_id", job.id ?? "");

          // Collect page URLs from the already-built dist HTML files
          const { glob } = await import("node:fs/promises");
          const pageUrls: string[] = [];
          for await (const f of glob("**/*.html", { cwd: distDir })) {
            const relPath = f.replace(/\\/g, "/");
            if (relPath === "index.html") {
              pageUrls.push("/");
            } else {
              // Convert 'categories/air-fryers/index.html' → '/categories/air-fryers/'
              const url = "/" + relPath.replace(/\/index\.html$/, "/").replace(/index\.html$/, "");
              pageUrls.push(url);
            }
          }

          writeSeoFiles(
            distDir,
            {
              domain: site.domain ?? `${slug}.example.com`,
              name: site.name as string,
              niche: (site.niche ?? site.name) as string,
              language: (site.language ?? "en") as string,
            },
            pageUrls,
          );

          await supabase
            .from("ai_jobs")
            .update({ payload: { phase: "seo_files", done: 1, total: 1 } })
            .eq("bull_job_id", job.id ?? "");
        } catch (seoErr) {
          console.warn(`[GenerateSiteJob] seo_files: non-fatal error writing SEO files:`, seoErr);
        }

        // ── 8. Transition site status + optional auto-deploy ─────────────
        if (autoDeployAfterGenerate) {
          // Automated refresh path (live → generating → deploy → live)
          // runDeployPhase handles the generating → deploying → live transitions internally.
          console.log(
            `[GenerateSiteJob] auto-deploy: site was "${previousStatus}", running deploy phase`,
          );
          await runDeployPhase(siteId, site, job.id, supabase);
        } else {
          // First-deploy path (draft/error → generating → generated)
          // User triggers deploy manually from the admin panel.
          await supabase
            .from("sites")
            .update({
              status: "generated",
              updated_at: new Date().toISOString(),
            })
            .eq("id", siteId);
          console.log(`[GenerateSiteJob] site ${siteId}: → generated (awaiting manual deploy)`);
        }

        // ── 9. Mark ai_jobs 'completed' ───────────────────────────────────
        await supabase
          .from("ai_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("bull_job_id", job.id ?? "");

        console.log(`[GenerateSiteJob] Job ${job.id} completed`);
      },
      { connection, lockDuration: 300000 },
    );

    worker.on("failed", async (job, err) => {
      console.error(`[GenerateSiteJob] Job ${job?.id} failed: ${err.message}`);
      if (!job?.id) return;

      const supabase = createServiceClient();
      await supabase
        .from("ai_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: err.message,
        })
        .eq("bull_job_id", job.id);
    });

    return worker;
  }
}
