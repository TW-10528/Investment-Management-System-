// Funds module — /api/v1/funds

import { Hono } from 'hono'
import Decimal from 'decimal.js'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { guard } from '../../middleware/guard'
import { prisma } from '../../lib/prisma'
import { logAction } from '../../services/auditService'
import { CalculationEngine } from '../../services/calculationEngine'

const router = new Hono<HonoEnv>()
router.use('*', auth)

// GET /
router.get('/', async (c) => {
  const funds     = await prisma.fund.findMany({ orderBy: { fundName: 'asc' } })
  const summaries = await Promise.all(funds.map(f => CalculationEngine.fundSummary(f)))
  return c.json(summaries)
})

// GET /:id
router.get('/:id', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  const summary = await CalculationEngine.fundSummary(fund)
  return c.json({
    id:                     fund.id,
    fund_name:              fund.fundName,
    fund_name_jp:           fund.fundNameJp,
    manager:                fund.manager,
    administrator:          fund.administrator,
    strategy:               fund.strategy,
    vintage_year:           fund.vintageYear,
    currency:               fund.currency,
    commitment_usd:         parseFloat(fund.commitmentUsd.toString()),
    entry_fx_rate:          fund.entryFxRate ? parseFloat(fund.entryFxRate.toString()) : null,
    management_fee_pct:     fund.managementFeePct ? parseFloat(fund.managementFeePct.toString()) : 0,
    carry_pct:              fund.carryPct ? parseFloat(fund.carryPct.toString()) : 0,
    hurdle_rate_pct:        fund.hurdleRatePct ? parseFloat(fund.hurdleRatePct.toString()) : 0,
    wire_bank:              fund.wireBank,
    wire_account_name:      fund.wireAccountName,
    wire_account_number:    fund.wireAccountNumber,
    wire_aba:               fund.wireAba,
    wire_swift:             fund.wireSwift,
    wire_reference:         fund.wireReference,
    notes:                  fund.notes,
    is_active:              fund.isActive,
    summary,
  })
})

// GET /:id/ledger
router.get('/:id/ledger', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)

  const [paidCalls, distributions] = await Promise.all([
    prisma.capitalCall.findMany({ where: { fundId: fund.id, status: 'paid' }, orderBy: { executionDate: 'asc' } }),
    prisma.distribution.findMany({ where: { fundId: fund.id }, orderBy: { distributionDate: 'asc' } }),
  ])

  const commitment = new Decimal(fund.commitmentUsd.toString())

  const txns = [
    ...paidCalls.map((cc: any) => ({
      date:            cc.executionDate ?? cc.dueDate,
      txType:          'capital_call' as const,
      description:     `Capital Call #${cc.callNumber}`,
      fxRate:          cc.fxRate ? new Decimal(cc.fxRate.toString()) : null,
      capitalPaidIn:   new Decimal(cc.grossCallUsd.toString()),
      capitalReceived: new Decimal(cc.distributionUsd.toString()),
      reinvestable:    new Decimal(cc.reinvestableUsd.toString()),
      callId:          cc.id,
      wireReference:   cc.wireReference,
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
    return c.json({ fund_id: fund.id, fund_name: fund.fundName, commitment: parseFloat(commitment.toString()), rows: [], snapshot: null })
  }

  const { rows, snapshot } = CalculationEngine.buildLedger(commitment, txns)
  const f = (d: Decimal) => parseFloat(d.toString())

  return c.json({
    fund_id:    fund.id,
    fund_name:  fund.fundName,
    commitment: f(commitment),
    rows: rows.map((r, i) => ({
      date:                r.date.toISOString().slice(0, 10),
      tx_type:             r.txType,
      description:         r.description,
      fx_rate:             r.fxRate ? f(r.fxRate) : null,
      capital_paid_in:     f(r.capitalPaidIn),
      capital_received:    f(r.capitalReceived),
      reinvestable:        f(r.reinvestable),
      cumulative_called:   f(r.cumulativeCalled),
      investment_capacity: f(r.investmentCapacity),
      cash_flow:           f(r.cashFlow),
      net_cash_position:   f(r.netCashPosition),
      capital_paid_jpy:    f(r.capitalPaidJpy),
      capital_received_jpy:f(r.capitalReceivedJpy),
      call_id:             (txns[i] as any)?.callId,
      dist_id:             (txns[i] as any)?.distId,
      wire_reference:      (txns[i] as any)?.wireReference,
    })),
    snapshot: {
      commitment_usd:      f(snapshot.commitmentUsd),
      total_called_usd:    f(snapshot.totalCalledUsd),
      total_received_usd:  f(snapshot.totalReceivedUsd),
      drawn_pct:           f(snapshot.drawnPct),
      unfunded_usd:        f(snapshot.unfundedUsd),
      investment_capacity: f(snapshot.investmentCapacity),
      net_cash_position:   f(snapshot.netCashPosition),
      dpi:                 f(snapshot.dpi),
    },
  })
})

// POST /
router.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))

  const data: any = {
    fundName:          body.fund_name,
    fundNameJp:        body.fund_name_jp    ?? null,
    manager:           body.manager         ?? null,
    administrator:     body.administrator   ?? null,
    strategy:          body.strategy        ?? null,
    vintageYear:       body.vintage_year    ? parseInt(body.vintage_year) : null,
    currency:          body.currency        ?? 'USD',
    commitmentUsd:     body.commitment_usd  ? new Decimal(body.commitment_usd) : new Decimal(0),
    entryFxRate:       body.entry_fx_rate   ? new Decimal(body.entry_fx_rate)  : null,
    managementFeePct:  body.management_fee_pct ?? 0,
    carryPct:          body.carry_pct       ?? 0,
    hurdleRatePct:     body.hurdle_rate_pct ?? 0,
    wireBank:          body.wire_bank       ?? null,
    wireAccountName:   body.wire_account_name   ?? null,
    wireAccountNumber: body.wire_account_number ?? null,
    wireAba:           body.wire_aba        ?? null,
    wireSwift:         body.wire_swift      ?? null,
    wireReference:     body.wire_reference  ?? null,
    notes:             body.notes           ?? null,
  }

  if (data.entryFxRate && data.commitmentUsd) {
    data.commitmentJpy = BigInt(Math.round(parseFloat(data.commitmentUsd.toString()) * parseFloat(data.entryFxRate.toString())))
  }

  const fund = await prisma.fund.create({ data })
  await logAction('CREATE', 'funds', user.email, user.id, fund.id, undefined, body)
  return c.json({ id: fund.id, fund_name: fund.fundName })
})

// PUT /:id
router.put('/:id', async (c) => {
  const user = c.get('user')
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const data: any = {}

  if (body.fund_name             !== undefined) data.fundName            = body.fund_name
  if (body.fund_name_jp          !== undefined) data.fundNameJp          = body.fund_name_jp
  if (body.manager               !== undefined) data.manager             = body.manager
  if (body.administrator         !== undefined) data.administrator       = body.administrator
  if (body.strategy              !== undefined) data.strategy            = body.strategy
  if (body.vintage_year          !== undefined) data.vintageYear         = body.vintage_year ? parseInt(body.vintage_year) : null
  if (body.currency              !== undefined) data.currency            = body.currency
  if (body.commitment_usd        !== undefined) data.commitmentUsd       = new Decimal(body.commitment_usd)
  if (body.entry_fx_rate         !== undefined) data.entryFxRate         = body.entry_fx_rate ? new Decimal(body.entry_fx_rate) : null
  if (body.contract_date         !== undefined) data.contractDate        = body.contract_date ? new Date(body.contract_date) : null
  if (body.investment_period_start !== undefined) data.investmentPeriodStart = body.investment_period_start ? new Date(body.investment_period_start) : null
  if (body.investment_period_end   !== undefined) data.investmentPeriodEnd   = body.investment_period_end   ? new Date(body.investment_period_end)   : null
  if (body.fund_term_years       !== undefined) data.fundTermYears       = body.fund_term_years ? parseInt(body.fund_term_years) : null
  if (body.management_fee_pct    !== undefined) data.managementFeePct    = body.management_fee_pct
  if (body.carry_pct             !== undefined) data.carryPct            = body.carry_pct
  if (body.hurdle_rate_pct       !== undefined) data.hurdleRatePct       = body.hurdle_rate_pct
  if (body.wire_bank             !== undefined) data.wireBank            = body.wire_bank
  if (body.wire_account_name     !== undefined) data.wireAccountName     = body.wire_account_name
  if (body.wire_account_number   !== undefined) data.wireAccountNumber   = body.wire_account_number
  if (body.wire_aba              !== undefined) data.wireAba             = body.wire_aba
  if (body.wire_swift            !== undefined) data.wireSwift           = body.wire_swift
  if (body.wire_reference        !== undefined) data.wireReference       = body.wire_reference
  if (body.is_active             !== undefined) data.isActive            = Boolean(body.is_active)
  if (body.notes                 !== undefined) data.notes               = body.notes

  await prisma.fund.update({ where: { id: fund.id }, data })
  await logAction('UPDATE', 'funds', user.email, user.id, fund.id)
  return c.json({ id: fund.id, fund_name: fund.fundName })
})

// DELETE /:id  — soft delete (deactivate)
router.delete('/:id', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  await prisma.fund.update({ where: { id: fund.id }, data: { isActive: false } })
  return c.json({ message: 'Fund deactivated' })
})

// PATCH /:id/reactivate
router.patch('/:id/reactivate', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  await prisma.fund.update({ where: { id: fund.id }, data: { isActive: true } })
  return c.json({ message: 'Fund reactivated' })
})

// ── Capital calls per fund ────────────────────────────────────────────────────

router.get('/:id/capital-calls', async (c) => {
  const calls = await prisma.capitalCall.findMany({ where: { fundId: c.req.param('id') }, orderBy: { dueDate: 'asc' } })
  return c.json(calls.map((cc: any) => ({
    id:             cc.id,
    call_number:    cc.callNumber,
    notice_date:    cc.noticeDate?.toISOString().slice(0, 10),
    due_date:       cc.dueDate?.toISOString().slice(0, 10),
    call_pct:       cc.callPct ? parseFloat(cc.callPct.toString()) : null,
    gross_call_usd: parseFloat(cc.grossCallUsd.toString()),
    net_call_usd:   parseFloat(cc.netCallUsd.toString()),
    net_call_jpy:   parseFloat(cc.netCallJpy.toString()),
    fx_rate:        cc.fxRate ? parseFloat(cc.fxRate.toString()) : null,
    status:         cc.status,
    paid_at:        cc.paidAt?.toISOString() ?? null,
    notes:          cc.notes,
  })))
})

router.post('/:id/capital-calls', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  const b       = await c.req.json().catch(() => ({}))
  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  const fxRate   = b.fx_rate ? parseFloat(b.fx_rate) : (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150)
  const netUsd   = parseFloat(b.net_call_usd ?? b.gross_call_usd ?? 0)
  const last     = await prisma.capitalCall.findFirst({ where: { fundId: fund.id }, orderBy: { callNumber: 'desc' } })
  const cc = await prisma.capitalCall.create({ data: {
    fundId:          fund.id,
    callNumber:      (last?.callNumber ?? 0) + 1,
    noticeDate:      b.notice_date ? new Date(b.notice_date) : new Date(),
    dueDate:         new Date(b.due_date),
    grossCallUsd:    parseFloat(b.gross_call_usd ?? netUsd),
    netCallUsd:      netUsd,
    reinvestableUsd: 0,
    netCallJpy:      Math.round(netUsd * fxRate),
    fxRate,
    callPct:         b.call_pct ? parseFloat(b.call_pct) : 0,
    notes:           b.notes ?? null,
    status:          b.status ?? 'pending',
  }})
  return c.json({ id: cc.id }, 201)
})

router.patch('/:id/capital-calls/:ccId', async (c) => {
  const b    = await c.req.json().catch(() => ({}))
  const data: any = {}
  if (b.status      !== undefined) data.status  = b.status
  if (b.paid_at     !== undefined) data.paidAt  = b.paid_at ? new Date(b.paid_at) : null
  if (b.notes       !== undefined) data.notes   = b.notes
  if (b.net_call_usd!== undefined) {
    const fx = b.fx_rate ?? 150
    data.netCallUsd = parseFloat(b.net_call_usd)
    data.netCallJpy = Math.round(parseFloat(b.net_call_usd) * fx)
  }
  await prisma.capitalCall.update({ where: { id: c.req.param('ccId') }, data })
  return c.json({ ok: true })
})

router.delete('/:id/capital-calls/:ccId', async (c) => {
  await prisma.capitalCall.delete({ where: { id: c.req.param('ccId') } })
  return c.json({ ok: true })
})

// ── Distributions per fund ────────────────────────────────────────────────────

router.get('/:id/distributions', async (c) => {
  const dists = await prisma.distribution.findMany({ where: { fundId: c.req.param('id') }, orderBy: { distributionDate: 'asc' } })
  return c.json(dists.map((d: any) => ({
    id:                d.id,
    distribution_date: d.distributionDate?.toISOString().slice(0, 10),
    dist_type:         d.distType,
    amount_usd:        parseFloat(d.amountUsd.toString()),
    amount_jpy:        parseFloat(d.amountJpy.toString()),
    fx_rate:           d.fxRate ? parseFloat(d.fxRate.toString()) : null,
    reinvestable_usd:  parseFloat(d.reinvestableUsd.toString()),
    is_recallable:     d.isRecallable,
    notes:             null,
  })))
})

router.post('/:id/distributions', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  const b       = await c.req.json().catch(() => ({}))
  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  const fxRate   = b.fx_rate ? parseFloat(b.fx_rate) : (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150)
  const amtUsd   = parseFloat(b.amount_usd ?? 0)
  const d = await prisma.distribution.create({ data: {
    fundId:           fund.id,
    distributionDate: new Date(b.distribution_date),
    distType:         b.dist_type ?? 'Income',
    amountUsd:        amtUsd,
    amountJpy:        Math.round(amtUsd * fxRate),
    fxRate,
    reinvestableUsd:  parseFloat(b.reinvestable_usd ?? 0),
    isRecallable:     b.is_recallable ?? false,
  }})
  return c.json({ id: d.id }, 201)
})

router.patch('/:id/distributions/:dId', async (c) => {
  const b    = await c.req.json().catch(() => ({}))
  const data: any = {}
  if (b.amount_usd        !== undefined) data.amountUsd        = parseFloat(b.amount_usd)
  if (b.dist_type         !== undefined) data.distType         = b.dist_type
  if (b.distribution_date !== undefined) data.distributionDate = new Date(b.distribution_date)
  if (b.reinvestable_usd  !== undefined) data.reinvestableUsd  = parseFloat(b.reinvestable_usd)
  await prisma.distribution.update({ where: { id: c.req.param('dId') }, data })
  return c.json({ ok: true })
})

router.delete('/:id/distributions/:dId', async (c) => {
  await prisma.distribution.delete({ where: { id: c.req.param('dId') } })
  return c.json({ ok: true })
})

// ── NAV records per fund ──────────────────────────────────────────────────────

router.get('/:id/nav-records', async (c) => {
  const records = await prisma.navRecord.findMany({ where: { fundId: c.req.param('id') }, orderBy: { navDate: 'desc' } })
  return c.json(records.map((n: any) => ({
    id:       n.id,
    nav_date: n.navDate?.toISOString().slice(0, 10),
    nav_usd:  parseFloat(n.navUsd?.toString() ?? '0'),
    period:   n.period,
  })))
})

router.post('/:id/nav-records', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const n = await prisma.navRecord.create({ data: {
    fundId:  fund.id,
    navDate: new Date(b.nav_date),
    navUsd:  parseFloat(b.nav_usd ?? 0),
    period:  b.period ?? null,
  }})
  return c.json({ id: n.id }, 201)
})

router.patch('/:id/nav-records/:nId', async (c) => {
  const b    = await c.req.json().catch(() => ({}))
  const data: any = {}
  if (b.nav_usd !== undefined) data.navUsd  = parseFloat(b.nav_usd)
  if (b.nav_date!== undefined) data.navDate = new Date(b.nav_date)
  if (b.period  !== undefined) data.period  = b.period
  await prisma.navRecord.update({ where: { id: c.req.param('nId') }, data })
  return c.json({ ok: true })
})

router.delete('/:id/nav-records/:nId', async (c) => {
  await prisma.navRecord.delete({ where: { id: c.req.param('nId') } })
  return c.json({ ok: true })
})

export default router
