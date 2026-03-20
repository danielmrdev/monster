"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  saveSettings,
  saveAgentPrompts,
  type SaveSettingsState,
  type SaveAgentPromptsState,
} from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeleteTemplateButton } from "@/app/(dashboard)/templates/DeleteTemplateButton";

interface AgentKeyConfig {
  key: string;
  label: string;
  hint: string;
}

interface Template {
  id: string;
  title: string;
  type: string;
  language: string;
  updated_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Use",
  cookies: "Cookie Policy",
  contact: "Contact",
};

interface SettingsFormProps {
  maskedDisplay: Record<string, string>;
  agentPrompts: Record<string, string>;
  agentKeys: AgentKeyConfig[];
  defaultPrompts: Record<string, string>;
  legalTemplates: Template[];
}

function MaskedIndicator({ last4 }: { last4?: string }) {
  if (!last4) return null;
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Currently set <span className="font-mono">••••••{last4}</span>
    </p>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>;
}

export function SettingsForm({
  maskedDisplay,
  agentPrompts,
  agentKeys,
  defaultPrompts,
  legalTemplates,
}: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState<SaveSettingsState, FormData>(
    saveSettings,
    null,
  );
  const [promptState, promptFormAction, promptPending] = useActionState<
    SaveAgentPromptsState,
    FormData
  >(saveAgentPrompts, null);

  const errors = state?.errors;

  return (
    <Tabs defaultValue="api-keys" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        <TabsTrigger value="ai-prompts">AI Prompts</TabsTrigger>
        <TabsTrigger value="legal-templates">Plantillas Legales</TabsTrigger>
      </TabsList>

      {/* ── Tab: API Keys ─────────────────────────────────────────────────── */}
      <TabsContent value="api-keys">
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

          {/* Anthropic */}
          <Card>
            <CardHeader>
              <CardTitle>Anthropic</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Used for direct Claude API calls (ContentGenerator batch jobs). Monster Chat and
                NicheResearcher use the system claude CLI token — this key is only needed for BullMQ
                content generation jobs.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="anthropic_api_key">Anthropic API Key</Label>
                <Input
                  id="anthropic_api_key"
                  name="anthropic_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder="sk-ant-…"
                  defaultValue=""
                  aria-invalid={!!errors?.anthropic_api_key}
                />
                <MaskedIndicator last4={maskedDisplay["anthropic_api_key"]} />
                <FieldError messages={errors?.anthropic_api_key} />
              </div>
            </CardContent>
          </Card>

          {/* Spaceship */}
          <Card>
            <CardHeader>
              <CardTitle>Spaceship</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Domain registration and DNS management. Required for domain availability checks and
                registration from the site detail page.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="spaceship_api_key">API Key</Label>
                <Input
                  id="spaceship_api_key"
                  name="spaceship_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder="Enter new key to update"
                  defaultValue=""
                  aria-invalid={!!errors?.spaceship_api_key}
                />
                <MaskedIndicator last4={maskedDisplay["spaceship_api_key"]} />
                <FieldError messages={errors?.spaceship_api_key} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spaceship_api_secret">API Secret</Label>
                <Input
                  id="spaceship_api_secret"
                  name="spaceship_api_secret"
                  type="password"
                  autoComplete="off"
                  placeholder="Enter new secret to update"
                  defaultValue=""
                  aria-invalid={!!errors?.spaceship_api_secret}
                />
                <MaskedIndicator last4={maskedDisplay["spaceship_api_secret"]} />
                <FieldError messages={errors?.spaceship_api_secret} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spaceship_contact_id">Contact ID</Label>
                <Input
                  id="spaceship_contact_id"
                  name="spaceship_contact_id"
                  type="text"
                  autoComplete="off"
                  placeholder="27–32 character alphanumeric ID"
                  defaultValue=""
                  aria-invalid={!!errors?.spaceship_contact_id}
                />
                <MaskedIndicator last4={maskedDisplay["spaceship_contact_id"]} />
                <p className="text-xs text-muted-foreground">
                  Find it in Spaceship account → Contacts.
                </p>
                <FieldError messages={errors?.spaceship_contact_id} />
              </div>
            </CardContent>
          </Card>

          {/* DataForSEO */}
          <Card>
            <CardHeader>
              <CardTitle>DataForSEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Keyword research, SERP analysis, and Amazon product data. Used by NicheResearcher
                and the product refresh pipeline.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="dataforseo_api_key">API Credentials</Label>
                <Input
                  id="dataforseo_api_key"
                  name="dataforseo_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder="email:password (e.g. user@example.com:27e3bcf9…)"
                  defaultValue=""
                  aria-invalid={!!errors?.dataforseo_api_key}
                />
                <MaskedIndicator last4={maskedDisplay["dataforseo_api_key"]} />
                <FieldError messages={errors?.dataforseo_api_key} />
              </div>
            </CardContent>
          </Card>

          {/* Hetzner */}
          <Card>
            <CardHeader>
              <CardTitle>Hetzner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Cloud server provisioning. Used by the Infrastructure page to provision new VPS
                servers via the Hetzner Cloud API.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="hetzner_api_token">API Token</Label>
                <Input
                  id="hetzner_api_token"
                  name="hetzner_api_token"
                  type="password"
                  autoComplete="off"
                  placeholder="Enter new token to update"
                  defaultValue=""
                  aria-invalid={!!errors?.hetzner_api_token}
                />
                <MaskedIndicator last4={maskedDisplay["hetzner_api_token"]} />
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
              <div className="space-y-1.5">
                <Label htmlFor="cloudflare_api_token">API Token</Label>
                <Input
                  id="cloudflare_api_token"
                  name="cloudflare_api_token"
                  type="password"
                  autoComplete="off"
                  placeholder="Enter new token to update"
                  defaultValue=""
                  aria-invalid={!!errors?.cloudflare_api_token}
                />
                <MaskedIndicator last4={maskedDisplay["cloudflare_api_token"]} />
                <FieldError messages={errors?.cloudflare_api_token} />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Settings"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Leave a field empty to keep the current value.
            </p>
          </div>
        </form>
      </TabsContent>

      {/* ── Tab: AI Prompts ───────────────────────────────────────────────── */}
      <TabsContent value="ai-prompts">
        <form action={promptFormAction} className="space-y-6">
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
                Override the default system prompts for each agent. Leave a field empty to restore
                the built-in default. Changes take effect on the next job run or chat session.
              </p>
              {agentKeys.map(({ key, label, hint }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`agent_prompt_${key}`}>{label}</Label>
                  <Textarea
                    id={`agent_prompt_${key}`}
                    name={`agent_prompt_${key}`}
                    defaultValue={agentPrompts[key] ?? defaultPrompts[key] ?? ""}
                    placeholder={`Leave empty to use the built-in default prompt for ${label}.`}
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={promptPending}>
              {promptPending ? "Saving…" : "Save Agent Prompts"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Empty = use built-in default. Changes take effect on the next job run.
            </p>
          </div>
        </form>
      </TabsContent>

      {/* ── Tab: Plantillas Legales ───────────────────────────────────────── */}
      <TabsContent value="legal-templates">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Plantillas Legales</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reusable legal page templates. Assign them to sites in the site edit page.
              </p>
            </div>
            <Link
              href="/templates/new"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              + New Template
            </Link>
          </div>

          {legalTemplates.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No templates yet.</p>
              <Link href="/templates/new" className="text-sm text-primary hover:underline mt-2 block">
                Create your first template →
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {["privacy", "terms", "cookies", "contact"].map((type) => {
                const byType = legalTemplates.filter((t) => t.type === type);
                return (
                  <div
                    key={type}
                    className="rounded-xl border border-border bg-card divide-y divide-border"
                  >
                    <div className="px-5 py-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {TYPE_LABELS[type] ?? type}
                      </h3>
                    </div>
                    {byType.length === 0 ? (
                      <div className="px-5 py-4">
                        <p className="text-xs text-muted-foreground">No templates for this type.</p>
                      </div>
                    ) : (
                      byType.map((t) => (
                        <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Language: <span className="font-mono">{t.language}</span>
                              {" · "}Updated {new Date(t.updated_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Link
                              href={`/templates/${t.id}/edit`}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Edit
                            </Link>
                            <DeleteTemplateButton id={t.id} title={t.title} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
