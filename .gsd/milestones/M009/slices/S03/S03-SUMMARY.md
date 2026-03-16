---
id: S03
milestone: M009
provides:
  - ChatSidebar client component (apps/admin/src/components/chat-sidebar.tsx) — standalone SSE chat with localStorage persistence
  - DashboardShell client component (apps/admin/src/components/dashboard-shell.tsx) — manages sidebar state + pageContext via usePathname
  - layout.tsx simplified to import DashboardShell
  - NavSidebar: chatOpen + onChatToggle props; "Ask Monster" toggle button in footer
  - /templates nav item added to NavSidebar (placeholder for S06)
  - pageContext derived from pathname; prepended to first message of each sidebar conversation
key_files:
  - apps/admin/src/components/chat-sidebar.tsx
  - apps/admin/src/components/dashboard-shell.tsx
  - apps/admin/src/components/nav-sidebar.tsx
  - apps/admin/src/app/(dashboard)/layout.tsx
key_decisions:
  - "DashboardShell pattern: server layout.tsx delegates to a client shell that wraps nav+main+sidebar — avoids making layout.tsx a client component directly"
  - "Sidebar starts closed on SSR (setMounted guard prevents localStorage SSR mismatch)"
  - "ChatSidebar resets conversation state when closed (clean slate each open)"
  - "pageContext injected into first message API call only — user sees their original message, context goes to the API as a prefix"
patterns_established:
  - "Server layout → DashboardShell client wrapper pattern for any layout needing client state"
drill_down_paths:
  - .gsd/milestones/M009/slices/S03/S03-PLAN.md
duration: 1h
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# S03: Global Chat Sidebar

**ChatSidebar renders as a collapsible 340px right panel from any dashboard page; toggle persists in localStorage; page context prepended to first message.**

## What Was Built

Single task covering all S03 must-haves:

**ChatSidebar** — standalone `'use client'` component with full SSE streaming (same pattern as ChatWindow), page context header, X close button, and compact markdown rendering. Conversation resets on close for a clean slate. Does not depend on ChatWindow — keeps the component isolated from the full-page chat state.

**DashboardShell** — client wrapper for the dashboard layout. Reads/writes `chat-sidebar-open` localStorage key. Derives `pageContext` label from `usePathname()` (Dashboard, Sites, Analytics, etc.). Passes `chatOpen`/`onChatToggle` to NavSidebar and `open`/`onClose`/`pageContext` to ChatSidebar. Mounted guard prevents SSR/localStorage mismatch.

**NavSidebar** — extended with `chatOpen`/`onChatToggle` optional props. New "Ask Monster" toggle button in footer with sparkle icon and active state indicator. Also added `/templates` nav item (needed for S06).

**layout.tsx** — reduced to a one-liner importing DashboardShell.

## Verification

- `pnpm --filter @monster/admin build` exits 0 ✓
- `pm2 reload monster-admin` + HTTP 200 on /dashboard ✓

## Deviations

None.
