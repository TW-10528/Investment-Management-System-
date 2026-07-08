// Capital Calls module — /api/v1/capital-calls

import { Hono } from 'hono'
import Decimal from 'decimal.js'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const router = new Hono<HonoEnv>()
router.use('*', auth)

function callDict(c: any, fundName?: string) {
  return {
    id:                    c.id,
    fund_id:               c.fundId,
    fund_name:             fundName ?? '',
    notice_date:           c.noticeDate?.toISOString().slice(0, 10),
    due_date:              c.dueDate?.toISOString().slice(0, 10),
    execution_date:        c.executionDate?.toISOString().slice(0, 10) ?? null,
    call_number:           c.callNumber,
    call_pct:              c.callPct ? parseFloat(c.callPct.toString()) : null,
    gross_call_usd:        parseFloat(c.grossCallUsd.toString()),
    distribution_usd:      parseFloat(c.distributionUsd.toString()),
    reinvestable_usd:      parseFloat(c.reinvestableUsd.toString()),
    net_call_usd:          parseFloat(c.netCallUsd.toString()),
    fx_rate:               c.fxRate ? parseFloat(c.fxRate.toString()) : null,
    net_call_jpy:          parseFloat(c.netCallJpy.toString()),
    investment_amount_usd: c.investmentAmountUsd ? parseFloat(c.investmentAmountUsd.toString()) : 0,
    management_fee_usd:    c.managementFeeUsd    ? parseFloat(c.managementFeeUsd.toString())    : 0,
    expense_usd:           c.expenseUsd           ? parseFloat(c.expenseUsd.toString())           : 0,
    status:                c.status,
    wire_reference:        c.wireReference,
    wire_fee_jpy:          c.wireFeeJpy ? parseFloat(c.wireFeeJpy.toString()) : 0,
    is_recallable:         c.isRecallable,
    notes:                 c.notes,
    paid_at:               c.paidAt?.toISOString() ?? null,
  }
}

// GET /
router.get('/', async (c) => {
  const where: any = {}
  const fundId = c.req.query('fund_id')
  const status = c.req.query('status')
  if (fundId) where.fundId = fundId
  if (status) where.status = status

  const calls = await prisma.capitalCall.findMany({
    where,
    include: { fund: { select: { fundName: true } } },
    orderBy: { dueDate: 'desc' },
  })
  return c.json(calls.map((cc: any) => callDict(cc, (cc as any).fund?.fundName)))
})

// GET /:id
router.get('/:id', async (c) => {
  const cc = await prisma.capitalCall.findUnique({
    where:   { id: c.req.param('id') },
    include: { fund: { select: { fundName: true } } },
  })
  if (!cc) return c.json({ detail: 'Not found' }, 404)
  return c.json(callDict(cc, (cc as any).fund?.fundName))
})

// POST /
router.post('/', async (c) => {
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

  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  const fxNum    = fx_rate ? parseFloat(fx_rate) : (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150)
  const grossUsd = parseFloat(String(gross_call_usd))
  const netUsd   = net_call_usd !== undefined ? parseFloat(String(net_call_usd)) : grossUsd
  const distUsd  = parseFloat(String(distribution_usd))
  const reInvest = parseFloat(String(reinvestable_usd))

  const last     = await prisma.capitalCall.findFirst({ where: { fundId: fund.id }, orderBy: { callNumber: 'desc' } })
  const ccNum    = call_number ?? (last?.callNumber ?? 0) + 1

  const cc = await prisma.capitalCall.create({
    data: {
      fundId:               fund.id,
      callNumber:           ccNum,
      noticeDate:           notice_date    ? new Date(notice_date)    : new Date(),
      dueDate:              due_date       ? new Date(due_date)       : new Date(),
      executionDate:        execution_date ? new Date(execution_date) : null,
      callPct:              parseFloat(String(call_pct)),
      grossCallUsd:         grossUsd,
      distributionUsd:      distUsd,
      reinvestableUsd:      reInvest,
      netCallUsd:           netUsd,
      fxRate:               fxNum,
      netCallJpy:           Math.round(netUsd * fxNum),
      investmentAmountUsd:  parseFloat(String(investment_amount_usd)),
      managementFeeUsd:     parseFloat(String(management_fee_usd)),
      expenseUsd:           parseFloat(String(expense_usd)),
      status:               initial_status ?? 'pending',
      wireReference:        wire_reference  ?? null,
      wireFeeJpy:           parseFloat(String(wire_fee_jpy)),
      isRecallable:         Boolean(is_recallable),
      notes:                notes ?? null,
    },
  })

  return c.json(callDict(cc), 201)
})

// PATCH /:id
router.patch('/:id', async (c) => {
  const cc   = await prisma.capitalCall.findUnique({ where: { id: c.req.param('id') } })
  if (!cc) return c.json({ detail: 'Not found' }, 404)

  const b    = await c.req.json().catch(() => ({}))
  const data: any = {}

  if (b.status          !== undefined) data.status         = b.status
  if (b.paid_at         !== undefined) data.paidAt         = b.paid_at ? new Date(b.paid_at) : null
  if (b.execution_date  !== undefined) data.executionDate  = b.execution_date ? new Date(b.execution_date) : null
  if (b.notes           !== undefined) data.notes          = b.notes
  if (b.wire_reference  !== undefined) data.wireReference  = b.wire_reference
  if (b.wire_fee_jpy    !== undefined) data.wireFeeJpy     = parseFloat(b.wire_fee_jpy)
  if (b.is_recallable   !== undefined) data.isRecallable   = Boolean(b.is_recallable)
  if (b.fx_rate         !== undefined) data.fxRate         = parseFloat(b.fx_rate)
  if (b.net_call_usd    !== undefined) {
    const fx = b.fx_rate ?? (data.fxRate ?? 150)
    data.netCallUsd = parseFloat(b.net_call_usd)
    data.netCallJpy = Math.round(parseFloat(b.net_call_usd) * parseFloat(String(fx)))
  }

  const updated = await prisma.capitalCall.update({ where: { id: cc.id }, data })
  return c.json(callDict(updated))
})

// DELETE /:id
router.delete('/:id', async (c) => {
  const cc = await prisma.capitalCall.findUnique({ where: { id: c.req.param('id') } })
  if (!cc) return c.json({ detail: 'Not found' }, 404)
  await prisma.capitalCall.delete({ where: { id: cc.id } })
  return c.json({ ok: true })
})

export default router
