// Goldman Sachs Vintage X (Flagship) Offshore SCSp — extraction module.
// TypeScript port of goldman_vintage_x_capital_contribution_module.py

import type {
  GoldmanAllFields,
  GoldmanBreakdown,
  GoldmanBreakdownItem,
  GoldmanCalculatedFields,
  GoldmanCalculationResult,
  GoldmanExcelFields,
  GoldmanPreviousState,
  GoldmanReport,
  GoldmanValidation,
} from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NUM: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Matches: $250,000.00 · ($38,405.43) · 5.00% · - · $-
const AMOUNT = '(\\(?\\$?\\s*-?[\\d,]+(?:\\.\\d+)?%?\\)?|\\$?\\s*-)'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cleanAmount(value: string | null, absolute = false): number | null {
  if (value == null) return null
  let v = value.trim()
  if (['-', '$-', '$ -', '—'].includes(v)) return 0
  let negative = false
  if (v.startsWith('(') && v.endsWith(')')) { negative = true; v = v.slice(1, -1) }
  v = v.replace(/\$/g, '').replace(/,/g, '').replace(/%/g, '').replace(/\s/g, '')
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

// Finds the amount following a label (handles 1st..nth occurrence).
function findAmountByLabel(text: string, labels: string[], absolute = true, occurrence = 1): number | null {
  for (const label of labels) {
    const re = new RegExp(escapeRegex(label) + '\\s*:?\\s*' + AMOUNT, 'gi')
    const matches = [...text.matchAll(re)]
    if (matches.length >= occurrence) return cleanAmount(matches[occurrence - 1][1], absolute)
  }
  return null
}

function normalizeDate(s: string | null): string | null {
  if (!s) return null
  s = s.trim()
  let m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/)
  if (m) {
    const mo = MONTH_NUM[m[1].toLowerCase().slice(0, 3)]
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`
  }
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
}

function findFirstDate(text: string): string | null {
  const m = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/)
  return m ? normalizeDate(m[1]) : null
}

function findDueDate(text: string): string | null {
  // "due Monday, February 02, 2026" or "due February 02, 2026"
  const days = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?'
  let m = text.match(new RegExp(
    `due\\s+${days},?\\s*([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})`, 'i',
  ))
  if (m) return normalizeDate(m[1])
  // "by Monday, February 02, 2026"
  m = text.match(new RegExp(
    `by\\s+${days},?\\s*([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})`, 'i',
  ))
  if (m) return normalizeDate(m[1])
  return null
}

function detectCurrency(text: string): string {
  if (text.includes('$') || /\bUSD\b/i.test(text)) return 'USD'
  if (text.includes('¥') || /JPY/i.test(text)) return 'JPY'
  if (/EUR/i.test(text)) return 'EUR'
  return 'unknown'
}

function findCompanyName(text: string): string | null {
  let m = text.match(/Re:\s*([^,\n]+)/i)
  if (m) return m[1].trim().split(/\s+/).join(' ')
  m = text.match(/Limited\s+Partner\s+([^,\n]+)/i)
  if (m) return m[1].trim().split(/\s+/).join(' ')
  return null
}

function detectFundName(text: string): string {
  let m = text.match(/VINTAGE\s+X\s*\([^)]+\)\s+\w+\s+\w+/i)
  if (m) return m[0].trim()
  m = text.match(/Vintage\s+X\s*\([^)]+\)\s+Offshore\s+SCSp/i)
  if (m) return m[0].trim()
  return 'Vintage X (Flagship) Offshore SCSp'
}

// ── Extraction ─────────────────────────────────────────────────────────────────

function extractAllFields(text: string): GoldmanAllFields {
  const noticeDate = findFirstDate(text)
  const dueDate    = findDueDate(text)

  // "Commitment: $20,000,000.00"
  const commitmentM = text.match(/Commitment:\s*\$?\s*([\d,]+(?:\.\d+)?)/i)
  const commitmentAmount = commitmentM ? cleanAmount(commitmentM[1], true) : null

  const totalCommitment     = findAmountByLabel(text, ['Total Commitment'], true)
  const secondaryInvestments = findAmountByLabel(text, ['Secondary Investment(s)', 'Secondary Investments'], true)
  const grossContribution    = findAmountByLabel(text, ['Gross Contribution'], true)

  // "Contributions to Date (400,000.00)" — parentheses are treated as positive (absolute)
  const contributionsToDate  = findAmountByLabel(text, ['Contributions to Date'], true)
  const outstandingCommitment = findAmountByLabel(text, ['Outstanding Commitment'], true)

  // "Your portion of the capital contribution is as follows: ... Amount $400,000.00"
  const fundingM1 = text.match(
    /Your\s+portion\s+of\s+the\s+capital\s+contribution\s+is\s+as\s+follows:[\s\S]*?Amount\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
  )
  let fundingAmount: number | null = fundingM1 ? cleanAmount(fundingM1[1], true) : null

  if (fundingAmount == null) {
    // Fallback: last "Amount $X" in document
    const allAmounts = [...text.matchAll(/\bAmount\s*\$?\s*([\d,]+(?:\.\d+)?)/gi)]
    if (allAmounts.length > 0) {
      fundingAmount = cleanAmount(allAmounts[allAmounts.length - 1][1], true)
    }
  }

  const currencyM = text.match(/Currency:\s*\n?\s*([A-Z]{3})/i)
  const bankM     = text.match(/Recipient\s+Bank\s+Name:\s*\n?\s*([^\n]+)/i)
  const abaM      = text.match(/ABA:\s*\n?\s*([0-9]+)/i)
  const acctNameM = text.match(/Recipient\s+Bank\s+Acct\s+Name:\s*\n?\s*([^\n]+)/i)
  const acctNumM  = text.match(/Recipient\s+Bank\s+Acct\s+Number:\s*\n?\s*([0-9]+)/i)
  const refM      = text.match(/Reference:\s*\n?\s*([^\n]+)/i)
  const bicM      = text.match(/BIC\s*#?.*?:\s*([A-Z0-9]+)/i)

  return {
    notice_date: noticeDate,
    due_date: dueDate,
    commitment_amount: commitmentAmount,
    total_commitment: totalCommitment,
    secondary_investments: secondaryInvestments,
    gross_contribution: grossContribution,
    contributions_to_date: contributionsToDate,
    outstanding_commitment: outstandingCommitment,
    funding_amount: fundingAmount,
    currency_from_instruction: currencyM ? currencyM[1].toUpperCase() : null,
    recipient_bank_name: bankM ? bankM[1].trim() : null,
    aba_number: abaM ? abaM[1].trim() : null,
    recipient_account_name: acctNameM ? acctNameM[1].trim() : null,
    recipient_account_number: acctNumM ? acctNumM[1].trim() : null,
    reference: refM ? refM[1].trim() : null,
    bic_code: bicM ? bicM[1].trim() : null,
  }
}

// ── Breakdown ──────────────────────────────────────────────────────────────────

function buildBreakdown(a: GoldmanAllFields): GoldmanBreakdown {
  const capital_call_breakdown: GoldmanBreakdownItem[] = []

  if (a.secondary_investments != null) {
    capital_call_breakdown.push({
      purpose: 'secondary_investments',
      label: 'Secondary Investment(s)',
      amount: a.secondary_investments,
      excel_usage: 'capital_contribution_amount_component',
    })
  }

  if (a.gross_contribution != null) {
    capital_call_breakdown.push({
      purpose: 'gross_contribution',
      label: 'Gross Contribution',
      amount: a.gross_contribution,
      excel_usage: 'reported_total_capital_contribution',
    })
  }

  return { capital_call_breakdown, distribution_breakdown: [] }
}

// ── Excel mapping ──────────────────────────────────────────────────────────────

function calculateCurrentTransactionCashFlow(b: number, c: number): number {
  return round2(-b + c)
}

function mapToExcelFields(a: GoldmanAllFields, breakdown: GoldmanBreakdown): GoldmanExcelFields {
  const commitmentAmount = a.commitment_amount ?? a.total_commitment

  // Gross Contribution > Secondary Investment(s) > funding_amount
  const capitalContributionAmount =
    a.gross_contribution ?? a.secondary_investments ?? a.funding_amount ?? 0

  const distributionAmountReceived = 0
  const reinvestableAmount = 0

  const cashFlow = calculateCurrentTransactionCashFlow(capitalContributionAmount, distributionAmountReceived)

  const remarks =
    'Goldman Sachs Vintage X capital contribution notice. ' +
    'Capital contribution amount uses Gross Contribution if available. ' +
    'Distribution and reinvestable amounts are 0 for this capital contribution notice.'

  return {
    subscription_agreement_effective_date: null,
    commitment_amount: commitmentAmount,
    transaction_date: a.due_date,
    capital_contribution_amount: capitalContributionAmount,
    distribution_amount_received: distributionAmountReceived,
    reinvestable_amount: reinvestableAmount,
    cumulative_capital_contributions: a.contributions_to_date,
    remaining_commitment_formula_value: a.outstanding_commitment,
    remaining_commitment: a.outstanding_commitment,
    cash_flow: cashFlow,
    remarks,
    distribution_details: breakdown.distribution_breakdown,
    distribution_not_allocated_to_reinvestment: 0,
  }
}

// ── Calculation ────────────────────────────────────────────────────────────────

function calculateExcelFields(
  excel: GoldmanExcelFields,
  a: GoldmanAllFields,
  previousState: GoldmanPreviousState | null = null,
): GoldmanCalculationResult {
  const b = amountOrZero(excel.capital_contribution_amount)
  const d = amountOrZero(excel.reinvestable_amount)
  const c = amountOrZero(excel.distribution_amount_received)

  const reportE = a.contributions_to_date
  const reportF = a.outstanding_commitment

  let cumulativeContributions: number | null = reportE
  let remainingCommitment: number | null = reportF
  let cumulativeCashFlow: number | null = null

  const calculationSources: Record<string, string> = {
    cumulative_capital_contributions: 'from_report_contributions_to_date_no_previous_state',
    remaining_commitment: 'from_report_outstanding_commitment_no_previous_state',
    cash_flow: 'from_report_cumulative_contributions_no_previous_state',
    cumulative_cash_flow: 'from_report_cumulative_contributions_no_previous_state',
  }

  const currentCashFlow = calculateCurrentTransactionCashFlow(b, c)

  // No previous state — cash flow = -cumulative contributions to date (first transaction pattern)
  let finalCashFlowForExcel: number
  if (reportE != null) {
    finalCashFlowForExcel = round2(-reportE)
    cumulativeCashFlow = finalCashFlowForExcel
  } else {
    finalCashFlowForExcel = currentCashFlow
    calculationSources.cash_flow = 'current_transaction_cash_flow_no_previous_state'
    calculationSources.cumulative_cash_flow = 'not_calculated_previous_state_missing'
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

  const distributionNotAllocated = round2(Math.max(c - d, 0))

  const calculatedFields: GoldmanCalculatedFields = {
    cumulative_capital_contributions: cumulativeContributions,
    remaining_commitment_formula_value: remainingCommitment,
    remaining_commitment: remainingCommitment,
    current_transaction_cash_flow: currentCashFlow,
    cumulative_cash_flow: cumulativeCashFlow,
    cash_flow_for_excel: finalCashFlowForExcel,
    distribution_not_allocated_to_reinvestment: distributionNotAllocated,
    remarks: excel.remarks,
    distribution_details: excel.distribution_details,
  }

  return {
    input_values_for_current_row: {
      subscription_agreement_effective_date: excel.subscription_agreement_effective_date,
      commitment_amount: excel.commitment_amount,
      transaction_date: excel.transaction_date,
      capital_contribution_amount: b,
      distribution_amount_received: c,
      reinvestable_amount: d,
    },
    previous_state_used: previousState,
    calculated_excel_fields: calculatedFields,
    calculation_sources: calculationSources,
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

function buildValidation(
  excel: GoldmanExcelFields,
  a: GoldmanAllFields,
  _breakdown: GoldmanBreakdown,
  calculationResult: GoldmanCalculationResult,
): GoldmanValidation {
  const requiredFields: (keyof GoldmanExcelFields)[] = [
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

  const secondary = a.secondary_investments
  const gross     = a.gross_contribution
  const funding   = a.funding_amount

  const secondaryMatchesGross = secondary != null && gross != null
    ? round2(secondary) === round2(gross) : null
  const fundingMatchesGross = funding != null && gross != null
    ? round2(funding) === round2(gross) : null

  const commitment = excel.commitment_amount
  const reportE = a.contributions_to_date
  const reportF = a.outstanding_commitment

  let commitmentMinusE: number | null = null
  let commitmentMinusEMatchesF: number | boolean | null = null
  if (commitment != null && reportE != null) {
    commitmentMinusE = round2(commitment - reportE)
    if (reportF != null) commitmentMinusEMatchesF = round2(commitmentMinusE) === round2(reportF)
  }

  const cc = calculationResult.calculated_excel_fields

  return {
    missing_excel_fields: missing,
    matched_excel_fields: matched,
    calculation_checks: {
      secondary_investments: secondary,
      gross_contribution: gross,
      funding_amount: funding,
      secondary_matches_gross: secondaryMatchesGross,
      funding_amount_matches_gross: fundingMatchesGross,
      commitment_amount: commitment,
      report_contributions_to_date: reportE,
      report_outstanding_commitment: reportF,
      commitment_minus_contributions_to_date: commitmentMinusE,
      commitment_minus_contributions_matches_outstanding: commitmentMinusEMatchesF,
      calculated_cumulative_capital_contributions: cc.cumulative_capital_contributions,
      calculated_remaining_commitment: cc.remaining_commitment,
      current_transaction_cash_flow: cc.current_transaction_cash_flow,
      cumulative_cash_flow: cc.cumulative_cash_flow,
      cash_flow_for_excel: cc.cash_flow_for_excel,
    },
    needs_review: true,
    warnings: [
      'This module supports Goldman Sachs Vintage X capital contribution notices.',
      'Capital contribution amount uses Gross Contribution if available.',
      'Cash flow is calculated using -capital_contribution_amount + distribution_amount_received.',
      'If previous_state values are provided, formula fields use previous_state instead of report cumulative values.',
    ],
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function extractGoldmanVintageXReport(
  rawText: string,
  fileName = '',
  previousState: GoldmanPreviousState | null = null,
): GoldmanReport {
  const text = normalizeText(rawText)
  const allFields = extractAllFields(text)
  const breakdown = buildBreakdown(allFields)
  const excelFields = mapToExcelFields(allFields, breakdown)
  const calculationResult = calculateExcelFields(excelFields, allFields, previousState)
  const validation = buildValidation(excelFields, allFields, breakdown, calculationResult)

  const calculated = calculationResult.calculated_excel_fields

  const finalExcelFields: GoldmanExcelFields = { ...excelFields }
  finalExcelFields.cumulative_capital_contributions = calculated.cumulative_capital_contributions ?? finalExcelFields.cumulative_capital_contributions
  finalExcelFields.remaining_commitment_formula_value = calculated.remaining_commitment_formula_value ?? finalExcelFields.remaining_commitment_formula_value
  finalExcelFields.remaining_commitment = calculated.remaining_commitment ?? finalExcelFields.remaining_commitment
  finalExcelFields.cash_flow = calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow
  finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow
  finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow
  finalExcelFields.distribution_not_allocated_to_reinvestment =
    calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment

  return {
    source_file_name: fileName,
    extraction_status: 'success',
    module_name: 'goldman_sachs_vintage_x_capital_contribution',
    document_type: 'capital_contribution_notice',
    company_name: findCompanyName(text),
    fund_name: detectFundName(text),
    currency: allFields.currency_from_instruction ?? detectCurrency(text),
    excel_fields: excelFields,
    all_extracted_fields: allFields,
    breakdown,
    validation,
    calculation_result: { ...calculationResult, final_excel_fields_for_frontend: finalExcelFields },
    final_excel_fields: finalExcelFields,
  }
}
