import { Hono }        from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { HonoEnv } from '../../types/index'
import { extractPdfText } from './ocr'
import { config }        from '../../config/index'
import {
  SYSTEM_PROMPT, CLASSIFIER_PROMPT, EXTRACTOR_PROMPTS,
} from './prompts'
import { applyCalcEngine, runCrossChecks } from './calc'
import type { PrevState } from './calc'
import { extractSdgNotice } from '../../services/fundParsers/sdgExtractor'
import { parseNbRealEstate } from '../../services/fundParsers/nb-real-estate/index'
import { parseHamiltonLane } from '../../services/fundParsers/hamilton-lane/index'
import { parseHamiltonStrategic } from '../../services/fundParsers/hamilton-strategic/index'
import { parseDoverStreet } from '../../services/fundParsers/dover-street/index'
import { parseCapulaGrv } from '../../services/fundParsers/capula-grv/index'

const router = new Hono<HonoEnv>()

router.use('/test', bodyLimit({ maxSize: 500 * 1024 * 1024 }))

// ── POST /api/v1/ai-extract/test ──────────────────────────────────────────────
// Accepts: multipart form with:
//   file         – PDF file
//   prev_e       – previous cumulative contributions  (default 0)
//   prev_f       – previous unfunded commitment       (default 0)
//   prev_g       – previous net cash flow             (default 0)
//   model_url    – Ollama/vLLM base URL               (optional, overrides config)
//   model_name   – model name                         (optional, overrides config)
router.post('/test', async (c) => {
  try {
    console.log('[ai-extract] POST /test - Starting file upload processing')
    const body      = await c.req.parseBody({ all: true })
    const fileField = body['file']

    if (!fileField || typeof fileField === 'string') {
      console.warn('[ai-extract] No valid file field in request')
      return c.json({ detail: 'No PDF file uploaded. Send multipart form with field "file".' }, 400)
    }

    const file   = fileField as File
    console.log(`[ai-extract] File received: ${file.name}, size: ${file.size} bytes`)

    const buffer = Buffer.from(await file.arrayBuffer())

    console.log(`[ai-extract] Buffer created: ${buffer.length} bytes`)

    // ── Extract PDF text (OCR fallback for scanned PDFs) ──────────────────
    let pdfText = ''
    let usedOcr = false
    try {
      console.log('[ai-extract] Extracting PDF text...')
      const result = await extractPdfText(buffer)
      pdfText  = result.text
      usedOcr  = result.usedOcr
      console.log(`[ai-extract] PDF text extracted: ${pdfText.length} chars, OCR used: ${usedOcr}`)
    } catch (err: any) {
      console.error('[ai-extract] PDF extraction error:', err.message)
      return c.json({ detail: 'Could not parse PDF. Ensure the file is a valid PDF.' }, 400)
    }

    if (!pdfText || pdfText.length < 20) {
      console.warn('[ai-extract] Insufficient text extracted from PDF (got ' + pdfText.length + ' chars)')
      return c.json({
        detail: 'Could not extract text from this PDF even after OCR. The file may be corrupt or in an unsupported format.',
        debug: {
          extracted_chars: pdfText.length,
          used_ocr: usedOcr,
          threshold: 20,
          pdf_size_bytes: buffer.length
        }
      }, 422)
    }

    // ── Let AI model classify the document ────────────────────────────────────
    // Do NOT do early viewing document detection here - the Qwen AI model should
    // be the source of truth for document classification. It will distinguish between
    // capital calls, distributions, and viewing documents (audit, financial, etc.).

    // ── Previous state for calc engine ────────────────────────────────────
    const prev: PrevState = {
      E: parseFloat(String(body['prev_e'] ?? '0')) || 0,
      F: parseFloat(String(body['prev_f'] ?? '0')) || 0,
      G: parseFloat(String(body['prev_g'] ?? '0')) || 0,
    }

    // ── Model config ──────────────────────────────────────────────────────
    const modelUrl  = String(body['model_url']  || config.aiModelUrl).replace(/\/+$/, '')
    const modelName = String(body['model_name'] || config.aiModelName)

    // ── SDG deterministic fast-path ───────────────────────────────────────
    // The deterministic regex extractor is more reliable than the AI classifier
    // for SDG documents (AI can mis-classify capital-call notices as COMMITMENT_NOTICE
    // and the AI model itself may be unavailable). Any document the extractor
    // recognises as SDG bypasses Stage 1 & 2 entirely.
    // If no amount was found (confidence = 0.3) the frontend shows 0 with a low
    // gate score so the user knows to review — still better than a 500 error.
    console.log('[ai-extract] Checking if document is SDG...')
    // Pre-check: verify document contains SDG-specific keywords before running SDG extractor
    const isSdgDocument = /SDG|投資事業有限責任組合|払込み|振込送金のご請求/.test(pdfText)
    console.log(`[ai-extract] SDG pre-check: ${isSdgDocument ? 'likely SDG' : 'not likely SDG'}`)
    const sdgDet = isSdgDocument ? extractSdgNotice(pdfText, file.name) : null

    // HYBRID APPROACH: Accept SDG detection even with lower confidence
    // - confidence >= 0.8: High confidence (confident detection)
    // - confidence >= 0.3: Hybrid confidence (auto-assign but show warning to user)
    // - confidence < 0.3: Fall through to AI model
    if (sdgDet && sdgDet.confidence >= 0.3) {
      const isHighConfidence = sdgDet.confidence >= 0.8
      const confidenceLevel = isHighConfidence ? 'high' : 'hybrid'
      console.log(`[ai-extract] ✓ SDG document detected (${confidenceLevel}): ${sdgDet.fundName}, confidence: ${sdgDet.confidence}`)

      const detReportType = sdgDet.noticeType === 'distribution' ? 'DISTRIBUTION' : 'CAPITAL_CALL'
      const detExtraction = {
        transaction_date:                sdgDet.dueDate,
        B_capital_contribution:          sdgDet.grossCallUsd ?? null,
        C_distribution_received:         sdgDet.distributionUsd ?? null,
        D_reinvestable:                  sdgDet.reinvestableUsd ?? null,
        return_of_capital:               null,
        gain:                            null,
        interest:                        sdgDet.interestUsd ?? null,
        report_provided_unfunded_before: sdgDet.currentUnfundedUsd ?? null,
        report_provided_remaining_after: sdgDet.unfundedUsd ?? null,
        subsequent_close_interest:       null,
        notes:                           (sdgDet.extractionLog ?? []).join(' | '),
        extraction_confidence:           Math.round(sdgDet.confidence * 100),
      }
      const detCalc   = applyCalcEngine(detExtraction as unknown as import('./calc').Extracted, 'SDG', prev)
      const detChecks = runCrossChecks(detExtraction as unknown as import('./calc').Extracted, detCalc)
      const detConf   = Math.round(sdgDet.confidence * 100)
      return c.json({
        pdf_characters: pdfText.length,
        pdf_preview:    pdfText.slice(0, 500),
        classification: {
          fund_key:         'SDG',
          fund_display_name: sdgDet.fundName,
          report_type:      detReportType,
          currency:         'JPY',
          confidence_score: detConf,
          deterministic:    true,
          detection_method: confidenceLevel,  // 'high' or 'hybrid'
        },
        extraction:    detExtraction,
        calculation:   detCalc,
        cross_checks:  detChecks,
        confidence_gate: confidenceGate(detConf, detConf),
        model_used: `deterministic/sdg-extractor-${confidenceLevel}`,
        hybrid_warning: !isHighConfidence ? '⚠️ Low confidence detection - please review the extracted data' : undefined,
      })
    }

    if (sdgDet && sdgDet.confidence < 0.3) {
      console.log(`[ai-extract] SDG extraction returned very low confidence (${sdgDet.confidence}), falling back to AI model`)
    }

    // ── Stage 1: Classify ─────────────────────────────────────────────────
    console.log(`[ai-extract] SDG not detected, proceeding to AI classification using model: ${modelName}`)
    console.log(`[ai-extract] Stage 1: Classifying document...`)
    const classifyPrompt = CLASSIFIER_PROMPT.replace('{{DOCUMENT_TEXT}}', truncate(pdfText, 3000))
    const stage1Raw = await callModel(modelUrl, modelName, SYSTEM_PROMPT, classifyPrompt)
    const classification = parseJSON(stage1Raw)
    console.log(`[ai-extract] Stage 1 classification: ${classification?.fund_key ?? 'unknown'}, confidence: ${classification?.confidence_score ?? 0}`)

    if (!classification) {
      console.error('[ai-extract] Stage 1: Invalid JSON response from model')
      return c.json({
        detail:   'Model returned invalid JSON for classification.',
        raw_response: stage1Raw,
      }, 502)
    }

    const { fund_key, fund_display_name, report_type, currency, confidence_score } = classification
    const isUnknown = !fund_key || fund_key === 'UNKNOWN' || confidence_score < 75

    console.log(`[ai-extract] Stage 1 result: fund_key=${fund_key}, confidence=${confidence_score}%, report_type=${report_type}`)

    // ── Stage 2: Extract ──────────────────────────────────────────────────
    console.log(`[ai-extract] Stage 2: Extracting data for fund: ${fund_display_name}`)
    const extractorTemplate = EXTRACTOR_PROMPTS[fund_key] ?? EXTRACTOR_PROMPTS['UNKNOWN']
    const extractPrompt     = extractorTemplate.replace('{{DOCUMENT_TEXT}}', truncate(pdfText, 4000))
    const stage2Raw = await callModel(modelUrl, modelName, SYSTEM_PROMPT, extractPrompt)
    const extraction = parseJSON(stage2Raw)
    console.log(`[ai-extract] Stage 2 extraction result:`, extraction)

    if (!extraction) {
      console.error('[ai-extract] Stage 2: Invalid JSON response from model')
      return c.json({
        detail:   'Model returned invalid JSON for extraction.',
        classification,
        raw_response: stage2Raw,
      }, 502)
    }

    // ── Rich Extraction (override AI for known fund types) ─────────────────
    // For funds with dedicated parsers (NB Real Estate, Hamilton, Dover, Capula, SDG), use the
    // rich extractor instead of AI to get more accurate values for the preview
    const RICH_FUNDS = ['NB_REAL_ESTATE', 'HAMILTON_SEC', 'HAMILTON_STRAT', 'DOVER', 'CAPULA', 'SDG']
    if (RICH_FUNDS.includes(fund_key) && pdfText) {
      try {
        let richNotice = null
        if (fund_key === 'NB_REAL_ESTATE') richNotice = parseNbRealEstate(pdfText)
        else if (fund_key === 'HAMILTON_SEC') richNotice = parseHamiltonLane(pdfText)
        else if (fund_key === 'HAMILTON_STRAT') richNotice = parseHamiltonStrategic(pdfText)
        else if (fund_key === 'DOVER') richNotice = parseDoverStreet(pdfText, null, '')
        else if (fund_key === 'CAPULA') richNotice = parseCapulaGrv(pdfText)
        else if (fund_key === 'SDG') richNotice = extractSdgNotice(pdfText, file.name)

        // Override AI extraction with rich extraction values
        if (richNotice) {
          extraction.B_capital_contribution = richNotice.grossCallUsd ?? extraction.B_capital_contribution
          extraction.C_distribution_received = richNotice.distributionUsd ?? extraction.C_distribution_received
          extraction.D_reinvestable = richNotice.reinvestableUsd ?? extraction.D_reinvestable
          extraction.return_of_capital = richNotice.returnOfCapitalUsd ?? extraction.return_of_capital
          extraction.gain = richNotice.gainUsd ?? extraction.gain
          extraction.interest = richNotice.interestUsd ?? extraction.interest
          extraction.transaction_date = richNotice.dueDate ?? extraction.transaction_date
          extraction.total_commitment_amount = richNotice.commitmentUsd ?? extraction.total_commitment_amount
        }
      } catch (richErr) {
        // Rich extraction failed, continue with AI values
        console.warn('[ai-extract] Rich extraction failed, using AI values:', richErr)
      }
    }

    // ── Stage 3: Deterministic calc (AI never does this) ──────────────────
    let calcResult   = null
    let crossChecks  = null

    if (!isUnknown && report_type !== 'COMMITMENT_NOTICE') {
      calcResult  = applyCalcEngine(extraction as unknown as import('./calc').Extracted, fund_key, prev)
      crossChecks = runCrossChecks(extraction as unknown as import('./calc').Extracted, calcResult)
    }

    // ── Confidence gate ───────────────────────────────────────────────────
    const extractionConf = extraction.extraction_confidence ?? extraction.mapping_confidence ?? 0
    const gate = confidenceGate(confidence_score, extractionConf)

    console.log(`[ai-extract] Processing complete. Confidence gate: ${gate.label} (${gate.level})`)
    console.log(`[ai-extract] Returning response for ${fund_display_name}`)

    return c.json({
      // ── Input
      pdf_characters: pdfText.length,
      pdf_preview:    pdfText.slice(0, 500),

      // ── Stage 1
      classification: {
        fund_key,
        fund_display_name,
        report_type,
        currency,
        confidence_score,
      },

      // ── Stage 2
      extraction,

      // ── Stage 3 (deterministic — null for UNKNOWN funds)
      calculation: calcResult,
      cross_checks: crossChecks,

      // ── Gate
      confidence_gate: gate,
      model_used: `${modelUrl} / ${modelName}`,
    })
  } catch (err: any) {
    console.error('[ai-extract] ERROR:', err)
    if (err.message?.includes('fetch') || err.code === 'ECONNREFUSED') {
      console.error('[ai-extract] Cannot reach AI model at', config.aiModelUrl)
      return c.json({
        detail: `Cannot reach AI model at ${config.aiModelUrl}. Is Ollama/vLLM running?`,
        hint:   'Start Ollama: ollama serve  |  then pull: ollama pull qwen2.5:32b',
      }, 503)
    }
    console.error('[ai-extract] Unexpected error:', err.message)
    return c.json({ detail: err.message ?? 'Internal error' }, 500)
  }
})

// ── GET /api/v1/ai-extract/status ─────────────────────────────────────────────
router.get('/status', async (c) => {
  const url  = c.req.query('model_url')  || config.aiModelUrl
  const name = c.req.query('model_name') || config.aiModelName
  const headers: Record<string, string> = {}
  if (config.aiApiKey) headers['Authorization'] = `Bearer ${config.aiApiKey}`
  try {
    const res  = await fetch(`${url.replace(/\/+$/, '')}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(3000),
    })
    const data = res.ok ? await res.json() as any : null
    // vLLM returns { object: "list", data: [{ id: "model-name", ... }] }
    const models: string[] = (data?.data ?? []).map((m: any) => m.id ?? m.name ?? m)
    const available = models.some(m => m === name || m.startsWith(name.split(':')[0]))
    return c.json({
      reachable: res.ok,
      target_model: name,
      model_available: available,
      models_on_server: models,
    })
  } catch {
    return c.json({ reachable: false, target_model: name, model_available: false, models_on_server: [] })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callModel(baseUrl: string, model: string, system: string, user: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.aiApiKey) headers['Authorization'] = `Bearer ${config.aiApiKey}`

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method:  'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
      temperature: 0.1,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Model API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const data    = await res.json() as any
  const content = data?.choices?.[0]?.message?.content ?? ''
  return content
}

function parseJSON(raw: string): Record<string, any> | null {
  const s = raw?.trim() ?? ''
  // Strip markdown fences if model wraps output
  const cleaned = s.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
  try { return JSON.parse(cleaned) } catch { /* fall through */ }
  // Try to find first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch { /* ignore */ } }
  return null
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text
}

function confidenceGate(classify: number, extract: number) {
  const min = Math.min(classify, extract)
  if (min >= 95) return { level: 'auto',    label: 'Auto-process',                color: 'green'  }
  if (min >= 90) return { level: 'warning', label: 'Auto-process + flag warning', color: 'yellow' }
  if (min >= 75) return { level: 'review',  label: 'Manual review required',      color: 'orange' }
  return             { level: 'reject',  label: 'Do not save — manual entry',  color: 'red'    }
}

export default router
