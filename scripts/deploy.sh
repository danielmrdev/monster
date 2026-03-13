#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

git pull origin main
pnpm install --frozen-lockfile
pnpm -r build
pm2 reload monster-admin || pm2 start ecosystem.config.js --only monster-admin
pm2 save
