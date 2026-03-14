import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import type { SiteCustomization } from '@monster/shared'
import { enqueueSiteGeneration } from './actions'
import JobStatus from './JobStatus'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

function scoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400'
  if (score >= 70) return 'text-green-700'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function gradeBadgeVariant(grade: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (grade) {
    case 'A': case 'B': return 'default'
    case 'C': return 'secondary'
    case 'D': case 'F': return 'destructive'
    default: return 'outline'
  }
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SiteDetailPage({ params }: PageProps) {
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

  const { data: seoScores } = await supabase
    .from('seo_scores')
    .select('page_path, page_type, overall_score, grade, content_quality_score, meta_elements_score, structure_score, links_score, media_score, schema_score, technical_score, social_score')
    .eq('site_id', id)
    .order('page_path', { ascending: true })

  const customization = site.customization as SiteCustomization | null

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/sites"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Sites
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{site.name}</h1>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              site.status === 'active'
                ? 'bg-green-100 text-green-800'
                : site.status === 'draft'
                  ? 'bg-gray-100 text-gray-800'
                  : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {site.status ?? 'draft'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <form action={async () => {
            'use server'
            await enqueueSiteGeneration(site.id)
          }}>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              Generate Site
            </button>
          </form>
          <Link
            href={`/sites/${site.id}/edit`}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Site details card */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
        {/* Core info */}
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Site Info
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500">Domain</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.domain ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Niche</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.niche ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Market</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.market ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Language</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.language ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Currency</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.currency ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Affiliate Tag</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.affiliate_tag ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Template</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.template_slug ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Site Type</dt>
              <dd className="mt-1 text-sm text-gray-900">{site.site_type_slug ?? '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Customization */}
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Customization
          </h2>
          {customization ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <dt className="text-xs font-medium text-gray-500">Primary Color</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900">
                  {customization.primaryColor ? (
                    <>
                      <span
                        className="inline-block w-4 h-4 rounded-sm border border-gray-200"
                        style={{ backgroundColor: customization.primaryColor }}
                      />
                      {customization.primaryColor}
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Accent Color</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900">
                  {customization.accentColor ? (
                    <>
                      <span
                        className="inline-block w-4 h-4 rounded-sm border border-gray-200"
                        style={{ backgroundColor: customization.accentColor }}
                      />
                      {customization.accentColor}
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Font Family</dt>
                <dd className="mt-1 text-sm text-gray-900">{customization.fontFamily ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Logo URL</dt>
                <dd className="mt-1 text-sm text-gray-900 truncate">
                  {customization.logoUrl ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Favicon URL</dt>
                <dd className="mt-1 text-sm text-gray-900 truncate">
                  {customization.faviconUrl ?? '—'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">No customization set.</p>
          )}
        </div>

        {/* Timestamps */}
        <div className="px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Metadata
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {site.created_at
                  ? new Date(site.created_at).toLocaleString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Updated</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {site.updated_at
                  ? new Date(site.updated_at).toLocaleString()
                  : '—'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Generation status */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Site Generation
        </h2>
        <JobStatus siteId={site.id} />
      </div>

      {/* SEO Scores */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          SEO Scores
        </h2>
        {!seoScores || seoScores.length === 0 ? (
          <p className="text-sm text-gray-500">No SEO scores yet — generate the site first.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-xs">Content</TableHead>
                  <TableHead className="text-xs">Meta</TableHead>
                  <TableHead className="text-xs">Structure</TableHead>
                  <TableHead className="text-xs">Links</TableHead>
                  <TableHead className="text-xs">Media</TableHead>
                  <TableHead className="text-xs">Schema</TableHead>
                  <TableHead className="text-xs">Technical</TableHead>
                  <TableHead className="text-xs">Social</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seoScores.map((row) => (
                  <TableRow key={row.page_path}>
                    <TableCell className="font-mono text-xs">{row.page_path}</TableCell>
                    <TableCell className="text-xs text-gray-500">{row.page_type ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`font-semibold ${scoreColor(row.overall_score)}`}>
                        {row.overall_score ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={gradeBadgeVariant(row.grade)}>
                        {row.grade ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{row.content_quality_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.meta_elements_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.structure_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.links_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.media_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.schema_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.technical_score ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.social_score ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
