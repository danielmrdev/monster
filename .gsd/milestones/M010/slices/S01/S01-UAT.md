# S01 UAT — VPS2 Bootstrap Script

**Slice:** S01 — VPS2 Bootstrap Script
**Milestone:** M010

This is a non-blocking human test script. Run these steps when you have a fresh or existing VPS2 available. The agent has moved on to S02.

---

## Prerequisites

- A fresh Hetzner Ubuntu 24.04 VPS (CX22 or CX32) with SSH access
- A Tailscale auth key from https://login.tailscale.com/admin/settings/keys
- The repo checked out on VPS1 (or use the main copy at `/home/daniel/monster/`)

---

## Test Steps

### 1. Syntax check (can do now, no VPS needed)

```bash
bash -n scripts/setup-vps2.sh
bash -n scripts/lib/vps2-check.sh
echo "Both OK"
```

Expected: `Both OK` — no errors.

### 2. Run bootstrap on fresh VPS

From your local machine or VPS1, with SSH access to the new VPS:

```bash
# Copy the script to the VPS (or clone the repo there)
scp scripts/setup-vps2.sh scripts/lib/vps2-check.sh root@<new-vps-ip>:/root/

# SSH in and run
ssh root@<new-vps-ip>
bash /root/setup-vps2.sh --tailscale-key tskey-auth-xxxx --deploy-user root
```

Expected output:
- Steps 1-7 complete with `✓` markers
- Self-check at end: all 5 assertions show `✓`
- Final summary shows Tailscale hostname + Caddy version

### 3. Verify postconditions via vps2-check.sh from VPS1

After the VPS2 has joined the Tailscale network:

```bash
bash scripts/lib/vps2-check.sh <vps2-tailscale-hostname> root
```

Expected:
```
[vps2-check] Checking VPS2 at root@<hostname>...

  ✓ Tailscale connected
  ✓ Caddy service active
  ✓ /etc/caddy/sites/ exists
  ✓ /var/www/sites/ exists
  ✓ sudo caddy reload (no password)

[vps2-check] All 5 checks passed ✓
```

### 4. Verify idempotency

Run the script a second time on the same VPS:

```bash
bash /root/setup-vps2.sh --tailscale-key tskey-auth-xxxx --deploy-user root
```

Expected: Script completes without errors. All "already installed/present" skip messages appear. No duplicate Caddyfile content or duplicate sudoers entry.

### 5. Verify sudo caddy reload works as deploy user

```bash
ssh <deploy-user>@<vps2-tailscale-hostname>
sudo systemctl reload caddy
echo "exit code: $?"
```

Expected: `exit code: 0` with no password prompt.

---

## Acceptance Criteria

- [ ] All 5 vps2-check.sh assertions pass on the provisioned VPS
- [ ] Script is idempotent (re-run produces no errors)
- [ ] `sudo systemctl reload caddy` works without password as deploy user
- [ ] `/var/www/sites/` is owned by the deploy user (verify: `ls -la /var/www/`)
- [ ] `/etc/caddy/Caddyfile` contains `import sites/*`
