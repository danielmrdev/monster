'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { parseAmazonCSV, type ImportResult } from './lib'

// ---------------------------------------------------------------------------
// addCost
// ---------------------------------------------------------------------------

const AddCostSchema = z.object({
  category_slug: z.string().min(1, 'Category is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  date: z.string().min(1, 'Date is required'),
  currency: z.string().default('EUR'),
  period: z.string().optional(),
  site_id: z.string().optional(),
  description: z.string().optional(),
})

export type AddCostErrors = {
  category_slug?: string[]
  amount?: string[]
  date?: string[]
  currency?: string[]
  period?: string[]
  site_id?: string[]
  description?: string[]
  _form?: string[]
}

export type AddCostState = {
  success?: boolean
  errors?: AddCostErrors
} | null

export async function addCost(
  _prevState: AddCostState,
  formData: FormData
): Promise<AddCostState> {
  const raw = {
    category_slug: formData.get('category_slug') as string | null,
    amount: formData.get('amount') as string | null,
    date: formData.get('date') as string | null,
    currency: (formData.get('currency') as string | null) || 'EUR',
    period: (formData.get('period') as string | null) || undefined,
    site_id: (formData.get('site_id') as string | null) || undefined,
    description: (formData.get('description') as string | null) || undefined,
  }

  const result = AddCostSchema.safeParse(raw)

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors as AddCostErrors }
  }

  const { category_slug, amount, date, currency, period, site_id, description } = result.data

  const supabase = createServiceClient()

  const { error } = await supabase.from('costs').insert({
    category_slug,
    amount,
    date,
    currency,
    period: period || null,
    site_id: site_id || null,
    description: description || null,
  })

  if (error) {
    throw new Error(`Failed to add cost: ${error.message}`)
  }

  revalidatePath('/finances')
  return { success: true }
}

// ---------------------------------------------------------------------------
// importAmazonCSV
// ---------------------------------------------------------------------------

export type ImportAmazonState = {
  success: true
  result: ImportResult
} | {
  success: false
  error: string
} | null

export async function importAmazonCSV(
  _prevState: ImportAmazonState,
  formData: FormData
): Promise<ImportAmazonState> {
  const file = formData.get('file') as File | null
  const market = (formData.get('market') as string) || 'ES'

  if (!file || file.size === 0) {
    return { success: false, error: 'No file selected' }
  }

  // Decode file to text
  const text = new TextDecoder('utf-8').decode(await file.arrayBuffer())

  // Parse CSV — throws on unrecognized format
  let rows: ReturnType<typeof parseAmazonCSV>
  try {
    rows = parseAmazonCSV(text)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { success: false, error: message }
  }

  const supabase = createServiceClient()

  // Fetch all sites that have an affiliate_tag configured
  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select('id, affiliate_tag')
    .not('affiliate_tag', 'is', null)

  if (sitesError) {
    throw new Error(`Failed to fetch sites: ${sitesError.message}`)
  }

  // Build lookup map: affiliate_tag → site_id
  const tagToSiteId = new Map<string, string>()
  for (const site of sites ?? []) {
    if (site.affiliate_tag) {
      tagToSiteId.set(site.affiliate_tag, site.id)
    }
  }

  // Partition rows into attributed (known tracking_id) and unattributed
  const attributedRows: Array<{
    site_id: string
    date: string
    clicks: number
    items_ordered: number
    earnings: number
    currency: string
    market: string
  }> = []
  const unattributedSet = new Set<string>()

  for (const row of rows) {
    const siteId = tagToSiteId.get(row.tracking_id)
    if (siteId) {
      attributedRows.push({
        site_id: siteId,
        date: row.date,
        clicks: row.clicks,
        items_ordered: row.items_ordered,
        earnings: row.earnings,
        currency: 'EUR',
        market,
      })
    } else {
      unattributedSet.add(row.tracking_id)
    }
  }

  let inserted = 0
  let updated = 0

  if (attributedRows.length > 0) {
    // Upsert — idempotent re-import via unique constraint on (site_id, date, market)
    // We use select: 'minimal' and can't distinguish insert vs update from Supabase directly,
    // so we count before and after to approximate. Simpler: treat all as inserted for now
    // since the upsert is idempotent and the UI just shows a combined count.
    const { data: upserted, error: upsertError } = await supabase
      .from('revenue_amazon')
      .upsert(attributedRows, { onConflict: 'site_id,date,market' })
      .select('id')

    if (upsertError) {
      throw new Error(`Failed to upsert revenue: ${upsertError.message}`)
    }

    // Supabase upsert returns all rows (both inserted and updated).
    // Without a way to distinguish new vs existing rows from a single upsert call,
    // we report the total as inserted. T02 UI shows the combined count as "imported".
    inserted = upserted?.length ?? attributedRows.length
    updated = 0
  }

  revalidatePath('/finances')

  return {
    success: true,
    result: {
      inserted,
      updated,
      unattributed: Array.from(unattributedSet),
    },
  }
}

// ---------------------------------------------------------------------------
// addManualRevenue
// ---------------------------------------------------------------------------

const AddManualRevenueSchema = z.object({
  site_id: z.string().optional(),
  source: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be positive'),
  currency: z.string().default('EUR'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
})

export type AddManualRevenueErrors = {
  site_id?: string[]
  source?: string[]
  amount?: string[]
  currency?: string[]
  date?: string[]
  notes?: string[]
  _form?: string[]
}

export type AddManualRevenueState = {
  success?: boolean
  errors?: AddManualRevenueErrors
} | null

export async function addManualRevenue(
  _prevState: AddManualRevenueState,
  formData: FormData
): Promise<AddManualRevenueState> {
  const raw = {
    site_id: (formData.get('site_id') as string | null) || undefined,
    source: (formData.get('source') as string | null) || undefined,
    amount: formData.get('amount') as string | null,
    currency: (formData.get('currency') as string | null) || 'EUR',
    date: formData.get('date') as string | null,
    notes: (formData.get('notes') as string | null) || undefined,
  }

  const result = AddManualRevenueSchema.safeParse(raw)

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors as AddManualRevenueErrors }
  }

  const { site_id, source, amount, currency, date, notes } = result.data

  const supabase = createServiceClient()

  const { error } = await supabase.from('revenue_manual').insert({
    site_id: site_id || null,
    source: source || null,
    amount,
    currency,
    date,
    notes: notes || null,
  })

  if (error) {
    throw new Error(`Failed to add manual revenue: ${error.message}`)
  }

  revalidatePath('/finances')
  return { success: true }
}
