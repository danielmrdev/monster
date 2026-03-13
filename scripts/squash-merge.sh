#!/usr/bin/env bash
set -euo pipefail

# Squash-merges the current slice branch into main.
# Run from the slice branch you want to merge.

BRANCH=$(git branch --show-current)

if [[ -z "${BRANCH}" ]]; then
  echo "Error: not on any branch (detached HEAD?)"
  exit 1
fi

if [[ "${BRANCH}" == "main" ]]; then
  echo "Error: already on 'main'. Checkout the slice branch first."
  exit 1
fi

echo "Branch to merge: ${BRANCH}"
echo "Merging (squash) into main..."

git checkout main
git merge --squash "${BRANCH}"
git commit -m "feat(${BRANCH}): squash merge"

echo ""
echo "Done. '${BRANCH}' squash-merged into main."
echo "You may now delete the branch:"
echo "  git branch -D ${BRANCH}"
