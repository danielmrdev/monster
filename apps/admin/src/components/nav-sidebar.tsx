'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Globe,
  MessageSquare,
  FlaskConical,
  BarChart2,
  DollarSign,
  Bell,
  Settings,
  Zap,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/sites',      label: 'Sites',          icon: Globe },
  { href: '/monster',    label: 'Monster Chat',   icon: MessageSquare },
  { href: '/research',   label: 'Research Lab',   icon: FlaskConical },
  { href: '/analytics',  label: 'Analytics',      icon: BarChart2 },
  { href: '/finances',   label: 'Finances',       icon: DollarSign },
  { href: '/alerts',     label: 'Alerts',         icon: Bell },
  { href: '/settings',   label: 'Settings',       icon: Settings },
]

export function NavSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[220px] shrink-0 flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-2.5 border-b border-sidebar-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          BuilderMonster
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-white/5 hover:text-foreground',
              ].join(' ')}
            >
              <Icon
                className={[
                  'h-4 w-4 shrink-0',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}
                strokeWidth={isActive ? 2 : 1.75}
              />
              {label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
