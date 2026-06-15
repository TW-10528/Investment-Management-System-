// SDGs 投資事業有限責任組合 (SDG LPS) — extraction module.
//
// Faithful TypeScript port of the reference Python module `sdg_lps_module.py`.
//
// - Uses only the uploaded report PDF text (pdf-parse). Currency is JPY; no FX
//   conversion is performed.
// - Supports Japanese SDG capital-call (払込み頂く金額) and distribution
//   (組合財産の分配 / 収益分配 / 分配金) notices.
// - B 出資払込金額 = 払込み頂く金額; C 出資受領金額 = 分配金額; D = 0; G = -B + C.
// - Cumulative E/F handle a changing commitment via 現在の出資未履行金額 /
//   本出資後の出資未履行金額 and the previous row's stored state.
//
// NOTE: scanned SDG PDFs need OCR (Tesseract) to produce text. The Hono backend
// only runs pdf-parse, so image-only SDG notices will extract little text and be
// flagged needs_review — the calculations still run on whatever text is present.

import type {
  SdgAllFields, SdgBreakdown, SdgBreakdownItem, SdgCalculatedFields,
  SdgCalculationResult, SdgExcelFields, SdgLpsReport, SdgPreviousState, SdgValidation,
} from './types'

// ── PDF / text utilities ───────────────────────────────────────────────────────

export function normalizeText(text: string): string {
  if (!text) return ''
  return text
    // NBSP / zero-width removed via explicit codepoints (NOT a literal-space no-op).
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    // Fullwidth punctuation -> ASCII so the amount/label regexes match.
    .replace(/\uff0c/g, ',')   // ，
    .replace(/\uff0e/g, '.')   // ．
    .replace(/\uff08/g, '(')   // （
    .replace(/\uff09/g, ')')   // ）
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

// Mirrors the Python clean_amount, including the European "1.000" thousands case.
function cleanAmount(value: string | null | undefined): number | null {
  if (value == null) return null
  let v = String(value).trim()
  // "1.000" (digit, dot, exactly 3 digits) -> dot is a thousands separator.
  if (/\d\.\d{3}/.test(v)) v = v.replace(/,/g, '').replace(/\./g, '')
  v = v
    .replace(/,/g, '')
    .replace(/\u5186/g, '')   // 円
    .replace(/\uffe5/g, '')   // ￥ fullwidth yen
    .replace(/\u00a5/g, '')   // ¥ yen
    .replace(/ /g, '')
    .replace(/\u3000/g, '')   // ideographic space
  if (v === '' || v === '-' || v === '\uff0d') return 0
  const n = parseFloat(v)
  return Number.isNaN(n) ? null : n
}

function amountOrZero(v: number | null | undefined): number {
  return v != null ? v : 0
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function normalizeJapaneseDate(value: string | null): string | null {
  if (!value) return null
  let v = value.trim().replace(/ /g, '').replace(/　/g, '')
  v = v.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
  v = v.replace(/\//g, '-').replace(/\./g, '-')
  const m = v.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (Number.isNaN(d.getTime())) return null
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  return null
}

// SDG_290524.pdf -> 2024-05-29 ; SDG_080426 1.pdf -> 2026-04-08
function parseFilenameDate(fileName: string): string | null {
  const base = (fileName || '').split(/[\\/]/).pop() ?? ''
  const m = base.match(/SDG[_-](\d{2})(\d{2})(\d{2})/i)
  if (!m) return null
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = 2000 + Number(m[3])
  const d = new Date(yyyy, mm - 1, dd)
  if (Number.isNaN(d.getTime())) return null
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

// ── Flexible Japanese field extraction ──────────────────────────────────────────

function findAmountAfterLabel(text: string, labelPatterns: string[], window = 260): number | null {
  for (const label of labelPatterns) {
    const re = new RegExp(label + `[\\s\\S]{0,${window}}?([0-9][0-9,\\.]*)\\s*円`, 'i')
    const m = text.match(re)
    if (m) return cleanAmount(m[1])
  }
  return null
}

function findDateAfterLabel(text: string, labelPatterns: string[], window = 120): string | null {
  for (const label of labelPatterns) {
    const re = new RegExp(label + `[\\s\\S]{0,${window}}?(\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日)`, 'i')
    const m = text.match(re)
    if (m) return normalizeJapaneseDate(m[1])
  }
  return null
}

function findNoticeDate(text: string): string | null {
  const m = text.match(/(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/)
  return m ? normalizeJapaneseDate(m[1]) : null
}

function detectDocumentType(text: string): string {
  if (text.includes('組合財産の分配') || text.includes('収益分配') || text.includes('分配金')) return 'distribution_notice'
  if (text.includes('振込送金のご請求') || text.includes('払込み頂く金額') || text.includes('払込み期限')) return 'capital_call_notice'
  return 'unknown_sdg_notice'
}

function extractDistributionAmount(text: string): number | null {
  const amount = findAmountAfterLabel(
    text,
    ['分配金額(?:定額)?(?:と支払い期日)?', '分配金額', '収益分配', '貴社に対して'],
    220,
  )
  if (amount != null) return amount
  const m = text.match(/分配[\s\S]{0,300}?金額[\s\S]{0,80}?([0-9][0-9,\.]*)\s*円/)
  if (m) return cleanAmount(m[1])
  return null
}

function extractDistributionDate(text: string, fileName = ''): string | null {
  const dateValue = findDateAfterLabel(text, ['振込日', '支払い期日', '支払期日', '支払日'], 160)
  if (dateValue) return dateValue
  return parseFilenameDate(fileName)
}

// ── Core extraction ─────────────────────────────────────────────────────────────

function extractAllFields(rawText: string, fileName = ''): SdgAllFields {
  const text = normalizeText(rawText)
  const documentType = detectDocumentType(text)
  const filenameDate = parseFilenameDate(fileName)

  const paymentAmount = findAmountAfterLabel(
    text,
    ['払込み頂く金額', '払込みいただく金額', '払込(?:み)?頂く金額', '払\\s*込\\s*み?\\s*頂\\s*く\\s*金\\s*額'],
    180,
  )

  const paymentDueDate = findDateAfterLabel(
    text,
    ['払込み期限', '払込み期日', '払込期限', '払込期日'],
    120,
  )

  let currentUnfunded = findAmountAfterLabel(
    text,
    [
      '現在の出資未履行金額',
      '現在の.*?出資未履行金額',
      '現\\s*在\\s*の\\s*出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
      '現\\s*在[\\s\\S]{0,40}?出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
    ],
    420,
  )

  // OCR fallback: when the label fails, use the largest JPY amount greater than the
  // payment amount and ≥ 100,000,000 as the current unfunded commitment.
  if (currentUnfunded == null) {
    const yenAmounts: number[] = []
    for (const m of text.matchAll(/([0-9][0-9,\.]*)\s*円/g)) {
      const amount = cleanAmount(m[1])
      if (amount != null) yenAmounts.push(amount)
    }
    const paymentForFilter = paymentAmount ?? 0
    const candidates = yenAmounts.filter(a => a > paymentForFilter && a >= 100_000_000)
    if (candidates.length) currentUnfunded = Math.max(...candidates)
  }

  const remainingAfterPayment = findAmountAfterLabel(
    text,
    [
      '本出資後の出資未履行金額',
      '後の出資未履行金額',
      '本\\s*出\\s*資\\s*後\\s*の\\s*出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
      '後\\s*の\\s*出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
    ],
    260,
  )

  const distributionAmount = extractDistributionAmount(text)
  const noticeDate = findNoticeDate(text)

  let transactionDate: string | null
  let capitalContributionAmount: number
  let distributionAmountReceived: number
  const reinvestableAmount = 0
  let remarks: string

  if (documentType === 'distribution_notice') {
    transactionDate = filenameDate ?? extractDistributionDate(text, fileName)
    capitalContributionAmount = 0
    distributionAmountReceived = distributionAmount ?? 0
    remarks = '組合財産の分配（収益分配）.'
  } else if (documentType === 'capital_call_notice') {
    transactionDate = filenameDate ?? paymentDueDate
    // Rule 3: B = capital_contribution_amount = 払込み頂く金額 (0 when absent).
    capitalContributionAmount = paymentAmount ?? 0
    distributionAmountReceived = 0
    remarks = '投資事業有限責任組合契約書に基づく振込送金のご請求.'
  } else {
    transactionDate = filenameDate
    capitalContributionAmount = paymentAmount ?? 0
    distributionAmountReceived = distributionAmount ?? 0
    remarks = 'SDGs 投資事業有限責任組合 transaction notice. Document type could not be confidently detected.'
  }

  return {
    document_type:               documentType,
    is_capital_call:             documentType === 'capital_call_notice',
    is_distribution:             documentType === 'distribution_notice',
    fund_name:                   'SDGs 投資事業有限責任組合',
    company_name:                '株式会社サードウェーブ',
    currency:                    'JPY',

    notice_date:                 noticeDate,
    transaction_date:            transactionDate,
    filename_date:               filenameDate,

    payment_amount:              paymentAmount,
    payment_due_date:            paymentDueDate,
    current_unfunded_commitment: currentUnfunded,
    remaining_after_payment:     remainingAfterPayment,
    distribution_amount_from_text: distributionAmount,

    capital_contribution_amount_for_excel:  capitalContributionAmount,
    distribution_amount_received_for_excel: distributionAmountReceived,
    reinvestable_amount_for_excel:          reinvestableAmount,

    return_of_capital:           0,
    gain:                        0,
    interest_other:              documentType === 'distribution_notice' ? distributionAmountReceived : 0,
    remarks,

    ocr_or_pdf_text_length:      text.length,
  }
}

// ── Breakdown ──────────────────────────────────────────────────────────────────

function buildBreakdown(a: SdgAllFields): SdgBreakdown {
  const capital_call_breakdown: SdgBreakdownItem[] = []
  const distribution_breakdown: SdgBreakdownItem[] = []

  const b = a.capital_contribution_amount_for_excel || 0
  const c = a.distribution_amount_received_for_excel || 0

  if (b) {
    capital_call_breakdown.push({
      purpose: 'capital_call', label: '払込み頂く金額', amount: b,
      currency: 'JPY', excel_usage: 'capital_contribution_amount',
    })
  }
  if (c) {
    distribution_breakdown.push({
      purpose: 'interest_other', label: '組合財産の分配（収益分配）', amount: c,
      currency: 'JPY', excel_usage: 'distribution_amount_received_and_interest_other',
    })
  }

  return { capital_call_breakdown, distribution_breakdown }
}

// ── Excel mapping and calculation ──────────────────────────────────────────────

function calculateCurrentTransactionCashFlow(b: number, c: number): number {
  return round2(-(b || 0) + (c || 0))
}

function mapToExcelFields(a: SdgAllFields, breakdown: SdgBreakdown): SdgExcelFields {
  const b = a.capital_contribution_amount_for_excel || 0
  const c = a.distribution_amount_received_for_excel || 0
  const d = a.reinvestable_amount_for_excel || 0

  return {
    subscription_agreement_effective_date: null,
    commitment_amount:                     null,   // calculated later when previous_state exists
    transaction_date:                      a.transaction_date,
    mufg_ttm:                              null,

    capital_contribution_amount:           b,
    distribution_amount_received:          c,
    reinvestable_amount:                   d,

    cumulative_capital_contributions:      null,
    remaining_commitment_formula_value:    a.remaining_after_payment,
    remaining_commitment:                  a.remaining_after_payment,

    cash_flow:                             calculateCurrentTransactionCashFlow(b, c),
    remarks:                               a.remarks,
    distribution_details:                  breakdown.distribution_breakdown,
    distribution_not_allocated_to_reinvestment: round2(Math.max(c - d, 0)),

    return_of_capital:                     a.return_of_capital,
    gain:                                  a.gain,
    interest:                              a.interest_other,
    interest_other:                        a.interest_other,

    current_unfunded_commitment:           a.current_unfunded_commitment,
    remaining_after_payment:               a.remaining_after_payment,
  }
}

function calculateExcelFields(
  extracted: SdgExcelFields,
  a: SdgAllFields,
  previousState: SdgPreviousState | null = null,
): SdgCalculationResult {
  const b = amountOrZero(extracted.capital_contribution_amount)
  const c = amountOrZero(extracted.distribution_amount_received)
  const d = amountOrZero(extracted.reinvestable_amount)

  const currentCashFlow = calculateCurrentTransactionCashFlow(b, c)

  const currentUnfunded = a.current_unfunded_commitment
  const remainingAfterPayment = a.remaining_after_payment

  let cumulativeCapitalContributions: number | null = null
  let remainingCommitment: number | null = null
  let commitmentAmount: number | null = null
  let cumulativeCashFlow = currentCashFlow
  let finalCashFlowForExcel = currentCashFlow

  const calculationSources: Record<string, string> = {
    cumulative_capital_contributions: 'first_transaction',
    remaining_commitment:             'first_transaction',
    commitment_amount:                'first_transaction',
    cash_flow:                        'current_transaction_cash_flow',
    cumulative_cash_flow:             'current_transaction_cash_flow',
  }

  if (previousState) {
    const previousE = previousState.cumulative_capital_contributions
    const previousF = previousState.remaining_commitment
    const previousCashFlow = previousState.cumulative_cash_flow

    // Cumulative cash flow always chains: cash_flow = previous + current (rules 5 & 7).
    if (previousCashFlow != null) {
      cumulativeCashFlow = round2(previousCashFlow + currentCashFlow)
      finalCashFlowForExcel = cumulativeCashFlow
      calculationSources.cash_flow = 'previous_cash_flow_plus_current'
      calculationSources.cumulative_cash_flow = 'previous_cash_flow_plus_current'
    }

    if (a.is_distribution) {
      // Rule 7 — distribution does NOT change E or F (only cash flow moves).
      cumulativeCapitalContributions = previousE ?? null
      remainingCommitment = previousF ?? null
      if (previousE != null && previousF != null) commitmentAmount = round2(previousE + previousF)
      calculationSources.cumulative_capital_contributions = 'carried_forward_distribution'
      calculationSources.remaining_commitment = 'carried_forward_distribution'
      calculationSources.commitment_amount = 'previous_E_plus_previous_F'
    } else {
      // Capital call — E always = previous E + B (rules 5 & 6).
      cumulativeCapitalContributions = previousE != null ? round2(previousE + b) : b
      calculationSources.cumulative_capital_contributions = 'previous_E_plus_B'

      if (currentUnfunded != null && remainingAfterPayment != null) {
        // Rule 6 — commitment-change report. New total commitment from the report:
        // current_total_commitment = previous E + 現在の出資未履行金額; F = 本出資後.
        commitmentAmount = previousE != null ? round2(previousE + currentUnfunded) : round2(currentUnfunded)
        remainingCommitment = round2(remainingAfterPayment)
        calculationSources.commitment_amount = 'previous_E_plus_report_current_unfunded'
        calculationSources.remaining_commitment = 'report_remaining_after_payment'
      } else if (previousE != null && previousF != null) {
        // Rule 5 — commitment unchanged: F = previous F − B.
        commitmentAmount = round2(previousE + previousF)
        remainingCommitment = round2(previousF - b)
        calculationSources.commitment_amount = 'unchanged_previous_E_plus_previous_F'
        calculationSources.remaining_commitment = 'previous_F_minus_B'
      } else if (currentUnfunded != null) {
        commitmentAmount = round2(currentUnfunded)
        remainingCommitment = round2(currentUnfunded - b)
      }
    }
  } else {
    // Rule 4 — first transaction (no previous DB row).
    if (a.is_distribution) {
      cumulativeCapitalContributions = 0
      commitmentAmount = currentUnfunded
      remainingCommitment = currentUnfunded
    } else {
      cumulativeCapitalContributions = b
      if (currentUnfunded != null) {
        // commitment = 現在の出資未履行金額; remaining = commitment − B.
        commitmentAmount = round2(currentUnfunded)
        remainingCommitment = remainingAfterPayment != null ? round2(remainingAfterPayment) : round2(currentUnfunded - b)
        calculationSources.commitment_amount = 'report_current_unfunded'
        calculationSources.remaining_commitment = 'commitment_minus_B'
      } else {
        commitmentAmount = b
        remainingCommitment = remainingAfterPayment != null ? round2(remainingAfterPayment) : 0
      }
    }
  }

  const distributionNotAllocated = round2(Math.max(c - d, 0))

  const calculatedFields: SdgCalculatedFields = {
    commitment_amount:                          commitmentAmount,
    cumulative_capital_contributions:           cumulativeCapitalContributions,
    remaining_commitment_formula_value:         remainingCommitment,
    remaining_commitment:                       remainingCommitment,
    current_transaction_cash_flow:              currentCashFlow,
    cumulative_cash_flow:                        cumulativeCashFlow,
    cash_flow_for_excel:                        finalCashFlowForExcel,
    distribution_not_allocated_to_reinvestment: distributionNotAllocated,
    remarks:                                    extracted.remarks,
    distribution_details:                       extracted.distribution_details ?? [],
  }

  return {
    input_values_for_current_row: {
      subscription_agreement_effective_date: extracted.subscription_agreement_effective_date,
      commitment_amount:                     commitmentAmount,
      transaction_date:                      extracted.transaction_date,
      capital_contribution_amount:           b,
      distribution_amount_received:          c,
      reinvestable_amount:                   d,
      return_of_capital:                     extracted.return_of_capital,
      gain:                                  extracted.gain,
      interest_other:                        extracted.interest_other,
      current_unfunded_commitment:           currentUnfunded,
      remaining_after_payment:               remainingAfterPayment,
    },
    previous_state_used:     previousState,
    calculated_excel_fields: calculatedFields,
    calculation_sources:     calculationSources,
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

function buildValidation(
  excelFields: SdgExcelFields,
  a: SdgAllFields,
  calculationResult: SdgCalculationResult,
): SdgValidation {
  const b = excelFields.capital_contribution_amount || 0
  const c = excelFields.distribution_amount_received || 0
  const currentCf = calculationResult.calculated_excel_fields.current_transaction_cash_flow

  const missing: string[] = []
  if (!excelFields.transaction_date) missing.push('transaction_date')
  if (a.is_capital_call && !b) missing.push('capital_contribution_amount')
  if (a.is_distribution && !c) missing.push('distribution_amount_received')
  if (a.is_capital_call && a.current_unfunded_commitment == null) missing.push('current_unfunded_commitment')
  if (a.is_capital_call && a.remaining_after_payment == null && a.current_unfunded_commitment == null) {
    missing.push('remaining_after_payment')
  }

  return {
    missing_important_fields: missing,
    calculation_checks: {
      currency: 'JPY',
      excel_b_capital_contribution_amount: b,
      excel_c_distribution_amount_received: c,
      excel_d_reinvestable_amount: excelFields.reinvestable_amount,
      current_transaction_cash_flow: currentCf,
      current_unfunded_commitment: a.current_unfunded_commitment,
      remaining_after_payment: a.remaining_after_payment,
      calculated_commitment_amount: calculationResult.calculated_excel_fields.commitment_amount,
      calculated_cumulative_capital_contributions: calculationResult.calculated_excel_fields.cumulative_capital_contributions,
      calculated_remaining_commitment: calculationResult.calculated_excel_fields.remaining_commitment,
      cumulative_cash_flow: calculationResult.calculated_excel_fields.cumulative_cash_flow,
      cash_flow_for_excel: calculationResult.calculated_excel_fields.cash_flow_for_excel,
      ocr_or_pdf_text_length: a.ocr_or_pdf_text_length,
    },
    needs_review: missing.length > 0,
    warnings: [
      'Currency is JPY. No FX conversion is performed.',
      'This module does not use Excel fallback values; OCR numeric fallback uses amounts found in the report text only.',
      'For scanned Japanese PDFs, the router should pass OCR text to this module; filename date is preferred because OCR can misread Japanese dates.',
      'For accurate DB cumulative flow, upload SDG reports in transaction date order.',
    ],
  }
}

// ── Main module function ───────────────────────────────────────────────────────

export function extractSdgLpsReport(
  rawText: string,
  fileName = '',
  previousState: SdgPreviousState | null = null,
): SdgLpsReport {
  const text = normalizeText(rawText || '')
  const allFields = extractAllFields(text, fileName)
  const breakdown = buildBreakdown(allFields)
  const excelFields = mapToExcelFields(allFields, breakdown)
  const calculationResult = calculateExcelFields(excelFields, allFields, previousState)
  const validation = buildValidation(excelFields, allFields, calculationResult)

  const calculated = calculationResult.calculated_excel_fields
  const finalExcelFields: SdgExcelFields = { ...excelFields }
  finalExcelFields.commitment_amount = calculated.commitment_amount ?? finalExcelFields.commitment_amount
  finalExcelFields.cumulative_capital_contributions = calculated.cumulative_capital_contributions ?? finalExcelFields.cumulative_capital_contributions
  finalExcelFields.remaining_commitment_formula_value = calculated.remaining_commitment_formula_value ?? finalExcelFields.remaining_commitment_formula_value
  finalExcelFields.remaining_commitment = calculated.remaining_commitment ?? finalExcelFields.remaining_commitment
  finalExcelFields.cash_flow = calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow
  finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow
  finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow
  finalExcelFields.distribution_not_allocated_to_reinvestment = calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment

  return {
    source_file_name:     fileName,
    extraction_status:    'success',
    module_name:          'sdgs_lps_jpy',
    document_type:        allFields.document_type,
    company_name:         allFields.company_name,
    fund_name:            allFields.fund_name,
    currency:             'JPY',
    excel_fields:         excelFields,
    all_extracted_fields: allFields,
    breakdown,
    validation,
    calculation_result:   { ...calculationResult, final_excel_fields_for_frontend: finalExcelFields },
    final_excel_fields:   finalExcelFields,
  }
}
