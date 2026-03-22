import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { CategoryProductsSection } from "./CategoryProductsSection";
import { CategorySeoPanel } from "./CategorySeoPanel";
import { MarkdownPreview } from "@/components/MarkdownPreview";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; catId: string }>;
}

export default async function CategoryDetailPage({ params }: PageProps) {
  const { id: siteId, catId } = await params;
  const supabase = createServiceClient();

  // Fetch site name + category in parallel — both needed for navigation and content
  const [{ data: site }, { data: category, error: catError }] = await Promise.all([
    supabase.from("sites").select("id, name").eq("id", siteId).single(),
    supabase
      .from("tsa_categories")
      .select("id, name, slug, description, focus_keyword, seo_text")
      .eq("id", catId)
      .eq("site_id", siteId)
      .single(),
  ]);

  if (!site || catError || !category) {
    notFound();
  }

  // Fetch category SEO score (content_quality_score) for the /category/<slug> path
  const { data: seoScore } = await supabase
    .from("seo_scores")
    .select("content_quality_score")
    .eq("site_id", siteId)
    .eq("page_path", `/categories/${category.slug}/`)
    .maybeSingle();

  // Fetch initial products scoped to this category via !inner join
  // category_products join metadata stripped before passing to client component
  const { data: rawProducts, count } = await supabase
    .from("tsa_products")
    .select(
      "id, asin, slug, title, current_price, rating, review_count, is_prime, source_image_url, images, category_products!inner(category_id)",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .eq("category_products.category_id", catId)
    .order("created_at", { ascending: false })
    .range(0, 24);

  const initialTotal = count ?? 0;
  // Strip join metadata — category_products is internal and not part of the Product shape
  const initialProducts = (rawProducts ?? []).map(({ category_products: _cp, ...p }) => p);

  // Fetch SEO scores for the initial product batch (keyed by page_path = /products/<slug>/)
  const productSlugs = initialProducts.map((p) => p.slug).filter(Boolean) as string[];
  let initialProductScores: Record<string, number | null> = {};
  if (productSlugs.length > 0) {
    const paths = productSlugs.map((s) => `/products/${s}/`);
    const { data: scoreRows } = await supabase
      .from("seo_scores")
      .select("page_path, content_quality_score, overall_score")
      .eq("site_id", siteId)
      .in("page_path", paths);
    if (scoreRows) {
      for (const row of scoreRows) {
        const slug = row.page_path.replace("/products/", "").replace("/", "");
        initialProductScores[slug] = row.overall_score ?? null;
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/sites/${siteId}#categories`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            ← {site.name}
          </Link>
          <p className="text-sm text-muted-foreground font-mono shrink-0">/{category.slug}</p>
        </div>
        <Link
          href={`/sites/${siteId}/categories/${catId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors shrink-0"
        >
          Edit Category
        </Link>
      </div>

      {/* SEO Content */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Category SEO</h2>
        <dl className="space-y-4">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Focus Keyword</dt>
            <dd className="mt-1 text-sm text-foreground">{category.focus_keyword ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Description</dt>
            <dd className="mt-1 text-sm text-foreground">{category.description ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">SEO Text</dt>
            <dd className="mt-2">
              <MarkdownPreview content={category.seo_text} />
            </dd>
          </div>
        </dl>

        <CategorySeoPanel
          siteId={siteId}
          categoryId={catId}
          currentContent={{
            focus_keyword: category.focus_keyword,
            seo_text: category.seo_text,
            description: category.description,
          }}
          currentScore={seoScore?.content_quality_score ?? null}
        />
      </div>

      {/* Products */}
      <CategoryProductsSection
        siteId={siteId}
        catId={catId}
        initialProducts={initialProducts}
        initialTotal={initialTotal}
        initialProductScores={initialProductScores}
      />
    </div>
  );
}
