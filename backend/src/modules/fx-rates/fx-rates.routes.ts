// FX Rates module — /api/v1/fx-rates

import { Hono } from 'hono'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const router = new Hono<HonoEnv>()
router.use('*', auth)

function rateDict(r: any) {
  return {
    id:      r.id,
    date:    r.rateDate?.toISOString().slice(0, 10),
    usd_jpy: parseFloat(r.usdJpy.toString()),
    source:  r.source,
  }
}

// GET /
router.get('/', async (c) => {
  const rates = await prisma.fxRate.findMany({ orderBy: { rateDate: 'desc' } })
  return c.json(rates.map(rateDict))
})

// GET /latest
router.get('/latest', async (c) => {
  const rate = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  if (!rate) return c.json({ usd_jpy: null, date: null })
  return c.json({ usd_jpy: parseFloat(rate.usdJpy.toString()), date: rate.rateDate.toISOString().slice(0, 10) })
})

// GET /live
router.get('/live', async (c) => {
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

// GET /cross?from=USD&to=JPY,EUR,GBP,AUD  — proxies Frankfurter for multi-currency panel
router.get('/cross', async (c) => {
  const from = c.req.query('from') || 'USD'
  const to   = c.req.query('to')   || 'JPY,EUR,GBP,AUD'
  try {
    const res  = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`)
    if (!res.ok) return c.json({ detail: 'Cross rate unavailable' }, 503)
    const data = await res.json()
    return c.json(data)
  } catch {
    return c.json({ detail: 'Cross rate fetch failed' }, 503)
  }
})

// ── MURC scraper: fetches TTS+TTB for USD/JPY on a given date, returns TTM ──
async function fetchMurcUsdJpy(date: string): Promise<{ tts: number; ttb: number; ttm: number } | null> {
  try {
    const [yyyy, mm, dd] = date.split('-')
    if (!yyyy || !mm || !dd) return null
    const id = yyyy.slice(2) + mm + dd   // YYMMDD e.g. "240610"

    const res = await fetch(`https://www.murc-kawasesouba.jp/fx/past/index.php?id=${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IMS/1.0)' }
    })
    if (!res.ok) return null

    const html = await res.text()

    // HTML: <td class="t_center">USD</td><td class="t_right">158.01 </td><td class="t_right">156.01 </td>
    const m = html.match(/USD<\/td>\s*<td[^>]*>([\d.]+)\s*<\/td>\s*<td[^>]*>([\d.]+)\s*<\/td>/)
    if (!m) return null

    const tts = parseFloat(m[1])
    const ttb = parseFloat(m[2])
    if (isNaN(tts) || isNaN(ttb)) return null

    const ttm = Math.round((tts + ttb) / 2 * 100) / 100
    return { tts, ttb, ttm }
  } catch {
    return null
  }
}

// GET /historical?date=2024-06-10&from=USD&to=JPY
// 1. Checks DB for stored MUFG TTM rate.
// 2. If not found, scrapes MURC website to compute TTM = (TTS+TTB)/2.
// 3. Returns rate + source so frontend can offer "Save to DB".
router.get('/historical', async (c) => {
  const date = c.req.query('date')
  const from = c.req.query('from') || 'USD'
  const to   = c.req.query('to')   || 'JPY'
  if (!date) return c.json({ detail: 'date required' }, 400)

  const isUsdJpy = (from === 'USD' && to === 'JPY') || (from === 'JPY' && to === 'USD')
  if (!isUsdJpy) return c.json({ detail: 'MUFG TTM is only available for USD/JPY' }, 404)

  // ── 1. DB lookup ──────────────────────────────────────────────────────────
  const stored = await prisma.fxRate.findFirst({
    where: { rateDate: { gte: new Date(date + 'T00:00:00Z'), lte: new Date(date + 'T23:59:59Z') } },
  })
  if (stored) {
    const usdJpy   = parseFloat(stored.usdJpy.toString())
    const mufgRate = from === 'USD' ? usdJpy : Math.round((1 / usdJpy) * 1e8) / 1e8
    return c.json({ date, from, to, mufg_rate: mufgRate, usd_jpy: usdJpy, source: 'db' })
  }

  // ── 2. MURC scrape ────────────────────────────────────────────────────────
  const murc = await fetchMurcUsdJpy(date)
  if (!murc) return c.json({ detail: 'No MUFG TTM rate found for this date (not a trading day or not yet published)' }, 404)

  const mufgRate = from === 'USD' ? murc.ttm : Math.round((1 / murc.ttm) * 1e8) / 1e8
  return c.json({ date, from, to, mufg_rate: mufgRate, usd_jpy: murc.ttm, tts: murc.tts, ttb: murc.ttb, source: 'murc' })
})

// GET /history
router.get('/history', async (c) => {
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
router.post('/', async (c) => {
  const { rate_date, usd_jpy, source = 'manual' } = await c.req.json().catch(() => ({}))
  if (!rate_date || !usd_jpy) return c.json({ detail: 'rate_date and usd_jpy required' }, 400)

  const existing = await prisma.fxRate.findFirst({ where: { rateDate: new Date(rate_date) } })
  if (existing) {
    const updated = await prisma.fxRate.update({ where: { id: existing.id }, data: { usdJpy: usd_jpy, source } })
    return c.json(rateDict(updated))
  }

  const rate = await prisma.fxRate.create({ data: { rateDate: new Date(rate_date), usdJpy: usd_jpy, source } })
  return c.json(rateDict(rate))
})

export default router
