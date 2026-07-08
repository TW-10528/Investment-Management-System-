# Investment Management System — Workflow Documentation

---

## Project Overview

**Thirdwave IMS** is a web-based Investment Management System for managing private equity funds, capital calls, distributions, and FX rates.

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Hono + TypeScript + Prisma + PostgreSQL |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Charts | Recharts |
| Auth | JWT |

### Core Features
- Fund management (Buyout, Growth, Venture, Real Estate, Infrastructure, etc.)
- Capital calls workflow (Create → Approve → Mark Paid)
- Distributions tracking
- FX rates (USD/JPY) with monthly history
- PDF upload & fund report parsing
- Dashboard with portfolio analytics
- Multi-language support (EN, JA, KO, TL, ZH)
- Rules engine, calculator, notices

---

## My Code Changes (Working-Branch2)

### Commits
| Commit | Message |
|--------|---------|
| `308e1f5` | feat: updated edit field, date changes and forex |
| `364c097` | feat: MURC-only FX rates, monthly history chart, ledger date editing |
| `c8553f5` | Fix .gitignore: separate *.env and backend/node_modules lines |

### Backend
- **Capula GRV parser** — new fund parser (`extractor.ts`, `index.ts`, `types.ts`)
- **Goldman Sachs parser** — refactored from single file into folder structure
- **Siguler Guff parser** — refactored from single file into folder structure
- **FX Rates** — added MURC-only FX rates API (`fx-rates.routes.ts`)
- **Fund Reports** — updated report endpoints (`fund-reports.routes.ts`)
- **Parser detector & resolver** — updated to support new parsers
- **seed.ts** — cleaned up seed data

### Frontend
- **FxRates page** — reworked layout, added monthly history chart
- **FundManagement page** — major UI improvements, ledger date editing
- **Dashboard** — monthly history chart added
- **FundDocuments** — updated documents UI
- **FundUploadBar** — updated upload bar
- **i18n** — updated all locale files (EN, JA, KO, TL, ZH)
- **api.ts** — added new API calls for FX and fund reports

---

## Git Workflow

### Branches
| Branch | Owner | Purpose |
|--------|-------|---------|
| `Working-Branch2` | Me | My feature work |
| `Working-Branch` | Friend | Her feature work |
| `Copyofhaif` | Me | Backup of my Working-Branch2 |
| `main` | Both | Production |

---

### Step 1 — Commit & push my changes
```bash
git add .
git commit -m "feat: update fund parsers, documents UI and routes"
git push origin Working-Branch2
```

### Step 2 — Create backup branch
```bash
git checkout -b Copyofhaif
git push origin Copyofhaif
```

### Step 3 — Friend commits and pushes her work
She runs:
```bash
git add .
git commit -m "her commit message"
git push origin Working-Branch
```

### Step 4 — I merge my branch into her branch
```bash
git checkout Working-Branch
git pull origin Working-Branch
git merge Working-Branch2
git push origin Working-Branch
```

### Step 5 — Final merge to main
```bash
git checkout main
git pull origin main
git merge Working-Branch
git push origin main
```

---

## Branch State Notes
- `Working-Branch2` was **ahead** of `Working-Branch` by 3 commits
- `Working-Branch` had **no unique commits** — direct ancestor of `Working-Branch2`
- Merging `Working-Branch2` into `Working-Branch` is a **fast-forward** (no conflicts expected)
- `Copyofhaif` is a **safe backup** of `Working-Branch2`
- Steps 3–5 are **pending** — waiting for friend to push her changes
