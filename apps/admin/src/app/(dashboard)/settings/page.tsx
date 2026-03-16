import { createServiceClient } from '@/lib/supabase/service'
import { SETTINGS_KEYS } from './constants'
import { SettingsForm } from './settings-form'
import { AGENT_KEYS } from '@monster/agents'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createServiceClient()

  const [settingsResult, agentPromptsResult] = await Promise.all([
    supabase
      .from('settings')
      .select('key, value')
      .in('key', [...SETTINGS_KEYS]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('agent_prompts')
      .select('agent_key, prompt_type, content')
      .eq('prompt_type', 'system'),
  ])

  if (settingsResult.error) {
    throw new Error(`Failed to fetch settings: ${settingsResult.error.message} (code: ${settingsResult.error.code})`)
  }

  // Build a masked display record: key → last 4 characters of the stored value
  const maskedDisplay: Record<string, string> = {}
  for (const row of settingsResult.data ?? []) {
    const stored = (row.value as { value?: string })?.value
    if (stored && stored.length >= 1) {
      maskedDisplay[row.key] = stored.slice(-4)
    }
  }

  // Build current agent prompts map: agentKey → content
  const agentPrompts: Record<string, string> = {}
  for (const row of agentPromptsResult.data ?? []) {
    agentPrompts[row.agent_key] = row.content
  }

  const agentKeys = [
    { key: AGENT_KEYS.CONTENT_GENERATOR, label: 'Content Generator', hint: 'Used for generating category SEO texts, product descriptions, pros/cons, and meta descriptions.' },
    { key: AGENT_KEYS.NICHE_RESEARCHER, label: 'Niche Researcher', hint: 'Used for the autonomous niche research agent in the Research Lab.' },
    { key: AGENT_KEYS.MONSTER, label: 'Monster Chat', hint: 'Used for the Monster Chat assistant (system prompt injected at session start).' },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage API keys and integration credentials. Keys are stored encrypted and never
          displayed in full.
        </p>
      </div>
      <SettingsForm maskedDisplay={maskedDisplay} agentPrompts={agentPrompts} agentKeys={agentKeys} />
    </div>
  )
}
