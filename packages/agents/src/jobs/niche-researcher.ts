import { query } from "@anthropic-ai/claude-agent-sdk";
import { Worker } from "bullmq";
import { createServiceClient } from "@monster/db";
import { SpaceshipClient } from "@monster/domains";
import { ResearchReportSchema } from "@monster/shared";
import { createRedisConnection } from "../queue.js";
import { DataForSEOClient } from "../clients/dataforseo.js";
import { createNicheResearcherMcpServer } from "../mcp/niche-researcher-server.js";

// ---------------------------------------------------------------------------
// NicheResearchPayload
// ---------------------------------------------------------------------------

export interface NicheResearchPayload {
  sessionId: string;
  nicheIdea: string;
  market: string;
}

// ---------------------------------------------------------------------------
// System prompt
//
// Instructs the agent to:
//   1. Research keyword volume with keywordIdeas
//   2. Analyze SERP competition with serpCompetitors + googleSerpResults
//   3. Search Amazon products with amazonProducts (max 1 call)
//   4. Suggest 3 domains and check availability with checkDomainAvailability
//   5. Emit ONLY a JSON object matching ResearchReport schema — no prose before or after
// ---------------------------------------------------------------------------

const RESEARCH_REPORT_SCHEMA = `{
  "niche_idea": "string — the original niche idea",
  "market": "string — Amazon market code (ES, US, UK, DE, FR, IT)",
  "viability_score": "number 0-100 — your viability assessment",
  "summary": "string — executive summary of findings",
  "keywords": [
    { "keyword": "string", "search_volume": "number|null", "cpc": "number|null", "competition": "number 0-1|null" }
  ],
  "competitors": [
    { "domain": "string", "median_position": "number|null", "relevance": "string" }
  ],
  "amazon_products": [
    { "asin": "string", "title": "string", "price": "number|null", "rating": "number", "review_count": "number", "is_prime": "boolean" }
  ],
  "domain_suggestions": [
    { "domain": "string", "available": "boolean|null", "price": "string (optional)" }
  ],
  "recommendation": "string — actionable recommendation on whether to pursue this niche",
  "generated_at": "string — ISO 8601 timestamp"
}`;

const SYSTEM_PROMPT = `You are a niche research agent for an Amazon affiliate site portfolio.
Your task is to autonomously research a niche idea and produce a structured JSON report.

Research process (follow this order):
1. Call keywordIdeas with the niche idea to get search volume data. Fetch related keywords too.
2. Call serpCompetitors with 3-5 of the best keywords to identify top competitor domains.
3. Call googleSerpResults for the main keyword to understand SERP landscape.
4. Call amazonProducts ONCE (max 1 call — it is slow and expensive) to get product examples.
5. Suggest exactly 3 domain names that would work well for an affiliate site in this niche.
   Call checkDomainAvailability for each suggested domain.
6. Analyze all gathered data and produce your viability assessment (0-100 score).

IMPORTANT: Your final response MUST be ONLY a valid JSON object matching this schema:
${RESEARCH_REPORT_SCHEMA}

Do NOT include any prose, markdown, explanation, or code fences before or after the JSON.
The raw JSON object is the complete and final output. Start with { and end with }.

Niche idea to research: `;

// ---------------------------------------------------------------------------
// NicheResearcherJob
//
// Queue: 'niche-research'
// lockDuration: 600000ms (10 min) — agent runs up to 15 turns + amazonProducts is slow (30-60s)
// includePartialMessages: absent (defaults false) — only full turns emitted, no stream_event filtering needed
// ---------------------------------------------------------------------------

export class NicheResearcherJob {
  /**
   * Creates a BullMQ Worker on queue 'niche-research'.
   * Returns the Worker so the caller can add it to the shutdown array.
   */
  register(): Worker {
    const connection = createRedisConnection();

    const worker = new Worker<NicheResearchPayload>("niche-research", handler, {
      connection,
      lockDuration: 600000, // 10 min — 15 turns + 30-60s amazonProducts call
    });

    worker.on("failed", (job, err) => {
      console.error(
        `[NicheResearcherJob] Job ${job?.id} session=${job?.data?.sessionId} failed: ${err.message}`,
      );
    });

    return worker;
  }
}

// ---------------------------------------------------------------------------
// Handler — runs inside the Worker process
// ---------------------------------------------------------------------------

async function handler(job: import("bullmq").Job<NicheResearchPayload>): Promise<void> {
  const { sessionId, nicheIdea, market } = job.data;
  const supabase = createServiceClient();

  console.log(
    `[niche-researcher] sessionId=${sessionId} status=running nicheIdea="${nicheIdea}" market=${market}`,
  );

  // ── Step 1: Verify session exists + write status=running ─────────────────
  const { data: session, error: sessionError } = await supabase
    .from("research_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    console.error(`[niche-researcher] sessionId=${sessionId} not found — aborting`);
    return; // Session deleted between enqueue and execution — safe to skip
  }

  const { error: startUpdateError } = await supabase
    .from("research_sessions")
    .update({ status: "running", progress: [] })
    .eq("id", sessionId);

  if (startUpdateError) {
    console.error(
      `[niche-researcher] sessionId=${sessionId} failed to write status=running: ${startUpdateError.message}`,
    );
  }

  // ── Step 2: Instantiate clients ─────────────────────────────────────────
  const dfsClient = new DataForSEOClient();
  const spaceshipClient = new SpaceshipClient();
  const mcpServer = createNicheResearcherMcpServer(dfsClient, spaceshipClient);

  // ── Step 3: Run agent ────────────────────────────────────────────────────
  // progress tracks { turn, phase, summary, timestamp } entries appended per assistant turn
  const progressEntries: Array<{
    turn: number;
    phase: string;
    summary: string;
    timestamp: string;
  }> = [];
  let turnIndex = 0;

  try {
    const sdkQuery = query({
      prompt: SYSTEM_PROMPT + nicheIdea,
      options: {
        maxTurns: 15,
        persistSession: false,
        tools: [], // No built-in tools — only MCP
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        mcpServers: { researcher: mcpServer },
        // includePartialMessages absent (defaults false) — only SDKAssistantMessage + SDKResultMessage emitted
      },
    });

    for await (const msg of sdkQuery) {
      if (msg.type === "assistant") {
        // Extract a summary from the first 150 chars of message content
        // BetaMessage.content is always an array of content blocks
        const content = msg.message?.content;
        let summary = "";
        if (Array.isArray(content)) {
          // Find first text block
          const textBlock = content.find((b) => b.type === "text");
          if (textBlock && "text" in textBlock) {
            summary = String(textBlock.text).slice(0, 150).replace(/\n/g, " ");
          } else {
            // Tool use block — describe the tool call
            const toolBlock = content.find((b) => b.type === "tool_use");
            if (toolBlock && "name" in toolBlock) {
              summary = `Tool call: ${String(toolBlock.name)}`;
            }
          }
        }

        turnIndex++;
        const entry = {
          turn: turnIndex,
          phase: "research",
          summary: summary || `Turn ${turnIndex}`,
          timestamp: new Date().toISOString(),
        };
        progressEntries.push(entry);

        console.log(
          `[niche-researcher] sessionId=${sessionId} turn=${turnIndex} progress_entries=${progressEntries.length}`,
        );

        // Write progress to DB after each assistant turn
        const { error: progressError } = await supabase
          .from("research_sessions")
          .update({ progress: progressEntries })
          .eq("id", sessionId);

        if (progressError) {
          console.error(
            `[niche-researcher] sessionId=${sessionId} progress write failed turn=${turnIndex}: ${progressError.message}`,
          );
        }
      } else if (msg.type === "result") {
        // SDKResultMessage — parse the report from result string
        if (msg.is_error) {
          // Error result (SDKResultError) — no .result string
          const errors = "errors" in msg ? (msg.errors as string[]) : [];
          const errorSummary = errors.join("; ") || `subtype=${msg.subtype}`;
          console.error(
            `[niche-researcher] sessionId=${sessionId} result is_error=true: ${errorSummary}`,
          );

          // Append error to progress
          progressEntries.push({
            turn: turnIndex + 1,
            phase: "failed",
            summary: `Agent error: ${errorSummary}`,
            timestamp: new Date().toISOString(),
          });

          await supabase
            .from("research_sessions")
            .update({
              status: "failed",
              progress: progressEntries,
            })
            .eq("id", sessionId);

          return;
        }

        // SDKResultSuccess — has .result string
        const resultStr = "result" in msg ? (msg.result as string) : "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let report: any = null;
        let parseSuccess = false;

        try {
          // Strip potential markdown fences if model wrapped JSON despite instructions
          const stripped = resultStr
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim();
          const parsed = JSON.parse(stripped);
          report = ResearchReportSchema.parse(parsed);
          parseSuccess = true;
          console.log(
            `[niche-researcher] sessionId=${sessionId} status=completed report parsed successfully`,
          );
        } catch (parseErr) {
          const parseErrMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          console.warn(
            `[niche-researcher] sessionId=${sessionId} report parse failed: ${parseErrMsg} — storing raw result`,
          );
          report = {
            raw: resultStr.slice(0, 5000),
            error: "parse_failed",
            parse_error: parseErrMsg,
          };
        }

        // Write report + completed status (even on parse failure — partial > failure)
        const { error: finalUpdateError } = await supabase
          .from("research_sessions")
          .update({
            status: "completed",
            report,
            progress: progressEntries,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        if (finalUpdateError) {
          console.error(
            `[niche-researcher] sessionId=${sessionId} final update failed: ${finalUpdateError.message}`,
          );
        } else {
          console.log(
            `[niche-researcher] sessionId=${sessionId} status=completed parseSuccess=${parseSuccess} turns=${turnIndex}`,
          );
        }

        return;
      }
      // All other message types (system, user, etc.) are silently ignored
    }

    // Iterator exhausted without result message — mark completed with what we have
    console.warn(
      `[niche-researcher] sessionId=${sessionId} iterator exhausted without result message`,
    );
    await supabase
      .from("research_sessions")
      .update({ status: "failed", progress: progressEntries })
      .eq("id", sessionId);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[niche-researcher] sessionId=${sessionId} status=failed error: ${errMsg}`);

    progressEntries.push({
      turn: turnIndex + 1,
      phase: "failed",
      summary: errMsg.slice(0, 300),
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from("research_sessions")
      .update({
        status: "failed",
        progress: progressEntries,
      })
      .eq("id", sessionId);

    throw err; // Re-throw so BullMQ marks the job as failed and persists it in Redis
  }
}
