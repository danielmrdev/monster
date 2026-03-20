"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Mark a product alert as acknowledged.
 * Sets status='acknowledged' only — resolved_at is not touched.
 * Revalidates /alerts and /dashboard so KPI counts update immediately.
 *
 * Observability:
 *  - Returns { ok: false, error } on DB failure — caller should surface the message.
 *  - Confirm in DB: SELECT status FROM product_alerts WHERE id = '<alertId>'
 */
export async function acknowledgeAlert(alertId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("product_alerts")
      .update({ status: "acknowledged" })
      .eq("id", alertId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/alerts");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Mark a product alert as resolved.
 * Sets status='resolved' and resolved_at to the current ISO timestamp.
 * Revalidates /alerts and /dashboard so KPI counts update immediately.
 *
 * Observability:
 *  - Returns { ok: false, error } on DB failure — caller should surface the message.
 *  - Confirm in DB: SELECT status, resolved_at FROM product_alerts WHERE id = '<alertId>'
 */
export async function resolveAlert(alertId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("product_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", alertId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/alerts");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Returns the count of open (unread) product alerts.
 * Used by AlertsBell to render the badge count in the header.
 *
 * Observability:
 *  - Returns 0 on error and logs to console.error — count=0 means "no open alerts" OR "query failed".
 *  - Inspect: SELECT count(*) FROM product_alerts WHERE status='open'
 *  - Failure path: console.error("[alerts] getOpenAlertsCount failed:", error.message)
 */
export async function getOpenAlertsCount(): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from("product_alerts")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");
    if (error) {
      console.error("[alerts] getOpenAlertsCount failed:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[alerts] getOpenAlertsCount error:", err);
    return 0;
  }
}

/**
 * Returns the most recent product alerts (up to 50), optionally filtered by status.
 * Used by AlertsBell (statuses=['open']) and the dashboard page (all statuses).
 *
 * Observability:
 *  - Returns [] on error and logs to console.error.
 *  - Failure path: console.error("[alerts] getAlerts failed:", error.message)
 *  - Inspect: SELECT * FROM product_alerts ORDER BY created_at DESC LIMIT 50
 */
export async function getAlerts(
  statuses?: string[],
): Promise<import("./AlertList").AlertRow[]> {
  try {
    const supabase = createServiceClient();
    let query = supabase
      .from("product_alerts")
      .select("*, sites(name), tsa_products(asin, title)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[alerts] getAlerts failed:", error.message);
      return [];
    }
    return (data ?? []) as import("./AlertList").AlertRow[];
  } catch (err) {
    console.error("[alerts] getAlerts error:", err);
    return [];
  }
}
