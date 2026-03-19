import { createServiceClient } from "@monster/db";

const HETZNER_BASE = "https://api.hetzner.cloud/v1";

// ---------------------------------------------------------------------------
// HetznerClient
//
// Raw-fetch HTTP client for the Hetzner Cloud REST API.
// Follows the SpaceshipClient / InfraService D028 pattern: reads
// `hetzner_api_token` from the Supabase `settings` table at call time —
// never hardcoded, never read from env vars.
//
// Observability:
//   - [HetznerClient] prefixed log lines for every API call
//   - HetznerApiError exposes `status` + `body` for structured error handling
//   - 409 Conflict on registerSshKey is handled idempotently (returns existing ID)
//   - hetzner_api_token is NEVER logged
//
// NOTE: `hetzner_api_token` must exist in the Supabase `settings` table with
// the shape `{ "value": "<token>" }` before any method can succeed.
// Insert it via: INSERT INTO settings (key, value) VALUES ('hetzner_api_token', '{"value":"<your-token>"}')
// ---------------------------------------------------------------------------

// Custom error class for Hetzner API errors
export class HetznerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "HetznerApiError";
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
  server_type: string; // e.g. 'cx22'
  image: string; // e.g. 'ubuntu-24.04'
  datacenter: string; // e.g. 'nbg1-dc3'
  ssh_keys: number[]; // SSH key IDs registered with Hetzner
}

export class HetznerClient {
  private async getToken(): Promise<string> {
    // NOTE: `hetzner_api_token` must exist in the Supabase `settings` table
    // before any method can succeed. Without it, every API call will throw.
    // The token is NEVER logged — only a "[HetznerClient]" prefixed call path is logged.
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "hetzner_api_token")
      .single();

    if (error || !data) {
      throw new Error("[HetznerClient] hetzner_api_token not found in settings");
    }

    const token = (data.value as { value?: string })?.value;
    if (!token) {
      throw new Error("[HetznerClient] hetzner_api_token is empty");
    }
    return token;
  }

  private async fetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const url = `${HETZNER_BASE}${path}`;

    console.log(`[HetznerClient] ${method} ${path}`);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
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
    return this.fetch<{ server: HetznerServer }>("POST", "/servers", opts);
  }

  async getServer(id: number): Promise<{ server: HetznerServer }> {
    return this.fetch<{ server: HetznerServer }>("GET", `/servers/${id}`);
  }

  async listServers(): Promise<{ servers: HetznerServer[] }> {
    return this.fetch<{ servers: HetznerServer[] }>("GET", "/servers");
  }

  async deleteServer(id: number): Promise<void> {
    await this.fetch<null>("DELETE", `/servers/${id}`);
  }

  async listDatacenters(): Promise<HetznerDatacenter[]> {
    const res = await this.fetch<{ datacenters: HetznerDatacenter[] }>("GET", "/datacenters");
    return res.datacenters;
  }

  async listServerTypes(): Promise<HetznerServerType[]> {
    const res = await this.fetch<{ server_types: HetznerServerType[] }>("GET", "/server_types");
    return res.server_types;
  }

  async listSshKeys(): Promise<HetznerSshKey[]> {
    const res = await this.fetch<{ ssh_keys: HetznerSshKey[] }>("GET", "/ssh_keys");
    return res.ssh_keys;
  }

  /**
   * Register an SSH public key with Hetzner.
   * Idempotent: if a key with the same name already exists (409), returns its ID.
   */
  async registerSshKey(name: string, publicKey: string): Promise<number> {
    try {
      const res = await this.fetch<{ ssh_key: HetznerSshKey }>("POST", "/ssh_keys", {
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
