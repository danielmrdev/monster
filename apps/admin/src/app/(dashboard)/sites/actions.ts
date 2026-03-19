"use server"

// Only include non-empty customization fields

// Checkbox: present with value "true" when checked, absent when unchecked

// Refresh interval: form sends days, DB stores hours

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/service"
import { SiteCustomizationSchema } from "@monster/shared"

const CreateSiteSchema = z.object({
  name: z.string().min(1, "Site name is required"),
  domain: z.string().optional(),
  niche: z.string().optional(),
  market: z.string().optional(),
  language: z.string().optional(),
  currency: z.string().optional(),
  affiliate_tag: z.string().optional(),
  template_slug: z.string().min(1, "Template is required"),
})

export type CreateSiteErrors = {
  name?: string[]
  domain?: string[]
  niche?: string[]
  market?: string[]
  language?: string[]
  currency?: string[]
  affiliate_tag?: string[]
  template_slug?: string[]
  primaryColor?: string[]
  accentColor?: string[]
  fontFamily?: string[]
  logoUrl?: string[]
  faviconUrl?: string[]
  _form?: string[]
}

export type CreateSiteState = {
  errors?: CreateSiteErrors
} | null

export async function createSite(
  _prevState: CreateSiteState,
  formData: FormData,
): Promise<CreateSiteState> {
  const rawSite = {
    name: formData.get("name") as string,
    domain:
      formData.get("domain") as string ||
      undefined,
    niche:
      formData.get("niche") as string ||
      undefined,
    market:
      formData.get("market") as string ||
      undefined,
    language:
      formData.get("language") as string ||
      undefined,
    currency:
      formData.get("currency") as string ||
      undefined,
    affiliate_tag:
      formData.get("affiliate_tag") as string ||
      undefined,
    template_slug:
      formData.get("template_slug") as string ||
      "classic",
  }

  const rawCustomization = {
    primaryColor:
      formData.get("primaryColor") as string ||
      undefined,
    accentColor:
      formData.get("accentColor") as string ||
      undefined,
    fontFamily:
      formData.get("fontFamily") as string ||
      undefined,
    logoUrl:
      formData.get("logoUrl") as string ||
      undefined,
    faviconUrl:
      formData.get("faviconUrl") as string ||
      undefined,
  }

  const siteResult = CreateSiteSchema.safeParse(rawSite)
  const customizationResult =
    SiteCustomizationSchema.safeParse(rawCustomization)

  if (!siteResult.success || !customizationResult.success) {
    const errors: CreateSiteErrors = {}
    if (!siteResult.success) {
      const fieldErrors = siteResult.error.flatten().fieldErrors
      Object.assign(errors, fieldErrors)
    }
    if (!customizationResult.success) {
      const fieldErrors = customizationResult.error.flatten().fieldErrors
      Object.assign(errors, fieldErrors)
    }
    return { errors }
  }

  const {
    name,
    domain,
    niche,
    market,
    language,
    currency,
    affiliate_tag,
    template_slug,
  } = siteResult.data
  const customization = customizationResult.data
  const customizationJson = Object.fromEntries(
    Object.entries(customization).filter(
      ([, v]) =>
        v !==
          undefined &&
        v !==
          "",
    ),
  )

  const supabase = createServiceClient()

  const { error: insertError } = await supabase.from("sites").insert({
    site_type_slug: "tsa",
    name,
    domain:
      domain ||
      null,
    niche:
      niche ||
      null,
    market:
      market ||
      null,
    language:
      language ||
      null,
    currency:
      currency ||
      null,
    affiliate_tag:
      affiliate_tag ||
      null,
    template_slug: template_slug,
    customization:
      Object.keys(customizationJson).length >
      0
        ? customizationJson
        : null,
  })

  if (insertError) {
    throw new Error(
      `Failed to insert into sites table: ${insertError.message} (code: ${insertError.code})`,
    )
  }

  revalidatePath("/sites")
  redirect("/sites")
}

export type UpdateSiteErrors = CreateSiteErrors & {
  focus_keyword?: string[]
  homepage_seo_text?: string[]
  refresh_interval_hours?: string[]
}
export type UpdateSiteState = {
  errors?: UpdateSiteErrors
} | null

export async function updateSite(
  id: string,
  _prevState: UpdateSiteState,
  formData: FormData,
): Promise<UpdateSiteState> {
  const rawSite = {
    name: formData.get("name") as string,
    domain:
      formData.get("domain") as string ||
      undefined,
    niche:
      formData.get("niche") as string ||
      undefined,
    market:
      formData.get("market") as string ||
      undefined,
    language:
      formData.get("language") as string ||
      undefined,
    currency:
      formData.get("currency") as string ||
      undefined,
    affiliate_tag:
      formData.get("affiliate_tag") as string ||
      undefined,
    template_slug:
      formData.get("template_slug") as string ||
      "classic",
  }
  const isActive =
    formData.get("is_active") ===
    "true"
  const rawDays = parseInt(formData.get("refresh_interval_days") as string, 10)
  const refreshIntervalHours = Math.max(1, isNaN(rawDays) ? 2 : rawDays) * 24

  const rawCustomization = {
    primaryColor: formData.get("primaryColor") as string || undefined,
    accentColor: formData.get("accentColor") as string || undefined,
    fontFamily: formData.get("fontFamily") as string || undefined,
    logoUrl: formData.get("logoUrl") as string || undefined,
    faviconUrl: formData.get("faviconUrl") as string || undefined,
    faviconDir: formData.get("faviconDir") as string || undefined,
  }

  const focusKeyword = formData.get("focus_keyword") as string || null
  const homepageSeoText = formData.get("homepage_seo_text") as string || null
  const homepageMetaDescription =
    formData.get("homepage_meta_description") as string || null
  const homepageIntro = formData.get("homepage_intro") as string || null

  const siteResult = CreateSiteSchema.safeParse(rawSite)
  const customizationResult =
    SiteCustomizationSchema.safeParse(rawCustomization)

  if (!siteResult.success || !customizationResult.success) {
    const errors: UpdateSiteErrors = {}
    if (!siteResult.success) {
      const fieldErrors = siteResult.error.flatten().fieldErrors
      Object.assign(errors, fieldErrors)
    }
    if (!customizationResult.success) {
      const fieldErrors = customizationResult.error.flatten().fieldErrors
      Object.assign(errors, fieldErrors)
    }
    return { errors }
  }

  const {
    name,
    domain,
    niche,
    market,
    language,
    currency,
    affiliate_tag,
    template_slug,
  } = siteResult.data
  const customization = customizationResult.data

  const customizationJson = Object.fromEntries(
    Object.entries(customization).filter(
      ([, v]) => v !== undefined && v !== "",
    ),
  )

  const supabase = createServiceClient()

  const { error: updateError } = await supabase
    .from("sites")
    .update({
      name,
      domain: domain || null,
      niche: niche || null,
      market: market || null,
      language: language || null,
      currency: currency || null,
      affiliate_tag: affiliate_tag || null,
      template_slug: template_slug,
      customization:
        Object.keys(customizationJson).length > 0 ? customizationJson : null,
      focus_keyword: focusKeyword,
      homepage_seo_text: homepageSeoText,
      homepage_meta_description: homepageMetaDescription,
      homepage_intro: homepageIntro,
      is_active: isActive,
      refresh_interval_hours: refreshIntervalHours,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updateError) {
    throw new Error(
      `Failed to update site ${id}: ${updateError.message} (code: ${updateError.code})`,
    )
  }

  revalidatePath("/sites")
  revalidatePath(`/sites/${id}`)
  redirect(`/sites/${id}`)
}
