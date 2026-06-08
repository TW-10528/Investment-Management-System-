// Shared output type for all fund-specific PDF parsers.
// Fields map directly to calculationEngine.ts Transaction + FundSnapshot.

import type { NbRealEstateReport } from './nb-real-estate/types'
import type { HamiltonLaneReport } from './hamilton-lane/types'
import type { HamiltonStrategicReport } from './hamilton-strategic/types'
import type { DoverStreetReport } from './dover-street/types'
import type { SdgLpsReport } from './sdg-lps/types'

export interface InvestmentTarget {
  projectName: string
  amountUsd?:  number
  sector?:     string
}

export interface ParsedFundNotice {
  // ── Identity ───────────────────────────────────────────────────────────────
  fundKey:    string     // machine key e.g. 'nb-real-estate', 'hamilton-lane'
  fundName:   string     // full name from PDF
  noticeType: 'capital_call' | 'distribution' | 'capital_and_distribution' | 'financial_statement'

  // ── Dates ──────────────────────────────────────────────────────────────────
  noticeDate: string     // ISO date of the letter  e.g. '2026-01-16'
  dueDate:    string     // ISO date payment is due e.g. '2026-02-02'

  // ── calculationEngine.ts Transaction fields ────────────────────────────────
  // B — capital called (wired out). For funds whose call includes a management
  //     fee component, B is the GROSS contribution = base call + management fee.
  grossCallUsd:    number
  // C — capital received (distributions in)
  distributionUsd: number
  // D — reinvestable / recallable subset of C
  reinvestableUsd: number

  // ── Optional cost breakdown (informational; NOT part of the cash-flow rows) ─
  // Management fee component already folded into grossCallUsd (column B).
  managementFeeUsd?: number
  // Tax expense — extracted and stored for audit but EXCLUDED from cash flow
  // (matches the NB Excel rule: cash flow = -B + C only).
  taxExpenseUsd?:    number

  // ── Commitment reconciliation ──────────────────────────────────────────────
  commitmentUsd:   number   // total LP commitment
  totalCalledUsd:  number   // cumulative called to date (from reconciliation table)
  unfundedUsd:     number   // outstanding / remaining commitment
  callPct:         number   // e.g. 0.049 for 4.90%

  // ── Finance-detail columns (informational; surfaced in the ledger) ─────────
  // Return of capital / realized gain / interest from the notice's distribution.
  returnOfCapitalUsd?: number
  gainUsd?:            number
  interestUsd?:        number

  // ── Wire / reference ───────────────────────────────────────────────────────
  wireReference:   string | null

  // ── Projects / investments mentioned in the notice ─────────────────────────
  investmentTargets: InvestmentTarget[]

  // ── Parser metadata ────────────────────────────────────────────────────────
  confidence:      number             // 0–1
  confidenceGrade: 'high' | 'medium' | 'low'
  rawText?:        string             // optional for debugging

  // ── Rich per-fund report (NB Real Estate, Hamilton Lane) ───────────────────
  // Full extractor output (breakdown, calculated Excel fields, validation).
  // Stored on Notice.extractedData.fundReport and shown on the document detail panel.
  fundReport?:     NbRealEstateReport | HamiltonLaneReport | HamiltonStrategicReport | DoverStreetReport | SdgLpsReport
}
