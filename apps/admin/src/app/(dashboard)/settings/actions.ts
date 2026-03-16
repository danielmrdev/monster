'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { SETTINGS_KEYS } from './constants'

const SaveSettingsSchema = z.object({
  spaceship_api_key: z.string().optional(),
  spaceship_api_secret: z.string().optional(),
  spaceship_contact_id: z.string().optional(),
  dataforseo_api_key: z.string().optional(),
  vps2_host: z.string().optional(),
  vps2_user: z.string().optional(),
  vps2_sites_root: z.string().optional(),
  cloudflare_api_token: z.string().optional(),
  vps2_ip: z.string().optional(),
})

export type SaveSettingsErrors = {
  spaceship_api_key?: string[]
  spaceship_api_secret?: string[]
  spaceship_contact_id?: string[]
  dataforseo_api_key?: string[]
  vps2_host?: string[]
  vps2_user?: string[]
  vps2_sites_root?: string[]
  cloudflare_api_token?: string[]
  vps2_ip?: string[]
  _form?: string[]
}

export type SaveSettingsState = {
  success?: boolean
  errors?: SaveSettingsErrors
} | null

export async function saveSettings(
  _prevState: SaveSettingsState,
  formData: FormData
): Promise<SaveSettingsState> {
  const raw = Object.fromEntries(
    SETTINGS_KEYS.map((key) => [key, (formData.get(key) as string | null) ?? ''])
  )

  const result = SaveSettingsSchema.safeParse(raw)

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors as SaveSettingsErrors }
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  for (const key of SETTINGS_KEYS) {
    const rawValue = result.data[key]

    // Skip empty — no-op semantics: empty field = don't touch existing value
    if (!rawValue || rawValue.trim() === '') continue

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key, value: { value: rawValue }, updated_at: now },
        { onConflict: 'key' }
      )

    if (error) {
      throw new Error(
        `Failed to upsert setting '${key}': ${error.message} (code: ${error.code})`
      )
    }
  }

  revalidatePath('/settings')
  return { success: true }
}
