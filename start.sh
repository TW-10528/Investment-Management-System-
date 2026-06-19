#!/usr/bin/env bash
# ── Thirdwave IMS — Start dev servers ────────────────────────────────────────
# First time? Run: bash setup.sh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Thirdwave Investment Management System"
echo ""

# ── Guard: check setup has been run ──────────────────────────────────────────
if [ ! -d "$ROOT/backend/node_modules" ] || [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "  Run 'bash setup.sh' first to install dependencies."
  exit 1
fi

# ── Kill previous instances ───────────────────────────────────────────────────
echo "→ Stopping any previous instances..."
lsof -ti:8005 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true

# ── Ensure Postgres is running ────────────────────────────────────────────────
echo "→ Ensuring PostgreSQL is running..."
cd "$ROOT/backend"
docker compose up -d db >/dev/null 2>&1
until docker exec ims_db3 pg_isready -U ims_user -d ims_db -q 2>/dev/null; do
  sleep 1
done
echo "  PostgreSQL ready"

# ── Backend (Hono + Node) ─────────────────────────────────────────────────────
echo "→ Starting backend (Hono on port 8005)..."
cd "$ROOT/backend"
npm run dev > /tmp/ims-backend3.log 2>&1 &
BACKEND_PID=$!

for i in $(seq 1 15); do
  if curl -s http://127.0.0.1:8005/health > /dev/null 2>&1; then
    echo "  Backend ready (PID $BACKEND_PID)"
    break
  fi
  sleep 1
done

# ── Frontend (Vite) ───────────────────────────────────────────────────────────
echo "→ Starting frontend (Vite on port 5174)..."
cd "$ROOT/frontend"
npm run dev -- --port 5174 > /tmp/ims-frontend3.log 2>&1 &
FRONTEND_PID=$!
sleep 3

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  App:      http://localhost:5174"
echo "  API:      http://localhost:8005/api/v1"
echo "  Health:   http://localhost:8005/health"
echo ""
echo "  Admin:    admin@thirdwave.co.jp  / Admin123!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Logs: tail -f /tmp/ims-backend3.log"
echo "      tail -f /tmp/ims-frontend3.log"
echo "Press Ctrl+C to stop"
echo ""

wait $BACKEND_PID $FRONTEND_PID
