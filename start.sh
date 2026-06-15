#!/bin/bash
# ── Thirdwave IMS — Start Script ──────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🏦 Thirdwave Investment Management System"
echo ""

# ── Kill old processes ──────────────────────────────────────────────────────
echo "→ Stopping any previous instances..."
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

# ── Backend ─────────────────────────────────────────────────────────────────
echo "→ Starting backend (FastAPI on port 8001)..."
cd "$ROOT/backend"
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8001 > /tmp/ims-backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend to start
for i in $(seq 1 10); do
    if curl -s http://127.0.0.1:8001/health > /dev/null 2>&1; then
        echo "  ✅ Backend ready"
        break
    fi
    sleep 1
done

# ── Frontend ────────────────────────────────────────────────────────────────
echo "→ Starting frontend (Vite on port 5173)..."
cd "$ROOT/frontend"
npm run dev -- --port 5173 > /tmp/ims-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"
sleep 3

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  🌐 App:     http://localhost:5173"
echo "  📡 API:     http://localhost:8001"
echo "  📚 API Docs: http://localhost:8001/docs"
echo ""
echo "  Login: admin@thirdwave.co.jp / admin123"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Logs: /tmp/ims-backend.log | /tmp/ims-frontend.log"
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for either to exit
wait $BACKEND_PID $FRONTEND_PID
