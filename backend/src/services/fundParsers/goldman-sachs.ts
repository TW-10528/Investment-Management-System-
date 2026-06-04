// Goldman Sachs — Vintage X (Flagship) Offshore SCSp parser

import type { ParsedFundNotice, InvestmentTarget } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(text: string, pattern: RegExp): number {
  const m = text.match(pattern)
  if (!m) return 0
  return parseFloat(m[1].replace(/[$,()]/g, '').trim()) || 0
}

// Parse "Month DD, YYYY" without timezone shift
function isoDate(raw: string): string {
  const m = raw.trim().match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/)
  if (!m) return new Date().toISOString().slice(0, 10)
  const months: Record<string, string> = {
    january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
    july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
  }
  const mo = months[m[1].toLowerCase()]
  return mo ? `${m[3]}-${mo}-${m[2].padStart(2, '0')}` : new Date().toISOString().slice(0, 10)
}

const MONTH_DATE = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/gi

function firstDate(text: string): string {
  const m = text.match(MONTH_DATE)
  if (!m) return new Date().toISOString().slice(0, 10)
  try { return new Date(m[0]).toISOString().slice(0, 10) } catch { return new Date().toISOString().slice(0, 10) }
}

// Extract project names — lines starting with "Project "
function extractProjects(text: string): InvestmentTarget[] {
  const projects: InvestmentTarget[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/Project\s+([A-Z][a-zA-Z]+)/g)) {
    const name = `Project ${m[1]}`
    if (!seen.has(name)) {
      seen.add(name)
      projects.push({ projectName: name })
    }
  }
  return projects
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseGoldmanSachs(text: string): ParsedFundNotice {
  let score = 0

  // ── Fund name ─────────────────────────────────────────────────────────────
  const fundNameMatch = text.match(/VINTAGE\s+X\s*\([^)]+\)\s*\w+\s+\w+/i)
    || text.match(/(Vintage X[^\n]*)/i)
  const fundName = fundNameMatch ? fundNameMatch[0].trim() : 'Goldman Sachs Vintage X'

  // ── Dates ─────────────────────────────────────────────────────────────────
  const dates = [...text.matchAll(MONTH_DATE)]
  const noticeDate = dates[0] ? isoDate(dates[0][0]) : new Date().toISOString().slice(0, 10)

  const dueDateMatch = text.match(/due\s+(?:\w+,\s+)?([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)
  const dueDate = dueDateMatch ? isoDate(dueDateMatch[1]) : noticeDate
  if (dueDateMatch) score++

  // ── Commitment ────────────────────────────────────────────────────────────
  // "Commitment:$20,000,000.00"
  const commitmentUsd = usd(text, /Commitment:\s*\$?([\d,]+\.?\d*)/)
  if (commitmentUsd > 0) score += 2

  // ── Gross call ────────────────────────────────────────────────────────────
  // "Gross Contribution$400,000.00" or "Amount$400,000.00"
  const grossCallUsd =
    usd(text, /Gross\s+Contribution\s*\$?([\d,]+\.?\d*)/) ||
    usd(text, /Amount\s*\$?([\d,]+\.?\d*)/)
  if (grossCallUsd > 0) score += 2

  // ── Cumulative called ──────────────────────────────────────────────────────
  // "Contributions to Date(400,000.00)" — shown as negative / parenthesised
  const totalCalledUsd = usd(text, /Contributions\s+to\s+Date\s*\(?([\d,]+\.?\d*)\)?/)
  if (totalCalledUsd > 0) score++

  // ── Unfunded ──────────────────────────────────────────────────────────────
  // "Outstanding Commitment$19,600,000.00"
  const unfundedUsd = usd(text, /Outstanding\s+Commitment\s*\$?([\d,]+\.?\d*)/)
  if (unfundedUsd > 0) score++

  // ── Call % ────────────────────────────────────────────────────────────────
  // Goldman Sachs doesn't typically state a % — derive it
  const callPct = commitmentUsd > 0 ? grossCallUsd / commitmentUsd : 0

  // ── Wire reference — skip the currency line, find "MG..." or investor reference
  const refMatch = text.match(/Reference:\s*(MG\w+[^\n]*)/i)
    || text.match(/Reference:\s*([A-Z]{2}\d+[^\n]*)/i)
  const wireReference = refMatch ? refMatch[1].trim() : null

  // ── Investment targets ────────────────────────────────────────────────────
  const investmentTargets = extractProjects(text)
  if (investmentTargets.length > 0) score++

  // ── Confidence ────────────────────────────────────────────────────────────
  // Max possible score = 8
  const confidence = Math.min(score / 8, 1)
  const confidenceGrade: 'high' | 'medium' | 'low' =
    confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low'

  return {
    fundKey:          'goldman-sachs',
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
    investmentTargets,
    confidence,
    confidenceGrade,
  }
}
