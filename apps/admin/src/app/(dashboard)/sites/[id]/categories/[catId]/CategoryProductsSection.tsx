"use client";
/** Map of product slug → overall SEO score (from seo_scores table). Keyed by slug. */
// Product slug → overall SEO score. Populated from server for initial page, then API for subsequent pages.
// Fetch SEO scores for these products by slug
// score fetch failure is non-fatal — table just shows '—'

// Debounce search
/* Header */ /* Search */ /* Empty states */ /* Product list */ /* Thumbnail */ /* Info */ /* Actions — Edit link + SEO score badge */ /* Pagination */
// Reset scores for new page — only show scores for currently visible products
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { GenerateAllProductsSeoButton } from "./GenerateAllProductsSeoButton";
import SeoJobStatus from "../../SeoJobStatus";

const PAGE_SIZE = 25;

interface Product {
  id: string;
  asin: string;
  slug?: string | null;
  title: string | null;
  current_price: number | null;
  rating: number | null;
  review_count: number | null;
  is_prime: boolean;
  source_image_url: string | null;
  images: string[] | null;
}

interface ApiResponse {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Props {
  siteId: string;
  catId: string;
  initialProducts: Product[];
  initialTotal: number;
  initialProductScores?: Record<string, number | null>;
}

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating * 2) / 2;
  return (
    <span className="text-amber-400 text-xs">
      {"★".repeat(Math.floor(stars))}
      {stars % 1 !== 0 ? "½" : ""}
      {"☆".repeat(5 - Math.ceil(stars))}
    </span>
  );
}

export function CategoryProductsSection({
  siteId,
  catId,
  initialProducts,
  initialTotal,
  initialProductScores = {},
}: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(Math.ceil(initialTotal / PAGE_SIZE));
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [productScores, setProductScores] =
    useState<Record<string, number | null>>(initialProductScores);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const fetchProducts = useCallback(
    async (q: string, p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(PAGE_SIZE),
        });
        if (q) params.set("q", q);
        const res = await fetch(`/api/sites/${siteId}/categories/${catId}/products?${params}`);
        if (!res.ok) return;
        const data: ApiResponse = await res.json();
        setProducts(data.products);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setPage(data.page);
        const slugs = data.products.map((p) => p.slug).filter(Boolean) as string[];
        setProductScores({});
        if (slugs.length > 0) {
          try {
            const scoreRes = await fetch(
              `/api/sites/${siteId}/product-scores?slugs=${slugs.join(",")}`,
            );
            if (scoreRes.ok) {
              const scoreData = (await scoreRes.json()) as Record<string, number | null>;
              setProductScores(scoreData);
            }
          } catch {}
        }
      } finally {
        setLoading(false);
      }
    },
    [siteId, catId],
  );
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchProducts(query, 1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchProducts]);

  function handlePageChange(newPage: number) {
    fetchProducts(queryRef.current, newPage);
  }

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div id="category-products" className="rounded-xl border border-border bg-card px-6 py-5">
      {}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Products
          {total > 0 && (
            <span className="ml-2 font-normal normal-case text-foreground/60">{total}</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/sites/${siteId}/products/new?categoryId=${catId}`}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted/40 hover:text-foreground transition-colors"
          >
            + Add Products
          </Link>
          <GenerateAllProductsSeoButton siteId={siteId} categoryId={catId} />
          <SeoJobStatus siteId={siteId} jobType="seo_products_batch" entityId={catId} compact />
        </div>
      </div>

      {}
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

      {}
      {!loading && products.length === 0 && !query && (
        <p className="text-sm text-muted-foreground">No products in this category yet.</p>
      )}

      {!loading && products.length === 0 && query && (
        <p className="text-sm text-muted-foreground">
          No products match <span className="text-foreground font-medium">&quot;{query}&quot;</span>
          .
        </p>
      )}

      {}
      {products.length > 0 && (
        <div
          className={`divide-y divide-border -mx-6 transition-opacity duration-150 ${
            loading ? "opacity-50" : "opacity-100"
          }`}
        >
          {products.map((product) => {
            const imageUrl =
              product.source_image_url ??
              (product.images && product.images.length > 0 ? product.images[0] : null);

            return (
              <Link
                key={product.id}
                href={`/sites/${siteId}/products/${product.id}`}
                className="px-6 py-3 flex items-center gap-4 hover:bg-muted/10 transition-colors"
              >
                {}
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

                {}
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

                {}
                <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.preventDefault()}>
                  {product.slug && productScores[product.slug] != null && (
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                        (productScores[product.slug] ?? 0) >= 70
                          ? "border-green-500/30 bg-green-500/10 text-green-400"
                          : (productScores[product.slug] ?? 0) >= 50
                            ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                            : "border-red-500/30 bg-red-500/10 text-red-400"
                      }`}
                      title="Overall SEO score"
                    >
                      {productScores[product.slug]}
                    </span>
                  )}
                  <Link
                    href={`/sites/${siteId}/products/${product.id}/edit`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Edit
                  </Link>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {}
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
  );
}
