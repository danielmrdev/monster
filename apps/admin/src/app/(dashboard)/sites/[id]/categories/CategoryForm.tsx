'use client'

import { useActionState, useEffect, useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { CategoryFormState } from './actions'

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface CategoryFormProps {
  siteId: string
  categoryId?: string  // present in edit mode; absent in create mode
  action: (prev: CategoryFormState, formData: FormData) => Promise<CategoryFormState>
  defaultValues?: {
    name?: string
    slug?: string
    description?: string
    seo_text?: string
    focus_keyword?: string
    keywords?: string[] | null
  }
  mode: 'create' | 'edit'
}

export function CategoryForm({ siteId, categoryId, action, defaultValues, mode }: CategoryFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<CategoryFormState, FormData>(action, null)
  const [isGenerating, startGenerate] = useTransition()
  const [generateError, setGenerateError] = useState<string | null>(null)
  const seoTextRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (state?.success) {
      router.push(`/sites/${siteId}#categories`)
      router.refresh()
    }
  }, [state?.success, router, siteId])

  function generateSeoText() {
    if (!categoryId) return
    setGenerateError(null)
    startGenerate(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/generate-seo-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'category_seo_text', contextId: categoryId }),
        })

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => `HTTP ${res.status}`)
          setGenerateError(text)
          return
        }

        // Clear existing text and stream in the new content
        if (seoTextRef.current) seoTextRef.current.value = ''

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'text' && event.text && seoTextRef.current) {
                seoTextRef.current.value += event.text
              } else if (event.type === 'error') {
                setGenerateError(event.error ?? 'Generation failed')
              }
            } catch { /* ignore parse errors */ }
          }
        }
      } catch (e) {
        setGenerateError(e instanceof Error ? e.message : 'Generation failed')
      }
    })
  }

  const errors = state?.errors

  return (
    <form action={formAction} className="space-y-5">
      {/* Name + Slug */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaultValues?.name ?? ''}
            placeholder="Air Fryers"
            required
            aria-invalid={!!errors?.name}
            onChange={(e) => {
              if (mode === 'create') {
                const slugInput = document.getElementById('slug') as HTMLInputElement | null
                if (slugInput && !slugInput.dataset.touched) {
                  slugInput.value = slugify(e.target.value)
                }
              }
            }}
          />
          <FieldError messages={errors?.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">
            Slug <span className="text-destructive">*</span>
          </Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={defaultValues?.slug ?? ''}
            placeholder="air-fryers"
            required
            aria-invalid={!!errors?.slug}
            onInput={(e) => {
              ;(e.currentTarget as HTMLInputElement).dataset.touched = '1'
            }}
          />
          <FieldError messages={errors?.slug} />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description ?? ''}
          placeholder="Short description of this category"
          rows={2}
        />
      </div>

      {/* Focus keyword */}
      <div className="space-y-1.5">
        <Label htmlFor="focus_keyword">Focus Keyword</Label>
        <Input
          id="focus_keyword"
          name="focus_keyword"
          defaultValue={defaultValues?.focus_keyword ?? ''}
          placeholder="best air fryers"
        />
        <p className="text-xs text-muted-foreground">Main SEO keyword for this category page.</p>
      </div>

      {/* Keywords */}
      <div className="space-y-1.5">
        <Label htmlFor="keywords">Keywords</Label>
        <Input
          id="keywords"
          name="keywords"
          defaultValue={defaultValues?.keywords?.join(', ') ?? ''}
          placeholder="air fryer, freidora de aire, hot air fryer"
        />
        <p className="text-xs text-muted-foreground">Comma-separated list of related keywords.</p>
      </div>

      {/* SEO text */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="seo_text">SEO Text</Label>
          {mode === 'edit' && categoryId && (
            <button
              type="button"
              onClick={generateSeoText}
              disabled={isGenerating}
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  </svg>
                  Generate with AI
                </>
              )}
            </button>
          )}
        </div>
        <Textarea
          ref={seoTextRef}
          id="seo_text"
          name="seo_text"
          defaultValue={defaultValues?.seo_text ?? ''}
          placeholder="~400-word SEO text for this category page. Will be generated by AI if left empty."
          rows={8}
        />
        {generateError && (
          <p className="text-xs text-destructive">{generateError}</p>
        )}
      </div>

      {/* Form-level error */}
      {errors?._form && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors._form[0]}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : mode === 'create' ? 'Create Category' : 'Save Changes'}
        </Button>
        <Link
          href={`/sites/${siteId}#categories`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
