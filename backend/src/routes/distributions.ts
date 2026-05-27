/** Distributions — /api/v1/distributions */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma'
import { auth, type AuthVars } from '../middleware/auth'

const app = new Hono<AuthVars>()
app.use('*', auth)

function distDict(d: any, fundName?: string) {
  return {
    id:                d.id,
    fund_id:           d.fundId,
    fund_name:         fundName ?? '',
    distribution_date: d.distributionDate?.toISOString().slice(0, 10),
    dist_type:         d.distType,
    amount_usd:        parseFloat(d.amountUsd.toString()),
    amount_jpy:        parseFloat(d.amountJpy.toString()),
    fx_rate:           d.fxRate ? parseFloat(d.fxRate.toString()) : null,
    reinvestable_usd:  parseFloat(d.reinvestableUsd.toString()),
    is_recallable:     d.isRecallable,
    recall_expiry:     d.recallExpiry?.toISOString().slice(0, 10) ?? null,
    is_recalled:       d.isRecalled,
  }
}

// GET /
app.get('/', async (c) => {
  const fundId = c.req.query('fund_id')
  const dists = await prisma.distribution.findMany({
    where:   fundId ? { fundId } : {},
    include: { fund: { select: { fundName: true } } },
    orderBy: { distributionDate: 'desc' },
  })
  return c.json(dists.map(d => distDict(d, d.fund?.fundName)))
})

// POST /
app.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const {
    fund_id, distribution_date, dist_type,
    amount_usd = 0, fx_rate, reinvestable_usd = 0,
    is_recallable = false, recall_expiry, is_recalled = false,
  } = body

  const fund = await prisma.fund.findUnique({ where: { id: fund_id } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)

  let fxDecimal = fx_rate ? parseFloat(fx_rate) : null
  if (!fxDecimal) {
    const latest = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
    fxDecimal = latest ? parseFloat(latest.usdJpy.toString()) : 150
  }

  const amountJpy = Math.round(parseFloat(amount_usd) * fxDecimal)

  const dist = await prisma.distribution.create({
    data: {
      fundId:           fund_id,
      distributionDate: new Date(distribution_date),
      distType:         dist_type,
      amountUsd:        amount_usd,
      amountJpy,
      fxRate:           fxDecimal,
      reinvestableUsd:  reinvestable_usd,
      isRecallable:     is_recallable,
      recallExpiry:     recall_expiry ? new Date(recall_expiry) : null,
      isRecalled:       is_recalled,
    },
  })
  return c.json(distDict(dist))
})

// DELETE /:id
app.delete('/:id', async (c) => {
  const d = await prisma.distribution.findUnique({ where: { id: c.req.param('id') } })
  if (!d) return c.json({ detail: 'Distribution not found' }, 404)
  await prisma.distribution.delete({ where: { id: d.id } })
  return c.json({ message: 'Deleted' })
})

export default app
