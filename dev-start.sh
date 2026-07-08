#!/usr/bin/env bash
# ── Thirdwave IMS — Start dev servers (background) ─────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Check setup
if [ ! -d "$ROOT/backend/node_modules" ] || [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "❌ Run 'bash setup.sh' first to install dependencies."
  exit 1
fi

# Kill previous instances
echo "🛑 Stopping previous instances..."
lsof -ti:8004 | xargs kill -9 2>/dev/null || true
lsof -ti:5176 | xargs kill -9 2>/dev/null || true
lsof -ti:5175 | xargs kill -9 2>/dev/null || true

# Start database
echo "📦 Starting PostgreSQL..."
cd "$ROOT/backend"
docker compose up -d db >/dev/null 2>&1
until docker exec ims_db3 pg_isready -U ims_user -d ims_db -q 2>/dev/null; do
  sleep 1
done
echo "   ✓ PostgreSQL ready"

# Start backend
echo "🔧 Starting backend (port 8004)..."
cd "$ROOT/backend"
npm run dev > /tmp/ims-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend health
for i in $(seq 1 15); do
  if curl -s http://127.0.0.1:8004/health > /dev/null 2>&1; then
    echo "   ✓ Backend ready"
    break
  fi
  sleep 1
done

# Start frontend
echo "⚡ Starting frontend (port 5176)..."
cd "$ROOT/frontend"
npm run dev > /tmp/ims-frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 2
echo "   ✓ Frontend ready"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  🌐 App:       http://localhost:5176"
echo "  🔌 API:       http://localhost:8004/api/v1"
echo "  💚 Health:    http://localhost:8004/health"
echo ""
echo "  👤 Login:     admin@thirdwave.co.jp / Admin123!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 Logs:"
echo "   tail -f /tmp/ims-backend.log"
echo "   tail -f /tmp/ims-frontend.log"
echo ""
echo "To stop: pkill -f 'npm run dev' && docker compose -f backend/docker-compose.yml down"
echo ""

# Keep process running
wait $BACKEND_PID $FRONTEND_PID
