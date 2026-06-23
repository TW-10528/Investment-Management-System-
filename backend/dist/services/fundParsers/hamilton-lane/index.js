"use strict";
// Hamilton Lane Secondary Fund VI-B LP parser.
//
// Wraps the rich extractor (TypeScript port of
// `hamilton_secondary_trueup_capital_call_module.py`) and adapts it to the shared
// ParsedFundNotice the dispatcher + calculation engine expect.
//
// Hamilton notices are EITHER a capital call OR a distribution (unlike NB's
// combined row). The noticeType is derived from the document type:
//   capital_call_notice  → noticeType 'capital_call', B = capital_contribution_amount
//   distribution_notice  → noticeType 'distribution', C = distribution_amount_received,
//                                                       D = reinvestable_amount
//
// The full rich report is attached as `fundReport` so the upload route can persist
// it on Notice.extractedData and the frontend can show the breakdown / Excel fields /
// validation (same panel NB Real Estate uses).
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractHamiltonReport = void 0;
exports.parseHamiltonLane = parseHamiltonLane;
const extractor_1 = require("./extractor");
Object.defineProperty(exports, "extractHamiltonReport", { enumerable: true, get: function () { return extractor_1.extractHamiltonReport; } });
function parseHamiltonLane(rawText, previousState = null) {
    const report = (0, extractor_1.extractHamiltonReport)(rawText, '', previousState);
    const f = report.final_excel_fields;
    const a = report.all_extracted_fields;
    const isDistribution = report.document_type === 'distribution_notice';
    const noticeType = isDistribution ? 'distribution' : 'capital_call';
    const grossCallUsd = f.capital_contribution_amount || 0; // B
    const distributionUsd = f.distribution_amount_received || 0; // C
    const reinvestableUsd = f.reinvestable_amount || 0; // D
    const commitmentUsd = f.commitment_amount ?? 0;
    const totalCalledUsd = a.amounts_drawn ?? 0; // E (report cumulative)
    const unfundedUsd = f.remaining_commitment ?? (commitmentUsd > 0 ? commitmentUsd - totalCalledUsd : 0); // F
    // Hamilton notices don't state a call %; derive it for capital calls (display only).
    const callPct = !isDistribution && commitmentUsd > 0 ? Math.round((grossCallUsd / commitmentUsd) * 10000) / 100 : 0;
    const noticeDate = a.notice_date ?? new Date().toISOString().slice(0, 10);
    const dueDate = a.transaction_date ?? a.capital_call_due_date ?? a.distribution_due_date ?? noticeDate;
    // ── Confidence scoring ────────────────────────────────────────────────────────
    let score = 0;
    if (report.document_type !== 'unknown_notice')
        score += 2;
    if (a.transaction_date)
        score += 2;
    if (commitmentUsd > 0)
        score += 2;
    if (grossCallUsd > 0 || distributionUsd > 0)
        score += 2;
    if (totalCalledUsd > 0)
        score++;
    const confidence = Math.min(score / 9, 1);
    const confidenceGrade = confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low';
    return {
        fundKey: 'hamilton-lane',
        fundName: report.fund_name,
        noticeType,
        noticeDate,
        dueDate,
        grossCallUsd, // B
        distributionUsd, // C
        reinvestableUsd, // D
        managementFeeUsd: a.capital_call_for_management_fees ?? 0,
        taxExpenseUsd: a.capital_call_for_expenses ?? 0,
        returnOfCapitalUsd: f.return_of_capital ?? 0,
        gainUsd: f.gain ?? 0,
        interestUsd: f.interest_other ?? 0,
        commitmentUsd,
        totalCalledUsd,
        unfundedUsd,
        callPct,
        wireReference: a.reference ?? null,
        investmentTargets: [],
        confidence,
        confidenceGrade,
        fundReport: report,
    };
}
//# sourceMappingURL=index.js.map