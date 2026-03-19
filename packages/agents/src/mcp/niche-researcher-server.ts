import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { DataForSEOClient } from "../clients/dataforseo.js";
import type { SpaceshipClient } from "@monster/domains";

/**
 * Creates an in-process MCP server for the NicheResearcher background agent.
 * Returns McpSdkServerConfigWithInstance for use in query() options.mcpServers.
 *
 * Five tools:
 *   - keywordIdeas      — DataForSEO Labs keyword ideas (live endpoint)
 *   - serpCompetitors   — DataForSEO Labs SERP competitor domains (live endpoint)
 *   - googleSerpResults — DataForSEO SERP live results (live endpoint)
 *   - amazonProducts    — DataForSEO Merchant API (async task — warn: 30-60s per call)
 *   - checkDomainAvailability — Spaceship API domain availability check
 *
 * Signals: [niche-mcp] tool=${name} called / result rows=${n}
 */
export function createNicheResearcherMcpServer(
  dfsClient: DataForSEOClient,
  spaceshipClient: SpaceshipClient,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "niche-researcher",
    version: "1.0.0",
    tools: [
      tool(
        "keywordIdeas",
        "Get keyword ideas with search volume and competition data for a niche keyword. Uses DataForSEO Labs live endpoint. Returns array of { keyword, search_volume, cpc, competition } objects.",
        {
          keyword: z.string().describe('Seed keyword to research (e.g. "freidoras de aire")'),
          market: z.string().describe("Amazon market code: ES, US, UK, DE, FR, IT"),
          limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)"),
        },
        async (args, _extra) => {
          console.log(
            `[niche-mcp] tool=keywordIdeas called keyword="${args.keyword}" market=${args.market}`,
          );
          try {
            const results = await dfsClient.keywordIdeas(args.keyword, args.market);
            const limited = args.limit ? results.slice(0, args.limit) : results;
            console.log(`[niche-mcp] tool=keywordIdeas result rows=${limited.length}`);
            return { content: [{ type: "text" as const, text: JSON.stringify(limited) }] };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[niche-mcp] tool=keywordIdeas error: ${message}`);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            };
          }
        },
      ),

      tool(
        "serpCompetitors",
        "Get competitor domains ranking for a set of keywords via DataForSEO Labs SERP competitors live endpoint. Returns array of { domain, median_position, avg_position } objects.",
        {
          keywords: z
            .array(z.string())
            .min(1)
            .max(10)
            .describe("Array of keywords to analyze (1-10)"),
          market: z.string().describe("Amazon market code: ES, US, UK, DE, FR, IT"),
        },
        async (args, _extra) => {
          console.log(
            `[niche-mcp] tool=serpCompetitors called keywords=${args.keywords.length} market=${args.market}`,
          );
          try {
            const results = await dfsClient.serpCompetitors(args.keywords, args.market);
            console.log(`[niche-mcp] tool=serpCompetitors result rows=${results.length}`);
            return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[niche-mcp] tool=serpCompetitors error: ${message}`);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            };
          }
        },
      ),

      tool(
        "googleSerpResults",
        "Get live Google SERP results for a keyword via DataForSEO. Returns top ranking pages with domain, URL, title, and rank position. Useful to understand what types of sites (affiliates, retailers, media) dominate this keyword.",
        {
          keyword: z.string().describe("Keyword to search"),
          market: z.string().describe("Amazon market code: ES, US, UK, DE, FR, IT"),
        },
        async (args, _extra) => {
          console.log(
            `[niche-mcp] tool=googleSerpResults called keyword="${args.keyword}" market=${args.market}`,
          );
          try {
            const results = await dfsClient.googleSerpResults(args.keyword, args.market);
            console.log(`[niche-mcp] tool=googleSerpResults result rows=${results.length}`);
            return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[niche-mcp] tool=googleSerpResults error: ${message}`);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            };
          }
        },
      ),

      tool(
        "amazonProducts",
        "Search Amazon products for a keyword using DataForSEO Merchant API. WARNING: This is an async task that takes 30-60 seconds. Use sparingly (max 1 call per research session) to keep costs low. Returns product ASINs, titles, prices, ratings.",
        {
          keyword: z.string().describe("Search keyword for Amazon products"),
          market: z.string().describe("Amazon market code: ES, US, UK, DE, FR, IT"),
        },
        async (args, _extra) => {
          console.log(
            `[niche-mcp] tool=amazonProducts called keyword="${args.keyword}" market=${args.market} (async task — may take 30-60s)`,
          );
          try {
            const results = await dfsClient.searchProducts(args.keyword, args.market);
            console.log(`[niche-mcp] tool=amazonProducts result rows=${results.length}`);
            return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[niche-mcp] tool=amazonProducts error: ${message}`);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            };
          }
        },
      ),

      tool(
        "checkDomainAvailability",
        "Check whether a domain name is available for registration using the Spaceship API. Returns { available: boolean, price?: string }. Agents NEVER purchase domains — only check availability.",
        {
          domain: z.string().describe('Full domain name to check (e.g. "freidorasaire.es")'),
        },
        async (args, _extra) => {
          console.log(`[niche-mcp] tool=checkDomainAvailability called domain="${args.domain}"`);
          try {
            const result = await spaceshipClient.checkAvailability(args.domain);
            console.log(
              `[niche-mcp] tool=checkDomainAvailability result available=${result.available} domain="${args.domain}"`,
            );
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[niche-mcp] tool=checkDomainAvailability error: ${message}`);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            };
          }
        },
      ),
    ],
  });
}
