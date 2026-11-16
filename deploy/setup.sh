#!/usr/bin/env bash
set -euo pipefail

apt-get update
apt-get install -y ca-certificates curl git ufw openssl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 3478/udp
ufw allow 49160:49999/udp
ufw --force enable

cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^LUDRA_TURN_SECRET=.*|LUDRA_TURN_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^LUDRA_TURN_HOST=.*|LUDRA_TURN_HOST=$(curl -fsS4 https://api.ipify.org)|" .env
  chmod 600 .env
fi

ufw status
