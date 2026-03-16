# T02: Build `ProvisionModal` + GET helper routes + wire into `/infra`

## Description

Build the operator-facing provision UI: a `ProvisionModal` client component with a 5-field form, SSE progress log, and `router.refresh()` on done. Add two GET helper routes (`/api/infra/datacenters` and `/api/infra/server-types`) that call `HetznerClient` with hardcoded fallbacks when the token is absent. Wire everything into the existing `/infra` page.

This task assumes T01 is complete — `POST /api/infra/provision` is a working SSE endpoint and `ProvisioningService.provision()` has the `onProgress` callback.

## Steps

### 1. Create `GET /api/infra/datacenters` route

File: `apps/admin/src/app/api/infra/datacenters/route.ts`

```ts
import { NextResponse } from 'next/server'
import { HetznerClient } from '@monster/deployment'

// Hardcoded fallback when hetzner_api_token is not configured (KN005)
const FALLBACK_DATACENTERS = ['nbg1-dc3', 'fsn1-dc14', 'hel1-dc2']

export async function GET() {
  try {
    const client = new HetznerClient()
    const datacenters = await client.listDatacenters()
    return NextResponse.json({ datacenters: datacenters.map((d) => d.name) })
  } catch {
    // Token absent or API unreachable — return fallback list
    return NextResponse.json({ datacenters: FALLBACK_DATACENTERS })
  }
}
```

### 2. Create `GET /api/infra/server-types` route

File: `apps/admin/src/app/api/infra/server-types/route.ts`

```ts
import { NextResponse } from 'next/server'
import { HetznerClient } from '@monster/deployment'

const ALLOWED_TYPES = ['cx22', 'cx32']
const FALLBACK_SERVER_TYPES = ['cx22', 'cx32']

export async function GET() {
  try {
    const client = new HetznerClient()
    const all = await client.listServerTypes()
    const filtered = all
      .map((t) => t.name)
      .filter((name) => ALLOWED_TYPES.includes(name))
    return NextResponse.json({ serverTypes: filtered.length > 0 ? filtered : FALLBACK_SERVER_TYPES })
  } catch {
    return NextResponse.json({ serverTypes: FALLBACK_SERVER_TYPES })
  }
}
```

### 3. Create `ProvisionModal` client component

File: `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx`

This is a `'use client'` component. It renders as an inline expansion (a card) rather than a fixed-position overlay to avoid z-index issues.

Key behaviour:
- When `open === false`, renders a "Provision New Server" button only.
- When `open === true`, renders the form card + optionally the progress log.
- On mount (when `open` becomes true), fetches `/api/infra/datacenters` and `/api/infra/server-types` to populate the selects.
- On submit, calls `fetch('POST /api/infra/provision')` with `{ name, datacenter, serverType, tailscaleKey, sshPublicKey }` and consumes the SSE body via `ReadableTextStream` / `TextDecoderStream`.
- Each `data: {...}\n\n` line is parsed and appended to a `progressLog` string array.
- On `{ type: 'done' }`: set success state, call `router.refresh()`, auto-close the modal after 1.5s.
- On `{ type: 'error' }`: set error state, remain open.
- During provision: disable the submit button, show a "Provisioning…" state.

Import available shadcn components:
- `Button` from `@/components/ui/button`
- `Input` from `@/components/ui/input`
- `Label` from `@/components/ui/label`
- `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`

Use `useRouter` from `next/navigation` for `router.refresh()`.

Full component implementation:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Server, X } from 'lucide-react'

interface ProvisionModalProps {
  open: boolean
  onClose: () => void
}

export default function ProvisionModal({ open, onClose }: ProvisionModalProps) {
  const router = useRouter()
  const [datacenters, setDatacenters] = useState<string[]>(['nbg1-dc3', 'fsn1-dc14', 'hel1-dc2'])
  const [serverTypes, setServerTypes] = useState<string[]>(['cx22', 'cx32'])
  const [provisioning, setProvisioning] = useState(false)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Load options when modal opens
  useEffect(() => {
    if (!open) return
    fetch('/api/infra/datacenters')
      .then((r) => r.json())
      .then((j: { datacenters?: string[] }) => {
        if (j.datacenters?.length) setDatacenters(j.datacenters)
      })
      .catch(() => {/* fallback values already set */})

    fetch('/api/infra/server-types')
      .then((r) => r.json())
      .then((j: { serverTypes?: string[] }) => {
        if (j.serverTypes?.length) setServerTypes(j.serverTypes)
      })
      .catch(() => {/* fallback values already set */})
  }, [open])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body = {
      name: (fd.get('name') as string).trim(),
      datacenter: fd.get('datacenter') as string,
      serverType: fd.get('serverType') as string,
      tailscaleKey: (fd.get('tailscaleKey') as string).trim(),
      sshPublicKey: (fd.get('sshPublicKey') as string).trim(),
    }

    setProvisioning(true)
    setProgressLog([])
    setDone(false)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/infra/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setErrorMsg((json as { error?: string }).error ?? `HTTP ${res.status}`)
        setProvisioning(false)
        return
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string
              step?: string
              message?: string
              ok?: boolean
              serverId?: string
              error?: string
            }
            if (event.type === 'progress') {
              setProgressLog((prev) => [...prev, `[${event.step}] ${event.message}`])
            } else if (event.type === 'done') {
              setProgressLog((prev) => [...prev, `✓ Server provisioned (id: ${event.serverId})`])
              setDone(true)
              setTimeout(() => {
                router.refresh()
                onClose()
              }, 1500)
            } else if (event.type === 'error') {
              setErrorMsg(event.error ?? 'Unknown error')
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error')
    } finally {
      setProvisioning(false)
    }
  }

  if (!open) return null

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="size-4" />
          Provision New Server
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={provisioning}>
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Name */}
            <div className="space-y-1">
              <Label htmlFor="prov-name">Server name</Label>
              <Input id="prov-name" name="name" placeholder="vps2" required disabled={provisioning} />
            </div>

            {/* Datacenter */}
            <div className="space-y-1">
              <Label htmlFor="prov-dc">Datacenter</Label>
              <select
                id="prov-dc"
                name="datacenter"
                required
                disabled={provisioning}
                defaultValue="nbg1-dc3"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                {datacenters.map((dc) => (
                  <option key={dc} value={dc}>{dc}</option>
                ))}
              </select>
            </div>

            {/* Server type */}
            <div className="space-y-1">
              <Label htmlFor="prov-type">Server type</Label>
              <select
                id="prov-type"
                name="serverType"
                required
                disabled={provisioning}
                defaultValue="cx22"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                {serverTypes.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tailscale key */}
          <div className="space-y-1">
            <Label htmlFor="prov-ts">Tailscale auth key</Label>
            <Input
              id="prov-ts"
              name="tailscaleKey"
              type="password"
              placeholder="tskey-auth-…"
              required
              disabled={provisioning}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">One-time use key — not stored anywhere.</p>
          </div>

          {/* SSH public key */}
          <div className="space-y-1">
            <Label htmlFor="prov-ssh">SSH public key</Label>
            <textarea
              id="prov-ssh"
              name="sshPublicKey"
              rows={3}
              required
              disabled={provisioning}
              placeholder="ssh-ed25519 AAAA… or ssh-rsa AAAA…"
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 font-mono"
            />
          </div>

          <Button type="submit" disabled={provisioning}>
            {provisioning ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <Server className="size-4" data-icon="inline-start" />
            )}
            {provisioning ? 'Provisioning…' : 'Provision Server'}
          </Button>
        </form>

        {/* Progress log */}
        {progressLog.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Progress</p>
            <div className="rounded-md bg-muted p-3 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
              {progressLog.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith('✓')
                      ? 'text-green-600'
                      : 'text-muted-foreground'
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {errorMsg && (
          <p className="text-sm text-destructive font-mono">{errorMsg}</p>
        )}

        {/* Done state */}
        {done && (
          <p className="text-sm text-green-600">
            ✓ Server provisioned — refreshing fleet table…
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

### 4. Update `infra/page.tsx` to import and render `ProvisionModal`

File: `apps/admin/src/app/(dashboard)/infra/page.tsx`

This is a server component — `ProvisionModal` is a client component leaf. The toggle state (`modalOpen`) lives in a thin `'use client'` wrapper for the "Provision New Server" button. The cleanest approach: extract the header button area into a small `InfraHeader` client component that owns `modalOpen` state and renders both the button and the modal inline.

Alternatively (simpler): add a `ProvisionSection` client component that renders the button + modal inline. The server component just places `<ProvisionSection />` after the page heading.

**Go with this simpler approach:** create `ProvisionSection` inside `page.tsx` as a separate export at the bottom of the file (or a small dedicated file). Since mixing `'use client'` exports in a server component file is not allowed (D034 extended — file-level directive), create it as a separate file `ProvisionSection.tsx` with `'use client'`.

**Concrete steps:**

Create `apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import ProvisionModal from './ProvisionModal'

export default function ProvisionSection() {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-4">
      {!open && (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" data-icon="inline-start" />
          Provision New Server
        </Button>
      )}
      <ProvisionModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
```

Then update `page.tsx` to import and render `<ProvisionSection />` after the page heading and before the fleet table:

```tsx
// Add import at top:
import ProvisionSection from './ProvisionSection'

// In the return JSX, after the heading div and before the fleet health table:
<ProvisionSection />
```

## Must-Haves

- Both GET routes catch all errors and return hardcoded fallbacks — never throw to the client (KN005: token absent is expected before settings are configured).
- `ProvisionModal` uses a `password` input for `tailscaleKey` so the browser does not display or autocomplete it.
- `ProvisionModal` calls `router.refresh()` inside a `setTimeout(…, 1500)` after `{ type: 'done' }` to give the user a moment to see the success message before the modal closes.
- `ProvisionSection.tsx` has `'use client'` directive at the top — it owns the `open` state; `ProvisionModal` receives `open` as a prop.
- `ProvisionModal.tsx` has `'use client'` directive at the top.
- The server component `page.tsx` imports `ProvisionSection` (not `ProvisionModal` directly) to keep RSC/client boundaries clean.
- Native `<select>` elements used for datacenter and server type (not shadcn Select) — consistent with D086 and the fact that form submission reads from native form elements.
- `pnpm --filter @monster/admin build` exits 0 with all 4 new/updated routes in the build output.

## Verification

```bash
cd /home/daniel/monster/.gsd/worktrees/M011

# Build all deps first if needed (KN004)
pnpm --filter @monster/shared build
pnpm --filter @monster/domains build
pnpm --filter @monster/seo-scorer build
pnpm --filter @monster/agents build
pnpm --filter @monster/deployment build
pnpm --filter @monster/admin build
# expect: exit 0

# All routes in build output
# Look for:
#   ƒ /api/infra/datacenters
#   ƒ /api/infra/server-types
#   ƒ /api/infra/provision
#   ƒ /infra

# ProvisionModal imported in page.tsx (via ProvisionSection)
grep "ProvisionSection" apps/admin/src/app/(dashboard)/infra/page.tsx
# expect: shows import + JSX usage

# "Provision New Server" button text in ProvisionSection
grep -c "Provision New Server" apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx
# expect: >= 1

# Fallback in datacenters route
grep "FALLBACK_DATACENTERS" apps/admin/src/app/api/infra/datacenters/route.ts
# expect: defined and used

# Fallback in server-types route
grep "FALLBACK_SERVER_TYPES" apps/admin/src/app/api/infra/server-types/route.ts
# expect: defined and used

# tailscaleKey uses password input type
grep 'type="password"' apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx
# expect: >= 1 (for the tailscaleKey field)

# router.refresh() called in ProvisionModal
grep "router.refresh" apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx
# expect: >= 1
```

## Inputs

- `apps/admin/src/app/(dashboard)/infra/page.tsx` (from S02 — fleet table, empty-state, TestConnectionButton)
- `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx` (reference for client component pattern)
- `packages/deployment/src/index.ts` — exports `HetznerClient`, `ProvisioningService`, `Server`
- `apps/admin/next.config.ts` — `@monster/deployment` in `serverExternalPackages` (no changes needed)

## Expected Output

- `apps/admin/src/app/api/infra/datacenters/route.ts` — new GET route; hardcoded fallback when token absent
- `apps/admin/src/app/api/infra/server-types/route.ts` — new GET route; cx22/cx32 filtered; fallback
- `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx` — client component; SSE streaming form; progress log; router.refresh on done
- `apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx` — client component; owns open state; renders button + ProvisionModal
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — imports `ProvisionSection`; renders it between heading and fleet table
- `pnpm --filter @monster/admin build` exits 0
