// Deterministic extractor for the SDGs 投資事業有限責任組合 (SDG LPS) fund.
//
// Every SDG notice is the same fixed Japanese template (capital call or income
// distribution) from Astmax/AFM. The amounts sit behind fixed labels, so a regex
// reads them exactly — no LLM guessing at which of a dozen numbers is the answer.
// Returns null when the text is not an SDG notice, so parseFundPdf falls through
// to the generic AI extractor for the other funds.
//
// Amounts are JPY held as-is in the *Usd fields (this is a yen fund, no FX) —
// matches prisma/addSdgFund.ts.

import type { ParsedFundNotice } from './types'

// "123,456,789" / "123.456.789" / "59.527,840" → 123456789 (OCR swaps , and . in
// scanned faxes, so strip every non-digit and read the run as one integer).
function jpAmount(raw: string): number {
  return parseInt(raw.replace(/[^\d]/g, ''), 10) || 0
}

// First "YYYY年M月D日" after `idx` → "YYYY-MM-DD" (null if none).
function jpDateAfter(text: string, idx: number): string | null {
  const m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text.slice(idx))
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

// Amount immediately following a label, e.g. 払込み頂く金額\n\n45,765,318円.
// Skips up to 30 non-digit chars (newlines, "|", spaces) the OCR inserts between
// label and number, then grabs one number token (must end in a digit).
function amountAfter(text: string, label: string): number | null {
  const re = new RegExp(label + '[^\\d]{0,30}([\\d][\\d,.\\uFF0E\\uFF0C]*\\d)')
  const m = re.exec(text)
  return m ? jpAmount(m[1]) : null
}

// SDG_271022 / "SDG_080426 3.pdf" → 2022-10-27 (DDMMYY). This filename convention
// is the 実行日/value date and matched the Excel ledger exactly for all 8 notices —
// more reliable than the OCR'd 払込み期限 (which had year misreads like 2022→2020).
function dateFromFileName(fileName: string): string | null {
  const m = /SDG[_-]?(\d{2})(\d{2})(\d{2})/i.exec(fileName)
  if (!m) return null
  return `20${m[3]}-${m[2]}-${m[1]}`
}

const grade = (c: number): 'high' | 'medium' | 'low' =>
  c >= 0.65 ? 'high' : c >= 0.35 ? 'medium' : 'low'

/**
 * Parse an SDG notice. Returns null if `text` is not an SDG notice.
 */
export function extractSdgNotice(text: string, fileName = ''): ParsedFundNotice | null {
  const isSdg = /SDGs/i.test(text) && /投資事業有限責任組合/.test(text)
  if (!isSdg) return null

  const log: string[] = [`SDG deterministic extractor (filename: ${fileName || 'n/a'})`]

  const callAmount = amountAfter(text, '払込み頂く金額')
  const isCall = callAmount != null && callAmount > 0

  // Distributions are 収益分配 notices: "貴社への分配金額 36,037,560円".
  const distAmount = !isCall ? amountAfter(text, '分配金額') : null
  const isDist = distAmount != null && distAmount > 0

  const noticeType: ParsedFundNotice['noticeType'] = isDist ? 'distribution' : 'capital_call'

  // Unfunded commitment AFTER this call (Excel 投資余力 column); only the later
  // call notices carry this line.
  const unfundedAfter = amountAfter(text, '本出資後の出資未履行金額') ?? 0

  // Value/due date: filename first (proven exact), OCR'd due date as fallback.
  const fileDate = dateFromFileName(fileName)
  const labelIdx = text.search(/払込み期限|振込日/)
  const docDate = labelIdx >= 0 ? jpDateAfter(text, labelIdx) : null
  const dueDate = fileDate ?? docDate ?? new Date().toISOString().slice(0, 10)
  // Notice (letter) date: first date in the document, else the value date.
  const noticeDate = jpDateAfter(text, 0) ?? dueDate

  const amount = isDist ? distAmount! : (callAmount ?? 0)
  log.push(`Type: ${noticeType} | amount: ¥${amount.toLocaleString()}`)
  log.push(`Dates: notice=${noticeDate} due=${dueDate}${fileDate ? ' (from filename)' : ''}`)
  if (unfundedAfter) log.push(`Unfunded after: ¥${unfundedAfter.toLocaleString()}`)
  if (!amount) log.push('WARNING: no amount found behind 払込み頂く金額 / 分配金額 — needs manual review')

  const confidence = amount > 0 ? 0.9 : 0.3

  return {
    fundKey:  'sdg-lps',
    fundName: 'SDGs投資事業有限責任組合',
    noticeType,
    noticeDate,
    dueDate,
    grossCallUsd:    isDist ? 0 : amount,
    distributionUsd: isDist ? amount : 0,
    reinvestableUsd: 0,
    // Income distributions here are interest (Excel "Interest他" column).
    interestUsd:     isDist ? amount : undefined,
    commitmentUsd:   0,    // resolved from the fund record downstream
    totalCalledUsd:  0,
    unfundedUsd:     unfundedAfter,
    callPct:         0,
    wireReference:   null,
    investmentTargets: [],
    confidence,
    confidenceGrade: grade(confidence),
    extractionLog:   log,
    rawText:         text,
  }
}

// ponytail: one runnable check — `npx tsx src/services/fundParsers/sdgExtractor.ts`.
// Uses real OCR snippets (incl. the , / . confusion) against Excel ground truth.
function demo() {
  const cases: [string, string, Partial<ParsedFundNotice>][] = [
    ['SDG_021122 2.pdf',
      'SDGs 投資事業有限責任組合\n記\n払込み頂く金額\n\n541,576,404円\n払込み期限\n2020年11月3日',
      { noticeType: 'capital_call', grossCallUsd: 541576404, dueDate: '2022-11-02' }],
    ['SDG_270924 2.pdf',
      'SDGs投資事業有限責任組合\n払込み頂く金額 52,741,382円\n本出資後の出資未履行金額 1,261,114,618円',
      { noticeType: 'capital_call', grossCallUsd: 52741382, unfundedUsd: 1261114618, dueDate: '2024-09-27' }],
    ['SDG_261224 2.pdf',  // OCR comma/period confusion: "59.527,840"
      'SDGs 投資事業有限責任組合\n組合財産の分配\n貴社への分配金額59.527,840円は',
      { noticeType: 'distribution', distributionUsd: 59527840, dueDate: '2024-12-26' }],
    ['SDG_080426 3.pdf',  // OCR: "36.037.560"
      'SDGs 投資事業有限責任組合\n本収益分配\n貴社への分配金額36.037.560円は',
      { noticeType: 'distribution', distributionUsd: 36037560, dueDate: '2026-04-08' }],
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
      console.assert((r as any)[k] === v, `${file}: ${k} expected ${v}, got ${(r as any)?.[k]}`)
    }
    if (r) pass++
  }
  console.log(`sdgExtractor demo: ${pass}/${cases.length} cases passed`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('sdgExtractor.ts')) demo()
