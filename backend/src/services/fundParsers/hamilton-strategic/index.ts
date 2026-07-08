// Hamilton Lane Strategic Opportunities Fund IX-B LP parser.
//
// Wraps the rich extractor (TypeScript port of
// `hamilton_strategic_opportunities_module.py`) and adapts it to the shared
// ParsedFundNotice the dispatcher + calculation engine expect.
//
// A single notice can carry BOTH a capital-call portion (B) and a distribution
// portion (C) — e.g. net capital calls and return-of-unused-capital true-ups.
// The noticeType is therefore:
//   B and C both present → 'capital_and_distribution' (route creates both records)
//   only C present       → 'distribution'
//   otherwise            → 'capital_call'  (B may be negative for return-of-capital)
//
// The full rich report is attached as `fundReport` so the upload route can persist
// it and the frontend shows the breakdown / Excel fields / validation.

import { extractHamiltonStrategicReport } from './extractor'
import type { HamStratPreviousState } from './types'
import type { ParsedFundNotice } from '../types'

export { extractHamiltonStrategicReport }
export type { HamiltonStrategicReport, HamStratPreviousState } from './types'

export function parseHamiltonStrategic(rawText: string, previousState: HamStratPreviousState | null = null): ParsedFundNotice {
  const report = extractHamiltonStrategicReport(rawText, '', previousState)
  const f = report.final_excel_fields
  const a = report.all_extracted_fields

  const grossCallUsd    = f.capital_contribution_amount || 0   // B (may be negative)
  const distributionUsd = f.distribution_amount_received || 0  // C
  const reinvestableUsd = f.reinvestable_amount || 0           // D

  const hasB = grossCallUsd !== 0
  const hasC = distributionUsd !== 0
  const noticeType: ParsedFundNotice['noticeType'] =
    hasB && hasC ? 'capital_and_distribution'
    : hasC && !hasB ? 'distribution'
    : 'capital_call'

  const commitmentUsd  = f.commitment_amount ?? 0
  const totalCalledUsd = a.amounts_drawn ?? 0                                  // E (report cumulative)
  const unfundedUsd    = f.remaining_commitment ?? (commitmentUsd > 0 ? commitmentUsd - totalCalledUsd : 0) // F
  // Notices don't state a call %; derive it for positive capital calls (display only).
  const callPct = grossCallUsd > 0 && commitmentUsd > 0 ? Math.round((grossCallUsd / commitmentUsd) * 10000) / 100 : 0

  const noticeDate = a.notice_date ?? new Date().toISOString().slice(0, 10)
  const dueDate    = a.transaction_date ?? a.capital_call_due_date ?? a.distribution_due_date ?? noticeDate

  // ── Confidence scoring ────────────────────────────────────────────────────────
  let score = 0
  if (report.document_type !== 'hamilton_strategic_transaction_notice') score += 2
  if (a.transaction_date)                       score += 2
  if (commitmentUsd > 0)                        score += 2
  if (hasB || hasC)                             score += 2
  if (totalCalledUsd > 0)                       score++
  const confidence = Math.min(score / 9, 1)
  const confidenceGrade: 'high' | 'medium' | 'low' =
    confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low'

  return {
    fundKey:          'hamilton-strategic',
    fundName:         'Strategic Opportunities Fund IX',
    fundManager:      'Hamilton Lane',
    noticeType,
    noticeDate,
    dueDate,
    grossCallUsd,                       // B
    distributionUsd,                    // C
    reinvestableUsd,                    // D
    managementFeeUsd: a.capital_call_management_fees ?? 0,
    taxExpenseUsd:    a.capital_call_expenses ?? 0,
    returnOfCapitalUsd: f.return_of_capital ?? 0,
    gainUsd:            f.gain ?? 0,
    interestUsd:        f.interest ?? 0,
    commitmentUsd,
    totalCalledUsd,
    unfundedUsd,
    callPct,
    wireReference:    null,
    investmentTargets: [],
    confidence,
    confidenceGrade,
    fundReport:       report,
  }
}
