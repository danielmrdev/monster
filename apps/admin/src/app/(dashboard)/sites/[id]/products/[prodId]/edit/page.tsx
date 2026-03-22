import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { ProductForm } from "../../ProductForm";
import { ProductSeoPanel } from "../../ProductSeoPanel";
import { updateProduct } from "../../actions";

interface PageProps {
  params: Promise<{ id: string; prodId: string }>;
  searchParams: Promise<{ from?: string; catId?: string }>;
}

export default async function EditProductPage({ params, searchParams }: PageProps) {
  const { id: siteId, prodId } = await params;
  const { from, catId: fromCatId } = await searchParams;
  const supabase = createServiceClient();

  const [siteResult, productResult, categoriesResult, linkResult, seoScoreResult] =
    await Promise.all([
      supabase.from("sites").select("id, name").eq("id", siteId).single(),
      supabase
        .from("tsa_products")
        .select("*, detailed_description, pros_cons, user_opinions_summary, meta_description")
        .eq("id", prodId)
        .eq("site_id", siteId)
        .single(),
      supabase
        .from("tsa_categories")
        .select("id, name, slug")
        .eq("site_id", siteId)
        .order("name", { ascending: true }),
      supabase.from("category_products").select("category_id").eq("product_id", prodId),
      // Fetch the product SEO score from seo_scores using the product's slug
      supabase.from("tsa_products").select("slug").eq("id", prodId).eq("site_id", siteId).single(),
    ]);

  if (!siteResult.data || !productResult.data) notFound();

  const site = siteResult.data;
  const product = productResult.data;
  const categoryIds = (linkResult.data ?? []).map((r) => r.category_id);

  // Fetch seo_scores for this product page path
  const productSlug = seoScoreResult.data?.slug ?? product.slug;
  let seoScore: {
    content_quality_score: number | null;
    overall_score: number | null;
  } | null = null;
  if (productSlug) {
    const { data: scoreRow } = await supabase
      .from("seo_scores")
      .select("content_quality_score, overall_score")
      .eq("site_id", siteId)
      .eq("page_path", `/products/${productSlug}/`)
      .maybeSingle();
    seoScore = scoreRow ?? null;
  }

  // Deserialize pros_cons JSONB → newline-joined strings for textarea defaultValues
  const prosCons = product.pros_cons as {
    pros?: string[];
    cons?: string[];
  } | null;
  const prosText = (prosCons?.pros ?? []).join("\n");
  const consText = (prosCons?.cons ?? []).join("\n");

  const action = updateProduct.bind(null, siteId, prodId);

  // Build returnTo URL for the form (preserves category context)
  const returnTo = from === "category" && fromCatId
    ? `/sites/${siteId}/products/${prodId}?from=category&catId=${fromCatId}`
    : `/sites/${siteId}/products/${prodId}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${siteId}/products/${prodId}${from === "category" && fromCatId ? `?from=category&catId=${fromCatId}` : ""}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {product.title ?? product.asin}
        </Link>
      </div>

      {/* SEO Generation panel — above the form, always visible in edit mode */}
      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          SEO Content
          {seoScore?.content_quality_score != null && (
            <span className="ml-2 font-normal normal-case text-foreground/60">
              content quality: {seoScore.content_quality_score}/100
            </span>
          )}
        </h2>
        <ProductSeoPanel
          siteId={siteId}
          productId={prodId}
          currentScore={seoScore?.content_quality_score ?? null}
          currentContent={{
            focus_keyword: product.focus_keyword,
            meta_description: product.meta_description,
            detailed_description: product.detailed_description,
          }}
        />
      </div>

      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <ProductForm
          siteId={siteId}
          productId={prodId}
          categories={categoriesResult.data ?? []}
          action={action}
          mode="edit"
          returnTo={returnTo}
          defaultValues={{
            asin: product.asin,
            title: product.title,
            slug: product.slug,
            current_price: product.current_price,
            rating: product.rating,
            review_count: product.review_count,
            is_prime: product.is_prime,
            source_image_url: product.source_image_url,
            focus_keyword: product.focus_keyword,
            category_ids: categoryIds,
            detailed_description: product.detailed_description,
            pros: prosText,
            cons: consText,
            user_opinions_summary: product.user_opinions_summary,
            meta_description: product.meta_description,
          }}
        />
      </div>
    </div>
  );
}
