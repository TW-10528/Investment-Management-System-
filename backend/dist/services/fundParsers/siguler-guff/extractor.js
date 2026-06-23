"use strict";
// Siguler Guff Small Buyout Opportunities Fund VI (F), LP — extraction module.
// TypeScript port of siguler_guff_capital_call_module_v2.py
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeText = normalizeText;
exports.extractSigulerGuffReport = extractSigulerGuffReport;
// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NUM = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function cleanAmount(value, absolute = false) {
    if (value == null)
        return null;
    let v = value.trim();
    if (['-', '$-', '$ -', '—'].includes(v))
        return 0;
    let negative = false;
    if (v.startsWith('(') && v.endsWith(')')) {
        negative = true;
        v = v.slice(1, -1);
    }
    v = v.replace(/\$/g, '').replace(/,/g, '').replace(/%/g, '').replace(/\s/g, '');
    if (v === '' || v === '-')
        return 0;
    const n = parseFloat(v);
    if (Number.isNaN(n))
        return null;
    let amount = negative ? -n : n;
    if (absolute)
        amount = Math.abs(amount);
    return amount;
}
function amountOrZero(value) {
    return value != null ? Number(value) : 0;
}
function normalizeDate(s) {
    if (!s)
        return null;
    s = s.trim();
    let m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (m) {
        const mo = MONTH_NUM[m[1].toLowerCase().slice(0, 3)];
        if (mo)
            return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`;
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m)
        return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))
        return s;
    return s;
}
function normalizeText(text) {
    return text
        .replace(/\xa0/g, ' ')
        .replace(/​/g, '')
        .replace(/[ \t]+/g, ' ');
}
function findFirstDate(text) {
    const m = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/);
    return m ? normalizeDate(m[1]) : null;
}
function findDueDate(text) {
    // "due no later than April 17, 2026"
    let m = text.match(/due\s+no\s+later\s+than\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
    if (m)
        return normalizeDate(m[1]);
    // "EndDate:4/17/2026"
    m = text.match(/EndDate\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (m)
        return normalizeDate(m[1]);
    return null;
}
function detectCurrency(text) {
    if (text.includes('$'))
        return 'USD';
    if (text.includes('¥') || /JPY/i.test(text))
        return 'JPY';
    return 'unknown';
}
function findCompanyName(text) {
    let m = text.match(/Re:\s*([^\n]+)/i);
    if (m)
        return m[1].trim().split(/\s+/).join(' ');
    m = text.match(/\n\s*(Thirdwave\s+\w+)\s*\n/i);
    if (m)
        return m[1].trim();
    return null;
}
function detectFundName(text) {
    const m = text.match(/Siguler\s+Guff\s+Small\s+Buyout\s+Opportunities\s+Fund\s+VI\s+\(F\),\s+LP/i);
    return m ? m[0].trim() : 'Siguler Guff Small Buyout Opportunities Fund VI (F), LP';
}
// ── Extraction ─────────────────────────────────────────────────────────────────
function extractAllFields(text) {
    const noticeDate = findFirstDate(text);
    const dueDate = findDueDate(text);
    const reportTypeM = text.match(/Report\s+Type:\s*([A-Z]+)/i);
    const reportType = reportTypeM ? reportTypeM[1].trim() : null;
    // "capital call equal to 3.30% of commitments" or "initial capital call equal to 4.90% of commitments"
    const pctM = text.match(/(?:initial\s+)?capital\s+call\s+equal\s+to\s+([\d.]+)%/i);
    const capitalCallPercent = pctM ? cleanAmount(pctM[1], true) : null;
    // "Your share of this capital call is $33,000.00"
    const amtM = text.match(/Your\s+share\s+of\s+this\s+capital\s+call\s+is\s+\$?\s*([\d,]+(?:\.\d+)?)/i);
    const capitalCallAmount = amtM ? cleanAmount(amtM[1], true) : null;
    // "After this call you will have funded 18.10% of your commitment."
    const fundedM = text.match(/After\s+this\s+call\s+you\s+will\s+have\s+funded\s+([\d.]+)%/i);
    const fundedAfterCallPercent = fundedM ? cleanAmount(fundedM[1], true) : null;
    // Infer commitment = call amount / (call percent / 100)
    let inferredCommitmentAmount = null;
    if (capitalCallAmount != null && capitalCallPercent) {
        inferredCommitmentAmount = round2(capitalCallAmount / (capitalCallPercent / 100));
    }
    // Inferred cumulative after call
    let inferredCumulativeAfterCall = null;
    if (inferredCommitmentAmount != null && fundedAfterCallPercent != null) {
        inferredCumulativeAfterCall = round2(inferredCommitmentAmount * (fundedAfterCallPercent / 100));
    }
    else if (capitalCallAmount != null) {
        // For initial calls, funded-after-call is not printed — use current call as cumulative
        inferredCumulativeAfterCall = capitalCallAmount;
    }
    // Inferred remaining = commitment - cumulative
    let inferredRemainingAfterCall = null;
    if (inferredCommitmentAmount != null && inferredCumulativeAfterCall != null) {
        inferredRemainingAfterCall = round2(inferredCommitmentAmount - inferredCumulativeAfterCall);
    }
    const bankM = text.match(/Beneficiary\s+Bank:\s*([^\n]+)/i);
    const swiftM = text.match(/SWIFT:\s*([A-Za-z0-9]+)/i);
    const abaM = text.match(/ABA\s*No:\s*([0-9]+)/i);
    const acctNameM = text.match(/Account\s+Name:\s*([^\n]+)/i);
    const acctNumM = text.match(/Account\s+Number:\s*([0-9]+)/i);
    const refM = text.match(/Reference:\s*([^\n]+)/i);
    const batchM = text.match(/Batch_ID:\s*([\d,]+(?:\.\d+)?)/i);
    const clientM = text.match(/Client\s+ID:\s*([0-9]+)/i);
    const extM = text.match(/ExtInvestorID:\s*([0-9]+)/i);
    return {
        notice_date: noticeDate,
        due_date: dueDate,
        report_type: reportType,
        capital_call_percent: capitalCallPercent,
        capital_call_amount: capitalCallAmount,
        funded_after_call_percent: fundedAfterCallPercent,
        inferred_commitment_amount: inferredCommitmentAmount,
        inferred_cumulative_capital_contributions_after_call: inferredCumulativeAfterCall,
        inferred_remaining_commitment_after_call: inferredRemainingAfterCall,
        beneficiary_bank: bankM ? bankM[1].trim() : null,
        swift_code: swiftM ? swiftM[1].trim() : null,
        aba_number: abaM ? abaM[1].trim() : null,
        account_name: acctNameM ? acctNameM[1].trim() : null,
        account_number: acctNumM ? acctNumM[1].trim() : null,
        reference: refM ? refM[1].trim() : null,
        batch_id: batchM ? cleanAmount(batchM[1], true) : null,
        client_id: clientM ? clientM[1].trim() : null,
        ext_investor_id: extM ? extM[1].trim() : null,
    };
}
// ── Breakdown ──────────────────────────────────────────────────────────────────
function buildBreakdown(a) {
    const capital_call_breakdown = [];
    if (a.capital_call_amount != null) {
        capital_call_breakdown.push({
            purpose: 'repay_capital_call_line',
            label: "Capital call used to repay a portion of the Fund's outstanding capital call line",
            amount: a.capital_call_amount,
            excel_usage: 'capital_contribution_amount',
        });
    }
    return { capital_call_breakdown, distribution_breakdown: [] };
}
// ── Excel mapping ──────────────────────────────────────────────────────────────
function calculateCurrentTransactionCashFlow(b, c) {
    return round2(-b + c);
}
function mapToExcelFields(a, breakdown) {
    const capitalContributionAmount = a.capital_call_amount ?? 0;
    const distributionAmountReceived = 0;
    const reinvestableAmount = 0;
    const cashFlow = calculateCurrentTransactionCashFlow(capitalContributionAmount, distributionAmountReceived);
    let remarks = "Siguler Guff capital call notice. Capital call is used to repay a portion of the Fund's outstanding capital call line.";
    if (a.report_type)
        remarks += ` Report type: ${a.report_type}.`;
    if (a.capital_call_percent != null)
        remarks += ` Call percentage: ${a.capital_call_percent}%.`;
    if (a.funded_after_call_percent != null) {
        remarks += ` Funded after this call: ${a.funded_after_call_percent}%.`;
    }
    else {
        remarks += ' Funded-after-call percentage not printed; cumulative amount uses current initial call amount unless previous_state is provided.';
    }
    return {
        subscription_agreement_effective_date: null,
        commitment_amount: a.inferred_commitment_amount,
        transaction_date: a.due_date,
        capital_contribution_amount: capitalContributionAmount,
        distribution_amount_received: distributionAmountReceived,
        reinvestable_amount: reinvestableAmount,
        cumulative_capital_contributions: a.inferred_cumulative_capital_contributions_after_call,
        remaining_commitment_formula_value: a.inferred_remaining_commitment_after_call,
        remaining_commitment: a.inferred_remaining_commitment_after_call,
        cash_flow: cashFlow,
        remarks,
        distribution_details: breakdown.distribution_breakdown,
        distribution_not_allocated_to_reinvestment: 0,
    };
}
// ── Calculation ────────────────────────────────────────────────────────────────
function calculateExcelFields(excel, a, previousState = null) {
    const b = amountOrZero(excel.capital_contribution_amount);
    const d = amountOrZero(excel.reinvestable_amount);
    const c = amountOrZero(excel.distribution_amount_received);
    const inferredE = a.inferred_cumulative_capital_contributions_after_call;
    const inferredF = a.inferred_remaining_commitment_after_call;
    let cumulativeContributions = inferredE;
    let remainingCommitment = inferredF;
    let cumulativeCashFlow = null;
    const calculationSources = {
        cumulative_capital_contributions: 'from_inferred_percentage_value_no_previous_state',
        remaining_commitment: 'from_inferred_percentage_value_no_previous_state',
        cash_flow: 'from_inferred_cumulative_value_no_previous_state',
        cumulative_cash_flow: 'from_inferred_cumulative_value_no_previous_state',
    };
    const currentCashFlow = calculateCurrentTransactionCashFlow(b, c);
    // No previous state — cash flow is negative cumulative (all capital calls, no distributions)
    let finalCashFlowForExcel;
    if (inferredE != null) {
        finalCashFlowForExcel = round2(-inferredE);
        cumulativeCashFlow = finalCashFlowForExcel;
    }
    else {
        finalCashFlowForExcel = currentCashFlow;
        calculationSources.cash_flow = 'current_transaction_cash_flow_no_previous_state';
        calculationSources.cumulative_cash_flow = 'not_calculated_previous_state_missing';
    }
    if (previousState) {
        const prevE = previousState.cumulative_capital_contributions;
        const prevF = previousState.remaining_commitment;
        const prevCashFlow = previousState.cumulative_cash_flow;
        if (prevE != null) {
            cumulativeContributions = round2(Number(prevE) + b);
            calculationSources.cumulative_capital_contributions = 'calculated_from_previous_state';
        }
        if (prevF != null) {
            remainingCommitment = round2(Number(prevF) - b + d);
            calculationSources.remaining_commitment = 'calculated_from_previous_state';
        }
        if (prevCashFlow != null) {
            cumulativeCashFlow = round2(Number(prevCashFlow) + currentCashFlow);
            finalCashFlowForExcel = cumulativeCashFlow;
            calculationSources.cash_flow = 'cumulative_cash_flow_calculated_from_previous_state';
            calculationSources.cumulative_cash_flow = 'calculated_from_previous_state';
        }
    }
    const distributionNotAllocated = round2(Math.max(c - d, 0));
    const calculatedFields = {
        cumulative_capital_contributions: cumulativeContributions,
        remaining_commitment_formula_value: remainingCommitment,
        remaining_commitment: remainingCommitment,
        current_transaction_cash_flow: currentCashFlow,
        cumulative_cash_flow: cumulativeCashFlow,
        cash_flow_for_excel: finalCashFlowForExcel,
        distribution_not_allocated_to_reinvestment: distributionNotAllocated,
        remarks: excel.remarks,
        distribution_details: excel.distribution_details,
    };
    return {
        input_values_for_current_row: {
            subscription_agreement_effective_date: excel.subscription_agreement_effective_date,
            commitment_amount: excel.commitment_amount,
            transaction_date: excel.transaction_date,
            capital_contribution_amount: b,
            distribution_amount_received: c,
            reinvestable_amount: d,
            capital_call_percent: a.capital_call_percent,
            funded_after_call_percent: a.funded_after_call_percent,
        },
        previous_state_used: previousState,
        calculated_excel_fields: calculatedFields,
        calculation_sources: calculationSources,
    };
}
// ── Validation ─────────────────────────────────────────────────────────────────
function buildValidation(excel, a, breakdown, calculationResult) {
    const requiredFields = [
        'subscription_agreement_effective_date', 'commitment_amount', 'transaction_date',
        'capital_contribution_amount', 'distribution_amount_received', 'reinvestable_amount',
        'cumulative_capital_contributions', 'remaining_commitment', 'cash_flow',
        'remarks', 'distribution_details',
    ];
    const missing = [];
    const matched = [];
    for (const f of requiredFields) {
        const v = excel[f];
        if (v == null || v === '')
            missing.push(f);
        else
            matched.push(f);
    }
    const breakdownTotal = round2(breakdown.capital_call_breakdown.reduce((s, i) => s + (i.amount ?? 0), 0));
    const callAmount = a.capital_call_amount;
    const calculatedCallFromPct = a.inferred_commitment_amount != null && a.capital_call_percent != null
        ? round2(a.inferred_commitment_amount * (a.capital_call_percent / 100))
        : null;
    const cc = calculationResult.calculated_excel_fields;
    const inferredE = a.inferred_cumulative_capital_contributions_after_call;
    const inferredF = a.inferred_remaining_commitment_after_call;
    return {
        missing_excel_fields: missing,
        matched_excel_fields: matched,
        calculation_checks: {
            capital_call_breakdown_total: breakdownTotal,
            current_capital_call_amount: callAmount,
            is_capital_call_breakdown_matched: callAmount != null
                ? round2(breakdownTotal) === round2(callAmount) : null,
            inferred_commitment_amount: a.inferred_commitment_amount,
            capital_call_percent: a.capital_call_percent,
            funded_after_call_percent: a.funded_after_call_percent,
            calculated_call_amount_from_percent: calculatedCallFromPct,
            is_call_amount_matched_with_percent: calculatedCallFromPct != null && callAmount != null
                ? round2(calculatedCallFromPct) === round2(callAmount) : null,
            inferred_cumulative_capital_contributions_after_call: inferredE,
            calculated_cumulative_capital_contributions: cc.cumulative_capital_contributions,
            is_cumulative_matched_with_inferred: inferredE != null && cc.cumulative_capital_contributions != null
                ? round2(inferredE) === round2(cc.cumulative_capital_contributions) : null,
            inferred_remaining_commitment_after_call: inferredF,
            calculated_remaining_commitment: cc.remaining_commitment,
            is_remaining_matched_with_inferred: inferredF != null && cc.remaining_commitment != null
                ? round2(inferredF) === round2(cc.remaining_commitment) : null,
            current_transaction_cash_flow: cc.current_transaction_cash_flow,
            cumulative_cash_flow: cc.cumulative_cash_flow,
            cash_flow_for_excel: cc.cash_flow_for_excel,
        },
        needs_review: true,
        warnings: [
            'This Siguler Guff report does not show a standard commitment summary table.',
            'Commitment amount is inferred from capital call amount divided by capital call percentage.',
            'For non-initial calls, cumulative capital contributions and remaining commitment are inferred from funded-after-call percentage if previous_state is missing.',
            'For initial calls, funded-after-call percentage is not printed; cumulative capital contributions default to current capital call amount.',
            'If previous_state values are provided, formula fields use previous_state instead of inferred values.',
        ],
    };
}
// ── Main ───────────────────────────────────────────────────────────────────────
function extractSigulerGuffReport(rawText, fileName = '', previousState = null) {
    const text = normalizeText(rawText);
    const allFields = extractAllFields(text);
    const breakdown = buildBreakdown(allFields);
    const excelFields = mapToExcelFields(allFields, breakdown);
    const calculationResult = calculateExcelFields(excelFields, allFields, previousState);
    const validation = buildValidation(excelFields, allFields, breakdown, calculationResult);
    const calculated = calculationResult.calculated_excel_fields;
    const finalExcelFields = { ...excelFields };
    finalExcelFields.cumulative_capital_contributions = calculated.cumulative_capital_contributions ?? finalExcelFields.cumulative_capital_contributions;
    finalExcelFields.remaining_commitment_formula_value = calculated.remaining_commitment_formula_value ?? finalExcelFields.remaining_commitment_formula_value;
    finalExcelFields.remaining_commitment = calculated.remaining_commitment ?? finalExcelFields.remaining_commitment;
    finalExcelFields.cash_flow = calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow;
    finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow;
    finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow;
    finalExcelFields.distribution_not_allocated_to_reinvestment =
        calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment;
    return {
        source_file_name: fileName,
        extraction_status: 'success',
        module_name: 'siguler_guff_small_buyout_capital_call',
        document_type: allFields.report_type === 'INITIALCALL' ? 'initial_capital_call_notice' : 'capital_call_notice',
        company_name: findCompanyName(text),
        fund_name: detectFundName(text),
        currency: detectCurrency(text),
        excel_fields: excelFields,
        all_extracted_fields: allFields,
        breakdown,
        validation,
        calculation_result: { ...calculationResult, final_excel_fields_for_frontend: finalExcelFields },
        final_excel_fields: finalExcelFields,
    };
}
//# sourceMappingURL=extractor.js.map