import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AmazonScraper, AmazonBlockedError } from '@monster/agents'
import type { ScrapedProduct } from '@monster/agents'

interface Params {
  params: Promise<{ id: string }>
}

export interface SearchResultItem {
  asin: string
  title: string
  imageUrl: string | null
  price: number | null
  rating: number
  reviewCount: number
  isPrime: boolean
  isBestSeller: boolean
  /** Whether this ASIN already exists in the site */
  alreadyAdded: boolean
}

/**
 * GET /api/sites/[id]/product-search?q=<keyword>
 *
 * Searches Amazon via AmazonScraper for the keyword.
 * Returns up to 30 results with an `alreadyAdded` flag for ASINs
 * already in tsa_products for this site.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params
  const q = request.nextUrl.searchParams.get('q')?.trim()
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10))

  if (!q) {
    return NextResponse.json({ error: 'q query param required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('market')
    .eq('id', siteId)
    .single()

  if (siteError || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  const market = site.market ?? 'ES'

  try {
    const scraper = new AmazonScraper()
    const scraped: ScrapedProduct[] = await scraper.search(q, market, page)

    // Fetch existing ASINs for this site to flag already-added ones
    const { data: existing } = await supabase
      .from('tsa_products')
      .select('asin')
      .eq('site_id', siteId)

    const existingAsins = new Set((existing ?? []).map((r) => r.asin))

    const results: SearchResultItem[] = scraped.map((p) => ({
      asin: p.asin,
      title: p.title,
      imageUrl: p.imageUrl,
      price: p.price,
      rating: p.rating ?? 0,
      reviewCount: p.reviewCount ?? 0,
      isPrime: p.isPrime,
      isBestSeller: false,
      alreadyAdded: existingAsins.has(p.asin),
    }))

    return NextResponse.json({ results, market, page, hasMore: scraped.length >= 20 })
  } catch (err) {
    if (err instanceof AmazonBlockedError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[product-search] siteId=${siteId} q="${q}" error=${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── Bulk add ──────────────────────────────────────────────────────────────────

interface BulkAddBody {
  products: SearchResultItem[]
  categoryIds: string[]
}

/**
 * POST /api/sites/[id]/product-search
 *
 * Bulk-inserts an array of products from search results.
 * Skips ASINs that already exist (no error — idempotent).
 * Optionally links to categories via category_products.
 *
 * Body: { products: SearchResultItem[], categoryIds: string[] }
 * Returns: { added: number, skipped: number }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params

  let body: BulkAddBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { products, categoryIds = [] } = body

  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'products array required' }, { status: 400 })
  }

  // Verify site exists
  const supabase = createServiceClient()
  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .single()

  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  // Fetch existing ASINs to skip duplicates
  const { data: existing } = await supabase
    .from('tsa_products')
    .select('asin')
    .eq('site_id', siteId)

  const existingAsins = new Set((existing ?? []).map((r) => r.asin))

  const toInsert = products.filter((p) => !existingAsins.has(p.asin))
  let added = 0
  const skipped = products.length - toInsert.length

  if (toInsert.length === 0) {
    return NextResponse.json({ added: 0, skipped })
  }

  // Insert products one by one to collect IDs for category linking
  const insertedIds: string[] = []

  for (const p of toInsert) {
    const slug = slugify(p.title || p.asin)
    const { data: row, error } = await supabase
      .from('tsa_products')
      .insert({
        site_id: siteId,
        asin: p.asin,
        title: p.title,
        slug,
        current_price: p.price,
        rating: p.rating,
        review_count: p.reviewCount,
        is_prime: p.isPrime,
        source_image_url: p.imageUrl,
      })
      .select('id')
      .single()

    if (!error && row) {
      insertedIds.push(row.id)
      added++
    } else if (error?.code === '23505') {
      // Race condition — already exists, skip silently
    } else if (error) {
      console.error(`[product-search/bulk-add] ASIN=${p.asin} error=${error.message}`)
    }
  }

  // Link to categories
  if (categoryIds.length > 0 && insertedIds.length > 0) {
    const links = insertedIds.flatMap((productId, pIdx) =>
      categoryIds.map((categoryId, cIdx) => ({
        category_id: categoryId,
        product_id: productId,
        position: pIdx * categoryIds.length + cIdx,
      }))
    )
    await supabase.from('category_products').insert(links)
  }

  return NextResponse.json({ added, skipped })
}

// ── helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
