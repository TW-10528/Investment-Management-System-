// AI-powered fund notice extractor using Ollama (free, local LLM inference).
// Run `ollama pull llama3.2` (or set OLLAMA_MODEL) before uploading PDFs.
// If Ollama is unavailable the extractor returns a low-confidence fallback
// so the upload still lands as a pending notice the reviewer can fill in manually.

import ollama from 'ollama'
import type { ParsedFundNotice } from './types'

const OLLAMA_MODEL   = process.env.OLLAMA_MODEL   || 'llama3.2'
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10)

const KNOWN_FUND_KEYS = [
  'nb-real-estate',
  'hamilton-lane',
  'hamilton-strategic',
  'dover-street',
  'sdg-lps',
  'goldman-sachs',
  'siguler-guff',
  'capula-grv',
]

const VALID_NOTICE_TYPES = ['capital_call', 'distribution', 'capital_and_distribution', 'financial_statement']

// The {{FUND_KEYS}} placeholder is replaced at call time with the live DB fund list.
const BASE_SYSTEM_PROMPT = `You are a specialist in parsing LP (limited partner) fund notices for an investment management system. Extract financial fields from raw PDF text and return ONLY a valid JSON object — no markdown, no explanation.

FIELD MEANINGS:
- grossCallUsd: the actual capital contribution drawn from commitment (column B). Set 0 for distributions.
- distributionUsd: capital received BACK from the fund (column C). Set 0 for pure capital calls.
- reinvestableUsd: recallable/reinvestable subset of distributionUsd (column D).
- managementFeeUsd: fees/interest included in the wire total but NOT drawn from commitment (e.g. subsequent close interest, management fee).
- totalCalledUsd: cumulative capital contributed to the fund to date (column E, from reconciliation table).
- unfundedUsd: remaining unfunded commitment (column F, from reconciliation table).
- callPct: capital call as a decimal fraction of commitment (e.g. 0.049 for 4.9%).
- returnOfCapitalUsd, gainUsd, interestUsd: distribution breakdown components if present.

NOTICE TYPES:
- capital_call: LP pays money to the fund.
- distribution: Fund returns money to the LP.
- capital_and_distribution: Both happen simultaneously (combined notice).
- financial_statement: NAV/performance report — set grossCallUsd and distributionUsd to 0.

FUND KEYS (use one of these or "unknown"):
{{FUND_KEYS}}

CRITICAL — Transaction detail breakdown tables:
Many notices show a headline wire amount (e.g. "Capital Call Amount: $777,228") but also include a detail table that breaks this total into components. When a breakdown table is present, you MUST use the component amounts, not the headline total:
- "Capital call for investments" / "Capital contributions" / "Investment drawdown" → grossCallUsd
- "Subsequent close interest payable" / "True-up interest" / "Interest payable" / "Management fee" → managementFeeUsd
- The headline amount in the letter body (e.g. "please wire $777,228") is the TOTAL WIRE including fees — do NOT use it as grossCallUsd when a breakdown table exists.
- Cross-check: the "Amounts drawn" line in the commitment reconciliation table should equal your grossCallUsd.
- Example: Wire total $777,228 = Capital call $750,000 + Interest $27,228 → grossCallUsd=750000, managementFeeUsd=27228

RULES:
- All amounts in USD. For Japanese JPY fund (sdg-lps), look for FX rate in the document and convert; if no FX rate, leave as 0.
- Dates must be YYYY-MM-DD format.
- callPct as decimal (4.9% → 0.049).
- confidence: 0.0–1.0 reflecting how completely you found the key fields.
- Return 0 (not null) for numeric fields you could not find.
- wireReference: extract LP reference code, account reference, or wire instruction reference as a PLAIN STRING. null if absent. NEVER return an object.
- investmentTargets: list of investments/projects mentioned (may be empty array).

REQUIRED JSON STRUCTURE (return exactly this):
{
  "fundKey": string,
  "fundName": string,
  "noticeType": "capital_call" | "distribution" | "capital_and_distribution" | "financial_statement",
  "noticeDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "grossCallUsd": number,
  "distributionUsd": number,
  "reinvestableUsd": number,
  "managementFeeUsd": number,
  "commitmentUsd": number,
  "totalCalledUsd": number,
  "unfundedUsd": number,
  "callPct": number,
  "returnOfCapitalUsd": number,
  "gainUsd": number,
  "interestUsd": number,
  "wireReference": string | null,
  "investmentTargets": [{"projectName": string, "amountUsd": number, "sector": string}],
  "confidence": number
}`

// Truncate text to fit in context while preserving both the letter header
// (fund name, dates) and the wire/totals section at the bottom.
function truncateText(text: string, maxChars = 10000): string {
  if (text.length <= maxChars) return text
  const head = text.slice(0, 7000)
  const tail = text.slice(-3000)
  return `${head}\n\n[...middle truncated...]\n\n${tail}`
}

// Cross-check server-side: validate the structural completeness of extracted fields.
function computeServerConfidence(data: any): number {
  let score = 0
  if (data.fundKey && data.fundKey !== 'unknown') score += 0.25
  if (data.noticeDate && /^\d{4}-\d{2}-\d{2}$/.test(String(data.noticeDate))) score += 0.08
  if (data.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(data.dueDate))) score += 0.08

  const type = data.noticeType
  if (type === 'capital_call') {
    if (Number(data.grossCallUsd) > 0) score += 0.35
    if (Number(data.callPct) > 0)       score += 0.1
    if (data.wireReference)             score += 0.07
    if (Number(data.commitmentUsd) > 0) score += 0.07
  } else if (type === 'distribution') {
    if (Number(data.distributionUsd) > 0) score += 0.45
    if (Number(data.commitmentUsd) > 0)   score += 0.07
  } else if (type === 'capital_and_distribution') {
    if (Number(data.grossCallUsd) > 0 && Number(data.distributionUsd) > 0) score += 0.45
  } else if (type === 'financial_statement') {
    score += 0.2
  }
  return Math.min(score, 1.0)
}

function gradeConfidence(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.65) return 'high'
  if (c >= 0.35) return 'medium'
  return 'low'
}

// Safely coerce a value to a string that might be an object (AI sometimes returns
// structured objects for fields declared as string in the prompt).
function safeString(v: any): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'object') {
    // Try common keys an AI might use when it returns a structured object
    const candidate = v.reference ?? v.code ?? v.id ?? v.account ?? v.value ?? v.text ?? v.number ?? null
    return candidate != null ? String(candidate).trim() || null : null
  }
  return String(v).trim() || null
}

// Format a USD amount compactly for logging
function fmtLog(n: any): string {
  const v = Number(n ?? 0)
  if (!v) return '$0'
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function fallback(rawText?: string): ParsedFundNotice {
  return {
    fundKey: 'unknown', fundName: 'Unknown Fund',
    noticeType: 'capital_call',
    noticeDate: new Date().toISOString().slice(0, 10),
    dueDate:    new Date().toISOString().slice(0, 10),
    grossCallUsd: 0, distributionUsd: 0, reinvestableUsd: 0,
    commitmentUsd: 0, totalCalledUsd: 0, unfundedUsd: 0, callPct: 0,
    wireReference: null, investmentTargets: [],
    confidence: 0, confidenceGrade: 'low',
    extractionLog: ['Ollama unavailable — returned zero-confidence fallback. Fill in fields manually.'],
    rawText,
  }
}

export async function extractFundNoticeWithAI(
  text: string,
  fileName = '',
  knownFunds: { fundKey: string; fundName: string }[] = [],
): Promise<ParsedFundNotice> {
  const truncated = truncateText(text)
  const log: string[] = []
  const startMs = Date.now()

  // Build the fund-keys section dynamically from the live DB list, falling back
  // to the hardcoded list if no funds were passed (e.g. Ollama called directly).
  const fundsSection = knownFunds.length > 0
    ? knownFunds.map(f => `${f.fundKey} — "${f.fundName}"`).join('\n')
    : KNOWN_FUND_KEYS.join(', ')
  const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT.replace('{{FUND_KEYS}}', fundsSection)

  const isOcr = text.length < 200  // heuristic: very short embedded text likely means OCR was used
  log.push(`File: ${fileName}`)
  log.push(`Text: ${text.length.toLocaleString()} chars${truncated.length < text.length ? ' (truncated to 10k)' : ''}`)
  log.push(`Model: ${OLLAMA_MODEL} | Timeout: ${OLLAMA_TIMEOUT / 1000}s`)

  console.log(`\n[EXTRACT] ${'─'.repeat(60)}`)
  console.log(`[EXTRACT] File    : ${fileName}`)
  console.log(`[EXTRACT] Text    : ${text.length.toLocaleString()} chars${truncated.length < text.length ? ' (truncated)' : ''}`)
  console.log(`[EXTRACT] Model   : ${OLLAMA_MODEL}`)

  let raw: any
  try {
    const chatPromise = ollama.chat({
      model:   OLLAMA_MODEL,
      format:  'json',
      options: { temperature: 0, num_predict: 1024 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Extract fields from this fund notice PDF.\n\nFilename: ${fileName}\n\nDocument text:\n${truncated}` },
      ],
    })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Ollama timed out after ${OLLAMA_TIMEOUT}ms`)), OLLAMA_TIMEOUT)
    )

    const response = await Promise.race([chatPromise, timeoutPromise])
    raw = JSON.parse((response as any).message.content)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    log.push(`ERROR: Ollama failed — ${msg}`)
    console.error(`[EXTRACT] ERROR: Ollama failed — ${msg}`)
    console.error('[EXTRACT] Ensure Ollama is running: `ollama serve` and model is pulled: `ollama pull llama3.2`')
    return { ...fallback(text), extractionLog: log }
  }

  const elapsedMs = Date.now() - startMs

  // Log what the AI returned (raw, before normalisation)
  const aiConf = Number(raw.confidence ?? 0)
  log.push(`AI detected: fundKey=${raw.fundKey ?? '?'} | type=${raw.noticeType ?? '?'} | AI confidence=${(aiConf * 100).toFixed(0)}% | elapsed=${(elapsedMs / 1000).toFixed(1)}s`)
  log.push(`Amounts: gross=${fmtLog(raw.grossCallUsd)} · dist=${fmtLog(raw.distributionUsd)} · reinvestable=${fmtLog(raw.reinvestableUsd)}`)
  log.push(`Dates: notice=${raw.noticeDate ?? '?'} → due=${raw.dueDate ?? '?'}`)
  if (raw.wireReference != null) {
    const wireRaw = typeof raw.wireReference === 'object'
      ? `[object] ${JSON.stringify(raw.wireReference)}`
      : String(raw.wireReference)
    log.push(`Wire ref (raw): ${wireRaw}`)
  }
  if (Number(raw.callPct) > 0) log.push(`Call %: ${(Number(raw.callPct) * 100).toFixed(3)}%`)
  if (Array.isArray(raw.investmentTargets) && raw.investmentTargets.length > 0) {
    log.push(`Investment targets: ${raw.investmentTargets.length} found`)
  }

  console.log(`[EXTRACT] AI      : fundKey=${raw.fundKey} | type=${raw.noticeType} | conf=${(aiConf * 100).toFixed(0)}% | ${(elapsedMs / 1000).toFixed(1)}s`)
  console.log(`[EXTRACT] Amounts : gross=${fmtLog(raw.grossCallUsd)} · dist=${fmtLog(raw.distributionUsd)} · reinvest=${fmtLog(raw.reinvestableUsd)}`)
  console.log(`[EXTRACT] Dates   : notice=${raw.noticeDate} → due=${raw.dueDate}`)
  if (raw.wireReference != null) {
    console.log(`[EXTRACT] WireRef : ${typeof raw.wireReference === 'object' ? JSON.stringify(raw.wireReference) : raw.wireReference}`)
  }

  // Blend model-reported confidence (30%) with structural validation (70%)
  const serverConf = computeServerConfidence(raw)
  const modelConf  = Math.max(0, Math.min(1, aiConf))
  const blended    = modelConf * 0.3 + serverConf * 0.7
  const grade      = gradeConfidence(blended)

  log.push(`Confidence: model=${(modelConf * 100).toFixed(0)}% · server=${(serverConf * 100).toFixed(0)}% · blended=${(blended * 100).toFixed(0)}% → ${grade.toUpperCase()}`)
  console.log(`[EXTRACT] Conf    : model=${(modelConf * 100).toFixed(0)}% server=${(serverConf * 100).toFixed(0)}% blended=${(blended * 100).toFixed(0)}% → ${grade.toUpperCase()}`)

  const noticeType = VALID_NOTICE_TYPES.includes(raw.noticeType) ? raw.noticeType : 'capital_call'
  const fundKey    = KNOWN_FUND_KEYS.includes(raw.fundKey) ? raw.fundKey : 'unknown'

  if (fundKey !== raw.fundKey) {
    log.push(`Warning: AI returned unknown fundKey "${raw.fundKey}" → using "unknown"`)
    console.warn(`[EXTRACT] Unknown fundKey "${raw.fundKey}" from AI — stored as "unknown"`)
  }
  if (noticeType !== raw.noticeType) {
    log.push(`Warning: AI returned invalid noticeType "${raw.noticeType}" → using "capital_call"`)
    console.warn(`[EXTRACT] Invalid noticeType "${raw.noticeType}" from AI — defaulted to "capital_call"`)
  }

  // Sanitise wireReference — the AI sometimes returns an object instead of a string
  const wireRef = safeString(raw.wireReference)
  if (wireRef !== raw.wireReference && raw.wireReference != null) {
    log.push(`Note: wireReference was non-string — sanitised to: ${wireRef ?? 'null'}`)
    console.warn(`[EXTRACT] wireReference was ${typeof raw.wireReference} — sanitised to "${wireRef}"`)
  }

  console.log(`[EXTRACT] Final   : fundKey=${fundKey} | noticeType=${noticeType} | wireRef=${wireRef ?? 'null'}`)
  console.log(`[EXTRACT] ${'─'.repeat(60)}\n`)

  return {
    fundKey,
    fundName:         String(raw.fundName ?? 'Unknown Fund'),
    noticeType:       noticeType as ParsedFundNotice['noticeType'],
    noticeDate:       String(raw.noticeDate ?? new Date().toISOString().slice(0, 10)),
    dueDate:          String(raw.dueDate ?? new Date().toISOString().slice(0, 10)),
    grossCallUsd:     Number(raw.grossCallUsd ?? 0),
    distributionUsd:  Number(raw.distributionUsd ?? 0),
    reinvestableUsd:  Number(raw.reinvestableUsd ?? 0),
    managementFeeUsd: raw.managementFeeUsd != null ? Number(raw.managementFeeUsd) : undefined,
    commitmentUsd:    Number(raw.commitmentUsd ?? 0),
    totalCalledUsd:   Number(raw.totalCalledUsd ?? 0),
    unfundedUsd:      Number(raw.unfundedUsd ?? 0),
    callPct:          Number(raw.callPct ?? 0),
    returnOfCapitalUsd: raw.returnOfCapitalUsd != null ? Number(raw.returnOfCapitalUsd) : undefined,
    gainUsd:            raw.gainUsd   != null ? Number(raw.gainUsd) : undefined,
    interestUsd:        raw.interestUsd != null ? Number(raw.interestUsd) : undefined,
    wireReference:    wireRef,
    investmentTargets: (Array.isArray(raw.investmentTargets) ? raw.investmentTargets : []).map((t: any) => ({
      projectName: String(t.projectName ?? ''),
      amountUsd:   t.amountUsd != null ? Number(t.amountUsd) : undefined,
      sector:      t.sector != null ? String(t.sector) : undefined,
    })),
    confidence:      blended,
    confidenceGrade: grade,
    extractionLog:   log,
    rawText:         text,
  }
}
