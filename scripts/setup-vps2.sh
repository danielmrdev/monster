#!/usr/bin/env bash
# setup-vps2.sh — Bootstrap VPS2 (public sites server) from bare Ubuntu 24.04
#
# Usage:
#   sudo bash scripts/setup-vps2.sh --tailscale-key <authkey> [--deploy-user <user>]
#
# What this does (idempotent — safe to re-run):
#   1. System update (apt update + upgrade)
#   2. Tailscale install + join tailnet
#   3. Caddy install via official apt repo
#   4. Caddyfile configured with `import sites/*`
#   5. Site directories created (/etc/caddy/sites/, /var/www/sites/)
#   6. Sudoers entry: deploy user can reload caddy without password
#   7. Caddy service enabled + started
#   Self-check via scripts/lib/vps2-check.sh run at the end
#
# Requirements: Ubuntu 24.04 (noble), run as root or with sudo.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

TAILSCALE_KEY=""
DEPLOY_USER="${SUDO_USER:-$(whoami)}"

usage() {
  echo "Usage: $0 --tailscale-key <authkey> [--deploy-user <user>]"
  echo ""
  echo "  --tailscale-key   Tailscale auth key (tskey-auth-...). Required."
  echo "  --deploy-user     Username that will run rsync/caddy operations."
  echo "                    Defaults to the invoking user (${DEPLOY_USER})."
  echo ""
  echo "Example:"
  echo "  sudo bash $0 --tailscale-key tskey-auth-xxxxxxxxxxxx"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tailscale-key)
      TAILSCALE_KEY="${2:-}"
      shift 2
      ;;
    --deploy-user)
      DEPLOY_USER="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "[setup-vps2] ERROR: Unknown argument: $1"
      usage
      ;;
  esac
done

if [[ -z "$TAILSCALE_KEY" ]]; then
  echo "[setup-vps2] ERROR: --tailscale-key is required."
  echo ""
  usage
fi

if [[ -z "$DEPLOY_USER" ]]; then
  echo "[setup-vps2] ERROR: Could not determine deploy user. Pass --deploy-user explicitly."
  exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

STEP=0
TOTAL_STEPS=7

log() {
  local level="$1"
  shift
  echo "[setup-vps2] [step ${STEP}/${TOTAL_STEPS}] [$(date '+%Y-%m-%d %H:%M:%S')] ${level}: $*"
}

step() {
  STEP=$((STEP + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "INFO" "$*"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

if [[ "$EUID" -ne 0 ]]; then
  echo "[setup-vps2] ERROR: This script must be run as root (use sudo)."
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  setup-vps2.sh — VPS2 Bootstrap (7 steps)                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Deploy user : ${DEPLOY_USER}"
echo "  Tailscale key: [REDACTED]"
echo ""

# ---------------------------------------------------------------------------
# Step 1: System update
# ---------------------------------------------------------------------------

step "System update (apt update + upgrade)"

export DEBIAN_FRONTEND=noninteractive

log "INFO" "Running apt-get update..."
apt-get update -qq

log "INFO" "Running apt-get upgrade (this may take a few minutes)..."
apt-get upgrade -y -q

log "INFO" "Installing prerequisite packages..."
apt-get install -y -q \
  curl \
  gnupg \
  apt-transport-https \
  ca-certificates \
  lsb-release \
  debian-keyring \
  debian-archive-keyring

log "INFO" "Step 1 complete ✓"

# ---------------------------------------------------------------------------
# Step 2: Tailscale install + join
# ---------------------------------------------------------------------------

step "Tailscale install and join tailnet"

if command -v tailscale &>/dev/null; then
  log "INFO" "tailscale already installed ($(tailscale version 2>/dev/null || echo 'version unknown')) — skipping install"
else
  log "INFO" "Installing Tailscale for Ubuntu 24.04 (noble)..."
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/noble.nosetup.gpg" \
    | gpg --dearmor -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] \
https://pkgs.tailscale.com/stable/ubuntu noble main" \
    | tee /etc/apt/sources.list.d/tailscale.list > /dev/null
  apt-get update -qq
  apt-get install -y -q tailscale
  log "INFO" "Tailscale installed ✓"
fi

# Join the tailnet (idempotent — safe to re-run; --force-reauth if needed)
log "INFO" "Joining tailnet with key [REDACTED]..."
tailscale up --authkey="${TAILSCALE_KEY}" --accept-routes 2>&1 \
  | sed 's/tskey-[^ ]*/[REDACTED]/g' || true

# Enable IP forwarding for Tailscale subnet routing (best practice)
if ! grep -q "net.ipv4.ip_forward = 1" /etc/sysctl.d/99-tailscale.conf 2>/dev/null; then
  echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.d/99-tailscale.conf
  echo "net.ipv6.conf.all.forwarding = 1" >> /etc/sysctl.d/99-tailscale.conf
  sysctl -p /etc/sysctl.d/99-tailscale.conf >/dev/null
fi

log "INFO" "Step 2 complete ✓ (Tailscale node: $(tailscale status --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("Self",{}).get("HostName","unknown"))' 2>/dev/null || echo 'unknown'))"

# ---------------------------------------------------------------------------
# Step 3: Caddy install via official apt repo
# ---------------------------------------------------------------------------

step "Caddy install via official apt repo"

if command -v caddy &>/dev/null; then
  log "INFO" "caddy already installed ($(caddy version 2>/dev/null || echo 'version unknown')) — skipping install"
else
  log "INFO" "Adding Caddy official apt repository..."
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" \
    | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  apt-get update -qq
  apt-get install -y -q caddy
  log "INFO" "Caddy installed ✓ ($(caddy version))"
fi

log "INFO" "Step 3 complete ✓"

# ---------------------------------------------------------------------------
# Steps 4-7: Caddyfile config, site directories, sudoers, service enable
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Step 4: Configure Caddyfile with import sites/*
# ---------------------------------------------------------------------------

step "Configure Caddyfile with import sites/*"

CADDYFILE="/etc/caddy/Caddyfile"

if grep -q "import sites/\*" "${CADDYFILE}" 2>/dev/null; then
  log "INFO" "Caddyfile already contains 'import sites/*' — skipping (idempotent)"
else
  if [[ -f "${CADDYFILE}" ]]; then
    log "INFO" "Backing up existing Caddyfile to ${CADDYFILE}.bak"
    cp "${CADDYFILE}" "${CADDYFILE}.bak"
  fi

  log "INFO" "Writing Caddyfile with import sites/*..."
  cat > "${CADDYFILE}" << 'EOF'
# Global options
{
  # Uncomment and set your email for Let's Encrypt notifications:
  # email admin@example.com
}

# Import per-site virtualhost snippets.
# Each snippet is written by the admin panel (CaddyService) to /etc/caddy/sites/<domain>.caddy
import sites/*
EOF

  log "INFO" "Caddyfile written ✓"
fi

# Validate Caddy config syntax
log "INFO" "Validating Caddy config..."
caddy validate --config "${CADDYFILE}" --adapter caddyfile 2>&1 || {
  log "WARN" "Caddy config validation warning (may be OK if sites/* is empty) — continuing"
}

log "INFO" "Step 4 complete ✓"

# ---------------------------------------------------------------------------
# Step 5: Create site directories
# ---------------------------------------------------------------------------

step "Create site directories (/etc/caddy/sites/, /var/www/sites/)"

log "INFO" "Creating /etc/caddy/sites/..."
mkdir -p /etc/caddy/sites
# Root owns this dir; caddy reads it; deploy user writes via sudo tee (from CaddyService)
chown root:root /etc/caddy/sites
chmod 755 /etc/caddy/sites

log "INFO" "Creating /var/www/sites/..."
mkdir -p /var/www/sites
# Deploy user owns the sites root so rsync can write without sudo
chown "${DEPLOY_USER}:${DEPLOY_USER}" /var/www/sites
chmod 755 /var/www/sites

log "INFO" "Step 5 complete ✓"
log "INFO" "  /etc/caddy/sites/ : $(stat -c '%U:%G %a' /etc/caddy/sites)"
log "INFO" "  /var/www/sites/   : $(stat -c '%U:%G %a' /var/www/sites)"

# ---------------------------------------------------------------------------
# Step 6: Sudoers entry — passwordless caddy reload for deploy user
# ---------------------------------------------------------------------------

step "Sudoers entry: ${DEPLOY_USER} can reload Caddy without password"

SUDOERS_FILE="/etc/sudoers.d/caddy-reload"
SUDOERS_LINE="${DEPLOY_USER} ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy"

if [[ -f "${SUDOERS_FILE}" ]] && grep -qF "${SUDOERS_LINE}" "${SUDOERS_FILE}" 2>/dev/null; then
  log "INFO" "Sudoers entry already present — skipping (idempotent)"
else
  log "INFO" "Writing sudoers entry to ${SUDOERS_FILE}..."
  echo "${SUDOERS_LINE}" > "${SUDOERS_FILE}"
  chmod 440 "${SUDOERS_FILE}"

  # Validate before leaving in place — a bad sudoers file locks out sudo
  if ! visudo -c -f "${SUDOERS_FILE}" &>/dev/null; then
    log "ERROR" "visudo validation failed for ${SUDOERS_FILE} — removing invalid file"
    rm -f "${SUDOERS_FILE}"
    log "ERROR" "Sudoers entry failed validation. Check the DEPLOY_USER value: '${DEPLOY_USER}'"
    exit 1
  fi

  log "INFO" "Sudoers entry written and validated ✓"
  log "INFO" "  File   : ${SUDOERS_FILE}"
  log "INFO" "  Entry  : ${SUDOERS_LINE}"
fi

log "INFO" "Step 6 complete ✓"

# ---------------------------------------------------------------------------
# Step 7: Enable and start Caddy
# ---------------------------------------------------------------------------

step "Enable and start Caddy service"

systemctl enable caddy 2>&1 | { grep -v "^$" || true; }
systemctl start caddy 2>/dev/null || true  # May fail if config has no sites yet; that's OK

CADDY_STATUS="$(systemctl is-active caddy 2>/dev/null || echo 'inactive')"
log "INFO" "Caddy service status: ${CADDY_STATUS}"

if [[ "${CADDY_STATUS}" != "active" ]]; then
  log "WARN" "Caddy is not active (may be normal if no sites are configured yet)"
  log "WARN" "Check: sudo journalctl -u caddy --no-pager -n 20"
else
  log "INFO" "Caddy is active ✓"
fi

log "INFO" "Step 7 complete ✓"

# ---------------------------------------------------------------------------
# Self-check: run postcondition assertions
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_SCRIPT="${SCRIPT_DIR}/lib/vps2-check.sh"

if [[ -f "${CHECK_SCRIPT}" ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[setup-vps2] Running postcondition self-check..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  # Run as the deploy user so the sudo-no-password check tests the right account
  if [[ "${DEPLOY_USER}" == "$(whoami)" ]]; then
    bash "${CHECK_SCRIPT}" --local
  else
    sudo -u "${DEPLOY_USER}" bash "${CHECK_SCRIPT}" --local
  fi
else
  log "WARN" "vps2-check.sh not found at ${CHECK_SCRIPT} — skipping self-check"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  VPS2 bootstrap complete (all 7 steps)                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Deploy user : ${DEPLOY_USER}"
echo "  Tailscale   : $(tailscale status 2>/dev/null | head -1 || echo 'check: tailscale status')"
echo "  Caddy       : $(caddy version 2>/dev/null || echo 'not found')"
echo "  Caddy status: $(systemctl is-active caddy 2>/dev/null || echo 'unknown')"
echo ""
echo "Next steps:"
echo "  1. Verify from VPS1: bash scripts/lib/vps2-check.sh <vps2-host> <user>"
echo "  2. Add vps2_host, vps2_user, vps2_sites_root, vps2_ip in admin Settings"
echo "  3. Run a site generation to test the full deploy pipeline"
echo ""
