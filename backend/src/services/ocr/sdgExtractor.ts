/**
 * SDGs 投資事業有限責任組合 (SDG Fund) OCR/text extraction module
 *
 * Port of Python reference implementation for extracting SDG capital call
 * and distribution notices from PDFs.
 *
 * Key logic:
 * - Document type detection (capital call vs distribution)
 * - Japanese field extraction with flexible OCR patterns
 * - SDG-specific commitment change tracking
 * - Previous state handling for cumulative calculations
 */

import Decimal from 'decimal.js'

// ============================================================
// 1. Text utilities
// ============================================================

function normalizeText(text: string): string {
  if (!text) return ''
  text = text.replace(/\xa0/g, ' ').replace(/​/g, '')
  text = text.replace(/，/g, ',').replace(/．/g, '.')
  text = text.replace(/（/g, '(').replace(/）/g, ')')
  text = text.replace(/ {2,}/g, ' ').replace(/\t+/g, ' ')
  text = text.replace(/\n\s+/g, '\n')
  return text.trim()
}

function cleanAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null

  let str = String(value).trim()

  // Handle comma as thousands separator (Japanese: 1,000,000)
  if (!/\d\.\d{3}/.test(str)) {
    str = str.replace(/,/g, '')
  }

  // Remove currency symbols and whitespace
  str = str.replace(/円|￥|¥| |　/g, '')

  if (str === '' || str === '-' || str === '－') return 0.0

  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

function amountOrZero(value: number | null | undefined): number {
  return value !== null && value !== undefined ? value : 0
}

function normalizeJapaneseDate(value: string | null | undefined): string | null {
  if (!value) return null

  value = value.trim().replace(/ |　/g, '')
  value = value.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
  value = value.replace(/\//g, '-').replace(/\./g, '-')

  const match = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    try {
      const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch {
      return null
    }
  }
  return null
}

function parseFilenameDate(fileName: string): string | null {
  const base = fileName.split('/').pop() || ''
  const match = base.match(/sdg[_-](\d{2})(\d{2})(\d{2})/i)
  if (!match) return null

  const dd = parseInt(match[1])
  const mm = parseInt(match[2])
  const yy = parseInt(match[3])
  const yyyy = 2000 + yy

  try {
    const date = new Date(yyyy, mm - 1, dd)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  } catch {
    return null
  }
  return null
}

// ============================================================
// 2. Field extraction
// ============================================================

function findAmountAfterLabel(text: string, labelPatterns: string[], windowSize: number = 260): number | null {
  for (const label of labelPatterns) {
    const pattern = new RegExp(label + `[\\s\\S]{0,${windowSize}}?([0-9][0-9,\\.]*?)\\s*円`, 'i')
    const match = text.match(pattern)
    if (match) {
      return cleanAmount(match[1])
    }
  }
  return null
}

function findDateAfterLabel(text: string, labelPatterns: string[], windowSize: number = 120): string | null {
  for (const label of labelPatterns) {
    const pattern = new RegExp(label + `[\\s\\S]{0,${windowSize}}?(\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日)`, 'i')
    const match = text.match(pattern)
    if (match) {
      return normalizeJapaneseDate(match[1])
    }
  }
  return null
}

function findNoticeDate(text: string): string | null {
  const match = text.match(/(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/)
  if (match) {
    return normalizeJapaneseDate(match[1])
  }
  return null
}

function detectDocumentType(text: string): 'distribution_notice' | 'capital_call_notice' | 'unknown_sdg_notice' {
  if (/組合財産の分配|収益分配|分配金/.test(text)) {
    return 'distribution_notice'
  }
  if (/振込送金のご請求|払込み頂く金額|払込み期限/.test(text)) {
    return 'capital_call_notice'
  }
  return 'unknown_sdg_notice'
}

function extractDistributionAmount(text: string): number | null {
  let amount = findAmountAfterLabel(text, [
    '分配金額(?:定額)?(?:と支払い期日)?',
    '分配金額',
    '収益分配',
    '貴社に対して',
  ], 220)

  if (amount !== null) return amount

  // Fallback: find amount near distribution
  const match = text.match(/分配[\s\S]{0,300}?金額[\s\S]{0,80}?([0-9][0-9,\.]*)\s*円/)
  if (match) {
    return cleanAmount(match[1])
  }

  return null
}

function extractDistributionDate(text: string, fileName: string = ''): string | null {
  const dateValue = findDateAfterLabel(text, [
    '振込日',
    '支払い期日',
    '支払期日',
    '支払日',
  ], 160)

  if (dateValue) return dateValue
  return parseFilenameDate(fileName)
}

// ============================================================
// 3. Core extraction
// ============================================================

export interface SDGExtractedFields {
  document_type: 'distribution_notice' | 'capital_call_notice' | 'unknown_sdg_notice'
  is_capital_call: boolean
  is_distribution: boolean
  fund_name: string
  company_name: string
  currency: string

  notice_date: string | null
  transaction_date: string | null
  filename_date: string | null

  payment_amount: number | null
  payment_due_date: string | null
  current_unfunded_commitment: number | null
  remaining_after_payment: number | null
  distribution_amount_from_text: number | null

  capital_contribution_amount_for_excel: number
  distribution_amount_received_for_excel: number
  reinvestable_amount_for_excel: number

  return_of_capital: number
  gain: number
  interest_other: number
  remarks: string

  ocr_or_pdf_text_length: number
}

export function extractAllFields(text: string, fileName: string = ''): SDGExtractedFields {
  text = normalizeText(text)
  const documentType = detectDocumentType(text)
  const filenameDate = parseFilenameDate(fileName)

  const paymentAmount = findAmountAfterLabel(text, [
    '払込み頂く金額',
    '払込みいただく金額',
    '払込(?:み)?頂く金額',
    '払\\s*込\\s*み?\\s*頂\\s*く\\s*金\\s*額',
  ], 180)

  const paymentDueDate = findDateAfterLabel(text, [
    '払込み期限',
    '払込み期日',
    '払込期限',
    '払込期日',
  ], 120)

  let currentUnfunded = findAmountAfterLabel(text, [
    '現在の出資未履行金額',
    '現在の.*?出資未履行金額',
    '現\\s*在\\s*の\\s*出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
    '現\\s*在[\\s\\S]{0,40}?出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
  ], 420)

  // OCR fallback: use largest amount > payment_amount as current_unfunded
  if (currentUnfunded === null) {
    const yenAmounts: number[] = []
    const matches = text.matchAll(/([0-9][0-9,\.]*)\s*円/g)
    for (const match of matches) {
      const amount = cleanAmount(match[1])
      if (amount !== null) yenAmounts.push(amount)
    }

    const paymentForFilter = paymentAmount || 0
    const candidates = yenAmounts.filter(amt => amt > paymentForFilter && amt >= 100_000_000)
    if (candidates.length > 0) {
      currentUnfunded = Math.max(...candidates)
    }
  }

  const remainingAfterPayment = findAmountAfterLabel(text, [
    '本出資後の出資未履行金額',
    '後の出資未履行金額',
    '本\\s*出\\s*資\\s*後\\s*の\\s*出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
    '後\\s*の\\s*出\\s*資\\s*未\\s*履\\s*行\\s*金\\s*額',
  ], 260)

  const distributionAmount = extractDistributionAmount(text)
  const noticeDate = findNoticeDate(text)

  let transactionDate: string | null
  let capitalContributionAmount: number
  let distributionAmountReceived: number
  let reinvestableAmount: number
  let remarks: string

  if (documentType === 'distribution_notice') {
    transactionDate = filenameDate || extractDistributionDate(text, fileName)
    capitalContributionAmount = 0
    distributionAmountReceived = distributionAmount || 0
    reinvestableAmount = 0
    remarks = '組合財産の分配（収益分配）.'
  } else if (documentType === 'capital_call_notice') {
    transactionDate = filenameDate || paymentDueDate
    capitalContributionAmount = paymentAmount || 0
    distributionAmountReceived = 0
    reinvestableAmount = 0
    remarks = '投資事業有限責任組合契約書に基づく振込送金のご請求.'
  } else {
    transactionDate = filenameDate
    capitalContributionAmount = paymentAmount || 0
    distributionAmountReceived = distributionAmount || 0
    reinvestableAmount = 0
    remarks = 'SDGs 投資事業有限責任組合 transaction notice. Document type could not be confidently detected.'
  }

  return {
    document_type: documentType,
    is_capital_call: documentType === 'capital_call_notice',
    is_distribution: documentType === 'distribution_notice',
    fund_name: 'SDGs 投資事業有限責任組合',
    company_name: '株式会社サードウェーブ',
    currency: 'JPY',

    notice_date: noticeDate,
    transaction_date: transactionDate,
    filename_date: filenameDate,

    payment_amount: paymentAmount,
    payment_due_date: paymentDueDate,
    current_unfunded_commitment: currentUnfunded,
    remaining_after_payment: remainingAfterPayment,
    distribution_amount_from_text: distributionAmount,

    capital_contribution_amount_for_excel: capitalContributionAmount,
    distribution_amount_received_for_excel: distributionAmountReceived,
    reinvestable_amount_for_excel: reinvestableAmount,

    return_of_capital: 0,
    gain: 0,
    interest_other: documentType === 'distribution_notice' ? distributionAmountReceived : 0,
    remarks,

    ocr_or_pdf_text_length: text.length,
  }
}

// ============================================================
// 4. Excel calculations
// ============================================================

function calculateCurrentTransactionCashFlow(
  capitalContributionAmount: number,
  distributionAmountReceived: number,
): number {
  return Math.round(
    (-amountOrZero(capitalContributionAmount) + amountOrZero(distributionAmountReceived)) * 100
  ) / 100
}

export interface SDGPreviousState {
  cumulative_capital_contributions?: number
  remaining_commitment?: number
  cumulative_cash_flow?: number
}

export interface SDGCalculationResult {
  commitment_amount: number | null
  cumulative_capital_contributions: number | null
  remaining_commitment: number | null
  current_transaction_cash_flow: number
  cumulative_cash_flow: number
  cash_flow_for_excel: number
  distribution_not_allocated_to_reinvestment: number
  calculation_sources: Record<string, string>
}

export function calculateExcelFields(
  extractedFields: SDGExtractedFields,
  previousState: SDGPreviousState | null = null,
): SDGCalculationResult {
  const b = amountOrZero(extractedFields.capital_contribution_amount_for_excel)
  const c = amountOrZero(extractedFields.distribution_amount_received_for_excel)
  const d = amountOrZero(extractedFields.reinvestable_amount_for_excel)

  const currentCashFlow = calculateCurrentTransactionCashFlow(b, c)

  const currentUnfunded = extractedFields.current_unfunded_commitment
  const remainingAfterPayment = extractedFields.remaining_after_payment

  let commitmentAmount: number | null = null
  let cumulativeCapitalContributions: number | null = null
  let remainingCommitment = remainingAfterPayment
  let cumulativeCashFlow = currentCashFlow
  let finalCashFlowForExcel = currentCashFlow

  const calculationSources: Record<string, string> = {
    cumulative_capital_contributions: 'not_available_without_previous_state',
    remaining_commitment: 'from_report_remaining_after_payment',
    commitment_amount: 'not_available_without_previous_state',
    cash_flow: 'current_transaction_cash_flow_no_previous_state',
    cumulative_cash_flow: 'current_transaction_cash_flow_no_previous_state',
  }

  if (previousState) {
    const previousE = previousState.cumulative_capital_contributions
    const previousF = previousState.remaining_commitment
    const previousCashFlow = previousState.cumulative_cash_flow

    if (extractedFields.is_capital_call) {
      if (previousE !== null && previousE !== undefined && currentUnfunded !== null && remainingAfterPayment !== null) {
        commitmentAmount = Math.round((previousE + currentUnfunded) * 100) / 100
        cumulativeCapitalContributions = Math.round((commitmentAmount - remainingAfterPayment) * 100) / 100
        remainingCommitment = Math.round(remainingAfterPayment * 100) / 100
        calculationSources['commitment_amount'] = 'previous_E_plus_report_current_unfunded'
        calculationSources['cumulative_capital_contributions'] = 'commitment_amount_minus_report_remaining'
        calculationSources['remaining_commitment'] = 'from_report_remaining_after_payment'
      } else if (previousE !== null && previousE !== undefined) {
        cumulativeCapitalContributions = Math.round((previousE + b) * 100) / 100
        calculationSources['cumulative_capital_contributions'] = 'calculated_from_previous_state_simple'
      } else {
        cumulativeCapitalContributions = b
        calculationSources['cumulative_capital_contributions'] = 'current_row_only_previous_missing'
      }

      if (remainingCommitment === null && previousF !== null && previousF !== undefined) {
        remainingCommitment = Math.round((previousF - b + d) * 100) / 100
        calculationSources['remaining_commitment'] = 'calculated_from_previous_state_simple'
      }
    } else if (extractedFields.is_distribution) {
      if (previousE !== null && previousE !== undefined) {
        cumulativeCapitalContributions = Math.round(previousE * 100) / 100
        calculationSources['cumulative_capital_contributions'] = 'carried_forward_from_previous_state'
      }
      if (previousF !== null && previousF !== undefined) {
        remainingCommitment = Math.round(previousF * 100) / 100
        calculationSources['remaining_commitment'] = 'carried_forward_from_previous_state'
      }
      if (previousE !== null && previousE !== undefined && previousF !== null && previousF !== undefined) {
        commitmentAmount = Math.round((previousE + previousF) * 100) / 100
        calculationSources['commitment_amount'] = 'previous_E_plus_previous_F'
      }
    }

    if (previousCashFlow !== null && previousCashFlow !== undefined) {
      cumulativeCashFlow = Math.round((previousCashFlow + currentCashFlow) * 100) / 100
      finalCashFlowForExcel = cumulativeCashFlow
      calculationSources['cash_flow'] = 'cumulative_cash_flow_calculated_from_previous_state'
      calculationSources['cumulative_cash_flow'] = 'calculated_from_previous_state'
    }
  } else {
    if (extractedFields.is_capital_call) {
      if (currentUnfunded !== null && remainingAfterPayment !== null) {
        commitmentAmount = Math.round(currentUnfunded * 100) / 100
        cumulativeCapitalContributions = Math.round((commitmentAmount - remainingAfterPayment) * 100) / 100
        remainingCommitment = Math.round(remainingAfterPayment * 100) / 100
        calculationSources['commitment_amount'] = 'from_report_current_unfunded_first_row'
        calculationSources['cumulative_capital_contributions'] = 'commitment_amount_minus_report_remaining_first_row'
      } else if (currentUnfunded !== null) {
        commitmentAmount = Math.round(currentUnfunded * 100) / 100
        cumulativeCapitalContributions = Math.round(b * 100) / 100
        remainingCommitment = Math.round((currentUnfunded - b + d) * 100) / 100
        calculationSources['commitment_amount'] = 'from_report_current_unfunded_first_row_no_after_value'
        calculationSources['cumulative_capital_contributions'] = 'current_capital_call_first_row'
        calculationSources['remaining_commitment'] = 'report_current_unfunded_minus_current_B'
      } else {
        cumulativeCapitalContributions = b
        calculationSources['cumulative_capital_contributions'] = 'current_row_only_previous_missing'
      }
    }
  }

  const distributionNotAllocated = Math.round(Math.max(c - d, 0) * 100) / 100

  return {
    commitment_amount: commitmentAmount,
    cumulative_capital_contributions: cumulativeCapitalContributions,
    remaining_commitment: remainingCommitment,
    current_transaction_cash_flow: currentCashFlow,
    cumulative_cash_flow: cumulativeCashFlow,
    cash_flow_for_excel: finalCashFlowForExcel,
    distribution_not_allocated_to_reinvestment: distributionNotAllocated,
    calculation_sources: calculationSources,
  }
}

// ============================================================
// 5. Main extraction function
// ============================================================

export interface SDGExtractionResult {
  source_file_name: string
  extraction_status: 'success' | 'error'
  module_name: string
  document_type: 'distribution_notice' | 'capital_call_notice' | 'unknown_sdg_notice'
  company_name: string
  fund_name: string
  currency: 'JPY'
  extracted_fields: SDGExtractedFields
  calculation_result: SDGCalculationResult
  validation: {
    missing_fields: string[]
    needs_review: boolean
    warnings: string[]
  }
}

export function extractSDGReport(
  text: string,
  fileName: string = '',
  previousState: SDGPreviousState | null = null,
): SDGExtractionResult {
  text = normalizeText(text || '')

  const extractedFields = extractAllFields(text, fileName)
  const calculationResult = calculateExcelFields(extractedFields, previousState)

  const missingFields: string[] = []
  if (!extractedFields.transaction_date) {
    missingFields.push('transaction_date')
  }
  if (extractedFields.is_capital_call && !extractedFields.capital_contribution_amount_for_excel) {
    missingFields.push('capital_contribution_amount')
  }
  if (extractedFields.is_distribution && !extractedFields.distribution_amount_received_for_excel) {
    missingFields.push('distribution_amount_received')
  }
  if (extractedFields.is_capital_call && extractedFields.current_unfunded_commitment === null) {
    missingFields.push('current_unfunded_commitment')
  }
  if (
    extractedFields.is_capital_call &&
    extractedFields.remaining_after_payment === null &&
    extractedFields.current_unfunded_commitment === null
  ) {
    missingFields.push('remaining_after_payment')
  }

  return {
    source_file_name: fileName,
    extraction_status: 'success',
    module_name: 'sdgs_lps_jpy',
    document_type: extractedFields.document_type,
    company_name: extractedFields.company_name,
    fund_name: extractedFields.fund_name,
    currency: 'JPY',
    extracted_fields: extractedFields,
    calculation_result: calculationResult,
    validation: {
      missing_fields: missingFields,
      needs_review: missingFields.length > 0,
      warnings: [
        'Currency is JPY. No FX conversion is performed.',
        'This module does not use Excel fallback values; OCR numeric fallback uses amounts found in the report text only.',
        'For scanned Japanese PDFs, pass Tesseract OCR text; filename date is preferred because OCR can misread Japanese dates.',
        'For accurate cumulative flow, upload SDG reports in transaction date order with previous_state.',
      ],
    },
  }
}
