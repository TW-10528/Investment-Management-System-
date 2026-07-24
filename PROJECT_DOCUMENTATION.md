# Investment Management System - Complete Project Documentation

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Database Schema](#database-schema)
4. [Data Flow](#data-flow)
5. [Core Calculations](#core-calculations)
6. [SDG Fund Special Handling](#sdg-fund-special-handling)
7. [Frontend Logic](#frontend-logic)
8. [API Endpoints](#api-endpoints)
9. [Key Features](#key-features)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│  - Dashboard: Overview of all funds                          │
│  - FundDetail: Detailed ledger for individual fund           │
│  - Capital Calls & Distributions management                  │
│  - Authentication (Login/Logout)                             │
└──────────────────────────────────────────────────────────────┘
                            ↓ API Calls
┌──────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js/Express)                   │
│  - Funds Routes: GET /funds, GET /funds/:id, POST /funds     │
│  - Ledger Routes: GET /funds/:id/ledger                      │
│  - Capital Call Routes: POST/GET capital calls               │
│  - Commitment History: GET/POST commitment changes           │
│  - CalculationEngine: Computes snapshots & ledger rows       │
└──────────────────────────────────────────────────────────────┘
                            ↓ Queries
┌──────────────────────────────────────────────────────────────┐
│              DATABASE (PostgreSQL 16)                         │
│  - users, funds, capital_calls, distributions                │
│  - commitment_history, fx_rates                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router
- **Styling**: Tailwind CSS
- **Math**: Decimal.js (precise financial calculations)
- **State Management**: React hooks (useState, useEffect)

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL 16
- **Math**: Decimal.js
- **Authentication**: JWT tokens (stored in localStorage on frontend)

### Database
- **Engine**: PostgreSQL 16 (Alpine Docker image)
- **Port**: 5432 (internal), 6002 (external mapping)

### Infrastructure
- **Containerization**: Docker Compose
- **Services**: ims_db, ims_backend, ims_frontend, ims_redis_leena

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50),           -- 'admin', 'user', etc.
  status VARCHAR(50),         -- 'active', 'inactive'
  created_at TIMESTAMP
);
```
**Purpose**: Authentication & authorization

### Funds Table
```sql
CREATE TABLE funds (
  id UUID PRIMARY KEY,
  fund_name VARCHAR(255),              -- "SDGs投資事業有限責任組合"
  fund_name_jp VARCHAR(255),
  manager VARCHAR(255),
  administrator VARCHAR(255),
  strategy VARCHAR(100),               -- "Development", "Vintage 2024", etc.
  currency VARCHAR(10),                -- "JPY", "USD"
  
  -- USD commitment (for non-SDG funds)
  commitment_usd DECIMAL(18,2),
  
  -- JPY commitment (for SDG funds only)
  commitment_jpy DECIMAL(18,2),
  contract_commitment_jpy DECIMAL(18,2),
  
  -- FX rates at entry
  entry_fx_rate DECIMAL(8,2),
  
  -- Fund details
  vintage_year INT,
  contract_date DATE,
  investment_period_start DATE,
  investment_period_end DATE,
  fund_term_years INT,
  management_fee_pct DECIMAL(5,2),
  carry_pct DECIMAL(5,2),
  hurdle_rate_pct DECIMAL(5,2),
  
  -- Wire transfer info
  wire_bank VARCHAR(255),
  wire_account_name VARCHAR(255),
  wire_account_number VARCHAR(255),
  wire_aba VARCHAR(50),
  wire_swift VARCHAR(50),
  wire_reference VARCHAR(255),
  
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```
**Purpose**: Core fund information storage

### Capital Calls Table
```sql
CREATE TABLE capital_calls (
  id UUID PRIMARY KEY,
  fund_id UUID REFERENCES funds(id),
  call_number INT,                    -- 1st call, 2nd call, etc.
  call_date DATE,
  amount_usd DECIMAL(18,2),           -- Original currency amount
  amount_jpy DECIMAL(18,2),           -- JPY equivalent (for SDG)
  fx_rate DECIMAL(8,2),               -- Rate used for conversion
  status VARCHAR(50),                 -- 'pending', 'approved', 'paid'
  due_date DATE,
  wire_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```
**Purpose**: Track capital calls (money requested from LP)

### Distributions Table
```sql
CREATE TABLE distributions (
  id UUID PRIMARY KEY,
  fund_id UUID REFERENCES funds(id),
  distribution_date DATE,
  amount_usd DECIMAL(18,2),
  amount_jpy DECIMAL(18,2),
  type VARCHAR(50),                   -- 'income', 'return_of_capital', 'gain'
  wire_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```
**Purpose**: Track distributions (money returned to LP)

### Commitment History Table
```sql
CREATE TABLE commitment_history (
  id UUID PRIMARY KEY,
  fund_id UUID REFERENCES funds(id),
  effective_date DATE,
  commitment_amount DECIMAL(18,2),    -- JPY for SDG, USD otherwise
  notes TEXT,
  created_at TIMESTAMP
);
```
**Purpose**: Track commitment changes over time

### FX Rates Table
```sql
CREATE TABLE fx_rates (
  id UUID PRIMARY KEY,
  currency_pair VARCHAR(10),          -- 'USD_JPY'
  rate DECIMAL(8,4),
  effective_date DATE,
  created_at TIMESTAMP
);
```
**Purpose**: Store historical FX rates for currency conversion

---

## Data Flow

### 1. Fund Detail Page Load Flow

```
User navigates to /funds/:id
        ↓
FundDetail.tsx useEffect triggers
        ↓
3 parallel API calls:
  1. fundsAPI.get(id)              → Backend GET /funds/:id
  2. fundsAPI.ledger(id)           → Backend GET /funds/:id/ledger
  3. fxRatesAPI.latest()           → Backend GET /fx-rates/latest
        ↓
Backend Responses:
  1. Fund object with all details
  2. Ledger: { rows: [...], snapshot: {...} }
  3. Latest FX rate (USD/JPY)
        ↓
Frontend setState:
  - setFund(fund)
  - setRows(ledger.rows)
  - setSnap(ledger.snapshot)
  - setLatestFx(fx.usd_jpy)
        ↓
Component re-renders with data
        ↓
Snapshot Metrics Displayed (6 cards)
Ledger Table Displayed (with rows)
```

### 2. Backend Ledger Calculation Flow

```
GET /funds/:id/ledger
        ↓
1. Fetch fund from DB
        ↓
2. Detect fund type:
   - isSdg = /sdg/i.test(fund.fund_name)
   - Determines which currency to use
        ↓
3. Fetch all ledger transactions:
   - Capital calls
   - Distributions
   - Sort by date
        ↓
4. CalculationEngine.calculate(txs, fund):
   - Iterate through each transaction
   - Maintain running totals:
     * cumulative_called (column E)
     * cumulative_received
     * investment_capacity (column F)
     * net_cash_position (column H)
   - Calculate each row's values
   - Generate final snapshot
        ↓
5. Return:
   {
     rows: [row1, row2, ...],     // Detailed ledger rows
     snapshot: {                   // Summary snapshot
       commitment_jpy/usd,
       total_called_jpy/usd,
       total_received_jpy/usd,
       unfunded_jpy/usd,
       drawn_pct,
       dpi,
       net_cash_position,
       investment_capacity
     }
   }
```

---

## Core Calculations

### A. Fund Commitment & Drawdown

**Commitment**: Total amount LP has committed to the fund
- **USD Funds**: `commitment_usd` (from funds table)
- **JPY Funds**: `commitment_jpy` (from funds table)

**Paid-In (E - Cumulative Called)**: Total capital called from LP
```
E(t) = E(t-1) + B(t)

Where:
  E(t) = Cumulative called at time t
  B(t) = Capital called in this transaction
  
For SDG funds:
  E = sum of all capital_jpy from capital_calls
```

**Example**:
```
Capital Call #1: ¥45,765,318  → E = ¥45,765,318
Capital Call #2: ¥541,576,404 → E = ¥587,341,722
Capital Call #3: ¥735,199,442 → E = ¥1,322,541,164
```

### B. Dry Powder (F - Investment Capacity)

**Formula**:
```
F(t) = Commitment - Cumulative Called(t)
     = A - E(t)

Where:
  A = Commitment (Column A)
  E = Cumulative Called (Column E)
  F = Dry Powder / Investment Capacity
```

**Example for SDG Fund**:
```
Commitment (A)      = ¥3,000,000,000
Last Cumulative(E)  = ¥2,020,118,000
Dry Powder (F)      = ¥3,000,000,000 - ¥2,020,118,000
                    = ¥979,882,000
```

**Display**: Shown as "DRY POWDER (F)" in metric cards

### C. Drawn Percentage

**Formula**:
```
Drawn % = (Cumulative Called / Commitment) × 100%
        = (E / A) × 100%
```

**Example**:
```
E = ¥2,020,118,000
A = ¥3,000,000,000
Drawn % = (2,020,118,000 / 3,000,000,000) × 100%
        = 67.34%
```

### D. Cumulative Received

**Formula**:
```
C(t) = C(t-1) + capital_received(t)

Tracks total money received from fund
```

### E. DPI (Distributed to Paid-In)

**Formula**:
```
DPI = Total Distributions / Total Capital Called
    = ∑Distributions / E(final)

Measures return relative to cash invested
DPI = 1.0x means got back exactly what was paid
DPI = 1.5x means got back 50% more than paid
```

**Example**:
```
Total Received = ¥95,565,400
Total Called   = ¥2,020,118,000
DPI = 95,565,400 / 2,020,118,000 = 0.047x
```

### F. Net Cash Position (H)

**Formula**:
```
H(t) = H(t-1) + G(t)

Where:
  G(t) = Cash Flow in period t
  G(t) = C(t) - B(t)
       = (Received - Called)
  
  H = Running cumulative cash position
```

**Example**:
```
Capital Call:       B = -¥45,765,318 (outflow)
Distribution:       C = +¥59,527,840 (inflow)
Cash Flow:          G = ¥59,527,840 - ¥45,765,318 = ¥13,762,522
Net Cash Position:  H increases by ¥13,762,522
```

---

## SDG Fund Special Handling

### 1. Fund Detection

**Location**: Multiple places in code
```typescript
const isSdg = fund && /sdg/i.test(fund.fund_name ?? '');
```

**Triggers**: If fund name contains "sdg" (case-insensitive)
- "SDGs投資事業有限責任組合" → **isSdg = true**
- "Other Fund USD" → isSdg = false

### 2. Currency Fields in Database

**SDG Funds (JPY only)**:
- commitment_jpy
- total_called_jpy
- total_received_jpy
- unfunded_jpy

**Regular Funds (USD)**:
- commitment_usd
- total_called_usd
- total_received_usd
- unfunded_usd

### 3. Backend Snapshot Response

**For SDG Fund**:
```javascript
snapshot: {
  commitment_jpy: 3000000000,
  total_called_jpy: 2020118000,
  total_received_jpy: 95565400,
  unfunded_jpy: 979882000,
  dpi: 0.047,
  drawn_pct: 67.34,
  net_cash_position: -1924552600,
  investment_capacity: 979882000
}
```

**Note**: FX rate = 1 (no conversion needed, JPY-only fund)

### 4. Frontend Display Logic

**Helper Function** (lines 11-32 in FundDetail.tsx):
```typescript
function getSnapshotData(fund: any, snap: LedgerSnapshot | null) {
  const isSdg = fund && /sdg/i.test(fund.fund_name ?? '');
  
  // Select correct fields based on currency
  const commitment = isSdg ? snap.commitment_jpy : snap.commitment_usd;
  const totalCalled = isSdg ? snap.total_called_jpy : snap.total_called_usd;
  const totalReceived = isSdg ? snap.total_received_jpy : snap.total_received_usd;
  const unfunded = isSdg ? snap.unfunded_jpy : snap.unfunded_usd;
  
  // Select correct formatter
  const fmt_fn = isSdg ? fmt.jpy : (v: number) => fmt.usd(v, true);
  
  // Return structured data
  return {
    isSdg,
    commitment,
    totalCalled,
    totalReceived,
    unfunded,
    fmt_fn,      // Function to format numbers
    currency     // 'JPY' or 'USD'
  };
}
```

**Used in Snapshot Metrics Display** (lines 188-211):
```typescript
{snap && (() => {
  const d = getSnapshotData(fund, snap);
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <Snap label="Commitment" value={d.fmt_fn(d.commitment)} />
      <Snap label="Total Called" value={d.fmt_fn(d.totalCalled)} />
      <Snap label="Total Received" value={d.fmt_fn(d.totalReceived)} />
      <Snap label="Drawn %" value={fmt.pct(snap.drawn_pct)} />
      <Snap label="Unfunded" value={d.fmt_fn(d.unfunded)} />
      {/* ... more metrics ... */}
    </div>
  );
})()}
```

---

## Frontend Logic

### 1. Dashboard Page

**Purpose**: Overview of all funds with key metrics

**Flow**:
```
Dashboard renders
        ↓
useEffect: GET /funds
        ↓
Receives array of funds
        ↓
Display in card grid:
  - Fund name
  - Manager
  - Strategy
  - Key metrics (Commitment, DPI, etc.)
        ↓
Click on fund → Navigate to /funds/:id
```

### 2. Fund Detail Page

**Purpose**: Detailed view of single fund with full ledger

**Tabs**:
1. **Ledger**: Transaction history table
2. **Fund Info**: Fund details (name, manager, dates, rates)
3. **Wire Instructions**: Bank transfer details
4. **Commitments**: Commitment history and changes

**Snapshot Metrics** (lines 188-211):
- Displayed as 6 cards below fund header
- Shows: Commitment, Total Called, Total Received, Drawn %, Unfunded, Inv. Capacity, Net Cash, DPI, Return of Capital, Gain, Interest

**Ledger Table** (lines 254-405):
- Date | Description | FX Rate | B (Called) | C (Received) | D (Reinvestable)
- E (Cum Called) | F (Inv Cap) | G (Cash Flow) | H (Net Cash) | Return of Capital | Gain | Interest

### 3. State Management

**Key States in FundDetail.tsx**:
```typescript
const [fund, setFund] = useState<FundDetailType | null>(null);
const [rows, setRows] = useState<LedgerRow[]>([]);
const [snap, setSnap] = useState<LedgerSnapshot | null>(null);
const [loading, setLoading] = useState(true);
const [tab, setTab] = useState<'ledger' | 'info' | 'wire' | 'commitments'>('ledger');
const [latestFx, setLatestFx] = useState(143.5);
const [commitmentHistory, setCommitmentHistory] = useState<any[]>([]);
```

**Data Flow**:
```
Component Mount
        ↓
useEffect runs (3 parallel API calls)
        ↓
Responses arrive
        ↓
setState updates all state variables
        ↓
Component re-renders with new data
```

### 4. Currency Formatting

**Decimal.js Precision**:
```typescript
const commitment = new Decimal(1000000).toNumber();
// Avoids floating-point errors
```

**Formatting Functions** (from lib/format.ts):
```typescript
fmt.jpy(1000000)      // ¥1,000,000
fmt.usd(1000000)      // $1,000,000.00
fmt.pct(67.34)        // 67.34%
fmt.rate(143.50)      // 143.50
fmt.date('2024-01-15') // Jan 15, 2024
```

---

## API Endpoints

### Funds

**GET /funds**
- Returns: Array of all funds
- Usage: Dashboard page

**GET /funds/:id**
- Returns: Single fund details
- Usage: Fund detail page header

**POST /funds**
- Creates new fund
- Usage: Fund creation form

**PUT /funds/:id**
- Updates fund details
- Usage: Fund editing

### Ledger

**GET /funds/:id/ledger**
- Returns:
  ```javascript
  {
    rows: [              // Detailed transactions
      {
        date: '2020-10-27',
        description: 'Capital Call #1',
        tx_type: 'capital_call',
        capital_paid_in: 45765318,
        cumulative_called: 45765318,
        investment_capacity: 2954234682,
        net_cash_position: -45765318,
        dpi: 0
      },
      // ... more rows
    ],
    snapshot: {          // Summary metrics
      commitment_jpy: 3000000000,
      total_called_jpy: 2020118000,
      total_received_jpy: 95565400,
      unfunded_jpy: 979882000,
      drawn_pct: 67.34,
      dpi: 0.047,
      investment_capacity: 979882000,
      net_cash_position: -1924552600
    }
  }
  ```

### Capital Calls

**POST /funds/:id/capital-calls**
- Creates capital call
- Body: { call_date, amount, fx_rate, due_date, notes }

**GET /funds/:id/capital-calls**
- Gets all capital calls for fund

### Commitment History

**GET /funds/:id/commitment-history**
- Returns all commitment tranches
- Used in Commitments tab

**POST /funds/:id/commitment-history**
- Creates new commitment tranche
- Body: { effective_date, commitment_amount, notes }

---

## Key Features

### 1. Multi-Currency Support

- **USD Funds**: All values in USD
- **JPY Funds (SDG)**: All values in JPY, FX rate = 1
- **FX Conversion**: Uses historical rates from fx_rates table

### 2. Transaction Types

- **Capital Call**: Money called from LP (outflow)
- **Distribution**: Money returned to LP (inflow)
  - Types: income, return_of_capital, gain

### 3. Calculations

- **Running Totals**: Each row builds on previous
- **Snapshot**: Aggregated totals and metrics
- **DPI**: Performance metric (Return/Investment)

### 4. Data Integrity

- Decimal.js prevents floating-point errors
- Database constraints ensure referential integrity
- Timestamps track all changes

### 5. Authentication

- Login page checks credentials against users table
- JWT token stored in localStorage
- Passed in API headers for protected routes

---

## Example: Complete SDG Fund Transaction Flow

### Scenario: SDG Fund Capital Call

**1. User Action**: Click "New Capital Call" button on SDG fund

**2. Frontend**:
```typescript
setShowCallEntry(true)
// CapitalCallEntry component opens with form
```

**3. Form Input**:
```
Call Date: 2025-02-21
Amount (JPY): ¥281,232,618
FX Rate: 149.86
Due Date: 2025-03-21
```

**4. Backend POST /funds/:id/capital-calls**:
```javascript
{
  fund_id: "47f6a56a-088d-459f-9147-1f5c773e699d",
  call_number: 6,
  call_date: "2025-02-21",
  amount_jpy: 281232618,
  fx_rate: 149.86,
  status: "pending",
  due_date: "2025-03-21"
}

// Inserted into capital_calls table
```

**5. Frontend Refresh**:
```typescript
await refresh()  // Calls GET /funds/:id/ledger again
```

**6. Backend Recalculation**:
```
Fetch all capital_calls and distributions for fund
Sort by date
Recalculate cumulative totals:

Previous state:
  E(last) = ¥2,020,118,000

New transaction:
  B(6) = ¥281,232,618

New cumulative:
  E(6) = ¥2,020,118,000 + ¥281,232,618 = ¥2,301,350,618

New investment capacity:
  F(6) = ¥3,000,000,000 - ¥2,301,350,618 = ¥698,649,382

Regenerate snapshot with new totals
```

**7. Frontend Display Update**:
```
Metric cards recalculate:
  - PAID-IN (E): ¥2,301,350,618 (updated)
  - DRY POWDER (F): ¥698,649,382 (updated)

Table adds new row:
  Date: Feb 21, 2025
  Description: Capital Call #6
  Called: ¥281,232,618
  Cum. Called (E): ¥2,301,350,618
  Inv. Capacity (F): ¥698,649,382
```

---

## Database Query Examples

### Get Fund Snapshot Summary

```sql
SELECT 
  f.fund_name,
  f.commitment_jpy,
  SUM(CASE WHEN cc.amount_jpy > 0 THEN cc.amount_jpy ELSE 0 END) AS total_called,
  SUM(CASE WHEN d.amount_jpy > 0 THEN d.amount_jpy ELSE 0 END) AS total_received,
  f.commitment_jpy - SUM(cc.amount_jpy) AS dry_powder
FROM funds f
LEFT JOIN capital_calls cc ON f.id = cc.fund_id
LEFT JOIN distributions d ON f.id = d.fund_id
WHERE /sdg/i.test(f.fund_name)
GROUP BY f.id;
```

### Get Ledger Rows (Ordered by Date)

```sql
SELECT 
  cc.call_date AS date,
  'Capital Call' AS description,
  cc.amount_jpy AS capital_paid_in,
  0 AS capital_received
FROM capital_calls cc
WHERE cc.fund_id = 'fund-id'

UNION ALL

SELECT 
  d.distribution_date AS date,
  'Distribution' AS description,
  0 AS capital_paid_in,
  d.amount_jpy AS capital_received
FROM distributions d
WHERE d.fund_id = 'fund-id'

ORDER BY date ASC;
```

---

## Troubleshooting Guide

### Issue: Snapshot shows ¥0 for PAID-IN

**Cause**: Backend not detecting SDG fund or returning USD fields instead of JPY

**Solution**:
1. Check fund.fund_name contains "sdg" (case-insensitive)
2. Verify snapshot has `total_called_jpy` field (not `total_called_usd`)
3. Check capital_calls have amounts_jpy set

### Issue: DPI calculation wrong

**Cause**: Total distributions incorrect or total called is 0

**Solution**:
1. Verify distributions table has correct amounts
2. Verify capital_calls are marked as 'paid' status
3. Check FX conversions if mixing currencies

### Issue: Cumulative values not matching

**Cause**: Out-of-order transactions in database

**Solution**:
1. Verify all dates are in chronological order
2. Re-run CalculationEngine to recalculate
3. Check for deleted transactions not cleaned up

---

## Summary of Key Formulas

| Metric | Formula | Example |
|--------|---------|---------|
| Commitment (A) | Fixed at fund setup | ¥3,000,000,000 |
| Paid-In (E) | Sum of capital calls | ¥2,020,118,000 |
| Dry Powder (F) | A - E | ¥979,882,000 |
| Drawn % | (E / A) × 100 | 67.34% |
| Received (C) | Sum of distributions | ¥95,565,400 |
| DPI | C / E | 0.047x |
| Net Cash (H) | Running sum of (Recv - Called) | -¥1,924,552,600 |

---

**Last Updated**: 2026-07-23
**System Version**: 1.0
**Environment**: Development (Copyofhaif branch)
