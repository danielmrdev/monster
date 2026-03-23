import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createServiceClient } from "@/lib/supabase/service";
import { ProductSeoPanel } from "../ProductSeoPanel";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { DeleteProductButton } from "../DeleteProductButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; prodId: string }>;
  searchParams: Promise<{ from?: string; catId?: string }>;
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const { id: siteId, prodId } = await params;
  const { from, catId: fromCatId } = await searchParams;
  const supabase = createServiceClient();

  const [{ data: site }, { data: product, error: prodError }] = await Promise.all([
    supabase.from("sites").select("id, name").eq("id", siteId).single(),
    supabase
      .from("tsa_products")
      .select(
        "id, asin, slug, title, current_price, rating, review_count, is_prime, source_image_url, images, focus_keyword, meta_description, detailed_description, pros_cons, user_opinions_summary, manually_edited_fields",
      )
      .eq("id", prodId)
      .eq("site_id", siteId)
      .single(),
  ]);

  if (!site || prodError || !product) {
    notFound();
  }

  // Fetch product SEO score
  let seoScore: { content_quality_score: number | null; overall_score: number | null } | null =
    null;
  if (product.slug) {
    const { data: scoreRow } = await supabase
      .from("seo_scores")
      .select("content_quality_score, overall_score")
      .eq("site_id", siteId)
      .eq("page_path", `/products/${product.slug}/`)
      .maybeSingle();
    seoScore = scoreRow ?? null;
  }

  // Fetch categories for this product
  const { data: categoryLinks } = await supabase
    .from("category_products")
    .select("category_id, tsa_categories(id, name, slug)")
    .eq("product_id", prodId);

  const categories = (categoryLinks ?? [])
    .map((link) => {
      const cat = link.tsa_categories as unknown as {
        id: string;
        name: string;
        slug: string;
      } | null;
      return cat;
    })
    .filter(Boolean) as { id: string; name: string; slug: string }[];

  const imageUrl =
    product.source_image_url ??
    (product.images && (product.images as string[]).length > 0
      ? (product.images as string[])[0]
      : null);

  const prosCons = product.pros_cons as { pros?: string[]; cons?: string[] } | null;
  const editedFields = new Set<string>((product.manually_edited_fields as string[]) ?? []);

  // Determine back navigation: category detail (if from=category) or site products tab
  const fromCategory =
    from === "category" && fromCatId ? (categories.find((c) => c.id === fromCatId) ?? null) : null;
  const backHref = fromCategory
    ? `/sites/${siteId}/categories/${fromCategory.id}`
    : `/sites/${siteId}#products`;
  const backLabel = fromCategory ? fromCategory.name : site.name;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={backHref}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            ← {backLabel}
          </Link>
          <span className="font-mono text-sm text-muted-foreground shrink-0">{product.asin}</span>
          {seoScore?.overall_score != null && (
            <span className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-0.5 border border-border shrink-0">
              SEO {seoScore.overall_score}/100
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/sites/${siteId}/products/${prodId}/edit${fromCategory ? `?from=category&catId=${fromCategory.id}` : ""}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Edit Product
          </Link>
          <DeleteProductButton siteId={siteId} productId={prodId} asin={product.asin} />
        </div>
      </div>

      {/* Product info card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex gap-5">
          {/* Image */}
          {imageUrl && (
            <div className="shrink-0 w-24 h-24 rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
              <Image
                src={imageUrl}
                alt={product.title ?? product.asin}
                width={96}
                height={96}
                className="object-contain w-full h-full"
                unoptimized
              />
            </div>
          )}

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2">
            {product.title && (
              <h2 className="text-sm font-semibold text-foreground">{product.title}</h2>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {product.current_price != null && (
                <span className="text-sm font-medium text-foreground">
                  {product.current_price.toFixed(2)}
                </span>
              )}
              {product.is_prime && (
                <span className="text-xs text-blue-400 font-semibold">Prime</span>
              )}
              {product.rating != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400 text-xs">
                    {"★".repeat(Math.floor(Math.max(0, Math.min(5, product.rating))))}
                    {"☆".repeat(5 - Math.floor(Math.max(0, Math.min(5, product.rating))))}
                  </span>
                  <span className="text-xs text-muted-foreground">{product.rating}</span>
                  {product.review_count != null && (
                    <span className="text-xs text-muted-foreground/60">
                      ({product.review_count.toLocaleString()} reviews)
                    </span>
                  )}
                </div>
              )}
            </div>
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/sites/${siteId}/categories/${cat.id}`}
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted/40 text-muted-foreground border border-border hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SEO Content */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          Product SEO
          {seoScore?.content_quality_score != null && (
            <span className="ml-2 font-normal text-foreground/60">
              content quality: {seoScore.content_quality_score}/100
            </span>
          )}
        </h2>
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
            <dd className="mt-1 text-sm text-foreground">{product.focus_keyword ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              Meta Description
              {editedFields.has("meta_description") && (
                <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                  manually edited
                </span>
              )}
            </dt>
            <dd className="mt-1 text-sm text-foreground">{product.meta_description ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              Detailed Description
              {editedFields.has("detailed_description") && (
                <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                  manually edited
                </span>
              )}
            </dt>
            <dd className="mt-2">
              <MarkdownPreview content={product.detailed_description} />
            </dd>
          </div>
          {prosCons?.pros && prosCons.pros.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                Pros
                {editedFields.has("pros_cons") && (
                  <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                    manually edited
                  </span>
                )}
              </dt>
              <dd className="mt-1 space-y-0.5">
                {prosCons.pros.map((pro, i) => (
                  <p key={i} className="text-sm text-foreground">
                    + {pro}
                  </p>
                ))}
              </dd>
            </div>
          )}
          {prosCons?.cons && prosCons.cons.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                Cons
                {editedFields.has("pros_cons") && !prosCons?.pros?.length && (
                  <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                    manually edited
                  </span>
                )}
              </dt>
              <dd className="mt-1 space-y-0.5">
                {prosCons.cons.map((con, i) => (
                  <p key={i} className="text-sm text-foreground">
                    − {con}
                  </p>
                ))}
              </dd>
            </div>
          )}
          {product.user_opinions_summary && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                User Opinions Summary
                {editedFields.has("user_opinions_summary") && (
                  <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                    manually edited
                  </span>
                )}
              </dt>
              <dd className="mt-1 text-sm text-foreground">{product.user_opinions_summary}</dd>
            </div>
          )}
        </dl>

        <ProductSeoPanel
          siteId={siteId}
          productId={prodId}
          currentContent={{
            focus_keyword: product.focus_keyword,
            meta_description: product.meta_description,
            detailed_description: product.detailed_description,
          }}
          currentScore={seoScore?.content_quality_score ?? null}
        />
      </div>
    </div>
  );
}
