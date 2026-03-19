"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createSite, type CreateSiteState } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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

const TEMPLATES: { value: string; label: string }[] = []; // kept for type reference; actual data comes from DB via props

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>;
}

function NativeSelect({
  name,
  defaultValue,
  children,
  className,
}: {
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={
        "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 " +
        (className ?? "")
      }
    >
      {children}
    </select>
  );
}

export function SiteForm({
  defaultValues,
  templates = [],
}: {
  defaultValues?: { niche?: string; market?: string };
  templates?: { value: string; label: string }[];
} = {}) {
  const [state, formAction, isPending] = useActionState<CreateSiteState, FormData>(
    createSite,
    null,
  );

  const errors = state?.errors;

  return (
    <form action={formAction} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Site Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                placeholder="My Amazon Site"
                required
                aria-invalid={!!errors?.name}
              />
              <FieldError messages={errors?.name} />
            </div>

            {/* Domain */}
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                name="domain"
                placeholder="mysite.com"
                aria-invalid={!!errors?.domain}
              />
              <FieldError messages={errors?.domain} />
            </div>
          </div>

          {/* Niche */}
          <div className="space-y-1.5">
            <Label htmlFor="niche">Niche</Label>
            <Textarea
              id="niche"
              name="niche"
              placeholder="Describe the site niche (e.g. camping gear for families)"
              rows={2}
              defaultValue={defaultValues?.niche ?? ""}
              aria-invalid={!!errors?.niche}
            />
            <FieldError messages={errors?.niche} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Market */}
            <div className="space-y-1.5">
              <Label htmlFor="market">Amazon Market</Label>
              <NativeSelect name="market" defaultValue={defaultValues?.market ?? ""}>
                <option value="">— Select market —</option>
                {AMAZON_MARKETS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.market} />
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <Label htmlFor="language">Language</Label>
              <NativeSelect name="language" defaultValue="">
                <option value="">— Select language —</option>
                {LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.language} />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <NativeSelect name="currency" defaultValue="">
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
            {/* Affiliate Tag */}
            <div className="space-y-1.5">
              <Label htmlFor="affiliate_tag">Affiliate Tag</Label>
              <Input
                id="affiliate_tag"
                name="affiliate_tag"
                placeholder="yourtag-21"
                aria-invalid={!!errors?.affiliate_tag}
              />
              <FieldError messages={errors?.affiliate_tag} />
            </div>

            {/* Template */}
            <div className="space-y-1.5">
              <Label htmlFor="template_slug">
                Template <span className="text-destructive">*</span>
              </Label>
              <NativeSelect
                name="template_slug"
                defaultValue={templates[0]?.value ?? "tsa/classic"}
              >
                {templates.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.template_slug} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customization */}
      <Card>
        <CardHeader>
          <CardTitle>Customization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Primary Color */}
            <div className="space-y-1.5">
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="primaryColorPicker"
                  defaultValue="#2563eb"
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
                  placeholder="#2563eb"
                  defaultValue="#2563eb"
                  aria-invalid={!!errors?.primaryColor}
                  className="flex-1"
                />
              </div>
              <FieldError messages={errors?.primaryColor} />
            </div>

            {/* Accent Color */}
            <div className="space-y-1.5">
              <Label htmlFor="accentColor">Accent Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="accentColorPicker"
                  defaultValue="#f59e0b"
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
                  placeholder="#f59e0b"
                  defaultValue="#f59e0b"
                  aria-invalid={!!errors?.accentColor}
                  className="flex-1"
                />
              </div>
              <FieldError messages={errors?.accentColor} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Font Family */}
            <div className="space-y-1.5">
              <Label htmlFor="fontFamily">Font Family</Label>
              <Input
                id="fontFamily"
                name="fontFamily"
                placeholder="Inter"
                aria-invalid={!!errors?.fontFamily}
              />
              <FieldError messages={errors?.fontFamily} />
            </div>

            {/* Logo URL */}
            <div className="space-y-1.5">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                placeholder="https://..."
                aria-invalid={!!errors?.logoUrl}
              />
              <FieldError messages={errors?.logoUrl} />
            </div>

            {/* Favicon URL */}
            <div className="space-y-1.5">
              <Label htmlFor="faviconUrl">Favicon URL</Label>
              <Input
                id="faviconUrl"
                name="faviconUrl"
                placeholder="https://..."
                aria-invalid={!!errors?.faviconUrl}
              />
              <FieldError messages={errors?.faviconUrl} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form-level error */}
      {errors?._form && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors._form[0]}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create Site"}
        </Button>
        <Link
          href="/sites"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
