'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { acknowledgeAlert, resolveAlert } from '@/app/(dashboard)/alerts/actions'

export interface SiteAlertRow {
  id: string
  alert_type: string
  severity: string
  created_at: string
  product_id: string | null
  tsa_products: { asin: string; title: string | null } | null
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  unavailable: 'Product Unavailable',
  category_empty: 'Category Empty',
  site_degraded: 'Site Degraded',
}

function formatAlertType(alertType: string): string {
  return ALERT_TYPE_LABELS[alertType] ?? alertType
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface SiteAlertRowActionsProps {
  alertId: string
}

function SiteAlertRowActions({ alertId }: SiteAlertRowActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleAcknowledge() {
    startTransition(async () => {
      const result = await acknowledgeAlert(alertId)
      if (!result.ok) {
        console.error('[SiteAlerts] acknowledgeAlert failed:', result.error)
      }
      router.refresh()
    })
  }

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveAlert(alertId)
      if (!result.ok) {
        console.error('[SiteAlerts] resolveAlert failed:', result.error)
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleAcknowledge}
        disabled={isPending}
      >
        Acknowledge
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleResolve}
        disabled={isPending}
      >
        Resolve
      </Button>
    </div>
  )
}

interface SiteAlertsProps {
  alerts: SiteAlertRow[]
}

/**
 * Per-site alert summary card body.
 *
 * Observability:
 *  - Empty state "No open alerts — all clear." = zero open rows for this site in DB.
 *  - If row persists after Acknowledge/Resolve: action returned { ok: false } (check browser
 *    console for [SiteAlerts] error) or router.refresh() did not fire.
 *  - DB query error surfaces as a thrown error in page.tsx → Next.js error boundary.
 *    Check pm2 logs monster-admin for the thrown Supabase message.
 */
export function SiteAlerts({ alerts }: SiteAlertsProps) {
  const count = alerts.length

  if (count === 0) {
    return (
      <p className="text-sm text-muted-foreground">No open alerts — all clear.</p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground/80">
        {count} open alert{count === 1 ? '' : 's'}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.map((alert) => (
            <TableRow key={alert.id}>
              <TableCell>{formatAlertType(alert.alert_type)}</TableCell>
              <TableCell>
                {alert.severity === 'critical' ? (
                  <Badge variant="destructive">Critical</Badge>
                ) : (
                  <Badge variant="secondary">Warning</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {alert.tsa_products
                  ? alert.tsa_products.title
                    ? `${alert.tsa_products.asin} — ${alert.tsa_products.title}`
                    : alert.tsa_products.asin
                  : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(alert.created_at)}
              </TableCell>
              <TableCell>
                <SiteAlertRowActions alertId={alert.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
