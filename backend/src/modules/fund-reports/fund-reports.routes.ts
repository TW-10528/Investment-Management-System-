// Fund Reports — /api/v1/fund-reports
//
// Upload a PDF → auto-detect fund → parse → save as Notice.
// Approve → create CapitalCall or Distribution linked to the ONE fund record
//         → recalculate ledger via CalculationEngine → return updated snapshot.

import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { canEdit } from '../../middleware/guard'
import { prisma } from '../../lib/prisma'
import { parseFundPdf } from '../../services/fundParsers/index'
import { parseNbRealEstate } from '../../services/fundParsers/nb-real-estate/index'
import { parseHamiltonLane } from '../../services/fundParsers/hamilton-lane/index'
import { parseHamiltonStrategic } from '../../services/fundParsers/hamilton-strategic/index'
import { parseDoverStreet } from '../../services/fundParsers/dover-street/index'
import { detectViewingDocument } from '../../services/fundParsers/viewingDocumentDetector'
import { resolveFund } from '../../services/fundParsers/fund-resolver'
import { CalculationEngine } from '../../services/calculationEngine'
import { notifyAllAdmins, notifyUser } from '../../services/notificationService'
import { config } from '../../config/index'

const router = new Hono<HonoEnv>()
router.use('*', auth)

// Upload folder name per fund (defaults to the fundKey with hyphens → spaces).
// Override here when a fund should store its PDFs under a friendlier name.
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
  let extractionDataStr: string | null = null

  try {
    const body = await c.req.parseBody()
    file = body['file'] as File
    extractionDataStr = (body['extraction_data'] as string) ?? null
  } catch {
    return c.json({ detail: 'Failed to parse upload' }, 400)
  }

  if (!file || typeof file === 'string')
    return c.json({ detail: 'No file uploaded' }, 400)
  // PDFs are parsed normally (text layer, OCR fallback if scanned). A raw
  // image — a phone photo or scan of a notice with no PDF wrapper — skips
  // straight to OCR in parseFundPdf (see fundParsers/index.ts).
  const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp']
  const lowerName = file.name.toLowerCase()
  if (!lowerName.endsWith('.pdf') && !IMAGE_EXTENSIONS.some(ext => lowerName.endsWith(ext)))
    return c.json({ detail: 'Only PDF or image (PNG/JPG/TIFF/BMP) files are accepted' }, 400)

  const originalName = file.name
  const safe         = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const buffer       = Buffer.from(await file.arrayBuffer())
  const fileHash     = createHash('sha256').update(buffer).digest('hex')
  const reqTypePre   = c.req.query('notice_type')
  const scopedFundIdPre = c.req.query('fund_id')

  // ── Duplicate detection (before touching disk or DB) ──────────────────────
  // Check by file hash so even a renamed copy of the same PDF is caught.
  const hashScope = scopedFundIdPre ? { fundId: scopedFundIdPre, fileHash } : { fileHash }
  const existing = await prisma.notice.findFirst({ where: hashScope as any })
  if (existing) {
    const uploadedAt = existing.createdAt.toISOString().slice(0, 10)
    return c.json({
      detail:        'duplicate_report',
      message:       `This file has already been uploaded (${existing.originalName ?? existing.filename}, on ${uploadedAt}). Please check your existing reports.`,
      existing_id:   existing.id,
      uploaded_at:   uploadedAt,
      original_name: existing.originalName ?? existing.filename,
    }, 409)
  }

  // ── Fast path: commitment notices bypass fund-parser recognition ─────────────
  // Subscription / investment agreements (出資契約書 etc.) don't contain the
  // same labels as capital-call notices, so parseFundPdf may return 'unknown'.
  // When the caller has already classified the document as a commitment notice
  // AND specified the fund explicitly, skip parsing and just store the file.
  if (reqTypePre === 'commitment_notice' && scopedFundIdPre) {
    const commitFund = await prisma.fund.findUnique({ where: { id: scopedFundIdPre } })
    if (!commitFund) return c.json({ detail: 'Fund not found.' }, 404)

    const fundFolder = FUND_FOLDER_NAMES[commitFund.fundName.toLowerCase().replace(/\s+/g, '-')] ??
      commitFund.fundName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const folderPath = path.join(config.uploadDir, fundFolder)
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true })
    const relPath  = path.join(fundFolder, `${Date.now()}_${safe}`)
    const filepath = path.join(config.uploadDir, relPath)
    fs.writeFileSync(filepath, buffer)

    // If the AI-extracted commitment amount is provided, update the fund record.
    const commitmentUsdStr = c.req.query('commitment_usd')
    if (commitmentUsdStr) {
      const amt = parseFloat(commitmentUsdStr)
      if (amt > 0) {
        await prisma.fund.update({
          where: { id: commitFund.id },
          data:  { commitmentUsd: new Decimal(amt) },
        })
      }
    }

    const n = await prisma.notice.create({
      data: {
        filename:      relPath,
        originalName,
        fileHash,
        noticeType:    'commitment_notice',
        status:        'approved',
        approvedAt:    new Date(),
        fundId:        commitFund.id,
        extractedData: {
          noticeType:    'commitment_notice',
          commitmentUsd: commitmentUsdStr ? parseFloat(commitmentUsdStr) : null,
        } as any,
        confidence:    1,
        uploadedBy:    user.email,
      },
    })

    return c.json({
      id:        n.id,
      fund_id:   commitFund.id,
      fund_name: commitFund.fundName,
      notice_type: 'commitment_notice',
      message:   'Commitment document saved.',
    }, 201)
  }

  // ── Get frontend's explicit document type (if provided) ─────────────────
  // The frontend's AI classification takes priority over auto-detection
  const reqType = c.req.query('notice_type')
  const isExplicitTransaction = reqType && ['capital_call', 'distribution', 'capital_and_distribution'].includes(reqType)

  // ── Check if this is a viewing-only document (contract, audit, etc.) ──────
  // ONLY auto-detect if the frontend didn't explicitly classify it as a transaction
  if (!isExplicitTransaction) {
    let pdfText = ''
    try {
      const { extractPdfText } = await import('../../modules/ai-extract/ocr')
      const result = await extractPdfText(buffer)
      pdfText = result.text
    } catch (e) {
      // If text extraction fails, proceed with normal parsing
      pdfText = ''
    }

    const viewingDocCheck = detectViewingDocument(pdfText, originalName)
    if (viewingDocCheck.isViewingDoc) {
      // This is a viewing document - store it without extraction/processing
      // Use the fund provided by the frontend, or fall back to a default
      let resolvedFund = null
      if (scopedFundIdPre) {
        resolvedFund = await prisma.fund.findUnique({ where: { id: scopedFundIdPre } })
      }

      if (!resolvedFund) {
        // Fallback: try to resolve by auto-detection or use SDG
        resolvedFund = await resolveFund('sdg-lps')
      }

      if (!resolvedFund) {
        return c.json({
          detail: 'Fund database error',
        }, 500)
      }

      // Store viewing document directly without extraction
      const fundFolder = FUND_FOLDER_NAMES[resolvedFund.fundName.toLowerCase().replace(/\s+/g, '-')] ??
        resolvedFund.fundName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const folderPath = path.join(config.uploadDir, fundFolder)
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true })
      const relPath = path.join(fundFolder, `${Date.now()}_${safe}`)
      const filepath = path.join(config.uploadDir, relPath)
      fs.writeFileSync(filepath, buffer)

      // Create database record for viewing document
      const n = await prisma.notice.create({
        data: {
          filename:      relPath,
          originalName,
          fileHash,
          noticeType:    'viewing_document',
          status:        'approved',
          approvedAt:    new Date(),
          fundId:        resolvedFund.id,
          extractedData: {
            noticeType: 'viewing_document',
            fundName:   resolvedFund.fundName,
            docType:    viewingDocCheck.docType,
            reason:     viewingDocCheck.reason,
          } as any,
          confidence:    1,
          uploadedBy:    user.email,
        },
      })

      // Log for audit purposes
      console.log(`[fund-reports] Stored viewing document: ${viewingDocCheck.docType} - ${originalName}`)

      return c.json({
        id:        n.id,
        message:   `${viewingDocCheck.docType || 'Viewing'} document stored successfully (no extraction performed)`,
        fundName:  resolvedFund.fundName,
        fund_id:   resolvedFund.id,
        docType:   viewingDocCheck.docType,
        reason:    viewingDocCheck.reason,
        fileName:  originalName,
      }, 201)
    }
  }

  // ── Normal transaction document detection ────────────────────────────────
  // Detect + resolve the fund BEFORE touching disk, so unrecognised PDFs leave
  // no artifacts and each file lands in its own fund's folder.
  let parsed = await parseFundPdf(buffer, originalName)

  // If the frontend provided AI-extracted data, use it instead of re-extracting
  // This ensures the correct values are used, especially for SDG funds where
  // re-extraction may fail on scanned PDFs
  if (extractionDataStr) {
    try {
      const aiExtracted = JSON.parse(extractionDataStr) as any
      // Map AI extraction field names to parsed field names
      // AI returns B_capital_contribution, C_distribution_received, D_reinvestable, etc.
      parsed = {
        ...parsed,
        grossCallUsd:     aiExtracted.B_capital_contribution ?? parsed.grossCallUsd,
        distributionUsd:  aiExtracted.C_distribution_received ?? parsed.distributionUsd,
        reinvestableUsd:  aiExtracted.D_reinvestable ?? parsed.reinvestableUsd,
        currentUnfundedUsd: aiExtracted.report_provided_unfunded_before ?? parsed.currentUnfundedUsd,
        unfundedUsd:      aiExtracted.report_provided_remaining_after ?? parsed.unfundedUsd,
        interestUsd:      aiExtracted.interest ?? parsed.interestUsd,
        commitmentUsd:    aiExtracted.total_commitment_amount ?? parsed.commitmentUsd,
      }
    } catch (e) {
      // If extraction data parsing fails, just use the re-extracted data
      console.warn('[fund-reports] Failed to parse extraction_data:', e)
    }
  }

  if (parsed.fundKey === 'unknown') {
    return c.json({
      detail: 'Fund not recognised. This PDF does not match any registered fund template.',
      hint:   'Supported funds: NB Real Estate Secondary Opportunities Fund II, Hamilton Lane Secondary Fund VI-B, Hamilton Lane Strategic Opportunities Fund IX-B, Dover Street XI Feeder Fund, SDGs 投資事業有限責任組合',
    }, 422)
  }

  // Auto-resolve to the single Fund DB record for this fundKey
  const resolvedFund = await resolveFund(parsed.fundKey)
  if (!resolvedFund) {
    return c.json({
      detail: `Fund "${parsed.fundName}" was recognised but has no matching record in the database. Create the fund first.`,
      fund_key: parsed.fundKey,
    }, 422)
  }

  // If the upload was scoped to a specific fund tab, make sure the PDF matches it.
  const scopedFundId = c.req.query('fund_id')
  if (scopedFundId && scopedFundId !== resolvedFund.id) {
    return c.json({
      detail: `This PDF was detected as "${resolvedFund.fundName}", which doesn't match the fund you're uploading under. Upload it under the correct fund.`,
      fund_key: parsed.fundKey,
    }, 422)
  }

  // Optional commitment this PDF belongs to (funds with per-commitment grouping,
  // e.g. the SDG fund). Validated against the resolved fund.
  let commitmentId: string | null = c.req.query('commitment_id') || null
  if (commitmentId) {
    const cm = await prisma.commitment.findUnique({ where: { id: commitmentId } })
    if (!cm || cm.fundId !== resolvedFund.id) {
      return c.json({ detail: 'The selected commitment does not belong to this fund.' }, 422)
    }
  }

  // ── NB Real Estate / Hamilton Lane / Dover — chain cumulative formulas across
  // notices. These modules compute cumulative contributions / remaining
  // commitment / cumulative cash flow from the PREVIOUS row's stored values.
  // Re-run the parser with the latest prior report's cumulatives so each new
  // notice continues the running totals (the per-row B/C/D ledger is still
  // owned by CalculationEngine). SDG is NOT in this list: sdgExtractor.ts is a
  // simple per-notice extractor (B/C/D + unfundedUsd only) — its cumulative E/F
  // are computed generically by CalculationEngine from running sums, the same
  // way every non-RICH_FUNDS fund works.
  const RICH_FUNDS = ['nb-real-estate', 'hamilton-lane', 'hamilton-strategic', 'dover-street']
  if (RICH_FUNDS.includes(parsed.fundKey) && parsed.rawText) {
    // Chain within the same commitment when one is selected, so each commitment's
    // cumulative totals run independently.
    const previousState = await latestFundPreviousState(resolvedFund.id, commitmentId)
    // Rich extractors run ALWAYS (not just when previousState exists) to override AI extraction
    // previousState is optional and used for cumulative calculations when available
    const reparsed =
      parsed.fundKey === 'nb-real-estate'    ? parseNbRealEstate(parsed.rawText, previousState)
      : parsed.fundKey === 'hamilton-lane'   ? parseHamiltonLane(parsed.rawText, previousState)
      : parsed.fundKey === 'hamilton-strategic' ? parseHamiltonStrategic(parsed.rawText, previousState)
      : parseDoverStreet(parsed.rawText, previousState, originalName)
    reparsed.rawText = parsed.rawText
    Object.assign(parsed, reparsed)
  }

  // ── Write the file into the fund's own folder (e.g. uploads/nb real estate/) ──
  // Folder name defaults to the fundKey with spaces; override per fund where a
  // friendlier name is wanted (Hamilton Strategic → "hamilton lane strategic").
  const fundFolder = FUND_FOLDER_NAMES[parsed.fundKey] ?? parsed.fundKey.replace(/-/g, ' ')  // dover-street → "dover street"
  const folderPath = path.join(config.uploadDir, fundFolder)
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true })
  const relPath  = path.join(fundFolder, `${Date.now()}_${safe}`)  // stored on the notice; delete reuses it
  const filepath = path.join(config.uploadDir, relPath)
  fs.writeFileSync(filepath, buffer)

  // Strip rawText before storing
  const { rawText: _, ...storedData } = parsed

  // Step 1 of the two-step flow: the user (or the AI classifier upstream of this
  // call) picks the document type; the parser's guess is normally only a fallback.
  // EXCEPTION: for RICH_FUNDS, parsed.noticeType is derived from numbers the
  // deterministic extractor actually read off the page (grossCallUsd != 0 AND
  // distributionUsd != 0), not a guess. A "return of unused capital" true-up has a
  // *negative* B alongside a positive C, which the AI classifier prompt doesn't
  // recognise as a capital-call component — it reliably mislabels these as plain
  // 'distribution'. Trusting that label here would silently drop the capital-call
  // reversal row (see Hamilton Lane Strategic Mar/Jun 2025 true-ups). So once the
  // extractor has positively identified both legs, that fact always wins.
  const ALLOWED_TYPES = [
    'capital_call', 'distribution', 'capital_and_distribution',
    'financial_statement', 'nav_report', 'quarterly_report',
    'annual_report', 'tax_document', 'audit_report', 'other_document',
    'commitment_notice',
  ]
  const noticeType =
    parsed.noticeType === 'capital_and_distribution' ? parsed.noticeType
    : reqType && ALLOWED_TYPES.includes(reqType) ? reqType
    : parsed.noticeType

  // ── Auto-create the ledger record + document atomically (no approval step) ──
  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  const fxRate   = latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150
  const dueDate  = parsed.dueDate ? new Date(parsed.dueDate) : new Date()

  let notice
  let created: Record<string, any> = {}
  try {
    const result = await prisma.$transaction(async (tx) => {
      const made: Record<string, any> = {}

      // The document type decides WHICH section(s) get a record:
      //   capital_call             → Capital Calls only
      //   distribution             → Distributions only
      //   capital_and_distribution → BOTH (call portion B + distribution portion C)
      const wantCall = noticeType === 'capital_call' || noticeType === 'capital_and_distribution'
      const wantDist = noticeType === 'distribution' || noticeType === 'capital_and_distribution'

      // ── Capital Calls section — the call portion (column B) ──────────────────
      if (wantCall) {
        const grossUsd = parseFloat(String(parsed.grossCallUsd ?? 0))   // B
        const existing = await tx.capitalCall.findFirst({ where: { fundId: resolvedFund.id, dueDate, commitmentId } })
        if (existing) {
          made.callId = existing.id
          made.deduplicated = true
        } else {
          // Call numbering is per-commitment (or fund-level when no commitment).
          const last = await tx.capitalCall.findFirst({ where: { fundId: resolvedFund.id, commitmentId }, orderBy: { callNumber: 'desc' } })
          const cc = await tx.capitalCall.create({
            data: {
              fundId:              resolvedFund.id,
              commitmentId,
              callNumber:          (last?.callNumber ?? 0) + 1,
              noticeDate:          parsed.noticeDate ? new Date(parsed.noticeDate) : new Date(),
              dueDate,
              executionDate:       dueDate,
              callPct:             parseFloat(String(parsed.callPct ?? 0)),
              grossCallUsd:        grossUsd,
              netCallUsd:          grossUsd,
              // The distribution is recorded in its own section, so the call row carries
              // only B (its cash flow is -B). For a combined notice the C lands on the
              // Distribution record below.
              distributionUsd:     0,
              reinvestableUsd:     0,
              investmentAmountUsd: grossUsd,
              managementFeeUsd:    parseFloat(String(parsed.managementFeeUsd ?? 0)),
              expenseUsd:          parseFloat(String(parsed.taxExpenseUsd ?? 0)),
              returnOfCapitalUsd:  parseFloat(String(parsed.returnOfCapitalUsd ?? 0)),
              gainUsd:             parseFloat(String(parsed.gainUsd ?? 0)),
              interestUsd:         parseFloat(String(parsed.interestUsd ?? 0)),
              fxRate,
              netCallJpy:          Math.round(grossUsd * fxRate),
              wireReference:       parsed.wireReference ?? null,
              // SDG: store the post-call remaining so the CalculationEngine can use it
              // directly as F (investment capacity) instead of deriving prev_F - B.
              unfundedAfterCallUsd: parsed.fundKey === 'sdg-lps' && (parsed.unfundedUsd ?? 0) > 0
                ? parseFloat(String(parsed.unfundedUsd))
                : null,
              status:              'approved',
            },
          })
          made.callId = cc.id
          for (const it of (parsed.investmentTargets ?? [])) {
            await tx.investmentTarget.create({
              data: { fundId: resolvedFund.id, projectName: it.projectName, amountUsd: it.amountUsd ?? null, sector: it.sector ?? null },
            })
          }
        }
      }

      // ── Distributions section — the distribution portion (column C) ──────────
      if (wantDist) {
        // For a combined notice the C is the dedicated distribution figure; for a
        // standalone distribution use it, else any $ the parser found.
        const amtUsd = noticeType === 'capital_and_distribution'
          ? parseFloat(String(parsed.distributionUsd ?? 0))
          : parseFloat(String(parsed.distributionUsd || parsed.grossCallUsd || 0))
        const existing = await tx.distribution.findFirst({ where: { fundId: resolvedFund.id, distributionDate: dueDate, commitmentId } })
        if (existing) {
          made.distId = existing.id
          made.deduplicated = true
        } else {
          const dist = await tx.distribution.create({
            data: {
              fundId:           resolvedFund.id,
              commitmentId,
              distributionDate: dueDate,
              distType:         'Income',
              amountUsd:        amtUsd,
              amountJpy:        Math.round(amtUsd * fxRate),
              fxRate,
              reinvestableUsd:  parseFloat(String(parsed.reinvestableUsd ?? 0)),
              returnOfCapitalUsd: parseFloat(String(parsed.returnOfCapitalUsd ?? 0)),
              gainUsd:            parseFloat(String(parsed.gainUsd ?? 0)),
              interestUsd:        parseFloat(String(parsed.interestUsd ?? 0)),
              isRecallable:     false,
            },
          })
          made.distId = dist.id
        }
      }

      // Store the document record, linking back to the record it created so delete can reverse it.
      const n = await tx.notice.create({
        data: {
          filename:      relPath,
          originalName,
          fileHash,
          noticeType,
          status:        'approved',
          approvedAt:    new Date(),
          fundId:        resolvedFund.id,       // auto-linked to the single fund record
          commitmentId,                         // optional per-commitment grouping
          extractedData: { ...storedData, createdCallId: made.callId ?? null, createdDistId: made.distId ?? null } as any,
          confidence:    parsed.confidence,
          uploadedBy:    user.email,
        },
      })
      return { notice: n, made }
    })
    notice  = result.notice
    created = result.made
  } catch (err: any) {
    // Roll back the saved file too, so a failed upload leaves nothing behind.
    try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath) } catch { /* ignore */ }
    console.error('[fund-reports/upload] failed:', err)
    return c.json({ detail: `Could not process this report: ${err?.message ?? 'unknown error'}` }, 500)
  }

  // ── Auto-update fund commitment from the parsed report ────────────────────────
  // NB Real Estate, Hamilton Lane (both strategies), Dover Street, and Capula GRV
  // all print the LP's total commitment on every capital-call / distribution notice.
  // On the very first upload for a newly-created fund (commitmentUsd = 0), we
  // auto-set it from the parser so the user never has to enter it manually.
  // On subsequent uploads the value is already set and identical, so the update
  // is effectively a no-op (guard: |new - current| ≤ 1 → skip to avoid noise).
  //
  // SDG and Siguler Guff are excluded: their commitment is entered manually in
  // fund settings — not extracted from any document.
  const FUNDS_WITH_COMMITMENT_IN_REPORT = [
    'nb-real-estate', 'hamilton-lane', 'hamilton-strategic', 'dover-street', 'capula-grv', 'goldman-sachs',
  ]
  if (FUNDS_WITH_COMMITMENT_IN_REPORT.includes(parsed.fundKey) && (parsed.commitmentUsd ?? 0) > 0) {
    const currentCommitment = parseFloat(resolvedFund.commitmentUsd.toString())
    if (Math.abs(parsed.commitmentUsd - currentCommitment) > 1) {
      await prisma.fund.update({
        where: { id: resolvedFund.id },
        data:  { commitmentUsd: new Decimal(parsed.commitmentUsd) },
      })
    }
  }

  // Side-effect notification — must never fail the upload.
  try {
    await notifyAllAdmins({
      type:    'notice_uploaded',
      title:   'New Fund Report Processed',
      message: `${user.email} uploaded a ${noticeType.replace('_', ' ')} for ${resolvedFund.fundName} — the ledger and dashboard updated automatically.`,
      link:    `/funds/${resolvedFund.id}`,
      metadata: { notice_id: notice.id, fund_key: parsed.fundKey, fund_id: resolvedFund.id },
    })
  } catch (e) {
    console.error('[fund-reports/upload] notify failed (non-fatal):', e)
  }

  return c.json({
    ...reportDict(notice),
    fund_id:   resolvedFund.id,
    fund_name: resolvedFund.fundName,
    created,
  }, 201)
})

// ── Filesystem reconciliation ──────────────────────────────────────────────────
// Keep the document list in sync with the uploads/ folder: if a stored PDF was
// removed directly from the backend's uploads directory, treat that document as
// deleted — reverse the capital call / distribution it created and drop the Notice
// record — so it disappears from the frontend and the ledger + dashboard recompute
// automatically (same effect as DELETE /:id, but triggered by the missing file).
async function reconcileOrphanedNotices() {
  // Safety: never mass-delete if the uploads root itself is missing/unmounted —
  // that would make every file look "deleted" and wipe all documents + ledgers.
  if (!fs.existsSync(config.uploadDir)) return

  const notices = await prisma.notice.findMany()
  for (const n of notices) {
    if (!n.filename) continue                                   // no backing file to track
    const filepath = path.join(config.uploadDir, n.filename)
    if (fs.existsSync(filepath)) continue                       // file still present → keep

    // The stored PDF is gone from disk → reverse it like a normal delete.
    const d = (n.extractedData as any) ?? {}
    try {
      if (d.createdCallId) await prisma.capitalCall.deleteMany({ where: { id: d.createdCallId } })
      if (d.createdDistId) await prisma.distribution.deleteMany({ where: { id: d.createdDistId } })
      await prisma.notice.delete({ where: { id: n.id } })
      console.info(`[fund-reports] reconciled orphaned document ${n.id} (${n.filename}) — file removed from uploads/`)
    } catch (e) {
      console.error('[fund-reports] reconcile failed for notice', n.id, e)
    }
  }
}

// ── GET / — list all fund report notices ──────────────────────────────────────
// Sorted by the document's own date (notice/due date), OLDEST first → latest last.
router.get('/', async (c) => {
  // Reflect any files deleted directly from the uploads/ folder before listing.
  try { await reconcileOrphanedNotices() } catch (e) { console.error('[fund-reports] reconcile error (non-fatal):', e) }

  const { fund_key, status, fund_id } = c.req.query()

  const notices = await prisma.notice.findMany()

  let results = notices
  if (status)   results = results.filter(n => n.status === status)
  if (fund_id)  results = results.filter(n => n.fundId === fund_id)
  if (fund_key) results = results.filter(n => (n.extractedData as any)?.fundKey === fund_key)

  results.sort((a, b) => docDate(a) - docDate(b))   // chronological: oldest at top

  return c.json(results.map(reportDict))
})

// The economic date of a report — prefer due date, then notice date, then upload time.
function docDate(n: any): number {
  const d = (n.extractedData as any) ?? {}
  const raw = d.dueDate || d.noticeDate || n.createdAt
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? 0 : t
}

// Latest stored cumulatives for a fund (NB / Hamilton) — feeds the next notice's
// running totals. Returns null when this is the first rich report (the extractor
// then falls back to the report's own report-cumulative values).
async function latestFundPreviousState(fundId: string, commitmentId: string | null = null) {
  // When a commitment is selected, chain only within that commitment so each
  // commitment's running totals are independent.
  const notices = await prisma.notice.findMany({ where: { fundId, commitmentId } })
  const docs = notices
    .filter(n => (n.extractedData as any)?.fundReport?.final_excel_fields)
    .sort((a, b) => docDate(b) - docDate(a))   // newest first
  const f = (docs[0]?.extractedData as any)?.fundReport?.final_excel_fields
  if (!f) return null
  return {
    cumulative_capital_contributions: f.cumulative_capital_contributions ?? null,
    remaining_commitment:             f.remaining_commitment ?? null,
    cumulative_cash_flow:             f.cumulative_cash_flow ?? null,
  }
}

// ── GET /:id ───────────────────────────────────────────────────────────────────
// Includes the rich fund report (breakdown, calculated Excel fields, validation)
// when present, so the document detail panel can render it (NB / Hamilton).
router.get('/:id', async (c) => {
  const n = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!n) return c.json({ detail: 'Report not found' }, 404)
  const fundReport = (n.extractedData as any)?.fundReport ?? null
  return c.json({ ...reportDict(n), fund_report: fundReport })
})

// ── GET /:id/file — stream the stored PDF/image so it can be viewed in-app ───────
const FILE_CONTENT_TYPES: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.tif':  'image/tiff',
  '.tiff': 'image/tiff',
  '.bmp':  'image/bmp',
  '.webp': 'image/webp',
}
router.get('/:id/file', async (c) => {
  const n = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!n) return c.json({ detail: 'Report not found' }, 404)
  const filepath = path.join(config.uploadDir, n.filename)
  if (!fs.existsSync(filepath)) return c.json({ detail: 'File not found on disk' }, 404)
  const buf = fs.readFileSync(filepath)
  const contentType = FILE_CONTENT_TYPES[path.extname(n.filename).toLowerCase()] ?? 'application/pdf'
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type':        contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(n.originalName ?? n.filename)}"`,
    },
  })
})

// ── POST /:id/approve ──────────────────────────────────────────────────────────
// Creates CapitalCall or Distribution, deduplicates by due date,
// then recalculates the full ledger via CalculationEngine and returns the snapshot.
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

  // Latest FX rate for JPY conversion
  const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
  const fxRate   = latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150

  const created: Record<string, any> = {}
  const dueDate = d.dueDate ? new Date(d.dueDate) : new Date()

  // ── Capital Call ────────────────────────────────────────────────────────────
  if (notice.noticeType === 'capital_call') {
    const grossUsd = parseFloat(String(d.grossCallUsd ?? 0))
    const reinvest = parseFloat(String(d.reinvestableUsd ?? 0))
    const netUsd   = grossUsd - reinvest
    const callPct  = parseFloat(String(d.callPct ?? 0))

    // Deduplicate: skip if a capital call with the same due date already exists
    const existing = await prisma.capitalCall.findFirst({
      where: { fundId: notice.fundId, dueDate },
    })

    if (existing) {
      created.capital_call_id = existing.id
      created.deduplicated    = true
    } else {
      const last    = await prisma.capitalCall.findFirst({ where: { fundId: notice.fundId }, orderBy: { callNumber: 'desc' } })
      const callNum = (last?.callNumber ?? 0) + 1

      const cc = await prisma.capitalCall.create({
        data: {
          fundId:              notice.fundId,
          callNumber:          callNum,
          noticeDate:          d.noticeDate ? new Date(d.noticeDate) : new Date(),
          dueDate,
          callPct,
          grossCallUsd:        grossUsd,
          netCallUsd:          netUsd,
          distributionUsd:     parseFloat(String(d.distributionUsd ?? 0)),
          reinvestableUsd:     reinvest,
          investmentAmountUsd: grossUsd,
          managementFeeUsd:    parseFloat(String(d.managementFeeUsd ?? 0)),
          expenseUsd:          parseFloat(String(d.taxExpenseUsd ?? 0)),
          fxRate,
          netCallJpy:          Math.round(netUsd * fxRate),
          wireReference:       d.wireReference ?? null,
          status:              'pending',
        },
      })
      created.capital_call_id = cc.id

      // Investment targets from the notice
      for (const it of (d.investmentTargets ?? [])) {
        await prisma.investmentTarget.create({
          data: { fundId: notice.fundId, projectName: it.projectName, amountUsd: it.amountUsd ?? null, sector: it.sector ?? null },
        })
      }
    }

  // ── Distribution ────────────────────────────────────────────────────────────
  } else if (notice.noticeType === 'distribution') {
    const amtUsd = parseFloat(String(d.distributionUsd ?? 0))

    const existing = await prisma.distribution.findFirst({
      where: { fundId: notice.fundId, distributionDate: dueDate },
    })

    if (existing) {
      created.distribution_id = existing.id
      created.deduplicated    = true
    } else {
      const dist = await prisma.distribution.create({
        data: {
          fundId:           notice.fundId,
          distributionDate: dueDate,
          distType:         'Income',
          amountUsd:        amtUsd,
          amountJpy:        Math.round(amtUsd * fxRate),
          fxRate,
          reinvestableUsd:  parseFloat(String(d.reinvestableUsd ?? 0)),
          isRecallable:     false,
        },
      })
      created.distribution_id = dist.id
    }
  }

  // Mark notice approved
  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data:  { status: 'approved', approvedAt: new Date(), adminNotes: c.req.query('admin_notes') ?? null },
  })

  if (notice.uploadedBy) {
    await notifyUser(notice.uploadedBy, {
      type:    'notice_approved',
      title:   'Fund Report Approved ✓',
      message: `Your ${notice.noticeType.replace('_', ' ')} for ${fund.fundName} has been approved.`,
      link:    `/funds/${notice.fundId}`,
    })
  }

  // ── Recalculate full ledger via CalculationEngine ──────────────────────────
  const [paidCalls, distributions] = await Promise.all([
    prisma.capitalCall.findMany({ where: { fundId: notice.fundId, status: { in: ['approved', 'paid'] } }, orderBy: { executionDate: 'asc' } }),
    prisma.distribution.findMany({ where: { fundId: notice.fundId }, orderBy: { distributionDate: 'asc' } }),
  ])

  const commitment = new Decimal(fund.commitmentUsd.toString())
  const f = (v: Decimal) => parseFloat(v.toString())

  const txns = [
    ...paidCalls.map((cc: any) => ({
      date:              cc.executionDate ?? cc.dueDate,
      txType:            'capital_call'   as const,
      description:       `Capital Call #${cc.callNumber}`,
      fxRate:            cc.fxRate ? new Decimal(cc.fxRate.toString()) : null,
      capitalPaidIn:     new Decimal(cc.grossCallUsd.toString()),          // B
      capitalReceived:   new Decimal(cc.distributionUsd.toString()),       // C
      reinvestable:      new Decimal(cc.reinvestableUsd.toString()),       // D
      // SDG: override F with the post-call remaining stored on the capital call.
      unfundedAfterCall: cc.unfundedAfterCallUsd != null
        ? new Decimal(cc.unfundedAfterCallUsd.toString())
        : null,
    })),
    ...distributions.map((dist: any) => ({
      date:            dist.distributionDate,
      txType:          'distribution' as const,
      description:     dist.distType,
      fxRate:          dist.fxRate ? new Decimal(dist.fxRate.toString()) : null,
      capitalPaidIn:   new Decimal(0),
      capitalReceived: new Decimal(dist.amountUsd.toString()),      // C
      reinvestable:    new Decimal(dist.reinvestableUsd.toString()), // D
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
      // Column B
      capital_paid_in:     f(r.capitalPaidIn),
      // Column C
      capital_received:    f(r.capitalReceived),
      // Column D
      reinvestable:        f(r.reinvestable),
      // Column E — cumulative called
      cumulative_called:   f(r.cumulativeCalled),
      // Column F — investment capacity
      investment_capacity: f(r.investmentCapacity),
      // Column G — period cash flow
      cash_flow:           f(r.cashFlow),
      // Column H — running net cash position
      net_cash_position:   f(r.netCashPosition),
    }))
  }

  return c.json({
    message:      created.deduplicated
      ? 'Notice approved (capital call already existed for this date — no duplicate created).'
      : 'Approved — records created and ledger updated.',
    created,
    fund: {
      id:        fund.id,
      fund_name: fund.fundName,
    },
    // CalculationEngine snapshot (dashboard KPIs)
    snapshot: snapshot ? {
      commitment_usd:      f(commitment),
      total_called_usd:    f(snapshot.totalCalledUsd),    // sum of B
      total_received_usd:  f(snapshot.totalReceivedUsd),  // sum of C
      drawn_pct:           f(snapshot.drawnPct),
      unfunded_usd:        f(snapshot.unfundedUsd),
      investment_capacity: f(snapshot.investmentCapacity), // col F last row
      net_cash_position:   f(snapshot.netCashPosition),    // col H last row
      dpi:                 f(snapshot.dpi),
    } : null,
    // Full ledger rows (col B-H)
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

// ── PATCH /:id — update document metadata (e.g., rename) ─────────────────────────
router.patch('/:id', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Report not found' }, 404)

  const body = await c.req.json()
  const updateData: any = {}

  if (body.originalName) {
    updateData.originalName = body.originalName.trim()
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ detail: 'No fields to update' }, 400)
  }

  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data: updateData,
  })

  return c.json(reportDict(updated))
})

// ── DELETE /:id — remove the document AND the ledger record it created ─────────
// Reverses the upload: deletes the linked capital call / distribution, the stored
// PDF file, and the document record. The ledger + dashboard recompute automatically.
router.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('id') } })
  if (!notice) return c.json({ detail: 'Report not found' }, 404)

  const d = (notice.extractedData as any) ?? {}

  // Reverse the auto-created ledger record (ignore if already gone)
  if (d.createdCallId) {
    await prisma.capitalCall.deleteMany({ where: { id: d.createdCallId } })
  }
  if (d.createdDistId) {
    await prisma.distribution.deleteMany({ where: { id: d.createdDistId } })
  }

  // Remove the stored PDF file
  if (notice.filename) {
    const filepath = path.join(config.uploadDir, notice.filename)
    try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath) } catch { /* non-fatal */ }
  }

  await prisma.notice.delete({ where: { id: notice.id } })

  return c.json({ message: 'Report deleted — ledger and dashboard updated.', fund_id: notice.fundId })
})

// ── GET /:id/ledger — full ledger for the fund linked to this notice ───────────
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
      date:              cc.executionDate ?? cc.dueDate,
      txType:            'capital_call' as const,
      description:       `Capital Call #${cc.callNumber}`,
      fxRate:            cc.fxRate ? new Decimal(cc.fxRate.toString()) : null,
      capitalPaidIn:     new Decimal(cc.grossCallUsd.toString()),
      capitalReceived:   new Decimal(cc.distributionUsd.toString()),
      reinvestable:      new Decimal(cc.reinvestableUsd.toString()),
      unfundedAfterCall: cc.unfundedAfterCallUsd != null
        ? new Decimal(cc.unfundedAfterCallUsd.toString())
        : null,
    })),
    ...distributions.map((dist: any) => ({
      date: dist.distributionDate, txType: 'distribution' as const, description: dist.distType,
      fxRate: dist.fxRate ? new Decimal(dist.fxRate.toString()) : null,
      capitalPaidIn: new Decimal(0), capitalReceived: new Decimal(dist.amountUsd.toString()),
      reinvestable: new Decimal(dist.reinvestableUsd.toString()),
    })),
  ]

  if (txns.length === 0) return c.json({ fund_id: fund.id, fund_name: fund.fundName, commitment: f(commitment), rows: [], snapshot: null })

  const { rows, snapshot } = CalculationEngine.buildLedger(commitment, txns)

  return c.json({
    fund_id:    fund.id,
    fund_name:  fund.fundName,
    commitment: f(commitment),
    rows: rows.map((r, i) => ({
      row: i + 1, date: r.date.toISOString().slice(0, 10), type: r.txType, description: r.description,
      capital_paid_in:     f(r.capitalPaidIn),   // B
      capital_received:    f(r.capitalReceived),  // C
      reinvestable:        f(r.reinvestable),     // D
      cumulative_called:   f(r.cumulativeCalled), // E
      investment_capacity: f(r.investmentCapacity),// F
      cash_flow:           f(r.cashFlow),          // G
      net_cash_position:   f(r.netCashPosition),   // H
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
