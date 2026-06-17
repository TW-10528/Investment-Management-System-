// Deterministic extractor for the SDGs 投資事業有限責任組合 (SDG LPS) fund.
//
// Every SDG notice is the same fixed Japanese template (capital call or income
// distribution) from Astmax/AFM. The amounts sit behind fixed labels, so regex
// reads them exactly — no LLM guessing at which of a dozen numbers is the answer.
// Returns null when the text is not an SDG notice, so parseFundPdf falls through
// to the generic AI extractor for the other funds.
//
// Amounts are JPY held as-is in the *Usd fields (this is a yen fund, no FX) —
// matches prisma/addSdgFund.ts.
//
// Reference: backend/reference/sdg_lps_module.py and backend/reference/sdgExtractor.ts

import type { ParsedFundNotice } from './types'

// Strip every non-digit character and parse as integer.
// Handles OCR-swapped separators: "123,456,789" / "123.456.789" / "59.527,840"
// → 123456789 (all become the same integer once non-digits are stripped).
function jpAmount(raw: string): number {
  return parseInt(raw.replace(/[^\d]/g, ''), 10) || 0
}

// First "YYYY年M月D日" at or after `idx` in `text` → "YYYY-MM-DD" (null if none).
function jpDateAfter(text: string, idx: number): string | null {
  const m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text.slice(idx))
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

// Amount immediately following a fixed label, e.g. "払込み頂く金額\n\n45,765,318円".
// Allows up to 100 non-digit characters (newlines, "|", spaces, table borders)
// that PaddleOCR or a text layer may insert between the label and the number.
// The number must start AND end with a digit (prevents matching a lone "円").
function amountAfter(text: string, label: string): number | null {
  const re = new RegExp(label + '[^\\d]{0,100}([\\d][\\d,.\\uFF0E\\uFF0C]*\\d)')
  const m = re.exec(text)
  return m ? jpAmount(m[1]) : null
}

// SDG_271022 / "SDG_080426 3.pdf" → 2022-10-27 (DDMMYY). This filename
// convention is the 実行日/value date and matched the Excel ledger exactly for
// all known notices — more reliable than the OCR'd 払込み期限 (which had year
// misreads like 2022→2020 under Tesseract).
function dateFromFileName(fileName: string): string | null {
  const m = /SDG[_-]?(\d{2})(\d{2})(\d{2})/i.exec(fileName)
  if (!m) return null
  return `20${m[3]}-${m[2]}-${m[1]}`
}

const grade = (c: number): 'high' | 'medium' | 'low' =>
  c >= 0.65 ? 'high' : c >= 0.35 ? 'medium' : 'low'

/**
 * Parse an SDG notice. Returns null if `text` is not an SDG notice.
 *
 * Excel column mapping (all JPY, stored as-is in *Usd fields):
 *   B  grossCallUsd     = 払込み頂く金額                      (capital call notices)
 *   C  distributionUsd  = 分配金額 / 貴社への分配金額         (distribution notices)
 *   D  reinvestableUsd  = 0 (SDG distributions are all cash-out)
 *   current_transaction_cash_flow = -B + C
 */
export function extractSdgNotice(text: string, fileName = ''): ParsedFundNotice | null {
  // OCR produces many variants of the fund header "SDGｓ投資事業有限責任組合":
  //   PaddleOCR  → "SDGｓ投資…"    (fullwidth ｓ, U+FF53)
  //   Tesseract  → "SDG S投資…"    (uppercase S with space)
  //   text-layer → "SDGs投資…"     (ASCII s)
  //   some scans → "SDG投資…"      (ｓ dropped entirely)
  // We therefore accept any "SDG" (case-insensitive) adjacent to 投資事業有限責任組合,
  // or サード (Thirdwave investor name) near the same phrase as a fallback.
  const isSdg = (/SDG/i.test(text) || /サード/.test(text)) && /投資事業有限責任組合/.test(text)
  if (!isSdg) return null

  const log: string[] = [`SDG deterministic extractor (filename: ${fileName || 'n/a'})`]

  // ── Capital call amount ────────────────────────────────────────────────────
  // 払込み頂く金額 is the gross call wired OUT (Excel column B).
  const callAmount = amountAfter(text, '払込み頂く金額')
  const isCall = callAmount != null && callAmount > 0

  // ── Distribution amount ────────────────────────────────────────────────────
  // Distribution notices use "貴社への分配金額" or a shorter "分配金額" label.
  // When the label is not found directly, fall back to the largest yen amount
  // that appears near the word 分配 in the document (mirrors the Python module's
  // fallback pattern for scanned notices where PaddleOCR may split the label).
  let distAmount: number | null = null
  if (!isCall) {
    distAmount =
      amountAfter(text, '貴社への分配金額') ??
      amountAfter(text, '分配金額') ??
      (() => {
        // Fallback: "分配" anywhere within 300 chars before a yen amount.
        const m = /分配[\s\S]{0,300}?([0-9][0-9,.．，]*[0-9])\s*円/.exec(text)
        return m ? jpAmount(m[1]) : null
      })()
  }
  const isDist = distAmount != null && distAmount > 0

  const noticeType: ParsedFundNotice['noticeType'] = isDist ? 'distribution' : 'capital_call'

  // ── Unfunded commitment fields (from the call-notice table) ──────────────
  // 現在の出資未履行金額 = unfunded BEFORE this call  (pre-payment; informational)
  // 本出資後の出資未履行金額 = unfunded AFTER this call (post-payment; stored on notice)
  const currentUnfunded  = amountAfter(text, '現在の出資未履行金額')
  const unfundedAfter    = amountAfter(text, '本出資後の出資未履行金額')

  // When 本出資後 label isn't present (some early notices omit it), derive it as
  // current_unfunded - call_amount (mirrors Python module's fallback logic).
  const unfundedUsd = (() => {
    if (unfundedAfter != null) return unfundedAfter
    if (currentUnfunded != null && callAmount != null && currentUnfunded > callAmount) {
      return currentUnfunded - callAmount
    }
    return 0
  })()

  // ── Dates ─────────────────────────────────────────────────────────────────
  // Filename date is the 実行日/value date — proven exact against Excel for all
  // known notices. OCR'd due date is the fallback.
  const fileDate  = dateFromFileName(fileName)
  const labelIdx  = text.search(/払込み期限|振込日/)
  const docDate   = labelIdx >= 0 ? jpDateAfter(text, labelIdx) : null
  const dueDate   = fileDate ?? docDate ?? new Date().toISOString().slice(0, 10)
  // Notice (letter) date: first date in the document, else the value date.
  const noticeDate = jpDateAfter(text, 0) ?? dueDate

  // ── Logging ───────────────────────────────────────────────────────────────
  const amount = isDist ? distAmount! : (callAmount ?? 0)
  log.push(`Type: ${noticeType} | amount: ¥${amount.toLocaleString()}`)
  log.push(`Dates: notice=${noticeDate} due=${dueDate}${fileDate ? ' (from filename)' : ''}`)
  if (currentUnfunded) log.push(`Unfunded before call: ¥${currentUnfunded.toLocaleString()}`)
  if (unfundedAfter)   log.push(`Unfunded after call:  ¥${unfundedAfter.toLocaleString()}`)
  else if (unfundedUsd) log.push(`Unfunded after call:  ¥${unfundedUsd.toLocaleString()} (derived: current - call)`)
  if (!amount) log.push('WARNING: no amount found — needs manual review')

  const confidence = amount > 0 ? 0.9 : 0.3

  return {
    fundKey:             'sdg-lps',
    fundName:            'SDGs投資事業有限責任組合',
    noticeType,
    noticeDate,
    dueDate,
    // B — capital paid-in (JPY stored as-is, no FX; zero for distributions)
    grossCallUsd:        isDist ? 0 : amount,
    // C — capital received / distribution (JPY; zero for capital calls)
    distributionUsd:     isDist ? amount : 0,
    // D — reinvestable portion (SDG distributions are fully cash-out)
    reinvestableUsd:     0,
    // Income distributions are interest (Excel "Interest他" column).
    interestUsd:         isDist ? amount : undefined,
    commitmentUsd:       0,   // resolved from the fund record downstream
    totalCalledUsd:      0,
    // Remaining BEFORE this call (現在の出資未履行金額) — used for commitment change detection.
    currentUnfundedUsd:  currentUnfunded ?? 0,
    // Remaining commitment AFTER this call (本出資後の出資未履行金額 — 投資余力 column).
    unfundedUsd,
    callPct:             0,
    wireReference:       null,
    investmentTargets:   [],
    confidence,
    confidenceGrade:     grade(confidence),
    extractionLog:       log,
    rawText:             text,
  }
}

// ── Self-test ──────────────────────────────────────────────────────────────────
// Run: npx tsx src/services/fundParsers/sdgExtractor.ts
// Uses real OCR snippets (incl. the , / . confusion) against Excel ground truth.
function demo() {
  const cases: [string, string, Partial<ParsedFundNotice>][] = [
    ['SDG_021122 2.pdf',
      'SDGs 投資事業有限責任組合\n記\n払込み頂く金額\n\n541,576,404円\n払込み期限\n2020年11月3日',
      { noticeType: 'capital_call', grossCallUsd: 541576404, dueDate: '2022-11-02' }],
    ['SDG_270924 2.pdf',
      'SDGs投資事業有限責任組合\n払込み頂く金額 52,741,382円\n本出資後の出資未履行金額 1,261,114,618円',
      { noticeType: 'capital_call', grossCallUsd: 52741382, unfundedUsd: 1261114618, dueDate: '2024-09-27' }],
    ['SDG_261224 2.pdf',   // OCR comma/period confusion: "59.527,840"
      'SDGs 投資事業有限責任組合\n組合財産の分配\n貴社への分配金額59.527,840円は',
      { noticeType: 'distribution', distributionUsd: 59527840, dueDate: '2024-12-26' }],
    ['SDG_080426 3.pdf',   // OCR: "36.037.560"
      'SDGs 投資事業有限責任組合\n本収益分配\n貴社への分配金額36.037.560円は',
      { noticeType: 'distribution', distributionUsd: 36037560, dueDate: '2026-04-08' }],
    // Fallback dist pattern: "分配" near amount but label split by OCR
    ['SDG_261224 3.pdf',
      'SDGs 投資事業有限責任組合\n組合財産の分配\n金額59,527,840円',
      { noticeType: 'distribution', distributionUsd: 59527840 }],
    // Derived unfunded: current_unfunded present, 本出資後 absent
    ['SDG_271022 2.pdf',
      'SDGs 投資事業有限責任組合\n払込み頂く金額 45,765,318円\n現在の出資未履行金額 1,000,000,000円',
      { noticeType: 'capital_call', grossCallUsd: 45765318, unfundedUsd: 954234682 }],
    ['NB_capital_call.pdf', 'NB Real Estate Secondary Opportunities capital call $750,000', null as any],
  ]
  let pass = 0
  for (const [file, text, expect] of cases) {
    const r = extractSdgNotice(text, file)
    if (expect === null) {
      console.assert(r === null, `${file}: expected null (non-SDG), got ${r?.fundKey}`)
      if (r === null) pass++
      continue
    }
    console.assert(r !== null, `${file}: expected a result, got null`)
    for (const [k, v] of Object.entries(expect)) {
      const got = (r as any)?.[k]
      const ok  = got === v
      if (!ok) console.error(`  FAIL ${file}: ${k} expected ${v}, got ${got}`)
      else console.assert(ok, '')
    }
    if (r) pass++
  }
  console.log(`sdgExtractor demo: ${pass}/${cases.length} cases passed`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('sdgExtractor.ts')) demo()
