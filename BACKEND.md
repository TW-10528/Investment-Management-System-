# IMS Backend — Technical Reference

> **Platform:** [Aviary Enterprise AI Platform](https://gray-flower-06d04521e.4.azurestaticapps.net/ja)
> Stack: **Hono + TypeScript + Prisma + PostgreSQL** (Aviary Hono Starter Kit v1.2.0 pattern)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | **Hono v4** (ultra-fast, edge-ready) |
| Runtime | **Node.js 20+** via `@hono/node-server` |
| Language | **TypeScript 5.7** |
| ORM | **Prisma 5** |
| Database | **PostgreSQL 16** (Docker) |
| Auth | **JWT** (HS256, 8-hour tokens) via `jsonwebtoken` |
| Passwords | **bcryptjs** (cost factor 12) |
| PDF Parsing | **pdf-parse** + custom regex extractor |
| Email / OTP | **nodemailer** (Office 365 / Gmail SMTP; dev-mode fallback) |
| FX Rates | **frankfurter.app** (live market); MUFG TTM manual entry |
| Rate Limiting | Custom in-memory limiter (mirrors original slowapi behaviour) |
| Decimal Math | **decimal.js** (exact Excel-formula replication) |
| Validation | **Zod** |
| Dev server | **tsx watch** (hot reload) |

---

## Project Layout (Aviary Hono Pattern)

```
backend/
├── src/
│   ├── main.ts                  ← Server bootstrap (serve + DB connect)
│   ├── app.ts                   ← Hono factory (middleware + route mount)
│   ├── config/
│   │   └── index.ts             ← Centralised env config loader
│   ├── lib/
│   │   ├── prisma.ts            ← Singleton Prisma client
│   │   └── security.ts         ← hashPassword, verifyPassword, JWT, OTP
│   ├── middleware/
│   │   ├── auth.ts              ← JWT Bearer middleware + role guards
│   │   └── rateLimit.ts        ← In-memory rate limiter middleware
│   ├── routes/
│   │   ├── auth.ts              ← /api/v1/auth/*
│   │   ├── users.ts             ← /api/v1/users/*
│   │   ├── funds.ts             ← /api/v1/funds/*
│   │   ├── capitalCalls.ts      ← /api/v1/capital-calls/*
│   │   ├── distributions.ts     ← /api/v1/distributions/*
│   │   ├── fxRates.ts           ← /api/v1/fx-rates/*
│   │   ├── dashboard.ts         ← /api/v1/dashboard/*
│   │   └── notices.ts           ← /api/v1/notices/*
│   └── services/
│       ├── calculationEngine.ts ← Excel B→H formula replication (decimal.js)
│       ├── pdfParser.ts         ← pdf-parse + regex extraction pipeline
│       ├── emailService.ts      ← nodemailer OTP + admin notifications
│       └── auditService.ts      ← logAction() to audit_logs table
├── prisma/
│   └── schema.prisma            ← Full Prisma schema (PostgreSQL)
├── docker-compose.yml           ← PostgreSQL 16 + Redis 7
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Quick Start

### 1. Start PostgreSQL (Docker)
```bash
cd backend
docker compose up -d
```

### 2. Install dependencies
```bash
npm install
# or: pnpm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, SECRET_KEY, etc.
```

### 4. Run Prisma migrations
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Start dev server
```bash
npm run dev
# → http://localhost:8001
# → http://localhost:8001/health
```

### Build for production
```bash
npm run build   # tsc → dist/
npm run start   # node dist/main.js
```

---

## Environment Variables (`.env`)

```env
# Server
PORT=8001
ENVIRONMENT=local

# PostgreSQL (matches docker-compose defaults)
DATABASE_URL="postgresql://ims_user:ims_password@localhost:5432/ims_db"

# JWT — generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SECRET_KEY=change-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=480

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174

# Email (blank = dev mode: OTP printed to console + returned in API response)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Thirdwave IMS <noreply@thirdwave.co.jp>
OTP_EXPIRE_MINUTES=10

# Login lockout
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_WINDOW_MINUTES=10
LOCKOUT_MINUTES=15

# Admin notification on self-registration
ADMIN_EMAIL=

# File uploads
UPLOAD_DIR=./uploads

# Misc
REVEAL_EMAIL_NOT_FOUND=true
```

---

## Authentication & Roles

### JWT Flow
1. `POST /api/v1/auth/login` (form-data or JSON: `username`, `password`)
2. Returns `access_token` (Bearer JWT, 8h expiry)
3. All protected routes: `Authorization: Bearer <token>`

### Role Hierarchy

| Role | Value | Access Level |
|------|-------|-------------|
| **Admin** | `admin` | Full access — user management, all CRUD, approve notices |
| **Finance Manager** | `finance_manager` | Edit — funds, capital calls, distributions, FX, notices |
| **Finance Staff** | `finance_staff` | Edit — same as Finance Manager |
| **Board Member** | `board_member` | **View only** |
| **User** | `user` | **View only** — default for self-registration |

### Login Security
- Failed attempts tracked in-memory per email (same as original Python implementation)
- After **5 failures** in 10 min → locked for **15 minutes**
- Rate limit: `10 req/min` on login, `5 req/min` on signup & forgot-password

### User Lifecycle
```
POST /auth/signup  → status = pending
        ↓
POST /users/:id/approve?role=finance_staff
        ↓
status = active  (can log in)
        ↓
DELETE /users/:id  → status = inactive
```
Hard cap: **max 10 active users**.

---

## API Reference

**Base URL:** `http://localhost:8001/api/v1`

---

### Auth — `/api/v1/auth`

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|-----------|-------------|
| `POST` | `/signup` | Public | 5/min | Self-register (role selected by user) |
| `POST` | `/login` | Public (form or JSON) | 10/min | Returns JWT |
| `GET`  | `/me` | Required | — | Current user info |
| `POST` | `/forgot-password` | Public | 5/min | Send OTP to email |
| `POST` | `/verify-otp` | Public | — | Validate OTP |
| `POST` | `/reset-password` | Public | — | Reset password with OTP |

**Login request** (form-urlencoded, same as OAuth2):
```
username=user@example.com&password=Secret123!
```
**Login response:**
```json
{ "access_token": "eyJ...", "token_type": "bearer", "role": "finance_staff", "name": "Leena", "email": "leena@example.com" }
```

---

### Funds — `/api/v1/funds`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | List active funds (with calculated metrics) |
| `GET`  | `/:id` | Fund detail + wire info |
| `GET`  | `/:id/ledger` | Excel-style transaction ledger + snapshot |
| `POST` | `/` | Create fund |
| `PUT`  | `/:id` | Update fund |
| `DELETE` | `/:id` | Soft-deactivate |

**Fund summary response fields:**
```json
{
  "fund_id": "uuid", "fund_name": "GS Vintage X",
  "commitment_usd": 10000000,
  "total_called_usd": 4500000,
  "total_received_usd": 800000,
  "drawn_pct": 45.0,
  "unfunded_usd": 5500000,
  "investment_capacity": 5700000,
  "net_cash_position": -3700000,
  "dpi": 0.1778
}
```

---

### Capital Calls — `/api/v1/capital-calls`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | List (filter: `?fund_id=&status=`) |
| `GET`  | `/:id` | Single call |
| `POST` | `/` | Create (set `initial_status: "paid"` for historical) |
| `PATCH` | `/:id/approve` | pending → approved |
| `PATCH` | `/:id/mark-paid` | approved → paid (triggers ledger) |

---

### Distributions — `/api/v1/distributions`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | List (filter: `?fund_id=`) |
| `POST` | `/` | Create |
| `DELETE` | `/:id` | Delete |

Distribution types: `Capital Return` · `Income` · `Recallable` · `Deemed`

---

### FX Rates — `/api/v1/fx-rates`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | All stored rates |
| `GET`  | `/latest` | Most recent stored rate |
| `GET`  | `/live` | Real-time from frankfurter.app |
| `GET`  | `/history?days=90` | Last N days |
| `POST` | `/` | Add MUFG TTM rate (upserts by date) |

---

### Dashboard — `/api/v1/dashboard`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/summary` | Full portfolio KPIs in one call |

**Response includes:**
```json
{
  "total_funds": 5,
  "total_commitment_usd": 50000000,
  "total_called_usd": 22500000,
  "total_received_usd": 4000000,
  "net_cash_position": -18500000,
  "drawn_pct": 45.0,
  "dry_powder_usd": 27500000,
  "dpi": 0.1778,
  "tvpi": 1.245,
  "total_nav_usd": 24000000,
  "pending_calls_count": 2,
  "overdue_calls_count": 1,
  "latest_fx_rate": 149.85,
  "fund_summaries": [...],
  "strategy_breakdown": [...],
  "distribution_breakdown": { "capital_return_usd": 2500000, "income_usd": 1500000, "total_usd": 4000000 },
  "nav_by_fund": [...],
  "recent_investments": [...]
}
```
> **New vs Python version:** Added `tvpi` (Total Value to Paid-In = (NAV + Distributions) / Paid-In).

---

### Users — `/api/v1/users` *(Admin only)*

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | All users |
| `GET`  | `/pending-count` | Count pending |
| `POST` | `/` | Admin creates user directly |
| `POST` | `/:id/approve?role=` | Approve + assign role |
| `POST` | `/:id/reject` | Reject registration |
| `PUT`  | `/:id` | Update user |
| `DELETE` | `/:id` | Deactivate |

---

### Notices (PDF) — `/api/v1/notices`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | List (filter: `?notice_type=&status=&fund_id=`) |
| `GET`  | `/pending-count` | Count pending |
| `GET`  | `/investments/recent?limit=8` | Recent investment targets |
| `GET`  | `/investments/all` | All investments |
| `GET`  | `/nav/latest` | Latest NAV per fund |
| `GET`  | `/:id` | Single notice |
| `POST` | `/upload` | Upload PDF → parse → extract |
| `POST` | `/:id/approve?fund_id=` | Approve: creates CF/NAV records |
| `POST` | `/:id/reject` | Reject |
| `PUT`  | `/:id/extracted` | Manually correct extracted data |

**Notice type → created records:**
```
capital_call notice    → CapitalCall + InvestmentTarget(s)
distribution notice    → Distribution
financial_statement    → NavRecord
```

---

## Calculation Engine

File: `src/services/calculationEngine.ts`

Exact TypeScript port of the Excel sheet formulas. Uses `decimal.js` for precision.

```
B  capitalPaidIn       (gross call wired OUT)
C  capitalReceived     (distributions IN)
D  reinvestable        (subset of C)
E  = prev_E + B        (cumulative called)
F  = prev_F - B + D    (investment capacity)
G  = -B + C            (cash flow per period)
H  = prev_H + G        (running NET cash position)
```

---

## Database Schema (Prisma / PostgreSQL)

| Table | Key Fields |
|-------|-----------|
| `users` | id, email, full_name, full_name_jp, role (enum), status (enum), is_active, last_login |
| `funds` | id, fund_name, fund_name_jp, manager, strategy, vintage_year, commitment_usd, entry_fx_rate, wire_* |
| `capital_calls` | id, fund_id, notice_date, due_date, gross_call_usd, net_call_usd, net_call_jpy, fx_rate, status (enum), paid_at |
| `distributions` | id, fund_id, distribution_date, dist_type, amount_usd, amount_jpy, reinvestable_usd, is_recallable |
| `fx_rates` | id, rate_date, usd_jpy, source |
| `nav_records` | id, fund_id, nav_date, nav_usd, period, source_notice_id |
| `investment_targets` | id, fund_id, project_name, amount_usd, sector, geography, investment_type |
| `notices` | id, filename, notice_type, status, fund_id, extracted_data (JSON), confidence, admin_notes |
| `audit_logs` | id, action, table_name, record_id, user_email, old_values, new_values |
| `otp_tokens` | id, email, token, expires_at, used |

---

## Aviary Platform — How This Backend Was Built

> Reference: [https://gray-flower-06d04521e.4.azurestaticapps.net/ja](https://gray-flower-06d04521e.4.azurestaticapps.net/ja)

This backend follows the **Aviary Hono Backend Starter Kit v1.2.0** patterns:

| Aviary Pattern | Implementation in IMS |
|---|---|
| `src/app.ts` factory | `src/app.ts` — Hono app with cors + logger + route mount |
| `src/main.ts` entry | `src/main.ts` — serve() + DB connect + bootstrap |
| `src/config/` env loader | `src/config/index.ts` — typed env accessor |
| `src/prisma/` client | `src/lib/prisma.ts` — singleton with global reuse |
| `src/middleware/auth.ts` | `src/middleware/auth.ts` — JWT Bearer verification |
| `src/routes/index.ts` | Routes registered in `app.ts` |
| `src/services/` business logic | `calculationEngine`, `pdfParser`, `emailService`, `auditService` |
| Prisma + PostgreSQL | `prisma/schema.prisma` — full schema with enums |
| `docker-compose.yml` | PostgreSQL 16 + Redis 7 |

**Future Aviary integrations possible:**
- **AI Gateway** — replace regex PDF extraction with LLM-assisted parsing
- **RAG Service** — natural language Q&A over fund documents
- **Queue Infrastructure** — async PDF processing instead of synchronous

---

## Frontend Connection

File: `frontend/src/services/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1'
```

Frontend `.env`:
```env
VITE_API_URL=http://localhost:8001/api/v1
```

The API contract is **100% compatible** with the original Python/FastAPI backend — all endpoints, methods, and JSON shapes are identical. No frontend changes required.

---

## Production Checklist

- [ ] Generate `SECRET_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Set `DATABASE_URL` to production PostgreSQL connection string
- [ ] Set `SMTP_USER` / `SMTP_PASSWORD` for real email
- [ ] Set `ADMIN_EMAIL` for new-user notifications
- [ ] Add production domain to `ALLOWED_ORIGINS`
- [ ] Set `ENVIRONMENT=production`
- [ ] Run `npx prisma migrate deploy` in production
- [ ] Mount `./uploads` as persistent volume
- [ ] Set up HTTPS reverse proxy (Nginx / Azure App Service / Caddy)
- [ ] Consider Redis session store for JWT revocation at scale

---

## Migration from Python/FastAPI

The original Python backend (`requirements.txt` + `app/`) is still present as reference. The Hono backend is fully independent at `src/`.

| Python (old) | Hono (new) |
|---|---|
| `uvicorn app.main:app` | `npm run dev` |
| `SQLAlchemy` / SQLite | `Prisma` / PostgreSQL |
| `python-jose` JWT | `jsonwebtoken` |
| `passlib` bcrypt | `bcryptjs` |
| `pdfplumber` | `pdf-parse` |
| `slowapi` rate limiter | Custom in-memory limiter |
| `alembic` migrations | `prisma migrate dev` |
