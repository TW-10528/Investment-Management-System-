// Rules Engine — formula evaluation for PDF notice calculations

import { prisma } from '../lib/prisma'

// ── Available PDF attributes usable in formulas ───────────────────────────────

export interface AttributeInfo {
  name:        string
  label:       string
  noticeTypes: string[]
  description: string
}

export const AVAILABLE_ATTRIBUTES: AttributeInfo[] = [
  { name: 'grossCallUsd',          label: 'Gross Capital Call',         noticeTypes: ['capital_call'],                                  description: 'Total gross capital call amount in USD' },
  { name: 'netCallUsd',            label: 'Net Capital Call',            noticeTypes: ['capital_call'],                                  description: 'Net amount due after offsets, in USD' },
  { name: 'deemedDistUsd',         label: 'Deemed Distribution',         noticeTypes: ['capital_call'],                                  description: 'Distribution offset in combined notices, USD' },
  { name: 'reinvestableUsd',       label: 'Reinvestable Amount',         noticeTypes: ['capital_call', 'distribution'],                  description: 'Portion of distribution subject to recall, USD' },
  { name: 'managementFeeUsd',      label: 'Management Fee',              noticeTypes: ['capital_call'],                                  description: 'Management fee component of the call, USD' },
  { name: 'expenseUsd',            label: 'Fund Expenses',               noticeTypes: ['capital_call'],                                  description: 'Fund operating expenses, USD' },
  { name: 'investmentAmountUsd',   label: 'Investment Amount',           noticeTypes: ['capital_call'],                                  description: 'Equity investment portion, USD' },
  { name: 'callPct',               label: 'Call Percentage (decimal)',   noticeTypes: ['capital_call'],                                  description: 'e.g. 0.06 = 6% of commitment' },
  { name: 'cumulativePct',         label: 'Cumulative Called %',         noticeTypes: ['capital_call'],                                  description: 'Total % of commitment called to date' },
  { name: 'fxRate',                label: 'FX Rate (USD/JPY)',           noticeTypes: ['capital_call', 'distribution', 'financial_statement'], description: 'Exchange rate: 1 USD = N JPY' },
  { name: 'distributionUsd',       label: 'Distribution Amount',         noticeTypes: ['distribution'],                                 description: 'Total distribution amount, USD' },
  { name: 'capitalReturnUsd',      label: 'Capital Return',              noticeTypes: ['distribution'],                                 description: 'Return-of-capital portion, USD' },
  { name: 'incomeUsd',             label: 'Income / Gain',               noticeTypes: ['distribution'],                                 description: 'Income or realized gain portion, USD' },
  { name: 'recallableUsd',         label: 'Recallable Amount',           noticeTypes: ['distribution'],                                 description: 'Recallable portion of distribution, USD' },
  { name: 'navUsd',                label: 'Net Asset Value',             noticeTypes: ['financial_statement'],                          description: 'Fund NAV as stated in financial statement, USD' },
  { name: 'irr',                   label: 'IRR (%)',                     noticeTypes: ['financial_statement'],                          description: 'Internal rate of return (as percentage, e.g. 15.5)' },
  { name: 'tvpi',                  label: 'TVPI (×)',                    noticeTypes: ['financial_statement'],                          description: 'Total value to paid-in multiple' },
  { name: 'dpi',                   label: 'DPI (×)',                     noticeTypes: ['financial_statement'],                          description: 'Distributions to paid-in multiple' },
  { name: 'commitmentUsd',         label: 'LP Commitment',               noticeTypes: ['capital_call'],                                 description: 'Total LP commitment amount, USD' },
  { name: 'totalCalledUsd',        label: 'Total Called to Date',        noticeTypes: ['capital_call'],                                 description: 'Cumulative capital called, USD' },
  { name: 'unfundedUsd',           label: 'Unfunded Commitment',         noticeTypes: ['capital_call'],                                 description: 'Remaining unfunded commitment, USD' },
  { name: 'totalDistributionsUsd', label: 'Total Distributions to Date', noticeTypes: ['capital_call'],                                 description: 'Cumulative distributions received, USD' },
]

// ── Scope builder — flattens extracted PDF data into formula variables ─────────

export function buildScope(data: Record<string, any>): Record<string, number> {
  const scope: Record<string, number> = {}

  const topLevel = [
    'grossCallUsd', 'netCallUsd', 'deemedDistUsd', 'reinvestableUsd',
    'managementFeeUsd', 'expenseUsd', 'investmentAmountUsd',
    'callPct', 'cumulativePct', 'fxRate', 'distributionUsd',
    'navUsd', 'irr', 'tvpi', 'dpi',
  ]

  for (const f of topLevel) {
    if (data[f] !== undefined && data[f] !== null) {
      const v = parseFloat(String(data[f]))
      if (!isNaN(v)) scope[f] = v
    }
  }

  const addNested = (obj: any, keys: string[]) => {
    for (const k of keys) {
      if (obj?.[k] !== undefined && obj[k] !== null) {
        const v = parseFloat(String(obj[k]))
        if (!isNaN(v)) scope[k] = v
      }
    }
  }

  addNested(data.commitmentSummary,    ['commitmentUsd', 'totalCalledUsd', 'unfundedUsd', 'totalDistributionsUsd'])
  addNested(data.distributionBreakdown,['capitalReturnUsd', 'incomeUsd', 'recallableUsd'])

  // Custom-extracted attributes from AttributeExtractors (stored at top-level or _custom)
  const custom = data._custom ?? {}
  for (const [k, v] of Object.entries({ ...custom, ...data })) {
    if (typeof k === 'string' && /^[a-zA-Z_]\w*$/.test(k) && !(k in scope)) {
      const n = parseFloat(String(v))
      if (!isNaN(n)) scope[k] = n
    }
  }

  return scope
}

// ── Formula evaluator ─────────────────────────────────────────────────────────

export interface EvalResult {
  value:      number
  inputs:     Record<string, number>
  outputText: string
  error?:     string
}

export function evaluateFormula(
  formula:     string,
  scope:       Record<string, number>,
  outputUnit?: string,
): EvalResult {
  try {
    const trimmed = formula.trim()
    if (!trimmed) return { value: 0, inputs: {}, outputText: '—', error: 'Empty formula' }

    if (!/^[\w\s\+\-\*\/\(\)\.\%\^]+$/.test(trimmed)) {
      return { value: 0, inputs: {}, outputText: 'Error', error: 'Formula contains invalid characters' }
    }

    const usedInputs: Record<string, number> = {}

    const withValues = trimmed.replace(/\b([a-zA-Z_]\w*)\b/g, (match) => {
      if (match in scope) {
        usedInputs[match] = scope[match]
        return String(scope[match])
      }
      usedInputs[match] = 0
      return '0'
    })

    if (!/^[\d\s\+\-\*\/\(\)\.\%\^e]+$/.test(withValues)) {
      return { value: 0, inputs: usedInputs, outputText: 'Error', error: 'Invalid formula structure after substitution' }
    }

    const expr   = withValues.replace(/\^/g, '**')
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')() as number

    if (typeof result !== 'number' || !isFinite(result)) {
      return { value: 0, inputs: usedInputs, outputText: 'N/A', error: 'Formula produced invalid numeric result' }
    }

    return { value: result, inputs: usedInputs, outputText: formatValue(result, outputUnit) }
  } catch (e: any) {
    return { value: 0, inputs: {}, outputText: 'Error', error: e.message ?? 'Evaluation failed' }
  }
}

function formatValue(value: number, unit?: string): string {
  if (!unit || unit === '') return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (unit === 'JPY' || unit === '¥') return '¥' + Math.round(value).toLocaleString('ja-JP')
  if (unit === 'USD' || unit === '$') return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (unit === '%')  return (value * 100).toFixed(4) + '%'
  if (unit === 'x' || unit === '×') return value.toFixed(4) + '×'
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' ' + unit
}

// ── Run all active rules against a notice ─────────────────────────────────────

export async function runRulesForNotice(
  noticeId:      string,
  extractedData: Record<string, any>,
  fundId?:       string,
  noticeType?:   string,
): Promise<void> {
  const where: any = { isActive: true }
  if (noticeType) {
    where.OR = [
      { applicableTypes: { isEmpty: true } },
      { applicableTypes: { has: noticeType } },
    ]
  }

  const rules = await prisma.calculationRule.findMany({ where })
  if (rules.length === 0) return

  const scope = buildScope(extractedData)

  await prisma.calculationResult.deleteMany({ where: { noticeId } })

  for (const rule of rules) {
    const { value, inputs, outputText, error } = evaluateFormula(
      rule.formula,
      scope,
      rule.outputUnit ?? undefined,
    )

    await prisma.calculationResult.create({
      data: {
        ruleId:      rule.id,
        noticeId,
        fundId:      fundId ?? null,
        inputValues: inputs as any,
        outputValue: error ? null : value,
        outputText:  error ? null : outputText,
        error:       error ?? null,
      },
    })
  }
}
