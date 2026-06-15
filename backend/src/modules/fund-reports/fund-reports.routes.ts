// Fund Reports — /api/v1/fund-reports
//
// Upload a PDF → AI extraction → save as PENDING Notice.
// Human reviewer edits fields in Notices UI → Approve → create CapitalCall or
// Distribution → recalculate ledger via CalculationEngine → return snapshot.

import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import Decimal from 'decimal.js'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { canEdit } from '../../middleware/guard'
import { prisma } from '../../lib/prisma'
import { parseFundPdf } from '../../services/fundParsers/index'
import { resolveFund } from '../../services/fundParsers/fund-resolver'
import { CalculationEngine } from '../../services/calculationEngine'
import { notifyAllAdmins, notifyUser } from '../../services/notificationService'
import { config } from '../../config/index'

const router = new Hono<HonoEnv>()
router.use('*', auth)

// Upload folder name per fund (defaults to fundKey with hyphens → spaces).
const FUND_FOLDER_NAMES: Record<string, string> = {
  'hamilton-strategic': 'hamilton lane strategic',
}

// ── Serialiser ────────────────────────────────────────────────────────────────

function reportDict(n: any) {
  const d = n.extractedData as any ?? {}
  return {
    id:               n.id,
    file_name:        n.originalName ?? n.filename,
    filename:         n.filename,
    fund_key:         d.fundKey    ?? null,
    fund_name:        d.fundName   ?? null,
    notice_type:      n.noticeType,
    status:           n.status,
    fund_id:          n.fundId,
    notice_date:      d.noticeDate ?? null,
    due_date:         d.dueDate    ?? null,
    gross_call_usd:   d.grossCallUsd    ?? 0,
    distribution_usd: d.distributionUsd ?? 0,
    commitment_usd:   d.commitmentUsd   ?? 0,
    call_pct:         d.callPct         ?? 0,
    wire_reference:   d.wireReference   ?? null,
    investment_targets: d.investmentTargets ?? [],
    confidence:       n.confidence,
    confidence_grade: d.confidenceGrade ?? 'low',
    uploaded_by:      n.uploadedBy,
    created_at:       n.createdAt?.toISOString(),
    approved_at:      n.approvedAt?.toISOString() ?? null,
    admin_notes:      n.adminNotes ?? null,
  }
}

// ── POST /upload ───────────────────────────────────────────────────────────────
router.post('/upload', async (c) => {
  const user = c.get('user')
  let file: File | null = null

  try {
    const body = await c.req.parseBody()
    file = body['file'] as File
  } catch {
    return c.json({ detail: 'Failed to parse upload' }, 400)
  }

  if (!file || typeof file === 'string')
    return c.json({ detail: 'No file uploaded' }, 400)
  if (!file.name.toLowerCase().endsWith('.pdf'))
    return c.json({ detail: 'Only PDF files are accepted' }, 400)

  const originalName = file.name
  const safe         = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const buffer       = Buffer.from(await file.arrayBuffer())

  // Fetch all active funds with a key so the AI prompt lists them dynamically
  const fundRows = await prisma.fund.findMany({
    where: { isActive: true, fundKey: { not: null } },
    select: { fundKey: true, fundName: true },
  })
  const knownFunds = fundRows.map(f => ({ fundKey: f.fundKey!, fundName: f.fundName }))

  // AI extraction — OCR + local LLM via Ollama (fund list injected into prompt)
  const parsed = await parseFundPdf(buffer, originalName, knownFunds)

  // Attempt to resolve to a DB fund record (may stay null for unrecognised funds)
  const resolvedFund = parsed.fundKey !== 'unknown'
    ? await resolveFund(parsed.fundKey)
    : null

  // If the AI detected a different fund than the user selected, log a warning and
  // trust the user's explicit selection — do not block the upload with a 422.
  const scopedFundId = c.req.query('fund_id')
  if (scopedFundId && resolvedFund && scopedFundId !== resolvedFund.id) {
    console.warn(`[fund-reports/upload] AI detected "${resolvedFund.fundName}" (${parsed.fundKey}) but user scoped to a different fund — using user selection`)
  }

  // Use the scoped fund (user's explicit choice) first, then AI resolution, then null
  const fundId = scopedFundId ?? resolvedFund?.id ?? null

  // Optional per-commitment scoping
  let commitmentId: string | null = c.req.query('commitment_id') || null
  if (commitmentId && fundId) {
    const cm = await prisma.commitment.findUnique({ where: { id: commitmentId } })
    if (!cm || cm.fundId !== fundId)
      return c.json({ detail: 'The selected commitment does not belong to this fund.' }, 422)
  }

  // Write PDF to disk under the fund's folder (or 'unknown' for unrecognised)
  const fundFolder = FUND_FOLDER_NAMES[parsed.fundKey]
    ?? (parsed.fundKey !== 'unknown' ? parsed.fundKey.replace(/-/g, ' ') : 'unknown')
  const folderPath = path.join(config.uploadDir, fundFolder)
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true })
  const relPath  = path.join(fundFolder, `${Date.now()}_${safe}`)
  const filepath = path.join(config.uploadDir, relPath)
  fs.writeFileSync(filepath, buffer)

  const ALLOWED_TYPES = ['capital_call', 'distribution', 'capital_and_distribution', 'financial_statement']
  const reqType    = c.req.query('notice_type')
  const noticeType = (reqType && reqType !== 'auto' && ALLOWED_TYPES.includes(reqType)) ? reqType : parsed.noticeType

  // Strip rawText — too large to store; reviewer works from the extracted fields
  const { rawText: _, ...storedData } = parsed

  let notice
  try {
    notice = await prisma.notice.create({
      data: {
        filename:      relPath,
        originalName,
        noticeType,
        status:        'pending',
        fundId,
        commitmentId,
        extractedData: storedData as any,
        confidence:    parsed.confidence,
        uploadedBy:    user.email,
      },
    })
  } catch (err: any) {
    try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath) } catch { /* ignore */ }
    console.error('[fund-reports/upload] failed:', err)
    return c.json({ detail: `Could not process this report: ${err?.message ?? 'unknown error'}` }, 500)
  }

  try {
    await notifyAllAdmins({
      type:    'notice_uploaded',
      title:   'New Fund Report — Pending Review',
      message: `${user.email} uploaded a ${noticeType.replace(/_/g, ' ')} for ${resolvedFund?.fundName ?? parsed.fundName} — review and approve to update the ledger.`,
      link:    '/notices',
      metadata: { notice_id: notice.id, fund_key: parsed.fundKey, fund_id: fundId },
    })
  } catch (e) {
    console.error('[fund-reports/upload] notify failed (non-fatal):', e)
  }

  return c.json({
    ...reportDict(notice),
    fund_id:   fundId,
    fund_name: resolvedFund?.fundName ?? parsed.fundName,
    message:   'Uploaded — pending review. Approve in Notices to update the ledger.',
  }, 201)
})

// ── Filesystem reconciliation ──────────────────────────────────────────────────
async function reconcileOrphanedNotices() {
  if (!fs.existsSync(config.uploadDir)) return

  const notices = await prisma.notice.findMany()
  for (const n of notices) {
    if (!n.filename) continue
    const filepath = path.join(config.uploadDir, n.filename)
    if (fs.existsSync(filepath)) continue

    const d = (n.extractedData as any) ?? {}
    try {
      if (d.createdCallId) await prisma.capitalCall.deleteMany({ where: { id: d.createdCallId } })
      if (d.createdDistId) await prisma.distribution.deleteMany({ where: { id: d.createdDistId } })
      await prisma.notice.delete({ where: { id: n.id } })
      console.info(`[fund-reports] reconciled orphaned document ${n.id} (${n.filename})`)
    } catch (e) {
      console.error('[fund-reports] reconcile failed for notice', n.id, e)
    }
  }
}

// ── GET / — list all fund report notices ──────────────────────────────────────
router.get('/', async (c) => {
  try { await reconcileOrphanedNotices() } catch (e) { console.error('[fund-reports] reconcile error (non-fatal):', e) }

  const { fund_key, status, fund_id } = c.req.query()
  const notices = await prisma.notice.findMany()

  let results = notices
  if (status)   results = results.filter(n => n.status === status)
  if (fund_id)  results = results.filter(n => n.fundId === fund_id)
  if (fund_key) results = results.filter(n => (n.extractedData as any)?.fundKey === fund_key)

  results.sort((a, b) => docDate(a) - docDate(b))
  return c.json(results.map(reportDict))
})

function docDate(n: any): number {
  const d = (n.extractedData as any) ?? {}
  const raw = d.dueDate || d.noticeDate || n.createdAt
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? 0 : t
}

// ── GET /:id ───────────────────────────────────────────────────────────────────
router.get('/:id', async (c) => {
  const n = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!n) return c.json({ detail: 'Report not found' }, 404)
  return c.json(reportDict(n))
})

// ── POST /:id/approve ──────────────────────────────────────────────────────────
// Creates CapitalCall / Distribution from the (possibly reviewer-edited) extracted
// data, then recalculates the full ledger and returns the updated snapshot.
router.post('/:id/approve', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Report not found' }, 404)
  if (notice.status === 'approved') return c.json({ detail: 'Already approved' }, 400)
  if (!notice.fundId)               return c.json({ detail: 'No fund linked to this report.' }, 400)

  const fund = await prisma.fund.findUnique({ where: { id: notice.fundId } })
  if (!fund) return c.json({ detail: 'Linked fund not found.' }, 404)

  const d = (notice.extractedData as any) ?? {}

  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  const fxRate   = latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150
  const dueDate  = d.dueDate ? new Date(d.dueDate) : new Date()

  const created: Record<string, any> = {}

  // ── Capital Call ─────────────────────────────────────────────────────────────
  if (notice.noticeType === 'capital_call' || notice.noticeType === 'capital_and_distribution') {
    const grossUsd = parseFloat(String(d.grossCallUsd ?? 0))
    const reinvest = parseFloat(String(d.reinvestableUsd ?? 0))
    const callPct  = parseFloat(String(d.callPct ?? 0))

    const existing = await prisma.capitalCall.findFirst({
      where: { fundId: notice.fundId, dueDate, commitmentId: notice.commitmentId ?? undefined },
    })

    if (existing) {
      created.capital_call_id = existing.id
      created.deduplicated    = true
    } else {
      const last    = await prisma.capitalCall.findFirst({ where: { fundId: notice.fundId, commitmentId: notice.commitmentId ?? undefined }, orderBy: { callNumber: 'desc' } })
      const callNum = (last?.callNumber ?? 0) + 1

      const cc = await prisma.capitalCall.create({
        data: {
          fundId:              notice.fundId,
          commitmentId:        notice.commitmentId ?? undefined,
          callNumber:          callNum,
          noticeDate:          d.noticeDate ? new Date(d.noticeDate) : new Date(),
          dueDate,
          executionDate:       dueDate,
          callPct,
          grossCallUsd:        grossUsd,
          netCallUsd:          grossUsd - reinvest,
          distributionUsd:     0,
          reinvestableUsd:     reinvest,
          investmentAmountUsd: grossUsd,
          managementFeeUsd:    parseFloat(String(d.managementFeeUsd ?? 0)),
          expenseUsd:          parseFloat(String(d.taxExpenseUsd ?? 0)),
          returnOfCapitalUsd:  parseFloat(String(d.returnOfCapitalUsd ?? 0)),
          gainUsd:             parseFloat(String(d.gainUsd ?? 0)),
          interestUsd:         parseFloat(String(d.interestUsd ?? 0)),
          fxRate,
          netCallJpy:          Math.round((grossUsd - reinvest) * fxRate),
          wireReference:       d.wireReference ?? null,
          status:              'approved',
        },
      })
      created.capital_call_id = cc.id

      for (const it of (d.investmentTargets ?? [])) {
        await prisma.investmentTarget.create({
          data: { fundId: notice.fundId, projectName: it.projectName, amountUsd: it.amountUsd ?? null, sector: it.sector ?? null },
        })
      }
    }
  }

  // ── Distribution ─────────────────────────────────────────────────────────────
  if (notice.noticeType === 'distribution' || notice.noticeType === 'capital_and_distribution') {
    const amtUsd = parseFloat(String(d.distributionUsd ?? 0))

    const existing = await prisma.distribution.findFirst({
      where: { fundId: notice.fundId, distributionDate: dueDate, commitmentId: notice.commitmentId ?? undefined },
    })

    if (existing) {
      created.distribution_id = existing.id
      created.deduplicated    = true
    } else {
      const dist = await prisma.distribution.create({
        data: {
          fundId:             notice.fundId,
          commitmentId:       notice.commitmentId ?? undefined,
          distributionDate:   dueDate,
          distType:           'Income',
          amountUsd:          amtUsd,
          amountJpy:          Math.round(amtUsd * fxRate),
          fxRate,
          reinvestableUsd:    parseFloat(String(d.reinvestableUsd ?? 0)),
          returnOfCapitalUsd: parseFloat(String(d.returnOfCapitalUsd ?? 0)),
          gainUsd:            parseFloat(String(d.gainUsd ?? 0)),
          interestUsd:        parseFloat(String(d.interestUsd ?? 0)),
          isRecallable:       false,
        },
      })
      created.distribution_id = dist.id
    }
  }

  // Store created IDs back on the notice so DELETE can reverse them
  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data:  {
      status:     'approved',
      approvedAt: new Date(),
      adminNotes: c.req.query('admin_notes') ?? null,
      extractedData: {
        ...(notice.extractedData as any),
        createdCallId: created.capital_call_id ?? null,
        createdDistId: created.distribution_id ?? null,
      } as any,
    },
  })

  if (notice.uploadedBy) {
    await notifyUser(notice.uploadedBy, {
      type:    'notice_approved',
      title:   'Fund Report Approved ✓',
      message: `Your ${notice.noticeType.replace(/_/g, ' ')} for ${fund.fundName} has been approved.`,
      link:    `/funds/${notice.fundId}`,
    })
  }

  // ── Recalculate ledger ───────────────────────────────────────────────────────
  const [paidCalls, distributions] = await Promise.all([
    prisma.capitalCall.findMany({ where: { fundId: notice.fundId, status: { in: ['approved', 'paid'] } }, orderBy: { executionDate: 'asc' } }),
    prisma.distribution.findMany({ where: { fundId: notice.fundId }, orderBy: { distributionDate: 'asc' } }),
  ])

  const commitment = new Decimal(fund.commitmentUsd.toString())
  const f = (v: Decimal) => parseFloat(v.toString())

  const txns = [
    ...paidCalls.map((cc: any) => ({
      date:            cc.executionDate ?? cc.dueDate,
      txType:          'capital_call'   as const,
      description:     `Capital Call #${cc.callNumber}`,
      fxRate:          cc.fxRate ? new Decimal(cc.fxRate.toString()) : null,
      capitalPaidIn:   new Decimal(cc.grossCallUsd.toString()),
      capitalReceived: new Decimal(cc.distributionUsd.toString()),
      reinvestable:    new Decimal(cc.reinvestableUsd.toString()),
    })),
    ...distributions.map((dist: any) => ({
      date:            dist.distributionDate,
      txType:          'distribution' as const,
      description:     dist.distType,
      fxRate:          dist.fxRate ? new Decimal(dist.fxRate.toString()) : null,
      capitalPaidIn:   new Decimal(0),
      capitalReceived: new Decimal(dist.amountUsd.toString()),
      reinvestable:    new Decimal(dist.reinvestableUsd.toString()),
    })),
  ]

  let snapshot = null
  let ledgerRows: any[] = []

  if (txns.length > 0) {
    const result = CalculationEngine.buildLedger(commitment, txns)
    snapshot     = result.snapshot
    ledgerRows   = result.rows.map((r, i) => ({
      row:                 i + 1,
      date:                r.date.toISOString().slice(0, 10),
      type:                r.txType,
      description:         r.description,
      capital_paid_in:     f(r.capitalPaidIn),
      capital_received:    f(r.capitalReceived),
      reinvestable:        f(r.reinvestable),
      cumulative_called:   f(r.cumulativeCalled),
      investment_capacity: f(r.investmentCapacity),
      cash_flow:           f(r.cashFlow),
      net_cash_position:   f(r.netCashPosition),
    }))
  }

  return c.json({
    message:  created.deduplicated
      ? 'Notice approved (a record for this date already existed — no duplicate created).'
      : 'Approved — records created and ledger updated.',
    created,
    fund: { id: fund.id, fund_name: fund.fundName },
    snapshot: snapshot ? {
      commitment_usd:      f(commitment),
      total_called_usd:    f(snapshot.totalCalledUsd),
      total_received_usd:  f(snapshot.totalReceivedUsd),
      drawn_pct:           f(snapshot.drawnPct),
      unfunded_usd:        f(snapshot.unfundedUsd),
      investment_capacity: f(snapshot.investmentCapacity),
      net_cash_position:   f(snapshot.netCashPosition),
      dpi:                 f(snapshot.dpi),
    } : null,
    ledger: ledgerRows,
    ...reportDict(updated),
  })
})

// ── POST /:id/reject ───────────────────────────────────────────────────────────
router.post('/:id/reject', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Report not found' }, 404)

  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data:  { status: 'rejected', adminNotes: c.req.query('admin_notes') ?? null },
  })

  return c.json({ message: 'Report rejected.', ...reportDict(updated) })
})

// ── DELETE /:id ────────────────────────────────────────────────────────────────
router.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Report not found' }, 404)

  const d = (notice.extractedData as any) ?? {}

  // Reverse ledger records only if they were created at approval time
  if (d.createdCallId) await prisma.capitalCall.deleteMany({ where: { id: d.createdCallId } })
  if (d.createdDistId) await prisma.distribution.deleteMany({ where: { id: d.createdDistId } })

  if (notice.filename) {
    const filepath = path.join(config.uploadDir, notice.filename)
    try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath) } catch { /* non-fatal */ }
  }

  await prisma.notice.delete({ where: { id: notice.id } })

  return c.json({ message: 'Report deleted — ledger and dashboard updated.', fund_id: notice.fundId })
})

// ── GET /:id/ledger ────────────────────────────────────────────────────────────
router.get('/:id/ledger', async (c) => {
  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice || !notice.fundId) return c.json({ detail: 'No fund linked to this report.' }, 404)

  const fund = await prisma.fund.findUnique({ where: { id: notice.fundId } })
  if (!fund) return c.json({ detail: 'Fund not found.' }, 404)

  const [paidCalls, distributions] = await Promise.all([
    prisma.capitalCall.findMany({ where: { fundId: notice.fundId, status: { in: ['approved', 'paid'] } }, orderBy: { executionDate: 'asc' } }),
    prisma.distribution.findMany({ where: { fundId: notice.fundId }, orderBy: { distributionDate: 'asc' } }),
  ])

  const commitment = new Decimal(fund.commitmentUsd.toString())
  const f = (v: Decimal) => parseFloat(v.toString())

  const txns = [
    ...paidCalls.map((cc: any) => ({
      date: cc.executionDate ?? cc.dueDate, txType: 'capital_call' as const,
      description: `Capital Call #${cc.callNumber}`,
      fxRate: cc.fxRate ? new Decimal(cc.fxRate.toString()) : null,
      capitalPaidIn: new Decimal(cc.grossCallUsd.toString()),
      capitalReceived: new Decimal(cc.distributionUsd.toString()),
      reinvestable: new Decimal(cc.reinvestableUsd.toString()),
    })),
    ...distributions.map((dist: any) => ({
      date: dist.distributionDate, txType: 'distribution' as const, description: dist.distType,
      fxRate: dist.fxRate ? new Decimal(dist.fxRate.toString()) : null,
      capitalPaidIn: new Decimal(0), capitalReceived: new Decimal(dist.amountUsd.toString()),
      reinvestable: new Decimal(dist.reinvestableUsd.toString()),
    })),
  ]

  if (txns.length === 0)
    return c.json({ fund_id: fund.id, fund_name: fund.fundName, commitment: f(commitment), rows: [], snapshot: null })

  const { rows, snapshot } = CalculationEngine.buildLedger(commitment, txns)

  return c.json({
    fund_id:    fund.id,
    fund_name:  fund.fundName,
    commitment: f(commitment),
    rows: rows.map((r, i) => ({
      row: i + 1, date: r.date.toISOString().slice(0, 10), type: r.txType, description: r.description,
      capital_paid_in:     f(r.capitalPaidIn),
      capital_received:    f(r.capitalReceived),
      reinvestable:        f(r.reinvestable),
      cumulative_called:   f(r.cumulativeCalled),
      investment_capacity: f(r.investmentCapacity),
      cash_flow:           f(r.cashFlow),
      net_cash_position:   f(r.netCashPosition),
    })),
    snapshot: {
      commitment_usd:      f(commitment),
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

export default router
