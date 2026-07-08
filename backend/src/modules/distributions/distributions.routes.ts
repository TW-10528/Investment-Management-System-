// Distributions module — /api/v1/distributions

import { Hono } from 'hono'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const router = new Hono<HonoEnv>()
router.use('*', auth)

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
router.get('/', async (c) => {
  const fundId = c.req.query('fund_id')
  const dists  = await prisma.distribution.findMany({
    where:   fundId ? { fundId } : {},
    include: { fund: { select: { fundName: true } } },
    orderBy: { distributionDate: 'desc' },
  })
  return c.json(dists.map((d: any) => distDict(d, (d as any).fund?.fundName)))
})

// POST /
router.post('/', async (c) => {
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
      distType:         dist_type ?? 'Income',
      amountUsd:        parseFloat(String(amount_usd)),
      amountJpy,
      fxRate:           fxDecimal,
      reinvestableUsd:  parseFloat(String(reinvestable_usd)),
      isRecallable:     Boolean(is_recallable),
      recallExpiry:     recall_expiry ? new Date(recall_expiry) : null,
      isRecalled:       Boolean(is_recalled),
    },
  })

  return c.json(distDict(dist), 201)
})

// PATCH /:id
router.patch('/:id', async (c) => {
  const dist = await prisma.distribution.findUnique({ where: { id: c.req.param('id') } })
  if (!dist) return c.json({ detail: 'Not found' }, 404)

  const b    = await c.req.json().catch(() => ({}))
  const data: any = {}
  if (b.amount_usd        !== undefined) data.amountUsd        = parseFloat(b.amount_usd)
  if (b.dist_type         !== undefined) data.distType         = b.dist_type
  if (b.distribution_date !== undefined) data.distributionDate = new Date(b.distribution_date)
  if (b.reinvestable_usd  !== undefined) data.reinvestableUsd  = parseFloat(b.reinvestable_usd)
  if (b.is_recallable     !== undefined) data.isRecallable     = Boolean(b.is_recallable)
  if (b.is_recalled       !== undefined) data.isRecalled       = Boolean(b.is_recalled)
  if (b.recall_expiry     !== undefined) data.recallExpiry     = b.recall_expiry ? new Date(b.recall_expiry) : null

  await prisma.distribution.update({ where: { id: dist.id }, data })
  return c.json({ ok: true })
})

// DELETE /:id
router.delete('/:id', async (c) => {
  const dist = await prisma.distribution.findUnique({ where: { id: c.req.param('id') } })
  if (!dist) return c.json({ detail: 'Not found' }, 404)
  await prisma.distribution.delete({ where: { id: dist.id } })
  return c.json({ ok: true })
})

export default router
