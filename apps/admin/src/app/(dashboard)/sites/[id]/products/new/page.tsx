import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { ProductForm } from "../ProductForm";
import { ProductSearch } from "../ProductSearch";
import { createProduct } from "../actions";
import type { CachedSearch } from "../PreviousSearches";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; categoryId?: string }>;
}

export default async function NewProductPage({ params, searchParams }: PageProps) {
  const { id: siteId } = await params;
  const { mode, categoryId } = await searchParams;

  const supabase = createServiceClient();

  // Fetch site first (need market for cache query)
  const siteResult = await supabase
    .from("sites")
    .select("id, name, market")
    .eq("id", siteId)
    .single();

  if (!siteResult.data) notFound();

  const site = siteResult.data;
  const market = (site.market ?? "ES").toUpperCase();

  // Fetch categories and previous searches in parallel
  const [categoriesResult, cacheResult] = await Promise.all([
    supabase
      .from("tsa_categories")
      .select("id, name, slug")
      .eq("site_id", siteId)
      .order("name", { ascending: true }),
    supabase
      .from("dfs_search_cache")
      .select("keyword, market, depth, results, status, created_at")
      .eq("market", market)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const categories = categoriesResult.data ?? [];
  const previousSearches: CachedSearch[] = (cacheResult.data ?? []).map((row) => ({
    keyword: row.keyword,
    market: row.market,
    depth: row.depth,
    result_count: Array.isArray(row.results) ? (row.results as unknown[]).length : 0,
    status: row.status ?? "complete",
    created_at: row.created_at,
  }));

  const action = createProduct.bind(null, siteId);
  const isManual = mode === "manual";
  const category = categoryId ? (categories.find((c) => c.id === categoryId) ?? null) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={category ? `/sites/${siteId}/categories/${category.id}` : `/sites/${siteId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; {category ? category.name : site.name}
        </Link>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/20 border border-border w-fit">
        <Link
          href={`/sites/${siteId}/products/new${categoryId ? `?categoryId=${categoryId}` : ""}`}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            !isManual
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Search
        </Link>
        <Link
          href={`/sites/${siteId}/products/new?mode=manual${
            categoryId ? `&categoryId=${categoryId}` : ""
          }`}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            isManual
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Manual (ASIN)
        </Link>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-card px-6 py-5">
        {isManual ? (
          <ProductForm siteId={siteId} categories={categories} action={action} mode="create" />
        ) : (
          <ProductSearch
            siteId={siteId}
            categories={categories}
            preselectedCategoryId={categoryId}
            market={market}
            previousSearches={previousSearches}
          />
        )}
      </div>
    </div>
  );
}
