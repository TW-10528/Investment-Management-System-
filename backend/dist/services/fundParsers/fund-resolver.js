"use strict";
// Resolves a parsed fundKey to its single Fund record in the database.
// Each fundKey maps to ONE fund — multiple PDFs for the same fund all resolve here.
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFund = resolveFund;
const prisma_1 = require("../../lib/prisma");
// ── Fund key → name search patterns ──────────────────────────────────────────
// Add the remaining 7 funds here when you provide their PDFs.
const FUND_NAME_PATTERNS = {
    'nb-real-estate': ['NB Real Estate Secondary Opportunities', 'NB Real Estate'],
    'hamilton-lane': ['Hamilton Lane Secondary Fund'],
    'hamilton-strategic': ['Hamilton Lane Strategic Opportunities', 'Strategic Opportunities Fund IX'],
    'dover-street': ['Dover Street XI', 'Dover Street'],
    'sdg-lps': ['SDGs 投資事業有限責任組合', 'SDG'],
    'goldman-sachs': ['Vintage X', 'Goldman Sachs'],
    'siguler-guff': ['Siguler Guff'],
    'capula-grv': ['Capula Global Relative Value Trust', 'Capula'],
};
/**
 * Find the Fund DB record for a given fundKey.
 * Searches by fund name (case-insensitive) using the patterns above.
 * Returns null if no matching fund exists in the DB yet.
 */
async function resolveFund(fundKey) {
    const patterns = FUND_NAME_PATTERNS[fundKey];
    if (!patterns)
        return null;
    for (const pattern of patterns) {
        const fund = await prisma_1.prisma.fund.findFirst({
            where: {
                fundName: { contains: pattern, mode: 'insensitive' },
                isActive: true,
            },
            select: { id: true, fundName: true, commitmentUsd: true },
        });
        if (fund) {
            return {
                id: fund.id,
                fundName: fund.fundName,
                commitmentUsd: parseFloat(fund.commitmentUsd.toString()),
            };
        }
    }
    return null;
}
//# sourceMappingURL=fund-resolver.js.map