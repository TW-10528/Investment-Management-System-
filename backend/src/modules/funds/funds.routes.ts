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
    commitment_usd:          summary.commitment_usd,
    commitment_jpy:          fund.commitmentJpy ? Number(fund.commitmentJpy.toString()) : null,
    contract_commitment_usd: fund.contractCommitmentUsd ? parseFloat(fund.contractCommitmentUsd.toString()) : null,
    contract_commitment_jpy: fund.contractCommitmentJpy ? parseFloat(fund.contractCommitmentJpy.toString()) : null,
    entry_fx_rate:           fund.entryFxRate ? parseFloat(fund.entryFxRate.toString()) : null,
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
    prisma.capitalCall.findMany({ where: { fundId: fund.id, status: { in: ['approved', 'paid'] } }, orderBy: { executionDate: 'asc' } }),
    prisma.distribution.findMany({ where: { fundId: fund.id }, orderBy: { distributionDate: 'asc' } }),
  ])

  // Fetch commitment history for funds that use it (e.g. SDG).
  const histRecords = await prisma.fundCommitmentHistory.findMany({
    where: { fundId: fund.id }, orderBy: { effectiveDate: 'asc' },
  })
  const commitmentHistory = histRecords.map((h: any) => ({
    commitmentAmount: new Decimal(h.commitmentAmount.toString()),
    effectiveDate:    h.effectiveDate as Date,
  }))

  // Use the current commitment from the fund record. The CalculationEngine will
  // apply commitment history to adjust F (investment capacity) at specific dates.
  // For SDG fund (JPY-only), use commitmentJpy. For USD funds, use commitmentUsd.
  const isSdg = fund.fundName && /sdg/i.test(fund.fundName)
  const commitment = isSdg && fund.commitmentJpy
    ? new Decimal(fund.commitmentJpy.toString())
    : new Decimal(fund.commitmentUsd.toString())

  const txns = [
    ...paidCalls.map((cc: any) => ({
      date:            cc.executionDate ?? cc.dueDate,
      txType:          'capital_call' as const,
      description:     `Capital Call #${cc.callNumber}`,
      fxRate:          cc.fxRate ? new Decimal(cc.fxRate.toString()) : null,
      capitalPaidIn:   new Decimal(cc.grossCallUsd.toString()),
      capitalReceived: new Decimal(cc.distributionUsd.toString()),
      reinvestable:    new Decimal(cc.reinvestableUsd.toString()),
      manualCashFlow:  cc.manualCashFlowUsd != null ? new Decimal(cc.manualCashFlowUsd.toString()) : null,
      unfundedAfterCall: cc.unfundedAfterCallUsd != null ? new Decimal(cc.unfundedAfterCallUsd.toString()) : null,
      callId:          cc.id,
      wireReference:   cc.wireReference,
      notes:           cc.notes ?? null,
      returnOfCapital: cc.returnOfCapitalUsd != null ? new Decimal(cc.returnOfCapitalUsd.toString()) : null,
      gain:            cc.gainUsd != null ? new Decimal(cc.gainUsd.toString()) : null,
      interest:        cc.interestUsd != null ? new Decimal(cc.interestUsd.toString()) : null,
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
      notes:           d.notes ?? null,
      returnOfCapital: d.returnOfCapitalUsd != null ? new Decimal(d.returnOfCapitalUsd.toString()) : null,
      gain:            d.gainUsd != null ? new Decimal(d.gainUsd.toString()) : null,
      interest:        d.interestUsd != null ? new Decimal(d.interestUsd.toString()) : null,
    })),
  ]

  if (txns.length === 0) {
    return c.json({ fund_id: fund.id, fund_name: fund.fundName, commitment: parseFloat(commitment.toString()), rows: [], snapshot: null })
  }

  const { rows, snapshot } = CalculationEngine.buildLedger(commitment, txns, new Decimal('150'), commitmentHistory)
  const f = (d: Decimal) => parseFloat(d.toString())

  return c.json({
    fund_id:    fund.id,
    fund_name:  fund.fundName,
    commitment: f(commitment),
    rows: rows.map((r) => ({
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
      return_of_capital:   r.returnOfCapital != null ? f(r.returnOfCapital) : 0,
      gain:                r.gain != null ? f(r.gain) : 0,
      interest:            r.interest != null ? f(r.interest) : 0,
      call_id:             r.callId,
      dist_id:             r.distId,
      wire_reference:      r.wireReference,
      notes:               r.notes ?? null,
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

// ── Commitments (optional per-fund sub-grouping; used by the SDG fund) ─────────
// Each commitment is an independent mini-fund: its own commitment amount and its
// own capital calls / distributions, with an independent ledger (called /
// remaining / cash flow). Calls & distributions carry an optional commitmentId.

const num = (d: any) => parseFloat(d.toString())

// Build a ledger + snapshot for a given commitment amount from its calls/dists.
function buildCommitmentLedger(commitmentAmount: Decimal, paidCalls: any[], distributions: any[], currency: string = 'JPY') {
  const txns = [
    ...paidCalls.map((cc: any) => ({
      date:              cc.executionDate ?? cc.dueDate,
      txType:            'capital_call' as const,
      description:       `Capital Call #${cc.callNumber}`,
      fxRate:            cc.fxRate ? new Decimal(cc.fxRate.toString()) : null,
      capitalPaidIn:     new Decimal(cc.grossCallUsd.toString()),
      capitalReceived:   new Decimal(cc.distributionUsd.toString()),
      reinvestable:      new Decimal(cc.reinvestableUsd.toString()),
      manualCashFlow:    cc.manualCashFlowUsd != null ? new Decimal(cc.manualCashFlowUsd.toString()) : null,
      // SDG: use stored post-call remaining as F override (handles commitment changes).
      unfundedAfterCall: cc.unfundedAfterCallUsd != null
        ? new Decimal(cc.unfundedAfterCallUsd.toString())
        : null,
      callId:            cc.id,
      wireReference:     cc.wireReference,
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
    return { rows: [] as any[], snapshot: null as any }
  }
  const { rows, snapshot } = CalculationEngine.buildLedger(commitmentAmount, txns, new Decimal('150'), [])
  return {
    rows: rows.map((r, i) => ({
      date:                r.date.toISOString().slice(0, 10),
      tx_type:             r.txType,
      description:         r.description,
      capital_paid_in:     num(r.capitalPaidIn),
      capital_received:    num(r.capitalReceived),
      reinvestable:        num(r.reinvestable),
      cumulative_called:   num(r.cumulativeCalled),
      investment_capacity: num(r.investmentCapacity),
      cash_flow:           num(r.cashFlow),
      net_cash_position:   num(r.netCashPosition),
      call_id:             (txns[i] as any)?.callId,
      dist_id:             (txns[i] as any)?.distId,
    })),
    snapshot: {
      commitment_usd:      num(snapshot.commitmentUsd),
      total_called_usd:    num(snapshot.totalCalledUsd),
      total_received_usd:  num(snapshot.totalReceivedUsd),
      drawn_pct:           num(snapshot.drawnPct),
      unfunded_usd:        num(snapshot.unfundedUsd),
      investment_capacity: num(snapshot.investmentCapacity),
      net_cash_position:   num(snapshot.netCashPosition),
      dpi:                 num(snapshot.dpi),
    },
  }
}

// GET /:id/commitments — list with per-commitment snapshot + transaction counts
router.get('/:id/commitments', async (c) => {
  const fundId = c.req.param('id')
  const commitments = await prisma.commitment.findMany({
    where: { fundId }, orderBy: { commitmentDate: 'asc' },
  })
  const out = await Promise.all(commitments.map(async (cm: any) => {
    const [calls, dists] = await Promise.all([
      prisma.capitalCall.findMany({ where: { commitmentId: cm.id, status: { in: ['approved', 'paid'] } }, orderBy: { dueDate: 'asc' } }),
      prisma.distribution.findMany({ where: { commitmentId: cm.id }, orderBy: { distributionDate: 'asc' } }),
    ])
    const { snapshot } = buildCommitmentLedger(new Decimal(cm.commitmentUsd.toString()), calls, dists)
    return {
      id:              cm.id,
      fund_id:         cm.fundId,
      name:            cm.name,
      commitment_usd:  num(cm.commitmentUsd),
      commitment_date: cm.commitmentDate?.toISOString().slice(0, 10) ?? null,
      currency:        cm.currency,
      notes:           cm.notes,
      call_count:      calls.length,
      dist_count:      dists.length,
      snapshot,
    }
  }))
  return c.json(out)
})

// POST /:id/commitments — create
router.post('/:id/commitments', async (c) => {
  const fundId = c.req.param('id')
  const fund = await prisma.fund.findUnique({ where: { id: fundId } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  const b = await c.req.json().catch(() => ({}))
  if (!b.name) return c.json({ detail: 'Commitment name is required' }, 400)
  const cm = await prisma.commitment.create({
    data: {
      fundId,
      name:           String(b.name),
      commitmentUsd:  b.commitment_usd != null ? parseFloat(b.commitment_usd) : 0,
      commitmentDate: b.commitment_date ? new Date(b.commitment_date) : null,
      currency:       b.currency ?? fund.currency ?? 'JPY',
      notes:          b.notes ?? null,
    },
  })
  return c.json({ id: cm.id }, 201)
})

// PATCH /:id/commitments/:cid — update
router.patch('/:id/commitments/:cid', async (c) => {
  const b: any = await c.req.json().catch(() => ({}))
  const data: any = {}
  if (b.name            !== undefined) data.name           = String(b.name)
  if (b.commitment_usd  !== undefined) data.commitmentUsd  = parseFloat(b.commitment_usd) || 0
  if (b.commitment_date !== undefined) data.commitmentDate = b.commitment_date ? new Date(b.commitment_date) : null
  if (b.currency        !== undefined) data.currency       = b.currency
  if (b.notes           !== undefined) data.notes          = b.notes
  await prisma.commitment.update({ where: { id: c.req.param('cid') }, data })
  return c.json({ ok: true })
})

// DELETE /:id/commitments/:cid — remove the commitment AND its calls/distributions
router.delete('/:id/commitments/:cid', async (c) => {
  const cid = c.req.param('cid')
  await prisma.$transaction([
    prisma.capitalCall.deleteMany({ where: { commitmentId: cid } }),
    prisma.distribution.deleteMany({ where: { commitmentId: cid } }),
    prisma.notice.deleteMany({ where: { commitmentId: cid } }),
    prisma.commitment.delete({ where: { id: cid } }),
  ])
  return c.json({ ok: true })
})

// ── Commitment History (SDG-style time-stepped commitments) ───────────────────
// Each row records a new total commitment amount effective from a date.
// The calculation engine uses this to compute F = commitment_at_date - E + D.

// GET /:id/commitment-history
router.get('/:id/commitment-history', async (c) => {
  const fundId = c.req.param('id')
  const history = await prisma.fundCommitmentHistory.findMany({
    where: { fundId }, orderBy: { effectiveDate: 'asc' },
  })
  return c.json(history.map((h: any) => ({
    id:               h.id,
    fund_id:          h.fundId,
    commitment_amount: num(h.commitmentAmount),
    effective_date:   h.effectiveDate.toISOString().slice(0, 10),
    notes:            h.notes ?? null,
    created_at:       h.createdAt.toISOString(),
  })))
})

// POST /:id/commitment-history — add a new commitment step-up
router.post('/:id/commitment-history', async (c) => {
  const fundId = c.req.param('id')
  const fund   = await prisma.fund.findUnique({ where: { id: fundId } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)

  const b = await c.req.json().catch(() => ({}))
  if (!b.commitment_amount || !b.effective_date) {
    return c.json({ detail: 'commitment_amount and effective_date are required' }, 400)
  }
  const amount = parseFloat(b.commitment_amount)
  if (isNaN(amount) || amount <= 0) return c.json({ detail: 'commitment_amount must be a positive number' }, 400)

  const record = await prisma.fundCommitmentHistory.create({
    data: {
      fundId,
      commitmentAmount: new Decimal(amount),
      effectiveDate:    new Date(b.effective_date),
      notes:            b.notes ?? null,
    },
  })

  // Keep fund.commitmentJpy/commitmentUsd in sync with the latest history entry so the
  // dashboard always shows the current commitment without extra queries.
  const latest = await prisma.fundCommitmentHistory.findFirst({
    where: { fundId }, orderBy: { effectiveDate: 'desc' },
  })
  if (latest) {
    const isSdg = fund.fundName && /sdg/i.test(fund.fundName)
    const updateData = isSdg
      ? { commitmentJpy: BigInt(latest.commitmentAmount.toString()) }
      : { commitmentUsd: new Decimal(latest.commitmentAmount.toString()) }
    await prisma.fund.update({
      where: { id: fundId },
      data: updateData,
    })
  }

  return c.json({
    id:                record.id,
    fund_id:           record.fundId,
    commitment_amount: num(record.commitmentAmount),
    effective_date:    record.effectiveDate.toISOString().slice(0, 10),
    notes:             record.notes ?? null,
  }, 201)
})

// DELETE /:id/commitment-history/:hid
router.delete('/:id/commitment-history/:hid', async (c) => {
  const { id: fundId, hid } = c.req.param()
  await prisma.fundCommitmentHistory.delete({ where: { id: hid } })

  // Re-sync fund.commitmentUsd to the new latest entry (or 0 if all deleted).
  const latest = await prisma.fundCommitmentHistory.findFirst({
    where: { fundId }, orderBy: { effectiveDate: 'desc' },
  })
  await prisma.fund.update({
    where: { id: fundId },
    data:  { commitmentUsd: latest ? new Decimal(latest.commitmentAmount.toString()) : new Decimal(0) },
  })
  return c.json({ ok: true })
})

// GET /:id/commitments/:cid/ledger — independent ledger for one commitment
router.get('/:id/commitments/:cid/ledger', async (c) => {
  const cm = await prisma.commitment.findUnique({ where: { id: c.req.param('cid') } })
  if (!cm) return c.json({ detail: 'Commitment not found' }, 404)
  const [calls, dists] = await Promise.all([
    prisma.capitalCall.findMany({ where: { commitmentId: cm.id, status: { in: ['approved', 'paid'] } }, orderBy: { executionDate: 'asc' } }),
    prisma.distribution.findMany({ where: { commitmentId: cm.id }, orderBy: { distributionDate: 'asc' } }),
  ])
  const { rows, snapshot } = buildCommitmentLedger(new Decimal(cm.commitmentUsd.toString()), calls, dists)
  return c.json({ commitment_id: cm.id, name: cm.name, commitment_usd: num(cm.commitmentUsd), rows, snapshot })
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
  if (body.commitment_usd !== undefined) {
    const newAmt = new Decimal(body.commitment_usd)
    const oldAmt = new Decimal(fund.commitmentUsd.toString())

    // When commitment actually changes, protect existing ledger rows by anchoring
    // the old AND new values in FundCommitmentHistory so date-based F calculation
    // uses the correct commitment per row rather than the flat fund-level value.
    if (!newAmt.equals(oldAmt)) {
      const [callCount, distCount, histCount] = await Promise.all([
        prisma.capitalCall.count({ where: { fundId: fund.id, status: { in: ['approved', 'paid'] } } }),
        prisma.distribution.count({ where: { fundId: fund.id } }),
        prisma.fundCommitmentHistory.count({ where: { fundId: fund.id } }),
      ])

      if (callCount > 0 || distCount > 0) {
        if (histCount === 0) {
          // First-ever change — record the original commitment at the earliest tx date
          // so all existing rows keep their current F values.
          const [earliestCall, earliestDist] = await Promise.all([
            prisma.capitalCall.findFirst({
              where: { fundId: fund.id, status: { in: ['approved', 'paid'] } },
              orderBy: { executionDate: 'asc' },
            }),
            prisma.distribution.findFirst({
              where: { fundId: fund.id },
              orderBy: { distributionDate: 'asc' },
            }),
          ])
          const dates = [earliestCall?.executionDate, earliestDist?.distributionDate].filter(Boolean) as Date[]
          const anchorDate = dates.length > 0
            ? new Date(Math.min(...dates.map(d => d.getTime())))
            : new Date()
          await prisma.fundCommitmentHistory.create({
            data: { fundId: fund.id, commitmentAmount: oldAmt, effectiveDate: anchorDate, notes: 'Initial commitment (auto-anchored)' },
          })
        }
        // New commitment takes effect from the day AFTER the latest transaction,
        // so existing transactions keep using the old commitment, and future uploads use the new one.
        // If no transactions yet, use today.
        const [latestCall, latestDist] = await Promise.all([
          prisma.capitalCall.findFirst({
            where: { fundId: fund.id, status: { in: ['approved', 'paid'] } },
            orderBy: { executionDate: 'desc' },
          }),
          prisma.distribution.findFirst({
            where: { fundId: fund.id },
            orderBy: { distributionDate: 'desc' },
          }),
        ])
        const dates = [latestCall?.executionDate, latestDist?.distributionDate].filter(Boolean) as Date[]
        let effectiveDate = new Date()
        if (dates.length > 0) {
          const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
          effectiveDate = new Date(maxDate.getTime() + 86400000)  // Add 1 day
        }
        await prisma.fundCommitmentHistory.create({
          data: { fundId: fund.id, commitmentAmount: newAmt, effectiveDate, notes: 'Updated via Fund Details' },
        })
      }
    }
    data.commitmentUsd = newAmt
  }
  // Handle commitment_jpy changes for SDG fund (create history for ledger calculations)
  if (body.commitment_jpy !== undefined && body.commitment_jpy !== '' && body.commitment_jpy !== null) {
    const newJpyAmt = parseInt(String(body.commitment_jpy), 10)
    const oldJpyAmt = fund.commitmentJpy ? parseInt(fund.commitmentJpy.toString(), 10) : 0
    data.commitmentJpy = BigInt(body.commitment_jpy)

    // Create commitment history entry when commitment_jpy changes (for SDG fund ledger tracking)
    if (newJpyAmt !== oldJpyAmt && oldJpyAmt !== 0) {
      const [callCount, distCount, histCount] = await Promise.all([
        prisma.capitalCall.count({ where: { fundId: fund.id, status: { in: ['approved', 'paid'] } } }),
        prisma.distribution.count({ where: { fundId: fund.id } }),
        prisma.fundCommitmentHistory.count({ where: { fundId: fund.id } }),
      ])

      if (callCount > 0 || distCount > 0) {
        if (histCount === 0) {
          // First-ever change — record the old commitment at the earliest tx date
          // so all existing rows keep using the old commitment, not the new one
          const [earliestCall, earliestDist] = await Promise.all([
            prisma.capitalCall.findFirst({
              where: { fundId: fund.id, status: { in: ['approved', 'paid'] } },
              orderBy: { executionDate: 'asc' },
            }),
            prisma.distribution.findFirst({
              where: { fundId: fund.id },
              orderBy: { distributionDate: 'asc' },
            }),
          ])
          const dates = [earliestCall?.executionDate, earliestDist?.distributionDate].filter(Boolean) as Date[]
          const anchorDate = dates.length > 0
            ? new Date(Math.min(...dates.map(d => d.getTime())))
            : new Date()
          await prisma.fundCommitmentHistory.create({
            data: { fundId: fund.id, commitmentAmount: new Decimal(oldJpyAmt), effectiveDate: anchorDate, notes: 'Initial commitment (auto-anchored)' },
          })
        }
        // New commitment takes effect from the day AFTER the latest transaction
        const [latestCall, latestDist] = await Promise.all([
          prisma.capitalCall.findFirst({
            where: { fundId: fund.id, status: { in: ['approved', 'paid'] } },
            orderBy: { executionDate: 'desc' },
          }),
          prisma.distribution.findFirst({
            where: { fundId: fund.id },
            orderBy: { distributionDate: 'desc' },
          }),
        ])
        const dates = [latestCall?.executionDate, latestDist?.distributionDate].filter(Boolean) as Date[]
        let effectiveDate = new Date()
        if (dates.length > 0) {
          const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
          effectiveDate = new Date(maxDate.getTime() + 86400000)  // Add 1 day
        }
        await prisma.fundCommitmentHistory.create({
          data: { fundId: fund.id, commitmentAmount: new Decimal(newJpyAmt), effectiveDate, notes: 'Updated via Fund Details' },
        })
      } else {
        // No transactions yet — still create a history entry with today's date for the new commitment
        // Check if we already have a history entry for today to avoid duplicates
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const existingToday = await prisma.fundCommitmentHistory.findFirst({
          where: { fundId: fund.id, effectiveDate: { gte: todayStart } },
        })
        if (!existingToday) {
          await prisma.fundCommitmentHistory.create({
            data: { fundId: fund.id, commitmentAmount: new Decimal(newJpyAmt), effectiveDate: todayStart, notes: 'Updated via Fund Details' },
          })
        }
      }
    }
  }
  if (body.contract_commitment_usd !== undefined && body.contract_commitment_usd !== '' && body.contract_commitment_usd !== null) data.contractCommitmentUsd = new Decimal(body.contract_commitment_usd)
  if (body.contract_commitment_jpy !== undefined && body.contract_commitment_jpy !== '' && body.contract_commitment_jpy !== null) data.contractCommitmentJpy = new Decimal(body.contract_commitment_jpy)
  if (body.entry_fx_rate           !== undefined && body.entry_fx_rate !== '' && body.entry_fx_rate !== null) data.entryFxRate           = new Decimal(body.entry_fx_rate)
  if (body.contract_date         !== undefined) data.contractDate        = body.contract_date ? new Date(body.contract_date) : null
  if (body.investment_period_start !== undefined) data.investmentPeriodStart = body.investment_period_start ? new Date(body.investment_period_start) : null
  if (body.investment_period_end   !== undefined) data.investmentPeriodEnd   = body.investment_period_end   ? new Date(body.investment_period_end)   : null
  if (body.fund_term_years       !== undefined) data.fundTermYears       = body.fund_term_years !== '' && body.fund_term_years !== null ? parseInt(body.fund_term_years) : null
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
    call_pct:         cc.callPct ? parseFloat(cc.callPct.toString()) : null,
    gross_call_usd:   parseFloat(cc.grossCallUsd.toString()),    // B — capital contribution
    distribution_usd: parseFloat(cc.distributionUsd.toString()), // C — distribution received
    reinvestable_usd: parseFloat(cc.reinvestableUsd.toString()), // D — reinvestable subset of C
    manual_cash_flow_usd: cc.manualCashFlowUsd != null ? parseFloat(cc.manualCashFlowUsd.toString()) : null,
    cash_flow_usd:    cc.manualCashFlowUsd != null                // G = manual override, else -B + C
                        ? parseFloat(cc.manualCashFlowUsd.toString())
                        : parseFloat(cc.distributionUsd.toString()) - parseFloat(cc.grossCallUsd.toString()),
    net_call_usd:     parseFloat(cc.netCallUsd.toString()),
    net_call_jpy:     parseFloat(cc.netCallJpy.toString()),
    fx_rate:          cc.fxRate ? parseFloat(cc.fxRate.toString()) : null,
    status:           cc.status,
    paid_at:          cc.paidAt?.toISOString() ?? null,
    notes:            cc.notes,
  })))
})

router.post('/:id/capital-calls', async (c) => {
  const fund = await prisma.fund.findUnique({ where: { id: c.req.param('id') } })
  if (!fund) return c.json({ detail: 'Fund not found' }, 404)
  const b       = await c.req.json().catch(() => ({}))
  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  const fxRate   = b.fx_rate ? parseFloat(b.fx_rate) : (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150)
  // Manual ledger inputs (drive the cash-flow formula G = -B + C in CalculationEngine):
  const grossUsd = parseFloat(b.gross_call_usd ?? b.net_call_usd ?? 0)  // B — capital contribution
  const distUsd  = parseFloat(b.distribution_usd ?? 0)                  // C — distribution received
  const reinvest = parseFloat(b.reinvestable_usd ?? 0)                  // D — reinvestable subset of C
  const netUsd   = parseFloat(b.net_call_usd ?? b.gross_call_usd ?? 0)
  const last     = await prisma.capitalCall.findFirst({ where: { fundId: fund.id }, orderBy: { callNumber: 'desc' } })
  const cc = await prisma.capitalCall.create({ data: {
    fundId:          fund.id,
    callNumber:      (last?.callNumber ?? 0) + 1,
    noticeDate:      b.notice_date ? new Date(b.notice_date) : new Date(),
    dueDate:         new Date(b.due_date),
    grossCallUsd:    grossUsd,
    distributionUsd: distUsd,
    reinvestableUsd: reinvest,
    manualCashFlowUsd: (b.manual_cash_flow_usd !== undefined && b.manual_cash_flow_usd !== '' && b.manual_cash_flow_usd !== null)
                         ? parseFloat(b.manual_cash_flow_usd) : null,
    netCallUsd:      netUsd,
    netCallJpy:      Math.round(netUsd * fxRate),
    fxRate,
    callPct:         b.call_pct ? parseFloat(b.call_pct) : 0,
    notes:           b.notes ?? null,
    status:          b.status ?? 'approved',
  }})
  return c.json({ id: cc.id }, 201)
})

router.patch('/:id/capital-calls/:ccId', async (c) => {
  const b    = await c.req.json().catch(() => ({}))
  const data: any = {}
  if (b.status          !== undefined) data.status          = b.status
  if (b.paid_at         !== undefined) data.paidAt          = b.paid_at ? new Date(b.paid_at) : null
  if (b.notes           !== undefined) data.notes           = b.notes
  if (b.due_date        !== undefined) data.dueDate         = new Date(b.due_date)
  if (b.notice_date     !== undefined) data.noticeDate      = new Date(b.notice_date)
  if (b.call_pct        !== undefined) data.callPct         = b.call_pct ? parseFloat(b.call_pct) : 0
  if (b.gross_call_usd  !== undefined) data.grossCallUsd    = parseFloat(b.gross_call_usd)  // B
  if (b.distribution_usd!== undefined) data.distributionUsd = parseFloat(b.distribution_usd) // C
  if (b.reinvestable_usd!== undefined) data.reinvestableUsd = parseFloat(b.reinvestable_usd) // D
  if (b.manual_cash_flow_usd !== undefined)                                                  // G override (or clear)
    data.manualCashFlowUsd = (b.manual_cash_flow_usd === '' || b.manual_cash_flow_usd === null)
      ? null : parseFloat(b.manual_cash_flow_usd)
  if (b.net_call_usd    !== undefined) {
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

// ── Unknown Fund Extraction & Creation ──────────────────────────────────────

// POST /extract-unknown-fund
// Extract fund data from PDF for unknown fund
router.post('/extract-unknown-fund', async (c) => {
  try {
    const { extractUnknownFundData } = await import('./unknown-fund-extractor');
    const body = await c.req.parseBody();
    const fileField = body['file'];

    if (!fileField || typeof fileField === 'string') {
      return c.json(
        { detail: 'No PDF file uploaded' },
        400
      );
    }

    const file = fileField as File;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract data
    const extracted = await extractUnknownFundData(
      buffer,
      file.name
    );

    return c.json({
      extractedData: extracted,
      status: 'success',
    });
  } catch (err: any) {
    console.error('[funds] Extraction error:', err);
    return c.json({ detail: err.message || 'Extraction failed' }, 500);
  }
})

// POST /create-from-extraction
// Create fund from extracted data with auto-processing
router.post('/create-from-extraction', async (c) => {
  try {
    const { createFundFromExtraction } = await import('./fund-creation-service');
    const reqData = await c.req.json();
    const userEmail = c.req.header('X-User-Email');

    const result = await createFundFromExtraction({
      ...reqData,
      userEmail,
    });

    // Log audit
    if (userEmail) {
      await logAction(
        'create_fund_from_extraction',
        'funds',
        result.fund.id,
        userEmail,
        undefined,
        result.fund as any
      );
    }

    return c.json({
      fund: result.fund,
      fundReport: result.fundReport,
      capitalCall: result.capitalCall,
      distribution: result.distribution,
      status: 'created',
    });
  } catch (err: any) {
    console.error('[funds] Creation error:', err);
    return c.json({ detail: err.message || 'Fund creation failed' }, 500);
  }
})

export default router
