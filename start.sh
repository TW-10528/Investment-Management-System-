#!/usr/bin/env bash
# ── Thirdwave IMS — Local Development Startup ────────────────────────────────
# Run from Git Bash (MINGW64) on Windows.
# Opens a new CMD window for the backend and frontend so logs stay separate.
#
# Requirements:
#   Docker Desktop (running)     — for PostgreSQL
#   Node.js 18+                  — for backend & frontend
#   Ollama (optional)            — for AI field extraction
#     winget install Ollama.Ollama && ollama pull llama3.2
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

# Windows backslash paths for PowerShell WorkingDirectory
BACKEND_WIN=$(cygpath -w "$BACKEND")
FRONTEND_WIN=$(cygpath -w "$FRONTEND")

echo ""
echo "================================================"
echo "   Thirdwave IMS  —  Local Dev Startup"
echo "================================================"
echo ""

# ── 1. Free up ports ──────────────────────────────────────────────────────────
echo "[1/5] Freeing ports 8001 and 5173..."
powershell -NoProfile -Command "
  @(8001, 5173) | ForEach-Object {
    \$port = \$_
    \$found = netstat -ano | Select-String \":\$port\s\"
    foreach (\$line in \$found) {
      \$pid = (\$line.ToString().Trim() -split '\s+')[-1]
      if (\$pid -match '^\d+\$' -and \$pid -ne '0') {
        Stop-Process -Id ([int]\$pid) -Force -ErrorAction SilentlyContinue
      }
    }
  }
" 2>/dev/null || true

# ── 2. PostgreSQL via Docker ──────────────────────────────────────────────────
echo "[2/5] Starting PostgreSQL (Docker)..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

echo "      Waiting for database..."
for i in $(seq 1 30); do
  docker exec ims_db pg_isready -U ims_user -d ims_db > /dev/null 2>&1 && break
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "  ERROR: Database not ready after 30s. Check: docker logs ims_db"
    exit 1
  fi
done
echo "      Database ready."

# ── 3. Install dependencies if missing ───────────────────────────────────────
echo "[3/5] Checking dependencies..."
if [ ! -d "$BACKEND/node_modules" ]; then
  echo "      Installing backend packages..."
  (cd "$BACKEND" && npm install --silent)
fi
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "      Installing frontend packages..."
  (cd "$FRONTEND" && npm install --silent)
fi

# ── 4. Apply DB migrations (non-interactive, safe to re-run) ─────────────────
echo "[4/5] Applying database migrations..."
(cd "$BACKEND" && npx dotenv -e .env -- npx prisma migrate deploy 2>&1 \
  | grep -E "Applied|already|No pending|error|Error" || true)

# ── 5. Open backend + frontend in separate CMD windows ───────────────────────
# Use PowerShell Start-Process: sets WorkingDirectory cleanly without
# the quoting issues that plague `cmd //c start "title" ...` from Git Bash.
echo "[5/5] Launching backend and frontend..."

powershell -NoProfile -Command "
  Start-Process -FilePath 'cmd.exe' \
    -ArgumentList '/k npm run dev' \
    -WorkingDirectory '$BACKEND_WIN' \
    -WindowStyle Normal
"
sleep 1
powershell -NoProfile -Command "
  Start-Process -FilePath 'cmd.exe' \
    -ArgumentList '/k npm run dev' \
    -WorkingDirectory '$FRONTEND_WIN' \
    -WindowStyle Normal
"

echo ""
echo "================================================"
echo "   Frontend  →  http://localhost:5173"
echo "   Backend   →  http://localhost:8001"
echo ""
echo "   AI extraction requires Ollama:"
echo "     winget install Ollama.Ollama"
echo "     ollama pull llama3.2"
echo "   (Runs as a Windows service after install)"
echo "================================================"
echo ""
