import { InfraService, type Vps2Health } from '@monster/deployment'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import TestConnectionButton from './TestConnectionButton'

export const dynamic = 'force-dynamic'

export default async function InfraPage() {
  let health: Vps2Health

  // InfraService.getVps2Health() never throws by contract, but we wrap with
  // try/catch as a defensive measure against unexpected errors.
  try {
    const infra = new InfraService()
    health = await infra.getVps2Health()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-bold tracking-tight">Infrastructure</h1>
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Health Check Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive font-mono">{message}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const cards: {
    label: string
    value: string
    status: 'green' | 'red' | 'gray'
    detail?: string
  }[] = [
    {
      label: 'VPS2 Reachability',
      value: health.reachable ? 'Reachable' : 'Unreachable',
      status: health.reachable ? 'green' : 'red',
      detail: !health.reachable ? health.error : undefined,
    },
    {
      label: 'Caddy Service',
      value: health.caddyActive ? 'Active' : 'Inactive',
      status: health.caddyActive ? 'green' : 'red',
    },
    {
      label: 'Disk Usage',
      value: health.diskUsedPct != null ? `${health.diskUsedPct}%` : '—',
      status: 'gray',
    },
    {
      label: 'Memory',
      value:
        health.memUsedMb != null && health.memTotalMb != null
          ? `${health.memUsedMb} / ${health.memTotalMb} MB`
          : '—',
      status: 'gray',
    },
  ]

  const statusColor = {
    green: 'text-green-500',
    red: 'text-red-500',
    gray: 'text-foreground',
  }

  const borderColor = {
    green: 'border-green-500/30',
    red: 'border-red-500/30',
    gray: undefined,
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Infrastructure</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live health status of VPS2 — fetched at{' '}
          {new Date(health.fetchedAt).toLocaleString('en-GB', {
            dateStyle: 'short',
            timeStyle: 'medium',
          })}
        </p>
      </div>

      {/* Health cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, status, detail }) => (
          <Card key={label} className={borderColor[status]}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${statusColor[status]}`}>
                {value}
              </p>
              {detail && (
                <p className="text-xs text-destructive font-mono mt-1 break-all">
                  {detail}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Test connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Deploy Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <TestConnectionButton />
        </CardContent>
      </Card>
    </div>
  )
}
