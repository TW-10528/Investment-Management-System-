/** Dashboard — /api/v1/dashboard */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma'
import { auth, type AuthVars } from '../middleware/auth'
import { CalculationEngine } from '../services/calculationEngine'

const app = new Hono<AuthVars>()
app.use('*', auth)

// GET /summary
app.get('/summary', async (c) => {
  const funds    = await prisma.fund.findMany({ where: { isActive: true } })
  const summaries = await Promise.all(funds.map(f => CalculationEngine.fundSummary(f)))

  const totalCommitment = summaries.reduce((s: number, f: any) => s + f.commitment_usd, 0)
  const totalCalled     = summaries.reduce((s: number, f: any) => s + f.total_called_usd, 0)
  const totalReceived   = summaries.reduce((s: number, f: any) => s + f.total_received_usd, 0)
  const netCash         = summaries.reduce((s: number, f: any) => s + f.net_cash_position, 0)
  const dryPowder       = summaries.reduce((s: number, f: any) => s + f.unfunded_usd, 0)
  const drawnPct        = totalCommitment > 0 ? (totalCalled / totalCommitment * 100) : 0

  // Capital calls status
  const today        = new Date()
  today.setHours(0, 0, 0, 0)
  const pendingCalls = await prisma.capitalCall.findMany({ where: { status: 'pending' } })
  const overdueCalls = pendingCalls.filter(c => new Date(c.dueDate) < today)

  // Latest FX rate
  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })

  // Strategy breakdown
  const strategyMap: Record<string, { commitment: number; called: number; count: number }> = {}
  for (const s of summaries as any[]) {
    const strat = s.strategy ?? 'Other'
    if (!strategyMap[strat]) strategyMap[strat] = { commitment: 0, called: 0, count: 0 }
    strategyMap[strat].commitment += s.commitment_usd
    strategyMap[strat].called     += s.total_called_usd
    strategyMap[strat].count      += 1
  }

  // Distribution breakdown (capital return vs income)
  const dists = await prisma.distribution.findMany()
  const distBreakdown = { capital_return_usd: 0, income_usd: 0, recallable_usd: 0, deemed_usd: 0, total_usd: 0 }
  for (const d of dists) {
    const amt = parseFloat(d.amountUsd.toString())
    distBreakdown.total_usd += amt
    if (d.distType === 'Capital Return')    distBreakdown.capital_return_usd += amt
    else if (d.distType === 'Income')       distBreakdown.income_usd         += amt
    else if (d.distType === 'Recallable')   distBreakdown.recallable_usd     += amt
    else if (d.distType === 'Deemed')       distBreakdown.deemed_usd         += amt
  }

  // NAV per fund
  const navRecords: Record<string, any> = {}
  for (const fund of funds) {
    const nav = await prisma.navRecord.findFirst({
      where:   { fundId: fund.id },
      orderBy: { navDate: 'desc' },
    })
    if (nav) navRecords[fund.id] = nav
  }
  const totalNavUsd = Object.values(navRecords).reduce((s, n) => s + parseFloat(n.navUsd?.toString() ?? '0'), 0)
  const navByFund   = funds
    .filter(f => navRecords[f.id])
    .map(f => ({
      fund_id:   f.id,
      fund_name: f.fundName,
      nav_date:  navRecords[f.id].navDate.toISOString().slice(0, 10),
      nav_usd:   parseFloat(navRecords[f.id].navUsd?.toString() ?? '0'),
      period:    navRecords[f.id].period,
    }))

  // Recent investment targets
  const recentInv = await prisma.investmentTarget.findMany({
    take:    8,
    orderBy: { createdAt: 'desc' },
    include: { fund: { select: { fundName: true } } },
  })

  // TVPI (Total Value to Paid-In)
  const tvpiNum = totalReceived + totalNavUsd
  const tvpi    = totalCalled > 0 ? tvpiNum / totalCalled : 0

  return c.json({
    // Core portfolio KPIs
    total_funds:           funds.length,
    total_commitment_usd:  totalCommitment,
    total_called_usd:      totalCalled,
    total_received_usd:    totalReceived,
    net_cash_position:     netCash,
    drawn_pct:             Math.round(drawnPct * 100) / 100,
    unfunded_usd:          dryPowder,
    dry_powder_usd:        dryPowder,

    // Multiples
    dpi:  totalCalled > 0 ? Math.round(totalReceived / totalCalled * 10000) / 10000 : 0,
    tvpi: Math.round(tvpi * 10000) / 10000,
    total_nav_usd: totalNavUsd,

    // Capital calls
    pending_calls_count: pendingCalls.length,
    overdue_calls_count: overdueCalls.length,
    overdue_calls: overdueCalls.map(cc => ({
      id:           cc.id,
      due_date:     cc.dueDate.toISOString().slice(0, 10),
      net_call_usd: parseFloat(cc.netCallUsd.toString()),
    })),

    // FX
    latest_fx_rate: latestFx ? parseFloat(latestFx.usdJpy.toString()) : null,
    latest_fx_date: latestFx ? latestFx.rateDate.toISOString().slice(0, 10) : null,

    // Per-fund summaries
    fund_summaries: summaries,

    // Strategy breakdown
    strategy_breakdown: Object.entries(strategyMap).map(([strategy, v]) => ({ strategy, ...v })),

    // Distribution P&L
    distribution_breakdown: distBreakdown,

    // NAV
    nav_by_fund: navByFund,

    // Recent investments
    recent_investments: recentInv.map(it => ({
      id:             it.id,
      fund_id:        it.fundId,
      fund_name:      it.fund?.fundName ?? '',
      project_name:   it.projectName,
      actual_name:    it.actualName,
      investment_date:it.investmentDate?.toISOString().slice(0, 10) ?? null,
      amount_usd:     it.amountUsd ? parseFloat(it.amountUsd.toString()) : 0,
      investment_type:it.investmentType,
      sector:         it.sector,
      geography:      it.geography,
    })),
  })
})

export default app
