"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  MessageSquare,
  FlaskConical,
  BarChart2,
  DollarSign,
  Bell,
  Settings,
  Server,
  Zap,
  FileText,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/research", label: "Research Lab", icon: FlaskConical },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/finances", label: "Finances", icon: DollarSign },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/monster", label: "Monster Chat", icon: MessageSquare },
  { href: "/infra", label: "Infrastructure", icon: Server },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface NavSidebarProps {
  chatOpen?: boolean;
  onChatToggle?: () => void;
}

export function NavSidebar({ chatOpen = false, onChatToggle }: NavSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] shrink-0 flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-tight text-foreground leading-tight">
              BuilderMonster
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-sidebar-foreground hover:bg-white/5 hover:text-foreground",
              ].join(" ")}
            >
              <Icon
                className={[
                  "h-4 w-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
                strokeWidth={isActive ? 2 : 1.75}
              />
              {label}
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      {/* Chat toggle button */}
      {onChatToggle && (
        <div className="px-3 py-3 border-t border-sidebar-border shrink-0">
          <button
            onClick={onChatToggle}
            className={[
              "flex items-center gap-3 w-full rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150",
              chatOpen
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground hover:bg-white/5 hover:text-foreground",
            ].join(" ")}
            aria-label={chatOpen ? "Close Monster Chat sidebar" : "Open Monster Chat sidebar"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={chatOpen ? 2 : 1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={[
                "h-4 w-4 shrink-0",
                chatOpen ? "text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            <span>Ask Monster</span>
            {chatOpen && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        </div>
      )}
    </aside>
  );
}
