#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/new-worktree.sh <MILESTONE> <SLICE>
# Example: ./scripts/new-worktree.sh M001 S01

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <MILESTONE> <SLICE>"
  echo "Example: $0 M001 S01"
  exit 1
fi

MILESTONE="$1"
SLICE="$2"
BRANCH="gsd/${MILESTONE}/${SLICE}"
TARGET="/home/daniel/monster-work/gsd/${MILESTONE}/${SLICE}"

echo "Branch: ${BRANCH}"
echo "Target: ${TARGET}"

# Check if worktree already exists
if git worktree list | grep -qF "${TARGET}"; then
  echo ""
  echo "Worktree already exists at ${TARGET}:"
  git worktree list | grep -F "${TARGET}"
  echo ""
  echo "To use it:"
  echo "  cd ${TARGET} && pnpm install"
  exit 0
fi

# Create parent directory
mkdir -p "${TARGET}"

# Attempt to add worktree for an existing branch (--force allows branch checked out in main worktree)
if git worktree add --force "${TARGET}" "${BRANCH}" 2>/dev/null; then
  echo "Worktree created from existing branch '${BRANCH}'."
else
  # Branch doesn't exist yet — create it
  echo "Branch '${BRANCH}' not found. Creating new branch from HEAD."
  git worktree add -b "${BRANCH}" "${TARGET}"
fi

echo ""
echo "Worktree ready at ${TARGET}"
echo ""
echo "Next steps:"
echo "  cd ${TARGET} && pnpm install"
