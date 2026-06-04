// Resolves a parsed fundKey to its single Fund record in the database.
// Each fundKey maps to ONE fund — multiple PDFs for the same fund all resolve here.

import { prisma } from '../../lib/prisma'

// ── Fund key → name search patterns ──────────────────────────────────────────
// Add the remaining 7 funds here when you provide their PDFs.
const FUND_NAME_PATTERNS: Record<string, string[]> = {
  'goldman-sachs':  ['Vintage X', 'Goldman Sachs'],
  'siguler-guff':   ['Siguler Guff'],
  'nb-real-estate': ['NB Real Estate Secondary Opportunities', 'NB Real Estate'],
  // 'blackstone':    ['Blackstone'],
  // 'kkr':           ['KKR'],
}

export interface ResolvedFund {
  id:           string
  fundName:     string
  commitmentUsd: number
}

/**
 * Find the Fund DB record for a given fundKey.
 * Searches by fund name (case-insensitive) using the patterns above.
 * Returns null if no matching fund exists in the DB yet.
 */
export async function resolveFund(fundKey: string): Promise<ResolvedFund | null> {
  const patterns = FUND_NAME_PATTERNS[fundKey]
  if (!patterns) return null

  for (const pattern of patterns) {
    const fund = await prisma.fund.findFirst({
      where: {
        fundName: { contains: pattern, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true, fundName: true, commitmentUsd: true },
    })
    if (fund) {
      return {
        id:           fund.id,
        fundName:     fund.fundName,
        commitmentUsd: parseFloat(fund.commitmentUsd.toString()),
      }
    }
  }

  return null
}
