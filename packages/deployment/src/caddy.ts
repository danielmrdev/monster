import { NodeSSH } from 'node-ssh';

// ---------------------------------------------------------------------------
// CaddyService
//
// SSHes into VPS2 via the local SSH agent (SSH_AUTH_SOCK) and:
//   1. Writes a per-site Caddyfile snippet to `/etc/caddy/sites/<domain>.caddy`
//   2. Reloads Caddy via `sudo systemctl reload caddy`
//
// Prerequisite: VPS2's global Caddyfile must contain `import sites/*` so that
// the per-site snippets are included automatically. This is a one-time manual
// setup step on VPS2 — not managed here.
//
// Observability:
//   - [CaddyService] prefixed log lines for all SSH command stdout/stderr
//   - Rejection error identifies which step failed (write vs reload) + output
// ---------------------------------------------------------------------------

export class CaddyService {
  /**
   * Writes a Caddy virtualhost snippet to VPS2 and reloads Caddy.
   *
   * @param domain    Site domain (e.g. `example.com`) — used as filename and server_name
   * @param slug      Site slug — used as the directory path under vps2SitesRoot
   * @param vps2Host  VPS2 hostname or Tailscale machine name
   * @param vps2User  SSH username on VPS2
   */
  async writeVirtualhost(
    domain: string,
    slug: string,
    vps2Host: string,
    vps2User: string,
  ): Promise<void> {
    const caddyfileContent = `${domain} {
  root * /var/www/sites/${slug}/dist
  file_server
  encode zstd gzip
}
`;

    // Escape single quotes in the content for safe shell embedding
    const escapedContent = caddyfileContent.replace(/'/g, "'\\''");
    const remotePath = `/etc/caddy/sites/${domain}.caddy`;

    const conn = new NodeSSH();

    console.log(`[CaddyService] connecting to ${vps2User}@${vps2Host} via SSH agent`);

    try {
      await conn.connect({
        host: vps2Host,
        username: vps2User,
        agent: process.env.SSH_AUTH_SOCK,
      });

      // Step 1: Write the Caddyfile snippet
      console.log(`[CaddyService] writing ${remotePath}`);
      const writeResult = await conn.execCommand(
        `printf '%s' '${escapedContent}' | sudo tee ${remotePath}`,
      );

      if (writeResult.stdout) {
        for (const line of writeResult.stdout.split('\n')) {
          if (line.trim()) console.log(`[CaddyService] write stdout: ${line}`);
        }
      }
      if (writeResult.stderr) {
        for (const line of writeResult.stderr.split('\n')) {
          if (line.trim()) console.error(`[CaddyService] write stderr: ${line}`);
        }
      }

      if (writeResult.code !== null && writeResult.code !== 0) {
        throw new Error(
          `[CaddyService] write step failed (exit ${writeResult.code}) for domain "${domain}" on host "${vps2Host}".\nstdout: ${writeResult.stdout}\nstderr: ${writeResult.stderr}`,
        );
      }

      console.log(`[CaddyService] write step succeeded: ${remotePath}`);

      // Step 2: Reload Caddy
      console.log(`[CaddyService] reloading caddy on ${vps2Host}`);
      const reloadResult = await conn.execCommand('sudo systemctl reload caddy');

      if (reloadResult.stdout) {
        for (const line of reloadResult.stdout.split('\n')) {
          if (line.trim()) console.log(`[CaddyService] reload stdout: ${line}`);
        }
      }
      if (reloadResult.stderr) {
        for (const line of reloadResult.stderr.split('\n')) {
          if (line.trim()) console.error(`[CaddyService] reload stderr: ${line}`);
        }
      }

      if (reloadResult.code !== null && reloadResult.code !== 0) {
        throw new Error(
          `[CaddyService] reload step failed (exit ${reloadResult.code}) for domain "${domain}" on host "${vps2Host}".\nstdout: ${reloadResult.stdout}\nstderr: ${reloadResult.stderr}`,
        );
      }

      console.log(`[CaddyService] caddy reloaded successfully on ${vps2Host}`);
    } finally {
      conn.dispose();
    }
  }
}
