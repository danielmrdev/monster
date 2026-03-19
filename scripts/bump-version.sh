#!/usr/bin/env bash
# bump-version.sh — Bump monorepo version on milestone completion.
#
# Usage:
#   ./scripts/bump-version.sh <patch|minor|major> [--dry-run]
#
# SemVer criteria for GSD milestones:
#   patch  — Bug-fix milestones, infra tweaks, polish, config changes
#   minor  — New features, new screens, new integrations, new site capabilities
#   major  — Breaking changes, architectural rewrites, public API changes
#
# Examples:
#   M001 Foundation          → 0.9.0 (initial)
#   M010 VPS Provisioning    → patch (infra)
#   M011 New site type       → minor (feature)
#   1.0.0 launch             → major
#
# What it does:
#   1. Reads current version from root package.json
#   2. Bumps according to semver level
#   3. Writes back to root package.json (single source of truth)
#   4. Git commits the bump (if not --dry-run)

set -euo pipefail

LEVEL="${1:-}"
DRY_RUN=false
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

if [[ -z "$LEVEL" ]] || [[ ! "$LEVEL" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 <patch|minor|major> [--dry-run]"
  echo ""
  echo "SemVer guide:"
  echo "  patch — bug fixes, infra, polish, config"
  echo "  minor — new features, screens, integrations"
  echo "  major — breaking changes, rewrites"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT_DIR/package.json"

# Read current version
CURRENT=$(node -e "console.log(require('$PKG').version)")

# Split into parts
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$LEVEL" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "$CURRENT → $NEW_VERSION ($LEVEL)"

if $DRY_RUN; then
  echo "(dry run — no changes written)"
  exit 0
fi

# Sub-packages that mirror the root version (for PM2 version display)
SUB_PKGS=(
  "$ROOT_DIR/apps/admin/package.json"
  "$ROOT_DIR/packages/agents/package.json"
)

# Update a package.json file (preserves formatting via node)
update_pkg() {
  local file="$1"
  node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$file', 'utf-8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
"
  echo "Updated $file → $NEW_VERSION"
}

update_pkg "$PKG"
for sub in "${SUB_PKGS[@]}"; do
  update_pkg "$sub"
done

# Git commit if in a repo
if git -C "$ROOT_DIR" rev-parse --git-dir &>/dev/null; then
  git -C "$ROOT_DIR" add "$PKG" "${SUB_PKGS[@]}"
  git -C "$ROOT_DIR" commit -m "chore: bump version to $NEW_VERSION" --no-verify
  echo "Committed: chore: bump version to $NEW_VERSION"
fi
