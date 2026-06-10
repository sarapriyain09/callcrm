#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/sarapriyain/Projects/callcrm}"
REPO_URL="${REPO_URL:-https://github.com/sarapriyain09/callcrm.git}"

sudo apt update
sudo apt install -y git curl rsync

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

sudo npm install -g pm2

if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
npm ci
npm run prisma:generate

echo "Bootstrap complete. Add your .env in $APP_DIR/.env and run deploy/pi/deploy.sh"
