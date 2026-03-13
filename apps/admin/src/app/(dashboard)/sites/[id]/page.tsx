import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import type { SiteCustomization } from '@monster/shared'

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
        <Link
          href={`/sites/${site.id}/edit`}
          className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Edit
        </Link>
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
    </div>
  )
}
