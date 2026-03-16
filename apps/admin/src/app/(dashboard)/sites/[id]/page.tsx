import { notFound } from 'next/navigation'
import Link from 'next/link'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServiceClient } from '@/lib/supabase/service'
import type { SiteCustomization } from '@monster/shared'
import { enqueueSiteDeploy, getDeploymentCard } from './actions'
import { RefreshCard } from './RefreshCard'
import { SiteAlerts } from './SiteAlerts'
import JobStatus from './JobStatus'
import { GenerateSiteButton } from './GenerateSiteButton'
import DeployStatus from './DeployStatus'
import DomainManagement from './DomainManagement'
import { CategoriesSection } from './CategoriesSection'
import { ProductsSection } from './ProductsSection'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 70) return 'text-green-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
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

  if (error || !site) notFound()

  // Check if a generated dist/ exists for the Preview button
  const GENERATOR_ROOT = join(process.cwd(), '..', 'generator')
  const siteSlug = site.domain ? site.domain.replace(/\./g, '-') : null
  const hasPreview = siteSlug
    ? existsSync(join(GENERATOR_ROOT, '.generated-sites', siteSlug, 'dist', 'index.html'))
    : false

  const [seoScoresResult, deployCard, siteAlertsResult, categoriesResult, productsResult] = await Promise.all([
    supabase
      .from('seo_scores')
      .select('page_path, page_type, overall_score, grade, content_quality_score, meta_elements_score, structure_score, links_score, media_score, schema_score, technical_score, social_score')
      .eq('site_id', id)
      .order('page_path', { ascending: true }),
    getDeploymentCard(id),
    supabase
      .from('product_alerts')
      .select('*, tsa_products(asin, title)')
      .eq('site_id', id)
      .eq('status', 'open')
      .order('created_at', { ascending: false }),
    supabase
      .from('tsa_categories')
      .select('id, name, slug, focus_keyword, keywords, seo_text')
      .eq('site_id', id)
      .order('name', { ascending: true }),
    supabase
      .from('tsa_products')
      .select('id, asin, title, current_price, rating, review_count, is_prime, source_image_url, images')
      .eq('site_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (siteAlertsResult.error) throw siteAlertsResult.error

  const seoScores = seoScoresResult.data
  const customization = site.customization as SiteCustomization | null
  const categories = categoriesResult.data ?? []
  const products = productsResult.data ?? []

  const statusBadge = (status: string | null) => {
    const s = status ?? 'draft'
    const map: Record<string, string> = {
      active:      'bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
      live:        'bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
      draft:       'bg-white/8 text-muted-foreground ring-1 ring-white/10',
      error:       'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
      deploying:   'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
      running:     'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
      dns_pending: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
      ssl_pending: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
      paused:      'bg-white/8 text-muted-foreground ring-1 ring-white/10',
      succeeded:   'bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
      failed:      'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
    }
    return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[s] ?? map.draft}`
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/sites"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Sites
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{site.name}</h1>
          <span className={statusBadge(site.status)}>{site.status ?? 'draft'}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasPreview ? (
            <Link
              href={`/sites/${site.id}/preview`}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Preview
            </Link>
          ) : (
            <span
              title="Generate the site first"
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary/40 px-4 py-2 text-sm font-medium text-secondary-foreground/40 cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Preview
            </span>
          )}
          <GenerateSiteButton siteId={site.id} />
          {site.domain ? (
            <form action={async () => {
              'use server'
              await enqueueSiteDeploy(site.id)
            }}>
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Deploy
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled
              title="Set a domain first"
              className="inline-flex items-center rounded-md bg-primary/30 px-4 py-2 text-sm font-medium text-primary-foreground/50 cursor-not-allowed"
            >
              Deploy
            </button>
          )}
          <Link
            href={`/sites/${site.id}/edit`}
            className="inline-flex items-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Site details card */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">

        {/* Core info */}
        <Section title="Site Info">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              ['Domain',        site.domain],
              ['Niche',         site.niche],
              ['Market',        site.market],
              ['Language',      site.language],
              ['Currency',      site.currency],
              ['Affiliate Tag', site.affiliate_tag],
              ['Template',      site.template_slug],
              ['Site Type',     site.site_type_slug],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm text-foreground">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Customization */}
        <Section title="Customization">
          {customization ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Primary Color</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                  {customization.primaryColor ? (
                    <>
                      <span
                        className="inline-block w-4 h-4 rounded-sm border border-border"
                        style={{ backgroundColor: customization.primaryColor }}
                      />
                      {customization.primaryColor}
                    </>
                  ) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Accent Color</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                  {customization.accentColor ? (
                    <>
                      <span
                        className="inline-block w-4 h-4 rounded-sm border border-border"
                        style={{ backgroundColor: customization.accentColor }}
                      />
                      {customization.accentColor}
                    </>
                  ) : '—'}
                </dd>
              </div>
              {[
                ['Font Family', customization.fontFamily],
                ['Logo URL',    customization.logoUrl],
                ['Favicon URL', customization.faviconUrl],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm text-foreground truncate">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No customization set.</p>
          )}
        </Section>

        {/* Metadata */}
        <Section title="Metadata">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              ['Created', site.created_at],
              ['Updated', site.updated_at],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {value ? new Date(value as string).toLocaleString() : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      {/* Generation status */}
      <Card title="Site Generation">
        <JobStatus siteId={site.id} />
      </Card>

      {/* Deployment status */}
      <Card title="Deployment">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Pipeline status:</span>
            <span className={statusBadge(deployCard.siteStatus)}>
              {deployCard.siteStatus ?? 'draft'}
            </span>
          </div>

          {deployCard.latestDeployment ? (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-muted-foreground">Last deployment:</span>
                <span className={statusBadge(deployCard.latestDeployment.status)}>
                  {deployCard.latestDeployment.status}
                </span>
              </div>
              {deployCard.latestDeployment.deployed_at && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Deployed:</span>{' '}
                  {new Date(deployCard.latestDeployment.deployed_at).toLocaleString()}
                </div>
              )}
              {deployCard.latestDeployment.duration_ms != null && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Duration:</span>{' '}
                  {Math.round(deployCard.latestDeployment.duration_ms / 1000)}s
                </div>
              )}
              {deployCard.latestDeployment.error && (
                <div className="text-red-400 text-xs font-mono break-all">
                  {deployCard.latestDeployment.error}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No deployments yet.</p>
          )}

          {deployCard.domain?.cf_nameservers && deployCard.domain.cf_nameservers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Point your domain to these nameservers:
              </p>
              <ul className="space-y-0.5">
                {deployCard.domain.cf_nameservers.map((ns) => (
                  <li key={ns} className="font-mono text-xs text-foreground bg-muted/40 rounded px-2 py-1 border border-border">
                    {ns}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DeployStatus siteId={site.id} />
        </div>
      </Card>

      {/* Domain Management */}
      <Card title="Domain Management">
        <DomainManagement siteId={site.id} existingDomain={site.domain} />
      </Card>

      {/* Product Refresh */}
      <Card title="Product Refresh">
        <RefreshCard siteId={site.id} lastRefreshedAt={site.last_refreshed_at ?? null} />
      </Card>

      {/* Product Alerts */}
      <Card title="Product Alerts">
        <SiteAlerts alerts={siteAlertsResult.data ?? []} />
      </Card>

      {/* Categories */}
      <CategoriesSection siteId={id} categories={categories} />

      {/* Products */}
      <ProductsSection siteId={id} products={products} />

      {/* SEO Scores */}
      <Card title="SEO Scores">
        {!seoScores || seoScores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SEO scores yet — generate the site first.</p>
        ) : (
          <div className="overflow-x-auto -mx-6">
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
                    <TableCell className="text-xs text-muted-foreground">{row.page_type ?? '—'}</TableCell>
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
      </Card>

    </div>
  )
}

// ── Local layout helpers ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-5">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {title}
      </h2>
      {children}
    </div>
  )
}
