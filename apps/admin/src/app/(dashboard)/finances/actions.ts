'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

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
