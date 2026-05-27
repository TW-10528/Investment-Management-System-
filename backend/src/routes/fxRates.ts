/** FX Rates — /api/v1/fx-rates */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma'
import { auth, type AuthVars } from '../middleware/auth'

const app = new Hono<AuthVars>()
app.use('*', auth)

function rateDict(r: any) {
  return {
    id:       r.id,
    date:     r.rateDate?.toISOString().slice(0, 10),
    usd_jpy:  parseFloat(r.usdJpy.toString()),
    source:   r.source,
  }
}

// GET /
app.get('/', async (c) => {
  const rates = await prisma.fxRate.findMany({ orderBy: { rateDate: 'desc' } })
  return c.json(rates.map(rateDict))
})

// GET /latest
app.get('/latest', async (c) => {
  const rate = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  if (!rate) return c.json({ usd_jpy: null, date: null })
  return c.json({ usd_jpy: parseFloat(rate.usdJpy.toString()), date: rate.rateDate.toISOString().slice(0, 10) })
})

// GET /live  (fetches from frankfurter.app)
app.get('/live', async (c) => {
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=USD&to=JPY')
    const data = await res.json() as any
    const rate = data?.rates?.JPY
    if (!rate) return c.json({ detail: 'Live rate unavailable' }, 503)
    return c.json({ usd_jpy: rate, date: data.date })
  } catch {
    return c.json({ detail: 'Live rate fetch failed' }, 503)
  }
})

// GET /history
app.get('/history', async (c) => {
  const days   = parseInt(c.req.query('days') ?? '90')
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const rates = await prisma.fxRate.findMany({
    where:   { rateDate: { gte: cutoff } },
    orderBy: { rateDate: 'asc' },
  })
  return c.json(rates.map(rateDict))
})

// POST /
app.post('/', async (c) => {
  const { rate_date, usd_jpy, source = 'manual' } = await c.req.json().catch(() => ({}))
  if (!rate_date || !usd_jpy) return c.json({ detail: 'rate_date and usd_jpy required' }, 400)

  // Upsert — one rate per date
  const existing = await prisma.fxRate.findFirst({ where: { rateDate: new Date(rate_date) } })
  if (existing) {
    const updated = await prisma.fxRate.update({
      where: { id: existing.id },
      data:  { usdJpy: usd_jpy, source },
    })
    return c.json(rateDict(updated))
  }

  const rate = await prisma.fxRate.create({
    data: { rateDate: new Date(rate_date), usdJpy: usd_jpy, source },
  })
  return c.json(rateDict(rate))
})

export default app
