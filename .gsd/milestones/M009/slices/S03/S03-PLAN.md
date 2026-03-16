# S03: Global Chat Sidebar

**Goal:** Make Monster Chat accessible as a collapsible right-side panel from every dashboard page, with the current page context sent to the assistant with every message.
**Demo:** User is on /sites, clicks the chat toggle button in the nav, the chat panel slides in from the right; they ask "what's wrong with my sites?" and the assistant's system context includes "User is currently on the Sites page"; they hide the sidebar by clicking the toggle again; the /monster page still works for full conversation history.

## Must-Haves

- A "Chat" toggle button appears in the NavSidebar footer area
- Clicking it opens/closes a right-side panel without changing the URL or navigating away
- Panel open/closed state persists in localStorage (key: `chat-sidebar-open`)
- The chat panel renders a simplified ChatWindow (no conversation list) with the same SSE streaming as /monster
- The current page context (route label e.g. "Sites", "Dashboard", "Analytics") is prepended to the first message of each conversation in the sidebar
- The panel does not break the main content scroll or layout — `<main>` still scrolls independently
- /monster page is unchanged

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: yes (layout feel, sidebar open/close)

## Verification

- `pnpm --filter @monster/admin build` exits 0
- `pm2 reload monster-admin` succeeds, HTTP 200
- Dashboard layout renders without error in browser
- NavSidebar has the toggle button (static code inspection)

## Tasks

- [x] **T01: ChatSidebar component + layout wiring** `est:1.5h`
  - Why: The sidebar needs a client-side toggle, localStorage persistence, and a chat panel; the layout needs to accommodate a third column
  - Files: `apps/admin/src/components/chat-sidebar.tsx` (new), `apps/admin/src/components/nav-sidebar.tsx`, `apps/admin/src/app/(dashboard)/layout.tsx`
  - Do:
    (1) Create `apps/admin/src/components/chat-sidebar.tsx` as a `'use client'` component. It:
      - Reads/writes `localStorage.getItem('chat-sidebar-open')` for persistence
      - Renders a panel fixed to the right of the main content (not a full-screen overlay — integrated into the flex layout)
      - Includes a simplified chat interface: message list + input textarea + send button
      - Reuses the same SSE fetch pattern from ChatWindow (copy the core logic — don't import ChatWindow which has dependencies on conversation history state)
      - Sends `pageContext` as a prefix on the first message of a new conversation: `[Context: ${pageContext}]\n\n${userMessage}` — invisible to the user but included in the API call
      - Accepts `pageContext: string` prop
    (2) Update `layout.tsx`: Convert to a client-aware layout. Since layout.tsx is a server component, introduce a `DashboardShell` client component (`apps/admin/src/components/dashboard-shell.tsx`) that:
      - Uses `usePathname()` to derive `pageContext` label from the current path
      - Manages `sidebarOpen` state with localStorage
      - Renders: `<NavSidebar onChatToggle={...} chatOpen={sidebarOpen} />` + `<main>` + `<ChatSidebar open={sidebarOpen} pageContext={...} />`
      - Layout: `<div className="flex h-screen bg-background">` containing nav + main + conditional sidebar panel
    (3) Update `NavSidebar` to accept `onChatToggle: () => void` and `chatOpen: boolean` props and render a toggle button in the footer. The toggle button uses the MessageSquare icon (or a sparkle icon) and shows an active state when `chatOpen`.
    (4) `layout.tsx` becomes: `import { DashboardShell } from '@/components/dashboard-shell'; return <DashboardShell>{children}</DashboardShell>;`
  - Verify: `pnpm --filter @monster/admin build` exits 0; layout.tsx imports DashboardShell; ChatSidebar file exists with usePathname wiring
  - Done when: Build passes; toggle button present in NavSidebar; ChatSidebar renders when open

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/layout.tsx`
- `apps/admin/src/components/dashboard-shell.tsx` (new)
- `apps/admin/src/components/chat-sidebar.tsx` (new)
- `apps/admin/src/components/nav-sidebar.tsx`
