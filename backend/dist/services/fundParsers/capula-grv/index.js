"use strict";
// Capula Global Relative Value Trust — adapter: maps extractor output → ParsedFundNotice.
//
// Subscription notice:
//   B  grossCallUsd    = Net Capital Contribution
//   C  distributionUsd = 0
//   D  reinvestableUsd = 0
//
// Distribution notice:
//   B  grossCallUsd    = 0
//   C  distributionUsd = Distribution amount
//   D  reinvestableUsd = 0
//
// Capital Balance is NAV, not cumulative contribution — it is NOT used for E/F.
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCapulaGrvReport = void 0;
exports.parseCapulaGrv = parseCapulaGrv;
const extractor_1 = require("./extractor");
Object.defineProperty(exports, "extractCapulaGrvReport", { enumerable: true, get: function () { return extractor_1.extractCapulaGrvReport; } });
function parseCapulaGrv(rawText, previousState = null) {
    const report = (0, extractor_1.extractCapulaGrvReport)(rawText, '', previousState);
    const f = report.final_excel_fields;
    const a = report.all_extracted_fields;
    const grossCallUsd = f.capital_contribution_amount ?? 0;
    const distributionUsd = f.distribution_amount_received ?? 0;
    const reinvestableUsd = f.reinvestable_amount ?? 0;
    const commitmentUsd = f.commitment_amount ?? 0;
    const totalCalledUsd = f.cumulative_capital_contributions ?? 0;
    const unfundedUsd = f.remaining_commitment ?? 0;
    const noticeDate = a.notice_date ?? a.transaction_date ?? new Date().toISOString().slice(0, 10);
    const dueDate = a.transaction_date ?? noticeDate;
    const noticeType = a.is_distribution ? 'distribution' : 'capital_call';
    let score = 0;
    if (a.transaction_date)
        score += 2;
    if (grossCallUsd > 0 || distributionUsd > 0)
        score += 2;
    if (commitmentUsd > 0)
        score++;
    if (a.capital_balance != null)
        score++;
    const confidence = Math.min(score / 6, 1);
    const confidenceGrade = confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low';
    return {
        fundKey: 'capula-grv',
        fundName: report.fund_name,
        noticeType,
        noticeDate,
        dueDate,
        grossCallUsd,
        distributionUsd,
        reinvestableUsd,
        commitmentUsd,
        totalCalledUsd,
        unfundedUsd,
        callPct: 0,
        wireReference: null,
        investmentTargets: [],
        confidence,
        confidenceGrade,
    };
}
//# sourceMappingURL=index.js.map