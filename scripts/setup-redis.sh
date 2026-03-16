#!/bin/bash
# setup-redis.sh — Install and configure Redis on VPS1 (local, Tailscale-private)
# Run as a user with sudo access: bash scripts/setup-redis.sh
set -euo pipefail

echo "==> Installing Redis..."
sudo apt-get update -qq
sudo apt-get install -y redis-server

echo "==> Configuring Redis (localhost-only, no password needed on private VPS)..."
# Ensure Redis only binds to localhost (already default on Ubuntu)
sudo sed -i 's/^# bind 127.0.0.1/bind 127.0.0.1/' /etc/redis/redis.conf || true
sudo sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf

# Enable persistence (AOF) for job durability across restarts
sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf

echo "==> Enabling and starting Redis service..."
sudo systemctl enable redis-server
sudo systemctl restart redis-server

echo "==> Verifying..."
redis-cli ping

echo ""
echo "Done. Redis is running on localhost:6379"
echo "Update REDIS_URL=redis://127.0.0.1:6379 in your .env and apps/admin/.env.local"
