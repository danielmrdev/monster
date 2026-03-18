import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import type { SiteCustomization } from '@monster/shared'
import { EditForm } from './edit-form'
import { LegalTemplateAssignment } from './LegalTemplateAssignment'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditSitePage({ params }: PageProps) {
  const { id } = await params
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySupabase = supabase as any

  const { data: site, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !site) {
    notFound()
  }

  // Fetch legal templates and existing assignments for this site
  const [templatesResult, legalTemplatesResult, assignmentsResult] = await Promise.all([
    anySupabase
      .from('site_templates')
      .select('slug, name')
      .order('slug'),
    anySupabase
      .from('legal_templates')
      .select('id, title, type, language')
      .order('type', { ascending: true })
      .order('language', { ascending: true }),
    anySupabase
      .from('legal_template_assignments')
      .select('template_type, template_id')
      .eq('site_id', id),
  ])

  const siteTemplates = (templatesResult.data ?? []).map((t: { slug: string; name: string }) => ({ value: t.slug, label: t.name }))
  const templates: Array<{ id: string; title: string; type: string; language: string }> =
    legalTemplatesResult.data ?? []
  const assignments: Array<{ template_type: string; template_id: string }> =
    assignmentsResult.data ?? []

  const assignmentMap: Record<string, string> = {}
  for (const a of assignments) {
    assignmentMap[a.template_type] = a.template_id
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
    focus_keyword: site.focus_keyword,
    homepage_seo_text: site.homepage_seo_text,
    is_active: site.is_active ?? true,
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${site.id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {site.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold tracking-tight">Edit Site</h1>
      </div>
      <EditForm site={siteForForm} templates={siteTemplates} />
      <LegalTemplateAssignment
        siteId={id}
        templates={templates}
        currentAssignments={assignmentMap}
      />
    </div>
  )
}
