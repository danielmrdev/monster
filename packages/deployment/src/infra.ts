import { NodeSSH } from 'node-ssh';
import { createServiceClient } from '@monster/db';

// ---------------------------------------------------------------------------
// InfraService
//
// SSHes into VPS2 via the local SSH agent (SSH_AUTH_SOCK) and reports
// infrastructure health: Caddy status, disk usage, memory usage.
//
// Both methods read `vps2_host` and `vps2_user` from Supabase settings
// (D028 pattern) — same values used by CaddyService and RsyncService.
//
// Observability:
//   - [InfraService] prefixed log lines for SSH commands and results
//   - Never throws — returns structured error objects on SSH failure
//   - VPS2 host/user are read from Supabase settings, not logged
// ---------------------------------------------------------------------------

export interface Vps2Health {
  reachable: boolean;
  caddyActive: boolean;
  diskUsedPct: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  fetchedAt: string;
  error?: string;
}

/**
 * Reads `vps2_host` and `vps2_user` from the Supabase settings table.
 * Returns `{ vps2Host, vps2User }` or throws with a descriptive message.
 */
async function readVps2Settings(): Promise<{ vps2Host: string; vps2User: string }> {
  const supabase = createServiceClient();

  const { data: settings, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['vps2_host', 'vps2_user']);

  if (error) {
    throw new Error(`[InfraService] Failed to read settings: ${error.message}`);
  }

  const settingsMap = new Map<string, string>(
    (settings ?? []).map((s) => [
      s.key,
      (s.value as { value?: string })?.value ?? '',
    ]),
  );

  const vps2Host = settingsMap.get('vps2_host');
  const vps2User = settingsMap.get('vps2_user');

  if (!vps2Host || !vps2User) {
    const missing = [!vps2Host && 'vps2_host', !vps2User && 'vps2_user'].filter(Boolean);
    throw new Error(`[InfraService] Missing required settings: ${missing.join(', ')}`);
  }

  return { vps2Host, vps2User };
}

export class InfraService {
  /**
   * SSHes into VPS2 and collects health metrics:
   *   - Caddy service status (systemctl is-active)
   *   - Disk usage percentage (df)
   *   - Memory used/total in MB (free)
   *
   * Never throws — returns `{ reachable: false, error }` on any failure.
   */
  async getVps2Health(): Promise<Vps2Health> {
    const now = new Date().toISOString();

    let vps2Host: string;
    let vps2User: string;

    try {
      ({ vps2Host, vps2User } = await readVps2Settings());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[InfraService] settings error: ${message}`);
      return {
        reachable: false,
        caddyActive: false,
        diskUsedPct: null,
        memUsedMb: null,
        memTotalMb: null,
        fetchedAt: now,
        error: message,
      };
    }

    const conn = new NodeSSH();

    try {
      console.log('[InfraService] connecting to VPS2 via SSH agent');

      await conn.connect({
        host: vps2Host,
        username: vps2User,
        agent: process.env.SSH_AUTH_SOCK,
      });

      console.log('[InfraService] connected — collecting health metrics');

      // ── Caddy status ──────────────────────────────────────────────────
      const caddyResult = await conn.execCommand('systemctl is-active caddy');
      const caddyActive = caddyResult.stdout.trim() === 'active';
      console.log(`[InfraService] caddy: ${caddyResult.stdout.trim()}`);

      // ── Disk usage ────────────────────────────────────────────────────
      const dfResult = await conn.execCommand("df -h / | tail -1 | awk '{print $5}'");
      const diskRaw = dfResult.stdout.trim().replace('%', '');
      const diskUsedPct = diskRaw ? parseInt(diskRaw, 10) : null;
      console.log(`[InfraService] disk: ${dfResult.stdout.trim()}`);

      // ── Memory usage ──────────────────────────────────────────────────
      const freeResult = await conn.execCommand("free -m | awk '/^Mem:/{print $3, $2}'");
      const memParts = freeResult.stdout.trim().split(/\s+/);
      const memUsedMb = memParts[0] ? parseInt(memParts[0], 10) : null;
      const memTotalMb = memParts[1] ? parseInt(memParts[1], 10) : null;
      console.log(`[InfraService] memory: ${freeResult.stdout.trim()}`);

      return {
        reachable: true,
        caddyActive,
        diskUsedPct: Number.isNaN(diskUsedPct) ? null : diskUsedPct,
        memUsedMb: Number.isNaN(memUsedMb) ? null : memUsedMb,
        memTotalMb: Number.isNaN(memTotalMb) ? null : memTotalMb,
        fetchedAt: now,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[InfraService] SSH error: ${message}`);
      return {
        reachable: false,
        caddyActive: false,
        diskUsedPct: null,
        memUsedMb: null,
        memTotalMb: null,
        fetchedAt: now,
        error: message,
      };
    } finally {
      conn.dispose();
    }
  }

  /**
   * Minimal SSH round-trip to VPS2 — validates that the exact SSH agent +
   * host/user config used by CaddyService and RsyncService is working.
   *
   * Never throws — returns `{ ok: false, error }` on failure.
   */
  async testDeployConnection(): Promise<{ ok: boolean; error?: string }> {
    let vps2Host: string;
    let vps2User: string;

    try {
      ({ vps2Host, vps2User } = await readVps2Settings());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[InfraService] settings error: ${message}`);
      return { ok: false, error: message };
    }

    const conn = new NodeSSH();

    try {
      console.log('[InfraService] testing deploy connection to VPS2');

      await conn.connect({
        host: vps2Host,
        username: vps2User,
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
}
