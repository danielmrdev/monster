#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# VPS2 configuration — override via environment or .vps2.env file
# ---------------------------------------------------------------------------
VPS2_HOST="${VPS2_HOST:-}"
VPS2_USER="${VPS2_USER:-root}"

# Source .vps2.env if it exists (not committed — local overrides)
if [ -f "$(dirname "$0")/../.vps2.env" ]; then
  # shellcheck source=/dev/null
  source "$(dirname "$0")/../.vps2.env"
fi

# ---------------------------------------------------------------------------
# Pre-flight: VPS2 SSH + Caddy health check
# ---------------------------------------------------------------------------
if [ "${SKIP_VPS2_CHECK:-0}" = "1" ]; then
  echo "[pre-flight] ⏭ VPS2 check skipped (SKIP_VPS2_CHECK=1)"
elif [ -z "$VPS2_HOST" ]; then
  echo "[pre-flight] ⏭ VPS2 check skipped (VPS2_HOST not set)"
else
  echo "[pre-flight] Checking VPS2 ($VPS2_USER@$VPS2_HOST)..."
  if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes \
       "$VPS2_USER@$VPS2_HOST" 'systemctl is-active caddy' >/dev/null 2>&1; then
    echo "[pre-flight] ✓ VPS2 reachable, Caddy active."
  else
    echo "[pre-flight] ✗ VPS2 health check failed."
    echo ""
    echo "  Possible causes:"
    echo "    • VPS2_HOST ($VPS2_HOST) is incorrect or unreachable"
    echo "    • Tailscale connection is down between VPS1 and VPS2"
    echo "    • Caddy is not running on VPS2 (run: ssh $VPS2_USER@$VPS2_HOST systemctl status caddy)"
    echo ""
    echo "  To fix:"
    echo "    • Verify VPS2_HOST and VPS2_USER environment variables"
    echo "    • Check Tailscale: tailscale status"
    echo "    • Skip this check: SKIP_VPS2_CHECK=1 ./scripts/deploy.sh"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Deploy: pull, build, reload
# ---------------------------------------------------------------------------
git pull origin main
pnpm install --frozen-lockfile
pnpm -r build
pm2 reload monster-admin || pm2 start ecosystem.config.js --only monster-admin
pm2 save
