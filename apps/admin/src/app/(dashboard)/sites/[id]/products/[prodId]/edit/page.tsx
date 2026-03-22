import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { ProductForm } from "../../ProductForm";

import { updateProduct } from "../../actions";

interface PageProps {
  params: Promise<{ id: string; prodId: string }>;
  searchParams: Promise<{ from?: string; catId?: string }>;
}

export default async function EditProductPage({ params, searchParams }: PageProps) {
  const { id: siteId, prodId } = await params;
  const { from, catId: fromCatId } = await searchParams;
  const supabase = createServiceClient();

  const [productResult, categoriesResult, linkResult] = await Promise.all([
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
  ]);

  if (!productResult.data) notFound();

  const product = productResult.data;
  const categoryIds = (linkResult.data ?? []).map((r) => r.category_id);

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
