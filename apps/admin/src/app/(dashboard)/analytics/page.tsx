import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchAnalyticsData } from './lib'
import { AnalyticsFilters } from './AnalyticsFilters'
import { AggregationTrigger } from './AggregationTrigger'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

interface AnalyticsPageProps {
  searchParams: Promise<{ site?: string; range?: string }>
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const { site, range: rawRange } = await searchParams

  // Normalize range — unknown values default to '7d'
  const validRanges = ['today', '7d', '30d'] as const
  type ValidRange = (typeof validRanges)[number]
  const normalizedRange: ValidRange = (validRanges as readonly string[]).includes(rawRange ?? '')
    ? (rawRange as ValidRange)
    : '7d'

  // Fetch analytics data and sites list for filter dropdown in parallel
  const [data, sitesResult] = await Promise.all([
    fetchAnalyticsData(site || undefined, normalizedRange),
    createServiceClient().from('sites').select('id, name').order('name'),
  ])

  if (sitesResult.error) {
    throw new Error(`Failed to fetch sites: ${sitesResult.error.message}`)
  }

  const sites = sitesResult.data

  // Derive combined top pages across all sites in the current filter scope
  const allTopPages = data.siteMetrics
    .flatMap((m) => m.topPages)
    .reduce<Record<string, number>>((acc, p) => {
      acc[p.path] = (acc[p.path] ?? 0) + p.count
      return acc
    }, {})

  const combinedTopPages = Object.entries(allTopPages)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <AggregationTrigger />
          <AnalyticsFilters
            sites={sites}
            selectedSite={site || undefined}
            selectedRange={normalizedRange}
          />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Pageviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {data.totalPageviews.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Visitors{' '}
              <span className="font-normal text-xs">(approximate)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {data.totalUniqueVisitors.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Affiliate Clicks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {data.totalAffiliateClicks.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-site metrics table */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Site Metrics</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Pageviews</TableHead>
                <TableHead className="text-right">
                  Unique Visitors{' '}
                  <span className="text-xs font-normal text-muted-foreground">(approx)</span>
                </TableHead>
                <TableHead className="text-right">Affiliate Clicks</TableHead>
                <TableHead>Top Page</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.siteMetrics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No events in this period.
                  </TableCell>
                </TableRow>
              ) : (
                data.siteMetrics.map((m) => (
                  <TableRow key={m.siteId}>
                    <TableCell className="font-medium">{m.siteName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.pageviews.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.uniqueVisitors.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.affiliateClicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {m.topPages[0]?.path ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top Pages */}
      <Card>
        <CardHeader>
          <CardTitle>Top Pages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page Path</TableHead>
                <TableHead className="text-right">Pageviews</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {combinedTopPages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                    No page data in this period.
                  </TableCell>
                </TableRow>
              ) : (
                combinedTopPages.map(({ path, count }) => (
                  <TableRow key={path}>
                    <TableCell className="font-mono text-sm">{path}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Daily Aggregates */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Aggregates</CardTitle>
        </CardHeader>
        <CardContent>
          {data.dailyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aggregated data will appear after the daily cron runs.
            </p>
          ) : (
            <div className="p-0 -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Pageviews</TableHead>
                    <TableHead className="text-right">Unique Visitors</TableHead>
                    <TableHead className="text-right pr-6">Affiliate Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dailyRows.map((row) => (
                    <TableRow key={`${row.site_id}-${row.date}-${row.page_path}`}>
                      <TableCell className="pl-6 font-mono text-sm">{row.date}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {row.page_path}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.pageviews}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.unique_visitors}
                      </TableCell>
                      <TableCell className="text-right tabular-nums pr-6">
                        {row.affiliate_clicks}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Country Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Country Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No country data in Phase 1. Country tracking will be available in a future update
            (R024).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
