"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { NavSidebar } from "@/components/nav-sidebar";
import { ChatSidebar } from "@/components/chat-sidebar";
import { AlertsBell } from "@/components/alerts-bell";
import { useJobNotifications } from "@/hooks/useJobNotifications";

const SIDEBAR_KEY = "chat-sidebar-open";

interface PageMeta {
  title: string;
  subtitle?: string;
}

/**
 * Path → { title, subtitle } for the header bar.
 * Order matters: most specific patterns first.
 */
function getPageMeta(pathname: string): PageMeta {
  // sites sub-routes
  if (pathname.match(/^\/sites\/[^/]+\/categories\/[^/]+\/edit/))
    return { title: "Edit Category", subtitle: "Sites" };
  if (pathname.match(/^\/sites\/[^/]+\/categories\/new/))
    return { title: "New Category", subtitle: "Sites" };
  if (pathname.match(/^\/sites\/[^/]+\/categories\/[^/]+/))
    return { title: "Category", subtitle: "Sites" };
  if (pathname.match(/^\/sites\/[^/]+\/products\/[^/]+\/edit/))
    return { title: "Edit Product", subtitle: "Sites" };
  if (pathname.match(/^\/sites\/[^/]+\/products\/new/))
    return { title: "Add Products", subtitle: "Sites" };
  if (pathname.match(/^\/sites\/[^/]+\/edit/)) return { title: "Edit Site", subtitle: "Sites" };
  if (pathname.match(/^\/sites\/[^/]+\/preview/)) return { title: "Preview", subtitle: "Sites" };
  if (pathname.match(/^\/sites\/[^/]+/)) return { title: "Site", subtitle: "Sites" };
  if (pathname === "/sites/new") return { title: "New Site", subtitle: "Sites" };
  if (pathname.startsWith("/sites")) return { title: "Sites", subtitle: "Portfolio" };
  // top-level
  if (pathname === "/dashboard" || pathname === "/")
    return { title: "Dashboard", subtitle: "Overview" };
  if (pathname.startsWith("/monster")) return { title: "Monster Chat", subtitle: "AI Assistant" };
  if (pathname.startsWith("/research"))
    return { title: "Research Lab", subtitle: "Niche Research" };
  if (pathname.startsWith("/analytics"))
    return { title: "Analytics", subtitle: "Traffic & Events" };
  if (pathname.startsWith("/finances")) return { title: "Finances", subtitle: "Revenue & Costs" };
  if (pathname.startsWith("/alerts")) return { title: "Alerts", subtitle: "Product Alerts" };
  if (pathname.startsWith("/jobs")) return { title: "Jobs", subtitle: "Background Jobs" };
  if (pathname.startsWith("/infra")) return { title: "Infrastructure", subtitle: "VPS Management" };
  if (pathname.match(/^\/templates\/[^/]+\/edit/))
    return { title: "Edit Template", subtitle: "Settings" };
  if (pathname === "/templates/new") return { title: "New Legal Template", subtitle: "Settings" };
  if (pathname.startsWith("/templates")) return { title: "Legal Templates", subtitle: "Settings" };
  if (pathname.startsWith("/settings")) return { title: "Settings", subtitle: "Configuration" };
  return { title: "BuilderMonster" };
}

/**
 * Path → human-readable page context label.
 * Used as context hint in the chat sidebar.
 */
function getPageContext(pathname: string): string {
  return getPageMeta(pathname).title;
}

interface DashboardShellProps {
  children: React.ReactNode;
}

/**
 * Client-side shell wrapping the dashboard layout.
 * Manages chat sidebar open/closed state (localStorage-persisted).
 * Passes pageContext from current pathname to the ChatSidebar.
 *
 * D131: localStorage key 'chat-sidebar-open' for persistence.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const { title, subtitle } = getPageMeta(pathname);
  const pageContext = getPageContext(pathname);
  const { activeCount, finishedJobs, clearFinishedJobs } = useJobNotifications();

  // Initialize from localStorage; default closed
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") setSidebarOpen(true);
    setMounted(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    localStorage.setItem(SIDEBAR_KEY, "false");
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <NavSidebar badges={{ jobs: activeCount }} />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <header className="flex h-[68px] shrink-0 items-center justify-between px-6 border-b border-sidebar-border bg-sidebar gap-4">
            {/* Page title */}
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-[17px] font-semibold tracking-tight text-foreground leading-tight truncate">
                {title}
              </span>
              {subtitle && (
                <span className="text-[12px] text-muted-foreground leading-tight truncate">
                  {subtitle}
                </span>
              )}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <AlertsBell finishedJobs={finishedJobs} onClearFinishedJobs={clearFinishedJobs} />
              <button
                onClick={toggleSidebar}
                className={[
                  "rounded-md p-2 transition-colors",
                  sidebarOpen
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")}
                aria-label={sidebarOpen ? "Close Monster Chat" : "Open Monster Chat"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={sidebarOpen ? 2 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-8">{children}</main>
        </div>
      </div>
      {mounted && sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={closeSidebar} aria-hidden="true" />
      )}
      {/* Sidebar only rendered client-side after mount to avoid localStorage SSR mismatch */}
      {mounted && (
        <ChatSidebar open={sidebarOpen} onClose={closeSidebar} pageContext={pageContext} />
      )}
    </div>
  );
}
