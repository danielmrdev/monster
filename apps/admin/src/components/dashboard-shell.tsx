"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { NavSidebar } from "@/components/nav-sidebar";
import { ChatSidebar } from "@/components/chat-sidebar";

const SIDEBAR_KEY = "chat-sidebar-open";

/**
 * Path → human-readable page context label.
 * Used as context hint in the chat sidebar.
 */
function getPageContext(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/sites/") && pathname.includes("/categories")) return "Category Edit";
  if (pathname.startsWith("/sites/") && pathname.includes("/products")) return "Product Edit";
  if (pathname.startsWith("/sites/") && pathname.includes("/preview")) return "Site Preview";
  if (pathname.startsWith("/sites/") && pathname.includes("/edit")) return "Site Edit";
  if (pathname.startsWith("/sites/new")) return "New Site";
  if (pathname.startsWith("/sites")) return "Sites";
  if (pathname.startsWith("/monster")) return "Monster Chat";
  if (pathname.startsWith("/research")) return "Research Lab";
  if (pathname.startsWith("/analytics")) return "Analytics";
  if (pathname.startsWith("/finances")) return "Finances";
  if (pathname.startsWith("/alerts")) return "Alerts";
  if (pathname.startsWith("/jobs")) return "Jobs";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/templates")) return "Settings";
  return "Admin Panel";
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
  const pageContext = getPageContext(pathname);

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
      <header className="flex h-12 shrink-0 items-center justify-between px-4 border-b border-border bg-background">
        <div />
        <div className="flex items-center gap-2">
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
      <div className="flex flex-1 overflow-hidden">
        <NavSidebar />
        <main className="flex-1 overflow-auto p-8 min-w-0">{children}</main>
      </div>
      {mounted && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}
      {/* Sidebar only rendered client-side after mount to avoid localStorage SSR mismatch */}
      {mounted && (
        <ChatSidebar open={sidebarOpen} onClose={closeSidebar} pageContext={pageContext} />
      )}
    </div>
  );
}
