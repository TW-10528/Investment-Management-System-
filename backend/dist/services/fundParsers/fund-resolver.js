"use strict";
// Resolves a parsed fundKey to its single Fund record in the database.
// Each fundKey maps to ONE fund — multiple PDFs for the same fund all resolve here.
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFund = resolveFund;
const prisma_1 = require("../../lib/prisma");
// ── Fund key → name search patterns ──────────────────────────────────────────
// Patterns match against fund names in the database (case-insensitive)
const FUND_NAME_PATTERNS = {
    'nb-real-estate': ['Real Estate Secondary Opportunities Fund II', 'NB Real Estate'],
    'hamilton-lane': ['Secondary Fund VI-B'],
    'hamilton-strategic': ['Strategic Opportunities Fund IX'],
    'dover-street': ['Dover Street XI', 'Dover Street XII', 'Dover Street'],
    'sdg-lps': ['SDGs投資事業有限責任組合', 'SDG'],
    'goldman-sachs': ['Vintage X(Flagship)', 'Vintage X'],
    'siguler-guff': ['Small Buyout Opportunities Fund VI'],
    'capula-grv': ['Capula Global Relative Fund', 'Capula'],
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