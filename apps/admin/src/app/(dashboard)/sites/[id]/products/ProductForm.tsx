'use client'

import { useActionState, useEffect, useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { ProductFormState } from './actions'

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>
}

interface Category {
  id: string
  name: string
  slug: string
}

interface AsinData {
  asin: string
  title: string | null
  imageUrl: string | null
  price: number | null
  rating: number
  reviewCount: number
  isPrime: boolean
}

interface ProductFormProps {
  siteId: string
  productId?: string  // present in edit mode
  categories: Category[]
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>
  defaultValues?: {
    asin?: string
    title?: string | null
    slug?: string | null
    current_price?: number | null
    rating?: number | null
    review_count?: number | null
    is_prime?: boolean
    source_image_url?: string | null
    focus_keyword?: string | null
    category_ids?: string[]
  }
  mode: 'create' | 'edit'
}

export function ProductForm({ siteId, productId, categories, action, defaultValues, mode }: ProductFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<ProductFormState, FormData>(action, null)
  const [lookupPending, startLookup] = useTransition()
  const [isGenerating, startGenerate] = useTransition()
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generatedDescription, setGeneratedDescription] = useState<string>('')
  const descPreviewRef = useRef<HTMLTextAreaElement>(null)

  const [asinData, setAsinData] = useState<AsinData | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    defaultValues?.category_ids ?? []
  )

  // Pre-populate image preview for edit mode
  const [imagePreview, setImagePreview] = useState<string | null>(
    defaultValues?.source_image_url ?? null
  )

  useEffect(() => {
    if (state?.success) {
      router.push(`/sites/${siteId}#products`)
      router.refresh()
    }
  }, [state?.success, router, siteId])

  function handleLookup() {
    const asinInput = document.getElementById('asin') as HTMLInputElement | null
    const asin = asinInput?.value?.trim().toUpperCase()
    if (!asin) return

    setLookupError(null)
    setAsinData(null)

    startLookup(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/asin-lookup?asin=${encodeURIComponent(asin)}`)
        const data = await res.json()
        if (!res.ok) {
          setLookupError(data.error ?? 'Lookup failed')
          return
        }
        setAsinData(data as AsinData)
        setImagePreview(data.imageUrl ?? null)

        // Auto-fill form fields
        const titleInput = document.getElementById('title') as HTMLInputElement | null
        const priceInput = document.getElementById('current_price') as HTMLInputElement | null
        const ratingInput = document.getElementById('rating') as HTMLInputElement | null
        const reviewInput = document.getElementById('review_count') as HTMLInputElement | null
        const primeInput = document.getElementById('is_prime') as HTMLSelectElement | null

        if (titleInput && data.title) titleInput.value = data.title
        if (priceInput && data.price != null) priceInput.value = String(data.price)
        if (ratingInput && data.rating != null) ratingInput.value = String(data.rating)
        if (reviewInput && data.reviewCount != null) reviewInput.value = String(data.reviewCount)
        if (primeInput) primeInput.value = data.isPrime ? 'true' : 'false'

        // Auto-set source image url hidden input
        const imgUrlInput = document.getElementById('source_image_url') as HTMLInputElement | null
        if (imgUrlInput && data.imageUrl) imgUrlInput.value = data.imageUrl
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  function generateDescription() {
    if (!productId) return
    setGenerateError(null)
    setGeneratedDescription('')
    startGenerate(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/generate-seo-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'product_description', contextId: productId }),
        })

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => `HTTP ${res.status}`)
          setGenerateError(text)
          return
        }

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
              if (event.type === 'text' && event.text) {
                setGeneratedDescription((prev) => prev + event.text)
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

  function toggleCategory(id: string) {    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const errors = state?.errors

  return (
    <form action={formAction} className="space-y-5">
      {/* ASIN lookup */}
      <div className="space-y-1.5">
        <Label htmlFor="asin">
          ASIN <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="asin"
            name="asin"
            defaultValue={defaultValues?.asin ?? ''}
            placeholder="B08F6ZRWPM"
            className="font-mono uppercase"
            readOnly={mode === 'edit'}
            aria-invalid={!!errors?.asin}
          />
          {mode === 'create' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleLookup}
              disabled={lookupPending}
            >
              {lookupPending ? 'Looking up…' : 'Lookup'}
            </Button>
          )}
        </div>
        <FieldError messages={errors?.asin} />
        {lookupError && (
          <p className="text-xs text-destructive">{lookupError}</p>
        )}
        {asinData && (
          <p className="text-xs text-emerald-400">
            ✓ Found: {asinData.title ?? asinData.asin}
          </p>
        )}
      </div>

      {/* Image preview + URL */}
      <div className="flex gap-4 items-start">
        {imagePreview && (
          <div className="shrink-0 rounded-lg border border-border overflow-hidden w-20 h-20 bg-muted/30">
            <Image
              src={imagePreview}
              alt="Product image"
              width={80}
              height={80}
              className="object-contain w-full h-full"
              unoptimized
            />
          </div>
        )}
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="source_image_url">Image URL</Label>
          <Input
            id="source_image_url"
            name="source_image_url"
            defaultValue={defaultValues?.source_image_url ?? ''}
            placeholder="https://..."
            onChange={(e) => setImagePreview(e.target.value || null)}
          />
          <p className="text-xs text-muted-foreground">Auto-filled from ASIN lookup. Will be downloaded and optimized on generation.</p>
        </div>
      </div>

      {/* Title + Slug */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={defaultValues?.title ?? ''}
            placeholder="Product title from Amazon"
            aria-invalid={!!errors?.title}
          />
          <FieldError messages={errors?.title} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={defaultValues?.slug ?? ''}
            placeholder="auto-generated from title"
          />
          <FieldError messages={errors?.slug} />
        </div>
      </div>

      {/* Price + Rating + Reviews + Prime */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="current_price">Price</Label>
          <Input
            id="current_price"
            name="current_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultValues?.current_price ?? ''}
            placeholder="29.99"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rating">Rating</Label>
          <Input
            id="rating"
            name="rating"
            type="number"
            step="0.1"
            min="0"
            max="5"
            defaultValue={defaultValues?.rating ?? ''}
            placeholder="4.5"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="review_count">Reviews</Label>
          <Input
            id="review_count"
            name="review_count"
            type="number"
            min="0"
            defaultValue={defaultValues?.review_count ?? ''}
            placeholder="1234"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="is_prime">Prime</Label>
          <select
            id="is_prime"
            name="is_prime"
            defaultValue={defaultValues?.is_prime ? 'true' : 'false'}
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
      </div>

      {/* Focus keyword */}
      <div className="space-y-1.5">
        <Label htmlFor="focus_keyword">Focus Keyword</Label>
        <Input
          id="focus_keyword"
          name="focus_keyword"
          defaultValue={defaultValues?.focus_keyword ?? ''}
          placeholder="best air fryer 2024"
        />
      </div>

      {/* AI description preview — edit mode only */}
      {mode === 'edit' && productId && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>AI Description Preview</Label>
            <button
              type="button"
              onClick={generateDescription}
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
          </div>
          <textarea
            ref={descPreviewRef}
            readOnly
            value={generatedDescription}
            placeholder="Click 'Generate with AI' to preview the AI-generated description for this product. Run 'Generate Site' to apply it."
            rows={5}
            className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus-visible:outline-none"
          />
          {generateError && (
            <p className="text-xs text-destructive">{generateError}</p>
          )}
          <p className="text-xs text-muted-foreground">Preview only — run "Generate Site" to apply AI content to all products.</p>
        </div>
      )}

      {/* Category assignment */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <Label>Categories</Label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const selected = selectedCategories.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    selected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {cat.name}
                </button>
              )
            })}
          </div>
          {/* Hidden inputs for selected categories */}
          {selectedCategories.map((id) => (
            <input key={id} type="hidden" name="category_ids" value={id} />
          ))}
          {selectedCategories.length === 0 && (
            <p className="text-xs text-muted-foreground">No categories selected — product won't appear in any category page.</p>
          )}
        </div>
      )}

      {/* Form-level error */}
      {errors?._form && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors._form[0]}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : mode === 'create' ? 'Add Product' : 'Save Changes'}
        </Button>
        <Link
          href={`/sites/${siteId}#products`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
