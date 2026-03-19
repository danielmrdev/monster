import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { CategoryProductsSection } from './CategoryProductsSection'
import { GenerateCategorySeoButton } from './GenerateCategorySeoButton'
import SeoJobStatus from '../../SeoJobStatus'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string; catId: string }>
}

export default async function CategoryDetailPage({ params }: PageProps) {
  const { id: siteId, catId } = await params
  const supabase = createServiceClient()

  // Fetch category — 404 if not found or not owned by this site
  const { data: category, error: catError } = await supabase
    .from('tsa_categories')
    .select('id, name, slug, description')
    .eq('id', catId)
    .eq('site_id', siteId)
    .single()

  if (catError || !category) {
    notFound()
  }

  // Fetch initial products scoped to this category via !inner join
  // category_products join metadata stripped before passing to client component
  const { data: rawProducts, count } = await supabase
    .from('tsa_products')
    .select(
      'id, asin, title, current_price, rating, review_count, is_prime, source_image_url, images, category_products!inner(category_id)',
      { count: 'exact' }
    )
    .eq('site_id', siteId)
    .eq('category_products.category_id', catId)
    .order('created_at', { ascending: false })
    .range(0, 24)

  const initialTotal = count ?? 0
  // Strip join metadata — category_products is internal and not part of the Product shape
  const initialProducts = (rawProducts ?? []).map(({ category_products: _cp, ...p }) => p)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/sites"
          className="hover:text-foreground transition-colors"
        >
          Sites
        </Link>
        <span>/</span>
        <Link
          href={`/sites/${siteId}`}
          className="hover:text-foreground transition-colors"
        >
          Site
        </Link>
        <span>/</span>
        <span className="text-foreground">{category.name}</span>
      </div>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{category.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">/{category.slug}</p>
            {category.description && (
              <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/sites/${siteId}/categories/${catId}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Edit Category
            </Link>
            <GenerateCategorySeoButton siteId={siteId} categoryId={catId} />
          </div>
        </div>
        <SeoJobStatus siteId={siteId} jobType="seo_category" entityId={catId} />
      </div>

      {/* Products */}
      <CategoryProductsSection
        siteId={siteId}
        catId={catId}
        initialProducts={initialProducts}
        initialTotal={initialTotal}
      />
    </div>
  )
}
