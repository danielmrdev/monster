'use client'

import { useActionState } from 'react'
import { saveSettings, type SaveSettingsState } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface SettingsFormProps {
  maskedDisplay: Record<string, string>
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

export function SettingsForm({ maskedDisplay }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState<SaveSettingsState, FormData>(
    saveSettings,
    null
  )

  const errors = state?.errors

  return (
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

          {/* DataForSEO API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="dataforseo_api_key">DataForSEO API Key</Label>
            <Input
              id="dataforseo_api_key"
              name="dataforseo_api_key"
              type="password"
              autoComplete="off"
              placeholder="Enter new key to update"
              defaultValue=""
              aria-invalid={!!errors?.dataforseo_api_key}
            />
            <MaskedIndicator last4={maskedDisplay['dataforseo_api_key']} />
            <FieldError messages={errors?.dataforseo_api_key} />
          </div>

          {/* Claude API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="claude_api_key">Claude API Key</Label>
            <Input
              id="claude_api_key"
              name="claude_api_key"
              type="password"
              autoComplete="off"
              placeholder="Enter new key to update"
              defaultValue=""
              aria-invalid={!!errors?.claude_api_key}
            />
            <MaskedIndicator last4={maskedDisplay['claude_api_key']} />
            <FieldError messages={errors?.claude_api_key} />
          </div>
        </CardContent>
      </Card>

      {/* Affiliate Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Affiliate Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amazon Affiliate Tag */}
          <div className="space-y-1.5">
            <Label htmlFor="amazon_affiliate_tag">Amazon Affiliate Tag</Label>
            <Input
              id="amazon_affiliate_tag"
              name="amazon_affiliate_tag"
              type="text"
              autoComplete="off"
              placeholder="Enter new tag to update (e.g. yourtag-21)"
              defaultValue=""
              aria-invalid={!!errors?.amazon_affiliate_tag}
            />
            <MaskedIndicator last4={maskedDisplay['amazon_affiliate_tag']} />
            <FieldError messages={errors?.amazon_affiliate_tag} />
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
  )
}
