import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NavSidebar } from '@/components/nav-sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="flex h-screen bg-gray-50">
      <NavSidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
