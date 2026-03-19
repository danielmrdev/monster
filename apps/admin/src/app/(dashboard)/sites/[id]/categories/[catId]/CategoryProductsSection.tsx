'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { GenerateProductSeoButton } from './GenerateProductSeoButton'
import { GenerateAllProductsSeoButton } from './GenerateAllProductsSeoButton'

const PAGE_SIZE = 25

interface Product {
  id: string
  asin: string
  title: string | null
  current_price: number | null
  rating: number | null
  review_count: number | null
  is_prime: boolean
  source_image_url: string | null
  images: string[] | null
}

interface ApiResponse {
  products: Product[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface Props {
  siteId: string
  catId: string
  initialProducts: Product[]
  initialTotal: number
}

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating * 2) / 2
  return (
    <span className="text-amber-400 text-xs">
      {'★'.repeat(Math.floor(stars))}
      {stars % 1 !== 0 ? '½' : ''}
      {'☆'.repeat(5 - Math.ceil(stars))}
    </span>
  )
}

export function CategoryProductsSection({ siteId, catId, initialProducts, initialTotal }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [total, setTotal] = useState(initialTotal)
  const [totalPages, setTotalPages] = useState(Math.ceil(initialTotal / PAGE_SIZE))
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryRef = useRef(query)
  queryRef.current = query

  const fetchProducts = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
      if (q) params.set('q', q)
      const res = await fetch(`/api/sites/${siteId}/categories/${catId}/products?${params}`)
      if (!res.ok) return
      const data: ApiResponse = await res.json()
      setProducts(data.products)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setPage(data.page)
    } finally {
      setLoading(false)
    }
  }, [siteId, catId])

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchProducts(query, 1)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, fetchProducts])

  function handlePageChange(newPage: number) {
    fetchProducts(queryRef.current, newPage)
  }

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div id="category-products" className="rounded-xl border border-border bg-card px-6 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Products
          {total > 0 && (
            <span className="ml-2 font-normal normal-case text-foreground/60">{total}</span>
          )}
        </h2>
        <GenerateAllProductsSeoButton siteId={siteId} categoryId={catId} />
      </div>

      {/* Search */}
      {(total > 0 || query) && (
        <div className="mb-4">
          <Input
            type="search"
            placeholder="Search by title or ASIN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Empty states */}
      {!loading && products.length === 0 && !query && (
        <p className="text-sm text-muted-foreground">
          No products in this category yet.
        </p>
      )}

      {!loading && products.length === 0 && query && (
        <p className="text-sm text-muted-foreground">
          No products match <span className="text-foreground font-medium">&quot;{query}&quot;</span>.
        </p>
      )}

      {/* Product list */}
      {products.length > 0 && (
        <div className={`divide-y divide-border -mx-6 transition-opacity duration-150 ${loading ? 'opacity-50' : 'opacity-100'}`}>
          {products.map((product) => {
            const imageUrl =
              product.source_image_url ??
              (product.images && product.images.length > 0 ? product.images[0] : null)

            return (
              <div
                key={product.id}
                className="px-6 py-3 flex items-center gap-4 hover:bg-muted/10 transition-colors"
              >
                {/* Thumbnail */}
                <div className="shrink-0 w-12 h-12 rounded-md border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={product.title ?? product.asin}
                      width={48}
                      height={48}
                      className="object-contain w-full h-full"
                      unoptimized
                    />
                  ) : (
                    <span className="text-lg text-muted-foreground/40">📦</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5 border border-border">
                      {product.asin}
                    </span>
                    {product.is_prime && (
                      <span className="text-xs text-blue-400 font-semibold">Prime</span>
                    )}
                    {product.current_price != null && (
                      <span className="text-sm font-medium text-foreground">
                        {product.current_price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {product.title && (
                    <p className="text-sm text-foreground mt-0.5 line-clamp-1">{product.title}</p>
                  )}
                  {product.rating != null && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StarRating rating={product.rating} />
                      <span className="text-xs text-muted-foreground">{product.rating}</span>
                      {product.review_count != null && (
                        <span className="text-xs text-muted-foreground/60">
                          ({product.review_count.toLocaleString()} reviews)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions — read-only view, no delete */}
                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/sites/${siteId}/products/${product.id}/edit`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </Link>
                  <GenerateProductSeoButton siteId={siteId} productId={product.id} categoryId={catId} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="px-2 text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
