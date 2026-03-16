# T01: Implement `POST /api/infra/provision` SSE route + add `onProgress` to `ProvisioningService`

## Description

Replace the `POST /api/infra/provision` 501 stub with a real SSE streaming handler. Add an optional `onProgress` callback to `ProvisioningService.provision()` so the route can forward phase events to the browser as they happen.

The SSE pattern follows `apps/admin/src/app/api/monster/chat/route.ts` exactly (D108): a `ReadableStream` with a `closed` boolean guard + try/catch in the `send()` helper. The service pattern adds `onProgress?: (step: string, message: string) => void` as an optional second param to `provision()` — existing callers pass no callback and are unaffected.

## Steps

### 1. Add `onProgress` callback to `ProvisioningService.provision()`

File: `packages/deployment/src/provisioning.ts`

Add `onProgress?: (step: string, message: string) => void` as the second parameter of `provision()`:

```ts
async provision(opts: ProvisionOpts, onProgress?: (step: string, message: string) => void): Promise<Server>
```

Add a helper at the start of the method:

```ts
const emit = (step: string, message: string) => {
  if (onProgress) onProgress(step, message)
}
```

Call `emit()` at each of the 5 phases. Messages must NEVER include `opts.tailscaleKey` (D147). Use these exact calls:

```ts
// Before step 1 (register SSH key)
emit('ssh_key', 'Registering SSH key with Hetzner…')

// Before step 2 (create server)
emit('create_server', `Creating ${opts.serverType} server in ${opts.datacenter}…`)

// Before step 3 (wait for boot) — and optionally per-poll
emit('wait_boot', 'Waiting for server to boot…')

// Before step 4 (bootstrap)
emit('bootstrap', 'SSH bootstrap starting (setup-vps2.sh)…')

// Before step 5 (DB insert)
emit('register', 'Registering server in database…')
```

The `emit()` calls go immediately before the existing `console.log(…)` for each phase — not replacing them. Existing observability logs stay intact.

### 2. Rebuild `@monster/deployment`

```bash
cd /home/daniel/monster/.gsd/worktrees/M011
pnpm --filter @monster/deployment typecheck
pnpm --filter @monster/deployment build
```

Both must exit 0 before proceeding.

### 3. Replace the 501 stub with a real SSE handler

File: `apps/admin/src/app/api/infra/provision/route.ts`

Replace the entire file content with the SSE handler below. Key constraints:
- Parse + validate `{ name, datacenter, serverType, tailscaleKey, sshPublicKey }` — return `400` JSON if any required field is missing or empty string.
- Open `ReadableStream` immediately (before calling `provision()`).
- Use the D108 pattern: `closed` boolean + `send()` helper with try/catch.
- SSE event format: `data: ${JSON.stringify(event)}\n\n` (double newline — mandatory).
- Event shapes:
  - Progress: `{ type: 'progress', step: string, message: string }`
  - Done: `{ type: 'done', ok: true, serverId: string }`
  - Error: `{ type: 'error', error: string }`
- Call `ProvisioningService.provision(opts, onProgress)` inside the stream `start()` function.
- `tailscaleKey` must NOT appear in any event message.
- Log prefix: `[infra/provision]` for route-level logs.

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { ProvisioningService } from '@monster/deployment';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const datacenter = typeof body.datacenter === 'string' ? body.datacenter.trim() : '';
  const serverType = typeof body.serverType === 'string' ? body.serverType.trim() : '';
  const tailscaleKey = typeof body.tailscaleKey === 'string' ? body.tailscaleKey.trim() : '';
  const sshPublicKey = typeof body.sshPublicKey === 'string' ? body.sshPublicKey.trim() : '';

  if (!name || !datacenter || !serverType || !tailscaleKey || !sshPublicKey) {
    return NextResponse.json(
      { ok: false, error: 'name, datacenter, serverType, tailscaleKey, and sshPublicKey are required' },
      { status: 400 },
    );
  }

  console.log(`[infra/provision] starting provision for "${name}" (${serverType} in ${datacenter})`);

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const service = new ProvisioningService();
        const server = await service.provision(
          { name, datacenter, serverType, tailscaleKey, sshPublicKey },
          (step, message) => {
            send({ type: 'progress', step, message });
          },
        );
        send({ type: 'done', ok: true, serverId: server.id });
        console.log(`[infra/provision] completed — server id=${server.id}`);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[infra/provision] failed:`, error);
        send({ type: 'error', error });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

## Must-Haves

- `onProgress` is optional — existing callers pass only `opts` and continue to work.
- `emit()` is called exactly once per phase (5 total calls minimum across all phases).
- `tailscaleKey` appears only in the command string interpolation inside `bootstrapVps()`. It must NOT appear in any `emit()` message string, any `send()` payload, or any `console.log()`.
- The D108 `closed` boolean guard is present in the route's `ReadableStream`.
- HTTP 400 is returned (non-streaming JSON) when any required field is missing — before the stream opens.
- SSE events use `data: ${JSON.stringify(event)}\n\n` with double newline.
- Route logs use `[infra/provision]` prefix.

## Verification

```bash
cd /home/daniel/monster/.gsd/worktrees/M011

# 1. Deployment package typechecks clean
pnpm --filter @monster/deployment typecheck
# expect: exit 0

# 2. Deployment package builds clean
pnpm --filter @monster/deployment build
# expect: exit 0

# 3. Stub is gone
grep -c "not implemented" apps/admin/src/app/api/infra/provision/route.ts
# expect: 0

# 4. ProvisioningService imported in route
grep "ProvisioningService" apps/admin/src/app/api/infra/provision/route.ts
# expect: shows import line

# 5. onProgress wired at ≥ 5 places
grep -c "emit(" packages/deployment/src/provisioning.ts
# expect: >= 5

# 6. tailscaleKey not in any progress message
grep "emit(" packages/deployment/src/provisioning.ts
# expect: no line contains "tailscaleKey"

# 7. D108 closed guard in route
grep -c "closed" apps/admin/src/app/api/infra/provision/route.ts
# expect: >= 2 (the boolean declaration and the check)
```

## Inputs

- `packages/deployment/src/provisioning.ts` (current state: 5-phase provision, no onProgress)
- `apps/admin/src/app/api/infra/provision/route.ts` (current state: 501 stub)
- `apps/admin/src/app/api/monster/chat/route.ts` (reference: SSE pattern to match — D108)

## Expected Output

- `packages/deployment/src/provisioning.ts` — `provision(opts, onProgress?)` with `emit()` called at all 5 phases; `tailscaleKey` remains only in command string.
- `packages/deployment/dist/` — rebuilt clean (no new type errors).
- `apps/admin/src/app/api/infra/provision/route.ts` — full SSE handler; 501 stub replaced; `[infra/provision]` logs; D108 closed guard.

## Observability Impact

- `[infra/provision] starting provision for "<name>" (<type> in <dc>)` — route entry log; confirms body was parsed
- `[infra/provision] completed — server id=<uuid>` — success terminal state
- `[infra/provision] failed: <message>` — error terminal state
- SSE `{ type: 'progress', step, message }` events relay `[ProvisioningService]` phase names to the browser without re-logging the key
