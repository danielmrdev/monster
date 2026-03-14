'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Mark a product alert as acknowledged.
 * Sets status='acknowledged' only — resolved_at is not touched.
 * Revalidates /alerts and /dashboard so KPI counts update immediately.
 *
 * Observability:
 *  - Returns { ok: false, error } on DB failure — caller should surface the message.
 *  - Confirm in DB: SELECT status FROM product_alerts WHERE id = '<alertId>'
 */
export async function acknowledgeAlert(
  alertId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('product_alerts')
      .update({ status: 'acknowledged' })
      .eq('id', alertId)

    if (error) {
      return { ok: false, error: error.message }
    }

    revalidatePath('/alerts')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
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
export async function resolveAlert(
  alertId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('product_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', alertId)

    if (error) {
      return { ok: false, error: error.message }
    }

    revalidatePath('/alerts')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
