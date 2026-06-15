# Thirdwave IMS — Quick Start Guide

## Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend  | **Hono v4** + TypeScript + Prisma + PostgreSQL |
| Auth     | JWT (8h) + bcrypt passwords |
| DB       | PostgreSQL 16 (via existing `postgres-db` Docker container, port **6000**) |

---

## 🚀 One-time Setup

### 1 — Backend

```bash
cd backend

# Install Node dependencies
npm install

# Configure environment (already pre-configured for local postgres-db container)
# DATABASE_URL points to localhost:6000 (existing postgres-db Docker container)
cat .env   # verify DATABASE_URL="postgresql://ims_user:ims_password@localhost:6000/ims_db"

# Create DB user & database (one-time, if not already done)
docker exec postgres-db psql -U postgres -c "CREATE USER ims_user WITH PASSWORD 'ims_password' CREATEDB;"
docker exec postgres-db psql -U postgres -c "CREATE DATABASE ims_db OWNER ims_user;"

# Run migrations
npx prisma migrate dev --name init

# Seed with demo data (3 funds, 4 capital calls, distributions, NAV, investments)
npm run db:seed

# Start dev server
npm run dev
# → http://localhost:8001
# → http://localhost:8001/health
```

### 2 — Frontend

```bash
cd frontend

# Install (one-time)
npm install

# Start dev server
npm run dev
# → http://localhost:5173
```

---

## 🔄 Daily Development Start

```bash
# Terminal 1 — Backend
cd ~/ims-project/backend && npm run dev

# Terminal 2 — Frontend
cd ~/ims-project/frontend && npm run dev
```

---

## 🔑 Demo Credentials (after seed)

| Role | Email | Password |
|------|-------|---------|
| Admin | admin@thirdwave.co.jp | Admin123! |
| Finance Manager | finance@thirdwave.co.jp | Staff123! |
| Board Member | board@thirdwave.co.jp | Staff123! |

---

## 📊 Demo Data (seeded)

### Funds
| Fund | Strategy | Commitment |
|------|----------|-----------|
| GS Vintage X | Buyout | $10M |
| BlackRock Credit Alt V | Credit | $5M |
| KKR Growth VIII | Growth | $8M |

### Portfolio KPIs (seeded state)
- **Total Commitment**: $23M
- **Paid-in**: $5.8M (25% drawn)
- **Distributions**: $870K
- **Total NAV**: $19.8M
- **DPI**: 0.15x
- **TVPI**: 3.56x
- **FX Rate**: ¥149.85/USD (latest MUFG TTM)

---

## 🏗 Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8001/api/v1 |
| Health check | http://localhost:8001/health |
| PostgreSQL | localhost:6000 (docker: postgres-db) |

---

## 🎯 Key Features

- **Advanced Dashboard** — TVPI, DPI gauges, portfolio health score, strategy allocation pie, deployment-by-fund chart
- **Role-Based Access** — Admin/Finance can edit; Board Member/User are view-only
- **5-language i18n** — EN, JA, ZH, TL, KO across all pages
- **Dark Mode** — theme-* CSS variables throughout
- **PDF Notices** — Upload GP notice PDFs → auto-extract → admin approve → creates CF records
- **Calculation Engine** — Excel B→H formula replication with decimal.js precision
- **OTP Password Reset** — dev mode prints code to console; configure SMTP for production

---

## 🗃 Prisma Schema Models

`users` · `funds` · `capital_calls` · `distributions` · `fx_rates` · `nav_records` · `investment_targets` · `notices` · `audit_logs` · `otp_tokens`

---

## 🏭 Production Checklist

- [ ] `SECRET_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] `DATABASE_URL`: set to production PostgreSQL
- [ ] `SMTP_USER` / `SMTP_PASSWORD`: configure for real email
- [ ] `ALLOWED_ORIGINS`: add production domain
- [ ] `ENVIRONMENT=production`
- [ ] `npx prisma migrate deploy`
- [ ] Mount `./uploads` as persistent volume
- [ ] HTTPS reverse proxy (Nginx / Azure App Service / Caddy)
