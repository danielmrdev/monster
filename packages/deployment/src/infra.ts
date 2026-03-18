import { execSync } from 'node:child_process';
import { NodeSSH } from 'node-ssh';
import { createServiceClient } from '@monster/db';

// ---------------------------------------------------------------------------
// InfraService
//
// SSHes into each active server (from the `servers` table) via the local SSH
// agent (SSH_AUTH_SOCK) and reports infrastructure health: Caddy status, disk
// usage, memory usage.
//
// Observability:
//   - [InfraService] prefixed log lines for SSH commands and results
//   - getFleetHealth() never throws — returns structured per-server error objects
//   - testDeployConnection() never throws — returns { ok: false, error } on failure
//   - Host/user are logged; no secrets are logged
// ---------------------------------------------------------------------------

export interface ServerHealth {
  serverId: string;
  serverName: string;
  reachable: boolean;
  caddyActive: boolean;
  diskUsedPct: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  error?: string;
}

export interface FleetHealth {
  servers: ServerHealth[];
  fetchedAt: string;
}

export class InfraService {
  /**
   * Queries all active servers from the `servers` table and collects health
   * metrics from each via SSH:
   *   - Caddy service status (systemctl is-active)
   *   - Disk usage percentage (df)
   *   - Memory used/total in MB (free)
   *
   * Never throws — returns empty fleet or per-server error states on failure.
   */
  async getFleetHealth(): Promise<FleetHealth> {
    const now = new Date().toISOString();
    const supabase = createServiceClient();

    const { data: servers, error } = await supabase
      .from('servers')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`[InfraService] failed to query servers table: ${error.message}`);
      return { servers: [], fetchedAt: now };
    }

    if (!servers || servers.length === 0) {
      console.log('[InfraService] fleet health: 0 active servers — returning empty fleet');
      return { servers: [], fetchedAt: now };
    }

    console.log(`[InfraService] fleet health: checking ${servers.length} server(s)`);

    const results: ServerHealth[] = await Promise.all(
      servers.map((server) =>
        this.checkServerHealth({
          id: server.id,
          name: server.name,
          tailscale_ip: server.tailscale_ip,
          public_ip: server.public_ip,
          ssh_user: server.ssh_user,
          is_local: server.is_local ?? false,
        }),
      ),
    );

    return { servers: results, fetchedAt: now };
  }

  /**
   * Minimal SSH round-trip to validate that the SSH agent + server config is
   * working. Reads from the `servers` table.
   *
   * @param serverId  If provided, tests that specific server. Otherwise, uses
   *                  the first active server (ordered by created_at).
   *
   * Never throws — returns `{ ok: false, error }` on failure.
   */
  async testDeployConnection(serverId?: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = createServiceClient();

    let serverQuery;
    if (serverId) {
      serverQuery = supabase.from('servers').select('*').eq('id', serverId).single();
    } else {
      serverQuery = supabase
        .from('servers')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
    }

    const { data: server, error } = await serverQuery;

    if (error || !server) {
      const message = error?.message ?? 'No active server found';
      console.error(`[InfraService] testDeployConnection: failed to resolve server — ${message}`);
      return { ok: false, error: message };
    }

    const host = server.tailscale_ip ?? server.public_ip;
    const user = server.ssh_user;

    if (!host) {
      const message = `server "${server.name}" has no IP address`;
      console.error(`[InfraService] testDeployConnection: ${message}`);
      return { ok: false, error: message };
    }

    const conn = new NodeSSH();

    try {
      console.log(`[InfraService] testing deploy connection to ${user}@${host} for server "${server.name}"`);

      await conn.connect({
        host,
        username: user,
        agent: process.env.SSH_AUTH_SOCK,
      });

      const result = await conn.execCommand('echo ok');
      const success = result.stdout.trim() === 'ok';

      if (success) {
        console.log('[InfraService] deploy connection test: OK');
        return { ok: true };
      } else {
        const detail = `unexpected response: stdout="${result.stdout}" stderr="${result.stderr}"`;
        console.error(`[InfraService] deploy connection test failed: ${detail}`);
        return { ok: false, error: detail };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[InfraService] deploy connection test failed: ${message}`);
      return { ok: false, error: message };
    } finally {
      conn.dispose();
    }
  }

  /**
   * Collects health metrics from a single server via SSH.
   * Called concurrently by getFleetHealth() for all active servers.
   */
  private async checkServerHealth(server: {
    id: string;
    name: string;
    tailscale_ip: string | null;
    public_ip: string | null;
    ssh_user: string;
    is_local: boolean;
  }): Promise<ServerHealth> {
    if (server.is_local) {
      return this.checkServerHealthLocal(server);
    }

    const host = server.tailscale_ip ?? server.public_ip;
    const base: ServerHealth = {
      serverId: server.id,
      serverName: server.name,
      reachable: false,
      caddyActive: false,
      diskUsedPct: null,
      memUsedMb: null,
      memTotalMb: null,
    };

    if (!host) {
      return { ...base, error: 'No IP address available' };
    }

    const conn = new NodeSSH();
    try {
      console.log(
        `[InfraService] connecting to ${server.ssh_user}@${host} for server "${server.name}"`,
      );

      await conn.connect({
        host,
        username: server.ssh_user,
        agent: process.env.SSH_AUTH_SOCK,
      });

      console.log(`[InfraService] connected to "${server.name}" — collecting health metrics`);

      // ── Caddy status ──────────────────────────────────────────────────
      const caddyResult = await conn.execCommand('systemctl is-active caddy');
      const caddyActive = caddyResult.stdout.trim() === 'active';
      console.log(`[InfraService] "${server.name}" caddy: ${caddyResult.stdout.trim()}`);

      // ── Disk usage ────────────────────────────────────────────────────
      const dfResult = await conn.execCommand("df -h / | tail -1 | awk '{print $5}'");
      const diskRaw = dfResult.stdout.trim().replace('%', '');
      const diskUsedPctParsed = diskRaw ? parseInt(diskRaw, 10) : null;
      const diskUsedPct = diskUsedPctParsed !== null && Number.isNaN(diskUsedPctParsed)
        ? null
        : diskUsedPctParsed;
      console.log(`[InfraService] "${server.name}" disk: ${dfResult.stdout.trim()}`);

      // ── Memory usage ──────────────────────────────────────────────────
      const freeResult = await conn.execCommand("free -m | awk '/^Mem:/{print $3, $2}'");
      const memParts = freeResult.stdout.trim().split(/\s+/);
      const memUsedMbParsed = memParts[0] ? parseInt(memParts[0], 10) : null;
      const memTotalMbParsed = memParts[1] ? parseInt(memParts[1], 10) : null;
      const memUsedMb = memUsedMbParsed !== null && Number.isNaN(memUsedMbParsed)
        ? null
        : memUsedMbParsed;
      const memTotalMb = memTotalMbParsed !== null && Number.isNaN(memTotalMbParsed)
        ? null
        : memTotalMbParsed;
      console.log(`[InfraService] "${server.name}" memory: ${freeResult.stdout.trim()}`);

      return {
        ...base,
        reachable: true,
        caddyActive,
        diskUsedPct,
        memUsedMb,
        memTotalMb,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[InfraService] SSH error for server "${server.name}": ${message}`);
      return { ...base, error: message };
    } finally {
      conn.dispose();
    }
  }

  /**
   * Collects health metrics from the local machine via execSync (no SSH).
   * Used when server.is_local === true — identical commands to the SSH path,
   * parsed with identical logic.
   *
   * Each execSync call is individually wrapped in try/catch because
   * `systemctl is-active caddy` exits non-zero (exit code 3) when Caddy is
   * inactive, which causes execSync to throw even though stdout is valid.
   */
  private checkServerHealthLocal(server: {
    id: string;
    name: string;
  }): ServerHealth {
    const base: ServerHealth = {
      serverId: server.id,
      serverName: server.name,
      reachable: false,
      caddyActive: false,
      diskUsedPct: null,
      memUsedMb: null,
      memTotalMb: null,
    };

    try {
      // ── Caddy status ──────────────────────────────────────────────────
      let caddyRaw = '';
      try {
        caddyRaw = execSync('systemctl is-active caddy', { encoding: 'utf8' }).trim();
      } catch (err) {
        // execSync throws on non-zero exit; stdout is in err.stdout
        const e = err as { stdout?: string };
        caddyRaw = (e.stdout ?? '').trim();
      }
      const caddyActive = caddyRaw === 'active';
      console.log(`[InfraService] "${server.name}" caddy (local): ${caddyRaw}`);

      // ── Disk usage ────────────────────────────────────────────────────
      let diskRaw = '';
      try {
        diskRaw = execSync("df -h / | tail -1 | awk '{print $5}'", { encoding: 'utf8' })
          .trim()
          .replace('%', '');
      } catch (err) {
        const e = err as { stdout?: string };
        diskRaw = (e.stdout ?? '').trim().replace('%', '');
      }
      const diskUsedPctParsed = diskRaw ? parseInt(diskRaw, 10) : null;
      const diskUsedPct =
        diskUsedPctParsed !== null && Number.isNaN(diskUsedPctParsed) ? null : diskUsedPctParsed;
      console.log(`[InfraService] "${server.name}" disk (local): ${diskRaw}`);

      // ── Memory usage ──────────────────────────────────────────────────
      let memRaw = '';
      try {
        memRaw = execSync("free -m | awk '/^Mem:/{print $3, $2}'", { encoding: 'utf8' }).trim();
      } catch (err) {
        const e = err as { stdout?: string };
        memRaw = (e.stdout ?? '').trim();
      }
      const memParts = memRaw.split(/\s+/);
      const memUsedMbParsed = memParts[0] ? parseInt(memParts[0], 10) : null;
      const memTotalMbParsed = memParts[1] ? parseInt(memParts[1], 10) : null;
      const memUsedMb =
        memUsedMbParsed !== null && Number.isNaN(memUsedMbParsed) ? null : memUsedMbParsed;
      const memTotalMb =
        memTotalMbParsed !== null && Number.isNaN(memTotalMbParsed) ? null : memTotalMbParsed;
      console.log(`[InfraService] "${server.name}" memory (local): ${memRaw}`);

      console.log(`[InfraService] local-mode metrics for "${server.name}"`);

      return {
        ...base,
        reachable: true,
        caddyActive,
        diskUsedPct,
        memUsedMb,
        memTotalMb,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[InfraService] local-mode error for "${server.name}": ${message}`);
      return { ...base, error: message };
    }
  }
}
