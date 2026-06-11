# Thirdwave IMS — Project Summary

_Investment Management System for private-fund commitments, capital calls, distributions, and NAV tracking._

Last updated: **June 2026**

---

## 1. Tech Stack & Architecture

| Layer | Technology |
|-------|-----------|
| **Backend** | Hono + TypeScript (migrated from FastAPI/Python) |
| **ORM / DB** | Prisma + PostgreSQL (`postgres-db` Docker container, port **6000**) |
| **Frontend** | React + TypeScript (Vite) |
| **PDF parsing** | `pdf-parse` for text PDFs; `tesseract.js` (jpn+eng) OCR fallback for scanned PDFs |
| **Excel export** | `xlsx` |

**Run:**
- Backend: `cd backend && npm run dev` (port **8001**, `tsx watch src/main.ts`)
- Seed DB: `npm run db:seed`
- DB URL: `postgresql://ims_user:ims_password@localhost:6000/ims_db`

**Demo credentials:**
- `admin@thirdwave.co.jp` / `Admin123!`
- `finance@thirdwave.co.jp` / `Staff123!`
- `board@thirdwave.co.jp` / `Staff123!`

---

## 2. Backend Migration (FastAPI → Hono) — ✅ Complete

The entire backend was rewritten from Python/FastAPI to **Hono + TypeScript + Prisma**, following Aviary Enterprise Platform patterns. Modules under `backend/src/modules/`:

`auth`, `users`, `funds`, `capital-calls`, `distributions`, `fund-reports`, `notices`, `nav` (via funds), `fx-rates`, `dashboard`, `rules`, `notifications`.

**Prisma models:** `User`, `Fund`, `Commitment`, `CapitalCall`, `Distribution`, `FxRate`, `NavRecord`, `InvestmentTarget`, `Notice`, `FundReport`, `SigfSnapshot`, `AuditLog`, `OtpToken`, `CalculationRule`, `AttributeExtractor`, `CalculationResult`, `Notification`.
(DB is **`prisma db push`-managed**, not migration-managed.)

---

## 3. Core Features

### 3.1 Authentication & RBAC
- Login / Signup / Forgot-password (OTP tokens).
- Roles with view-only gating (`board_member`, `CEO` get a "View only" badge).
- Admin email notification when a new user self-registers (pending approval).

### 3.2 Dashboard
- **TVPI / DPI** performance multiple gauges with visual bars.
- **Portfolio Health Score** (0–100).
- **Deployment by Fund** horizontal stacked bar chart.
- **Overdue calls** alert banner (sorted oldest-first).
- Commitment + FX panels; per-fund Paid-in (¥) / Distributed (¥) columns.
- Live `tvpi`, `dpi`, `total_nav_usd`, dry-powder, distribution breakdown.
- Auto-refreshes every 30s.

### 3.3 PDF Notice Processing (the heart of the system)
- Upload a GP notice PDF → **auto-detect fund → auto-parse → auto-create ledger row** (no admin approval step).
- Document types routed at upload: **Capital Call**, **Distribution**, **Capital & Distribution**, **Financial Statement**.
  - `capital_call` → one CapitalCall (B), cash flow −B.
  - `distribution` → one Distribution (C).
  - `capital_and_distribution` → both rows (net −B+C).
  - `financial_statement` → document only (NAV added manually).
- Ledger columns: **B** (call), **C** (distribution), **D** (reinvestable), **E** (cumulative called), **F** (remaining/unfunded), **G** (cash flow), **H** (cumulative cash flow), plus ROC / Gain / Interest and JPY columns.
- **G is a manual override** (`manual_cash_flow_usd`); blank = auto −B+C, with amber "M" marker.
- Records created in a single `prisma.$transaction`; **delete reverses** the record + file + notice and recalculates.
- PDFs stored per-fund in `uploads/<fund>/`.

### 3.4 OCR (for scanned PDFs)
- `backend/src/services/ocr/pdfOcr.ts` — pure-Node OCR (`tesseract.js` jpn+eng + `pdf-to-png-converter`), used as fallback when text < 40 chars.
- Tuned for Japanese scanned notices: viewportScale **4.0**, PSM **11** (sparse text); handles circled/fullwidth digit artifacts.
- Adds ~8–17s per scanned upload.

### 3.5 Rules Engine
- **Calculation Rules** — user-defined formulas (`CalculationRule`), safe arithmetic eval, results per notice (`CalculationResult`), dashboard widgets, **Excel export** (xlsx).
- **Keyword Extractors** (`AttributeExtractor`) — keyword-anchored PDF field extraction with test-on-notice.
- Frontend `RulesEngine.tsx` (two tabs); results cards on Dashboard.

### 3.6 FX Rates
- MURC-only FX rates; monthly history chart; JPY funds skip conversion.

### 3.7 Funds Page (master-detail)
- Grid of `FundCard`s → click → full `FundSection` (KPIs + tabs: Ledger, Capital Calls, Distributions, NAV, Documents).
- Shared upload bar (two-step: type → fund → drop PDF).
- The standalone **Notices page was removed** from the UI (do not re-add).

---

## 4. Supported Funds (8 total)

Each "rich" fund has its own parser folder under `backend/src/services/fundParsers/<fund>/` (`types.ts`, `extractor.ts` = faithful Python port, `index.ts`), wired into detector, fund-resolver, dispatch, `fundReport` union, upload re-parse, and the frontend rich-report panel.

| # | Fund | Currency | Notes |
|---|------|----------|-------|
| 1 | **Goldman Sachs** (Vintage X Flagship Offshore SCSp) | USD | |
| 2 | **Siguler Guff** | USD | |
| 3 | **NB Real Estate** (Secondary Opportunities Offshore II) | USD | Combined capital-call + deemed-distribution in one PDF; rich report with ROC/Gain/Interest |
| 4 | **Hamilton Lane Secondary Fund VI-B** | USD | Separate call OR distribution notices |
| 5 | **Hamilton Lane Strategic Opportunities IX-B** | USD | Most complex; net-capital-call & return-of-unused-capital → `capital_and_distribution`; B can be negative |
| 6 | **Dover Street XI Feeder** (HarbourVest) | USD | Initial-contribution / cash-dist / capital-call-and-deemed-dist; D always 0 |
| 7 | **SDG LPS** (SDGs 投資事業有限責任組合) | **JPY** | Japanese fund, no FX; OCR for scanned notices; continuous chain with growing commitment (1B→2B→3B) |
| 8 | **Capula GRV** | USD | Added via Working-Branch2 merge (`uploads/capula grv/`) |

**Notable parser fixes:**
- **NBSP extraction fix** (Dover): a broken `\xa0`→space port made E/F/commitment null; fixed `normalizeText` to collapse all Unicode spaces + strict thousands-grouping. (Same no-op still latent in hamilton-strategic — apply the fix there if its fields read null.)

---

## 5. Commitments Feature (built, then UI removed)
- Backend supports per-commitment sub-groups inside a fund (`Commitment` model + nullable `commitmentId`), with independent ledgers and `/funds/:id/commitments*` routes.
- **The commitment UI was removed** at the user's request — SDG's authoritative spec is one continuous fund-level chain, not independent sub-buckets. Backend stays dormant/harmless.

---

## 6. Known Caveats
- Cumulative E/F reflect only uploaded notices, not pre-upload inception-to-date history — upload all prior calls in date order.
- JPY = USD×fx double-converts for the JPY-native SDG fund (its USD field already holds yen).
- `goldman-sachs.ts` / `siguler-guff.ts` / `.env` occasionally disappear from the working tree (IDE/WSL sync) — restore via `git restore`/`git checkout --`.
- `tsx watch` can spawn duplicate watchers → `EADDRINUSE :8001` / stale code; after a batch of edits, kill watchers and run one clean `npm run dev`.

---

## 7. Git History (high level)
```
overall 8 funds
Merge Working-Branch2: add Goldman/Siguler/Capula funds + Branch2 features
Update fund parsers, ledger UI, and remove legacy funds
feat: updated edit field, date changes and forex
feat: MURC-only FX rates, monthly history chart, ledger date editing
Add NB Real Estate fund parsers, fund documents UI
Add rules engine, PDF upload, calculator, notifications
Initial project commit
```
