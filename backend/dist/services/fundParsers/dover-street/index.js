"use strict";
// Dover Street XI Feeder Fund L.P. parser.
//
// Wraps the rich extractor (TypeScript port of `dover_street_xi_module.py`) and
// adapts it to the shared ParsedFundNotice the dispatcher + calculation engine expect.
//
// Notice types map to:
//   initial contribution            → 'capital_call'             (B only)
//   cash distribution               → 'distribution'             (C only)
//   capital call + deemed dist.     → 'capital_and_distribution' (B and C)
//
// The full rich report is attached as `fundReport` so the upload route can persist
// it and the frontend shows the breakdown / Excel fields / validation.
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDoverStreetReport = void 0;
exports.parseDoverStreet = parseDoverStreet;
const extractor_1 = require("./extractor");
Object.defineProperty(exports, "extractDoverStreetReport", { enumerable: true, get: function () { return extractor_1.extractDoverStreetReport; } });
function parseDoverStreet(rawText, previousState = null, fileName = '') {
    const report = (0, extractor_1.extractDoverStreetReport)(rawText, fileName, previousState);
    const f = report.final_excel_fields;
    const a = report.all_extracted_fields;
    const grossCallUsd = f.capital_contribution_amount || 0; // B
    const distributionUsd = f.distribution_amount_received || 0; // C
    const reinvestableUsd = f.reinvestable_amount || 0; // D (0 for Dover)
    const hasB = grossCallUsd !== 0;
    const hasC = distributionUsd !== 0;
    const noticeType = hasB && hasC ? 'capital_and_distribution'
        : hasC && !hasB ? 'distribution'
            : 'capital_call';
    const commitmentUsd = f.commitment_amount ?? 0;
    const totalCalledUsd = a.report_cumulative_capital_contributions ?? 0; // E (report cumulative)
    const unfundedUsd = f.remaining_commitment ?? (commitmentUsd > 0 ? commitmentUsd - totalCalledUsd : 0); // F
    const callPct = grossCallUsd > 0 && commitmentUsd > 0 ? Math.round((grossCallUsd / commitmentUsd) * 10000) / 100 : 0;
    const noticeDate = a.notice_date ?? new Date().toISOString().slice(0, 10);
    const dueDate = a.transaction_date ?? noticeDate;
    // ── Confidence scoring ────────────────────────────────────────────────────────
    let score = 0;
    if (report.document_type !== 'dover_street_xi_transaction_notice')
        score += 2;
    if (a.transaction_date)
        score += 2;
    if (commitmentUsd > 0)
        score += 2;
    if (hasB || hasC)
        score += 2;
    if (totalCalledUsd > 0)
        score++;
    const confidence = Math.min(score / 9, 1);
    const confidenceGrade = confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low';
    return {
        fundKey: 'dover-street',
        fundName: report.fund_name || 'Dover Street XI',
        fundManager: 'HarbourVest',
        noticeType,
        noticeDate,
        dueDate,
        grossCallUsd, // B
        distributionUsd, // C
        reinvestableUsd, // D
        managementFeeUsd: 0,
        taxExpenseUsd: a.initial_total_interest ?? 0, // initial-contribution interest (audit only)
        returnOfCapitalUsd: f.return_of_capital ?? 0,
        gainUsd: f.gain ?? 0,
        interestUsd: f.interest ?? f.interest_other ?? 0,
        commitmentUsd,
        totalCalledUsd,
        unfundedUsd,
        callPct,
        wireReference: null,
        investmentTargets: [],
        confidence,
        confidenceGrade,
        fundReport: report,
    };
}
//# sourceMappingURL=index.js.map