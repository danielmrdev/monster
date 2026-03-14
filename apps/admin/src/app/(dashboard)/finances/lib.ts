import Papa from 'papaparse'

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function isValidIsoDate(s: string): boolean {
  // Accepts YYYY-MM-DD; rejects anything that doesn't produce a valid date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s)
  return !isNaN(d.getTime())
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function nDaysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Return a validated `{ from, to }` date range (YYYY-MM-DD).
 * Defaults to last 30 days when params are absent or invalid.
 */
export function getDateRange(
  from?: string,
  to?: string,
): { from: string; to: string } {
  const validFrom = from && isValidIsoDate(from) ? from : nDaysAgoIso(30)
  const validTo = to && isValidIsoDate(to) ? to : todayIso()
  // Clamp: from must not be after to
  if (validFrom > validTo) {
    return { from: nDaysAgoIso(30), to: todayIso() }
  }
  return { from: validFrom, to: validTo }
}

// ---------------------------------------------------------------------------
// P&L types
// ---------------------------------------------------------------------------

export type SitePnL = {
  site_id: string
  name: string
  revenue: number
  costs: number
  profit: number
  roi: number | null // null when costs = 0
  currency: string
}

export type PnLResult = {
  sitePnL: SitePnL[]
  portfolioRevenue: number
  portfolioCosts: number
  portfolioProfit: number
  mixedCurrencies: boolean
}

// Minimal row shapes expected by computePnL — matches Supabase query selects
type CostRow = {
  site_id: string | null
  amount: number
  currency: string
}

type RevenueAmazonRow = {
  site_id: string
  earnings: number
  currency: string
}

type RevenueManualRow = {
  site_id: string | null
  amount: number
  currency: string
}

type SiteRow = {
  id: string
  name: string
}

/**
 * Pure in-memory P&L aggregator.
 *
 * - Groups costs and revenue by site_id.
 * - Null site_id rows contribute to portfolio totals only (not per-site table).
 * - ROI = (profit / costs) * 100, null when costs = 0 (no divide-by-zero).
 * - mixedCurrencies = true when any row has currency !== 'EUR'.
 * - Returned sitePnL sorted by profit descending.
 */
export function computePnL(
  costs: CostRow[],
  revenueAmazon: RevenueAmazonRow[],
  revenueManual: RevenueManualRow[],
  sites: SiteRow[],
): PnLResult {
  // --- accumulate costs per site_id ---
  const costBySite = new Map<string, number>()
  let nullSiteCosts = 0
  let mixedCurrencies = false

  for (const row of costs) {
    if (row.currency !== 'EUR') mixedCurrencies = true
    if (row.site_id === null) {
      nullSiteCosts += row.amount
    } else {
      costBySite.set(row.site_id, (costBySite.get(row.site_id) ?? 0) + row.amount)
    }
  }

  // --- accumulate revenue per site_id ---
  const revBySite = new Map<string, number>()
  let nullSiteRevenue = 0

  for (const row of revenueAmazon) {
    if (row.currency !== 'EUR') mixedCurrencies = true
    revBySite.set(row.site_id, (revBySite.get(row.site_id) ?? 0) + row.earnings)
  }

  for (const row of revenueManual) {
    if (row.currency !== 'EUR') mixedCurrencies = true
    if (row.site_id === null) {
      nullSiteRevenue += row.amount
    } else {
      revBySite.set(row.site_id, (revBySite.get(row.site_id) ?? 0) + row.amount)
    }
  }

  // --- build per-site P&L, include only sites that appear in costs or revenue ---
  const siteIds = new Set([...costBySite.keys(), ...revBySite.keys()])
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]))

  const sitePnL: SitePnL[] = []
  let portfolioRevenue = nullSiteRevenue
  let portfolioCosts = nullSiteCosts

  for (const siteId of siteIds) {
    const revenue = revBySite.get(siteId) ?? 0
    const siteCosts = costBySite.get(siteId) ?? 0
    const profit = revenue - siteCosts
    const roi = siteCosts > 0 ? (profit / siteCosts) * 100 : null

    portfolioRevenue += revenue
    portfolioCosts += siteCosts

    sitePnL.push({
      site_id: siteId,
      name: siteNameById.get(siteId) ?? 'Unknown',
      revenue,
      costs: siteCosts,
      profit,
      roi,
      currency: 'EUR',
    })
  }

  sitePnL.sort((a, b) => b.profit - a.profit)

  const portfolioProfit = portfolioRevenue - portfolioCosts

  return {
    sitePnL,
    portfolioRevenue,
    portfolioCosts,
    portfolioProfit,
    mixedCurrencies,
  }
}

/**
 * Maps both English and Spanish Amazon Associates CSV column names
 * to internal canonical keys.
 *
 * EN format: comma-delimited, UTF-8
 * ES format: semicolon-delimited, may include BOM, decimal comma
 */
export const AMAZON_HEADER_MAP: Record<string, string> = {
  // English headers
  Date: 'date',
  Clicks: 'clicks',
  'Ordered Items': 'items_ordered',
  'Shipped Items': 'items_shipped', // informational — not stored
  'Shipped Revenue': 'earnings',
  'Tracking ID': 'tracking_id',
  // Spanish headers
  Fecha: 'date',
  Clics: 'clicks',
  'Artículos pedidos': 'items_ordered',
  'Artículos enviados': 'items_shipped', // informational — not stored
  'Ingresos por envíos': 'earnings',
  'Código de seguimiento': 'tracking_id',
}

export type ParsedRow = {
  date: string
  clicks: number
  items_ordered: number
  earnings: number
  tracking_id: string
}

export type ImportResult = {
  inserted: number
  updated: number
  unattributed: string[]
}

/**
 * Normalise an earnings string to a float.
 *
 * Handles:
 *  - "12.50"         → 12.50
 *  - "12,50"         → 12.50  (ES decimal comma)
 *  - "€ 12,34"       → 12.34
 *  - "$1,234.56"     → 1234.56 (thousand-separator then decimal dot)
 *
 * Strategy:
 *  1. Strip all chars except digits, commas, and dots.
 *  2. If both comma and dot are present, the last one is the decimal separator.
 *  3. If only comma is present (ES locale), replace it with a dot.
 */
function parseEarnings(raw: string): number {
  // Strip currency symbols, spaces, non-numeric chars except comma and dot
  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!cleaned) return 0

  const hasComma = cleaned.includes(',')
  const hasDot = cleaned.includes('.')

  let normalized: string
  if (hasComma && hasDot) {
    // Determine which is decimal: the last separator wins
    const lastComma = cleaned.lastIndexOf(',')
    const lastDot = cleaned.lastIndexOf('.')
    if (lastComma > lastDot) {
      // comma is decimal (ES: "1.234,56")
      normalized = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // dot is decimal (EN: "1,234.56")
      normalized = cleaned.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Only comma — treat as decimal separator (ES: "12,50")
    normalized = cleaned.replace(',', '.')
  } else {
    normalized = cleaned
  }

  const value = parseFloat(normalized)
  return isNaN(value) ? 0 : value
}

/**
 * Parse an Amazon Associates CSV export (EN or ES format) and return
 * normalized rows. Throws if no rows can be attributed to known headers.
 *
 * @param text Raw file text (UTF-8, may include BOM)
 * @returns Array of ParsedRow — one entry per valid CSV data row
 * @throws Error with header listing if the format is unrecognized
 */
export function parseAmazonCSV(text: string): ParsedRow[] {
  // Strip BOM and leading whitespace
  const clean = text.replace(/^\uFEFF/, '').trimStart()

  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    delimiter: '', // auto-detect (handles both , and ;)
    skipEmptyLines: true,
  })

  const rawHeaders: string[] = result.meta.fields ?? []

  if (rawHeaders.length === 0) {
    throw new Error('Unrecognized CSV format. Headers found: (none)')
  }

  const rows: ParsedRow[] = []

  for (const row of result.data) {
    // Build a normalized row by mapping each CSV header to its internal key
    const normalized: Partial<Record<string, string>> = {}
    for (const [header, value] of Object.entries(row)) {
      const internalKey = AMAZON_HEADER_MAP[header.trim()]
      if (internalKey) {
        normalized[internalKey] = value?.trim() ?? ''
      }
    }

    const { date, clicks, items_ordered, earnings, tracking_id } = normalized as Record<
      string,
      string | undefined
    >

    // Skip rows missing the attribution key or date (e.g. summary/total rows)
    if (!tracking_id || !date) continue

    rows.push({
      date,
      clicks: parseInt(clicks ?? '0', 10) || 0,
      items_ordered: parseInt(items_ordered ?? '0', 10) || 0,
      earnings: parseEarnings(earnings ?? '0'),
      tracking_id,
    })
  }

  if (rows.length === 0) {
    throw new Error(
      `Unrecognized CSV format. Headers found: ${rawHeaders.join(', ')}`
    )
  }

  return rows
}
