// SDGs 投資事業有限責任組合 (SDG LPS) parser.
//
// Wraps the rich extractor (TypeScript port of `sdg_lps_module.py`) and adapts it
// to the shared ParsedFundNotice the dispatcher + calculation engine expect.
//
// Notice types map to:
//   capital call notice (払込み頂く金額) → 'capital_call'  (B only)
//   distribution notice (組合財産の分配) → 'distribution'  (C only)
//
// Currency is JPY — the B/C/commitment figures are JPY and are NOT FX-converted.
// The full rich report is attached as `fundReport` so the upload route can persist
// it and the frontend shows the breakdown / Excel fields / validation.

import { extractSdgLpsReport } from './extractor'
import type { SdgPreviousState } from './types'
import type { ParsedFundNotice } from '../types'

export { extractSdgLpsReport }
export type { SdgLpsReport, SdgPreviousState } from './types'

export function parseSdgLps(rawText: string, previousState: SdgPreviousState | null = null, fileName = ''): ParsedFundNotice {
  const report = extractSdgLpsReport(rawText, fileName, previousState)
  const f = report.final_excel_fields
  const a = report.all_extracted_fields

  const grossCallUsd    = f.capital_contribution_amount || 0   // B (JPY)
  const distributionUsd = f.distribution_amount_received || 0  // C (JPY)
  const reinvestableUsd = f.reinvestable_amount || 0           // D (0 for SDG)

  const noticeType: ParsedFundNotice['noticeType'] =
    a.is_distribution ? 'distribution'
    : a.is_capital_call ? 'capital_call'
    : grossCallUsd > 0 ? 'capital_call' : 'distribution'

  const commitmentUsd  = f.commitment_amount ?? 0
  const totalCalledUsd = f.cumulative_capital_contributions ?? 0   // E
  const unfundedUsd    = f.remaining_commitment ?? 0               // F
  const callPct = grossCallUsd > 0 && commitmentUsd > 0
    ? Math.round((grossCallUsd / commitmentUsd) * 10000) / 100
    : 0

  const noticeDate = a.notice_date ?? a.transaction_date ?? new Date().toISOString().slice(0, 10)
  const dueDate    = a.transaction_date ?? a.payment_due_date ?? noticeDate

  // ── Confidence scoring ────────────────────────────────────────────────────────
  let score = 0
  if (report.document_type !== 'unknown_sdg_notice') score += 2
  if (a.transaction_date)                            score += 2
  if (grossCallUsd > 0 || distributionUsd > 0)       score += 2
  if (commitmentUsd > 0)                             score += 2
  if (report.validation.missing_important_fields.length === 0) score++
  const confidence = Math.min(score / 9, 1)
  const confidenceGrade: 'high' | 'medium' | 'low' =
    confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low'

  return {
    fundKey:          'sdg-lps',
    fundName:         report.fund_name,
    noticeType,
    noticeDate,
    dueDate,
    grossCallUsd,                       // B (JPY)
    distributionUsd,                    // C (JPY)
    reinvestableUsd,                    // D
    managementFeeUsd: 0,
    taxExpenseUsd:    0,
    returnOfCapitalUsd: f.return_of_capital ?? 0,
    gainUsd:            f.gain ?? 0,
    interestUsd:        f.interest_other ?? 0,
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
