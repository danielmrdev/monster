import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { CategoryForm } from '../../CategoryForm'
import { updateCategory } from '../../actions'

interface PageProps {
  params: Promise<{ id: string; catId: string }>
}

export default async function EditCategoryPage({ params }: PageProps) {
  const { id: siteId, catId } = await params
  const supabase = createServiceClient()

  const [siteResult, catResult] = await Promise.all([
    supabase.from('sites').select('id, name').eq('id', siteId).single(),
    supabase.from('tsa_categories').select('*').eq('id', catId).eq('site_id', siteId).single(),
  ])

  if (!siteResult.data || !catResult.data) notFound()

  const site = siteResult.data
  const cat = catResult.data

  const action = updateCategory.bind(null, siteId, catId)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${siteId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {site.name}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit Category</h1>
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
    </div>
  )
}
