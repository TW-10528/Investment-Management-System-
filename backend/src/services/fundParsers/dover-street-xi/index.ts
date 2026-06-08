// Dover Street XI Feeder Fund L.P. — adapter: maps extractor output → ParsedFundNotice.
//
// Initial contribution / Capital Call + Deemed Distribution:
//   B  grossCallUsd    = Total Calls or Capital Call (gross, not net)
//   C  distributionUsd = Deemed Distribution offset (if any)
//   D  reinvestableUsd = 0
//
// Cash Distribution:
//   B  grossCallUsd    = 0
//   C  distributionUsd = Total / Gross / Net Distribution
//   D  reinvestableUsd = 0
//
// Note: Initial contribution interest is excluded from B (kept in remarks only).
// The full DoverReport is attached as `doverReport` so the upload route can
// persist it on Notice.extractedData and support previous-state chaining across
// uploads (cumulative contributions, remaining commitment, cumulative cash flow).

import { extractDoverStreetXiReport } from './extractor'
import type { DoverPreviousState } from './types'
import type { ParsedFundNotice } from '../types'

export { extractDoverStreetXiReport }
export type { DoverReport, DoverPreviousState } from './types'

export function parseDoverStreetXi(
  rawText: string,
  previousState: DoverPreviousState | null = null,
  fileName = '',
): ParsedFundNotice {
  const report = extractDoverStreetXiReport(rawText, fileName, previousState)
  const f = report.final_excel_fields
  const a = report.all_extracted_fields

  const grossCallUsd    = f.capital_contribution_amount ?? 0
  const distributionUsd = f.distribution_amount_received ?? 0
  const reinvestableUsd = f.reinvestable_amount ?? 0

  const commitmentUsd  = f.commitment_amount ?? 0
  const totalCalledUsd = f.cumulative_capital_contributions ?? 0
  const unfundedUsd    = f.remaining_commitment ?? (commitmentUsd > 0 ? commitmentUsd - totalCalledUsd : 0)

  const noticeDate = a.notice_date ?? a.transaction_date ?? new Date().toISOString().slice(0, 10)
  const dueDate    = a.transaction_date ?? noticeDate

  const noticeType: 'capital_call' | 'distribution' =
    a.is_cash_distribution ? 'distribution' : 'capital_call'

  let score = 0
  if (a.transaction_date)   score += 2
  if (grossCallUsd > 0 || distributionUsd > 0) score += 2
  if (commitmentUsd > 0)    score += 2
  if (totalCalledUsd > 0)   score++
  const confidence = Math.min(score / 7, 1)
  const confidenceGrade: 'high' | 'medium' | 'low' =
    confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low'

  return {
    fundKey:          'dover-street-xi',
    fundName:         report.fund_name,
    noticeType,
    noticeDate,
    dueDate,
    grossCallUsd,
    distributionUsd,
    reinvestableUsd,
    commitmentUsd,
    totalCalledUsd,
    unfundedUsd,
    callPct:          commitmentUsd > 0 ? grossCallUsd / commitmentUsd : 0,
    wireReference:    a.account_number ?? null,
    investmentTargets: [],
    confidence,
    confidenceGrade,
    doverReport:      report,
  }
}
