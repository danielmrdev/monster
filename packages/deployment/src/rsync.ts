import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Server } from "./provisioning.js";

// ---------------------------------------------------------------------------
// RsyncService
//
// Rsyncs a built Astro site from `.generated-sites/<slug>/dist/` on the local
// machine to `/var/www/sites/<slug>/dist/` on the target server over SSH.
//
// Monorepo root is resolved via `process.cwd()` — callers must invoke from the
// monorepo root (standard for all pnpm scripts and BullMQ workers).
//
// Observability:
//   - [RsyncService] prefixed log lines for all stdout/stderr from rsync
//   - Rejection error includes rsync exit code + full stderr text
// ---------------------------------------------------------------------------

export class RsyncService {
  /**
   * Rsyncs `.generated-sites/<slug>/dist/` to the target server.
   *
   * @param slug    Site slug — used as the source directory name and remote path component
   * @param server  Server record from the `servers` table (provides host + ssh_user)
   */
  deploy(slug: string, server: Server): Promise<void> {
    const host = server.tailscale_ip ?? server.public_ip;
    const user = server.ssh_user;
    const sitesRoot = "/var/www/sites"; // hardcoded — matches CaddyService (D063)

    if (!host) {
      return Promise.reject(new Error(`[RsyncService] server "${server.name}" has no IP address`));
    }

    const monorepoRoot = process.cwd();
    const sourcePath = join(monorepoRoot, ".generated-sites", slug, "dist") + "/";
    const remotePath = `${user}@${host}:${sitesRoot}/${slug}/dist/`;

    const args = [
      "-avz",
      "--delete",
      "-e",
      "ssh -o StrictHostKeyChecking=no",
      sourcePath,
      remotePath,
    ];

    console.log(`[RsyncService] starting: rsync ${args.join(" ")}`);

    return new Promise<void>((resolve, reject) => {
      const proc = spawn("rsync", args, { stdio: ["ignore", "pipe", "pipe"] });

      let stderrBuffer = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim()) console.log(`[RsyncService] ${line}`);
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        for (const line of text.split("\n")) {
          if (line.trim()) console.error(`[RsyncService] stderr: ${line}`);
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          console.log(`[RsyncService] completed: ${slug} → ${host}`);
          resolve();
        } else {
          const msg = `[RsyncService] rsync exited with code ${code} for slug "${slug}" on host "${host}".\nstderr:\n${stderrBuffer}`;
          console.error(msg);
          reject(new Error(msg));
        }
      });

      proc.on("error", (err) => {
        const msg = `[RsyncService] failed to spawn rsync: ${err.message}`;
        console.error(msg);
        reject(new Error(msg));
      });
    });
  }
}
