"use strict";
// NB Real Estate Secondary Opportunities (Offshore) Fund II LP parser.
// (Neuberger Berman / NB Alternatives Advisers LLC)
//
// Wraps the rich extractor (TypeScript port of `nb_realestate_module_updated.py`)
// and adapts it to the shared ParsedFundNotice the dispatcher + calculation engine
// expect. A single Drawdown Notice is a COMBINED capital call + deemed distribution
// (sometimes + management fee), all on ONE ledger row:
//   B  grossCallUsd    = capital_contribution_amount (LP share + net management fee)
//   C  distributionUsd = distribution_amount_received (deemed distribution)
//   D  reinvestableUsd = reinvestable_amount (proceeds are "subject to reinvestment")
//   G  cash flow       = -B + C   (tax & amount-due are NOT part of cash flow)
//
// The whole rich report is also attached as `nbReport` so the upload route can
// persist it on Notice.extractedData and the frontend can show the breakdown,
// the calculated Excel fields, and the validation checks.
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractNbRealestateReport = void 0;
exports.parseNbRealEstate = parseNbRealEstate;
const extractor_1 = require("./extractor");
Object.defineProperty(exports, "extractNbRealestateReport", { enumerable: true, get: function () { return extractor_1.extractNbRealestateReport; } });
function parseNbRealEstate(rawText, previousState = null) {
    const report = (0, extractor_1.extractNbRealestateReport)(rawText, '', previousState);
    const f = report.final_excel_fields;
    const a = report.all_extracted_fields;
    const grossCallUsd = f.capital_contribution_amount || 0; // B
    const distributionUsd = f.distribution_amount_received || 0; // C
    const reinvestableUsd = f.reinvestable_amount || 0; // D
    const commitmentUsd = f.commitment_amount ?? 0;
    const totalCalledUsd = a.inception_to_date_contributions ?? 0; // E (report cumulative)
    const unfundedUsd = f.remaining_commitment ?? (commitmentUsd > 0 ? commitmentUsd - totalCalledUsd : 0); // F
    const callPct = a.percent_of_capital_commitment_called ?? 0; // e.g. 5.00 → "5.00%"
    const noticeDate = a.notice_date ?? new Date().toISOString().slice(0, 10);
    const dueDate = a.payment_date ?? noticeDate;
    // ── Confidence scoring (mirrors the previous parser's heuristic) ──────────────
    let score = 0;
    if (a.payment_date)
        score += 2;
    if (commitmentUsd > 0)
        score += 2;
    if (grossCallUsd > 0)
        score += 2;
    if (distributionUsd > 0)
        score++;
    if (totalCalledUsd > 0)
        score++;
    if (callPct > 0)
        score++;
    const confidence = Math.min(score / 9, 1);
    const confidenceGrade = confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low';
    return {
        fundKey: 'nb-real-estate',
        fundName: report.fund_name,
        noticeType: 'capital_call', // combined call + distribution ride on one row
        noticeDate,
        dueDate,
        grossCallUsd, // B
        distributionUsd, // C
        reinvestableUsd, // D
        managementFeeUsd: a.net_management_fee || 0,
        taxExpenseUsd: a.tax_expense || 0,
        returnOfCapitalUsd: f.return_of_capital ?? 0,
        gainUsd: f.gain ?? 0,
        interestUsd: f.interest ?? 0,
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