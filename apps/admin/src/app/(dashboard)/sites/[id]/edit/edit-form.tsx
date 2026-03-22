"use client"; // kept for type reference; actual data comes from DB via props
// Logo upload state — initialized from current customization value

// Favicon upload state — initialized from current customization value
/* Basic Info */ /* Active toggle */ /* Name */ /* Domain */ /* Niche */ /* Market */ /* Language */ /* Currency */ /* Affiliate Tag */ /* Template */ /* Refresh Interval */ /* Customization */ /* Primary Color */ /* Accent Color */ /* Font Family */ /* Logo upload */ /* Favicon upload */ /* Homepage SEO */ /* Focus Keyword */ /* Meta Description */ /* Homepage Intro */ /* Homepage SEO Text */ /* Form-level error */ /* Actions */
import { useActionState, useState } from "react";
import Link from "next/link";
import { updateSite, type UpdateSiteState } from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { SiteCustomization } from "@monster/shared";

const AMAZON_MARKETS = [
  { value: "ES", label: "Spain (ES)" },
  { value: "US", label: "United States (US)" },
  { value: "UK", label: "United Kingdom (UK)" },
  { value: "DE", label: "Germany (DE)" },
  { value: "FR", label: "France (FR)" },
  { value: "IT", label: "Italy (IT)" },
  { value: "MX", label: "Mexico (MX)" },
  { value: "CA", label: "Canada (CA)" },
  { value: "JP", label: "Japan (JP)" },
  { value: "AU", label: "Australia (AU)" },
];

const LANGUAGES = [
  { value: "es", label: "Spanish (es)" },
  { value: "en", label: "English (en)" },
  { value: "de", label: "German (de)" },
  { value: "fr", label: "French (fr)" },
  { value: "it", label: "Italian (it)" },
  { value: "ja", label: "Japanese (ja)" },
];

const CURRENCIES = [
  { value: "EUR", label: "Euro (EUR)" },
  { value: "USD", label: "US Dollar (USD)" },
  { value: "GBP", label: "British Pound (GBP)" },
  { value: "MXN", label: "Mexican Peso (MXN)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
  { value: "JPY", label: "Japanese Yen (JPY)" },
  { value: "AUD", label: "Australian Dollar (AUD)" },
];

const TEMPLATES: { value: string; label: string }[] = [];

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>;
}

function NativeSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  );
}

interface EditFormProps {
  site: {
    id: string;
    name: string;
    domain: string | null;
    niche: string | null;
    market: string | null;
    language: string | null;
    currency: string | null;
    affiliate_tag: string | null;
    template_slug: string | null;
    customization: SiteCustomization | null;
    focus_keyword: string | null;
    homepage_seo_text: string | null;
    homepage_meta_description: string | null;
    homepage_intro: string | null;
    is_active: boolean;
    refresh_interval_hours: number;
  };
  templates: { value: string; label: string }[];
}

export function EditForm({ site, templates }: EditFormProps) {
  const updateSiteWithId = updateSite.bind(null, site.id);
  const [state, formAction, isPending] = useActionState<UpdateSiteState, FormData>(
    updateSiteWithId,
    null,
  );

  const errors = state?.errors;
  const c = site.customization;
  const [logoUploadState, setLogoUploadState] = useState<{
    uploading: boolean;
    path: string | null;
    error: string | null;
  }>({
    uploading: false,
    path: c?.logoUrl ?? null,
    error: null,
  });
  const [faviconUploadState, setFaviconUploadState] = useState<{
    uploading: boolean;
    path: string | null;
    error: string | null;
  }>({ uploading: false, path: c?.faviconDir ?? null, error: null });

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploadState({ uploading: true, path: null, error: null });
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/sites/${site.id}/upload-logo`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setLogoUploadState({
          uploading: false,
          path: null,
          error: json.error ?? "Upload failed",
        });
      } else {
        setLogoUploadState({
          uploading: false,
          path: json.logoUrl,
          error: null,
        });
      }
    } catch {
      setLogoUploadState({
        uploading: false,
        path: null,
        error: "Upload failed",
      });
    }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaviconUploadState({ uploading: true, path: null, error: null });
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/sites/${site.id}/upload-favicon`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setFaviconUploadState({
          uploading: false,
          path: null,
          error: json.error ?? "Upload failed",
        });
      } else {
        setFaviconUploadState({
          uploading: false,
          path: json.faviconDir,
          error: null,
        });
      }
    } catch {
      setFaviconUploadState({
        uploading: false,
        path: null,
        error: "Upload failed",
      });
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Site active</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inactive sites are excluded from all automated jobs (product refresh, generate,
                deploy)
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="is_active"
                value="true"
                defaultChecked={site.is_active}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
              <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {}
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Site Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={site.name}
                placeholder="My Amazon Site"
                required
                aria-invalid={!!errors?.name}
              />
              <FieldError messages={errors?.name} />
            </div>

            {}
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                name="domain"
                defaultValue={site.domain ?? ""}
                placeholder="mysite.com"
                aria-invalid={!!errors?.domain}
              />
              <FieldError messages={errors?.domain} />
            </div>
          </div>

          {}
          <div className="space-y-1.5">
            <Label htmlFor="niche">Niche</Label>
            <Textarea
              id="niche"
              name="niche"
              defaultValue={site.niche ?? ""}
              placeholder="Describe the site niche (e.g. camping gear for families)"
              rows={2}
              aria-invalid={!!errors?.niche}
            />
            <FieldError messages={errors?.niche} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {}
            <div className="space-y-1.5">
              <Label htmlFor="market">Amazon Market</Label>
              <NativeSelect name="market" defaultValue={site.market ?? ""}>
                <option value="">— Select market —</option>
                {AMAZON_MARKETS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.market} />
            </div>

            {}
            <div className="space-y-1.5">
              <Label htmlFor="language">Language</Label>
              <NativeSelect name="language" defaultValue={site.language ?? ""}>
                <option value="">— Select language —</option>
                {LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.language} />
            </div>

            {}
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <NativeSelect name="currency" defaultValue={site.currency ?? ""}>
                <option value="">— Select currency —</option>
                {CURRENCIES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.currency} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {}
            <div className="space-y-1.5">
              <Label htmlFor="affiliate_tag">Affiliate Tag</Label>
              <Input
                id="affiliate_tag"
                name="affiliate_tag"
                defaultValue={site.affiliate_tag ?? ""}
                placeholder="yourtag-21"
                aria-invalid={!!errors?.affiliate_tag}
              />
              <FieldError messages={errors?.affiliate_tag} />
            </div>

            {}
            <div className="space-y-1.5">
              <Label htmlFor="template_slug">
                Template <span className="text-destructive">*</span>
              </Label>
              <NativeSelect name="template_slug" defaultValue={site.template_slug ?? "tsa/classic"}>
                {templates.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.template_slug} />
            </div>
          </div>

          {}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-1">
            <div className="space-y-1.5">
              <Label htmlFor="refresh_interval_days">Refresh Interval (days)</Label>
              <Input
                id="refresh_interval_days"
                name="refresh_interval_days"
                type="number"
                min={1}
                defaultValue={Math.round(site.refresh_interval_hours / 24)}
                aria-invalid={!!errors?.refresh_interval_hours}
              />
              <p className="text-xs text-muted-foreground">
                How often product data is refreshed (minimum 1 day)
              </p>
              <FieldError messages={errors?.refresh_interval_hours} />
            </div>
          </div>
        </CardContent>
      </Card>

      {}
      <Card>
        <CardHeader>
          <CardTitle>Customization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {}
            <div className="space-y-1.5">
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="primaryColorPicker"
                  defaultValue={c?.primaryColor ?? "#2563eb"}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  onChange={(e) => {
                    const textInput = document.getElementById(
                      "primaryColor",
                    ) as HTMLInputElement | null;
                    if (textInput) textInput.value = e.target.value;
                  }}
                />
                <Input
                  id="primaryColor"
                  name="primaryColor"
                  defaultValue={c?.primaryColor ?? "#2563eb"}
                  placeholder="#2563eb"
                  aria-invalid={!!errors?.primaryColor}
                  className="flex-1"
                />
              </div>
              <FieldError messages={errors?.primaryColor} />
            </div>

            {}
            <div className="space-y-1.5">
              <Label htmlFor="accentColor">Accent Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="accentColorPicker"
                  defaultValue={c?.accentColor ?? "#f59e0b"}
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  onChange={(e) => {
                    const textInput = document.getElementById(
                      "accentColor",
                    ) as HTMLInputElement | null;
                    if (textInput) textInput.value = e.target.value;
                  }}
                />
                <Input
                  id="accentColor"
                  name="accentColor"
                  defaultValue={c?.accentColor ?? "#f59e0b"}
                  placeholder="#f59e0b"
                  aria-invalid={!!errors?.accentColor}
                  className="flex-1"
                />
              </div>
              <FieldError messages={errors?.accentColor} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {}
            <div className="space-y-1.5">
              <Label htmlFor="fontFamily">Font Family</Label>
              <Input
                id="fontFamily"
                name="fontFamily"
                defaultValue={c?.fontFamily ?? ""}
                placeholder="Inter"
                aria-invalid={!!errors?.headingFont}
              />
              <FieldError messages={errors?.headingFont} />
            </div>

            {}
            <div className="space-y-1.5">
              <Label>Logo (PNG or JPEG)</Label>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleLogoUpload}
                disabled={logoUploadState.uploading}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
              />
              {logoUploadState.uploading && (
                <p className="text-sm text-muted-foreground">Uploading…</p>
              )}
              {logoUploadState.path && !logoUploadState.uploading && (
                <p className="text-sm text-green-600 truncate">✓ {logoUploadState.path}</p>
              )}
              {logoUploadState.error && (
                <p className="text-sm text-destructive">{logoUploadState.error}</p>
              )}
              <input type="hidden" name="logoUrl" value={logoUploadState.path ?? ""} />
            </div>

            {}
            <div className="space-y-1.5">
              <Label>Favicon (favicon.io ZIP)</Label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={handleFaviconUpload}
                disabled={faviconUploadState.uploading}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
              />
              {faviconUploadState.uploading && (
                <p className="text-sm text-muted-foreground">Uploading…</p>
              )}
              {faviconUploadState.path && !faviconUploadState.uploading && (
                <p className="text-sm text-green-600 truncate">✓ {faviconUploadState.path}</p>
              )}
              {faviconUploadState.error && (
                <p className="text-sm text-destructive">{faviconUploadState.error}</p>
              )}
              <input type="hidden" name="faviconDir" value={faviconUploadState.path ?? ""} />
            </div>
          </div>
        </CardContent>
      </Card>

      {}
      <Card>
        <CardHeader>
          <CardTitle>Homepage SEO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {}
          <div className="space-y-1.5">
            <Label htmlFor="focus_keyword">Focus Keyword</Label>
            <Input
              id="focus_keyword"
              name="focus_keyword"
              defaultValue={site.focus_keyword ?? ""}
              placeholder="e.g. camping gear for families"
              aria-invalid={!!errors?.focus_keyword}
            />
            <FieldError messages={errors?.focus_keyword} />
          </div>

          {}
          <div className="space-y-1.5">
            <Label htmlFor="homepage_meta_description">Meta Description</Label>
            <Textarea
              id="homepage_meta_description"
              name="homepage_meta_description"
              defaultValue={site.homepage_meta_description ?? ""}
              placeholder="Under 155 characters — shown in Google search results."
              rows={2}
            />
          </div>

          {}
          <div className="space-y-1.5">
            <Label htmlFor="homepage_intro">Intro (below H1, above categories)</Label>
            <Textarea
              id="homepage_intro"
              name="homepage_intro"
              defaultValue={site.homepage_intro ?? ""}
              placeholder="1 sentence shown below the title and above the category grid. ~120-160 characters."
              rows={2}
            />
          </div>

          {}
          <div className="space-y-1.5">
            <Label htmlFor="homepage_seo_text">SEO Text (bottom of page)</Label>
            <Textarea
              id="homepage_seo_text"
              name="homepage_seo_text"
              defaultValue={site.homepage_seo_text ?? ""}
              placeholder="~400-word SEO text rendered at the bottom of the homepage."
              rows={10}
              aria-invalid={!!errors?.homepage_seo_text}
            />
            <FieldError messages={errors?.homepage_seo_text} />
          </div>
        </CardContent>
      </Card>

      {}
      {errors?._form && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors._form[0]}
        </div>
      )}

      {}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
        <Link
          href={`/sites/${site.id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
