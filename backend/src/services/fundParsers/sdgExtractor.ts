/**
 * SDGs 投資事業有限責任組合 (SDG Fund) Extractor
 *
 * Port of the Python reference implementation from sdg_lps_module.py
 * Uses deterministic field extraction with flexible Japanese patterns
 * to parse SDG capital call and distribution notices.
 */

import { extractSDGReport, type SDGExtractionResult, type SDGPreviousState } from '../ocr/sdgExtractor'
import type { ParsedFundNotice } from './types'

/**
 * Convert SDG extraction result to ParsedFundNotice interface
 */
export function extractSdgNotice(text: string, fileName = ''): ParsedFundNotice | null {
  const result = extractSDGReport(text, fileName, null)

  // Check if this is actually an SDG document
  if (result.document_type === 'unknown_sdg_notice' && result.validation.missing_fields.length > 3) {
    return null
  }

  const extracted = result.extracted_fields
  const calculated = result.calculation_result

  // SDG is JPY-only; amounts are stored as-is (no FX conversion)
  const grossCallJpy = extracted.is_capital_call ? extracted.capital_contribution_amount_for_excel : 0
  const distributionJpy = extracted.is_distribution ? extracted.distribution_amount_received_for_excel : 0
  const reinvestableJpy = extracted.reinvestable_amount_for_excel

  // Determine notice type
  let noticeType: 'capital_call' | 'distribution' | 'capital_and_distribution' = 'capital_call'
  if (extracted.is_distribution) {
    noticeType = 'distribution'
  } else if (extracted.is_capital_call) {
    noticeType = 'capital_call'
  }

  // Transaction/due date (prefer filename date as more reliable)
  const transactionDate = extracted.transaction_date || extracted.notice_date || new Date().toISOString().split('T')[0]

  const notice: ParsedFundNotice = {
    // ── Identity ───────────────────────────────────────────────────────────────
    fundKey: 'sdg-jpy',
    fundName: extracted.fund_name,
    fundManager: extracted.company_name,
    noticeType,

    // ── Dates ──────────────────────────────────────────────────────────────────
    noticeDate: extracted.notice_date || transactionDate,
    dueDate: extracted.payment_due_date || transactionDate,

    // ── Excel columns (all JPY, stored as-is) ──────────────────────────────────
    // B — capital contribution
    grossCallUsd: grossCallJpy,
    // C — distributions received
    distributionUsd: distributionJpy,
    // D — reinvestable amount
    reinvestableUsd: reinvestableJpy,

    // ── Finance breakdown ──────────────────────────────────────────────────────
    // For SDG, distribution is typically all income (no capital return unless noted)
    managementFeeUsd: 0,
    taxExpenseUsd: 0,

    // ── Commitment reconciliation ──────────────────────────────────────────────
    // SDG-specific fields from the report
    commitmentUsd: calculated.commitment_amount || 0,
    totalCalledUsd: calculated.cumulative_capital_contributions || 0,
    unfundedUsd: calculated.remaining_commitment || 0,

    // ── Source and confidence ──────────────────────────────────────────────────
    confidence: result.validation.needs_review ? 0.65 : 0.95,
    extractionLog: [
      `Document type: ${result.document_type}`,
      `Transaction date: ${transactionDate}`,
      `Current unfunded (before): ¥${extracted.current_unfunded_commitment || 'N/A'}`,
      `Remaining (after): ¥${extracted.remaining_after_payment || 'N/A'}`,
      `Cash flow: ¥${calculated.current_transaction_cash_flow}`,
      ...result.validation.warnings,
      ...(result.validation.missing_fields.length > 0
        ? [`⚠ Missing fields: ${result.validation.missing_fields.join(', ')}`]
        : []),
    ],

    // ── SDG-specific helpers (passed through for debugging) ────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentUnfundedUsd: extracted.current_unfunded_commitment,
    interestUsd: extracted.interest_other,
  } as any as ParsedFundNotice

  return notice
}

/**
 * Extract SDG notice with previous state for cumulative calculations
 * Used when processing multiple SDG notices in sequence
 */
export function extractSdgNoticeWithPreviousState(
  text: string,
  fileName: string = '',
  previousState: SDGPreviousState | null = null,
): SDGExtractionResult {
  return extractSDGReport(text, fileName, previousState)
}
