import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = createServiceClient()

  const [
    { count: totalSites, error: e1 },
    { count: liveSites, error: e2 },
    { count: draftSites, error: e3 },
    { count: openAlerts, error: e4 },
  ] = await Promise.all([
    supabase.from('sites').select('*', { count: 'exact', head: true }),
    supabase.from('sites').select('*', { count: 'exact', head: true }).eq('status', 'live'),
    supabase.from('sites').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('product_alerts').select('*', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  if (e1) throw new Error('Failed to fetch dashboard KPIs (total sites): ' + e1.message)
  if (e2) throw new Error('Failed to fetch dashboard KPIs (live sites): ' + e2.message)
  if (e3) throw new Error('Failed to fetch dashboard KPIs (draft sites): ' + e3.message)
  if (e4) throw new Error('Failed to fetch dashboard KPIs (open alerts): ' + e4.message)

  const kpis = [
    { label: 'Total Sites', value: totalSites ?? 0 },
    { label: 'Live Sites', value: liveSites ?? 0 },
    { label: 'Draft Sites', value: draftSites ?? 0 },
    { label: 'Open Alerts', value: openAlerts ?? 0 },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
