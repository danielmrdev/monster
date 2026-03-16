'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { TemplateFormState } from './actions'

const LEGAL_TYPES = [
  { value: 'privacy', label: 'Privacy Policy' },
  { value: 'terms', label: 'Terms of Use' },
  { value: 'cookies', label: 'Cookie Policy' },
  { value: 'contact', label: 'Contact Page' },
]

interface DefaultValues {
  title?: string
  type?: string
  language?: string
  content?: string
}

interface TemplateFormProps {
  action: (prev: TemplateFormState, formData: FormData) => Promise<TemplateFormState>
  defaultValues?: DefaultValues
  mode: 'create' | 'edit'
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>
}

export function TemplateForm({ action, defaultValues, mode }: TemplateFormProps) {
  const [state, formAction, isPending] = useActionState<TemplateFormState, FormData>(action, null)
  const errors = state?.errors

  return (
    <form action={formAction} className="space-y-5">
      {errors?._form && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors._form[0]}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
          <Input
            id="title"
            name="title"
            defaultValue={defaultValues?.title ?? ''}
            placeholder="Privacy Policy — ES"
            required
            aria-invalid={!!errors?.title}
          />
          <FieldError messages={errors?.title} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="language">Language Code <span className="text-destructive">*</span></Label>
          <Input
            id="language"
            name="language"
            defaultValue={defaultValues?.language ?? 'es'}
            placeholder="es, en, de, fr…"
            required
            aria-invalid={!!errors?.language}
          />
          <p className="text-xs text-muted-foreground">2-letter ISO code (es, en, de, fr, it…)</p>
          <FieldError messages={errors?.language} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="type">Type <span className="text-destructive">*</span></Label>
        <select
          id="type"
          name="type"
          defaultValue={defaultValues?.type ?? 'privacy'}
          required
          aria-invalid={!!errors?.type}
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {LEGAL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <FieldError messages={errors?.type} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">Content (markdown) <span className="text-destructive">*</span></Label>
        <Textarea
          id="content"
          name="content"
          defaultValue={defaultValues?.content ?? ''}
          placeholder="Write the legal page content here. You can use markdown formatting."
          rows={16}
          required
          aria-invalid={!!errors?.content}
        />
        <p className="text-xs text-muted-foreground">Markdown is supported. This content replaces the default legal page text for sites assigned this template.</p>
        <FieldError messages={errors?.content} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : mode === 'create' ? 'Create Template' : 'Save Changes'}
        </Button>
        <Link href="/templates" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  )
}
