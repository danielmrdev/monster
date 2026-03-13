import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@monster/db'

// Uses @supabase/ssr directly (not @monster/db's createBrowserClient) to avoid
// version skew — apps/admin has @supabase/ssr@^0.9 pinned as a direct dep.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
