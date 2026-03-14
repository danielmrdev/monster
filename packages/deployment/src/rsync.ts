import { spawn } from 'node:child_process';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// RsyncService
//
// Rsyncs a built Astro site from `.generated-sites/<slug>/dist/` on the local
// machine to `<vps2SitesRoot>/<slug>/dist/` on VPS2 over Tailscale SSH.
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
   * Rsyncs `.generated-sites/<slug>/dist/` to VPS2.
   *
   * @param slug        Site slug — used as the source directory name and remote path component
   * @param vps2Host    VPS2 hostname or Tailscale machine name (e.g. `vps2` or `100.x.x.x`)
   * @param vps2User    SSH username on VPS2 (e.g. `root`)
   * @param vps2SitesRoot  Absolute path on VPS2 where site directories live (e.g. `/var/www/sites`)
   */
  deploy(
    slug: string,
    vps2Host: string,
    vps2User: string,
    vps2SitesRoot: string,
  ): Promise<void> {
    const monorepoRoot = process.cwd();
    const sourcePath = join(monorepoRoot, '.generated-sites', slug, 'dist') + '/';
    const remotePath = `${vps2User}@${vps2Host}:${vps2SitesRoot}/${slug}/dist/`;

    const args = [
      '-avz',
      '--delete',
      '-e',
      'ssh -o StrictHostKeyChecking=no',
      sourcePath,
      remotePath,
    ];

    console.log(
      `[RsyncService] starting: rsync ${args.join(' ')}`,
    );

    return new Promise<void>((resolve, reject) => {
      const proc = spawn('rsync', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderrBuffer = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) console.log(`[RsyncService] ${line}`);
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        for (const line of text.split('\n')) {
          if (line.trim()) console.error(`[RsyncService] stderr: ${line}`);
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`[RsyncService] completed: ${slug} → ${vps2Host}`);
          resolve();
        } else {
          const msg = `[RsyncService] rsync exited with code ${code} for slug "${slug}" on host "${vps2Host}".\nstderr:\n${stderrBuffer}`;
          console.error(msg);
          reject(new Error(msg));
        }
      });

      proc.on('error', (err) => {
        const msg = `[RsyncService] failed to spawn rsync: ${err.message}`;
        console.error(msg);
        reject(new Error(msg));
      });
    });
  }
}
