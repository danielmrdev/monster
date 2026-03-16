---
id: M009
provides:
  - Generate Site button with useTransition spinner + live job polling
  - Preview toolbar slash bug fixed
  - Chat markdown rendering (react-markdown)
  - claude_api_key + amazon_affiliate_tag removed from Settings
  - Dashboard: P&L widget, top sites, failed jobs table, open alerts KPI
  - POST /api/sites/[id]/generate-seo-text — AI SEO text streaming via ClaudeSDKClient
  - CategoryForm + ProductForm "Generate with AI" buttons
  - agent_prompts DB table + Settings prompt editor (3 agents)
  - Global chat sidebar (DashboardShell + ChatSidebar) with localStorage persistence + page context
  - /templates nav item in NavSidebar
  - AmazonScraper class (cheerio + rotating UAs) replacing DataForSEO for product search
  - types/index.d.ts postbuild copy pattern (durable DTS)
  - writeSeoFiles: sitemap.xml, robots.txt, llm.txt, buildermonster.txt in dist/ post-build
  - pingIndexNow: IndexNow API ping after deploy (non-fatal)
  - legal_templates + legal_template_assignments DB tables
  - /templates CRUD admin UI
  - Site edit: legal template assignment per type
  - GenerateSiteJob: legalTemplates injection into site.json
  - Astro [legal].astro: reads assigned templates with fallback
key_files:
  - apps/admin/src/components/chat-sidebar.tsx
  - apps/admin/src/components/dashboard-shell.tsx
  - apps/admin/src/components/nav-sidebar.tsx
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
  - apps/admin/src/app/(dashboard)/templates/
  - apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/GenerateSiteButton.tsx
  - apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts
  - packages/agents/src/clients/amazon-scraper.ts
  - packages/agents/src/seo-files.ts
  - packages/agents/src/index-now.ts
  - packages/agents/src/agent-prompts.ts
  - packages/agents/types/index.d.ts
  - apps/generator/src/pages/[legal].astro
key_decisions:
  - D129–D134 (M009 decisions register)
  - types/index.d.ts postbuild copy: durable against tsup clean
  - (supabase as any) cast for 3 new tables until migrations applied + types regenerated
slices_completed: [S01, S02, S03, S04, S05, S06, S07]
completed_at: 2026-03-16T00:00:00Z
---

# M009: UX Polish + Capabilities Upgrade

**All 7 slices delivered. M009 complete.**

## What Was Built

M009 addressed 15 improvement areas across UX fixes, new capabilities, and infrastructure.

**S01 — UX Fixes + Dashboard:** Generate Site button now shows a spinner on click with live job polling. Preview toolbar slash bug fixed. Chat assistant messages render markdown. `claude_api_key` and `amazon_affiliate_tag` removed from Settings. Dashboard expanded with P&L widget, top 5 sites by pageviews, failed jobs table, and open alerts KPI with link.

**S02 — AI SEO Generation + Prompt Editor:** New `/api/sites/[id]/generate-seo-text` SSE route using `ClaudeSDKClient`. "Generate with AI" buttons in CategoryForm (streams into SEO text textarea) and ProductForm (preview-only description). `agent_prompts` DB table + Settings editor for 3 agent system prompts (ContentGenerator, NicheResearcher, Monster Chat).

**S03 — Global Chat Sidebar:** `ChatSidebar` + `DashboardShell` client shell replaces the server layout.tsx. "Ask Monster" toggle button in NavSidebar footer. Sidebar open/closed state in localStorage. Current page context derived from `usePathname()` and prepended to first message. `/templates` nav item added.

**S04 — Amazon Product Scraper:** `AmazonScraper` class in packages/agents (cheerio + 11 rotating UAs, ported from PHP tsa-monster). Replaces DataForSEO for product search. DFS ASIN lookup unchanged. `types/index.d.ts` postbuild copy pattern established to survive tsup clean.

**S05 — SEO Files + IndexNow:** `writeSeoFiles()` writes sitemap.xml, robots.txt, llm.txt, buildermonster.txt to dist/ post-build. IndexNow GET ping after deploy (non-fatal). Both wired into GenerateSiteJob and runDeployPhase.

**S06 — Legal Page Templates:** `legal_templates` + `legal_template_assignments` DB tables. `/templates` CRUD admin UI. Site edit page gets a Legal Template Assignment section (4 selects). `legalTemplates` injected into site.json by GenerateSiteJob. Astro `[legal].astro` reads assigned templates with fallback to hardcoded defaults.

**S07 — Integration + Polish:** All builds verified clean. 0 astro check errors.

## Pending (Human UAT required)

- Apply 3 DB migrations to remote Supabase
- Regenerate Supabase types after migrations
- Test Generate Site spinner + job polling in browser
- Test Amazon scraper real results from amazon.es
- Verify SEO files in dist/ after generation
- Test legal template assignment + generation
