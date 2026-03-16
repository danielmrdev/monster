'use client'

import { useActionState } from 'react'
import { saveSettings, saveAgentPrompts, type SaveSettingsState, type SaveAgentPromptsState } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface AgentKeyConfig {
  key: string
  label: string
  hint: string
}

interface SettingsFormProps {
  maskedDisplay: Record<string, string>
  agentPrompts: Record<string, string>
  agentKeys: AgentKeyConfig[]
}

function MaskedIndicator({ last4 }: { last4?: string }) {
  if (!last4) return null
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Currently set <span className="font-mono">••••••{last4}</span>
    </p>
  )
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>
}

export function SettingsForm({ maskedDisplay, agentPrompts, agentKeys }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState<SaveSettingsState, FormData>(
    saveSettings,
    null
  )
  const [promptState, promptFormAction, promptPending] = useActionState<SaveAgentPromptsState, FormData>(
    saveAgentPrompts,
    null
  )

  const errors = state?.errors

  return (
    <>
    <form action={formAction} className="space-y-6">
      {/* Success banner */}
      {state?.success && (
        <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Settings saved successfully.
        </div>
      )}

      {/* Form-level error banner */}
      {errors?._form && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors._form[0]}
        </div>
      )}

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Spaceship API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="spaceship_api_key">Spaceship API Key</Label>
            <Input
              id="spaceship_api_key"
              name="spaceship_api_key"
              type="password"
              autoComplete="off"
              placeholder="Enter new key to update"
              defaultValue=""
              aria-invalid={!!errors?.spaceship_api_key}
            />
            <MaskedIndicator last4={maskedDisplay['spaceship_api_key']} />
            <FieldError messages={errors?.spaceship_api_key} />
          </div>

          {/* Spaceship API Secret */}
          <div className="space-y-1.5">
            <Label htmlFor="spaceship_api_secret">Spaceship API Secret</Label>
            <Input
              id="spaceship_api_secret"
              name="spaceship_api_secret"
              type="password"
              autoComplete="off"
              placeholder="Enter new secret to update"
              defaultValue=""
              aria-invalid={!!errors?.spaceship_api_secret}
            />
            <MaskedIndicator last4={maskedDisplay['spaceship_api_secret']} />
            <FieldError messages={errors?.spaceship_api_secret} />
          </div>

          {/* Spaceship Contact ID */}
          <div className="space-y-1.5">
            <Label htmlFor="spaceship_contact_id">Spaceship Contact ID</Label>
            <Input
              id="spaceship_contact_id"
              name="spaceship_contact_id"
              type="text"
              autoComplete="off"
              placeholder="Enter new contact ID to update"
              defaultValue=""
              aria-invalid={!!errors?.spaceship_contact_id}
            />
            <MaskedIndicator last4={maskedDisplay['spaceship_contact_id']} />
            <p className="text-xs text-muted-foreground mt-1">
              27-32 character alphanumeric ID. Find it in Spaceship account → Contacts.
            </p>
            <FieldError messages={errors?.spaceship_contact_id} />
          </div>

          {/* DataForSEO API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="dataforseo_api_key">DataForSEO API Credentials</Label>
            <Input
              id="dataforseo_api_key"
              name="dataforseo_api_key"
              type="password"
              autoComplete="off"
              placeholder="email:password (e.g. user@example.com:27e3bcf9...)"
              defaultValue=""
              aria-invalid={!!errors?.dataforseo_api_key}
            />
            <MaskedIndicator last4={maskedDisplay['dataforseo_api_key']} />
            <FieldError messages={errors?.dataforseo_api_key} />
          </div>

          {/* Hetzner API Token */}
          <div className="space-y-1.5">
            <Label htmlFor="hetzner_api_token">Hetzner API Token</Label>
            <Input
              id="hetzner_api_token"
              name="hetzner_api_token"
              type="password"
              autoComplete="off"
              placeholder="Enter new token to update"
              defaultValue=""
              aria-invalid={!!errors?.hetzner_api_token}
            />
            <MaskedIndicator last4={maskedDisplay['hetzner_api_token']} />
            <p className="text-xs text-muted-foreground mt-1">
              Used to provision new VPS servers via the Hetzner Cloud API.
            </p>
            <FieldError messages={errors?.hetzner_api_token} />
          </div>
        </CardContent>
      </Card>

      {/* Cloudflare */}
      <Card>
        <CardHeader>
          <CardTitle>Cloudflare</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Used to create Cloudflare zones and A records automatically during deployment.
            Requires a Cloudflare API token with Zone:Edit permissions.
          </p>

          {/* Cloudflare API Token */}
          <div className="space-y-1.5">
            <Label htmlFor="cloudflare_api_token">Cloudflare API Token</Label>
            <Input
              id="cloudflare_api_token"
              name="cloudflare_api_token"
              type="password"
              autoComplete="off"
              placeholder="Enter new token to update"
              defaultValue=""
              aria-invalid={!!errors?.cloudflare_api_token}
            />
            <MaskedIndicator last4={maskedDisplay['cloudflare_api_token']} />
            <FieldError messages={errors?.cloudflare_api_token} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save Settings'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Leave a field empty to keep the current value.
        </p>
      </div>
    </form>

    {/* Agent Prompts — separate form so it doesn't interfere with API key save */}
    <form action={promptFormAction} className="space-y-6 pt-2">
      {promptState?.success && (
        <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Agent prompts saved.
        </div>
      )}
      {promptState?.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {promptState.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agent System Prompts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground">
            Override the default system prompts for each agent. Leave a field empty to restore the built-in default.
          </p>
          {agentKeys.map(({ key, label, hint }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`agent_prompt_${key}`}>{label}</Label>
              <Textarea
                id={`agent_prompt_${key}`}
                name={`agent_prompt_${key}`}
                defaultValue={agentPrompts[key] ?? ''}
                placeholder={`Leave empty to use the built-in default prompt for ${label}.`}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={promptPending}>
          {promptPending ? 'Saving…' : 'Save Agent Prompts'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Empty = use built-in default. Changes take effect on the next job run.
        </p>
      </div>
    </form>
    </>
  )
}
