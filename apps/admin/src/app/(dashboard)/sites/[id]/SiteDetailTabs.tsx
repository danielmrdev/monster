'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SiteCustomization } from '@monster/shared'

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 70) return 'text-green-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function gradeBadgeVariant(
  grade: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (grade) {
    case 'A':
    case 'B':
      return 'default'
    case 'C':
      return 'secondary'
    case 'D':
    case 'F':
      return 'destructive'
    default:
      return 'outline'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeoScore {
  page_path: string
  page_type: string | null
  overall_score: number | null
  grade: string | null
  content_quality_score: number | null
  meta_elements_score: number | null
  structure_score: number | null
  links_score: number | null
  media_score: number | null
  schema_score: number | null
  technical_score: number | null
  social_score: number | null
}

interface Alert {
  id: string
  alert_type: string
  status: string
  created_at: string
  tsa_products: { asin: string; title: string | null } | null
}

interface TabsProps {
  // Overview
  site: {
    domain: string | null
    niche: string | null
    market: string | null
    language: string | null
    currency: string | null
    affiliate_tag: string | null
    template_slug: string | null
    site_type_slug: string | null
    created_at: string | null
    updated_at: string | null
    customization: unknown
    focus_keyword: string | null
    homepage_seo_text: string | null
  }
  // Content
  categoriesSlot: React.ReactNode
  // Deploy
  deploySlot: React.ReactNode
  domainSlot: React.ReactNode
  generationSlot: React.ReactNode
  refreshSlot: React.ReactNode
  // SEO & Alerts
  seoScores: SeoScore[] | null
  alerts: Alert[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SiteDetailTabs({
  site,
  categoriesSlot,
  deploySlot,
  domainSlot,
  generationSlot,
  refreshSlot,
  seoScores,
  alerts,
}: TabsProps) {
  const customization = site.customization as SiteCustomization | null

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="categories">Categories</TabsTrigger>
        <TabsTrigger value="deploy">Deploy</TabsTrigger>
        <TabsTrigger value="seo">SEO &amp; Alerts</TabsTrigger>
      </TabsList>

      {/* ── Overview ────────────────────────────────────────────────────────── */}
      <TabsContent value="overview" className="space-y-0">
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <Section title="Site Info">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {(
                [
                  ['Domain', site.domain],
                  ['Niche', site.niche],
                  ['Market', site.market],
                  ['Language', site.language],
                  ['Currency', site.currency],
                  ['Affiliate Tag', site.affiliate_tag],
                  ['Template', site.template_slug],
                  ['Site Type', site.site_type_slug],
                ] as [string, string | null][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm text-foreground">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </Section>

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
                    ) : (
                      '—'
                    )}
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
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                {(
                  [
                    ['Font Family', customization.fontFamily],
                    ['Logo URL', customization.logoUrl],
                    ['Favicon URL', customization.faviconUrl],
                  ] as [string, string | undefined][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm text-foreground truncate">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No customization set.</p>
            )}
          </Section>

          <Section title="Metadata">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {(
                [
                  ['Created', site.created_at],
                  ['Updated', site.updated_at],
                ] as [string, string | null][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {value ? new Date(value).toLocaleString() : '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </TabsContent>

      {/* ── Categories ──────────────────────────────────────────────────────── */}
      <TabsContent value="categories" className="space-y-6">
        {categoriesSlot}
      </TabsContent>

      {/* ── Deploy ──────────────────────────────────────────────────────────── */}
      <TabsContent value="deploy" className="space-y-6">
        <Card title="Site Generation">{generationSlot}</Card>
        <Card title="Deployment">{deploySlot}</Card>
        <Card title="Domain Management">{domainSlot}</Card>
        <Card title="Product Refresh">{refreshSlot}</Card>
      </TabsContent>

      {/* ── SEO & Alerts ────────────────────────────────────────────────────── */}
      <TabsContent value="seo" className="space-y-6">
        <Card title="Homepage SEO">
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Focus Keyword</dt>
              <dd className="mt-1 text-sm text-foreground">{site.focus_keyword ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">SEO Text</dt>
              <dd className="mt-2 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {site.homepage_seo_text ?? '—'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Product Alerts">
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open alerts.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm"
                >
                  <span className="mt-0.5 text-amber-400">⚠</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground capitalize">
                      {alert.alert_type.replace(/_/g, ' ')}
                    </span>
                    {alert.tsa_products && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {alert.tsa_products.asin}
                      </span>
                    )}
                    {alert.tsa_products?.title && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {alert.tsa_products.title}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(alert.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="SEO Score Dimensions">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { name: 'Content', desc: 'Word count, keyword density, paragraph structure' },
              { name: 'Meta', desc: 'Title tag, meta description presence and length' },
              { name: 'Structure', desc: 'H1/H2 heading hierarchy and count' },
              { name: 'Links', desc: 'Internal link count and anchor text quality' },
              { name: 'Media', desc: 'Image presence, alt text coverage' },
              { name: 'Schema', desc: 'JSON-LD / structured data blocks' },
              { name: 'Technical', desc: 'Canonical tag, noindex, page size' },
              { name: 'Social', desc: 'Open Graph and Twitter Card tags' },
            ].map(({ name, desc }) => (
              <div key={name} className="flex gap-2 text-sm">
                <span className="font-medium text-foreground shrink-0">{name}:</span>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="SEO Scores">
          {!seoScores || seoScores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No SEO scores yet — generate the site first.
            </p>
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
                      <TableCell className="text-xs text-muted-foreground">
                        {row.page_type ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold ${scoreColor(row.overall_score)}`}>
                          {row.overall_score ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={gradeBadgeVariant(row.grade)}>{row.grade ?? '—'}</Badge>
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
      </TabsContent>
    </Tabs>
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
