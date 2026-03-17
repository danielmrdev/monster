'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SearchResultItem } from '@/app/api/sites/[id]/product-search/route'

interface Category {
  id: string
  name: string
}

interface Props {
  siteId: string
  categories: Category[]
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  return (
    <span className="text-amber-400 text-xs tracking-tighter select-none">
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(empty)}
    </span>
  )
}

export function ProductSearch({ siteId, categories }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[] | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())

  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [adding, startAdd] = useTransition()

  // ── Search ──────────────────────────────────────────────────────────────

  async function fetchPage(q: string, page: number): Promise<{ results: SearchResultItem[]; hasMore: boolean } | null> {
    const res = await fetch(
      `/api/sites/${siteId}/product-search?q=${encodeURIComponent(q)}&page=${page}`
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Search failed')
    return { results: data.results ?? [], hasMore: data.hasMore ?? false }
  }

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const q = inputRef.current?.value.trim() ?? ''
    if (!q) return

    setQuery(q)
    setResults(null)
    setCurrentPage(1)
    setHasMore(false)
    setSearchError(null)
    setSelected(new Set())
    setAddSuccess(null)
    setAddError(null)
    setSearching(true)

    fetchPage(q, 1)
      .then((data) => {
        if (!data) return
        setResults(data.results)
        setHasMore(data.hasMore)
        setCurrentPage(1)
      })
      .catch((err) => {
        setSearchError(err instanceof Error ? err.message : 'Unknown error')
      })
      .finally(() => setSearching(false))
  }

  function handleLoadMore() {
    const nextPage = currentPage + 1
    setLoadingMore(true)

    fetchPage(query, nextPage)
      .then((data) => {
        if (!data) return
        setResults((prev) => [...(prev ?? []), ...data.results])
        setHasMore(data.hasMore)
        setCurrentPage(nextPage)
      })
      .catch((err) => {
        setSearchError(err instanceof Error ? err.message : 'Unknown error')
      })
      .finally(() => setLoadingMore(false))
  }

  // ── Selection ───────────────────────────────────────────────────────────

  function toggleItem(asin: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(asin)) next.delete(asin)
      else next.add(asin)
      return next
    })
  }

  function toggleAll() {
    if (!results) return
    const addable = results.filter((r) => !r.alreadyAdded)
    if (selected.size === addable.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(addable.map((r) => r.asin)))
    }
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Bulk add ────────────────────────────────────────────────────────────

  function handleAdd() {
    if (!results || selected.size === 0) return
    const toAdd = results.filter((r) => selected.has(r.asin))

    setAddError(null)
    setAddSuccess(null)

    startAdd(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/product-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: toAdd,
            categoryIds: [...selectedCategories],
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setAddError(data.error ?? 'Failed to add products')
          return
        }

        const { added, skipped } = data as { added: number; skipped: number }

        // Mark newly added as alreadyAdded in the results list
        setResults((prev) =>
          prev
            ? prev.map((r) =>
                selected.has(r.asin) ? { ...r, alreadyAdded: true } : r
              )
            : prev
        )
        setSelected(new Set())

        const msg =
          skipped > 0
            ? `${added} product${added !== 1 ? 's' : ''} added (${skipped} skipped — already in site)`
            : `${added} product${added !== 1 ? 's' : ''} added`
        setAddSuccess(msg)

        // Refresh page data in background so products section updates on navigate back
        router.refresh()
      } catch (err) {
        setAddError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const addable = results?.filter((r) => !r.alreadyAdded) ?? []
  const allSelected = addable.length > 0 && selected.size === addable.length

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Search Amazon products… e.g. freidoras de aire, camping tent"
          defaultValue=""
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1"
          autoFocus
        />
        <Button type="submit" disabled={searching}>
          {searching ? (
            <span className="flex items-center gap-2">
              <Spinner /> Searching…
            </span>
          ) : (
            'Search'
          )}
        </Button>
      </form>

      {/* Search error */}
      {searchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {searchError}
        </div>
      )}

      {/* Loading skeleton */}
      {searching && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-muted/20 animate-pulse border border-border"
            />
          ))}
          <p className="text-xs text-center text-muted-foreground pt-1">
            Searching Amazon… this may take 10–30 seconds
          </p>
        </div>
      )}

      {/* Results */}
      {!searching && results !== null && (
        <>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No results for <strong>"{query}"</strong>. Try a different keyword.
            </p>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {results.length} results for <strong className="text-foreground">"{query}"</strong>
                  </span>
                  {addable.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                    >
                      {allSelected ? 'Deselect all' : `Select all (${addable.length})`}
                    </button>
                  )}
                </div>

                {/* Category filter + Add button */}
                {selected.size > 0 && (
                  <div className="flex items-center gap-3 flex-wrap">
                    {categories.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Add to:</span>
                        {categories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleCategory(cat.id)}
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                              selectedCategories.has(cat.id)
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50'
                            }`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      onClick={handleAdd}
                      disabled={adding}
                      size="sm"
                    >
                      {adding ? (
                        <span className="flex items-center gap-1.5">
                          <Spinner size="sm" /> Adding…
                        </span>
                      ) : (
                        `Add ${selected.size} product${selected.size !== 1 ? 's' : ''}`
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Success/error feedback */}
              {addSuccess && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
                  ✓ {addSuccess}
                </div>
              )}
              {addError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  {addError}
                </div>
              )}

              {/* Result grid */}
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {results.map((item) => {
                  const isSelected = selected.has(item.asin)
                  const disabled = item.alreadyAdded

                  return (
                    <label
                      key={item.asin}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none ${
                        disabled
                          ? 'opacity-50 cursor-not-allowed bg-muted/5'
                          : isSelected
                          ? 'bg-primary/5 hover:bg-primary/8'
                          : 'hover:bg-muted/10'
                      }`}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={disabled}
                        onChange={() => !disabled && toggleItem(item.asin)}
                        className="shrink-0 rounded border-border accent-primary w-4 h-4"
                      />

                      {/* Thumbnail */}
                      <div className="shrink-0 w-12 h-12 rounded-md border border-border bg-muted/20 overflow-hidden flex items-center justify-center">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.title}
                            width={48}
                            height={48}
                            className="object-contain w-full h-full"
                            unoptimized
                          />
                        ) : (
                          <span className="text-lg text-muted-foreground/30">📦</span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5 border border-border shrink-0">
                            {item.asin}
                          </span>
                          {item.isBestSeller && (
                            <span className="text-xs text-amber-400 font-semibold shrink-0">
                              Best Seller
                            </span>
                          )}
                          {item.isPrime && (
                            <span className="text-xs text-blue-400 font-semibold shrink-0">
                              Prime
                            </span>
                          )}
                          {disabled && (
                            <span className="text-xs text-muted-foreground/60 shrink-0">
                              already added
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-0.5 line-clamp-1 leading-snug">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {item.price != null && (
                            <span className="text-sm font-medium text-foreground">
                              {item.price.toFixed(2)}
                            </span>
                          )}
                          {item.rating > 0 && (
                            <span className="flex items-center gap-1">
                              <StarRating rating={item.rating} />
                              <span className="text-xs text-muted-foreground">
                                {item.rating}
                              </span>
                            </span>
                          )}
                          {item.reviewCount > 0 && (
                            <span className="text-xs text-muted-foreground/60">
                              ({item.reviewCount.toLocaleString()})
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="pt-2 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <Spinner size="sm" /> Loading more…
                      </span>
                    ) : (
                      `Load more (page ${currentPage + 1})`
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 'default' }: { size?: 'sm' | 'default' }) {
  const s = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  return (
    <svg
      className={`${s} animate-spin text-current`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
      />
    </svg>
  )
}
