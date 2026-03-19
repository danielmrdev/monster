/**
 * diff-engine.ts — Pure product diff functions.
 *
 * Zero external imports: no @monster/*, no bullmq, no ioredis.
 * All types are self-contained. Takes plain data in, returns typed results out.
 * All Supabase and queue interactions remain in the job handler.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChangeType = "price" | "availability" | "image" | "rating";

export interface ProductChange {
  type: ChangeType;
  asin: string;
  old: unknown;
  new: unknown;
}

export interface DbProduct {
  asin: string;
  current_price: number | null;
  availability: string | null;
  source_image_url: string | null;
  rating: number | null;
}

export interface DfsProduct {
  asin: string;
  price: number | null;
  imageUrl: string | null;
  rating: number;
}

export interface DiffResult {
  changes: ProductChange[];
  /** ASINs present in DB but absent from the DFS result — treated as availability='limited' */
  serpAbsentAsins: string[];
  shouldRebuild: boolean;
  rebuildReason: string;
}

// ---------------------------------------------------------------------------
// Diff engine
// ---------------------------------------------------------------------------

/**
 * Categorizes changes between DB product state and fresh DataForSEO results.
 *
 * Rebuild-triggering change types: 'price', 'availability', 'image'.
 * Non-rebuild change types: 'rating'.
 *
 * SERP-absent products (in DB but not in DFS result) are surfaced in
 * `serpAbsentAsins` — the caller is responsible for setting availability='limited'
 * and creating the appropriate alert. They do NOT generate a ProductChange entry.
 */
export function diffProducts(dbProducts: DbProduct[], dfsProducts: DfsProduct[]): DiffResult {
  const changes: ProductChange[] = [];
  const serpAbsentAsins: string[] = [];

  // Build lookup map for O(1) access by ASIN
  const dfsMap = new Map<string, DfsProduct>(dfsProducts.map((p) => [p.asin, p]));

  for (const db of dbProducts) {
    const dfs = dfsMap.get(db.asin);

    if (!dfs) {
      // Not in DFS result — SERP-absent, not a ProductChange
      serpAbsentAsins.push(db.asin);
      continue;
    }

    // Price change: float epsilon comparison + null-presence check
    const dbPrice = db.current_price;
    const dfsPrice = dfs.price;
    const priceNullChanged = (dfsPrice === null) !== (dbPrice === null);
    const priceValueChanged =
      dfsPrice !== null && dbPrice !== null && Math.abs(dfsPrice - dbPrice) > 0.01;

    if (priceNullChanged || priceValueChanged) {
      changes.push({ type: "price", asin: db.asin, old: dbPrice, new: dfsPrice });
    }

    // Image change: only when both sides are known (not null)
    // Avoids false positives for products whose image was never stored
    if (
      db.source_image_url !== null &&
      dfs.imageUrl !== null &&
      dfs.imageUrl !== db.source_image_url
    ) {
      changes.push({
        type: "image",
        asin: db.asin,
        old: db.source_image_url,
        // Redact full URL in the change object — callers log only the asin
        new: dfs.imageUrl,
      });
    }

    // Rating change: float epsilon comparison (not rebuild-triggering)
    const dbRating = db.rating ?? 0;
    const dfsRating = dfs.rating;
    if (Math.abs(dfsRating - dbRating) > 0.01) {
      changes.push({ type: "rating", asin: db.asin, old: dbRating, new: dfsRating });
    }
  }

  // Rebuild triggers: explicit set — 'price' | 'availability' | 'image'
  // Note: 'availability' changes come from serpAbsentAsins path handled by the caller;
  // they don't produce a ProductChange entry here. Any availability ProductChange
  // would still be caught by this check if added in future.
  const rebuildTriggers = new Set<ChangeType>(["price", "availability", "image"]);
  const triggeringChange = changes.find((c) => rebuildTriggers.has(c.type));
  const shouldRebuild = triggeringChange !== undefined;
  const rebuildReason = triggeringChange ? triggeringChange.type : "none";

  return { changes, serpAbsentAsins, shouldRebuild, rebuildReason };
}
