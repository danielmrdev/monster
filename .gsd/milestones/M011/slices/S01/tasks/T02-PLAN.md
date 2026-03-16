# T02: Implement HetznerClient

## Why

`HetznerClient` is the foundation layer for `ProvisioningService` (T03) — without it, server creation and datacenter/server-type lookups are impossible. It also provides the live API integration test that proves the auth pattern and network connectivity to Hetzner Cloud. Must be fully typechecked and independently usable before T03 begins.

## Description

Create `packages/deployment/src/hetzner.ts` implementing `HetznerClient` — a raw-fetch HTTP client for the Hetzner Cloud REST API. Follows the `SpaceshipClient` pattern in `packages/domains/src/spaceship.ts`: reads the `hetzner_api_token` from the Supabase `settings` table at call time (D028 pattern via `createServiceClient()`), applies `Authorization: Bearer <token>`, and provides structured error handling via a custom `HetznerApiError` class.

All 7 required methods must be implemented. The `registerSshKey` method must handle 409 Conflict idempotently (Hetzner returns 409 if a key with the same name already exists — list all keys and return the matching one's ID).

## Steps

1. **Create `packages/deployment/src/hetzner.ts`** with this structure:

```typescript
import { createServiceClient } from '@monster/db';

const HETZNER_BASE = 'https://api.hetzner.cloud/v1';

// Custom error class for Hetzner API errors
export class HetznerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'HetznerApiError';
  }
}

// ─── Response shape types (only fields we use) ───────────────────────────────

export interface HetznerServer {
  id: number;
  name: string;
  status: string; // 'initializing' | 'starting' | 'running' | 'off' | 'deleting' | ...
  public_net: {
    ipv4: { ip: string } | null;
  };
  server_type: { name: string };
  datacenter: { name: string };
  created: string;
}

export interface HetznerDatacenter {
  id: number;
  name: string;
  description: string;
  location: { name: string; city: string; country: string };
}

export interface HetznerServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  prices: Array<{ location: string; price_monthly: { gross: string } }>;
}

export interface HetznerSshKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

export interface CreateServerOpts {
  name: string;
  server_type: string;  // e.g. 'cx22'
  image: string;        // e.g. 'ubuntu-24.04'
  datacenter: string;   // e.g. 'nbg1-dc3'
  ssh_keys: number[];   // SSH key IDs registered with Hetzner
}

export class HetznerClient {
  private async getToken(): Promise<string> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'hetzner_api_token')
      .single();

    if (error || !data) {
      throw new Error('[HetznerClient] hetzner_api_token not found in settings');
    }

    const token = (data.value as { value?: string })?.value;
    if (!token) {
      throw new Error('[HetznerClient] hetzner_api_token is empty');
    }
    return token;
  }

  private async fetch<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getToken();
    const url = `${HETZNER_BASE}${path}`;

    console.log(`[HetznerClient] ${method} ${path}`);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Allow callers to handle specific status codes
    const responseBody = res.status !== 204 ? await res.json() : null;

    if (!res.ok) {
      const message = `[HetznerClient] ${method} ${path} → ${res.status}`;
      console.error(message);
      throw new HetznerApiError(res.status, responseBody, message);
    }

    return responseBody as T;
  }

  async createServer(opts: CreateServerOpts): Promise<{ server: HetznerServer }> {
    return this.fetch<{ server: HetznerServer }>('POST', '/servers', opts);
  }

  async getServer(id: number): Promise<{ server: HetznerServer }> {
    return this.fetch<{ server: HetznerServer }>('GET', `/servers/${id}`);
  }

  async listServers(): Promise<{ servers: HetznerServer[] }> {
    return this.fetch<{ servers: HetznerServer[] }>('GET', '/servers');
  }

  async deleteServer(id: number): Promise<void> {
    await this.fetch<null>('DELETE', `/servers/${id}`);
  }

  async listDatacenters(): Promise<HetznerDatacenter[]> {
    const res = await this.fetch<{ datacenters: HetznerDatacenter[] }>('GET', '/datacenters');
    return res.datacenters;
  }

  async listServerTypes(): Promise<HetznerServerType[]> {
    const res = await this.fetch<{ server_types: HetznerServerType[] }>('GET', '/server_types');
    return res.server_types;
  }

  async listSshKeys(): Promise<HetznerSshKey[]> {
    const res = await this.fetch<{ ssh_keys: HetznerSshKey[] }>('GET', '/ssh_keys');
    return res.ssh_keys;
  }

  /**
   * Register an SSH public key with Hetzner.
   * Idempotent: if a key with the same name already exists (409), returns its ID.
   */
  async registerSshKey(name: string, publicKey: string): Promise<number> {
    try {
      const res = await this.fetch<{ ssh_key: HetznerSshKey }>('POST', '/ssh_keys', {
        name,
        public_key: publicKey,
      });
      console.log(`[HetznerClient] registered SSH key "${name}" id=${res.ssh_key.id}`);
      return res.ssh_key.id;
    } catch (err) {
      if (err instanceof HetznerApiError && err.status === 409) {
        // Key already exists — find it by name
        console.log(`[HetznerClient] SSH key "${name}" already exists, looking up ID`);
        const existing = await this.listSshKeys();
        const found = existing.find((k) => k.name === name);
        if (!found) {
          throw new Error(`[HetznerClient] SSH key "${name}" conflict but not found in list`);
        }
        console.log(`[HetznerClient] found existing SSH key "${name}" id=${found.id}`);
        return found.id;
      }
      throw err;
    }
  }
}
```

2. **Verify typecheck** for the new file: `pnpm --filter @monster/deployment typecheck`

3. **Build the package**: `pnpm --filter @monster/deployment build`

4. **Run the live integration test** — this requires `hetzner_api_token` to be configured in Settings. Run from the worktree root:

```bash
node --input-type=module <<'EOF'
import { HetznerClient } from './packages/deployment/dist/index.js';
const c = new HetznerClient();
const dcs = await c.listDatacenters();
console.log('datacenters:', dcs.map(x => x.name));
if (!dcs.length) { console.error('FAIL: empty datacenter list'); process.exit(1); }
console.log('OK');
EOF
```

**Note:** If `hetzner_api_token` is not yet in Supabase settings, the typecheck/build verification is sufficient for this task. The live API call is part of T04's final verification gate. Document the token requirement clearly in a `// NOTE:` comment inside `getToken()`.

## Must-Haves

- `packages/deployment/src/hetzner.ts` exists with all 7 methods + `registerSshKey` idempotency
- `HetznerApiError` class exported from the file
- `createServer`, `getServer`, `listServers`, `deleteServer`, `listDatacenters`, `listServerTypes`, `registerSshKey` all implemented
- `hetzner_api_token` read from Supabase settings at call time (never hardcoded, never read from env)
- `pnpm --filter @monster/deployment typecheck` exits 0

## Inputs

- `packages/deployment/src/infra.ts` — reference for D028 settings read pattern (`createServiceClient()` + `.from('settings').select('value').eq('key', ...)`)
- `packages/domains/src/spaceship.ts` — reference for raw-fetch client pattern (if accessible)
- Hetzner Cloud API base URL: `https://api.hetzner.cloud/v1`
- Auth header: `Authorization: Bearer <token>`

## Expected Output

- `packages/deployment/src/hetzner.ts` — complete `HetznerClient` class
- `packages/deployment/dist/` updated after build (T03 will import from here)

## Verification

```bash
pnpm --filter @monster/deployment typecheck
pnpm --filter @monster/deployment build
# Check exports appear in dist
grep -l "HetznerClient" packages/deployment/dist/index.d.ts 2>/dev/null || echo "WARN: not yet exported (T03 wires exports)"
```

## Done When

- `pnpm --filter @monster/deployment typecheck` exits 0 with `hetzner.ts` included
- All 7 methods + `HetznerApiError` are defined with correct TypeScript signatures
- No lint/type errors in the new file
