"use server";

/**
 * Rescore all pages for a site from the existing dist/ without regenerating.
 * Reads HTML files from .generated-sites/<slug>/dist/, scores each one,
 * and upserts into seo_scores. Fast (~seconds) — no BullMQ needed.
 *
 * Returns { scored, total, error? }
 */

// Build keyword map from DB

// Glob HTML files from dist
// Skip unreadable pages silently — individual errors shouldn't abort the whole rescore

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { scorePage } from "@monster/seo-scorer";
import type { PageType } from "@monster/seo-scorer";

const GENERATOR_ROOT = resolve(process.cwd(), "..", "generator");

function inferPageType(filePath: string): PageType {
  const rel = filePath.replace(/\\/g, "/");
  if (rel === "index.html") return "homepage";
  if (rel.startsWith("categories/")) return "category";
  if (rel.startsWith("products/")) return "product";
  return "legal";
}

function filePathToPagePath(filePath: string): string {
  let p = filePath.replace(/\\/g, "/");
  p = p.replace(/index\.html$/, "").replace(/\.html$/, "/");
  if (!p.startsWith("/")) p = "/" + p;
  return p || "/";
}
export async function rescoreSite(
  siteId: string,
): Promise<{ scored: number; total: number; error?: string }> {
  const supabase = createServiceClient();

  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("domain, focus_keyword, language")
    .eq("id", siteId)
    .single();

  if (siteErr || !site) {
    return { scored: 0, total: 0, error: "Site not found" };
  }

  const slug = site.domain ? site.domain.replace(/\./g, "-") : null;
  const siteLanguage = site.language ?? "en";
  if (!slug) {
    return { scored: 0, total: 0, error: "Site has no domain set" };
  }

  const distDir = join(GENERATOR_ROOT, ".generated-sites", slug, "dist");
  if (!existsSync(distDir)) {
    return {
      scored: 0,
      total: 0,
      error: "No generated site found — generate the site first",
    };
  }
  const keywordMap = new Map<string, string>();
  keywordMap.set("/", site.focus_keyword ?? "");

  const { data: cats } = await supabase
    .from("tsa_categories")
    .select("slug, focus_keyword")
    .eq("site_id", siteId);
  for (const cat of cats ?? []) {
    keywordMap.set(`/categories/${cat.slug}/`, cat.focus_keyword ?? "");
  }

  const { data: prods } = await supabase
    .from("tsa_products")
    .select("slug, focus_keyword")
    .eq("site_id", siteId);
  for (const prod of prods ?? []) {
    keywordMap.set(`/products/${prod.slug}/`, prod.focus_keyword ?? "");
  }
  const { glob } = await import("node:fs/promises");
  const htmlFiles: string[] = [];
  for await (const f of glob("**/*.html", { cwd: distDir })) {
    htmlFiles.push(f);
  }
  const total = htmlFiles.length;

  type ScoreRow = {
    site_id: string;
    page_path: string;
    page_type: string;
    overall_score: number;
    grade: string;
    content_quality_score: number;
    meta_elements_score: number;
    structure_score: number;
    links_score: number;
    media_score: number;
    schema_score: number;
    technical_score: number;
    social_score: number;
    suggestions: string[];
  };

  const scoreRows: ScoreRow[] = [];
  for (const relPath of htmlFiles) {
    if (relPath.startsWith("go/") || inferPageType(relPath) === "legal") continue;
    try {
      const absPath = join(distDir, relPath);
      const html = readFileSync(absPath, "utf-8");
      const pageType = inferPageType(relPath);
      const pagePath = filePathToPagePath(relPath);
      const focusKeyword = keywordMap.get(pagePath) ?? "";
      const score = scorePage(html, focusKeyword, pageType, siteLanguage);
      scoreRows.push({
        site_id: siteId,
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
    } catch {}
  }

  if (scoreRows.length === 0) {
    return { scored: 0, total, error: "No scoreable pages found in dist" };
  }

  // Delete stale scores for pages no longer in the current build.
  // This handles deleted categories/products — their rows would otherwise
  // persist indefinitely since upsert only overwrites existing matches.
  const currentPaths = scoreRows.map((r) => r.page_path);
  const { error: deleteErr } = await supabase
    .from("seo_scores")
    .delete()
    .eq("site_id", siteId)
    .not("page_path", "in", `(${currentPaths.map((p) => `"${p}"`).join(",")})`);

  if (deleteErr) {
    console.warn("[rescoreSite] Failed to delete stale scores:", deleteErr.message);
    // Non-fatal — proceed with upsert
  }

  const { error: upsertErr } = await supabase
    .from("seo_scores")
    .upsert(scoreRows, { onConflict: "site_id,page_path" });

  if (upsertErr) {
    return { scored: 0, total, error: upsertErr.message };
  }

  return { scored: scoreRows.length, total };
}
