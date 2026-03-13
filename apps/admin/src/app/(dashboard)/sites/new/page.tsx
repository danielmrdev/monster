import Link from 'next/link'
import { SiteForm } from './site-form'

export default function NewSitePage() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/sites"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Sites
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold tracking-tight">New Site</h1>
      </div>
      <SiteForm />
    </div>
  )
}
