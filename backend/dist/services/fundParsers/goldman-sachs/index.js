"use strict";
// Goldman Sachs — adapter: maps extractor output → ParsedFundNotice.
//
//   B  grossCallUsd    = capital_contribution_amount (Gross Contribution)
//   C  distributionUsd = 0  (capital contribution notices have no distribution)
//   D  reinvestableUsd = 0
//   E  totalCalledUsd  = contributions_to_date (from report or previous_state)
//   F  unfundedUsd     = outstanding_commitment (from report or previous_state)
//
// Commitment = Commitment field or Total Commitment (both tried).
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGoldmanVintageXReport = void 0;
exports.parseGoldmanSachs = parseGoldmanSachs;
const extractor_1 = require("./extractor");
Object.defineProperty(exports, "extractGoldmanVintageXReport", { enumerable: true, get: function () { return extractor_1.extractGoldmanVintageXReport; } });
function parseGoldmanSachs(rawText, previousState = null) {
    const report = (0, extractor_1.extractGoldmanVintageXReport)(rawText, '', previousState);
    const f = report.final_excel_fields;
    const a = report.all_extracted_fields;
    const grossCallUsd = f.capital_contribution_amount ?? 0;
    const distributionUsd = f.distribution_amount_received ?? 0;
    const reinvestableUsd = f.reinvestable_amount ?? 0;
    const commitmentUsd = f.commitment_amount ?? 0;
    const totalCalledUsd = f.cumulative_capital_contributions ?? 0;
    const unfundedUsd = f.remaining_commitment ?? (commitmentUsd > 0 ? commitmentUsd - totalCalledUsd : 0);
    // callPct derived: Gross Contribution / Commitment (same as original parser)
    const callPct = commitmentUsd > 0 ? grossCallUsd / commitmentUsd : 0;
    const noticeDate = a.notice_date ?? new Date().toISOString().slice(0, 10);
    const dueDate = a.due_date ?? noticeDate;
    // ── Investment targets — extract "Project X" mentions ─────────────────────
    const investmentTargets = [];
    const seen = new Set();
    for (const m of rawText.matchAll(/Project\s+([A-Z][a-zA-Z]+)/g)) {
        const name = `Project ${m[1]}`;
        if (!seen.has(name)) {
            seen.add(name);
            investmentTargets.push({ projectName: name });
        }
    }
    // ── Confidence scoring ────────────────────────────────────────────────────
    let score = 0;
    if (a.due_date)
        score++;
    if (commitmentUsd > 0)
        score += 2;
    if (grossCallUsd > 0)
        score += 2;
    if (totalCalledUsd > 0)
        score++;
    if (unfundedUsd > 0)
        score++;
    if (investmentTargets.length)
        score++;
    const confidence = Math.min(score / 8, 1);
    const confidenceGrade = confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low';
    return {
        fundKey: 'goldman-sachs',
        fundName: 'Vintage X(Flagship)',
        fundManager: 'Goldman Sachs',
        noticeType: 'capital_call',
        noticeDate,
        dueDate,
        grossCallUsd,
        distributionUsd,
        reinvestableUsd,
        commitmentUsd,
        totalCalledUsd,
        unfundedUsd,
        callPct,
        wireReference: a.reference ?? null,
        investmentTargets,
        confidence,
        confidenceGrade,
    };
}
//# sourceMappingURL=index.js.map