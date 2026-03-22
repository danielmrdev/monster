import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DataForSEOClient } from "@monster/agents";

interface Params {
  params: Promise<{ id: string }>;
}

const POSTBACK_WORKER_URL = process.env.DFS_POSTBACK_WORKER_URL ?? "";

/**
 * POST /api/sites/[id]/product-search/start
 * Body: { keyword: string, depth?: number }
 * Returns: { status: "pending"|"cached"|"already_pending", keyword, market, taskId? }
 *
 * Fire-and-forget: sends DFS task_post with postback_url, returns immediately.
 * The Cloudflare Worker will receive results and upsert into dfs_search_cache.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params;

  if (!POSTBACK_WORKER_URL) {
    return NextResponse.json({ error: "DFS_POSTBACK_WORKER_URL not configured" }, { status: 500 });
  }

  const body = await request.json();
  const keyword = (body.keyword as string)?.trim();
  const depthParam = parseInt(body.depth ?? "100", 10);
  const depth = Math.min(
    400,
    Math.max(100, isNaN(depthParam) ? 100 : Math.ceil(depthParam / 100) * 100),
  );

  if (!keyword) {
    return NextResponse.json({ error: "keyword required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: site } = await supabase.from("sites").select("market").eq("id", siteId).single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const market = (site.market ?? "ES").toUpperCase();

  // Check cache — valid complete cache hit means no need to call DFS
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
    return NextResponse.json({ status: "already_pending", keyword, market });
  }

  // Insert pending row (or update existing expired row)
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
    {
      onConflict: "dfs_search_cache_keyword_market_uq",
      ignoreDuplicates: false,
    },
  );

  // Fire DFS task_post with postback_url — tag = siteId for routing notifications
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
    // Rollback to avoid stuck pending state
    await supabase
      .from("dfs_search_cache")
      .update({ status: "complete", results: [] })
      .eq("keyword", keyword.toLowerCase())
      .eq("market", market);

    const message = err instanceof Error ? err.message : String(err);
    console.error(`[product-search/start] error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
