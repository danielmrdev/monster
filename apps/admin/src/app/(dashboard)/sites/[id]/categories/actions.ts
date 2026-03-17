'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

export type CategoryFormState = {
  errors?: {
    name?: string[]
    slug?: string[]
    description?: string[]
    meta_description?: string[]
    seo_text?: string[]
    focus_keyword?: string[]
    keywords?: string[]
    _form?: string[]
  }
  success?: boolean
} | null

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCategory(
  siteId: string,
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const slugRaw = (formData.get('slug') as string | null)?.trim() ?? ''
  const slug = slugRaw || slugify(name)
  const description = (formData.get('description') as string | null)?.trim() || null
  const seo_text = (formData.get('seo_text') as string | null)?.trim() || null
  const focus_keyword = (formData.get('focus_keyword') as string | null)?.trim() || null
  const keywordsRaw = (formData.get('keywords') as string | null)?.trim() || ''
  const keywords = keywordsRaw
    ? keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean)
    : null

  const errors: NonNullable<CategoryFormState>['errors'] = {}
  if (!name) errors.name = ['Name is required']
  if (!slug) errors.slug = ['Slug is required']
  if (Object.keys(errors).length) return { errors }

  const supabase = createServiceClient()
  const { error } = await supabase.from('tsa_categories').insert({
    site_id: siteId,
    name,
    slug,
    description,
    seo_text,
    focus_keyword,
    keywords,
  })

  if (error) {
    if (error.code === '23505') return { errors: { slug: ['Slug already exists for this site'] } }
    return { errors: { _form: [error.message] } }
  }

  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCategory(
  siteId: string,
  categoryId: string,
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const slugRaw = (formData.get('slug') as string | null)?.trim() ?? ''
  const slug = slugRaw || slugify(name)
  const description = (formData.get('description') as string | null)?.trim() || null
  const meta_description = (formData.get('meta_description') as string | null)?.trim() || null
  const seo_text = (formData.get('seo_text') as string | null)?.trim() || null
  const focus_keyword = (formData.get('focus_keyword') as string | null)?.trim() || null
  const keywordsRaw = (formData.get('keywords') as string | null)?.trim() || ''
  const keywords = keywordsRaw
    ? keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean)
    : null

  const errors: NonNullable<CategoryFormState>['errors'] = {}
  if (!name) errors.name = ['Name is required']
  if (!slug) errors.slug = ['Slug is required']
  if (Object.keys(errors).length) return { errors }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('tsa_categories')
    .update({
      name,
      slug,
      // meta_description (D057) maps to the `description` column; prefer it over the legacy description field
      description: meta_description ?? description,
      seo_text,
      focus_keyword,
      keywords,
    })
    .eq('id', categoryId)
    .eq('site_id', siteId)

  if (error) {
    if (error.code === '23505') return { errors: { slug: ['Slug already exists for this site'] } }
    return { errors: { _form: [error.message] } }
  }

  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteCategory(siteId: string, categoryId: string) {
  const supabase = createServiceClient()
  await supabase.from('tsa_categories').delete().eq('id', categoryId).eq('site_id', siteId)
  revalidatePath(`/sites/${siteId}`)
}
