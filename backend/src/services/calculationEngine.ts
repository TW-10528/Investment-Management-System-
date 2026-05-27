/**
 * Calculation Engine — TypeScript port of the Python version.
 *
 * Mirrors the Thirdwave Excel sheet column formulas:
 *   A  Contract effective date
 *   B  Capital paid-in          (gross call wired OUT)
 *   C  Capital received         (distributions IN)
 *   D  Reinvestable portion     (subset of C)
 *   E  Cumulative called        = prev_E + B
 *   F  Investment capacity      = prev_F - B + D
 *   G  Cash flow (period)       = -B + C
 *   H  NET Cash Position        = prev_H + G  (running)
 *
 * All arithmetic uses decimal.js to avoid float rounding errors.
 */

import Decimal from 'decimal.js'
import { prisma } from '../lib/prisma'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 28 })

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Transaction {
  date:            Date
  txType:          'capital_call' | 'distribution'
  description:     string
  fxRate:          Decimal | null
  capitalPaidIn:   Decimal   // B
  capitalReceived: Decimal   // C
  reinvestable:    Decimal   // D
  callId?:         string
  distId?:         string
  wireReference?:  string | null
}

export interface LedgerRow extends Transaction {
  cumulativeCalled:    Decimal  // E
  investmentCapacity:  Decimal  // F
  cashFlow:            Decimal  // G
  netCashPosition:     Decimal  // H
  capitalPaidJpy:      Decimal
  capitalReceivedJpy:  Decimal
}

export interface FundSnapshot {
  commitmentUsd:      Decimal
  totalCalledUsd:     Decimal
  totalReceivedUsd:   Decimal
  drawnPct:           Decimal
  unfundedUsd:        Decimal
  investmentCapacity: Decimal
  netCashPosition:    Decimal
  dpi:                Decimal
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class CalculationEngine {

  /** Build a full Excel-style ledger from sorted transactions. */
  static buildLedger(
    commitmentUsd: Decimal,
    transactions:  Transaction[],
    defaultFx:     Decimal = new Decimal('150'),
  ): { rows: LedgerRow[]; snapshot: FundSnapshot } {
    const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime())

    let E = new Decimal(0)   // cumulative called
    let F = commitmentUsd    // investment capacity
    let H = new Decimal(0)   // net cash position

    const rows: LedgerRow[] = []

    for (const tx of sorted) {
      const B    = tx.capitalPaidIn
      const C    = tx.capitalReceived
      const D    = tx.reinvestable
      const rate = tx.fxRate ?? defaultFx

      E = E.plus(B)                // E = prev_E + B
      F = F.minus(B).plus(D)       // F = prev_F - B + D
      const G = new Decimal(0).minus(B).plus(C)  // G = -B + C
      H = H.plus(G)                // H = prev_H + G

      rows.push({
        ...tx,
        cumulativeCalled:   E,
        investmentCapacity: F,
        cashFlow:           G,
        netCashPosition:    H,
        capitalPaidJpy:     B.mul(rate).toDecimalPlaces(0),
        capitalReceivedJpy: C.mul(rate).toDecimalPlaces(0),
      })
    }

    const totalCalled    = rows.reduce((s, r) => s.plus(r.capitalPaidIn),   new Decimal(0))
    const totalReceived  = rows.reduce((s, r) => s.plus(r.capitalReceived), new Decimal(0))
    const drawnPct       = commitmentUsd.gt(0)
      ? totalCalled.div(commitmentUsd).mul(100).toDecimalPlaces(2)
      : new Decimal(0)
    const lastRow        = rows[rows.length - 1]

    const snapshot: FundSnapshot = {
      commitmentUsd,
      totalCalledUsd:     totalCalled,
      totalReceivedUsd:   totalReceived,
      drawnPct,
      unfundedUsd:        commitmentUsd.minus(totalCalled),
      investmentCapacity: lastRow?.investmentCapacity ?? commitmentUsd,
      netCashPosition:    lastRow?.netCashPosition    ?? new Decimal(0),
      dpi:                totalCalled.gt(0)
        ? totalReceived.div(totalCalled).toDecimalPlaces(4)
        : new Decimal(0),
    }

    return { rows, snapshot }
  }

  /** Get current fund summary (used by list and dashboard endpoints). */
  static async fundSummary(fund: any): Promise<Record<string, unknown>> {
    const [paidCalls, distributions] = await Promise.all([
      prisma.capitalCall.findMany({
        where:   { fundId: fund.id, status: 'paid' },
        orderBy: { executionDate: 'asc' },
      }),
      prisma.distribution.findMany({
        where:   { fundId: fund.id },
        orderBy: { distributionDate: 'asc' },
      }),
    ])

    const commitment = new Decimal(fund.commitmentUsd.toString())

    const txns: Transaction[] = [
      ...paidCalls.map((c: any) => ({
        date:            c.executionDate ?? c.dueDate,
        txType:          'capital_call' as const,
        description:     `Capital Call #${c.callNumber}`,
        fxRate:          c.fxRate ? new Decimal(c.fxRate.toString()) : null,
        capitalPaidIn:   new Decimal(c.grossCallUsd.toString()),
        capitalReceived: new Decimal(c.distributionUsd.toString()),
        reinvestable:    new Decimal(c.reinvestableUsd.toString()),
        callId:          c.id,
        wireReference:   c.wireReference,
      })),
      ...distributions.map((d: any) => ({
        date:            d.distributionDate,
        txType:          'distribution' as const,
        description:     d.distType,
        fxRate:          d.fxRate ? new Decimal(d.fxRate.toString()) : null,
        capitalPaidIn:   new Decimal(0),
        capitalReceived: new Decimal(d.amountUsd.toString()),
        reinvestable:    new Decimal(d.reinvestableUsd.toString()),
        distId:          d.id,
      })),
    ]

    if (txns.length === 0) {
      const c = parseFloat(commitment.toString())
      return {
        fund_id:            fund.id,
        fund_name:          fund.fundName,
        fund_name_jp:       fund.fundNameJp,
        manager:            fund.manager,
        strategy:           fund.strategy,
        vintage_year:       fund.vintageYear,
        currency:           fund.currency,
        commitment_usd:     c,
        total_called_usd:   0,
        total_received_usd: 0,
        drawn_pct:          0,
        unfunded_usd:       c,
        investment_capacity: c,
        net_cash_position:  0,
        dpi:                0,
      }
    }

    const { snapshot } = CalculationEngine.buildLedger(commitment, txns)
    const f = (d: Decimal) => parseFloat(d.toString())

    return {
      fund_id:             fund.id,
      fund_name:           fund.fundName,
      fund_name_jp:        fund.fundNameJp,
      manager:             fund.manager,
      strategy:            fund.strategy,
      vintage_year:        fund.vintageYear,
      currency:            fund.currency,
      commitment_usd:      f(commitment),
      total_called_usd:    f(snapshot.totalCalledUsd),
      total_received_usd:  f(snapshot.totalReceivedUsd),
      drawn_pct:           f(snapshot.drawnPct),
      unfunded_usd:        f(snapshot.unfundedUsd),
      investment_capacity: f(snapshot.investmentCapacity),
      net_cash_position:   f(snapshot.netCashPosition),
      dpi:                 f(snapshot.dpi),
    }
  }
}
