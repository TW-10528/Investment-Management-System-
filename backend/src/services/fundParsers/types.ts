// Shared output type for the AI fund notice extractor.
// Fields map directly to calculationEngine.ts Transaction + FundSnapshot.

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
  // B — capital called (wired out).
  grossCallUsd:    number
  // C — capital received (distributions in)
  distributionUsd: number
  // D — reinvestable / recallable subset of C
  reinvestableUsd: number

  // ── Optional cost breakdown (informational; NOT part of the cash-flow rows) ─
  managementFeeUsd?: number
  taxExpenseUsd?:    number

  // ── Commitment reconciliation ──────────────────────────────────────────────
  commitmentUsd:   number
  totalCalledUsd:  number
  unfundedUsd:     number
  callPct:         number   // e.g. 0.049 for 4.90%

  // ── Finance-detail columns ─────────────────────────────────────────────────
  returnOfCapitalUsd?: number
  gainUsd?:            number
  interestUsd?:        number

  // ── Wire / reference ───────────────────────────────────────────────────────
  wireReference:   string | null

  // ── Projects / investments mentioned in the notice ─────────────────────────
  investmentTargets: InvestmentTarget[]

  // ── Extractor metadata ─────────────────────────────────────────────────────
  confidence:      number             // 0–1
  confidenceGrade: 'high' | 'medium' | 'low'
  rawText?:        string             // stripped before DB storage
  extractionLog?:  string[]           // human-readable extraction steps (stored in DB, shown in UI)
}
