import { createServiceClient } from '@/lib/supabase/service'
import { SETTINGS_KEYS } from './constants'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [...SETTINGS_KEYS])

  if (error) {
    throw new Error(`Failed to fetch settings: ${error.message} (code: ${error.code})`)
  }

  // Build a masked display record: key → last 4 characters of the stored value
  // Real value is never passed to any client component — only the last-4 suffix
  const maskedDisplay: Record<string, string> = {}
  for (const row of data ?? []) {
    const stored = (row.value as { value?: string })?.value
    if (stored && stored.length >= 1) {
      maskedDisplay[row.key] = stored.slice(-4)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage API keys and integration credentials. Keys are stored encrypted and never
          displayed in full.
        </p>
      </div>
      <SettingsForm maskedDisplay={maskedDisplay} />
    </div>
  )
}
