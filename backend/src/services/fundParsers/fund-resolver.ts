// Resolves a parsed fundKey to its single Fund record in the database.
// Each fundKey maps to ONE fund — multiple PDFs for the same fund all resolve here.

import { prisma } from '../../lib/prisma'

// ── Fund key → name search patterns ──────────────────────────────────────────
// Add the remaining 7 funds here when you provide their PDFs.
const FUND_NAME_PATTERNS: Record<string, string[]> = {
  'nb-real-estate': ['NB Real Estate Secondary Opportunities', 'NB Real Estate'],
  'hamilton-lane':  ['Hamilton Lane Secondary Fund'],
  'hamilton-strategic': ['Hamilton Lane Strategic Opportunities', 'Strategic Opportunities Fund IX'],
  'dover-street':   ['Dover Street XI', 'Dover Street'],
  'sdg-lps':        ['SDGs 投資事業有限責任組合', 'SDG'],
  'goldman-sachs':  ['Vintage X', 'Goldman Sachs'],
  'siguler-guff':   ['Siguler Guff'],
  'capula-grv':     ['Capula Global Relative Value Trust', 'Capula'],
}

// Set true once if this DB lacks the fund_key column (add_fund_key migration not
// applied), so resolveFund stops re-running — and re-logging — a query it knows fails.
let fundKeyColumnMissing = false

export interface ResolvedFund {
  id:           string
  fundName:     string
  commitmentUsd: number
}

function mapFund(fund: { id: string; fundName: string; commitmentUsd: any }): ResolvedFund {
  return { id: fund.id, fundName: fund.fundName, commitmentUsd: parseFloat(fund.commitmentUsd.toString()) }
}

/**
 * Find the Fund DB record for a given fundKey.
 * Step 1: direct lookup by the fund_key column (set when fund was created/migrated).
 * Step 2: legacy name-pattern fallback for any fund missing a fund_key.
 */
export async function resolveFund(fundKey: string): Promise<ResolvedFund | null> {
  // Direct DB lookup — O(1) when the fund_key column exists. Databases that haven't
  // applied the add_fund_key migration have no such column, so the query throws;
  // we note that once and skip it thereafter, falling through to name matching.
  if (!fundKeyColumnMissing) {
    try {
      const byKey = await prisma.fund.findFirst({
        where: { fundKey, isActive: true },
        select: { id: true, fundName: true, commitmentUsd: true },
      })
      if (byKey) return mapFund(byKey)
    } catch {
      fundKeyColumnMissing = true   // column absent — use the name fallback from now on
    }
  }

  // Legacy fallback: name-pattern matching for funds that predate the fund_key column
  const patterns = FUND_NAME_PATTERNS[fundKey]
  if (!patterns) return null
  for (const pattern of patterns) {
    const fund = await prisma.fund.findFirst({
      where: { fundName: { contains: pattern, mode: 'insensitive' }, isActive: true },
      select: { id: true, fundName: true, commitmentUsd: true },
    })
    if (fund) return mapFund(fund)
  }

  return null
}

/**
 * Live { fundKey, fundName }[] for active funds, for injecting into the AI prompt.
 * Uses the fund_key column when present; otherwise (column not migrated) derives
 * each key by matching the name-pattern map against active funds, so the list
 * still works without the column.
 */
export async function listKnownFunds(): Promise<{ fundKey: string; fundName: string }[]> {
  if (!fundKeyColumnMissing) {
    try {
      const rows = await prisma.fund.findMany({
        where: { isActive: true, fundKey: { not: null } },
        select: { fundKey: true, fundName: true },
      })
      return rows.map(r => ({ fundKey: r.fundKey!, fundName: r.fundName }))
    } catch {
      fundKeyColumnMissing = true
    }
  }

  const active = await prisma.fund.findMany({ where: { isActive: true }, select: { fundName: true } })
  const out: { fundKey: string; fundName: string }[] = []
  for (const [fundKey, patterns] of Object.entries(FUND_NAME_PATTERNS)) {
    const match = active.find(f => patterns.some(p => f.fundName.toLowerCase().includes(p.toLowerCase())))
    if (match) out.push({ fundKey, fundName: match.fundName })
  }
  return out
}
