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
      .select("id, name, slug, description, focus_keyword, seo_text, manually_edited_fields")
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

  // Fetch initial products scoped to this category via !inner join, ordered by position ASC
  // category_products join metadata stripped before passing to client component
  const { data: rawProducts, count } = await supabase
    .from("tsa_products")
    .select(
      "id, asin, slug, title, optimized_title, current_price, rating, review_count, is_prime, source_image_url, images, category_products!inner(category_id, position)",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .eq("category_products.category_id", catId)
    .order("position", { foreignTable: "category_products" })
    .range(0, 24);

  const initialTotal = count ?? 0;
  // Strip join metadata — expose position as top-level field for reorder UI
  const initialProducts = (rawProducts ?? []).map(({ category_products, ...p }) => ({
    ...p,
    position: Array.isArray(category_products) ? (category_products[0]?.position ?? null) : null,
  }));

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
        {(() => {
          const editedFields = new Set<string>((category.manually_edited_fields as string[]) ?? []);
          return (
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  Focus Keyword
                  {editedFields.has("focus_keyword") && (
                    <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                      manually edited
                    </span>
                  )}
                </dt>
                <dd className="mt-1 text-sm text-foreground">{category.focus_keyword ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  Description
                  {editedFields.has("description") && (
                    <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                      manually edited
                    </span>
                  )}
                </dt>
                <dd className="mt-1 text-sm text-foreground">{category.description ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  SEO Text
                  {editedFields.has("seo_text") && (
                    <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                      manually edited
                    </span>
                  )}
                </dt>
                <dd className="mt-2">
                  <MarkdownPreview content={category.seo_text} />
                </dd>
              </div>
            </dl>
          );
        })()}

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
