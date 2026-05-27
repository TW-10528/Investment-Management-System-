/** Funds — /api/v1/funds */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma'
import { auth, type AuthVars } from '../middleware/auth'
import { logAction } from '../services/auditService'
import { CalculationEngine } from '../services/calculationEngine'
import Decimal from 'decimal.js'

const app = new Hono<AuthVars>()
app.use('*', auth)

// GET /
app.get('/', async (c) => {
  const funds = await prisma.fund.findMany({
    where:   { isActive: true },
    orderBy: { fundName: 'asc' },
  })
  const summaries = await Promise.all(funds.map(f => CalculationEngine.fundSummary(f)))
  return c.json(summaries)
})

// GET /:fund_id
app.get('/:id', async (c) => {
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

// GET /:fund_id/ledger
app.get('/:id/ledger', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)

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

  const txns = [
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
    return c.json({ fund_id: fund.id, fund_name: fund.fundName, commitment: parseFloat(commitment.toString()), rows: [], snapshot: null })
  }

  const { rows, snapshot } = CalculationEngine.buildLedger(commitment, txns)
  const f = (d: Decimal) => parseFloat(d.toString())

  return c.json({
    fund_id:    fund.id,
    fund_name:  fund.fundName,
    commitment: f(commitment),
    rows: rows.map((r, i) => ({
      date:               r.date.toISOString().slice(0, 10),
      tx_type:            r.txType,
      description:        r.description,
      fx_rate:            r.fxRate ? f(r.fxRate) : null,
      capital_paid_in:    f(r.capitalPaidIn),
      capital_received:   f(r.capitalReceived),
      reinvestable:       f(r.reinvestable),
      cumulative_called:  f(r.cumulativeCalled),
      investment_capacity:f(r.investmentCapacity),
      cash_flow:          f(r.cashFlow),
      net_cash_position:  f(r.netCashPosition),
      capital_paid_jpy:   f(r.capitalPaidJpy),
      capital_received_jpy: f(r.capitalReceivedJpy),
      call_id:            txns[i]?.callId,
      dist_id:            (txns[i] as any)?.distId,
      wire_reference:     txns[i]?.wireReference,
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
app.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))

  const data: any = {
    fundName:         body.fund_name,
    fundNameJp:       body.fund_name_jp ?? null,
    manager:          body.manager ?? null,
    administrator:    body.administrator ?? null,
    strategy:         body.strategy ?? null,
    vintageYear:      body.vintage_year ? parseInt(body.vintage_year) : null,
    currency:         body.currency ?? 'USD',
    commitmentUsd:    body.commitment_usd ? new Decimal(body.commitment_usd) : new Decimal(0),
    entryFxRate:      body.entry_fx_rate ? new Decimal(body.entry_fx_rate) : null,
    managementFeePct: body.management_fee_pct ?? 0,
    carryPct:         body.carry_pct ?? 0,
    hurdleRatePct:    body.hurdle_rate_pct ?? 0,
    wireBank:         body.wire_bank ?? null,
    wireAccountName:  body.wire_account_name ?? null,
    wireAccountNumber:body.wire_account_number ?? null,
    wireAba:          body.wire_aba ?? null,
    wireSwift:        body.wire_swift ?? null,
    wireReference:    body.wire_reference ?? null,
    notes:            body.notes ?? null,
  }

  if (data.entryFxRate && data.commitmentUsd) {
    data.commitmentJpy = BigInt(Math.round(parseFloat(data.commitmentUsd.toString()) * parseFloat(data.entryFxRate.toString())))
  }

  const fund = await prisma.fund.create({ data })
  await logAction('CREATE', 'funds', user.email, user.id, fund.id, undefined, body)

  return c.json({ id: fund.id, fund_name: fund.fundName })
})

// PUT /:id
app.put('/:id', async (c) => {
  const user = c.get('user')
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const data: any = {}

  if (body.fund_name         !== undefined) data.fundName         = body.fund_name
  if (body.fund_name_jp      !== undefined) data.fundNameJp       = body.fund_name_jp
  if (body.manager           !== undefined) data.manager          = body.manager
  if (body.strategy          !== undefined) data.strategy         = body.strategy
  if (body.vintage_year      !== undefined) data.vintageYear      = parseInt(body.vintage_year)
  if (body.currency          !== undefined) data.currency         = body.currency
  if (body.commitment_usd    !== undefined) data.commitmentUsd    = new Decimal(body.commitment_usd)
  if (body.entry_fx_rate     !== undefined) data.entryFxRate      = new Decimal(body.entry_fx_rate)
  if (body.management_fee_pct!== undefined) data.managementFeePct = body.management_fee_pct
  if (body.carry_pct         !== undefined) data.carryPct         = body.carry_pct
  if (body.hurdle_rate_pct   !== undefined) data.hurdleRatePct    = body.hurdle_rate_pct
  if (body.notes             !== undefined) data.notes            = body.notes

  await prisma.fund.update({ where: { id: fund.id }, data })
  await logAction('UPDATE', 'funds', user.email, user.id, fund.id)

  return c.json({ id: fund.id, fund_name: fund.fundName })
})

// DELETE /:id
app.delete('/:id', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  await prisma.fund.update({ where: { id: fund.id }, data: { isActive: false } })
  return c.json({ message: 'Fund deactivated' })
})

export default app
