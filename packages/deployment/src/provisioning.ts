import { join } from "node:path";
import { NodeSSH } from "node-ssh";
import { createServiceClient } from "@monster/db";
import { HetznerClient } from "./hetzner.js";

// ---------------------------------------------------------------------------
// ProvisioningService
//
// Orchestrates the full VPS provisioning flow:
//   1. Register SSH key with Hetzner (idempotent)
//   2. Create the server via Hetzner API
//   3. Poll until server status === 'running' (waitForBoot)
//   4. SSH in, upload scripts, run setup-vps2.sh (bootstrapVps)
//   5. Insert server record into `servers` table via Supabase
//
// Observability:
//   - [ProvisioningService] prefixed log lines for all phases
//   - tailscaleKey is NEVER logged — passed directly to command string only
// ---------------------------------------------------------------------------

const BOOT_POLL_INTERVAL_MS = 10_000;
const BOOT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SSH_RETRY_ATTEMPTS = 6;
const SSH_RETRY_DELAY_MS = 5_000;

export interface Server {
  id: string;
  name: string;
  provider: string;
  external_id: number | null;
  status: string;
  public_ip: string | null;
  tailscale_ip: string | null;
  datacenter: string | null;
  server_type: string | null;
  ssh_user: string;
  created_at: string;
  last_health_check: string | null;
}

export interface ProvisionOpts {
  name: string;
  datacenter: string; // e.g. 'nbg1-dc3'
  serverType: string; // e.g. 'cx22'
  tailscaleKey: string; // one-time use, never stored or logged
  sshPublicKey: string; // operator's public key string
}

export class ProvisioningService {
  private hetzner = new HetznerClient();

  async provision(
    opts: ProvisionOpts,
    onProgress?: (step: string, message: string) => void,
  ): Promise<Server> {
    const emit = (step: string, message: string) => {
      if (onProgress) onProgress(step, message);
    };

    console.log(`[ProvisioningService] starting provision for "${opts.name}"`);

    // 1. Register SSH key with Hetzner (idempotent)
    emit("ssh_key", "Registering SSH key with Hetzner…");
    const sshKeyId = await this.hetzner.registerSshKey("monster-provisioning", opts.sshPublicKey);
    console.log(`[ProvisioningService] SSH key id=${sshKeyId}`);

    // 2. Create the server
    emit("create_server", `Creating ${opts.serverType} server in ${opts.datacenter}…`);
    const { server: hServer } = await this.hetzner.createServer({
      name: opts.name,
      server_type: opts.serverType,
      image: "ubuntu-24.04",
      datacenter: opts.datacenter,
      ssh_keys: [sshKeyId],
    });
    console.log(`[ProvisioningService] server created id=${hServer.id} status=${hServer.status}`);

    // 3. Wait for boot
    emit("wait_boot", "Waiting for server to boot…");
    const publicIp = await this.waitForBoot(hServer.id);
    console.log(`[ProvisioningService] server running at ${publicIp}`);

    // 4. SSH bootstrap
    emit("bootstrap", "SSH bootstrap starting (setup-vps2.sh)…");
    await this.bootstrapVps(publicIp, opts.tailscaleKey, opts.sshPublicKey);
    console.log(`[ProvisioningService] bootstrap complete`);

    // 5. Insert into servers table
    emit("register", "Registering server in database…");
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("servers")
      .insert({
        name: opts.name,
        provider: "hetzner",
        external_id: hServer.id,
        status: "active",
        public_ip: publicIp,
        datacenter: opts.datacenter,
        server_type: opts.serverType,
        ssh_user: "root",
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`[ProvisioningService] DB insert failed: ${error?.message ?? "no data"}`);
    }

    console.log(`[ProvisioningService] server registered in DB id=${data.id}`);
    return data as Server;
  }

  /**
   * Polls getServer() every 10s until status === 'running'.
   * Timeout at 5 minutes. Returns the server's public IPv4.
   */
  private async waitForBoot(serverId: number): Promise<string> {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const { server } = await this.hetzner.getServer(serverId);
      console.log(`[ProvisioningService] server ${serverId} status=${server.status}`);

      if (server.status === "running") {
        const ip = server.public_net.ipv4?.ip;
        if (!ip) {
          throw new Error(`[ProvisioningService] server running but no public IPv4 assigned`);
        }
        return ip;
      }

      await new Promise((r) => setTimeout(r, BOOT_POLL_INTERVAL_MS));
    }

    throw new Error(`[ProvisioningService] timeout waiting for server ${serverId} to boot`);
  }

  /**
   * SSHes into the new server as root, uploads setup scripts, runs bootstrap.
   *
   * SSH connect retried up to SSH_RETRY_ATTEMPTS times (SSH daemon may not
   * be listening immediately after Hetzner reports status=running).
   */
  private async bootstrapVps(
    publicIp: string,
    tailscaleKey: string,
    _sshPublicKey: string,
  ): Promise<void> {
    const conn = new NodeSSH();
    const monorepoRoot = process.cwd();

    // Connect with retry — SSH daemon may not be ready immediately
    let lastErr: unknown;
    for (let attempt = 1; attempt <= SSH_RETRY_ATTEMPTS; attempt++) {
      try {
        console.log(`[ProvisioningService] SSH connect attempt ${attempt}/${SSH_RETRY_ATTEMPTS}`);
        await conn.connect({
          host: publicIp,
          username: "root",
          agent: process.env.SSH_AUTH_SOCK,
          readyTimeout: 10_000,
        });
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < SSH_RETRY_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, SSH_RETRY_DELAY_MS));
        }
      }
    }

    if (!conn.isConnected()) {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      throw new Error(
        `[ProvisioningService] SSH connect failed after ${SSH_RETRY_ATTEMPTS} attempts: ${msg}`,
      );
    }

    try {
      const setupScript = join(monorepoRoot, "scripts", "setup-vps2.sh");
      const checkScript = join(monorepoRoot, "scripts", "lib", "vps2-check.sh");

      // Upload scripts
      console.log("[ProvisioningService] uploading setup-vps2.sh");
      await conn.putFile(setupScript, "/tmp/setup-vps2.sh");

      console.log("[ProvisioningService] uploading vps2-check.sh");
      await conn.putFile(checkScript, "/tmp/vps2-check.sh");

      // Make executable
      const chmodResult = await conn.execCommand("chmod +x /tmp/setup-vps2.sh /tmp/vps2-check.sh");
      if (chmodResult.stderr) {
        console.warn(`[ProvisioningService] chmod stderr: ${chmodResult.stderr}`);
      }

      // Run bootstrap — NEVER log tailscaleKey
      console.log("[ProvisioningService] running setup-vps2.sh bootstrap");
      const bootstrapResult = await conn.execCommand(
        `bash /tmp/setup-vps2.sh --tailscale-key ${tailscaleKey}`,
        { execOptions: { pty: false } },
      );

      if (bootstrapResult.stdout) {
        console.log(`[ProvisioningService] bootstrap stdout:\n${bootstrapResult.stdout}`);
      }
      if (bootstrapResult.stderr) {
        console.warn(`[ProvisioningService] bootstrap stderr:\n${bootstrapResult.stderr}`);
      }

      // Non-zero exit code from bash -c doesn't surface as exception in node-ssh;
      // check stderr for known failure patterns
      if (bootstrapResult.stderr?.includes("FATAL") || bootstrapResult.stderr?.includes("Error")) {
        throw new Error(`[ProvisioningService] bootstrap reported errors — check stderr above`);
      }

      console.log("[ProvisioningService] bootstrap finished");
    } finally {
      conn.dispose();
    }
  }
}
