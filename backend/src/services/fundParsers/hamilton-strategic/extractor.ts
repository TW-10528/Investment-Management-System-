// Strategic Opportunities Fund IX — extraction module.
//
// Faithful TypeScript port of the reference Python module
// `hamilton_strategic_opportunities_module.py`.
//
// Supports capital call, distribution, close true-up, and net capital-call notices:
//   • Normal capital call:        B = total capital call,  C = 0,  D = 0
//   • Return of unused capital:    B = -Return of unused capital,
//                                  C = Subsequent close interest (receivable),
//                                  D = Return of unused capital
//   • Net capital call w/ dist:    B = Total capital call,
//                                  C = Total distribution + subsequent close interest,
//                                  D = Total distribution
//   • G = -B + C  ;  cumulative formulas use previous_state or report cumulatives.

import type {
  HamStratAllFields, HamStratBreakdown, HamStratBreakdownItem, HamStratCalculatedFields,
  HamStratCalculationResult, HamStratExcelFields, HamiltonStrategicReport, HamStratPreviousState,
  HamStratValidation,
} from './types'

// ── Amount / date helpers (mirror the Python utilities) ────────────────────────

// Supports "$ 584,454", "(26,824)", "$ (26,824)", "$ -".
const AMOUNT = '(\\$?\\s*\\(?\\s*-?[\\d,]+(?:\\.\\d+)?%?\\s*\\)?|\\$?\\s*-)'

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

// Strategic clean_amount: strip $/¥ first, then handle ( ) negative, then strip ,/%/space.
function cleanAmount(value: string | null, absolute = false): number | null {
  if (value == null) return null
  let v = String(value).trim()
  if (['-', '$-', '$ -', '—'].includes(v)) return 0
  let negative = false
  v = v.replace(/\$/g, '').replace(/¥/g, '').trim()
  if (v.startsWith('(') && v.endsWith(')')) { negative = true; v = v.slice(1, -1) }
  v = v.replace(/,/g, '').replace(/%/g, '').replace(/\s/g, '')
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

// pattern_before_amount is a raw regex source ending just before the amount.
function findFlexibleAmount(text: string, patternBeforeAmount: string, absolute = true): number | null {
  const re = new RegExp(patternBeforeAmount + '\\s*' + AMOUNT, 'is')
  const m = text.match(re)
  return m ? cleanAmount(m[1], absolute) : null
}

// Extract amounts ONLY from the "Current Distribution Accounting Treatment" section.
// This avoids wrong matches from narrative text (e.g. "repayment of principal, $5...")
// and from individual portfolio lines. Required for HAMS_030226 where Excel
// Return of Capital = Repayment of principal 66,433.
function findAccountingTreatmentAmount(text: string, label: string): number | null {
  const sectionMatch = text.match(
    /Current\s+Distribution\s+Accounting\s+Treatment[\s\S]{0,1200}?Inception-to-Date\s+Activity/i,
  )
  const section = sectionMatch ? sectionMatch[0] : text
  const re = new RegExp(escapeRegex(label) + '\\s*:?:?\\s*' + AMOUNT, 'gi')
  for (const match of section.matchAll(re)) {
    const amount = cleanAmount(match[1], true)
    if (amount != null) return amount
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

function findTransactionDate(text: string): string | null {
  const m = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+Transaction\b/i)
  if (m) return normalizeDate(m[1])
  return findDateByLabel(text, ['Capital Call Due Date', 'Distribution Due Date'])
}

export function normalizeText(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/​/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function detectCurrency(text: string): string {
  if (text.includes('$') || /\bUSD\b/i.test(text)) return 'USD'
  if (text.includes('¥') || text.toUpperCase().includes('JPY')) return 'JPY'
  if (text.includes('€') || text.toUpperCase().includes('EUR')) return 'EUR'
  return 'unknown'
}

function findCompanyName(text: string): string | null {
  const investor = text.match(/Investor:\s*([^\n]+)/i)
  if (investor) return investor[1].trim().split(/\s+/).join(' ')
  const m = text.match(/Strategic Opportunities Fund IX\s*\n\s*([A-Za-z0-9 .,&'-]+?)\s*\n\s*Current Transaction Detail/i)
  if (m) return m[1].trim().split(/\s+/).join(' ')
  return null
}

// ── Extraction ─────────────────────────────────────────────────────────────────

function extractAllFields(text: string): HamStratAllFields {
  const noticeDate = findFirstDate(text)
  const transactionDate = findTransactionDate(text)
  const capitalCallDueDate = findDateByLabel(text, ['Capital Call Due Date'])
  const distributionDueDate = findDateByLabel(text, ['Distribution Due Date'])

  const capitalCallAmountHeader = findAmountByLabel(text, ['Capital Call Amount'], true)
  const distributionAmountHeader = findAmountByLabel(text, ['Distribution Amount'], true)
  const transactionTotal = findAmountByLabel(text, ['Transaction total'], false)

  const capitalCommitment = findAmountByLabel(text, ['Capital commitment'], true)
  const amountsDrawn = findAmountByLabel(text, ['Amounts drawn'], true)
  const recallableAmountsDistributed = findAmountByLabel(text, ['Recallable amounts distributed'], true)
  const remainingUnfundedCommitment = findAmountByLabel(text, ['Remaining unfunded commitment'], true)
  const cumulativeDistributions = findAmountByLabel(text, ['Cumulative distributions'], true)

  // Capital call components.
  const capitalCallForInvestments = findAmountByLabel(text, ['Capital call for investments'], true)
  const capitalCallHlSoHoldings = findFlexibleAmount(text, 'Capital\\s+call\\s+for\\s+Hamilton\\s+Lane\\s+Strategic\\s+Opportunities\\s+Fund\\s+IX\\s+Holdings\\s+LP', true)
  const capitalCallLeveragedBlocker = findFlexibleAmount(text, 'Capital\\s+call\\s+for\\s+HL\\s+SO\\s+IX\\s+Leveraged\\s+Blocker\\s+Inc\\.', true)
  const capitalCallManagementFees = findAmountByLabel(text, ['Capital call for management fees'], true)
  const capitalCallExpenses = findAmountByLabel(text, ['Capital call for expenses'], true)
  const totalCapitalCall = findAmountByLabel(text, ['Total capital call'], true)

  // Return of unused capital → negative contribution in Excel B.
  let returnUnusedCapitalForInvestments = findAmountByLabel(text, ['Return of unused capital for investments'], true)
  if (returnUnusedCapitalForInvestments == null) {
    const m = text.match(/Return\s+of\s+unused\s+capital\s+for\s+investments\s+\$?\s*\(?\s*([\d,]+(?:\.\d+)?)\s*\)?/i)
    if (m) returnUnusedCapitalForInvestments = cleanAmount(m[1], true)
  }

  // Distribution components.
  const totalDistribution = findAmountByLabel(text, ['Total distribution'], true)
  const accountingTotalDistributions = findAmountByLabel(text, ['Total distributions'], true)

  let subsequentCloseInterestReceivable = findFlexibleAmount(text, 'Subsequent\\s+close\\s+interest\\s+\\(receivable\\)', true)
  if (subsequentCloseInterestReceivable == null) {
    const m = text.match(/Subsequent\s+close\s+interest\s+\(receivable\)\s+\$?\s*\(?\s*([\d,]+(?:\.\d+)?)\s*\)?/i)
    if (m) subsequentCloseInterestReceivable = cleanAmount(m[1], true)
  }
  const subsequentCloseInterestPayable = findFlexibleAmount(text, 'Subsequent\\s+close\\s+interest\\s+payable', true)

  // Accounting treatment details — use only the "Current Distribution Accounting
  // Treatment" section so narrative / portfolio lines don't produce wrong matches.
  const repaymentOfPrincipal = findAccountingTreatmentAmount(text, 'Repayment of principal')
  const interestIncome = findAccountingTreatmentAmount(text, 'Interest income')
  const otherInvestmentIncome = findAccountingTreatmentAmount(text, 'Other investment income')

  // Bank fields.
  const bankName = text.match(/Bank:\s*([^\n]+)/i)?.[1].trim() ?? null
  const abaNumber = text.match(/ABA#?:\s*([0-9\-\s]+)/i)?.[1].trim() ?? null
  const swiftCode = text.match(/Swift\s+Code:\s*([A-Za-z0-9]+)/i)?.[1].trim() ?? null
  const accountNumber = text.match(/Account Number:\s*([0-9]+)/i)?.[1].trim() ?? null
  const accountName = text.match(/Account Name:\s*([^\n]+)/i)?.[1].trim() ?? null

  // Excel capital contribution amount B.
  let capitalContributionAmountForExcel: number
  if (returnUnusedCapitalForInvestments != null) {
    capitalContributionAmountForExcel = -Math.abs(returnUnusedCapitalForInvestments)
  } else if (totalCapitalCall != null) {
    capitalContributionAmountForExcel = totalCapitalCall
  } else {
    const componentValues = [capitalCallForInvestments, capitalCallHlSoHoldings, capitalCallLeveragedBlocker, capitalCallManagementFees, capitalCallExpenses]
    const componentSum = componentValues.reduce((s: number, v) => s + (v ?? 0), 0)
    if (componentSum) capitalContributionAmountForExcel = round2(componentSum)
    else if (capitalCallAmountHeader != null) capitalContributionAmountForExcel = capitalCallAmountHeader
    else capitalContributionAmountForExcel = 0
  }

  // Excel distribution amount C and reinvestable amount D.
  let distributionTotalForExcel = 0
  let distributionAmountReceivedForExcel = 0
  let reinvestableAmountForExcel = 0

  if (returnUnusedCapitalForInvestments != null) {
    // True-up interest distribution: B = -return, C = subsequent close interest, D = return.
    distributionAmountReceivedForExcel = amountOrZero(subsequentCloseInterestReceivable)
    reinvestableAmountForExcel = amountOrZero(returnUnusedCapitalForInvestments)
  } else {
    // Normal distribution / net capital call: prefer accounting totals, else total distribution.
    distributionTotalForExcel =
      accountingTotalDistributions
      || totalDistribution
      || ((distributionAmountHeader != null && totalDistribution == null && accountingTotalDistributions == null && capitalContributionAmountForExcel === 0)
        ? distributionAmountHeader
        : 0)
      || 0

    distributionAmountReceivedForExcel = 0
    if (distributionTotalForExcel) distributionAmountReceivedForExcel += distributionTotalForExcel
    if (subsequentCloseInterestReceivable) distributionAmountReceivedForExcel += subsequentCloseInterestReceivable

    // Fallback: negative transaction total with no parsed distribution line.
    if (distributionAmountReceivedForExcel === 0 && transactionTotal != null && transactionTotal < 0 && capitalContributionAmountForExcel === 0)
      distributionAmountReceivedForExcel = Math.abs(transactionTotal)

    // Recallable = total distributions only (not subsequent close interest).
    reinvestableAmountForExcel = distributionTotalForExcel || 0
  }

  let actualPaymentAmount = transactionTotal
  if (actualPaymentAmount == null) {
    if (capitalCallAmountHeader != null) actualPaymentAmount = capitalCallAmountHeader
    else if (distributionAmountHeader != null) actualPaymentAmount = -distributionAmountHeader
  }

  return {
    notice_date:                            noticeDate,
    capital_call_due_date:                  capitalCallDueDate,
    distribution_due_date:                  distributionDueDate,
    transaction_date:                       transactionDate,
    capital_call_amount_header:             capitalCallAmountHeader,
    distribution_amount_header:             distributionAmountHeader,
    transaction_total:                      transactionTotal,
    capital_commitment:                     capitalCommitment,
    amounts_drawn:                          amountsDrawn,
    recallable_amounts_distributed:         recallableAmountsDistributed,
    remaining_unfunded_commitment:          remainingUnfundedCommitment,
    cumulative_distributions:               cumulativeDistributions,
    capital_call_for_investments:           capitalCallForInvestments,
    capital_call_hl_so_ix_holdings:         capitalCallHlSoHoldings,
    capital_call_leveraged_blocker:         capitalCallLeveragedBlocker,
    capital_call_management_fees:           capitalCallManagementFees,
    capital_call_expenses:                  capitalCallExpenses,
    total_capital_call:                     totalCapitalCall,
    return_unused_capital_for_investments:  returnUnusedCapitalForInvestments,
    total_distribution:                     totalDistribution,
    accounting_total_distributions:         accountingTotalDistributions,
    repayment_of_principal:                 repaymentOfPrincipal,
    interest_income:                        interestIncome,
    other_investment_income:                otherInvestmentIncome,
    subsequent_close_interest_receivable:   subsequentCloseInterestReceivable,
    subsequent_close_interest_payable:      subsequentCloseInterestPayable,
    capital_contribution_amount_for_excel:  capitalContributionAmountForExcel,
    distribution_amount_received_for_excel: round2(distributionAmountReceivedForExcel),
    reinvestable_amount_for_excel:          reinvestableAmountForExcel,
    actual_payment_amount:                  actualPaymentAmount,
    actual_cash_flow_from_transaction_total: actualPaymentAmount != null ? -actualPaymentAmount : null,
    bank_name:                              bankName,
    aba_number:                             abaNumber,
    swift_code:                             swiftCode,
    account_number:                         accountNumber,
    account_name:                           accountName,
  }
}

// ── Breakdown ──────────────────────────────────────────────────────────────────

function buildBreakdown(a: HamStratAllFields): HamStratBreakdown {
  const capital_call_breakdown: HamStratBreakdownItem[] = []
  const distribution_breakdown: HamStratBreakdownItem[] = []

  const componentMap: [string, string, number | null][] = [
    ['investments', 'Capital call for investments', a.capital_call_for_investments],
    ['hl_so_ix_holdings', 'Capital call for Hamilton Lane Strategic Opportunities Fund IX Holdings LP', a.capital_call_hl_so_ix_holdings],
    ['leveraged_blocker', 'Capital call for HL SO IX Leveraged Blocker Inc.', a.capital_call_leveraged_blocker],
    ['management_fees', 'Capital call for management fees', a.capital_call_management_fees],
    ['expenses', 'Capital call for expenses', a.capital_call_expenses],
    ['return_unused_capital', 'Return of unused capital for investments', a.return_unused_capital_for_investments != null ? -Math.abs(a.return_unused_capital_for_investments) : null],
  ]
  for (const [purpose, label, amount] of componentMap) {
    if (amount != null) capital_call_breakdown.push({ purpose, label, amount, excel_usage: 'capital_contribution_amount_component' })
  }

  if (a.accounting_total_distributions != null || a.total_distribution != null) {
    distribution_breakdown.push({
      purpose: 'recallable_distribution',
      label: 'Total distributions / Total distribution',
      amount: a.accounting_total_distributions ?? a.total_distribution ?? 0,
      excel_usage: 'distribution_amount_received_and_reinvestable_amount',
    })
  }
  if (a.subsequent_close_interest_receivable != null) {
    distribution_breakdown.push({
      purpose: 'subsequent_close_interest_receivable',
      label: 'Subsequent close interest (receivable)',
      amount: a.subsequent_close_interest_receivable,
      excel_usage: 'distribution_amount_received_component_not_reinvestable',
    })
  }
  if (a.subsequent_close_interest_payable != null) {
    capital_call_breakdown.push({
      purpose: 'subsequent_close_interest_payable',
      label: 'Subsequent close interest payable',
      amount: a.subsequent_close_interest_payable,
      excel_usage: 'actual_payment_only_not_excel_b',
    })
  }

  return { capital_call_breakdown, distribution_breakdown }
}

// ── Excel mapping and calculation ──────────────────────────────────────────────

function calculateCurrentTransactionCashFlow(b: number, c: number): number {
  return round2(-(b || 0) + (c || 0))
}

function mapToExcelFields(a: HamStratAllFields, breakdown: HamStratBreakdown): HamStratExcelFields {
  const b = a.capital_contribution_amount_for_excel || 0
  const c = a.distribution_amount_received_for_excel || 0
  const d = a.reinvestable_amount_for_excel || 0

  const currentTransactionCashFlow = calculateCurrentTransactionCashFlow(b, c)

  const remarksParts = ['Hamilton Lane Strategic Opportunities Fund IX-B transaction notice.']
  if (b > 0 && c > 0) remarksParts.push('Net capital call: capital call is netted against distribution.')
  else if (b > 0) remarksParts.push('Capital call transaction.')
  else if (b < 0) remarksParts.push('Return of unused capital reduces cumulative capital contributions.')
  else if (c > 0) remarksParts.push('Distribution transaction.')
  if (a.subsequent_close_interest_receivable) remarksParts.push('Subsequent close interest receivable is included in distribution amount received but not reinvestable amount.')

  return {
    subscription_agreement_effective_date:   null,
    commitment_amount:                       a.capital_commitment,
    transaction_date:                        a.transaction_date,
    capital_contribution_amount:             b,
    distribution_amount_received:            c,
    reinvestable_amount:                     d,
    cumulative_capital_contributions:        a.amounts_drawn,
    remaining_commitment_formula_value:      a.remaining_unfunded_commitment,
    remaining_commitment:                    a.remaining_unfunded_commitment,
    cash_flow:                               currentTransactionCashFlow,
    remarks:                                 remarksParts.join(' '),
    distribution_details:                    breakdown.distribution_breakdown,
    // L column = C - D, including negative values (matches the company Excel rule).
    distribution_not_allocated_to_reinvestment: round2(c - d),
    // Finance detail columns from accounting treatment / true-up sections.
    return_of_capital:                       round2(amountOrZero(a.repayment_of_principal)),
    gain:                                    0,
    interest: round2(
      amountOrZero(a.interest_income)
      + amountOrZero(a.other_investment_income)
      + amountOrZero(a.subsequent_close_interest_receivable),
    ),
    interest_other: round2(
      amountOrZero(a.interest_income)
      + amountOrZero(a.other_investment_income)
      + amountOrZero(a.subsequent_close_interest_receivable),
    ),
    actual_payment_amount:                   a.actual_payment_amount,
    actual_cash_flow_from_transaction_total: a.actual_cash_flow_from_transaction_total,
  }
}

function calculateExcelFields(
  extracted: HamStratExcelFields,
  a: HamStratAllFields,
  previousState: HamStratPreviousState | null = null,
): HamStratCalculationResult {
  const b = amountOrZero(extracted.capital_contribution_amount)
  const c = amountOrZero(extracted.distribution_amount_received)
  const d = amountOrZero(extracted.reinvestable_amount)

  const reportE = a.amounts_drawn
  const reportF = a.remaining_unfunded_commitment
  const reportCumulativeDistributions = a.cumulative_distributions || 0

  let cumulativeCapitalContributions = reportE
  let remainingCommitment = reportF
  let cumulativeCashFlow: number | null = null

  const calculationSources: Record<string, string> = {
    cumulative_capital_contributions: 'from_report_amounts_drawn_no_previous_state',
    remaining_commitment:             'from_report_remaining_unfunded_commitment_no_previous_state',
    cash_flow:                        'from_report_cumulative_values_no_previous_state',
    cumulative_cash_flow:             'from_report_cumulative_values_no_previous_state',
  }

  const currentCashFlow = calculateCurrentTransactionCashFlow(b, c)
  let finalCashFlowForExcel: number

  if (reportE != null) {
    cumulativeCashFlow = round2(-reportE + reportCumulativeDistributions)
    finalCashFlowForExcel = cumulativeCashFlow
  } else {
    finalCashFlowForExcel = currentCashFlow
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

  const calculatedFields: HamStratCalculatedFields = {
    cumulative_capital_contributions:           cumulativeCapitalContributions,
    remaining_commitment_formula_value:         remainingCommitment,
    remaining_commitment:                       remainingCommitment,
    current_transaction_cash_flow:              currentCashFlow,
    cumulative_cash_flow:                       cumulativeCashFlow,
    cash_flow_for_excel:                        finalCashFlowForExcel,
    distribution_not_allocated_to_reinvestment: distributionNotAllocated,
    remarks:                                    extracted.remarks,
    distribution_details:                       extracted.distribution_details ?? [],
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
  excelFields: HamStratExcelFields,
  a: HamStratAllFields,
  breakdown: HamStratBreakdown,
  calculationResult: HamStratCalculationResult,
): HamStratValidation {
  const requiredExcelFields: (keyof HamStratExcelFields)[] = [
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

  const b = excelFields.capital_contribution_amount || 0
  const c = excelFields.distribution_amount_received || 0
  const currentCf = calculationResult.calculated_excel_fields.current_transaction_cash_flow

  const transactionTotal = a.transaction_total
  const actualCf = transactionTotal != null ? -transactionTotal : null

  const capitalCallBreakdownTotal = round2(
    breakdown.capital_call_breakdown
      .filter(i => i.amount != null && i.purpose !== 'subsequent_close_interest_payable')
      .reduce((s, i) => s + i.amount, 0),
  )
  const distributionBreakdownTotal = round2(
    breakdown.distribution_breakdown.filter(i => i.amount != null).reduce((s, i) => s + i.amount, 0),
  )

  const reportE = a.amounts_drawn
  const calcE = calculationResult.calculated_excel_fields.cumulative_capital_contributions
  const reportF = a.remaining_unfunded_commitment
  const calcF = calculationResult.calculated_excel_fields.remaining_commitment

  return {
    missing_excel_fields: missingExcelFields,
    matched_excel_fields: matchedExcelFields,
    calculation_checks: {
      excel_b_capital_contribution_amount: b,
      excel_c_distribution_amount_received: c,
      excel_d_reinvestable_amount: excelFields.reinvestable_amount,
      capital_call_breakdown_total: capitalCallBreakdownTotal,
      distribution_breakdown_total: distributionBreakdownTotal,
      transaction_total_report_signed: transactionTotal,
      current_transaction_cash_flow: currentCf,
      cash_flow_from_transaction_total: actualCf,
      is_current_cash_flow_matched_with_transaction_total: currentCf != null && actualCf != null ? round2(currentCf) === round2(actualCf) : null,
      report_cumulative_capital_contributions: reportE,
      calculated_cumulative_capital_contributions: calcE,
      is_cumulative_capital_contributions_matched_with_report: reportE != null && calcE != null ? round2(reportE) === round2(calcE) : null,
      report_remaining_commitment: reportF,
      calculated_remaining_commitment: calcF,
      is_remaining_commitment_matched_with_report: reportF != null && calcF != null ? round2(reportF) === round2(calcF) : null,
      cumulative_cash_flow: calculationResult.calculated_excel_fields.cumulative_cash_flow,
      cash_flow_for_excel: calculationResult.calculated_excel_fields.cash_flow_for_excel,
    },
    needs_review: true,
    warnings: [
      'This module supports Hamilton Lane Strategic Opportunities Fund IX-B reports.',
      'Return of unused capital is mapped as a negative capital contribution amount.',
      'Subsequent close interest receivable is included in distribution_amount_received but excluded from reinvestable_amount. L column is calculated as C - D and can be negative.',
      'Current Distribution Accounting Treatment is used for return_of_capital / interest detail columns.',
      'For accurate DB cumulative flow, upload reports in transaction date order.',
    ],
  }
}

// ── Main module function ───────────────────────────────────────────────────────

export function extractHamiltonStrategicReport(
  rawText: string,
  fileName = '',
  previousState: HamStratPreviousState | null = null,
): HamiltonStrategicReport {
  const text = normalizeText(rawText)
  const allFields = extractAllFields(text)
  const breakdown = buildBreakdown(allFields)
  const excelFields = mapToExcelFields(allFields, breakdown)
  const calculationResult = calculateExcelFields(excelFields, allFields, previousState)
  const validation = buildValidation(excelFields, allFields, breakdown, calculationResult)

  const calculated = calculationResult.calculated_excel_fields

  const finalExcelFields: HamStratExcelFields = { ...excelFields }
  finalExcelFields.cumulative_capital_contributions = calculated.cumulative_capital_contributions ?? finalExcelFields.cumulative_capital_contributions
  finalExcelFields.remaining_commitment_formula_value = calculated.remaining_commitment_formula_value ?? finalExcelFields.remaining_commitment_formula_value
  finalExcelFields.remaining_commitment = calculated.remaining_commitment ?? finalExcelFields.remaining_commitment
  finalExcelFields.cash_flow = calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow
  finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow
  finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow
  finalExcelFields.distribution_not_allocated_to_reinvestment = calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment

  // Document type derived from the B/C signs.
  let documentType = 'hamilton_strategic_transaction_notice'
  const fb = finalExcelFields.capital_contribution_amount || 0
  const fc = finalExcelFields.distribution_amount_received || 0
  if (fb > 0 && fc > 0) documentType = 'net_capital_call_notice'
  else if (fb > 0) documentType = 'capital_call_notice'
  else if (fb < 0) documentType = 'return_of_unused_capital_notice'
  else if (fc > 0) documentType = 'distribution_notice'

  return {
    source_file_name:     fileName,
    extraction_status:    'success',
    module_name:          'hamilton_strategic_opportunities_fund_ix',
    document_type:        documentType,
    company_name:         findCompanyName(text),
    fund_name:            'Strategic Opportunities Fund IX',
    currency:             detectCurrency(text),
    excel_fields:         excelFields,
    all_extracted_fields: allFields,
    breakdown,
    validation,
    calculation_result:   { ...calculationResult, final_excel_fields_for_frontend: finalExcelFields },
    final_excel_fields:   finalExcelFields,
  }
}
