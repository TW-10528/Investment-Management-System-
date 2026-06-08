// Dover Street XI Feeder Fund L.P. — extraction module.
// TypeScript port of dover_street_xi_module.py

import type {
  DoverAllFields,
  DoverBreakdown,
  DoverBreakdownItem,
  DoverCalculatedFields,
  DoverCalculationResult,
  DoverExcelFields,
  DoverPreviousState,
  DoverReport,
  DoverValidation,
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

// Normalize text — mirrors Python normalize_text.
// Also converts \r\n → \n first since pdf-parse often uses Windows line endings.
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\xa0/g, ' ')
    .replace(/​/g, '')
    .replace(/ï¿¾/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
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

// Find amount after a flexible pattern (supports dotall / multi-line).
function findFlexibleAmount(text: string, patternBefore: string, absolute = true): number | null {
  const re = new RegExp(patternBefore + '\\s*' + AMOUNT, 'is')
  const m = text.match(re)
  return m ? cleanAmount(m[1], absolute) : null
}

function findFirstDate(text: string): string | null {
  const m = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/)
  return m ? normalizeDate(m[1]) : null
}

function findPayableOrDistributionDate(text: string): string | null {
  const days = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?'

  // "payable by Friday, December 20, 2024"
  let m = text.match(new RegExp(`payable\\s+by\\s+${days},?\\s*([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})`, 'i'))
  if (m) return normalizeDate(m[1])

  // "Proceeds to be wired on August 29, 2024"
  m = text.match(/Proceeds\s+to\s+be\s+wired\s+on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)
  if (m) return normalizeDate(m[1])

  // "A wire will be sent to you on August 29" — year from first date in doc
  const yearM = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/)
  const year = yearM ? yearM[1].split(',').pop()?.trim() : null
  m = text.match(/wire\s+will\s+be\s+sent\s+to\s+you\s+on\s+([A-Za-z]+\s+\d{1,2})(?:\s|,)/i)
  if (m && year) return normalizeDate(`${m[1]}, ${year}`)

  return findFirstDate(text)
}

// "Dover_20241220.pdf" → "2024-12-20"
function parseFilenameDate(fileName: string): string | null {
  const m = (fileName || '').match(/Dover[_-](\d{4})(\d{2})(\d{2})/i)
  if (!m) return null
  const year = parseInt(m[1])
  const month = parseInt(m[2])
  const day = parseInt(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function detectCurrency(text: string): string {
  if (text.includes('$') || /\bUSD\b/i.test(text)) return 'USD'
  if (/JPY/i.test(text)) return 'JPY'
  return 'unknown'
}

function findCompanyName(text: string): string | null {
  let m = text.match(/To our Limited Partner:\s*([^\n]+)/i)
  if (m) return m[1].trim().split(/\s+/).join(' ')
  m = text.match(/\n(Thirdwave\s+(?:Corporation|Financial\s+Inc\.))\n/i)
  if (m) return m[1].trim().split(/\s+/).join(' ')
  return null
}

// ── Initial contribution helper ───────────────────────────────────────────────

interface InitialContributionFields {
  commitment_amount: number | null
  initial_total_calls: number | null
  total_interest: number | null
  total_due: number | null
  remaining_commitment_to_fund: number | null
}

function extractInitialContributionFields(text: string): InitialContributionFields {
  const commitmentAmount = findAmountByLabel(text, ['Commitment Amount'], true)

  // Layout:
  //   Commitment Amount 20,000,000
  //   3,800,000               ← this is total calls (contributions without interest)
  //   Total Interest 194,689
  //   Total Due 3,994,689
  let totalCalls: number | null = null

  // pdf-parse (Node) omits the space between label and value — e.g. "Commitment Amount20,000,000"
  // so \s+ becomes \s* here to tolerate zero whitespace between the label and the digits.
  const scheduleM = text.match(
    /Commitment\s+Amount\s*[\d,]+\s*[\r\n]+\s*([\d,]+(?:\.\d+)?)\s*[\r\n]+\s*Total\s+Interest/i,
  )
  if (scheduleM) totalCalls = cleanAmount(scheduleM[1], true)

  // Fallback: "Total Calls - X%" line (no amount on the same line in some PDFs);
  // try to parse a standalone total on the line that FOLLOWS it.
  if (totalCalls == null) {
    const tcLineM = text.match(/Total\s+Calls\s*-\s*[\d.]+%[^\n]*\n\s*([\d,]+(?:\.\d+)?)/i)
    if (tcLineM) totalCalls = cleanAmount(tcLineM[1], true)
  }

  // Fallback: sum every "X.XX% Contribution N,NNN,NNN" line.
  // pdf-parse emits "6.00% Contribution1,200,000" (no space before amount) so \s* here.
  if (totalCalls == null) {
    const contribLines = [...text.matchAll(/[\d.]+%\s+Contribution\s*([\d,]+(?:\.\d+)?)/gi)]
    if (contribLines.length > 0) {
      totalCalls = contribLines.reduce((sum, m) => sum + (cleanAmount(m[1], true) ?? 0), 0)
    }
  }

  return {
    commitment_amount: commitmentAmount,
    initial_total_calls: totalCalls,
    total_interest: findAmountByLabel(text, ['Total Interest'], true),
    total_due: findAmountByLabel(text, ['Total Due'], true),
    remaining_commitment_to_fund: findAmountByLabel(text, ['Remaining Commitment to Fund'], true),
  }
}

// ── Extraction ─────────────────────────────────────────────────────────────────

function extractAllFields(text: string, fileName = ''): DoverAllFields {
  const noticeDate = findFirstDate(text)
  const filenameDate = parseFilenameDate(fileName)
  const transactionDate = findPayableOrDistributionDate(text) ?? filenameDate

  const isInitialContribution         = text.includes('Initial Contribution and Interest due')
  const isCashDistribution            = text.includes('Cash Distribution Notice') && !text.includes('Capital Call and Deemed Distribution Notice')
  const isCapitalCallDeemedDistribution = text.includes('Capital Call and Deemed Distribution Notice')

  const initialFields: InitialContributionFields = isInitialContribution
    ? extractInitialContributionFields(text)
    : { commitment_amount: null, initial_total_calls: null, total_interest: null, total_due: null, remaining_commitment_to_fund: null }

  // ── Capital call ──────────────────────────────────────────────────────────
  // Line-anchored to avoid accidentally matching "Net Amount of Capital Call".
  // $ is made optional — pdf-parse may omit it or put the amount on the next line.

  let capitalCallSummary: number | null = null
  // Same line: "Capital Call $1,200,000" or "Capital Call 1,200,000"
  const ccSumM = text.match(/^\s*Capital\s+Call\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/mi)
  if (ccSumM) capitalCallSummary = cleanAmount(ccSumM[1], true)
  // Next line: "Capital Call\n$1,200,000" or "Capital Call\n1,200,000"
  if (capitalCallSummary == null) {
    const ccNext = text.match(/^\s*Capital\s+Call\s*\n\s*\$?\s*([\d,]+(?:\.\d+)?)/mi)
    if (ccNext) capitalCallSummary = cleanAmount(ccNext[1], true)
  }

  let amountOfCapitalCall: number | null = null
  const amtCcM = text.match(/^\s*Amount\s+of\s+Capital\s+Call\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/mi)
  if (amtCcM) amountOfCapitalCall = cleanAmount(amtCcM[1], true)
  if (amountOfCapitalCall == null) {
    amountOfCapitalCall = findAmountByLabel(text, ['Amount of Capital Call'], true)
  }

  // ── Other fields ──────────────────────────────────────────────────────────
  const netAmountOfCapitalCall  = findAmountByLabel(text, ['Net Amount of Capital Call'], true)
  const lessDeemedDistribution  = findAmountByLabel(text, ['Less: Deemed Distribution'], true)
  const grossDistribution       = findAmountByLabel(text, ['Gross Distribution'], true)
  const returnOfCapital         = findAmountByLabel(text, ['Return of Capital'], true)
  const gain                    = findAmountByLabel(text, ['Gain'], true)
  const netDistribution         = findAmountByLabel(text, ['Net Distribution'], true)
  const totalDistribution       = findAmountByLabel(text, ['Total Distribution'], true)
  const totalDistributionsIncl  = findAmountByLabel(text, ['Total Distributions (including this distribution)'], true)
  const totalCapitalCalledIncl  = findAmountByLabel(text, ['Total Capital Called (including this Call)'], true)
  const totalCapitalCalled      = totalCapitalCalledIncl ?? findAmountByLabel(text, ['Total Capital Called'], true)
  const unfundedCommitment      = findAmountByLabel(text, ['Unfunded Commitment'], true)
  const commitmentAmount        = initialFields.commitment_amount ?? findAmountByLabel(text, ['Commitment Amount'], true)

  // ── Excel B ───────────────────────────────────────────────────────────────
  // Initial:      total calls (without interest)
  // Distribution: 0
  // Capital call + deemed distribution: gross Capital Call (NOT net)
  //   Example: Capital Call = 1,200,000 | Less Deemed = 127,353 | Net = 1,072,647 → B = 1,200,000
  let capitalContributionAmountForExcel: number
  if (isInitialContribution) {
    capitalContributionAmountForExcel = initialFields.initial_total_calls ?? 0
  } else if (isCashDistribution) {
    capitalContributionAmountForExcel = 0
  } else {
    capitalContributionAmountForExcel = capitalCallSummary ?? amountOfCapitalCall ?? 0
  }

  // ── Excel C ───────────────────────────────────────────────────────────────
  let distributionAmountReceivedForExcel: number
  if (isInitialContribution) {
    distributionAmountReceivedForExcel = 0
  } else if (isCashDistribution) {
    distributionAmountReceivedForExcel = totalDistribution ?? grossDistribution ?? netDistribution ?? 0
  } else {
    // Capital call + deemed distribution: C = deemed distribution offset
    distributionAmountReceivedForExcel = netDistribution ?? grossDistribution ?? lessDeemedDistribution ?? 0
  }

  // ── Excel D ───────────────────────────────────────────────────────────────
  // Dover Excel keeps this 0 for all provided reports.
  const reinvestableAmountForExcel = 0

  // ── Report cumulative E / F ───────────────────────────────────────────────
  const reportCumulativeCapitalContributions = isInitialContribution
    ? initialFields.initial_total_calls
    : totalCapitalCalled

  const reportRemainingCommitment = isInitialContribution
    ? initialFields.remaining_commitment_to_fund
    : unfundedCommitment

  // ── Actual payment / wire amount (informational only, not used for Excel B) ──
  let actualPaymentAmount: number | null = null
  if (isInitialContribution) {
    actualPaymentAmount = initialFields.total_due
  } else if (isCashDistribution) {
    actualPaymentAmount = -(distributionAmountReceivedForExcel)
  } else if (isCapitalCallDeemedDistribution) {
    actualPaymentAmount = netAmountOfCapitalCall
  }

  // ── Bank / wire fields ────────────────────────────────────────────────────
  const bankM   = text.match(/(?:Beneficiary Bank:|\s)(JPMorgan\s+Chase\s+Bank)/im)
  const abaM    = text.match(/ABA(?:\s+Number)?:\s*([0-9\-\s]+)/i)
  const swiftM  = text.match(/SWIFT:\s*([A-Za-z0-9]+)/i)
  const acctN   = text.match(/Account\s+Name:\s*([^\n]+)/i)
  const acctNum = text.match(/Account\s+Number:\s*([0-9]+)/i)

  return {
    notice_date: noticeDate,
    transaction_date: transactionDate,
    filename_date: filenameDate,
    is_initial_contribution: isInitialContribution,
    is_cash_distribution: isCashDistribution,
    is_capital_call_deemed_distribution: isCapitalCallDeemedDistribution,
    commitment_amount: commitmentAmount,
    capital_call_summary: capitalCallSummary,
    amount_of_capital_call: amountOfCapitalCall,
    less_deemed_distribution: lessDeemedDistribution,
    net_amount_of_capital_call: netAmountOfCapitalCall,
    gross_distribution: grossDistribution,
    return_of_capital: returnOfCapital,
    gain,
    interest_other: null,
    net_distribution: netDistribution,
    total_distribution: totalDistribution,
    total_capital_called: totalCapitalCalled,
    unfunded_commitment: unfundedCommitment,
    total_distributions_including: totalDistributionsIncl,
    capital_contribution_amount_for_excel: capitalContributionAmountForExcel,
    distribution_amount_received_for_excel: distributionAmountReceivedForExcel,
    reinvestable_amount_for_excel: reinvestableAmountForExcel,
    report_cumulative_capital_contributions: reportCumulativeCapitalContributions,
    report_remaining_commitment: reportRemainingCommitment,
    initial_total_interest: initialFields.total_interest,
    initial_total_due: initialFields.total_due,
    actual_payment_amount: actualPaymentAmount,
    actual_cash_flow_from_report_payment: actualPaymentAmount != null ? -actualPaymentAmount : null,
    bank_name: bankM ? bankM[1].trim() : null,
    aba_number: abaM ? abaM[1].trim() : null,
    swift_code: swiftM ? swiftM[1].trim() : null,
    account_name: acctN ? acctN[1].trim() : null,
    account_number: acctNum ? acctNum[1].trim() : null,
  }
}

// ── Breakdown ──────────────────────────────────────────────────────────────────

function buildBreakdown(a: DoverAllFields): DoverBreakdown {
  const capital_call_breakdown: DoverBreakdownItem[] = []
  const distribution_breakdown: DoverBreakdownItem[] = []

  if (a.capital_contribution_amount_for_excel) {
    capital_call_breakdown.push({
      purpose: 'capital_call',
      label: a.is_initial_contribution ? 'Initial Total Calls' : 'Capital Call',
      amount: a.capital_contribution_amount_for_excel,
      excel_usage: 'capital_contribution_amount',
    })
  }

  if (a.initial_total_interest) {
    capital_call_breakdown.push({
      purpose: 'initial_contribution_interest',
      label: 'Total Interest',
      amount: a.initial_total_interest,
      excel_usage: 'remarks_actual_payment_only_not_excel_b',
    })
  }

  if (a.return_of_capital != null) {
    distribution_breakdown.push({ purpose: 'return_of_capital', label: 'Return of Capital', amount: a.return_of_capital, excel_usage: 'distribution_detail' })
  }
  if (a.gain != null) {
    distribution_breakdown.push({ purpose: 'gain', label: 'Gain', amount: a.gain, excel_usage: 'distribution_detail' })
  }
  if (a.interest_other != null) {
    distribution_breakdown.push({ purpose: 'interest_other', label: 'Interest / Other', amount: a.interest_other, excel_usage: 'distribution_detail' })
  }
  if (a.distribution_amount_received_for_excel) {
    distribution_breakdown.push({
      purpose: 'distribution_total',
      label: 'Gross / Net / Total Distribution',
      amount: a.distribution_amount_received_for_excel,
      excel_usage: 'distribution_amount_received',
    })
  }

  return { capital_call_breakdown, distribution_breakdown }
}

// ── Excel mapping ──────────────────────────────────────────────────────────────

function calculateCurrentTransactionCashFlow(b: number, c: number): number {
  return round2(-b + c)
}

function mapToExcelFields(a: DoverAllFields, breakdown: DoverBreakdown): DoverExcelFields {
  const b = a.capital_contribution_amount_for_excel
  const c = a.distribution_amount_received_for_excel
  const d = a.reinvestable_amount_for_excel

  const cashFlow = calculateCurrentTransactionCashFlow(b, c)

  const remarksParts = ['Dover Street XI Feeder Fund transaction notice.']
  if (a.is_initial_contribution)
    remarksParts.push('Initial contribution notice. Total interest is extracted separately and excluded from Excel capital contribution amount.')
  else if (a.is_cash_distribution)
    remarksParts.push('Cash distribution notice.')
  else if (a.is_capital_call_deemed_distribution)
    remarksParts.push('Capital call and deemed distribution notice.')
  if (a.initial_total_interest)
    remarksParts.push(`Initial contribution interest: ${a.initial_total_interest}.`)
  if (a.actual_payment_amount != null)
    remarksParts.push(`Actual report payment/net amount: ${a.actual_payment_amount}.`)

  return {
    subscription_agreement_effective_date: null,
    commitment_amount: a.commitment_amount,
    transaction_date: a.transaction_date,
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
    return_of_capital: a.return_of_capital,
    gain: a.gain,
    interest_other: a.interest_other,
    actual_payment_amount: a.actual_payment_amount,
    actual_cash_flow_from_report_payment: a.actual_cash_flow_from_report_payment,
  }
}

// ── Calculation ────────────────────────────────────────────────────────────────

function calculateExcelFields(
  excel: DoverExcelFields,
  a: DoverAllFields,
  previousState: DoverPreviousState | null = null,
): DoverCalculationResult {
  const b = amountOrZero(excel.capital_contribution_amount)
  const c = amountOrZero(excel.distribution_amount_received)
  const d = amountOrZero(excel.reinvestable_amount)

  const reportE = a.report_cumulative_capital_contributions
  const reportTotalDistributions = amountOrZero(a.total_distributions_including)

  let cumulativeContributions: number | null = reportE
  let remainingCommitment: number | null = a.report_remaining_commitment
  let cumulativeCashFlow: number | null = null

  const calculationSources: Record<string, string> = {
    cumulative_capital_contributions: 'from_report_total_capital_called_no_previous_state',
    remaining_commitment: 'from_report_unfunded_commitment_no_previous_state',
    cash_flow: 'from_report_cumulative_values_no_previous_state',
    cumulative_cash_flow: 'from_report_cumulative_values_no_previous_state',
  }

  const currentCashFlow = calculateCurrentTransactionCashFlow(b, c)

  // No previous_state — fall back to report cumulatives.
  // Cumulative cash flow = -total capital called + total distributions to date.
  let finalCashFlowForExcel: number
  if (reportE != null) {
    cumulativeCashFlow = round2(-reportE + reportTotalDistributions)
    finalCashFlowForExcel = cumulativeCashFlow
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

  const calculatedFields: DoverCalculatedFields = {
    cumulative_capital_contributions: cumulativeContributions,
    remaining_commitment_formula_value: remainingCommitment,
    remaining_commitment: remainingCommitment,
    current_transaction_cash_flow: currentCashFlow,
    cumulative_cash_flow: cumulativeCashFlow,
    cash_flow_for_excel: finalCashFlowForExcel,
    distribution_not_allocated_to_reinvestment: distributionNotAllocated,
    remarks: excel.remarks,
    distribution_details: excel.distribution_details,
    return_of_capital: excel.return_of_capital,
    gain: excel.gain,
    interest_other: excel.interest_other,
  }

  return {
    input_values_for_current_row: {
      subscription_agreement_effective_date: excel.subscription_agreement_effective_date,
      commitment_amount: excel.commitment_amount,
      transaction_date: excel.transaction_date,
      capital_contribution_amount: b,
      distribution_amount_received: c,
      reinvestable_amount: d,
      return_of_capital: excel.return_of_capital,
      gain: excel.gain,
      interest_other: excel.interest_other,
    },
    previous_state_used: previousState,
    calculated_excel_fields: calculatedFields,
    calculation_sources: calculationSources,
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

function buildValidation(
  excel: DoverExcelFields,
  a: DoverAllFields,
  _breakdown: DoverBreakdown,
  calculationResult: DoverCalculationResult,
): DoverValidation {
  const requiredFields: (keyof DoverExcelFields)[] = [
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

  const c = amountOrZero(excel.distribution_amount_received)
  const roc = amountOrZero(a.return_of_capital)
  const g   = amountOrZero(a.gain)
  const io  = amountOrZero(a.interest_other)
  const detailTotal = round2(roc + g + io)
  const distributionTotalMatches = c ? round2(detailTotal) === round2(c) : null

  const reportE = a.report_cumulative_capital_contributions
  const reportF = a.report_remaining_commitment
  const cc = calculationResult.calculated_excel_fields

  return {
    missing_excel_fields: missing,
    matched_excel_fields: matched,
    calculation_checks: {
      excel_b_capital_contribution_amount: excel.capital_contribution_amount,
      excel_c_distribution_amount_received: excel.distribution_amount_received,
      excel_d_reinvestable_amount: excel.reinvestable_amount,
      return_of_capital: roc,
      gain: g,
      interest_other: io,
      distribution_detail_total: detailTotal,
      is_distribution_detail_total_matched: distributionTotalMatches,
      current_transaction_cash_flow: cc.current_transaction_cash_flow,
      actual_payment_amount: a.actual_payment_amount,
      actual_cash_flow_from_report_payment: a.actual_cash_flow_from_report_payment,
      report_cumulative_capital_contributions: reportE,
      calculated_cumulative_capital_contributions: cc.cumulative_capital_contributions,
      is_cumulative_matched_with_report: reportE != null && cc.cumulative_capital_contributions != null
        ? round2(reportE) === round2(cc.cumulative_capital_contributions) : null,
      report_remaining_commitment: reportF,
      calculated_remaining_commitment: cc.remaining_commitment,
      is_remaining_matched_with_report: reportF != null && cc.remaining_commitment != null
        ? round2(reportF) === round2(cc.remaining_commitment) : null,
      cumulative_cash_flow: cc.cumulative_cash_flow,
      cash_flow_for_excel: cc.cash_flow_for_excel,
    },
    needs_review: true,
    warnings: [
      'This module supports Dover Street XI Feeder Fund L.P. reports.',
      'Initial contribution interest is extracted separately and not included in Excel capital_contribution_amount.',
      'Dover provided Excel uses reinvestable_amount as 0 for the uploaded Dover samples.',
      'For accurate DB cumulative flow, upload reports in transaction date order.',
    ],
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function extractDoverStreetXiReport(
  rawText: string,
  fileName = '',
  previousState: DoverPreviousState | null = null,
): DoverReport {
  const text = normalizeText(rawText)
  const allFields = extractAllFields(text, fileName)
  const breakdown = buildBreakdown(allFields)
  const excelFields = mapToExcelFields(allFields, breakdown)
  const calculationResult = calculateExcelFields(excelFields, allFields, previousState)
  const validation = buildValidation(excelFields, allFields, breakdown, calculationResult)

  const calculated = calculationResult.calculated_excel_fields

  const finalExcelFields: DoverExcelFields = { ...excelFields }
  finalExcelFields.cumulative_capital_contributions =
    calculated.cumulative_capital_contributions ?? finalExcelFields.cumulative_capital_contributions
  finalExcelFields.remaining_commitment_formula_value =
    calculated.remaining_commitment_formula_value ?? finalExcelFields.remaining_commitment_formula_value
  finalExcelFields.remaining_commitment =
    calculated.remaining_commitment ?? finalExcelFields.remaining_commitment
  finalExcelFields.cash_flow =
    calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow
  finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow
  finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow
  finalExcelFields.distribution_not_allocated_to_reinvestment =
    calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment

  let documentType = 'dover_street_xi_transaction_notice'
  if (allFields.is_initial_contribution)            documentType = 'initial_contribution_notice'
  else if (allFields.is_cash_distribution)          documentType = 'cash_distribution_notice'
  else if (allFields.is_capital_call_deemed_distribution) documentType = 'capital_call_and_deemed_distribution_notice'

  return {
    source_file_name: fileName,
    extraction_status: 'success',
    module_name: 'dover_street_xi_feeder_fund',
    document_type: documentType,
    company_name: findCompanyName(text),
    fund_name: 'Dover Street XI Feeder Fund L.P.',
    currency: detectCurrency(text),
    excel_fields: excelFields,
    all_extracted_fields: allFields,
    breakdown,
    validation,
    calculation_result: { ...calculationResult, final_excel_fields_for_frontend: finalExcelFields },
    final_excel_fields: finalExcelFields,
  }
}
