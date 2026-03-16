#!/usr/bin/env bash
# vps2-check.sh — Health check for VPS2 (sites server) postconditions
#
# Usage (remote, from VPS1):
#   bash scripts/lib/vps2-check.sh <host> <user>
#
# Usage (local, called from setup-vps2.sh on VPS2 itself):
#   bash scripts/lib/vps2-check.sh localhost <user>
#   bash scripts/lib/vps2-check.sh --local
#
# Checks:
#   1. Tailscale is connected
#   2. Caddy service is active
#   3. /etc/caddy/sites/ directory exists
#   4. /var/www/sites/ directory exists
#   5. sudo systemctl reload caddy works without password (deploy user)
#
# Exits 0 if all checks pass, 1 if any fail.
# Designed to be called standalone or from setup-vps2.sh self-check.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

HOST=""
SSH_USER=""
LOCAL_MODE=false

if [[ "${1:-}" == "--local" ]]; then
  LOCAL_MODE=true
elif [[ $# -ge 2 ]]; then
  HOST="$1"
  SSH_USER="$2"
  # localhost / 127.0.0.1 = run checks locally without SSH
  if [[ "$HOST" == "localhost" || "$HOST" == "127.0.0.1" ]]; then
    LOCAL_MODE=true
  fi
elif [[ $# -eq 0 ]]; then
  # No args: assume local mode (called from setup-vps2.sh on VPS2)
  LOCAL_MODE=true
else
  echo "Usage: $0 <host> <user>"
  echo "       $0 --local"
  echo ""
  echo "  <host>   VPS2 hostname or IP (Tailscale name or IP)"
  echo "  <user>   SSH username on VPS2"
  echo "  --local  Run checks locally (no SSH — use when already on VPS2)"
  exit 1
fi

# ---------------------------------------------------------------------------
# Check runner
# ---------------------------------------------------------------------------

PASS_COUNT=0
FAIL_COUNT=0

run_check() {
  local name="$1"
  local cmd="$2"

  if $LOCAL_MODE; then
    if eval "$cmd" &>/dev/null; then
      echo "  ✓ ${name}"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo "  ✗ ${name}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  else
    if ssh \
      -o StrictHostKeyChecking=no \
      -o ConnectTimeout=10 \
      -o BatchMode=yes \
      "${SSH_USER}@${HOST}" \
      "$cmd" &>/dev/null 2>&1; then
      echo "  ✓ ${name}"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo "  ✗ ${name}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  fi
}

# ---------------------------------------------------------------------------
# Run checks
# ---------------------------------------------------------------------------

if $LOCAL_MODE; then
  echo "[vps2-check] Running local postcondition checks..."
else
  echo "[vps2-check] Checking VPS2 at ${SSH_USER}@${HOST}..."
fi
echo ""

run_check "Tailscale connected"              "tailscale status --json | python3 -c 'import sys,json; d=json.load(sys.stdin); exit(0 if d.get(\"BackendState\") == \"Running\" else 1)'"
run_check "Caddy service active"             "systemctl is-active caddy"
run_check "/etc/caddy/sites/ exists"         "test -d /etc/caddy/sites"
run_check "/var/www/sites/ exists"           "test -d /var/www/sites"
run_check "sudo caddy reload (no password)"  "sudo systemctl reload caddy"

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

echo ""
if [[ $FAIL_COUNT -eq 0 ]]; then
  echo "[vps2-check] All ${PASS_COUNT} checks passed ✓"
  exit 0
else
  echo "[vps2-check] ${FAIL_COUNT} check(s) failed ✗  (${PASS_COUNT} passed)"
  echo ""
  echo "Troubleshooting:"
  echo "  - Tailscale:  tailscale up --authkey=<key>"
  echo "  - Caddy:      sudo systemctl enable --now caddy"
  echo "  - Dirs:       sudo mkdir -p /etc/caddy/sites /var/www/sites"
  echo "  - Sudoers:    check /etc/sudoers.d/caddy-reload"
  exit 1
fi
