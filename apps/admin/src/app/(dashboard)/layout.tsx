import { NavSidebar } from '@/components/nav-sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <NavSidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
