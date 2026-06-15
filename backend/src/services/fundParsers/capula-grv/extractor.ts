// Capula Global Relative Value Trust — extraction module.
// TypeScript port of capula_grv_distribution_module.py

import type {
  CapulaAllFields,
  CapulaBreakdown,
  CapulaBreakdownItem,
  CapulaCalculatedFields,
  CapulaCalculationResult,
  CapulaExcelFields,
  CapulaPreviousState,
  CapulaReport,
  CapulaValidation,
} from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NUM: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

const AMOUNT = '(\\$?\\s*\\(?\\s*-?[\\d,]+(?:\\.\\d+)?%?\\s*\\)?|\\$?\\s*-)'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cleanAmount(value: string | null, absolute = false): number | null {
  if (value == null) return null
  let v = value.trim()
  if (['-', '$-', '$ -'].includes(v)) return 0
  v = v.replace(/\$/g, '').replace(/\xa0/g, '').trim()
  let negative = false
  if (v.startsWith('(') && v.endsWith(')')) { negative = true; v = v.slice(1, -1) }
  v = v.replace(/,/g, '').replace(/%/g, '').replace(/\s/g, '')
  if (v === '' || v === '-') return 0
  const n = parseFloat(v)
  if (Number.isNaN(n)) return null
  let amount = negative ? -n : n
  if (absolute) amount = Math.abs(amount)
  return amount
}

function amountOrZero(value: number | null | undefined): number {
  return value != null ? Number(value) : 0
}

function normalizeDate(s: string | null): string | null {
  if (!s) return null
  s = s.trim()
  // "Jan-05-2025"
  let m = s.match(/^([A-Za-z]{3})-(\d{1,2})-(\d{4})$/)
  if (m) {
    const mo = MONTH_NUM[m[1].toLowerCase()]
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`
  }
  // "Jan-05-25"
  m = s.match(/^([A-Za-z]{3})-(\d{1,2})-(\d{2})$/)
  if (m) {
    const mo = MONTH_NUM[m[1].toLowerCase()]
    const year = parseInt(m[3]) < 50 ? `20${m[3]}` : `19${m[3]}`
    if (mo) return `${year}-${mo}-${m[2].padStart(2, '0')}`
  }
  // "January 5, 2025"
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/)
  if (m) {
    const mo = MONTH_NUM[m[1].toLowerCase().slice(0, 3)]
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`
  }
  // "1/5/2025"
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return s
}

export function normalizeText(text: string): string {
  return text
    .replace(/\xa0/g, ' ')
    .replace(/​/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function findAmountByLabel(text: string, labels: string[], absolute = true, occurrence = 1): number | null {
  for (const label of labels) {
    const re = new RegExp(escapeRegex(label) + '\\s*:?\\s*' + AMOUNT, 'gi')
    const matches = [...text.matchAll(re)]
    if (matches.length >= occurrence) return cleanAmount(matches[occurrence - 1][1], absolute)
  }
  return null
}

function findTextByLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(escapeRegex(label) + '\\s*:?\\s*([^\\n|]+)', 'i')
    const m = text.match(re)
    if (m) return m[1].trim().split(/\s+/).join(' ')
  }
  return null
}

function findDateByLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      escapeRegex(label) + '\\s*:?\\s*([A-Za-z]{3}-\\d{1,2}-\\d{4}|\\d{1,2}/\\d{1,2}/\\d{4}|[A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})',
      'i',
    )
    const m = text.match(re)
    if (m) return normalizeDate(m[1])
  }
  return null
}

// "Capula_06052025" → day=06, month=05, year=2025 → "2025-05-06"
function parseFilenameDate(fileName: string): string | null {
  const m = (fileName || '').match(/Capula[_-](\d{2})(\d{2})(\d{4})/i)
  if (!m) return null
  const day = parseInt(m[1])
  const month = parseInt(m[2])
  const year = parseInt(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function detectCurrency(text: string): string {
  const currency = findTextByLabel(text, ['Currency'])
  if (currency && /^[A-Z]{3}$/.test(currency.trim().toUpperCase())) return currency.trim().toUpperCase()
  if (text.includes('$') || /\bUSD\b/i.test(text)) return 'USD'
  return 'unknown'
}

function findCompanyName(text: string): string | null {
  const m = text.match(/^(Thirdwave [^\n]+?)\s+Series ID/im)
  if (m) return m[1].trim().split(/\s+/).join(' ')
  return findTextByLabel(text, ['InvRef'])
}

function detectFundName(text: string): string {
  const m = text.match(/Capula\s+Global\s+Relative\s+Value\s+Trust[^\n]*/i)
  return m ? m[0].trim().split(/\s+/).join(' ') : 'Capula Global Relative Value Trust'
}

// ── Extraction ─────────────────────────────────────────────────────────────────

function extractAllFields(text: string, fileName = ''): CapulaAllFields {
  const tranType   = findTextByLabel(text, ['Tran_Type'])
  const contractNo = findTextByLabel(text, ['Contract No.'])
  const fundCode   = findTextByLabel(text, ['Fund Code', 'Fund_Code'])
  const seriesId   = findTextByLabel(text, ['Series ID', 'Series_Code'])
  const entityId   = findTextByLabel(text, ['Entity ID', 'Entity_ID'])
  const subEntityId = findTextByLabel(text, ['Sub-Entity ID', 'Sub Entity_ID'])

  const noticeDate      = findDateByLabel(text, ['Date'])
  const valuationNavDate = findDateByLabel(text, ['Valuation/NAV Date'])
  const tradeDate       = findDateByLabel(text, ['Trade Date'])
  const filenameDate    = parseFilenameDate(fileName)

  const transactionDate = tradeDate ?? valuationNavDate ?? noticeDate ?? filenameDate

  const isSubscription = !!(tranType && /subscription/i.test(tranType))
    || /subscription of shares/i.test(text)

  const isDistribution = !!(tranType && /distribution/i.test(tranType))
    || /amount distributed/i.test(text)

  const sharesIssued              = findAmountByLabel(text, ['Shares Issued'], true)
  const subscriptionPrice         = findAmountByLabel(text, ['Subscription Price'], true)
  const netCapitalContribution    = findAmountByLabel(text, ['Net Capital Contribution'], true)
  const totalConsiderationReceived = findAmountByLabel(text, ['Total Consideration Received For Trade Date'], true)
  const capitalBalance            = findAmountByLabel(text, ['Capital Balance'], true)
  const distribution              = findAmountByLabel(text, ['Distribution'], true)
  const shareBalanceToDate        = findAmountByLabel(text, ['Share Balance To Date'], true)

  let capitalContributionAmountForExcel: number
  let distributionAmountReceivedForExcel: number

  if (isSubscription) {
    capitalContributionAmountForExcel    = netCapitalContribution ?? totalConsiderationReceived ?? 0
    distributionAmountReceivedForExcel   = 0
  } else if (isDistribution) {
    capitalContributionAmountForExcel    = 0
    distributionAmountReceivedForExcel   = distribution ?? 0
  } else {
    capitalContributionAmountForExcel    = netCapitalContribution ?? 0
    distributionAmountReceivedForExcel   = distribution ?? 0
  }

  const commitmentAmount = netCapitalContribution ?? totalConsiderationReceived

  const reportCumulativeCapitalContributions = isSubscription ? capitalContributionAmountForExcel : null
  const reportRemainingCommitment = isSubscription ? 0 : null

  return {
    tran_type: tranType,
    contract_no: contractNo,
    fund_code: fundCode,
    series_id: seriesId,
    entity_id: entityId,
    sub_entity_id: subEntityId,
    notice_date: noticeDate,
    valuation_nav_date: valuationNavDate,
    trade_date: tradeDate,
    transaction_date: transactionDate,
    filename_date: filenameDate,
    is_subscription: isSubscription,
    is_distribution: isDistribution,
    shares_issued: sharesIssued,
    subscription_price: subscriptionPrice,
    net_capital_contribution: netCapitalContribution,
    total_consideration_received: totalConsiderationReceived,
    capital_balance: capitalBalance,
    distribution,
    share_balance_to_date: shareBalanceToDate,
    commitment_amount: commitmentAmount,
    capital_contribution_amount_for_excel: capitalContributionAmountForExcel,
    distribution_amount_received_for_excel: distributionAmountReceivedForExcel,
    reinvestable_amount_for_excel: 0,
    report_cumulative_capital_contributions: reportCumulativeCapitalContributions,
    report_remaining_commitment: reportRemainingCommitment,
  }
}

// ── Breakdown ──────────────────────────────────────────────────────────────────

function buildBreakdown(a: CapulaAllFields): CapulaBreakdown {
  const capital_call_breakdown: CapulaBreakdownItem[] = []
  const distribution_breakdown: CapulaBreakdownItem[] = []

  if (a.net_capital_contribution != null) {
    capital_call_breakdown.push({
      purpose: 'subscription',
      label: 'Net Capital Contribution',
      amount: a.net_capital_contribution,
      excel_usage: 'capital_contribution_amount',
    })
  }

  if (a.total_consideration_received != null) {
    capital_call_breakdown.push({
      purpose: 'subscription_total_consideration',
      label: 'Total Consideration Received For Trade Date',
      amount: a.total_consideration_received,
      excel_usage: 'validation_actual_payment',
    })
  }

  if (a.distribution != null) {
    distribution_breakdown.push({
      purpose: 'distribution',
      label: 'Distribution',
      amount: a.distribution,
      excel_usage: 'distribution_amount_received',
    })
  }

  return { capital_call_breakdown, distribution_breakdown }
}

// ── Excel mapping ──────────────────────────────────────────────────────────────

function calculateCurrentTransactionCashFlow(b: number, c: number): number {
  return round2(-b + c)
}

function mapToExcelFields(a: CapulaAllFields, breakdown: CapulaBreakdown): CapulaExcelFields {
  const b = a.capital_contribution_amount_for_excel
  const c = a.distribution_amount_received_for_excel
  const d = a.reinvestable_amount_for_excel

  const cashFlow = calculateCurrentTransactionCashFlow(b, c)

  const remarksParts = ['Capula Global Relative Value Trust transaction notice.']
  if (a.is_subscription) remarksParts.push('Subscription notice. Net Capital Contribution is used as capital contribution amount.')
  else if (a.is_distribution) remarksParts.push('Distribution notice. Distribution is used as investment received amount.')
  if (a.capital_balance != null) remarksParts.push('Capital Balance is extracted separately as NAV/capital balance and is not used as cumulative contribution.')

  return {
    subscription_agreement_effective_date: null,
    commitment_amount: a.commitment_amount,
    transaction_date: a.transaction_date,
    mufg_ttm: null,
    capital_contribution_amount: b,
    distribution_amount_received: c,
    reinvestable_amount: d,
    cumulative_capital_contributions: a.report_cumulative_capital_contributions,
    remaining_commitment_formula_value: a.report_remaining_commitment,
    remaining_commitment: a.report_remaining_commitment,
    cash_flow: cashFlow,
    remarks: remarksParts.join(' '),
    distribution_details: breakdown.distribution_breakdown,
    distribution_not_allocated_to_reinvestment: round2(Math.max(c - d, 0)),
    capital_balance: a.capital_balance,
    share_balance_to_date: a.share_balance_to_date,
    shares_issued: a.shares_issued,
    subscription_price: a.subscription_price,
  }
}

// ── Calculation ────────────────────────────────────────────────────────────────

function calculateExcelFields(
  excel: CapulaExcelFields,
  a: CapulaAllFields,
  previousState: CapulaPreviousState | null = null,
): CapulaCalculationResult {
  const b = amountOrZero(excel.capital_contribution_amount)
  const c = amountOrZero(excel.distribution_amount_received)
  const d = amountOrZero(excel.reinvestable_amount)

  const currentCashFlow = calculateCurrentTransactionCashFlow(b, c)

  let cumulativeContributions: number | null = a.report_cumulative_capital_contributions
  let remainingCommitment: number | null = a.report_remaining_commitment
  let cumulativeCashFlow = currentCashFlow
  let finalCashFlowForExcel = currentCashFlow

  const calculationSources: Record<string, string> = {
    cumulative_capital_contributions: 'from_report_subscription_no_previous_state',
    remaining_commitment: 'from_report_or_zero_no_previous_state',
    cash_flow: 'current_transaction_cash_flow_no_previous_state',
    cumulative_cash_flow: 'current_transaction_cash_flow_no_previous_state',
  }

  if (previousState) {
    const prevE = previousState.cumulative_capital_contributions
    const prevF = previousState.remaining_commitment
    const prevCashFlow = previousState.cumulative_cash_flow

    if (prevE != null) {
      cumulativeContributions = round2(Number(prevE) + b)
      calculationSources.cumulative_capital_contributions = 'calculated_from_previous_state'
    }
    if (prevF != null) {
      remainingCommitment = round2(Number(prevF) - b + d)
      calculationSources.remaining_commitment = 'calculated_from_previous_state'
    }
    if (prevCashFlow != null) {
      cumulativeCashFlow = round2(Number(prevCashFlow) + currentCashFlow)
      finalCashFlowForExcel = cumulativeCashFlow
      calculationSources.cash_flow = 'cumulative_cash_flow_calculated_from_previous_state'
      calculationSources.cumulative_cash_flow = 'calculated_from_previous_state'
    }
  }

  if (!previousState && a.is_distribution) {
    calculationSources.cumulative_capital_contributions = 'not_available_distribution_report_without_previous_state'
    calculationSources.remaining_commitment = 'not_available_distribution_report_without_previous_state'
  }

  const distributionNotAllocated = round2(Math.max(c - d, 0))

  const calculatedFields: CapulaCalculatedFields = {
    cumulative_capital_contributions: cumulativeContributions,
    remaining_commitment_formula_value: remainingCommitment,
    remaining_commitment: remainingCommitment,
    current_transaction_cash_flow: currentCashFlow,
    cumulative_cash_flow: cumulativeCashFlow,
    cash_flow_for_excel: finalCashFlowForExcel,
    distribution_not_allocated_to_reinvestment: distributionNotAllocated,
    remarks: excel.remarks,
    distribution_details: excel.distribution_details,
    capital_balance: excel.capital_balance,
    share_balance_to_date: excel.share_balance_to_date,
  }

  return {
    input_values_for_current_row: {
      subscription_agreement_effective_date: excel.subscription_agreement_effective_date,
      commitment_amount: excel.commitment_amount,
      transaction_date: excel.transaction_date,
      capital_contribution_amount: b,
      distribution_amount_received: c,
      reinvestable_amount: d,
      capital_balance: excel.capital_balance,
      share_balance_to_date: excel.share_balance_to_date,
    },
    previous_state_used: previousState,
    calculated_excel_fields: calculatedFields,
    calculation_sources: calculationSources,
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

function buildValidation(
  excel: CapulaExcelFields,
  a: CapulaAllFields,
  _breakdown: CapulaBreakdown,
  calculationResult: CapulaCalculationResult,
): CapulaValidation {
  const requiredFields: (keyof CapulaExcelFields)[] = [
    'subscription_agreement_effective_date', 'commitment_amount', 'transaction_date',
    'capital_contribution_amount', 'distribution_amount_received', 'reinvestable_amount',
    'cumulative_capital_contributions', 'remaining_commitment', 'cash_flow',
    'remarks', 'distribution_details',
  ]

  const missing: string[] = []
  const matched: string[] = []
  for (const f of requiredFields) {
    const v = excel[f]
    if (v == null || v === '') missing.push(f)
    else matched.push(f)
  }

  const subscriptionMatch = a.net_capital_contribution != null && a.total_consideration_received != null
    ? round2(a.net_capital_contribution) === round2(a.total_consideration_received) : null

  const cc = calculationResult.calculated_excel_fields

  return {
    missing_excel_fields: missing,
    matched_excel_fields: matched,
    calculation_checks: {
      excel_b_capital_contribution_amount: excel.capital_contribution_amount,
      excel_c_distribution_amount_received: excel.distribution_amount_received,
      excel_d_reinvestable_amount: excel.reinvestable_amount,
      current_transaction_cash_flow: cc.current_transaction_cash_flow,
      net_capital_contribution: a.net_capital_contribution,
      total_consideration_received: a.total_consideration_received,
      subscription_amounts_match: subscriptionMatch,
      distribution: a.distribution,
      capital_balance_nav: a.capital_balance,
      share_balance_to_date: a.share_balance_to_date,
      calculated_cumulative_capital_contributions: cc.cumulative_capital_contributions,
      calculated_remaining_commitment: cc.remaining_commitment,
      cumulative_cash_flow: cc.cumulative_cash_flow,
      cash_flow_for_excel: cc.cash_flow_for_excel,
    },
    needs_review: a.is_distribution && !calculationResult.previous_state_used,
    warnings: [
      'This module supports Capula subscription and distribution notices.',
      'Capital Balance is NAV/capital balance and is not used as cumulative capital contribution.',
      'Provided CGRV Excel uses reinvestable_amount as 0 for the uploaded Capula samples.',
      'For accurate DB cumulative flow, upload reports in transaction date order.',
    ],
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function extractCapulaGrvReport(
  rawText: string,
  fileName = '',
  previousState: CapulaPreviousState | null = null,
): CapulaReport {
  const text = normalizeText(rawText)
  const allFields = extractAllFields(text, fileName)
  const breakdown = buildBreakdown(allFields)
  const excelFields = mapToExcelFields(allFields, breakdown)
  const calculationResult = calculateExcelFields(excelFields, allFields, previousState)
  const validation = buildValidation(excelFields, allFields, breakdown, calculationResult)

  const calculated = calculationResult.calculated_excel_fields

  const finalExcelFields: CapulaExcelFields = { ...excelFields }
  finalExcelFields.cumulative_capital_contributions = calculated.cumulative_capital_contributions ?? finalExcelFields.cumulative_capital_contributions
  finalExcelFields.remaining_commitment_formula_value = calculated.remaining_commitment_formula_value ?? finalExcelFields.remaining_commitment_formula_value
  finalExcelFields.remaining_commitment = calculated.remaining_commitment ?? finalExcelFields.remaining_commitment
  finalExcelFields.cash_flow = calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow
  finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow
  finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow
  finalExcelFields.distribution_not_allocated_to_reinvestment =
    calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment

  let documentType = 'capula_transaction_notice'
  if (allFields.is_subscription) documentType = 'subscription_notice'
  else if (allFields.is_distribution) documentType = 'distribution_notice'

  return {
    source_file_name: fileName,
    extraction_status: 'success',
    module_name: 'capula_global_relative_value_trust',
    document_type: documentType,
    company_name: findCompanyName(text),
    fund_name: detectFundName(text),
    currency: detectCurrency(text),
    excel_fields: excelFields,
    all_extracted_fields: allFields,
    breakdown,
    validation,
    calculation_result: { ...calculationResult, final_excel_fields_for_frontend: finalExcelFields },
    final_excel_fields: finalExcelFields,
  }
}
