import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { CategoryForm } from "../../CategoryForm";
import { updateCategory } from "../../actions";
import { CategoryImagePicker } from "../CategoryImagePicker";

interface PageProps {
  params: Promise<{ id: string; catId: string }>;
}

export default async function EditCategoryPage({ params }: PageProps) {
  const { id: siteId, catId } = await params;
  const supabase = createServiceClient();

  const [siteResult, catResult, productsResult] = await Promise.all([
    supabase.from("sites").select("id, name").eq("id", siteId).single(),
    supabase.from("tsa_categories").select("*").eq("id", catId).eq("site_id", siteId).single(),
    supabase
      .from("tsa_products")
      .select("id, asin, title, images, source_image_url, category_products!inner(category_id)")
      .eq("site_id", siteId)
      .eq("category_products.category_id", catId)
      .limit(30),
  ]);

  if (!siteResult.data || !catResult.data) notFound();

  const cat = catResult.data;

  // Strip join metadata — category_products is only used for scoping the query
  const products = (productsResult.data ?? []).map(({ category_products: _cp, ...p }) => p);

  const action = updateCategory.bind(null, siteId, catId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${siteId}/categories/${catId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {cat.name}
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <CategoryForm
          siteId={siteId}
          categoryId={catId}
          action={action}
          mode="edit"
          defaultValues={{
            name: cat.name,
            slug: cat.slug,
            description: cat.description ?? undefined,
            meta_description: cat.description ?? null,
            seo_text: cat.seo_text ?? undefined,
            focus_keyword: cat.focus_keyword ?? undefined,
            keywords: cat.keywords,
          }}
        />
      </div>

      <CategoryImagePicker
        siteId={siteId}
        categoryId={catId}
        currentImage={cat.category_image ?? null}
        products={products}
      />
    </div>
  );
}
