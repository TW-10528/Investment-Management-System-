#!/usr/bin/env bash
# ── Thirdwave IMS — First-time setup ─────────────────────────────────────────
# Run once after cloning: bash setup.sh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✔ $*${NC}"; }
warn() { echo -e "${YELLOW}  ! $*${NC}"; }
die()  { echo -e "${RED}  ✖ $*${NC}" >&2; exit 1; }
step() { echo -e "\n${BOLD}── $* ──${NC}"; }

echo -e "${BOLD}"
echo "  Thirdwave Investment Management System"
echo "  First-time setup"
echo -e "${NC}"

# ── 1. Check required tools ───────────────────────────────────────────────────
step "Checking prerequisites"

command -v node  >/dev/null 2>&1 || die "Node.js not found. Install from https://nodejs.org (v20+)"
command -v npm   >/dev/null 2>&1 || die "npm not found. Install Node.js from https://nodejs.org"
command -v docker>/dev/null 2>&1 || die "Docker not found. Install from https://docs.docker.com/get-docker/"

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
ok "Node.js $NODE_VER"
ok "npm $(npm --version)"
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ── 2. Backend .env ───────────────────────────────────────────────────────────
step "Backend environment"

cd "$ROOT/backend"
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created backend/.env from .env.example"
  warn "Review backend/.env and set SECRET_KEY, SMTP credentials, etc. before production use"
else
  ok "backend/.env already exists — skipping"
fi

# ── 3. Frontend .env ──────────────────────────────────────────────────────────
step "Frontend environment"

cd "$ROOT/frontend"
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
VITE_API_URL=/api/v1
VITE_APP_NAME=Investment Management System
VITE_APP_DESCRIPTION=Manage your investment funds and capital calls
ENVEOF
  ok "Created frontend/.env"
else
  ok "frontend/.env already exists — skipping"
fi

# ── 4. Start Postgres via Docker Compose ─────────────────────────────────────
step "Starting PostgreSQL (Docker)"

cd "$ROOT/backend"
docker compose up -d postgres
ok "PostgreSQL container started (ims_postgres → localhost:5435)"

# Wait for healthy
echo "  Waiting for PostgreSQL to be ready..."
MAX=30
COUNT=0
until docker exec ims_postgres pg_isready -U ims_user -d ims_db -q 2>/dev/null; do
  COUNT=$((COUNT+1))
  if [ $COUNT -ge $MAX ]; then
    die "PostgreSQL did not become ready after ${MAX}s. Check: docker logs ims_postgres"
  fi
  sleep 1
done
ok "PostgreSQL is ready"

# ── 5. Backend dependencies ───────────────────────────────────────────────────
step "Installing backend dependencies"

cd "$ROOT/backend"
npm install
ok "Backend node_modules installed"

# ── 6. Prisma: generate client + run migrations ───────────────────────────────
step "Database migrations"

npx prisma generate
ok "Prisma client generated"

npx prisma migrate deploy
ok "Migrations applied"

# ── 7. Seed ───────────────────────────────────────────────────────────────────
step "Seeding database"

npm run db:seed
ok "Database seeded with demo data"

# ── 8. Frontend dependencies ──────────────────────────────────────────────────
step "Installing frontend dependencies"

cd "$ROOT/frontend"
npm install
ok "Frontend node_modules installed"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo ""
echo "  Start the app:"
echo "    bash start.sh"
echo ""
echo "  Or manually:"
echo "    Terminal 1:  cd backend  && npm run dev"
echo "    Terminal 2:  cd frontend && npm run dev"
echo ""
echo "  Credentials:"
echo "    Admin:   admin@thirdwave.co.jp   / Admin123!"
echo "    Finance: finance@thirdwave.co.jp / Staff123!"
echo "    Board:   board@thirdwave.co.jp   / Staff123!"
echo ""
