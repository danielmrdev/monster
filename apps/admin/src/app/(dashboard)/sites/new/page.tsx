import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { SiteForm } from './site-form'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ niche?: string; market?: string }>
}

export default async function NewSitePage({ searchParams }: PageProps) {
  const { niche, market } = await searchParams
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any
  const { data: rawTemplates } = await anySupabase
    .from('site_templates')
    .select('slug, name')
    .order('slug')

  const siteTemplates = (rawTemplates ?? []).map((t: { slug: string; name: string }) => ({ value: t.slug, label: t.name }))

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/sites"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Sites
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold tracking-tight">New Site</h1>
      </div>
      <SiteForm defaultValues={{ niche, market }} templates={siteTemplates} />
    </div>
  )
}
