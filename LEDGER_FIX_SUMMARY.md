# Ledger Commitment Value Fix - Summary

## Problem
The ledger was displaying the **fixed Contract Commitment** (¥3,000,000,000) instead of the **dynamic Commitment** value from tranches (¥1,000,000,000).

## Root Cause
The `CalculationEngine.buildLedger()` function had support for commitment history but the routes weren't passing it. The ledger was using the fund-level commitment instead of the latest commitment history entry.

## Changes Made

### 1. **backend/src/modules/fund-reports/fund-reports.routes.ts**
- Query `FundCommitmentHistory` in POST (approve notice) endpoint
- Query `FundCommitmentHistory` in GET `/:id/ledger` endpoint  
- Pass commitment history to `buildLedger()` as 4th parameter
- **Return `snapshot.commitmentUsd`** instead of fund-level `commitment` (critical fix!)

### 2. **backend/src/services/calculationEngine.ts**
- Query `FundCommitmentHistory` in `fundSummary()` (used by dashboard)
- Pass commitment history to `buildLedger()`

### 3. **backend/prisma/schema.prisma**
- Added `contractCommitmentJpy` field to Fund model (was in database but missing from schema)

### 4. **backend/prisma/migrations/20260702_add_contract_commitment_jpy/**
- Migration file to document the schema addition

## How It Works Now

### Field Definitions
- **Contract Commitment (JPY)**: Fixed value (`contractCommitmentJpy`) - set when fund is created
- **Commitment (JPY)**: Dynamic value (`commitmentJpy`) - gets updated via tranches

### Data Flow
1. User updates **Commitment (JPY)** in Fund Details to ¥1,000,000,000
2. This creates a `FundCommitmentHistory` entry with `commitmentAmount = ¥1,000,000,000`
3. Ledger endpoint queries this history and passes to `buildLedger()`
4. `buildLedger()` uses the **latest** commitment history entry for the snapshot
5. API returns `snapshot.commitmentUsd = ¥1,000,000,000`
6. Frontend displays ¥1,000,000,000 in COMMITMENT field ✅

## Testing
After all changes, you should:
1. **Refresh the browser** to see updated ledger values
2. Or **re-upload PDF reports** to trigger ledger recalculation
3. Check that the ledger now displays ¥1,000,000,000, not ¥3,000,000,000

## Files Modified
- `backend/src/modules/fund-reports/fund-reports.routes.ts` - Query & pass commitment history
- `backend/src/services/calculationEngine.ts` - Query & pass commitment history  
- `backend/src/modules/dashboard/dashboard.routes.ts` - (Previous fix) Return correct commitment
- `backend/prisma/schema.prisma` - Add contractCommitmentJpy field
- `backend/prisma/migrations/20260702_add_contract_commitment_jpy/migration.sql` - Migration file
- `backend/dist/**` - Compiled JavaScript (auto-generated)
- `frontend/src/pages/Dashboard.tsx` - (Previous fix) Use contract_commitment_jpy for SDG

## Git Commits
1. `82e707c` - fix: use dynamic commitment values from tranches in ledger calculations
2. `d65434a` - fix: return snapshot commitment instead of fund-level commitment in ledger endpoints
3. `8233f48` - feat: add contractCommitmentJpy field to Fund model
