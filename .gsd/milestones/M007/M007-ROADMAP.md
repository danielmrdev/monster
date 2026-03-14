# M007: Monster Chat + Research Lab

**Vision:** Two AI-native features that make BuilderMonster feel like a living system — Monster Chat gives the user a conversational co-pilot with streaming responses and real portfolio context, and Research Lab runs autonomous niche research producing actionable viability reports from real DataForSEO data.

## Success Criteria

- User can open Monster Chat, type "Which sites do I have?", and receive a streaming response referencing real Supabase data via MCP tools
- User can submit a niche idea in Research Lab, watch the agent work in real-time (progress updates via Supabase polling), and receive a completed viability report with keyword data, competitor signals, Amazon product examples, and domain suggestions
- Domain suggestions in the research report show live Spaceship availability status (available / taken)
- Research sessions are persisted in Supabase — history list accessible from Research Lab
- "Create site from this research" CTA pre-fills the site creation form with niche and market data from the report

## Key Risks / Unknowns

- **Claude Agent SDK streaming bridge** — bridging Agent SDK's `async for` iterator to a browser HTTP response via SSE in a Next.js 15 Route Handler is the hardest unknown. Must be proven with a real working streaming chat UI, not just a test.
- **Agent SDK + MCP custom tools** — `prompt` must be an async generator (not a string) to enable MCP tool calls. Silent failure mode if wrong: tools are never invoked. Must be proven by Monster actually calling a portfolio tool and returning real DB data.
- **NicheResearcher long-running BullMQ job** — `maxTurns: 15` + DataForSEO polling (~60s/keyword) = 5–10 min jobs. `lockDuration: 600000` required. Agent writes progress to DB; UI polls. Must survive browser disconnect.
- **New DataForSEO endpoints** — Labs API, Keywords Data API, SERP API are different from the Merchant API already implemented. New client methods + async task_post/poll/task_get flow needed.

## Proof Strategy

- SDK streaming bridge → retire in S01: user can type a question in the real chat UI and see tokens stream in before the response completes, with the response referencing real portfolio data fetched via MCP tool
- MCP custom tools → retire in S01: Monster's response demonstrably contains data that could only come from a DB query (site names, statuses, counts) — not from model training data
- Long-running BullMQ job → retire in S02: submit a research request, close the browser tab, reopen it — the session is still running and progress has updated
- DataForSEO new endpoints → retire in S02: completed research report contains real keyword volume data from Labs API (not mock data)

## Verification Classes

- Contract verification: TypeScript typecheck exits 0 across all packages; `pnpm --filter @monster/agents build` exits 0; `pnpm --filter @monster/admin build` exits 0
- Integration verification: Monster Chat streaming response contains data from real Supabase query; NicheResearcher report contains real DataForSEO Labs keyword data
- Operational verification: NicheResearcher BullMQ job survives browser disconnect (progress visible in DB while job runs); monster-worker starts cleanly with new job registered
- UAT / human verification: streaming chat UI responsiveness feels natural (no visible jank/delay on token receipt); research report viability score and keyword data makes sense for the submitted niche

## Milestone Definition of Done

This milestone is complete only when all are true:

- S01, S02, S03 all complete with their slice-level verification passing
- Monster Chat: streaming response with real MCP tool call data visible in browser
- Research Lab: submitted niche produces completed report with real DataForSEO data persisted in Supabase
- Domain availability check wired — at least one domain suggestion shows live Spaceship status
- "Create site" CTA navigates to `/sites/new` with form pre-filled from report data
- All package builds and typechecks exit 0
- monster-worker boots cleanly with NicheResearcherJob registered (log line visible in pm2)

## Requirement Coverage

- Covers: R010 (Monster Chat agent), R003 (Autonomous niche research)
- Partially covers: R002 (extensible architecture — Research Lab establishes the NicheResearcher agent pattern usable for future site types)
- Leaves for later: R001, R006, R007, R008, R009, R011, R012 (not in scope for this milestone)
- Orphan risks: none — all active requirements relevant to M007 are mapped

## Slices

- [x] **S01: Monster Chat — Streaming Agent + MCP Portfolio Tools** `risk:high` `depends:[]`
  > After this: user can open `/monster`, start or resume a conversation, type a question, and receive a real-time streaming response that references actual portfolio data (site count, site names, statuses) fetched via MCP tools — tokens appear progressively as Claude generates them

- [ ] **S02: NicheResearcher — Background Agent + DataForSEO Research** `risk:high` `depends:[S01]`
  > After this: user can submit a niche idea from Research Lab, watch per-phase progress updates appear as the agent works (via 5-second Supabase poll), and see a completed structured report in `research_sessions.report` containing real DataForSEO keyword data, SERP competitor signals, and Amazon product examples — job survives browser disconnect

- [ ] **S03: Research Report UI + Domain Suggestions + Create Site CTA** `risk:low` `depends:[S02]`
  > After this: completed research sessions display a full formatted report in the admin panel with keyword table, competitor list, Amazon products, domain suggestions with live Spaceship availability badges, viability score, and a "Create site from this research" button that navigates to `/sites/new` with the form pre-filled

## Boundary Map

### S01 → S02

Produces:
- `@anthropic-ai/claude-agent-sdk` installed + wired in `packages/agents/package.json`, `tsup.config.ts` external list, and `apps/admin/next.config.ts` `serverExternalPackages`
- `ClaudeSDKClient` utility class in `packages/agents/src/clients/claude-sdk.ts` — `streamQuery(prompt, sessionId?, mcpServers?)` returning SSE-compatible async iterator
- Monster MCP server factory — `createMonsterMcpServer(supabase)` returning `McpServer` with 4 read-only tools: `getPortfolioStats`, `getSiteDetail`, `getAnalytics`, `getAlerts`
- DB migration: `chat_conversations.agent_session_id text` column added
- `/api/monster/chat` Route Handler pattern proven (SSE streaming from Agent SDK to browser)
- `chat_conversations` + `chat_messages` DB round-trip established (conversation create, message persist)

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- `NicheResearcherJob` in `packages/agents/src/jobs/niche-researcher.ts` — BullMQ job that runs Agent SDK `query()` with `maxTurns: 15`, writes progress to `research_sessions.progress` jsonb on each turn, writes final structured report to `research_sessions.report` on completion
- DB migration: `research_sessions.progress jsonb` column added
- `DataForSEOClient` extended with `searchKeywords(keyword, market)`, `getSerpData(keyword, market)`, `getKeywordData(keywords[], market)` methods — new Labs + SERP + Keywords Data API endpoints
- `ResearchReport` TypeScript type (Zod schema) defining the structured shape of `research_sessions.report` jsonb
- `nicheResearcherQueue()` singleton + `enqueueNicheResearch(sessionId, nicheIdea, market)` exported from `packages/agents/src/index.ts`
- `enqueueResearch` server action in `apps/admin/src/app/(dashboard)/research/actions.ts`
- Research Lab page: niche idea form + live session status polling (5-second interval via `JobStatus.tsx` pattern)

Consumes:
- Agent SDK installed and working (`packages/agents`)
- BullMQ job pattern (`GenerateSiteJob`, `ProductRefreshJob`)
- `DataForSEOClient` base class with auth and task_post/poll/task_get flow

### S03 (terminal — no downstream)

Produces:
- Research report viewer component showing keyword table, competitors, Amazon products, domain suggestions with Spaceship availability badges, viability score
- Research session history list (past sessions with status and clickable report links)
- "Create site from this research" CTA — navigates to `/sites/new?niche=...&market=...&keywords=...` with pre-filled form values

Consumes:
- `research_sessions.report` jsonb in `ResearchReport` shape (from S02)
- `SpaceshipClient.checkAvailability()` (already implemented in `packages/domains`)
- Sites new form accepting query params for pre-fill (from M002/S01)
