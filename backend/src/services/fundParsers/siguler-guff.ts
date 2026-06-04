// Siguler Guff — Small Buyout Opportunities Fund VI (F), LP parser

import type { ParsedFundNotice } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(text: string, pattern: RegExp): number {
  const m = text.match(pattern)
  if (!m) return 0
  return parseFloat(m[1].replace(/[$,]/g, '').trim()) || 0
}

function pct(text: string, pattern: RegExp): number {
  const m = text.match(pattern)
  if (!m) return 0
  return parseFloat(m[1].replace(/%/g, '').trim()) / 100 || 0
}

function isoDate(raw: string): string {
  // "Month DD, YYYY"
  const m = raw.trim().match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/)
  if (m) {
    const months: Record<string, string> = {
      january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
      july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
    }
    const mo = months[m[1].toLowerCase()]
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`
  }
  // "M/D/YYYY"
  const d = raw.trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (d) return `${d[3]}-${d[1].padStart(2,'0')}-${d[2].padStart(2,'0')}`
  return new Date().toISOString().slice(0, 10)
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseSigulerGuff(text: string): ParsedFundNotice {
  let score = 0

  // ── Fund name ─────────────────────────────────────────────────────────────
  const fundNameMatch = text.match(/Siguler\s+Guff[^,\n]+(Fund\s+\w+[^,\n]*)/i)
  const fundName = fundNameMatch
    ? `Siguler Guff ${fundNameMatch[1].trim()}`
    : 'Siguler Guff Small Buyout Opportunities Fund VI (F), LP'

  // ── Notice date — "January 6, 2026" (date of the letter) ─────────────────
  const noticeDateMatch = text.match(/^([A-Za-z]+\s+\d{1,2},\s+\d{4})/m)
    || text.match(/Send\s+Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  const noticeDate = noticeDateMatch ? isoDate(noticeDateMatch[1]) : new Date().toISOString().slice(0, 10)
  if (noticeDateMatch) score++

  // ── Due date — "due no later than January 13, 2026" ───────────────────────
  const dueDateMatch = text.match(/due\s+no\s+later\s+than\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)
    || text.match(/EndDate:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  const dueDate = dueDateMatch ? isoDate(dueDateMatch[1]) : noticeDate
  if (dueDateMatch) score += 2

  // ── Call % — "capital call equal to 4.90% of commitments" ────────────────
  const callPct = pct(text, /capital\s+call\s+equal\s+to\s+([\d.]+%?)/)
    || pct(text, /calling\s+([\d.]+%?)\s+of\s+commitment/i)
  if (callPct > 0) score += 2

  // ── LP share (net call) — "Your share of this capital call is $49,000.00" ─
  const grossCallUsd = usd(text, /Your\s+share\s+of\s+this\s+capital\s+call\s+is\s*\$?([\d,]+\.?\d*)/i)
    || usd(text, /capital\s+call\s+is\s*\$?([\d,]+\.?\d*)/i)
  if (grossCallUsd > 0) score += 2

  // ── Commitment — derive from callPct and grossCallUsd ────────────────────
  // Siguler Guff PDFs don't always state total commitment; derive it
  const commitmentUsd = callPct > 0 && grossCallUsd > 0
    ? Math.round(grossCallUsd / callPct)
    : 0
  if (commitmentUsd > 0) score++

  // ── Cumulative called (SG PDFs don't always show this — leave 0) ──────────
  const totalCalledUsd = 0
  const unfundedUsd = commitmentUsd > 0
    ? commitmentUsd - (totalCalledUsd + grossCallUsd)
    : 0

  // ── Wire reference ─────────────────────────────────────────────────────────
  const refMatch = text.match(/Reference:\s*([^\n]+)/i)
  const wireReference = refMatch ? refMatch[1].trim() : null

  // ── Confidence ────────────────────────────────────────────────────────────
  const confidence = Math.min(score / 8, 1)
  const confidenceGrade: 'high' | 'medium' | 'low' =
    confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low'

  return {
    fundKey:          'siguler-guff',
    fundName,
    noticeType:       'capital_call',
    noticeDate,
    dueDate,
    grossCallUsd,
    distributionUsd:  0,
    reinvestableUsd:  0,
    commitmentUsd,
    totalCalledUsd,
    unfundedUsd,
    callPct,
    wireReference,
    investmentTargets: [],
    confidence,
    confidenceGrade,
  }
}
