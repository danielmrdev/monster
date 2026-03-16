import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import type { SiteCustomization } from '@monster/shared'
import { EditForm } from './edit-form'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditSitePage({ params }: PageProps) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: site, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !site) {
    notFound()
  }

  const siteForForm = {
    id: site.id,
    name: site.name,
    domain: site.domain,
    niche: site.niche,
    market: site.market,
    language: site.language,
    currency: site.currency,
    affiliate_tag: site.affiliate_tag,
    template_slug: site.template_slug,
    customization: (site.customization as SiteCustomization | null),
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/sites/${site.id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {site.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold tracking-tight">Edit Site</h1>
      </div>
      <EditForm site={siteForForm} />
    </div>
  )
}
