import Papa from 'papaparse'

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
