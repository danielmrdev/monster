import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SiteStatus } from '@monster/shared'

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status as SiteStatus) {
    case 'live':
      return 'default'
    case 'error':
      return 'destructive'
    case 'draft':
      return 'outline'
    default:
      return 'secondary'
  }
}

export default async function SitesPage() {
  const supabase = createServiceClient()
  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, name, domain, status, market, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch sites: ${error.message}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Sites</h1>
        <Link
          href="/sites/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          + New Site
        </Link>
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">No sites yet.</p>
            <Link
              href="/sites/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Create your first site
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/sites/${site.id}`}
                      className="text-primary hover:underline"
                    >
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.domain || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(site.status)}>
                      {site.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.market || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(site.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
