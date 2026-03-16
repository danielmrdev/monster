'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'

const TemplateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.enum(['privacy', 'terms', 'cookies', 'contact']),
  language: z.string().min(2, 'Language code required'),
  content: z.string().min(10, 'Content is required'),
})

export type TemplateFormState = {
  errors?: {
    title?: string[]
    type?: string[]
    language?: string[]
    content?: string[]
    _form?: string[]
  }
  success?: boolean
} | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any

export async function createTemplate(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const raw = {
    title: formData.get('title') as string,
    type: formData.get('type') as string,
    language: formData.get('language') as string,
    content: formData.get('content') as string,
  }

  const result = TemplateSchema.safeParse(raw)
  if (!result.success) return { errors: result.error.flatten().fieldErrors }

  const { error } = await db()
    .from('legal_templates')
    .insert({ ...result.data, updated_at: new Date().toISOString() })

  if (error) return { errors: { _form: [error.message] } }

  revalidatePath('/templates')
  redirect('/templates')
}

export async function updateTemplate(
  id: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const raw = {
    title: formData.get('title') as string,
    type: formData.get('type') as string,
    language: formData.get('language') as string,
    content: formData.get('content') as string,
  }

  const result = TemplateSchema.safeParse(raw)
  if (!result.success) return { errors: result.error.flatten().fieldErrors }

  const { error } = await db()
    .from('legal_templates')
    .update({ ...result.data, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { errors: { _form: [error.message] } }

  revalidatePath('/templates')
  redirect('/templates')
}

export async function deleteTemplate(id: string): Promise<void> {
  await db().from('legal_templates').delete().eq('id', id)
  revalidatePath('/templates')
}
