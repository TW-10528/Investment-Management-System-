#!/usr/bin/env bash

# ── Thirdwave IMS — Leena Development ─────────────────────────────────────────

set -e
 
ROOT="$(cd "$(dirname "$0")" && pwd)"
 
echo "Thirdwave Investment Management System - Leena"

echo ""
 
# ── Guard: check setup has been run ──────────────────────────────────────────

if [ ! -d "$ROOT/backend/node_modules" ] || [ ! -d "$ROOT/frontend/node_modules" ]; then

  echo "Run 'bash setup.sh' first to install dependencies."

  exit 1

fi
 
# ── Kill previous Leena instances only ───────────────────────────────────────

echo "→ Stopping previous Leena instances..."
 
lsof -ti:8006 | xargs kill -9 2>/dev/null || true

lsof -ti:5178 | xargs kill -9 2>/dev/null || true
 
# ── Ensure PostgreSQL is running ─────────────────────────────────────────────

echo "→ Starting PostgreSQL..."
 
cd "$ROOT/backend"
 
docker compose up -d db
 
until docker exec ims_db_leena pg_isready -U ims_user -d ims_db_leena -q 2>/dev/null; do

    sleep 1

done
 
echo "PostgreSQL ready"
 
# ── Backend ──────────────────────────────────────────────────────────────────

echo "→ Starting backend..."
 
cd "$ROOT/backend"
 
npm run dev >/tmp/ims-backend-leena.log 2>&1 &

BACKEND_PID=$!
 
for i in $(seq 1 20); do

    if curl -s http://127.0.0.1:8006/health >/dev/null 2>&1; then

        echo "Backend ready"

        break

    fi

    sleep 1

done
 
# ── Frontend ─────────────────────────────────────────────────────────────────

echo "→ Starting frontend..."
 
cd "$ROOT/frontend"
 
npm run dev >/tmp/ims-frontend-leena.log 2>&1 &

FRONTEND_PID=$!
 
sleep 3
 
echo ""

echo "═══════════════════════════════════════════════════════"

echo "Leena Development Environment"

echo ""

echo "Frontend : http://localhost:5178"

echo "Backend  : http://localhost:8006/api/v1"

echo "Health   : http://localhost:8006/health"

echo ""

echo "Production"

echo "https://investment-mgmt.twave.co.jp"

echo ""

echo "Logs"

echo "tail -f /tmp/ims-backend-leena.log"

echo "tail -f /tmp/ims-frontend-leena.log"

echo "═══════════════════════════════════════════════════════"
 
wait $BACKEND_PID $FRONTEND_PID
 