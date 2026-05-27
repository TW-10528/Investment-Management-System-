/** Notices (PDF upload & processing) — /api/v1/notices */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma'
import { auth, type AuthVars } from '../middleware/auth'
import { parsePdf } from '../services/pdfParser'
import { canEdit } from '../middleware/auth'
import fs from 'fs'
import path from 'path'
import { config } from '../config/index'

const app = new Hono<AuthVars>()
app.use('*', auth)

function noticeDict(n: any) {
  return {
    id:             n.id,
    filename:       n.filename,
    original_name:  n.originalName,
    notice_type:    n.noticeType,
    status:         n.status,
    fund_id:        n.fundId,
    extracted_data: n.extractedData,
    confidence:     n.confidence,
    admin_notes:    n.adminNotes,
    uploaded_by:    n.uploadedBy,
    created_at:     n.createdAt?.toISOString(),
    approved_at:    n.approvedAt?.toISOString() ?? null,
  }
}

// GET /
app.get('/', async (c) => {
  const { notice_type, status, fund_id } = c.req.query()
  const where: any = {}
  if (notice_type) where.noticeType = notice_type
  if (status)      where.status     = status
  if (fund_id)     where.fundId     = fund_id

  const notices = await prisma.notice.findMany({ where, orderBy: { createdAt: 'desc' } })
  return c.json(notices.map(noticeDict))
})

// GET /pending-count
app.get('/pending-count', async (c) => {
  const count = await prisma.notice.count({ where: { status: 'pending' } })
  return c.json({ count })
})

// GET /investments/recent
app.get('/investments/recent', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '8')
  const items = await prisma.investmentTarget.findMany({
    take:    limit,
    orderBy: { createdAt: 'desc' },
    include: { fund: { select: { fundName: true } } },
  })
  return c.json(items.map(it => ({
    id:              it.id,
    fund_id:         it.fundId,
    fund_name:       it.fund?.fundName ?? '',
    project_name:    it.projectName,
    actual_name:     it.actualName,
    investment_date: it.investmentDate?.toISOString().slice(0, 10) ?? null,
    amount_usd:      it.amountUsd ? parseFloat(it.amountUsd.toString()) : 0,
    investment_type: it.investmentType,
    sector:          it.sector,
    geography:       it.geography,
    deal_type:       it.dealType,
  })))
})

// GET /investments/all
app.get('/investments/all', async (c) => {
  const { fund_id, sector, geography } = c.req.query()
  const where: any = {}
  if (fund_id)   where.fundId    = fund_id
  if (sector)    where.sector    = { contains: sector, mode: 'insensitive' }
  if (geography) where.geography = { contains: geography, mode: 'insensitive' }

  const items = await prisma.investmentTarget.findMany({
    where,
    orderBy: { investmentDate: 'desc' },
    include: { fund: { select: { fundName: true } } },
  })
  return c.json(items.map(it => ({
    id:              it.id,
    fund_id:         it.fundId,
    fund_name:       it.fund?.fundName ?? '',
    project_name:    it.projectName,
    actual_name:     it.actualName,
    investment_date: it.investmentDate?.toISOString().slice(0, 10) ?? null,
    amount_usd:      it.amountUsd ? parseFloat(it.amountUsd.toString()) : 0,
    investment_type: it.investmentType,
    sector:          it.sector,
    geography:       it.geography,
    deal_type:       it.dealType,
  })))
})

// GET /nav/latest
app.get('/nav/latest', async (c) => {
  const funds = await prisma.fund.findMany({ where: { isActive: true } })
  const result = []
  for (const fund of funds) {
    const nav = await prisma.navRecord.findFirst({
      where:   { fundId: fund.id },
      orderBy: { navDate: 'desc' },
    })
    if (nav) {
      result.push({
        fund_id:   fund.id,
        fund_name: fund.fundName,
        nav_date:  nav.navDate.toISOString().slice(0, 10),
        nav_usd:   nav.navUsd ? parseFloat(nav.navUsd.toString()) : 0,
        period:    nav.period,
      })
    }
  }
  return c.json(result)
})

// GET /:id
app.get('/:id', async (c) => {
  const n = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!n) return c.json({ detail: 'Notice not found' }, 404)
  return c.json(noticeDict(n))
})

// POST /upload
app.post('/upload', async (c) => {
  const user = c.get('user')

  let file: File | null = null
  let noticeType = 'capital_call'
  let fundId: string | undefined

  try {
    const body = await c.req.parseBody()
    file        = body['file'] as File
    noticeType  = (body['notice_type'] as string) ?? 'capital_call'
    fundId      = (body['fund_id'] as string) || undefined
  } catch {
    return c.json({ detail: 'Failed to parse upload' }, 400)
  }

  if (!file || typeof file === 'string') {
    return c.json({ detail: 'No file uploaded' }, 400)
  }

  // Save file
  if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true })
  const safe     = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename = `${Date.now()}_${safe}`
  const filepath = path.join(config.uploadDir, filename)
  const buffer   = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(filepath, buffer)

  // Parse
  const extracted = await parsePdf(buffer)

  const notice = await prisma.notice.create({
    data: {
      filename,
      originalName:  file.name,
      noticeType,
      status:        'pending',
      fundId:        fundId ?? null,
      extractedData: extracted as any,
      confidence:    extracted.confidence,
      uploadedBy:    user.email,
    },
  })

  return c.json(noticeDict(notice))
})

// POST /:id/approve
app.post('/:id/approve', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Notice not found' }, 404)

  const fundId     = c.req.query('fund_id') ?? notice.fundId ?? undefined
  const adminNotes = c.req.query('admin_notes') ?? undefined

  if (!fundId) return c.json({ detail: 'fund_id required to approve.' }, 400)

  const data = notice.extractedData as any ?? {}

  // Create records based on notice type
  if (notice.noticeType === 'capital_call') {
    const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
    const fx = data.fxRate ?? (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150)
    const grossUsd  = data.grossCallUsd ?? data.amounts?.[0] ?? 0
    const netUsd    = data.netCallUsd   ?? grossUsd
    const reinvest  = data.reinvestableUsd ?? 0
    const netJpy    = Math.round(parseFloat(netUsd) * fx)

    const cc = await prisma.capitalCall.create({
      data: {
        fundId:          fundId,
        noticeDate:      new Date(),
        dueDate:         data.dates?.[0] ? new Date(data.dates[0]) : new Date(),
        callNumber:      data.callNumber ?? null,
        grossCallUsd:    grossUsd,
        netCallUsd:      netUsd,
        reinvestableUsd: reinvest,
        netCallJpy:      netJpy,
        fxRate:          fx,
        status:          'pending',
      },
    })

    // Investment targets
    if (data.investmentTargets?.length) {
      for (const it of data.investmentTargets) {
        await prisma.investmentTarget.create({
          data: {
            fundId,
            projectName:   it.projectName,
            amountUsd:     it.amountUsd ?? null,
            investmentType:it.investmentType ?? null,
            sector:        it.sector ?? null,
            geography:     it.geography ?? null,
            dealType:      it.dealType ?? null,
          },
        })
      }
    }

    console.log(`[NOTICE] Approved capital_call → CapitalCall ${cc.id}`)

  } else if (notice.noticeType === 'distribution') {
    const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
    const fx       = data.fxRate ?? (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150)
    const amtUsd   = data.distributionUsd ?? data.amounts?.[0] ?? 0
    const amtJpy   = Math.round(parseFloat(amtUsd) * fx)
    const reinv    = data.reinvestableUsd ?? 0

    await prisma.distribution.create({
      data: {
        fundId,
        distributionDate: data.dates?.[0] ? new Date(data.dates[0]) : new Date(),
        distType:         'Income',
        amountUsd:        amtUsd,
        amountJpy:        amtJpy,
        fxRate:           fx,
        reinvestableUsd:  reinv,
        isRecallable:     false,
      },
    })

  } else if (notice.noticeType === 'financial_statement') {
    if (data.navUsd) {
      await prisma.navRecord.create({
        data: {
          fundId,
          navDate:       data.navDate ? new Date(data.navDate) : new Date(),
          navUsd:        data.navUsd,
          period:        data.period ?? null,
          sourceNoticeId:notice.id,
        },
      })
    }
  }

  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data:  { status: 'approved', fundId, adminNotes: adminNotes ?? null, approvedAt: new Date() },
  })

  return c.json({ message: 'Notice approved — records created!', ...noticeDict(updated) })
})

// POST /:id/reject
app.post('/:id/reject', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const adminNotes = c.req.query('admin_notes') ?? undefined
  const notice     = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Notice not found' }, 404)

  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data:  { status: 'rejected', adminNotes: adminNotes ?? null },
  })
  return c.json({ message: 'Notice rejected.', ...noticeDict(updated) })
})

// PUT /:id/extracted
app.put('/:id/extracted', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Notice not found' }, 404)

  const data = await c.req.json().catch(() => ({}))
  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data:  { extractedData: data },
  })
  return c.json(noticeDict(updated))
})

export default app
