import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CostForm } from './cost-form'
import { RevenueSection } from './revenue-section'
import { FinancesFilters } from './finances-filters'
import { PnLExportButton } from './pnl-export-button'
import { getDateRange, computePnL } from './lib'

export const dynamic = 'force-dynamic'

// D120 pattern: searchParams is a Promise in Next.js 15 App Router
export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams
  const dateRange = getDateRange(from, to)

  const supabase = createServiceClient()

  const [
    costsResult,
    categoriesResult,
    sitesResult,
    revenueAmazonResult,
    revenueManualResult,
    domainsResult,
  ] = await Promise.all([
    supabase
      .from('costs')
      .select('*')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .order('created_at', { ascending: false }),
    supabase.from('cost_categories').select('slug, name'),
    supabase.from('sites').select('id, name').order('name'),
    supabase
      .from('revenue_amazon')
      .select('id, site_id, date, clicks, items_ordered, earnings, currency, market')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .order('date', { ascending: false }),
    supabase
      .from('revenue_manual')
      .select('id, site_id, source, amount, currency, date, notes')
      .gte('date', dateRange.from)
      .lte('date', dateRange.to)
      .order('date', { ascending: false }),
    supabase
      .from('domains')
      .select('id, domain, expires_at, site_id')
      .not('expires_at', 'is', null),
  ])

  if (costsResult.error) {
    throw new Error(`Failed to fetch costs: ${costsResult.error.message}`)
  }
  if (categoriesResult.error) {
    throw new Error(`Failed to fetch cost_categories: ${categoriesResult.error.message}`)
  }
  if (sitesResult.error) {
    throw new Error(`Failed to fetch sites: ${sitesResult.error.message}`)
  }
  if (revenueAmazonResult.error) {
    throw new Error(`Failed to fetch revenue_amazon: ${revenueAmazonResult.error.message}`)
  }
  if (revenueManualResult.error) {
    throw new Error(`Failed to fetch revenue_manual: ${revenueManualResult.error.message}`)
  }
  if (domainsResult.error) {
    throw new Error(`Failed to fetch domains: ${domainsResult.error.message}`)
  }

  const costs = costsResult.data
  const categories = categoriesResult.data
  const sites = sitesResult.data
  const revenueAmazon = revenueAmazonResult.data
  const revenueManual = revenueManualResult.data

  // Compute P&L aggregation (pure in-memory)
  const pnlResult = computePnL(costs, revenueAmazon, revenueManual, sites)

  // Domain expiry alerts — in-memory filter for domains expiring within 60 days
  const now = Date.now()
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]))

  const expiringDomains = domainsResult.data
    .map((d) => {
      const expiresDate = new Date(d.expires_at!).getTime()
      const daysRemaining = Math.floor((expiresDate - now) / (1000 * 60 * 60 * 24))
      return {
        id: d.id,
        domain: d.domain,
        site_id: d.site_id,
        siteName: siteNameById.get(d.site_id) ?? 'Unknown',
        daysRemaining,
      }
    })
    .filter((d) => d.daysRemaining <= 60)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)

  // Build a revenue row list for the Revenue History section
  type RevenueRow = {
    key: string
    date: string
    source: string
    siteName: string
    amount: number
    currency: string
    notes: string
  }

  const revenueRows: RevenueRow[] = [
    ...revenueAmazon.map((r) => ({
      key: `amazon-${r.id}`,
      date: r.date,
      source: `Amazon (${r.market})`,
      siteName: r.site_id ? (siteNameById.get(r.site_id) ?? 'Unknown') : 'Portfolio-wide',
      amount: r.earnings,
      currency: r.currency,
      notes: `${r.clicks} clicks, ${r.items_ordered} ordered`,
    })),
    ...revenueManual.map((r) => ({
      key: `manual-${r.id}`,
      date: r.date,
      source: r.source || 'Manual',
      siteName: r.site_id ? (siteNameById.get(r.site_id) ?? 'Unknown') : 'Portfolio-wide',
      amount: r.amount,
      currency: r.currency,
      notes: r.notes || '—',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  // Formatters
  const fmtEUR = (n: number) =>
    n.toLocaleString('en', { style: 'currency', currency: 'EUR' })

  const profitColor = (n: number) =>
    n >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'

  const roiColor = (roi: number | null) => {
    if (roi === null) return 'text-muted-foreground'
    return roi > 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400'
  }

  const daysRemainingColor = (days: number) => {
    if (days <= 14) return 'text-red-600 dark:text-red-400 font-semibold'
    if (days <= 30) return 'text-amber-600 dark:text-amber-400 font-medium'
    return 'text-yellow-600 dark:text-yellow-400'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Finances</h1>

      {/* Date range filter */}
      <FinancesFilters defaultFrom={dateRange.from} defaultTo={dateRange.to} />

      {/* ── P&L Summary card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            P&L Summary — {dateRange.from} to {dateRange.to}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">{fmtEUR(pnlResult.portfolioRevenue)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Costs</p>
              <p className="text-2xl font-bold">{fmtEUR(pnlResult.portfolioCosts)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Net Profit</p>
              <p className={`text-2xl font-bold ${profitColor(pnlResult.portfolioProfit)}`}>
                {fmtEUR(pnlResult.portfolioProfit)}
              </p>
            </div>
          </div>

          {pnlResult.mixedCurrencies && (
            <p className="mt-4 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
              ⚠ Revenue or costs include non-EUR entries — amounts shown in their original
              currency, not converted. Totals may be inaccurate.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Per-Site P&L Table card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Site Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Costs</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pnlResult.sitePnL.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No cost or revenue data for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                pnlResult.sitePnL.map((row) => {
                  const noData = row.revenue === 0 && row.costs === 0
                  return (
                    <TableRow key={row.site_id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtEUR(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtEUR(row.costs)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${noData ? 'text-muted-foreground' : profitColor(row.profit)}`}
                      >
                        {noData ? '—' : fmtEUR(row.profit)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${roiColor(row.roi)}`}>
                        {row.roi !== null ? `${row.roi.toFixed(1)}%` : 'N/A'}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {pnlResult.sitePnL.length > 0 && (
            <div className="p-4 border-t flex justify-end">
              <PnLExportButton sitePnL={pnlResult.sitePnL} dateRange={dateRange} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Domain Renewals card (only when expiring domains exist) ─────────── */}
      {expiringDomains.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardHeader className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 rounded-t-lg">
            <CardTitle className="text-amber-800 dark:text-amber-300">
              ⚠ Domain Renewals ({expiringDomains.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Days Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringDomains.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.domain}</TableCell>
                    <TableCell className="text-muted-foreground">{d.siteName}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${daysRemainingColor(d.daysRemaining)}`}
                    >
                      {d.daysRemaining}d
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Add cost form ───────────────────────────────────────────────────── */}
      <CostForm categories={categories} sites={sites} />

      {/* ── Cost history ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Cost History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No cost entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                costs.map((row) => {
                  const siteName = row.site_id
                    ? (siteNameById.get(row.site_id) ?? 'Unknown')
                    : 'Portfolio-wide'
                  const categoryName =
                    categories.find((c) => c.slug === row.category_slug)?.name ??
                    row.category_slug
                  const formattedAmount = row.amount.toLocaleString('en', {
                    style: 'currency',
                    currency: row.currency,
                  })
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">{row.date}</TableCell>
                      <TableCell>{categoryName}</TableCell>
                      <TableCell className="text-muted-foreground">{siteName}</TableCell>
                      <TableCell className="font-medium">{formattedAmount}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.description ?? '—'}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Revenue forms: CSV import + manual entry ────────────────────────── */}
      <RevenueSection sites={sites} />

      {/* ── Revenue history ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenueRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No revenue entries yet. Import an Amazon Associates CSV or add a manual entry.
                  </TableCell>
                </TableRow>
              ) : (
                revenueRows.map((row) => {
                  const formattedAmount = row.amount.toLocaleString('en', {
                    style: 'currency',
                    currency: row.currency,
                  })
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="font-mono text-sm">{row.date}</TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell className="text-muted-foreground">{row.siteName}</TableCell>
                      <TableCell className="font-medium">{formattedAmount}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.notes}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
