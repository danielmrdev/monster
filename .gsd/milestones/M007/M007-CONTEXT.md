# M007: Monster Chat + Research Lab — Context

**Gathered:** 2026-03-13
**Status:** Provisional — detail-plan when M006 is complete

## Why This Milestone

Two AI-native features that make BuilderMonster feel like a living system rather than a CRUD app. Monster Chat gives the user a conversational interface to the entire portfolio with streaming responses. Research Lab runs autonomous niche research via NicheResearcher agent — the user inputs an idea and gets back a full viability report with keyword data, competitor analysis, domain suggestions, and income estimates.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Open Monster Chat and ask "Which sites are performing best this month?" → get a real answer from portfolio data
- Ask Monster to "Suggest 3 niches for the US market in the kitchen category" → get AI-reasoned suggestions
- Submit a niche idea to Research Lab → see the agent working in real-time (streaming progress)
- View completed research reports with viability score, keywords, competitors, domain suggestions
- Click "Create site from this research" → pre-fills the site creation form

### Entry point / environment
- Entry point: Monster Chat page + Research Lab page in admin panel
- Environment: VPS1, Claude Agent SDK, DataForSEO APIs, Spaceship API (availability only)
- Live dependencies: Anthropic API (Agent SDK), DataForSEO, Spaceship API, Supabase

## Completion Class

- Contract complete means: Agent SDK query() and streaming work in Next.js 15 App Router context
- Integration complete means: Monster reads real portfolio data via MCP tool; NicheResearcher produces real reports from DataForSEO
- Operational complete means: long-running research jobs survive connection drops (stored in DB, resumable)

## Final Integrated Acceptance

- Monster Chat: ask a portfolio question → receives streaming response referencing real site data
- Research Lab: submit niche "sillas gaming" → report generated with DataForSEO data (keywords, ASINs, domain suggestions)
- Domain suggestions verified against Spaceship API (available/taken status shown)
- Research report stored in Supabase, accessible from Research Lab history

## Risks and Unknowns

- **Claude Agent SDK in Next.js App Router** — streaming from Agent SDK to browser via Server-Sent Events or WebSocket needs validation. The SDK uses `async for` iteration which must be bridged to a streaming HTTP response.
- **Monster MCP server** — custom MCP server for DB access needs careful design. Tools must be read-only (no mutations from chat).
- **NicheResearcher in BullMQ** — running Agent SDK `query()` inside a BullMQ job and streaming progress to DB is a non-trivial pattern. The agent's intermediate thinking must be persisted.
- **DataForSEO API costs during research** — a full research run touches Labs + SERP + Keywords Data + Merchant APIs. Need to estimate cost per research run and cap agent turns to avoid runaway spend.

## Existing Codebase / Prior Art

- M001-M006: full DB schema, all site/analytics/finance data
- `packages/agents` scaffold from M001
- `docs/PRD.md`: AI Agents section, Research Lab tools specification
- Claude Agent SDK docs: TypeScript streaming, custom MCP tools, `maxTurns`

## Relevant Requirements

- R003 — Autonomous niche research (NicheResearcher)
- R010 — Monster Chat agent
- R011 — Domain management (availability check, used in Research Lab)

## Scope

### In Scope
- Monster Chat: streaming chat UI, ClaudeSDKClient, persistent conversation history, portfolio context MCP server
- Research Lab: NicheResearcher agent (BullMQ job, maxTurns limit), research report UI with real-time progress
- Domain Suggester: Spaceship availability check integrated in research report
- "Create site" CTA from research report → pre-filled site form
- Research history: list of past research sessions with status and results

### Out of Scope
- Autonomous site creation from research (user always approves)
- Domain purchase from Research Lab (M004 domain approval flow handles this)
- ContentOptimizer / PerformanceMonitor (deferred to Phase 2)

## Technical Constraints

- Claude Agent SDK: `@anthropic-ai/claude-agent-sdk`, TypeScript
- Monster: `ClaudeSDKClient` with streaming, `includePartialMessages: true`
- NicheResearcher: `query()` with `maxTurns: 15` hard limit (cost guard)
- MCP server for Monster: read-only tools (getPortfolioStats, getSiteDetail, getAnalytics, getAlerts)
- Research streaming: agent writes progress to `research_sessions.progress` jsonb in Supabase; UI polls or uses Supabase Realtime
- NicheResearcher NEVER calls Spaceship registration — availability check only

## Integration Points

- Anthropic API: Claude Agent SDK (not Claude API)
- DataForSEO: Labs + SERP + Keywords Data + Merchant APIs
- Spaceship API: domain availability check only (no purchase)
- Supabase Realtime: research progress streaming to admin panel
- BullMQ: NicheResearcher jobs
