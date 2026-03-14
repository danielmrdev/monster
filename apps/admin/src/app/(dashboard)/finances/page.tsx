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

export default async function FinancesPage() {
  const supabase = createServiceClient()

  const [costsResult, categoriesResult, sitesResult] = await Promise.all([
    supabase.from('costs').select('*').order('created_at', { ascending: false }),
    supabase.from('cost_categories').select('slug, name'),
    supabase.from('sites').select('id, name').order('name'),
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

  const costs = costsResult.data
  const categories = categoriesResult.data
  const sites = sitesResult.data

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
                  const siteName =
                    row.site_id
                      ? (sites.find((s) => s.id === row.site_id)?.name ?? 'Unknown')
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

      {/* Revenue placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Revenue tracking coming soon. Amazon Associates manual CSV import will be available
            in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
