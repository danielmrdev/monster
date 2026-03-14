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

export default async function FinancesPage() {
  const supabase = createServiceClient()

  const [
    costsResult,
    categoriesResult,
    sitesResult,
    revenueAmazonResult,
    revenueManualResult,
  ] = await Promise.all([
    supabase.from('costs').select('*').order('created_at', { ascending: false }),
    supabase.from('cost_categories').select('slug, name'),
    supabase.from('sites').select('id, name').order('name'),
    supabase
      .from('revenue_amazon')
      .select('id, site_id, date, clicks, items_ordered, earnings, currency, market')
      .order('date', { ascending: false })
      .limit(100),
    supabase
      .from('revenue_manual')
      .select('id, site_id, source, amount, currency, date, notes')
      .order('date', { ascending: false })
      .limit(100),
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

  const costs = costsResult.data
  const categories = categoriesResult.data
  const sites = sitesResult.data
  const revenueAmazon = revenueAmazonResult.data
  const revenueManual = revenueManualResult.data

  // Build a site name lookup used in both cost and revenue tables
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]))

  // Merge and sort revenue rows by date descending
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Finances</h1>

      {/* Add cost form */}
      <CostForm categories={categories} sites={sites} />

      {/* Cost history */}
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

      {/* Revenue forms: CSV import + manual entry */}
      <RevenueSection sites={sites} />

      {/* Revenue history */}
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
