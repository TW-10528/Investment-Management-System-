// Dashboard module — /api/v1/dashboard

import { Hono } from 'hono'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'
import { CalculationEngine } from '../../services/calculationEngine'

const router = new Hono<HonoEnv>()
router.use('*', auth)

// GET /summary
router.get('/summary', async (c) => {
  const funds     = await prisma.fund.findMany({ where: { isActive: true } })
  const summaries = await Promise.all(funds.map(f => CalculationEngine.fundSummary(f)))

  // For each fund, use contract commitment (USD or JPY) if it exists, else use current commitment
  const totalCommitment = summaries.reduce((s: number, f: any, idx: number) => {
    const contractUsd = funds[idx].contractCommitmentUsd ? parseFloat(funds[idx].contractCommitmentUsd.toString()) : 0
    const contractJpy = funds[idx].contractCommitmentJpy ? parseFloat(funds[idx].contractCommitmentJpy.toString()) : 0
    const currentCommit = f.commitment_usd
    // Use USD if available, else use JPY (as-is for JPY funds like SDG), else use current commitment
    return s + (contractUsd > 0 ? contractUsd : (contractJpy > 0 ? contractJpy : currentCommit))
  }, 0)
  const totalCalled     = summaries.reduce((s: number, f: any) => s + f.total_called_usd, 0)
  const totalReceived   = summaries.reduce((s: number, f: any) => s + f.total_received_usd, 0)
  const netCash         = summaries.reduce((s: number, f: any) => s + f.net_cash_position, 0)
  const dryPowder       = summaries.reduce((s: number, f: any) => s + f.unfunded_usd, 0)
  const drawnPct        = totalCommitment > 0 ? (totalCalled / totalCommitment * 100) : 0

  const today        = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd     = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)
  const pendingCalls = await prisma.capitalCall.findMany({ where: { status: { in: ['pending', 'approved'] } } })
  const overdueCalls = pendingCalls
    .filter(cc => { const d = new Date(cc.dueDate); return d >= today && d <= todayEnd; })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })

  // Enrich summaries with contract commitment values
  const enrichedSummaries = summaries.map((s: any, idx: number) => ({
    ...s,
    contract_commitment_usd: funds[idx].contractCommitmentUsd ? parseFloat(funds[idx].contractCommitmentUsd.toString()) : null,
    contract_commitment_jpy: funds[idx].contractCommitmentJpy ? parseFloat(funds[idx].contractCommitmentJpy.toString()) : null,
  }))

  const strategyMap: Record<string, { commitment: number; called: number; count: number }> = {}
  for (const s of enrichedSummaries as any[]) {
    const strat = s.strategy ?? 'Other'
    if (!strategyMap[strat]) strategyMap[strat] = { commitment: 0, called: 0, count: 0 }
    strategyMap[strat].commitment += s.commitment_usd
    strategyMap[strat].called     += s.total_called_usd
    strategyMap[strat].count      += 1
  }

  const dists       = await prisma.distribution.findMany()
  const distBreakdown = { capital_return_usd: 0, income_usd: 0, recallable_usd: 0, deemed_usd: 0, total_usd: 0 }
  for (const d of dists) {
    const amt = parseFloat(d.amountUsd.toString())
    distBreakdown.total_usd += amt
    if      (d.distType === 'Capital Return') distBreakdown.capital_return_usd += amt
    else if (d.distType === 'Income')         distBreakdown.income_usd         += amt
    else if (d.distType === 'Recallable')     distBreakdown.recallable_usd     += amt
    else if (d.distType === 'Deemed')         distBreakdown.deemed_usd         += amt
  }

  const navRecords: Record<string, any> = {}
  for (const fund of funds) {
    const nav = await prisma.navRecord.findFirst({ where: { fundId: fund.id }, orderBy: { navDate: 'desc' } })
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

  const recentInv = await prisma.investmentTarget.findMany({
    take:    8,
    orderBy: { createdAt: 'desc' },
    include: { fund: { select: { fundName: true } } },
  })

  const totalValue = totalReceived + totalNavUsd          // Distributions + NAV
  const tvpi    = totalCalled > 0 ? totalValue / totalCalled : 0
  const moic    = tvpi                                    // Total Value / Contributions

  // Portfolio IRR (XIRR) — every fund's net cash flow (−B+C) + residual NAV inflow.
  const irrCalls = await prisma.capitalCall.findMany({ where: { status: { in: ['approved', 'paid'] } } })
  const irrFlows: { date: Date; amount: number }[] = [
    ...irrCalls.map(cc => ({
      date:   cc.executionDate ?? cc.dueDate,
      amount: -parseFloat(cc.grossCallUsd.toString()) + parseFloat(cc.distributionUsd.toString()),
    })),
    ...dists.map(d => ({ date: d.distributionDate, amount: parseFloat(d.amountUsd.toString()) })),
    ...Object.values(navRecords).map((n: any) => ({ date: new Date(n.navDate), amount: parseFloat(n.navUsd?.toString() ?? '0') })),
  ]
  const portIrrRaw = CalculationEngine.xirr(irrFlows.map(x => ({ date: new Date(x.date), amount: x.amount })))
  const portfolioIrr = portIrrRaw != null ? Math.round(portIrrRaw * 1000) / 10 : null

  return c.json({
    total_funds:           funds.length,
    total_commitment_usd:  totalCommitment,
    total_called_usd:      totalCalled,
    total_received_usd:    totalReceived,
    net_cash_position:     netCash,
    drawn_pct:             Math.round(drawnPct * 100) / 100,
    unfunded_usd:          dryPowder,
    dry_powder_usd:        dryPowder,

    dpi:  totalCalled > 0 ? Math.round(totalReceived / totalCalled * 10000) / 10000 : 0,
    tvpi: Math.round(tvpi * 10000) / 10000,
    moic: Math.round(moic * 10000) / 10000,
    total_nav_usd:   totalNavUsd,
    total_value_usd: totalValue,
    irr: portfolioIrr,

    pending_calls_count: pendingCalls.length,
    overdue_calls_count: overdueCalls.length,
    overdue_calls: overdueCalls.map(cc => ({
      id:           cc.id,
      due_date:     cc.dueDate.toISOString().slice(0, 10),
      net_call_usd: parseFloat(cc.netCallUsd.toString()),
    })),

    latest_fx_rate: latestFx ? parseFloat(latestFx.usdJpy.toString()) : null,
    latest_fx_date: latestFx ? latestFx.rateDate.toISOString().slice(0, 10) : null,

    fund_summaries:       enrichedSummaries,
    strategy_breakdown:   Object.entries(strategyMap).map(([strategy, v]) => ({ strategy, ...v })),
    distribution_breakdown: distBreakdown,
    nav_by_fund:          navByFund,

    recent_investments: recentInv.map(it => ({
      id:              it.id,
      fund_id:         it.fundId,
      fund_name:       (it as any).fund?.fundName ?? '',
      project_name:    it.projectName,
      actual_name:     it.actualName,
      investment_date: it.investmentDate?.toISOString().slice(0, 10) ?? null,
      amount_usd:      it.amountUsd ? parseFloat(it.amountUsd.toString()) : 0,
      investment_type: it.investmentType,
      sector:          it.sector,
      geography:       it.geography,
    })),
  })
})

export default router
