// AI Validation Service — compares a newly extracted notice against the fund's
// historical capital call and distribution patterns stored in Prisma.
//
// No external API is required. All intelligence comes from the fund's own data.
// The service produces structured ValidationFlags that the Notices UI renders.

import { prisma } from '../lib/prisma'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FlagSeverity = 'error' | 'warning' | 'info'

export interface ValidationFlag {
  field:    string        // which extracted field triggered this
  severity: FlagSeverity
  message:  string        // human-readable explanation
  expected?: string       // what the historical baseline suggests
  actual?:   string       // what was extracted from the PDF
}

export interface HistoricalContext {
  callCount:            number
  avgGrossCallUsd:      number
  stdGrossCallUsd:      number
  avgManagementFeeUsd:  number
  avgCallPct:           number
  avgDaysBetweenCalls:  number
  lastCallNumber:       number
  lastCumulativePct:    number   // sum of callPct from all past calls (0–1)
  commitmentUsdInDb:    number
}

export interface ValidationResult {
  ran:                boolean   // false when fund has no history to compare against
  overallRisk:        'low' | 'medium' | 'high'
  flags:              ValidationFlag[]
  historicalContext:  HistoricalContext | null
  summary:            string    // one-paragraph plain-English summary
  validatedAt:        string    // ISO timestamp
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stddev(arr: number[], m: number): number {
  if (arr.length < 2) return 0
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1))
}

function zScore(value: number, m: number, s: number): number {
  if (s < 0.001) return 0
  return Math.abs((value - m) / s)
}

function usd(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function pct(n: number): string {
  return (n * 100).toFixed(2) + '%'
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function validateExtractedNotice(
  fundId:        string | null,
  extractedData: Record<string, any>,
  noticeType:    string,
): Promise<ValidationResult> {
  const empty = (msg: string): ValidationResult => ({
    ran: false, overallRisk: 'low', flags: [],
    historicalContext: null, summary: msg,
    validatedAt: new Date().toISOString(),
  })

  if (!fundId) return empty('No fund linked — historical validation skipped.')

  const fund = await prisma.fund.findUnique({
    where:  { id: fundId },
    select: { id: true, fundName: true, commitmentUsd: true },
  })
  if (!fund) return empty('Fund not found in database.')

  // ── Pull historical approved/paid capital calls ───────────────────────────
  const pastCalls = await prisma.capitalCall.findMany({
    where:   { fundId, status: { in: ['approved', 'paid'] } },
    orderBy: { dueDate: 'asc' },
  })

  const pastDists = await prisma.distribution.findMany({
    where:   { fundId },
    orderBy: { distributionDate: 'asc' },
  })

  // ── Build historical context ──────────────────────────────────────────────
  const callCount = pastCalls.length

  const grossAmounts    = pastCalls.map(c => parseFloat(c.grossCallUsd.toString()))
  const mgmtFees        = pastCalls.map(c => parseFloat((c.managementFeeUsd ?? 0).toString()))
  const callPcts        = pastCalls.map(c => parseFloat((c.callPct ?? 0).toString()))
  const lastCall        = pastCalls[pastCalls.length - 1] ?? null
  const lastCallNumber  = lastCall?.callNumber ?? 0
  const cumulativePct   = callPcts.reduce((s, p) => s + p, 0)

  const avgGross  = mean(grossAmounts)
  const stdGross  = stddev(grossAmounts, avgGross)
  const avgFee    = mean(mgmtFees)
  const avgPct    = mean(callPcts)

  // Days between consecutive calls
  let avgDays = 0
  if (pastCalls.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < pastCalls.length; i++) {
      const a = new Date(pastCalls[i - 1].dueDate).getTime()
      const b = new Date(pastCalls[i].dueDate).getTime()
      gaps.push((b - a) / 86_400_000)
    }
    avgDays = mean(gaps)
  }

  const historicalContext: HistoricalContext = {
    callCount,
    avgGrossCallUsd:     avgGross,
    stdGrossCallUsd:     stdGross,
    avgManagementFeeUsd: avgFee,
    avgCallPct:          avgPct,
    avgDaysBetweenCalls: avgDays,
    lastCallNumber,
    lastCumulativePct:   cumulativePct,
    commitmentUsdInDb:   parseFloat(fund.commitmentUsd.toString()),
  }

  // ── Extract the values from the newly parsed notice ───────────────────────
  const newGross   = parseFloat(String(extractedData.grossCallUsd      ?? extractedData.amounts?.[0] ?? 0))
  const newFee     = parseFloat(String(extractedData.managementFeeUsd  ?? 0))
  const newCallPct = parseFloat(String(extractedData.callPct           ?? 0))
  const newCallNum = parseInt(  String(extractedData.callNumber        ?? 0), 10)
  const newCumPct  = parseFloat(String(extractedData.cumulativePct     ??
                                       extractedData.commitmentSummary?.totalCalledPct ?? 0))
  const pdfCommit  = parseFloat(String(extractedData.commitmentUsd     ??
                                       extractedData.commitmentSummary?.commitmentUsd  ?? 0))
  const newDueDate = extractedData.dueDate ?? extractedData.dates?.[0] ?? null

  const flags: ValidationFlag[] = []

  // ── Checks for capital calls ──────────────────────────────────────────────
  if (noticeType === 'capital_call') {

    // 1. Call amount vs historical average
    if (callCount >= 2 && newGross > 0 && avgGross > 0) {
      const z     = zScore(newGross, avgGross, stdGross)
      const ratio = newGross / avgGross

      if (z > 3.0 || ratio > 4) {
        flags.push({
          field:    'grossCallUsd',
          severity: 'error',
          message:  `Call amount is ${ratio.toFixed(1)}× the fund average — extremely unusual.`,
          expected: usd(avgGross) + ' (avg)',
          actual:   usd(newGross),
        })
      } else if (z > 1.8 || ratio > 2) {
        flags.push({
          field:    'grossCallUsd',
          severity: 'warning',
          message:  `Call amount is ${ratio.toFixed(1)}× the fund average — above normal range.`,
          expected: usd(avgGross) + ' (avg)',
          actual:   usd(newGross),
        })
      }
    }

    // 2. Management fee vs historical ratio
    if (callCount >= 2 && newFee > 0 && avgFee > 0) {
      const feeRatio = newFee / avgFee
      if (feeRatio > 3.5) {
        flags.push({
          field:    'managementFeeUsd',
          severity: 'error',
          message:  `Management fee is ${feeRatio.toFixed(1)}× the historical average — verify before approving.`,
          expected: usd(avgFee) + ' (avg)',
          actual:   usd(newFee),
        })
      } else if (feeRatio > 2) {
        flags.push({
          field:    'managementFeeUsd',
          severity: 'warning',
          message:  `Management fee is ${feeRatio.toFixed(1)}× the historical average.`,
          expected: usd(avgFee) + ' (avg)',
          actual:   usd(newFee),
        })
      }
    }

    // 3. Call number sequence check
    if (callCount > 0 && newCallNum > 0) {
      const expectedNum = lastCallNumber + 1
      if (newCallNum !== expectedNum) {
        flags.push({
          field:    'callNumber',
          severity: newCallNum < expectedNum ? 'warning' : 'error',
          message:  newCallNum < expectedNum
            ? `Call number ${newCallNum} may be a duplicate — last recorded call was #${lastCallNumber}.`
            : `Call number ${newCallNum} skips expected #${expectedNum}. Missing call notice?`,
          expected: `Call #${expectedNum}`,
          actual:   `Call #${newCallNum}`,
        })
      }
    }

    // 4. Cumulative % monotonicity — should always increase
    if (callCount > 0 && newCumPct > 0 && cumulativePct > 0) {
      if (newCumPct < cumulativePct - 0.001) {
        flags.push({
          field:    'cumulativePct',
          severity: 'error',
          message:  `Cumulative called % dropped from ${pct(cumulativePct)} to ${pct(newCumPct)} — impossible without a reversal. Check for data entry error.`,
          expected: `> ${pct(cumulativePct)}`,
          actual:   pct(newCumPct),
        })
      }
      if (newCumPct > 1.001) {
        flags.push({
          field:    'cumulativePct',
          severity: 'error',
          message:  `Cumulative called % is ${pct(newCumPct)} — exceeds 100% of commitment. Likely extraction error.`,
          expected: '<= 100%',
          actual:   pct(newCumPct),
        })
      }
    }

    // 5. Commitment stated in PDF vs stored in DB
    if (pdfCommit > 0 && historicalContext.commitmentUsdInDb > 0) {
      const commitDrift = Math.abs(pdfCommit - historicalContext.commitmentUsdInDb) / historicalContext.commitmentUsdInDb
      if (commitDrift > 0.05) {
        flags.push({
          field:    'commitmentUsd',
          severity: 'warning',
          message:  `Commitment amount in PDF (${usd(pdfCommit)}) differs by ${(commitDrift * 100).toFixed(1)}% from fund record (${usd(historicalContext.commitmentUsdInDb)}).`,
          expected: usd(historicalContext.commitmentUsdInDb),
          actual:   usd(pdfCommit),
        })
      }
    }

    // 6. Due date gap — flag if very soon or unusually far from last call
    if (lastCall && newDueDate && avgDays > 0) {
      const lastDue  = new Date(lastCall.dueDate).getTime()
      const newDue   = new Date(newDueDate).getTime()
      const daysDiff = (newDue - lastDue) / 86_400_000

      if (daysDiff < 14) {
        flags.push({
          field:    'dueDate',
          severity: 'warning',
          message:  `Due date is only ${Math.round(daysDiff)} days after the previous call. Unusually short interval.`,
          expected: `~${Math.round(avgDays)} days after last call`,
          actual:   `${Math.round(daysDiff)} days`,
        })
      } else if (daysDiff > avgDays * 3) {
        flags.push({
          field:    'dueDate',
          severity: 'info',
          message:  `${Math.round(daysDiff)} days since the last call — longer than the fund's typical ${Math.round(avgDays)}-day interval.`,
          expected: `~${Math.round(avgDays)} days`,
          actual:   `${Math.round(daysDiff)} days`,
        })
      }
    }

    // 7. First-call sanity — if this is the first call and amount > commitment
    if (callCount === 0 && newGross > 0 && historicalContext.commitmentUsdInDb > 0) {
      if (newGross > historicalContext.commitmentUsdInDb) {
        flags.push({
          field:    'grossCallUsd',
          severity: 'error',
          message:  `First call amount (${usd(newGross)}) exceeds total fund commitment (${usd(historicalContext.commitmentUsdInDb)}).`,
          expected: `<= ${usd(historicalContext.commitmentUsdInDb)}`,
          actual:   usd(newGross),
        })
      }
    }
  }

  // ── Checks for distributions ──────────────────────────────────────────────
  if (noticeType === 'distribution') {
    const newDistAmt = parseFloat(String(
      extractedData.distributionUsd ?? extractedData.amounts?.[0] ??
      extractedData.distributionBreakdown?.totalUsd ?? 0
    ))

    const totalCalled = pastCalls.reduce((s, c) => s + parseFloat(c.grossCallUsd.toString()), 0)
    const totalDisted  = pastDists.reduce((s, d) => s + parseFloat(d.amountUsd.toString()), 0)

    if (newDistAmt > 0 && totalCalled > 0) {
      // Distribution larger than total called is a strong anomaly
      if (newDistAmt > totalCalled * 1.5) {
        flags.push({
          field:    'distributionUsd',
          severity: 'error',
          message:  `Distribution amount (${usd(newDistAmt)}) exceeds 150% of total capital called (${usd(totalCalled)}). Likely extraction error.`,
          expected: `<= ${usd(totalCalled)}`,
          actual:   usd(newDistAmt),
        })
      }

      // Distribution would make total > 3× DPI — flag for review
      const newDpi = totalCalled > 0 ? (totalDisted + newDistAmt) / totalCalled : 0
      if (newDpi > 3.0) {
        flags.push({
          field:    'distributionUsd',
          severity: 'warning',
          message:  `After this distribution, fund DPI reaches ${newDpi.toFixed(2)}× — verify this is correct.`,
          expected: 'DPI < 3.0×',
          actual:   `DPI ${newDpi.toFixed(2)}×`,
        })
      }
    }
  }

  // ── Determine overall risk ────────────────────────────────────────────────
  const hasError   = flags.some(f => f.severity === 'error')
  const hasWarning = flags.some(f => f.severity === 'warning')
  const overallRisk: 'low' | 'medium' | 'high' =
    hasError ? 'high' : hasWarning ? 'medium' : 'low'

  // ── Generate summary ──────────────────────────────────────────────────────
  const summary = buildSummary(
    fund.fundName, noticeType, callCount, flags, overallRisk,
    historicalContext, newGross, newFee,
  )

  return {
    ran: true,
    overallRisk,
    flags,
    historicalContext,
    summary,
    validatedAt: new Date().toISOString(),
  }
}

// ── Plain-English summary builder ─────────────────────────────────────────────

function buildSummary(
  fundName:    string,
  noticeType:  string,
  callCount:   number,
  flags:       ValidationFlag[],
  risk:        'low' | 'medium' | 'high',
  ctx:         HistoricalContext,
  newGross:    number,
  newFee:      number,
): string {
  if (callCount === 0) {
    return `This is the first ${noticeType.replace('_', ' ')} recorded for ${fundName}. No historical baseline exists yet — manual review recommended.`
  }

  if (flags.length === 0) {
    return `All extracted values are within normal range for ${fundName} based on ${callCount} historical call${callCount !== 1 ? 's' : ''}. No anomalies detected.`
  }

  const errorFlags   = flags.filter(f => f.severity === 'error')
  const warningFlags = flags.filter(f => f.severity === 'warning')

  const parts: string[] = []

  if (errorFlags.length > 0) {
    parts.push(`${errorFlags.length} critical issue${errorFlags.length > 1 ? 's' : ''} detected: ${errorFlags.map(f => f.message).join(' | ')}`)
  }
  if (warningFlags.length > 0) {
    parts.push(`${warningFlags.length} warning${warningFlags.length > 1 ? 's' : ''}: ${warningFlags.map(f => f.message).join(' | ')}`)
  }

  const baseline = ctx.avgGrossCallUsd > 0
    ? ` Historical baseline for this fund: avg call ${usd(ctx.avgGrossCallUsd)} over ${callCount} calls.`
    : ''

  const riskLabel = risk === 'high' ? 'DO NOT approve without verification.' : risk === 'medium' ? 'Review flagged fields before approving.' : ''

  return `${parts.join(' ')}.${baseline} ${riskLabel}`.trim()
}
