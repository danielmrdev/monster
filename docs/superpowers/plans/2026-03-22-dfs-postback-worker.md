# DFS Postback via Cloudflare Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DataForSEO polling with postback via Cloudflare Worker. Add real-time search status, notification bell integration, and "previous searches" UI.

**Architecture:** Cloudflare Worker receives DFS postbacks, validates source IP, writes results to Supabase `dfs_search_cache`. Admin frontend uses Supabase Realtime subscription on `dfs_search_cache` to detect new results. If user is on search page, results load automatically. If elsewhere, alert bell shows notification. Product search page gains a "previous searches" section from cache table.

**Tech Stack:** Cloudflare Workers (wrangler), Supabase Realtime (postgres_changes), Next.js API routes, React hooks

---

## File Structure

### New files
- `workers/dfs-postback/wrangler.toml` — Worker config
- `workers/dfs-postback/src/index.ts` — Worker handler (IP validation, gzip decompress, Supabase upsert)
- `workers/dfs-postback/package.json` — Worker dependencies
- `workers/dfs-postback/tsconfig.json` — Worker TS config
- `apps/admin/src/app/api/sites/[id]/product-search/start/route.ts` — New "fire and forget" search endpoint (task_post only, returns taskId)
- `apps/admin/src/hooks/use-realtime-search.ts` — Supabase Realtime hook for dfs_search_cache changes
- `apps/admin/src/app/(dashboard)/sites/[id]/products/PreviousSearches.tsx` — Previous searches table component

### Modified files
- `packages/agents/src/clients/dataforseo.ts` — Add `searchProductsAsync()` method (task_post with postback_url, no polling)
- `apps/admin/src/app/api/sites/[id]/product-search/route.ts` — GET stays for cache reads; remove DFS fetch (moved to `/start`)
- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductSearch.tsx` — Use async flow + realtime + previous searches
- `apps/admin/src/app/(dashboard)/sites/[id]/products/new/page.tsx` — Pass market to ProductSearch, fetch previous searches
- `apps/admin/src/components/alerts-bell.tsx` — Add search-complete notifications
- `packages/db/src/types/supabase.ts` — Add `status` and `site_id` columns to `dfs_search_cache` type
- `packages/db/supabase/migrations/` — New migration for `status` + `site_id` columns + Realtime enable
- `pnpm-workspace.yaml` — Add `workers/*` to workspaces

---

## Task 1: DB Migration — Add `status` and `site_id` to `dfs_search_cache`

We need to track: (a) whether a search is pending or complete (for realtime), (b) which site triggered it (for alerts). Also enable Supabase Realtime on this table.

**Files:**
- Create: `packages/db/supabase/migrations/20260322180000_dfs_cache_status.sql`
- Modify: `packages/db/src/types/supabase.ts`

- [ ] **Step 1: Create migration**

```sql
-- Add status column to track async search lifecycle
ALTER TABLE dfs_search_cache
  ADD COLUMN status text NOT NULL DEFAULT 'complete',
  ADD COLUMN site_id uuid REFERENCES sites(id);

-- Add proper unique constraint for upsert support (application always normalizes
-- keyword to lowercase and market to uppercase before insert)
ALTER TABLE dfs_search_cache
  ADD CONSTRAINT dfs_search_cache_keyword_market_uq UNIQUE (keyword, market);

-- Enable Realtime for this table (with FULL replica identity so old row is available)
ALTER TABLE dfs_search_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE dfs_search_cache;

-- RLS: allow anon key SELECT for Realtime subscriptions from browser
ALTER TABLE dfs_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON dfs_search_cache FOR SELECT USING (true);

COMMENT ON COLUMN dfs_search_cache.status IS
  'Search status: pending (task_post sent, awaiting postback), complete (results received)';
COMMENT ON COLUMN dfs_search_cache.site_id IS
  'Site that initiated the search (for notifications). NULL for legacy cached entries.';
```

- [ ] **Step 2: Run migration**

```bash
cd /home/daniel/monster && npx supabase db push
```

- [ ] **Step 3: Update Supabase types**

In `packages/db/src/types/supabase.ts`, add `status: string` and `site_id: string | null` to Row/Insert/Update of `dfs_search_cache`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add status and site_id to dfs_search_cache, enable Realtime"
```

---

## Task 2: DataForSEO Client — Add `searchProductsAsync()` method

New method that does task_post with `postback_url` and returns immediately (no polling).

**Files:**
- Modify: `packages/agents/src/clients/dataforseo.ts:318-363`

- [ ] **Step 1: Add `searchProductsAsync` method**

Add after the existing `searchProducts` method. This method does ONLY step 1 (task_post) with `postback_url` and `tag`, then returns the `taskId`. No polling.

```typescript
/**
 * Fire-and-forget search: task_post with postback_url.
 * DFS will POST results to the Cloudflare Worker when ready.
 * Returns the taskId for tracking.
 */
async searchProductsAsync(
  keyword: string,
  market: string,
  depth: number,
  postbackUrl: string,
  tag?: string,
): Promise<string> {
  const config = MARKET_CONFIG[market];
  if (!config) {
    throw new Error(
      `DataForSEO: unknown market "${market}". Supported: ${Object.keys(MARKET_CONFIG).join(", ")}`,
    );
  }

  const auth = await this.fetchAuthHeader();

  const postBody = [
    {
      keyword,
      location_code: config.location_code,
      language_code: config.language_code,
      se_domain: config.se_domain,
      depth,
      postback_url: postbackUrl,
      postback_data: "advanced",
      tag: tag ?? "",
    },
  ];

  const postResponse = await this.apiPost<DFSRawResponse>(
    "/merchant/amazon/products/task_post",
    auth,
    postBody,
  );

  const taskId = postResponse?.tasks?.[0]?.id;
  if (!taskId) {
    throw new Error(`DataForSEO task_post did not return a task ID for keyword: "${keyword}"`);
  }

  console.log(`[DataForSEO] async task_post id=${taskId} keyword="${keyword}" postback=${postbackUrl}`);

  // Track cost using existing private method (D028 pattern)
  void this.trackCost(
    `searchProductsAsync:"${keyword}" market=${market} depth=${depth}`,
    0.006,
    tag,
  );

  return taskId;
}
```

- [ ] **Step 2: Export the method** (already on the class, no extra export needed)

- [ ] **Step 3: Commit**

```bash
git add packages/agents/src/clients/dataforseo.ts
git commit -m "feat(dfs): add searchProductsAsync with postback_url support"
```

---

## Task 3: Cloudflare Worker — DFS Postback Receiver

Receives DFS postback, validates IP, parses gzip payload, extracts products, upserts into `dfs_search_cache`.

**Files:**
- Create: `workers/dfs-postback/package.json`
- Create: `workers/dfs-postback/tsconfig.json`
- Create: `workers/dfs-postback/wrangler.toml`
- Create: `workers/dfs-postback/src/index.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create worker package.json**

```json
{
  "name": "dfs-postback-worker",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250320.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create wrangler.toml**

```toml
name = "dfs-postback"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
# Non-secret env vars (if any)

# Secrets (set via `wrangler secret put`):
# SUPABASE_URL
# SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 4: Create src/index.ts**

```typescript
// DataForSEO postback IPs (v3)
const DFS_IPS = new Set([
  "144.76.154.130",
  "144.76.153.113",
  "144.76.153.106",
  "94.130.155.89",
  "178.63.193.217",
  "94.130.93.29",
]);

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// Minimal Supabase REST helper (no SDK needed in Worker)
async function supabasePost(
  env: Env,
  path: string,
  body: Record<string, unknown>,
  method = "POST",
  prefer = "return=representation",
): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
}

// Map DFS raw item to our CachedProduct shape
interface CachedProduct {
  asin: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  rating: number;
  reviewCount: number;
  isPrime: boolean;
  isBestSeller: boolean;
  isAmazonChoice: boolean;
  boughtPastMonth: number | null;
  specialOffers: string[];
  rankPosition: number | null;
}

function mapItem(item: Record<string, unknown>): CachedProduct | null {
  if ((item.type as string) !== "amazon_serp") return null;
  const rating = item.rating as Record<string, unknown> | null;
  return {
    asin: (item.data_asin as string) ?? "",
    title: (item.title as string) ?? "",
    imageUrl: (item.image_url as string) ?? null,
    price: (item.price_from as number) ?? null,
    rating: (rating?.value as number) ?? 0,
    reviewCount: (rating?.votes_count as number) ?? 0,
    isPrime: !!(item.is_prime ?? item.delivery_info),
    isBestSeller: !!(item.is_best_seller),
    isAmazonChoice: !!(item.is_amazon_choice),
    boughtPastMonth: (item.bought_past_month as number) ?? null,
    specialOffers: Array.isArray(item.special_offers)
      ? (item.special_offers as string[])
      : [],
    rankPosition: (item.rank_position as number) ?? null,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only POST allowed
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Validate source IP
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "";
    if (!DFS_IPS.has(clientIp)) {
      console.log(`[dfs-postback] rejected IP: ${clientIp}`);
      return new Response("Forbidden", { status: 403 });
    }

    try {
      // DFS sends gzip-compressed JSON
      // Cloudflare Workers auto-decompress gzip, so we can read as JSON
      const payload = await request.json() as Record<string, unknown>;

      const tasks = (payload.tasks ?? []) as Array<Record<string, unknown>>;
      if (tasks.length === 0) {
        return new Response("No tasks in payload", { status: 400 });
      }

      for (const task of tasks) {
        const taskId = task.id as string;
        const tag = (task.tag as string) ?? ""; // We use tag = siteId
        const result = ((task.result ?? []) as Array<Record<string, unknown>>)[0];
        if (!result) continue;

        const keyword = (result.keyword as string) ?? "";
        const seDomain = (result.se_domain as string) ?? "";
        const items = (result.items ?? []) as Array<Record<string, unknown>>;

        // Map to CachedProduct
        const products = items.map(mapItem).filter((p): p is CachedProduct => p !== null && p.asin !== "");

        // Derive market from se_domain
        const market = seDomain.includes(".es") ? "ES"
          : seDomain.includes(".co.uk") ? "UK"
          : seDomain.includes(".de") ? "DE"
          : seDomain.includes(".fr") ? "FR"
          : seDomain.includes(".it") ? "IT"
          : "US";

        const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

        // Atomic upsert via PostgREST (requires UNIQUE constraint on keyword,market)
        // Uses Prefer: resolution=merge-duplicates to update on conflict
        await fetch(`${env.SUPABASE_URL}/rest/v1/dfs_search_cache`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            keyword: keyword.toLowerCase(),
            market,
            depth: items.length,
            results: products,
            status: "complete",
            site_id: tag || null,
            expires_at: expiresAt,
          }),
        });

        console.log(
          `[dfs-postback] taskId=${taskId} keyword="${keyword}" market=${market} products=${products.length}`,
        );
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("[dfs-postback] error:", err);
      return new Response("Internal error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Add `workers/*` to pnpm-workspace.yaml**

Add `"workers/*"` to the packages array.

- [ ] **Step 6: Install dependencies**

```bash
cd /home/daniel/monster/workers/dfs-postback && pnpm install
```

- [ ] **Step 7: Set Worker secrets**

```bash
cd /home/daniel/monster/workers/dfs-postback
echo "<SUPABASE_URL>" | npx wrangler secret put SUPABASE_URL
echo "<SUPABASE_SERVICE_ROLE_KEY>" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

(Read actual values from `/home/daniel/monster/.env`)

- [ ] **Step 8: Deploy Worker**

```bash
cd /home/daniel/monster/workers/dfs-postback && npx wrangler deploy
```

Note the deployed URL (e.g. `https://dfs-postback.<account>.workers.dev`).

- [ ] **Step 9: Commit**

```bash
git add workers/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: add Cloudflare Worker for DFS postback reception"
```

---

## Task 4: New "Start Search" API Endpoint (Fire-and-Forget)

Creates a pending cache row and fires off DFS task_post with postback_url. Returns immediately.

**Files:**
- Create: `apps/admin/src/app/api/sites/[id]/product-search/start/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DataForSEOClient } from "@monster/agents";

// POST /api/sites/[id]/product-search/start
// Body: { keyword: string, depth?: number }
// Returns: { taskId, keyword, market, status: "pending" }

interface Params {
  params: Promise<{ id: string }>;
}

// Worker URL — set in .env
const POSTBACK_WORKER_URL = process.env.DFS_POSTBACK_WORKER_URL ?? "";

export async function POST(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params;

  if (!POSTBACK_WORKER_URL) {
    return NextResponse.json({ error: "DFS_POSTBACK_WORKER_URL not configured" }, { status: 500 });
  }

  const body = await request.json();
  const keyword = (body.keyword as string)?.trim();
  const depthParam = parseInt(body.depth ?? "100", 10);
  const depth = Math.min(400, Math.max(100, Math.ceil(depthParam / 100) * 100));

  if (!keyword) {
    return NextResponse.json({ error: "keyword required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: site } = await supabase
    .from("sites")
    .select("market")
    .eq("id", siteId)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const market = (site.market ?? "ES").toUpperCase();

  // Check cache first — if valid cache exists, return it
  const { data: cached } = await supabase
    .from("dfs_search_cache")
    .select("depth, status")
    .eq("keyword", keyword.toLowerCase())
    .eq("market", market)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached && cached.status === "complete" && cached.depth >= depth) {
    return NextResponse.json({ status: "cached", keyword, market });
  }

  if (cached && cached.status === "pending") {
    return NextResponse.json({ status: "pending", keyword, market });
  }

  // Insert pending row (or update existing expired)
  await supabase.from("dfs_search_cache").upsert(
    {
      keyword: keyword.toLowerCase(),
      market,
      depth,
      results: [],
      status: "pending",
      site_id: siteId,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
    { onConflict: "keyword,market", ignoreDuplicates: false },
  );

  // Fire DFS task_post with postback_url (tag = siteId for routing notifications)
  try {
    const client = new DataForSEOClient();
    const taskId = await client.searchProductsAsync(
      keyword,
      market,
      depth,
      POSTBACK_WORKER_URL,
      siteId,
    );

    return NextResponse.json({ status: "pending", taskId, keyword, market });
  } catch (err) {
    // Rollback status to avoid stuck pending
    await supabase
      .from("dfs_search_cache")
      .update({ status: "complete", results: [] })
      .eq("keyword", keyword.toLowerCase())
      .eq("market", market);

    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add `DFS_POSTBACK_WORKER_URL` to `.env`**

```
DFS_POSTBACK_WORKER_URL=https://dfs-postback.<account>.workers.dev
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/sites/\[id\]/product-search/start/
git commit -m "feat(api): add fire-and-forget product search endpoint with DFS postback"
```

---

## Task 5: Supabase Realtime Hook

React hook that subscribes to `dfs_search_cache` changes for a given keyword+market. Triggers callback when status changes to "complete".

**Files:**
- Create: `apps/admin/src/hooks/use-realtime-search.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime for dfs_search_cache updates.
 * Calls `onComplete` when a row matching `keyword`+`market` transitions to status=complete.
 */
export function useRealtimeSearch(
  keyword: string | null,
  market: string,
  onComplete: () => void,
) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!keyword) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`dfs-search-${keyword}-${market}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dfs_search_cache",
          filter: `keyword=eq.${keyword.toLowerCase()}`,
        },
        (payload) => {
          if (payload.new.status === "complete" && payload.new.market === market) {
            onCompleteRef.current();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [keyword, market]);
}
```

- [ ] **Step 2: Verify browser Supabase client exists**

Uses `apps/admin/src/lib/supabase/client.ts` which exports `createClient()` (already exists).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/hooks/use-realtime-search.ts
git commit -m "feat: add useRealtimeSearch hook for DFS postback notifications"
```

---

## Task 6: Previous Searches Component

Table showing cached searches from `dfs_search_cache` for the site's market. Click a row to load its results.

**Files:**
- Create: `apps/admin/src/app/(dashboard)/sites/[id]/products/PreviousSearches.tsx`

- [ ] **Step 1: Create the component**

Server-side fetch + client interaction. This is a client component that receives data from the page.

```typescript
"use client";

import { formatDistanceToNow } from "date-fns";

interface CachedSearch {
  keyword: string;
  market: string;
  depth: number;
  result_count: number;
  status: string;
  created_at: string;
}

interface Props {
  searches: CachedSearch[];
  onSelect: (keyword: string) => void;
}

export function PreviousSearches({ searches, onSelect }: Props) {
  if (searches.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Previous searches
      </h3>
      <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
        {searches.map((s) => (
          <button
            key={`${s.keyword}-${s.market}`}
            type="button"
            onClick={() => s.status === "complete" && onSelect(s.keyword)}
            disabled={s.status === "pending"}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/10 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-foreground truncate">{s.keyword}</span>
              {s.status === "pending" && (
                <span className="shrink-0 text-[10px] font-medium text-amber-400 border border-amber-400/40 px-1.5 py-0.5 rounded animate-pulse">
                  searching…
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              {s.status === "complete" && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.result_count} results
                </span>
              )}
              <span className="text-xs text-muted-foreground/60">
                {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/sites/\[id\]/products/PreviousSearches.tsx
git commit -m "feat: add PreviousSearches component for cached DFS search results"
```

---

## Task 7: Refactor ProductSearch for Async Flow

Update ProductSearch to: (1) use `/start` endpoint for new searches, (2) subscribe via Realtime for results, (3) show previous searches, (4) load cached results on click.

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductSearch.tsx`
- Modify: `apps/admin/src/app/(dashboard)/sites/[id]/products/new/page.tsx`
- Modify: `apps/admin/src/app/api/sites/[id]/product-search/route.ts`

- [ ] **Step 1: Update `new/page.tsx` to fetch previous searches and pass market**

Changes needed:
1. Add `market` to the sites select query: `.select("id, name, market")` (currently only `id, name`)
2. Add query to fetch `dfs_search_cache` rows for the site's market in the existing `Promise.all`:

```typescript
supabase
  .from("dfs_search_cache")
  .select("keyword, market, depth, results, status, created_at")
  .eq("market", (site.market ?? "ES").toUpperCase())
  .gt("expires_at", new Date().toISOString())
  .order("created_at", { ascending: false })
  .limit(20),
```

Note: the sites query must resolve first to get `market`, so either do a sequential fetch or default to "ES" for the cache query and filter client-side. Simplest: change the `Promise.all` to first fetch site, then fetch categories + cache in parallel.

Map results to include `result_count: (row.results as unknown[]).length`. Pass `previousSearches` and `market` as new props to `<ProductSearch>`.

- [ ] **Step 2: Refactor ProductSearch to use async flow**

Key changes:
- New props: `market: string`, `previousSearches: CachedSearch[]`
- `handleSearch`: POST to `/api/sites/${siteId}/product-search/start` instead of GET. If response status is "cached", do a GET to load from cache. If "pending", show waiting state and subscribe via `useRealtimeSearch`.
- `useRealtimeSearch(pendingKeyword, market, onSearchComplete)`: when called, fetches results from cache via existing GET endpoint.
- Add `<PreviousSearches>` section below search bar, above results. On click, sets query and loads results from cache GET.
- "Load more" flow: POST to `/start` with higher depth, same realtime pattern.

- [ ] **Step 3: Simplify GET `/product-search` route to cache-only reads**

The GET endpoint no longer calls DFS. It only reads from `dfs_search_cache`. Remove the DFS fetch block and `maxDuration`. Keep the cache lookup + `alreadyAdded` merge logic.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/sites/\[id\]/products/ apps/admin/src/app/api/sites/\[id\]/product-search/
git commit -m "feat: refactor product search to async postback flow with realtime updates"
```

---

## Task 8: Alert Bell Integration for Search Notifications

When a DFS search completes and the user is NOT on the product search page, show a notification in the bell.

**Files:**
- Modify: `apps/admin/src/components/alerts-bell.tsx`

- [ ] **Step 1: Add Realtime subscription for search completions**

Subscribe to `dfs_search_cache` UPDATE events where `status = 'complete'`. When received, increment a transient notification count on the bell (separate from product alerts). Show as a small indicator or merge into existing count.

Simple approach: add a second Realtime subscription in AlertsBell. When a search completes, show a toast or add a temporary count to the bell badge. When bell is opened, clear it.

```typescript
// In AlertsBell, add:
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel("search-notifications")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "dfs_search_cache" },
      // REPLICA IDENTITY FULL is set on the table, so payload.old is available
      (payload) => {
        if (payload.new.status === "complete" && payload.old?.status === "pending") {
          setSearchNotifications((prev) => prev + 1);
        }
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []);
```

Show `searchNotifications` count as a separate blue badge on the bell (distinct from amber product alerts badge). Clear when bell opens.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/alerts-bell.tsx
git commit -m "feat: show search completion notifications in alert bell via Realtime"
```

---

## Task 9: Deploy & Test End-to-End

- [ ] **Step 1: Build and restart admin**

```bash
cd /home/daniel/monster && pnpm --filter @monster/admin build && pm2 restart monster-admin
```

- [ ] **Step 2: Verify Worker is deployed**

```bash
curl -X POST https://dfs-postback.<account>.workers.dev -H "Content-Type: application/json" -d '{}'
```

Expected: `403 Forbidden` (our IP is not in DFS whitelist — correct behavior).

- [ ] **Step 3: Test search flow in admin UI**

1. Go to a site → Products → New → Search
2. Enter a keyword and submit
3. Should see "searching…" state
4. When DFS postback arrives, results should appear automatically
5. Navigate away → bell should show notification
6. Previous searches should show in the table

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "fix: adjustments from e2e testing"
```
