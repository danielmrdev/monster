import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

/**
 * Creates an in-process MCP server for Monster Chat.
 * Returns McpSdkServerConfigWithInstance for use in query() options.mcpServers.
 *
 * All tools are read-only portfolio queries.
 * Signals: [monster-mcp] tool=${name} called / result rows=${n}
 */
export function createMonsterMcpServer(supabase: SupabaseClient): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "monster",
    version: "1.0.0",
    tools: [
      tool(
        "getPortfolioStats",
        "Get aggregate counts of all sites grouped by status. Returns total count and per-status breakdown.",
        {},
        async (_args, _extra) => {
          console.log("[monster-mcp] tool=getPortfolioStats called");
          const { data, error } = await supabase.from("sites").select("status");

          if (error) {
            console.error("[monster-mcp] tool=getPortfolioStats error:", error.message);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: error.message }) }],
            };
          }

          const rows = data ?? [];
          const counts: Record<string, number> = {};
          for (const row of rows) {
            const s = row.status ?? "unknown";
            counts[s] = (counts[s] ?? 0) + 1;
          }
          const stats = {
            total: rows.length,
            live: counts["live"] ?? 0,
            generating: counts["generating"] ?? 0,
            deploying: counts["deploying"] ?? 0,
            paused: counts["paused"] ?? 0,
            error: counts["error"] ?? 0,
            ...counts,
          };

          console.log(`[monster-mcp] tool=getPortfolioStats result rows=${rows.length}`);
          return { content: [{ type: "text" as const, text: JSON.stringify(stats) }] };
        },
      ),

      tool(
        "getSiteDetail",
        "Get detailed information about a specific site by its name or ID.",
        { identifier: z.string().describe("Site name (partial match) or UUID") },
        async (args, _extra) => {
          console.log(`[monster-mcp] tool=getSiteDetail called identifier=${args.identifier}`);

          // Try by ID first (UUID format), then by name ILIKE
          const isUuid = /^[0-9a-f-]{36}$/i.test(args.identifier);

          let data, error;
          if (isUuid) {
            ({ data, error } = await supabase
              .from("sites")
              .select(
                "id, name, domain, niche, status, market, language, template_slug, created_at, updated_at",
              )
              .eq("id", args.identifier)
              .maybeSingle());
          } else {
            ({ data, error } = await supabase
              .from("sites")
              .select(
                "id, name, domain, niche, status, market, language, template_slug, created_at, updated_at",
              )
              .ilike("name", `%${args.identifier}%`)
              .limit(1)
              .maybeSingle());
          }

          if (error) {
            console.error("[monster-mcp] tool=getSiteDetail error:", error.message);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: error.message }) }],
            };
          }

          const rowCount = data ? 1 : 0;
          console.log(`[monster-mcp] tool=getSiteDetail result rows=${rowCount}`);
          return { content: [{ type: "text" as const, text: JSON.stringify(data ?? null) }] };
        },
      ),

      tool(
        "getAnalytics",
        "Get aggregated analytics for a site over the last N days (default 30). Returns total pageviews and affiliate clicks.",
        {
          site_id: z.string().describe("Site UUID"),
          days: z
            .number()
            .int()
            .min(1)
            .max(365)
            .optional()
            .describe("Number of days to look back (default 30)"),
        },
        async (args, _extra) => {
          const days = args.days ?? 30;
          console.log(
            `[monster-mcp] tool=getAnalytics called site_id=${args.site_id} days=${days}`,
          );

          const since = new Date();
          since.setDate(since.getDate() - days);
          const sinceStr = since.toISOString().slice(0, 10); // YYYY-MM-DD

          const { data, error } = await supabase
            .from("analytics_daily")
            .select("pageviews, affiliate_clicks, unique_visitors")
            .eq("site_id", args.site_id)
            .gte("date", sinceStr);

          if (error) {
            console.error("[monster-mcp] tool=getAnalytics error:", error.message);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: error.message }) }],
            };
          }

          const rows = data ?? [];
          const totals = rows.reduce(
            (
              acc: { pageviews: number; affiliate_clicks: number; unique_visitors: number },
              row: { pageviews: number; affiliate_clicks: number; unique_visitors: number },
            ) => ({
              pageviews: acc.pageviews + (row.pageviews ?? 0),
              affiliate_clicks: acc.affiliate_clicks + (row.affiliate_clicks ?? 0),
              unique_visitors: acc.unique_visitors + (row.unique_visitors ?? 0),
            }),
            { pageviews: 0, affiliate_clicks: 0, unique_visitors: 0 },
          );

          const result = { site_id: args.site_id, days, ...totals };
          console.log(`[monster-mcp] tool=getAnalytics result rows=${rows.length}`);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        },
      ),

      tool(
        "getAlerts",
        "Get open product alerts. Optionally filter by site ID.",
        {
          site_id: z.string().optional().describe("Optional site UUID to filter alerts by"),
        },
        async (args, _extra) => {
          console.log(`[monster-mcp] tool=getAlerts called site_id=${args.site_id ?? "all"}`);

          let query = supabase
            .from("product_alerts")
            .select("id, site_id, product_id, alert_type, severity, status, details, created_at")
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(50);

          if (args.site_id) {
            query = query.eq("site_id", args.site_id);
          }

          const { data, error } = await query;

          if (error) {
            console.error("[monster-mcp] tool=getAlerts error:", error.message);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: error.message }) }],
            };
          }

          const rows = data ?? [];
          console.log(`[monster-mcp] tool=getAlerts result rows=${rows.length}`);
          return { content: [{ type: "text" as const, text: JSON.stringify(rows) }] };
        },
      ),
    ],
  });
}
