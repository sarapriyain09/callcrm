#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/sarapriyain/callcrm}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "[1/7] Fetching latest code..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[2/7] Installing dependencies..."
npm ci

echo "[3/7] Generating Prisma client..."
npm run prisma:generate

echo "[4/7] Running production migrations..."
npm run prisma:migrate:deploy

echo "[5/7] Building web app..."
npm run build

echo "[6/7] Restarting PM2 services..."
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "[7/7] Deploy complete."
