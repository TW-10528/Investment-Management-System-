"use strict";
// Siguler Guff — adapter: maps extractor output → ParsedFundNotice.
//
//   B  grossCallUsd    = capital_contribution_amount (current call)
//   C  distributionUsd = 0  (capital call notices have no distribution)
//   D  reinvestableUsd = 0
//   E  totalCalledUsd  = cumulative_capital_contributions (inferred or previous_state)
//   F  unfundedUsd     = remaining_commitment (inferred or previous_state)
//
// Commitment and cumulative values are INFERRED from the call percentage because
// Siguler Guff notices do not print a standard commitment reconciliation table.
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSigulerGuffReport = void 0;
exports.parseSigulerGuff = parseSigulerGuff;
const extractor_1 = require("./extractor");
Object.defineProperty(exports, "extractSigulerGuffReport", { enumerable: true, get: function () { return extractor_1.extractSigulerGuffReport; } });
function parseSigulerGuff(rawText, previousState = null) {
    const report = (0, extractor_1.extractSigulerGuffReport)(rawText, '', previousState);
    const f = report.final_excel_fields;
    const a = report.all_extracted_fields;
    const grossCallUsd = f.capital_contribution_amount ?? 0;
    const distributionUsd = f.distribution_amount_received ?? 0;
    const reinvestableUsd = f.reinvestable_amount ?? 0;
    const commitmentUsd = f.commitment_amount ?? 0;
    const totalCalledUsd = f.cumulative_capital_contributions ?? 0;
    const unfundedUsd = f.remaining_commitment ?? (commitmentUsd > 0 ? commitmentUsd - totalCalledUsd : 0);
    // capital_call_percent is stored as e.g. 4.90 (percent) — convert to decimal fraction
    const callPct = (a.capital_call_percent ?? 0) / 100;
    const noticeDate = a.notice_date ?? new Date().toISOString().slice(0, 10);
    const dueDate = a.due_date ?? noticeDate;
    // ── Confidence scoring ────────────────────────────────────────────────────
    let score = 0;
    if (a.due_date)
        score += 2;
    if (a.capital_call_percent)
        score += 2;
    if (grossCallUsd > 0)
        score += 2;
    if (commitmentUsd > 0)
        score++;
    if (totalCalledUsd > 0)
        score++;
    const confidence = Math.min(score / 8, 1);
    const confidenceGrade = confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low';
    return {
        fundKey: 'siguler-guff',
        fundName: report.fund_name,
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
        investmentTargets: [],
        confidence,
        confidenceGrade,
    };
}
//# sourceMappingURL=index.js.map