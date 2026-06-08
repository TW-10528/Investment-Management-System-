// Hamilton Lane Secondary Fund VI-B LP — extraction module.
//
// Faithful TypeScript port of the reference Python module
// `hamilton_secondary_trueup_capital_call_module.py`.
//
// Handles BOTH Capital Call and Distribution notices:
//   B  capital_contribution_amount = capital-call components only
//        (investments + management fees + expenses; EXCLUDES subsequent-close interest)
//   C  distribution_amount_received = distribution transaction total (positive)
//   D  reinvestable_amount = recallable distribution components only
//   E  cumulative_capital_contributions = prev E + B  (or report "Amounts drawn")
//   F  remaining_commitment = prev F - B + D  (or report "Remaining unfunded commitment")
//   G  current_transaction_cash_flow = -B + C
//   cumulative cash flow = prev cumulative + G  (or -Amounts drawn + Cumulative distributions)

import type {
  HamiltonAllFields, HamiltonBreakdown, HamiltonBreakdownItem, HamiltonCalculatedFields,
  HamiltonCalculationResult, HamiltonExcelFields, HamiltonLaneReport, HamiltonPreviousState,
  HamiltonValidation,
} from './types'

// ── Amount / date helpers (mirror the Python utilities) ────────────────────────

// Hamilton pattern also matches the "$(1,234)" form (dollar before the paren).
const AMOUNT = '(\\$?\\s*\\([\\d,]+(?:\\.\\d+)?%?\\)|\\(?\\$?\\s*-?[\\d,]+(?:\\.\\d+)?%?\\)?|\\$?\\s*-)'

const MONTH_NUM: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function amountOrZero(v: number | null | undefined): number {
  return v != null ? v : 0
}

// Hamilton clean_amount: strips $/¥/,/%/space FIRST, then handles ( ) as negative.
function cleanAmount(value: string | null, absolute = false): number | null {
  if (value == null) return null
  let v = String(value).trim()
  if (['-', '$-', '$ -', '—'].includes(v)) return 0
  v = v.replace(/\$/g, '').replace(/¥/g, '').replace(/,/g, '').replace(/%/g, '').replace(/\s/g, '')
  let negative = false
  if (v.startsWith('(') && v.endsWith(')')) { negative = true; v = v.slice(1, -1) }
  if (v === '' || v === '-') return 0
  const n = parseFloat(v)
  if (Number.isNaN(n)) return null
  let amount = negative ? -n : n
  if (absolute) amount = Math.abs(amount)
  return amount
}

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

function findFirstDate(text: string): string | null {
  const m = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/)
  return m ? normalizeDate(m[1]) : null
}

function findDateByLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(escapeRegex(label) + '\\s*:?\\s*([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})', 'i')
    const m = text.match(re)
    if (m) return normalizeDate(m[1])
  }
  return null
}

// "September 25, 2024 Transaction" → that date; else fall back to due-date labels.
function findTransactionDate(text: string): string | null {
  const m = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+Transaction\b/i)
  if (m) return normalizeDate(m[1])
  return findDateByLabel(text, ['Capital Call Due Date', 'Distribution Due Date'])
}

// Hamilton normalize_text also collapses leading whitespace after newlines + trims.
export function normalizeText(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/​/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function detectCurrency(text: string): string {
  if (text.includes('$')) return 'USD'
  if (text.includes('¥') || text.toUpperCase().includes('JPY')) return 'JPY'
  if (text.includes('€') || text.toUpperCase().includes('EUR')) return 'EUR'
  return 'unknown'
}

function detectDocumentType(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('re: distribution') || lower.includes('distribution amount:')) return 'distribution_notice'
  if (lower.includes('re: capital call') || lower.includes('capital call amount:')) return 'capital_call_notice'
  return 'unknown_notice'
}

function findCompanyName(text: string): string | null {
  const investor = text.match(/Investor:\s*([^\n]+)/i)
  if (investor) return investor[1].trim().split(/\s+/).join(' ')
  const m = text.match(/Hamilton Lane Secondary Fund VI-B LP\s*\n\s*([A-Za-z0-9 .,&'-]+?)\s*\n\s*Current Transaction Detail/i)
  if (m) return m[1].trim().split(/\s+/).join(' ')
  return null
}

// ── Extraction ─────────────────────────────────────────────────────────────────

function extractAllFields(text: string): HamiltonAllFields {
  const documentType = detectDocumentType(text)
  const noticeDate = findFirstDate(text)
  const transactionDate = findTransactionDate(text)

  const capitalCallDueDate = findDateByLabel(text, ['Capital Call Due Date'])
  const distributionDueDate = findDateByLabel(text, ['Distribution Due Date'])

  const capitalCallAmountHeader = findAmountByLabel(text, ['Capital Call Amount'], true)
  const distributionAmountHeader = findAmountByLabel(text, ['Distribution Amount'], true)

  // Current transaction total: positive for capital calls, negative/parenthesised for distributions.
  const transactionTotalSigned = findAmountByLabel(text, ['Transaction total'], false)
  const transactionTotalAbs = transactionTotalSigned != null ? Math.abs(transactionTotalSigned) : null

  // Capital-call components (included in Excel B).
  const capitalCallForInvestments = findAmountByLabel(text, ['Capital call for investments'], true)
  const capitalCallForManagementFees = findAmountByLabel(text, ['Capital call for management fees'], true)
  const capitalCallForExpenses = findAmountByLabel(text, ['Capital call for expenses'], true)

  // Interest true-up items (extracted but excluded from Excel B/C).
  const subsequentCloseInterestPayable = findAmountByLabel(text, ['Subsequent close interest payable'], true)
  const subsequentCloseInterestReceivable = findAmountByLabel(text, ['Subsequent close interest (receivable)'], true)

  // Distribution components (absolute positive for Excel C / details).
  const distReturnCapital = findAmountByLabel(text, ['Distribution of return of capital'], true)
  const distReturnCapitalRecallable = findAmountByLabel(text, ['Distribution of return of capital (recallable)'], true)
  const distInvestmentIncome = findAmountByLabel(text, ['Distribution of investment income'], true)
  const distInvestmentIncomeRecallable = findAmountByLabel(text, ['Distribution of investment income (recallable)'], true)
  const distRealizedGain = findAmountByLabel(text, ['Distribution of realized gain'], true)
  const distRealizedGainRecallable = findAmountByLabel(text, ['Distribution of realized gain (recallable)'], true)

  // Commitment summary.
  const capitalCommitment = findAmountByLabel(text, ['Capital commitment'], true)
  const amountsDrawn = findAmountByLabel(text, ['Amounts drawn'], true)
  const recallableAmountsDistributed = findAmountByLabel(text, ['Recallable amounts distributed'], true) ?? 0
  const remainingUnfundedCommitment = findAmountByLabel(text, ['Remaining unfunded commitment'], true)
  const cumulativeDistributions = findAmountByLabel(text, ['Cumulative distributions'], true) ?? 0

  // Bank / wire fields.
  const bankName = text.match(/Bank:\s*([^\n]+)/i)?.[1].trim() ?? null
  const abaNumber = text.match(/ABA\s*#:\s*([0-9 ]+)/i)?.[1].trim() ?? null
  const swiftCode = text.match(/SWIFT\s*Code:\s*([A-Za-z0-9]+)/i)?.[1].trim() ?? null
  const accountNumber = text.match(/Account Number:\s*([0-9]+)/i)?.[1].trim() ?? null
  const accountName = text.match(/Account Name:\s*([^\n]+)/i)?.[1].trim() ?? null
  const reference = text.match(/Reference:\s*[“"]?([^”"\n]+)[”"]?/i)?.[1].trim() ?? null

  // Excel B: positive capital-call components only.
  const capitalComponentValues = [capitalCallForInvestments, capitalCallForManagementFees, capitalCallForExpenses]
  let capitalContributionAmount = round2(capitalComponentValues.reduce((s: number, v) => s + (v ?? 0), 0))
  // Fallback to transaction/header amount if component lines are absent on a capital call.
  if (capitalContributionAmount === 0 && documentType === 'capital_call_notice')
    capitalContributionAmount = transactionTotalAbs ?? capitalCallAmountHeader ?? 0

  // Excel C: distribution received = total distribution amount.
  let distributionAmountReceived = 0
  if (documentType === 'distribution_notice')
    distributionAmountReceived = transactionTotalAbs ?? distributionAmountHeader ?? 0

  // Excel D: reinvestable / recallable distribution only.
  const reinvestableAmount = round2(
    amountOrZero(distReturnCapitalRecallable)
    + amountOrZero(distInvestmentIncomeRecallable)
    + amountOrZero(distRealizedGainRecallable),
  )

  const returnOfCapitalTotal = round2(amountOrZero(distReturnCapital) + amountOrZero(distReturnCapitalRecallable))
  const investmentIncomeTotal = round2(amountOrZero(distInvestmentIncome) + amountOrZero(distInvestmentIncomeRecallable))
  const realizedGainTotal = round2(amountOrZero(distRealizedGain) + amountOrZero(distRealizedGainRecallable))

  return {
    document_type:                              documentType,
    notice_date:                                noticeDate,
    transaction_date:                           transactionDate,
    capital_call_due_date:                      capitalCallDueDate,
    distribution_due_date:                      distributionDueDate,
    capital_call_amount_header:                 capitalCallAmountHeader,
    distribution_amount_header:                 distributionAmountHeader,
    transaction_total_signed:                   transactionTotalSigned,
    transaction_total_abs:                      transactionTotalAbs,
    capital_call_for_investments:               capitalCallForInvestments,
    capital_call_for_management_fees:           capitalCallForManagementFees,
    capital_call_for_expenses:                  capitalCallForExpenses,
    subsequent_close_interest_payable:          subsequentCloseInterestPayable,
    subsequent_close_interest_receivable:       subsequentCloseInterestReceivable,
    capital_commitment:                         capitalCommitment,
    amounts_drawn:                              amountsDrawn,
    recallable_amounts_distributed:             recallableAmountsDistributed,
    remaining_unfunded_commitment:              remainingUnfundedCommitment,
    cumulative_distributions:                   cumulativeDistributions,
    distribution_return_of_capital:             distReturnCapital,
    distribution_return_of_capital_recallable:  distReturnCapitalRecallable,
    distribution_investment_income:             distInvestmentIncome,
    distribution_investment_income_recallable:  distInvestmentIncomeRecallable,
    distribution_realized_gain:                 distRealizedGain,
    distribution_realized_gain_recallable:      distRealizedGainRecallable,
    return_of_capital_total:                    returnOfCapitalTotal,
    investment_income_total:                    investmentIncomeTotal,
    realized_gain_total:                        realizedGainTotal,
    capital_contribution_amount:                capitalContributionAmount,
    distribution_amount_received:               distributionAmountReceived,
    reinvestable_amount:                        reinvestableAmount,
    distribution_not_allocated_to_reinvestment: round2(distributionAmountReceived - reinvestableAmount),
    actual_payment_amount:                      capitalCallAmountHeader ?? (documentType === 'capital_call_notice' ? (transactionTotalAbs ?? 0) : 0),
    actual_distribution_amount:                 distributionAmountHeader ?? (documentType === 'distribution_notice' ? (transactionTotalAbs ?? 0) : 0),
    bank_name:                                  bankName,
    aba_number:                                 abaNumber,
    swift_code:                                 swiftCode,
    account_number:                             accountNumber,
    account_name:                               accountName,
    reference,
  }
}

// ── Breakdown ──────────────────────────────────────────────────────────────────

function buildBreakdown(a: HamiltonAllFields): HamiltonBreakdown {
  const capital_call_breakdown: HamiltonBreakdownItem[] = []
  const distribution_breakdown: HamiltonBreakdownItem[] = []

  if (a.capital_call_for_investments != null)
    capital_call_breakdown.push({ purpose: 'investment', label: 'Capital call for investments', amount: a.capital_call_for_investments, excel_usage: 'capital_contribution_amount_component' })
  if (a.capital_call_for_management_fees != null)
    capital_call_breakdown.push({ purpose: 'management_fee', label: 'Capital call for management fees', amount: a.capital_call_for_management_fees, excel_usage: 'capital_contribution_amount_component' })
  if (a.capital_call_for_expenses != null)
    capital_call_breakdown.push({ purpose: 'fund_expense', label: 'Capital call for expenses', amount: a.capital_call_for_expenses, excel_usage: 'capital_contribution_amount_component' })
  if (a.subsequent_close_interest_payable != null)
    capital_call_breakdown.push({ purpose: 'subsequent_close_interest_payable', label: 'Subsequent close interest payable', amount: a.subsequent_close_interest_payable, excel_usage: 'actual_payment_only_not_excel_capital_contribution' })

  if (a.subsequent_close_interest_receivable != null)
    distribution_breakdown.push({ purpose: 'subsequent_close_interest_receivable', label: 'Subsequent close interest receivable', amount: a.subsequent_close_interest_receivable, excel_usage: 'remark_only_not_excel_distribution_amount' })
  if (a.return_of_capital_total)
    distribution_breakdown.push({ purpose: 'return_of_capital', label: 'Distribution of return of capital', amount: a.return_of_capital_total, recallable_amount: amountOrZero(a.distribution_return_of_capital_recallable), excel_usage: 'distribution_details_return_of_capital' })
  if (a.realized_gain_total)
    distribution_breakdown.push({ purpose: 'realized_gain', label: 'Distribution of realized gain', amount: a.realized_gain_total, recallable_amount: amountOrZero(a.distribution_realized_gain_recallable), excel_usage: 'distribution_details_gain' })
  if (a.investment_income_total)
    distribution_breakdown.push({ purpose: 'investment_income', label: 'Distribution of investment income', amount: a.investment_income_total, recallable_amount: amountOrZero(a.distribution_investment_income_recallable), excel_usage: 'distribution_details_interest_other' })

  return { capital_call_breakdown, distribution_breakdown }
}

// ── Excel mapping and calculation ──────────────────────────────────────────────

function calculateCurrentTransactionCashFlow(b: number, c: number): number {
  return round2(-(b || 0) + (c || 0))
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function mapToExcelFields(a: HamiltonAllFields, breakdown: HamiltonBreakdown): HamiltonExcelFields {
  const capitalContributionAmount = amountOrZero(a.capital_contribution_amount)
  const distributionAmountReceived = amountOrZero(a.distribution_amount_received)
  const reinvestableAmount = amountOrZero(a.reinvestable_amount)

  const currentTransactionCashFlow = calculateCurrentTransactionCashFlow(capitalContributionAmount, distributionAmountReceived)

  const remarksParts: string[] = []
  if (a.document_type === 'capital_call_notice') {
    remarksParts.push('Hamilton Lane capital call notice.')
    if (a.capital_call_for_investments != null) remarksParts.push(`Capital ${num(a.capital_call_for_investments)}.`)
    if (a.capital_call_for_management_fees != null) remarksParts.push(`Management fee ${num(a.capital_call_for_management_fees)}.`)
    if (a.capital_call_for_expenses != null) remarksParts.push(`Expense ${num(a.capital_call_for_expenses)}.`)
    if (a.subsequent_close_interest_payable != null) remarksParts.push(`Subsequent close interest payable ${num(a.subsequent_close_interest_payable)}; excluded from Excel cash flow.`)
    if (a.subsequent_close_interest_receivable != null) remarksParts.push(`Subsequent close interest receivable ${num(a.subsequent_close_interest_receivable)}; excluded from Excel cash flow.`)
  } else if (a.document_type === 'distribution_notice') {
    remarksParts.push('Hamilton Lane distribution notice.')
    remarksParts.push('Recallable distribution is treated as reinvestable amount.')
  } else {
    remarksParts.push('Hamilton Lane notice.')
  }

  return {
    subscription_agreement_effective_date:      null,
    commitment_amount:                          a.capital_commitment,
    transaction_date:                           a.transaction_date,
    capital_contribution_amount:                capitalContributionAmount,
    distribution_amount_received:               distributionAmountReceived,
    reinvestable_amount:                        reinvestableAmount,
    cumulative_capital_contributions:           a.amounts_drawn,
    remaining_commitment_formula_value:         a.remaining_unfunded_commitment,
    remaining_commitment:                       a.remaining_unfunded_commitment,
    cash_flow:                                  currentTransactionCashFlow,
    remarks:                                    remarksParts.join(' '),
    distribution_details:                       breakdown.distribution_breakdown,
    distribution_not_allocated_to_reinvestment: a.distribution_not_allocated_to_reinvestment,
    return_of_capital:                          a.return_of_capital_total,
    gain:                                       a.realized_gain_total,
    interest_other:                             a.investment_income_total,
    subsequent_close_interest_payable:          a.subsequent_close_interest_payable ?? 0,
    subsequent_close_interest_receivable:       a.subsequent_close_interest_receivable ?? 0,
    actual_payment_amount:                      a.actual_payment_amount ?? 0,
    actual_distribution_amount:                 a.actual_distribution_amount ?? 0,
  }
}

function calculateExcelFields(
  extracted: HamiltonExcelFields,
  a: HamiltonAllFields,
  previousState: HamiltonPreviousState | null = null,
): HamiltonCalculationResult {
  const b = amountOrZero(extracted.capital_contribution_amount)
  const c = amountOrZero(extracted.distribution_amount_received)
  const d = amountOrZero(extracted.reinvestable_amount)

  const reportE = a.amounts_drawn
  const reportF = a.remaining_unfunded_commitment
  const reportCumulativeDistributions = amountOrZero(a.cumulative_distributions)

  let cumulativeCapitalContributions = reportE
  let remainingCommitment = reportF
  let cumulativeCashFlow: number | null = null

  const calculationSources: Record<string, string> = {
    cumulative_capital_contributions: 'from_report_amounts_drawn_no_previous_state',
    remaining_commitment:             'from_report_remaining_unfunded_commitment_no_previous_state',
    cash_flow:                        'from_report_amounts_drawn_and_cumulative_distributions_no_previous_state',
    cumulative_cash_flow:             'from_report_amounts_drawn_and_cumulative_distributions_no_previous_state',
  }

  const currentCashFlow = calculateCurrentTransactionCashFlow(b, c)
  let finalCashFlowForExcel: number

  // Fallback when DB previous_state is missing:
  // company Excel cumulative cash flow = -Amounts drawn + Cumulative distributions.
  if (reportE != null) {
    cumulativeCashFlow = round2(-reportE + reportCumulativeDistributions)
    finalCashFlowForExcel = cumulativeCashFlow
  } else {
    finalCashFlowForExcel = currentCashFlow
    cumulativeCashFlow = null
    calculationSources.cash_flow = 'current_transaction_cash_flow_no_previous_state'
    calculationSources.cumulative_cash_flow = 'not_calculated_previous_state_missing'
  }

  if (previousState) {
    const previousE = previousState.cumulative_capital_contributions
    const previousF = previousState.remaining_commitment
    const previousCashFlow = previousState.cumulative_cash_flow

    if (previousE != null) {
      cumulativeCapitalContributions = round2(previousE + b)
      calculationSources.cumulative_capital_contributions = 'calculated_from_previous_state'
    }
    if (previousF != null) {
      remainingCommitment = round2(previousF - b + d)
      calculationSources.remaining_commitment = 'calculated_from_previous_state'
    }
    if (previousCashFlow != null) {
      cumulativeCashFlow = round2(previousCashFlow + currentCashFlow)
      finalCashFlowForExcel = cumulativeCashFlow
      calculationSources.cash_flow = 'cumulative_cash_flow_calculated_from_previous_state'
      calculationSources.cumulative_cash_flow = 'calculated_from_previous_state'
    }
  }

  // L column = C - D, including negative values (matches the company Excel rule).
  const distributionNotAllocated = round2(c - d)

  const calculatedFields: HamiltonCalculatedFields = {
    cumulative_capital_contributions:           cumulativeCapitalContributions,
    remaining_commitment_formula_value:         remainingCommitment,
    remaining_commitment:                       remainingCommitment,
    current_transaction_cash_flow:              currentCashFlow,
    cumulative_cash_flow:                       cumulativeCashFlow,
    cash_flow_for_excel:                        finalCashFlowForExcel,
    distribution_not_allocated_to_reinvestment: distributionNotAllocated,
    remarks:                                    extracted.remarks,
    distribution_details:                       extracted.distribution_details ?? [],
    return_of_capital:                          extracted.return_of_capital,
    gain:                                       extracted.gain,
    interest_other:                             extracted.interest_other,
    subsequent_close_interest_payable:          extracted.subsequent_close_interest_payable,
    subsequent_close_interest_receivable:       extracted.subsequent_close_interest_receivable,
    actual_payment_amount:                      extracted.actual_payment_amount,
    actual_distribution_amount:                 extracted.actual_distribution_amount,
  }

  return {
    input_values_for_current_row: {
      subscription_agreement_effective_date: extracted.subscription_agreement_effective_date,
      commitment_amount:                     extracted.commitment_amount,
      transaction_date:                      extracted.transaction_date,
      capital_contribution_amount:           b,
      distribution_amount_received:          c,
      reinvestable_amount:                   d,
    },
    previous_state_used:     previousState,
    calculated_excel_fields: calculatedFields,
    calculation_sources:     calculationSources,
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

function buildValidation(
  excelFields: HamiltonExcelFields,
  a: HamiltonAllFields,
  breakdown: HamiltonBreakdown,
  calculationResult: HamiltonCalculationResult,
): HamiltonValidation {
  const requiredExcelFields: (keyof HamiltonExcelFields)[] = [
    'subscription_agreement_effective_date', 'commitment_amount', 'transaction_date',
    'capital_contribution_amount', 'distribution_amount_received', 'reinvestable_amount',
    'cumulative_capital_contributions', 'remaining_commitment', 'cash_flow',
    'remarks', 'distribution_details',
  ]

  const missingExcelFields: string[] = []
  const matchedExcelFields: string[] = []
  for (const field of requiredExcelFields) {
    const value = excelFields[field]
    if (value == null || value === '') missingExcelFields.push(field)
    else matchedExcelFields.push(field)
  }

  const capitalCallBreakdownTotalExcel = round2(
    breakdown.capital_call_breakdown
      .filter(i => i.amount != null && i.excel_usage === 'capital_contribution_amount_component')
      .reduce((s, i) => s + i.amount, 0),
  )
  const distributionBreakdownTotal = round2(
    breakdown.distribution_breakdown
      .filter(i => i.amount != null && ['return_of_capital', 'realized_gain', 'investment_income'].includes(i.purpose))
      .reduce((s, i) => s + i.amount, 0),
  )

  const reportE = a.amounts_drawn
  const calcE = calculationResult.calculated_excel_fields.cumulative_capital_contributions
  const reportF = a.remaining_unfunded_commitment
  const calcF = calculationResult.calculated_excel_fields.remaining_commitment
  const cc = calculationResult.calculated_excel_fields

  const b = excelFields.capital_contribution_amount || 0
  const cReceived = excelFields.distribution_amount_received || 0

  return {
    missing_excel_fields: missingExcelFields,
    matched_excel_fields: matchedExcelFields,
    calculation_checks: {
      document_type: a.document_type,
      capital_call_breakdown_total_for_excel_B: capitalCallBreakdownTotalExcel,
      capital_contribution_amount: b,
      is_capital_call_breakdown_matched_to_excel_B: b ? round2(capitalCallBreakdownTotalExcel) === round2(b) : null,
      distribution_breakdown_total: distributionBreakdownTotal,
      distribution_amount_received: cReceived,
      is_distribution_breakdown_matched: cReceived ? round2(distributionBreakdownTotal) === round2(cReceived) : null,
      report_amounts_drawn: reportE,
      calculated_cumulative_capital_contributions: calcE,
      is_cumulative_capital_contributions_matched_with_report: reportE != null && calcE != null ? round2(reportE) === round2(calcE) : null,
      report_remaining_commitment: reportF,
      calculated_remaining_commitment: calcF,
      is_remaining_commitment_matched_with_report: reportF != null && calcF != null ? round2(reportF) === round2(calcF) : null,
      current_transaction_cash_flow: cc.current_transaction_cash_flow,
      cumulative_cash_flow: cc.cumulative_cash_flow,
      cash_flow_for_excel: cc.cash_flow_for_excel,
      report_cumulative_distributions: a.cumulative_distributions,
      report_recallable_amounts_distributed: a.recallable_amounts_distributed,
      transaction_total_signed: a.transaction_total_signed,
      transaction_total_abs: a.transaction_total_abs,
    },
    needs_review: true,
    warnings: [
      'Capital calls: Excel capital_contribution_amount includes investment, management fee, and expense components, but excludes subsequent close interest payable/receivable.',
      'Distributions: distribution_amount_received uses total distribution, reinvestable_amount uses recallable distribution components only, and L column is calculated as C - D, including negative values.',
      'If previous_state values are provided, cumulative Excel fields use previous_state. If not, report cumulative values are used as fallback.',
    ],
  }
}

// ── Main module function ───────────────────────────────────────────────────────

export function extractHamiltonReport(
  rawText: string,
  fileName = '',
  previousState: HamiltonPreviousState | null = null,
): HamiltonLaneReport {
  const text = normalizeText(rawText)
  const allFields = extractAllFields(text)
  const breakdown = buildBreakdown(allFields)
  const excelFields = mapToExcelFields(allFields, breakdown)
  const calculationResult = calculateExcelFields(excelFields, allFields, previousState)
  const validation = buildValidation(excelFields, allFields, breakdown, calculationResult)

  const calculated = calculationResult.calculated_excel_fields

  const finalExcelFields: HamiltonExcelFields = { ...excelFields }
  finalExcelFields.cumulative_capital_contributions = calculated.cumulative_capital_contributions ?? finalExcelFields.cumulative_capital_contributions
  finalExcelFields.remaining_commitment_formula_value = calculated.remaining_commitment_formula_value ?? finalExcelFields.remaining_commitment_formula_value
  finalExcelFields.remaining_commitment = calculated.remaining_commitment ?? finalExcelFields.remaining_commitment
  finalExcelFields.cash_flow = calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow
  finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow
  finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow
  finalExcelFields.distribution_not_allocated_to_reinvestment = calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment
  finalExcelFields.return_of_capital = calculated.return_of_capital
  finalExcelFields.gain = calculated.gain
  finalExcelFields.interest_other = calculated.interest_other

  return {
    source_file_name:     fileName,
    extraction_status:    'success',
    module_name:          'hamilton_secondary_fund_vi_b',
    document_type:        allFields.document_type,
    company_name:         findCompanyName(text),
    fund_name:            'Hamilton Lane Secondary Fund VI-B LP',
    currency:             detectCurrency(text),
    excel_fields:         excelFields,
    all_extracted_fields: allFields,
    breakdown,
    validation,
    calculation_result:   { ...calculationResult, final_excel_fields_for_frontend: finalExcelFields },
    final_excel_fields:   finalExcelFields,
  }
}
