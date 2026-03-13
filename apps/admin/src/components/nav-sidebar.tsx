import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sites', label: 'Sites' },
  { href: '/monster', label: 'Monster Chat' },
  { href: '/research', label: 'Research Lab' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/finances', label: 'Finances' },
  { href: '/settings', label: 'Settings' },
]

export function NavSidebar() {
  return (
    <aside className="w-60 shrink-0 flex flex-col bg-gray-900 text-gray-100 h-full">
      {/* Logo / brand */}
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-lg font-bold tracking-tight text-white">BuilderMonster</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-700">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white text-left"
          >
            Log out
          </button>
        </form>
      </div>
    </aside>
  )
}
