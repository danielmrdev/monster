"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { acknowledgeAlert, resolveAlert } from "./actions";

export interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  status: string;
  product_id: string | null;
  created_at: string;
  resolved_at: string | null;
  details: Record<string, unknown> | null;
  sites: { name: string } | null;
  tsa_products: { asin: string; title: string } | null;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  unavailable: "Product Unavailable",
  category_empty: "Category Empty",
  site_degraded: "Site Degraded",
};

function formatAlertType(alertType: string): string {
  return ALERT_TYPE_LABELS[alertType] ?? alertType;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface AlertRowActionsProps {
  alertId: string;
  /** Called after a successful action so parent components (e.g. AlertsBell) can re-fetch. */
  onActionComplete?: () => void;
}

function AlertRowActions({ alertId, onActionComplete }: AlertRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleAcknowledge() {
    startTransition(async () => {
      const result = await acknowledgeAlert(alertId);
      if (!result.ok) {
        console.error("[AlertList] acknowledgeAlert failed:", result.error);
      }
      router.refresh();
      onActionComplete?.();
    });
  }

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveAlert(alertId);
      if (!result.ok) {
        console.error("[AlertList] resolveAlert failed:", result.error);
      }
      router.refresh();
      onActionComplete?.();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleAcknowledge} disabled={isPending}>
        Acknowledge
      </Button>
      <Button variant="outline" size="sm" onClick={handleResolve} disabled={isPending}>
        Resolve
      </Button>
    </div>
  );
}

interface AlertListProps {
  alerts: AlertRow[];
  /** Called after any alert action completes so parent components can re-fetch counts/lists. */
  onActionComplete?: () => void;
}

export function AlertList({ alerts, onActionComplete }: AlertListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Site</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              No open alerts — all clear.
            </TableCell>
          </TableRow>
        ) : (
          alerts.map((alert) => (
            <TableRow key={alert.id}>
              <TableCell className="font-medium">{alert.sites?.name ?? "—"}</TableCell>
              <TableCell>{formatAlertType(alert.alert_type)}</TableCell>
              <TableCell>
                {alert.severity === "critical" ? (
                  <Badge variant="destructive">Critical</Badge>
                ) : (
                  <Badge variant="secondary">Warning</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {alert.tsa_products
                  ? `${alert.tsa_products.asin} — ${alert.tsa_products.title}`
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(alert.created_at)}
              </TableCell>
              <TableCell>
                <AlertRowActions alertId={alert.id} onActionComplete={onActionComplete} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
