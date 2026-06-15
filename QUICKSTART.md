# Thirdwave IMS — Quick Start

## Prerequisites

| Tool | Minimum version | Install |
|------|-----------------|---------|
| Node.js | 20 | https://nodejs.org |
| npm | 10 | (bundled with Node) |
| Docker Desktop | any | https://docs.docker.com/get-docker/ |

---

## First-time setup (clone → running in one command)

```bash
git clone <repo-url>
cd inv
bash setup.sh
```

`setup.sh` handles everything automatically:
1. Copies `backend/.env.example` → `backend/.env`
2. Starts PostgreSQL via Docker Compose (`localhost:5435`)
3. Installs `npm` dependencies for backend and frontend
4. Runs Prisma migrations (`prisma migrate deploy`)
5. Seeds the database with demo users and fund data

Then start the app:

```bash
bash start.sh
```

---

## Daily development

```bash
bash start.sh
```

Or manually in two terminals:

```bash
# Terminal 1
cd backend && npm run dev      # Hono API → http://localhost:8003

# Terminal 2
cd frontend && npm run dev     # Vite → http://localhost:5173
```

---

## Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@thirdwave.co.jp | Admin123! |
| Finance Manager | finance@thirdwave.co.jp | Staff123! |
| Board Member | board@thirdwave.co.jp | Staff123! |

---

## Services

| Service | URL |
|---------|-----|
| App | http://localhost:5173 |
| API | http://localhost:8003/api/v1 |
| Health | http://localhost:8003/health |
| PostgreSQL | localhost:5435 (container: `ims_postgres`) |

---

## Database commands

```bash
cd backend

npm run db:seed      # Re-seed with demo data (wipes existing data)
npm run db:migrate   # Create a new migration after schema changes
npm run db:reset     # Drop everything and re-migrate + re-seed
npx prisma studio    # Open GUI to browse the database
```

---

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + Tailwind CSS |
| Backend | Hono v4 + TypeScript + Node.js |
| ORM | Prisma 5 + PostgreSQL 16 |
| Auth | JWT (8h) + bcrypt |
| Infrastructure | Docker Compose (Postgres + Redis) |

---

## Troubleshooting

**401 on login** — the database is empty. Run `cd backend && npm run db:seed`.

**`Cannot find module` / TypeScript errors** — run `npm install` in the relevant directory.

**Port 8003 or 5173 already in use** — `start.sh` kills previous processes automatically; or run `lsof -ti:8003 | xargs kill -9`.

**PostgreSQL not reachable** — `cd backend && docker compose up -d postgres`, then wait ~5s.

**Schema out of date after a `git pull`** — `cd backend && npx prisma migrate deploy && npx prisma generate`.

---

## Production checklist

- [ ] Generate a real secret key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`  → set `SECRET_KEY` in `.env`
- [ ] Set `DATABASE_URL` to your production PostgreSQL
- [ ] Set `SMTP_USER` / `SMTP_PASSWORD` for email (OTP reset)
- [ ] Set `ALLOWED_ORIGINS` to your production domain
- [ ] Set `ENVIRONMENT=production`
- [ ] Run `npx prisma migrate deploy` (not `migrate dev`)
- [ ] Mount `./uploads` as a persistent volume
- [ ] Put a TLS-terminating reverse proxy in front (Nginx, Caddy, Azure App Service)
