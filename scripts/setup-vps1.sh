#!/usr/bin/env bash
# setup-vps1.sh — Bootstrap VPS1 (admin/worker server) from bare Ubuntu 24.04
#
# Usage:
#   bash scripts/setup-vps1.sh --tailscale-key <authkey> [--repo-url <url>]
#
# What this does (idempotent — safe to re-run):
#   1. Tailscale install + join tailnet
#   2. nvm + Node.js 22 LTS
#   3. pnpm + pm2 (global)
#   4. Monorepo clone (or fetch if exists)
#   5. Dependencies install + build
#   6. pm2 start + save + startup
#
# Requirements: Ubuntu 24.04 (noble), run as user daniel (with sudo for Tailscale).
# Note: Unlike setup-vps2.sh, this does NOT require root — only Tailscale install needs sudo.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

TAILSCALE_KEY=""
REPO_URL="git@github.com:danielmrdev/monster.git"
INSTALL_DIR="/home/daniel/monster"

usage() {
  echo "Usage: $0 --tailscale-key <authkey> [--repo-url <url>]"
  echo ""
  echo "  --tailscale-key   Tailscale auth key (tskey-auth-...). Required."
  echo "  --repo-url        Git repository URL."
  echo "                    Defaults to: ${REPO_URL}"
  echo ""
  echo "Example:"
  echo "  bash $0 --tailscale-key tskey-auth-xxxxxxxxxxxx"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tailscale-key)
      TAILSCALE_KEY="${2:-}"
      shift 2
      ;;
    --repo-url)
      REPO_URL="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "[setup-vps1] ERROR: Unknown argument: $1"
      usage
      ;;
  esac
done

if [[ -z "$TAILSCALE_KEY" ]]; then
  echo "[setup-vps1] ERROR: --tailscale-key is required."
  echo ""
  usage
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

STEP=0
TOTAL_STEPS=6

log() {
  local level="$1"
  shift
  echo "[setup-vps1] [step ${STEP}/${TOTAL_STEPS}] [$(date '+%Y-%m-%d %H:%M:%S')] ${level}: $*"
}

step() {
  STEP=$((STEP + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "INFO" "$*"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  setup-vps1.sh — VPS1 Bootstrap (6 steps)                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Repo URL      : ${REPO_URL}"
echo "  Install dir   : ${INSTALL_DIR}"
echo "  Tailscale key : [REDACTED]"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Tailscale install + join
# ---------------------------------------------------------------------------

step "Tailscale install and join tailnet"

if command -v tailscale &>/dev/null; then
  log "INFO" "tailscale already installed ($(tailscale version 2>/dev/null || echo 'version unknown')) — skipping install"
else
  log "INFO" "Installing Tailscale for Ubuntu 24.04 (noble)..."
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/noble.nosetup.gpg" \
    | sudo gpg --dearmor -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] \
https://pkgs.tailscale.com/stable/ubuntu noble main" \
    | sudo tee /etc/apt/sources.list.d/tailscale.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -q tailscale
  log "INFO" "Tailscale installed ✓"
fi

# Join the tailnet (idempotent — safe to re-run)
log "INFO" "Joining tailnet with key [REDACTED]..."
sudo tailscale up --authkey="${TAILSCALE_KEY}" --accept-routes 2>&1 \
  | sed 's/tskey-[^ ]*/[REDACTED]/g' || true

log "INFO" "Step 1 complete ✓ (Tailscale node: $(tailscale status --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("Self",{}).get("HostName","unknown"))' 2>/dev/null || echo 'unknown'))"

# ---------------------------------------------------------------------------
# Step 2: nvm + Node.js 22
# ---------------------------------------------------------------------------

step "nvm + Node.js 22 LTS"

export NVM_DIR="${HOME}/.nvm"

if [[ -d "${NVM_DIR}" ]]; then
  log "INFO" "nvm already installed at ${NVM_DIR} — skipping install"
else
  log "INFO" "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  log "INFO" "nvm installed ✓"
fi

# Source nvm for this non-interactive shell session
# shellcheck source=/dev/null
[ -s "${NVM_DIR}/nvm.sh" ] && \. "${NVM_DIR}/nvm.sh"

log "INFO" "Installing Node.js 22..."
nvm install 22
nvm use 22
nvm alias default 22

log "INFO" "Step 2 complete ✓ (Node.js $(node --version), npm $(npm --version))"

# ---------------------------------------------------------------------------
# Step 3: pnpm + pm2 (global)
# ---------------------------------------------------------------------------

step "pnpm + pm2 (global npm packages)"

log "INFO" "Installing pnpm and pm2 globally..."
npm install -g pnpm pm2

log "INFO" "Step 3 complete ✓ (pnpm $(pnpm --version), pm2 $(pm2 --version 2>/dev/null || echo 'unknown'))"

# ---------------------------------------------------------------------------
# Step 4: Monorepo clone
# ---------------------------------------------------------------------------

step "Monorepo clone / fetch"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  log "INFO" "Monorepo already exists at ${INSTALL_DIR} — fetching latest..."
  git -C "${INSTALL_DIR}" fetch --all --prune
  git -C "${INSTALL_DIR}" pull origin main || log "WARN" "git pull failed (may have local changes) — continuing"
  log "INFO" "Fetch complete ✓"
else
  log "INFO" "Cloning ${REPO_URL} → ${INSTALL_DIR}..."
  git clone "${REPO_URL}" "${INSTALL_DIR}"
  log "INFO" "Clone complete ✓"
fi

log "INFO" "Step 4 complete ✓ (branch: $(git -C "${INSTALL_DIR}" branch --show-current 2>/dev/null || echo 'unknown'))"

# ---------------------------------------------------------------------------
# Step 5: Dependencies install + build
# ---------------------------------------------------------------------------

step "Dependencies install + build"

cd "${INSTALL_DIR}"

log "INFO" "Running pnpm install --frozen-lockfile..."
pnpm install --frozen-lockfile

log "INFO" "Creating logs directory..."
mkdir -p "${INSTALL_DIR}/logs"

log "INFO" "Running pnpm -r build..."
pnpm -r build

log "INFO" "Step 5 complete ✓"

# ---------------------------------------------------------------------------
# Step 6: pm2 start + save + startup
# ---------------------------------------------------------------------------

step "pm2 start + save + startup"

cd "${INSTALL_DIR}"

log "INFO" "Starting pm2 apps from ecosystem.config.js..."
pm2 start ecosystem.config.js --update-env || true  # || true handles "already started" case

log "INFO" "Saving pm2 process list..."
pm2 save

log "INFO" "Configuring pm2 startup..."
# pm2 startup outputs a sudo command that must be run; capture and execute it
PM2_STARTUP_CMD=$(pm2 startup 2>&1 | grep "sudo" | head -1) || true
if [[ -n "${PM2_STARTUP_CMD}" ]]; then
  log "INFO" "Running pm2 startup command: ${PM2_STARTUP_CMD}"
  eval "${PM2_STARTUP_CMD}" || log "WARN" "pm2 startup command failed — may need to run manually"
else
  log "INFO" "pm2 startup already configured or no sudo command needed"
fi

log "INFO" "Step 6 complete ✓"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  VPS1 bootstrap complete (all 6 steps)                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Tailscale : $(tailscale status 2>/dev/null | head -1 || echo 'check: tailscale status')"
echo "  Node.js   : $(node --version 2>/dev/null || echo 'not found')"
echo "  pnpm      : $(pnpm --version 2>/dev/null || echo 'not found')"
echo "  pm2       : $(pm2 --version 2>/dev/null || echo 'not found')"
echo "  Monorepo  : ${INSTALL_DIR} ($(git -C "${INSTALL_DIR}" log --oneline -1 2>/dev/null || echo 'unknown'))"
echo "  pm2 apps  : $(pm2 jlist 2>/dev/null | python3 -c 'import sys,json; apps=json.load(sys.stdin); print(", ".join(a["name"]+"="+a["pm2_env"]["status"] for a in apps))' 2>/dev/null || echo 'check: pm2 list')"
echo ""
echo "Next steps:"
echo "  1. Verify Tailscale connectivity: tailscale status"
echo "  2. Verify pm2 apps: pm2 list"
echo "  3. Set up .env and apps/admin/.env.local with required secrets"
echo "  4. Run: bash scripts/setup-redis.sh (if Redis not yet installed)"
echo "  5. Restart pm2 apps after .env setup: pm2 restart all"
echo ""
