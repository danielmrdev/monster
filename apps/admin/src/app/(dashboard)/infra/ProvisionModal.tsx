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
