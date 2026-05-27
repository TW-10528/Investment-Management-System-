/** Capital Calls — /api/v1/capital-calls */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma'
import { auth, type AuthVars } from '../middleware/auth'
import Decimal from 'decimal.js'

const app = new Hono<AuthVars>()
app.use('*', auth)

function callDict(c: any, fundName?: string) {
  return {
    id:                   c.id,
    fund_id:              c.fundId,
    fund_name:            fundName ?? '',
    notice_date:          c.noticeDate?.toISOString().slice(0, 10),
    due_date:             c.dueDate?.toISOString().slice(0, 10),
    execution_date:       c.executionDate?.toISOString().slice(0, 10) ?? null,
    call_number:          c.callNumber,
    call_pct:             c.callPct ? parseFloat(c.callPct.toString()) : null,
    gross_call_usd:       parseFloat(c.grossCallUsd.toString()),
    distribution_usd:     parseFloat(c.distributionUsd.toString()),
    reinvestable_usd:     parseFloat(c.reinvestableUsd.toString()),
    net_call_usd:         parseFloat(c.netCallUsd.toString()),
    fx_rate:              c.fxRate ? parseFloat(c.fxRate.toString()) : null,
    net_call_jpy:         parseFloat(c.netCallJpy.toString()),
    investment_amount_usd:c.investmentAmountUsd ? parseFloat(c.investmentAmountUsd.toString()) : 0,
    management_fee_usd:   c.managementFeeUsd ? parseFloat(c.managementFeeUsd.toString()) : 0,
    expense_usd:          c.expenseUsd ? parseFloat(c.expenseUsd.toString()) : 0,
    status:               c.status,
    wire_reference:       c.wireReference,
    wire_fee_jpy:         c.wireFeeJpy ? parseFloat(c.wireFeeJpy.toString()) : 0,
    is_recallable:        c.isRecallable,
    notes:                c.notes,
    paid_at:              c.paidAt?.toISOString() ?? null,
  }
}

// GET /
app.get('/', async (c) => {
  const fundId = c.req.query('fund_id')
  const status = c.req.query('status')

  const where: any = {}
  if (fundId) where.fundId = fundId
  if (status) where.status = status

  const calls = await prisma.capitalCall.findMany({
    where,
    include: { fund: { select: { fundName: true } } },
    orderBy: { dueDate: 'desc' },
  })

  return c.json(calls.map(cc => callDict(cc, cc.fund?.fundName)))
})

// GET /:id
app.get('/:id', async (c) => {
  const cc = await prisma.capitalCall.findUnique({
    where:   { id: c.req.param('id') },
    include: { fund: { select: { fundName: true } } },
  })
  if (!cc) return c.json({ detail: 'Not found' }, 404)
  return c.json(callDict(cc, cc.fund?.fundName))
})

// POST /
app.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const {
    fund_id, notice_date, due_date, execution_date, call_number,
    call_pct = 0, gross_call_usd = 0, distribution_usd = 0,
    reinvestable_usd = 0, net_call_usd, fx_rate,
    investment_amount_usd = 0, management_fee_usd = 0, expense_usd = 0,
    wire_reference, wire_fee_jpy = 0, is_recallable = false, notes,
    initial_status,
  } = body

  const fund = await prisma.fund.findUnique({ where: { id: fund_id } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)

  const netUsd = net_call_usd ?? (parseFloat(gross_call_usd) - parseFloat(distribution_usd))

  let fxRate = fx_rate ? new Decimal(fx_rate) : null
  if (!fxRate) {
    const latest = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
    fxRate = latest ? new Decimal(latest.usdJpy.toString()) : new Decimal('150')
  }

  const netJpy = Math.round(parseFloat(netUsd.toString()) * parseFloat(fxRate.toString()))
  const isPaid = initial_status === 'paid'

  const cc = await prisma.capitalCall.create({
    data: {
      fundId:             fund_id,
      noticeDate:         new Date(notice_date),
      dueDate:            new Date(due_date),
      executionDate:      execution_date ? new Date(execution_date) : (isPaid ? new Date(due_date) : null),
      callNumber:         call_number ?? null,
      callPct:            call_pct,
      grossCallUsd:       gross_call_usd,
      distributionUsd:    distribution_usd,
      reinvestableUsd:    reinvestable_usd,
      netCallUsd:         netUsd,
      fxRate,
      netCallJpy:         netJpy,
      investmentAmountUsd:investment_amount_usd,
      managementFeeUsd:   management_fee_usd,
      expenseUsd:         expense_usd,
      wireReference:      wire_reference ?? null,
      wireFeeJpy:         wire_fee_jpy,
      isRecallable:       is_recallable,
      notes:              notes ?? null,
      status:             isPaid ? 'paid' : 'pending',
      paidAt:             isPaid ? new Date() : null,
    },
  })

  return c.json(callDict(cc))
})

// PATCH /:id/approve
app.patch('/:id/approve', async (c) => {
  const user = c.get('user')
  const cc   = await prisma.capitalCall.findUnique({ where: { id: c.req.param('id') } })
  if (!cc) return c.json({ detail: 'Not found' }, 404)

  const updated = await prisma.capitalCall.update({
    where: { id: cc.id },
    data:  { status: 'approved', approvedBy: user.id, approvedAt: new Date() },
  })
  return c.json(callDict(updated))
})

// PATCH /:id/mark-paid
app.patch('/:id/mark-paid', async (c) => {
  const cc = await prisma.capitalCall.findUnique({ where: { id: c.req.param('id') } })
  if (!cc) return c.json({ detail: 'Not found' }, 404)

  const updated = await prisma.capitalCall.update({
    where: { id: cc.id },
    data:  {
      status:        'paid',
      paidAt:        new Date(),
      executionDate: cc.executionDate ?? cc.dueDate,
    },
  })
  return c.json(callDict(updated))
})

export default app
