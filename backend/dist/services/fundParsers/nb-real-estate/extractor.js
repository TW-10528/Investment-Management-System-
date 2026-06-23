"use strict";
// NB Real Estate Secondary Opportunities Fund II — extraction module.
//
// Faithful TypeScript port of the reference Python module
// `nb_realestate_module_updated.py`.
//
// Purpose:
//   - Extract values from NB Real Estate Secondary Opportunities (Offshore) Fund II
//     capital-call / drawdown notice PDFs.
//   - Map them to the company's standard Excel fields.
//   - Calculate formula-based fields from either previous_state or report cumulatives.
//
// CASH-FLOW RULE (company Excel):
//   current_transaction_cash_flow = -capital_contribution_amount + distribution_amount_received
//   • tax_expense is extracted but NOT in cash flow.
//   • amount_due_from_limited_partner is extracted but NOT used for cash flow.
//   • If previous_state.cumulative_cash_flow is provided, the Excel cash_flow becomes
//     previous cumulative + current transaction cash flow; otherwise it stays the
//     current transaction cash flow (or the report cumulative when this is the first row).
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeText = normalizeText;
exports.extractNbRealestateReport = extractNbRealestateReport;
// ── Amount / date helpers (mirror Python clean_amount / find_*_by_label) ───────
// Matches: $250,000.00 · ($38,405.43) · 5.00% · - · $-
const AMOUNT = '(\\(?\\$?\\s*-?[\\d,]+(?:\\.\\d+)?%?\\)?|\\$?\\s*-)';
const MONTH_NUM = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
// "$250,000.00" → 250000 · "($38,405.43)" → -38405.43 (or +abs if absolute)
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
// Finds the amount following a label (handles the 1st..nth occurrence).
function findAmountByLabel(text, labels, absolute = true, occurrence = 1) {
    for (const label of labels) {
        const re = new RegExp(escapeRegex(label) + '\\s*:?\\s*' + AMOUNT, 'gi');
        const matches = [...text.matchAll(re)];
        if (matches.length >= occurrence)
            return cleanAmount(matches[occurrence - 1][1], absolute);
    }
    return null;
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
function findFirstDate(text) {
    const m = text.match(/\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/);
    return m ? normalizeDate(m[1]) : null;
}
function findDateByLabel(text, labels) {
    for (const label of labels) {
        const re = new RegExp(escapeRegex(label) + '\\s*:?\\s*([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})', 'i');
        const m = text.match(re);
        if (m)
            return normalizeDate(m[1]);
    }
    return null;
}
// Normalise whitespace + invisible chars (mirrors Python normalize_text).
function normalizeText(text) {
    return text
        .replace(/ /g, ' ')
        .replace(/​/g, '')
        .replace(/[‘’]/g, "'")
        .replace(/[ \t]+/g, ' ');
}
function findCompanyName(text) {
    const m = text.match(/\n\s*([A-Za-z0-9 .,&'-]+?)\s*\n\s*Amount Due\s*:/i);
    if (m)
        return m[1].trim().split(/\s+/).join(' ');
    const byOrder = text.match(/By order of:\s*([^\n]+)/i);
    if (byOrder)
        return byOrder[1].trim().split(/\s+/).join(' ');
    return null;
}
function detectCurrency(text) {
    if (text.includes('$'))
        return 'USD';
    if (text.includes('¥') || text.includes('JPY'))
        return 'JPY';
    return 'unknown';
}
function detectFundName(text) {
    if (text.includes('NB Real Estate Secondary Opportunities Offshore Fund II LP'))
        return 'NB Real Estate Secondary Opportunities Offshore Fund II LP';
    return 'NB Real Estate Secondary Opportunities Fund II LP';
}
// ── Extraction ─────────────────────────────────────────────────────────────────
function extractAllFields(text) {
    const noticeDate = findFirstDate(text);
    const paymentDate = findDateByLabel(text, ['Payment Date']);
    const amountDue = findAmountByLabel(text, ['AMOUNT DUE FROM LIMITED PARTNER', 'Amount Due'], true);
    const limitedPartnerCommitment = findAmountByLabel(text, ["Limited Partner's Commitment"], true);
    const percentCalled = findAmountByLabel(text, ['% of Capital Commitment Called'], true);
    const lpShareCapitalContribution = findAmountByLabel(text, ["Limited Partner's Share of Capital Contribution"], true);
    const contributionForInvestments = findAmountByLabel(text, ["Limited Partner's Share of Capital Contribution for Investments"], true);
    const contributionForPartnershipExpenses = findAmountByLabel(text, ["Limited Partner's Share of Capital Contribution for Partnership Expenses"], true);
    // Management fee line. This appears with different periods in NB notices.
    const managementFeeAmount = findAmountByLabel(text, [
        'For the period January 1, 2025 to June 30, 2025',
        'For the period July 1, 2025 to December 31, 2025',
        'For the period July 1, 2022 to December 31, 2024',
        'For the period January 1, 2026 to June 30, 2026',
    ], true);
    const managementFeeRebate = findAmountByLabel(text, ['Management Fee Rebate'], true) ?? 0;
    // Additional Payment can be payable (+) or receivable / reducing amount due (-).
    // If it appears in parentheses, it is treated as received and added to distribution.
    // Some reports have footnote marks between the label and amount, so use a flexible regex.
    let additionalPaymentDueToSubsequentClosing = null;
    const addlMatch = text.match(new RegExp('Additional\\s+Payment\\s*\\(Pursuant\\s+to\\s+Section\\s+6\\.7\\(c\\)\\s+of\\s+the\\s+Limited\\s+Partnership\\s+Agreement\\)\\*{0,5}\\s*' + AMOUNT, 'i'));
    if (addlMatch)
        additionalPaymentDueToSubsequentClosing = cleanAmount(addlMatch[1], false);
    const annualFeeRate = findAmountByLabel(text, ['Annual Fee Rate @'], true);
    const fundDistributableProceeds = findAmountByLabel(text, ["Fund's Distributable Proceeds from Investments"], true);
    // Try multiple label variations for LP's distributable proceeds (may have asterisk, or be split across lines)
    let lpShareDistributableProceeds = findAmountByLabel(text, [
        "Limited Partner's Share of Distributable Proceeds*",
        "Limited Partner's Share of Distributable Proceeds",
        "Limited Partner's Share of", // fallback if split across lines
    ], true);
    // If still not found, look for the "LESS: DEEMED DISTRIBUTION" section and extract the amount there
    if (lpShareDistributableProceeds == null) {
        const deemedDistMatch = text.match(/LESS:\s*DEEMED DISTRIBUTION[\s\S]{0,500}?Limited Partner[^$]*?(\(\$?[\d,]+\.?\d*\)|\$?[\d,]+\.?\d*)/i);
        if (deemedDistMatch) {
            const amountStr = deemedDistMatch[1].replace(/[($)]/g, '').replace(/,/g, '');
            lpShareDistributableProceeds = parseFloat(amountStr) || null;
        }
    }
    const taxExpense = findAmountByLabel(text, ['Tax Expense'], true) ?? 0;
    const originalCommitment = findAmountByLabel(text, ['Original Commitment'], true);
    const inceptionToDateContributions = findAmountByLabel(text, ['Less: Inception-to-Date Contributions (including Current Capital Contribution)'], true);
    const itdReinvestable = findAmountByLabel(text, [
        'Plus: Inception-to-Date Distributable Proceeds Subject to Reinvestment (including Current Distribution)',
        'Plus: Inception-to-Date Distributable Proceeds Subject to Reinvestment',
    ], true);
    const remainingCommitment = findAmountByLabel(text, ['Remaining Commitment'], true);
    const inceptionToDateDistributions = findAmountByLabel(text, ['Inception-to-Date Distributions'], true);
    const refMatch = text.match(/Reference:\s*([A-Za-z0-9-]+)/i);
    const reference = refMatch ? refMatch[1].trim() : null;
    const accountNameMatch = text.match(/Account Name:\s*([^\n]+)/i);
    const accountName = accountNameMatch ? accountNameMatch[1].trim() : null;
    const bankMatch = text.match(/\n\s*(Bank of America,\s*N\.A\.)/i);
    const bankName = bankMatch ? bankMatch[1].trim() : null;
    // Excel B / capital_contribution_amount:
    // LP Share of Capital Contribution + net Management Fee (rebate reduces the fee).
    // Organizational Expenses are NOT added separately — already inside LP's Share.
    let netManagementFee = 0;
    if (managementFeeAmount != null)
        netManagementFee = managementFeeAmount - (managementFeeRebate || 0);
    let currentGrossCapitalContribution = 0;
    if (lpShareCapitalContribution != null)
        currentGrossCapitalContribution += lpShareCapitalContribution;
    currentGrossCapitalContribution += netManagementFee || 0;
    if (currentGrossCapitalContribution === 0)
        currentGrossCapitalContribution = null;
    // Excel C / distribution_amount_received:
    // deemed distribution + Additional Payment only when negative (treated as received).
    let additionalPaymentReceived = 0;
    if (additionalPaymentDueToSubsequentClosing != null && additionalPaymentDueToSubsequentClosing < 0)
        additionalPaymentReceived = Math.abs(additionalPaymentDueToSubsequentClosing);
    const currentDistributionAmount = (lpShareDistributableProceeds || 0) + additionalPaymentReceived;
    // Excel D / reinvestable_amount: only deemed distribution is reinvestable.
    const currentReinvestableAmount = lpShareDistributableProceeds || 0;
    return {
        notice_date: noticeDate,
        payment_date: paymentDate,
        amount_due: amountDue,
        limited_partner_commitment: limitedPartnerCommitment,
        percent_of_capital_commitment_called: percentCalled,
        limited_partner_share_of_capital_contribution: lpShareCapitalContribution,
        capital_contribution_for_investments: contributionForInvestments,
        capital_contribution_for_partnership_expenses: contributionForPartnershipExpenses,
        management_fee_amount: managementFeeAmount,
        management_fee_rebate: managementFeeRebate,
        net_management_fee: netManagementFee,
        additional_payment_due_to_subsequent_closing: additionalPaymentDueToSubsequentClosing,
        additional_payment_received: additionalPaymentReceived,
        annual_fee_rate_percent: annualFeeRate,
        fund_distributable_proceeds_from_investments: fundDistributableProceeds,
        limited_partner_share_of_distributable_proceeds: lpShareDistributableProceeds,
        tax_expense: taxExpense,
        amount_due_from_limited_partner: amountDue,
        original_commitment: originalCommitment,
        inception_to_date_contributions: inceptionToDateContributions,
        inception_to_date_distributable_proceeds_subject_to_reinvestment: itdReinvestable,
        remaining_commitment: remainingCommitment,
        inception_to_date_distributions: inceptionToDateDistributions,
        current_gross_capital_contribution: currentGrossCapitalContribution,
        current_distribution_amount: currentDistributionAmount,
        current_reinvestable_amount: currentReinvestableAmount,
        bank_name: bankName,
        account_name: accountName,
        reference,
    };
}
// ── Breakdown ──────────────────────────────────────────────────────────────────
function buildBreakdown(a) {
    const capital_call_breakdown = [];
    const distribution_breakdown = [];
    if (a.capital_contribution_for_investments != null) {
        capital_call_breakdown.push({
            purpose: 'portfolio_investments',
            label: "Limited Partner's Share of Capital Contribution for Investments",
            amount: a.capital_contribution_for_investments,
            excel_usage: 'capital_contribution_amount_component',
        });
    }
    if (a.capital_contribution_for_partnership_expenses != null) {
        capital_call_breakdown.push({
            purpose: 'partnership_expenses',
            label: "Limited Partner's Share of Capital Contribution for Partnership Expenses",
            amount: a.capital_contribution_for_partnership_expenses,
            excel_usage: 'capital_contribution_amount_component',
        });
    }
    if (capital_call_breakdown.length === 0 && a.limited_partner_share_of_capital_contribution != null) {
        capital_call_breakdown.push({
            purpose: 'capital_contribution',
            label: "Limited Partner's Share of Capital Contribution",
            amount: a.limited_partner_share_of_capital_contribution,
            excel_usage: 'capital_contribution_amount_component',
        });
    }
    if (a.management_fee_amount != null) {
        capital_call_breakdown.push({
            purpose: 'management_fee',
            label: 'Capital Contributions Required for Partnership Management Fees',
            amount: a.management_fee_amount,
            excel_usage: 'capital_contribution_amount_component_before_rebate',
        });
    }
    if (a.management_fee_rebate) {
        capital_call_breakdown.push({
            purpose: 'management_fee_rebate',
            label: 'Management Fee Rebate',
            amount: -Math.abs(a.management_fee_rebate),
            excel_usage: 'reduces_capital_contribution_amount',
        });
    }
    if (a.additional_payment_due_to_subsequent_closing != null) {
        const addl = a.additional_payment_due_to_subsequent_closing;
        if (addl < 0) {
            distribution_breakdown.push({
                purpose: 'additional_payment_received',
                label: 'Additional Payment Due to Subsequent Closing',
                amount: Math.abs(addl),
                excel_usage: 'distribution_amount_received_component_not_reinvestable',
            });
        }
        else {
            capital_call_breakdown.push({
                purpose: 'additional_payment_payable',
                label: 'Additional Payment Due to Subsequent Closing',
                amount: addl,
                excel_usage: 'actual_amount_due_only_not_excel_cashflow',
            });
        }
    }
    if (a.limited_partner_share_of_distributable_proceeds != null) {
        distribution_breakdown.push({
            purpose: 'distributable_proceeds_subject_to_reinvestment',
            label: "Limited Partner's Share of Distributable Proceeds",
            amount: a.limited_partner_share_of_distributable_proceeds,
            excel_usage: 'distribution_amount_received_and_reinvestable_amount',
        });
    }
    if (a.tax_expense) {
        distribution_breakdown.push({
            purpose: 'tax_expense',
            label: 'Tax Expense',
            amount: a.tax_expense,
            excel_usage: 'extracted_only_not_used_in_cash_flow',
        });
    }
    return { capital_call_breakdown, distribution_breakdown };
}
// ── Excel mapping and calculation ──────────────────────────────────────────────
// current_transaction_cash_flow = -B + C (NOT tax, NOT amount-due).
function calculateCurrentTransactionCashFlow(capitalContributionAmount, distributionAmountReceived) {
    return round2(-(capitalContributionAmount || 0) + (distributionAmountReceived || 0));
}
function mapToExcelFields(a, breakdown) {
    const commitmentAmount = a.original_commitment ?? a.limited_partner_commitment;
    const capitalContributionAmount = a.current_gross_capital_contribution || 0;
    const distributionAmountReceived = a.current_distribution_amount || 0;
    const reinvestableAmount = a.current_reinvestable_amount || 0;
    const amountDue = a.amount_due_from_limited_partner || 0;
    const taxExpense = a.tax_expense || 0;
    const currentTransactionCashFlow = calculateCurrentTransactionCashFlow(capitalContributionAmount, distributionAmountReceived);
    // Finance-detail columns (ported from the updated nb_realestate_logic).
    // Return of Capital = LP share of distributable proceeds (deemed distribution).
    // Gain = 0 for NB. Interest = additional payment received (offset, negative in report).
    const returnOfCapital = a.limited_partner_share_of_distributable_proceeds ?? 0;
    const gain = 0;
    const interest = a.additional_payment_received ?? 0;
    const remarksParts = ['NB Real Estate capital call/drawdown notice.'];
    if (distributionAmountReceived)
        remarksParts.push('Includes deemed distribution subject to reinvestment.');
    if (a.management_fee_amount)
        remarksParts.push('Includes net management fee capital contribution.');
    if (a.management_fee_rebate)
        remarksParts.push('Management fee rebate deducted from capital contribution amount.');
    if (a.additional_payment_received)
        remarksParts.push('Additional payment received included in distribution amount received, but not reinvestable amount.');
    if (taxExpense)
        remarksParts.push('Tax expense extracted separately and not used in cash flow.');
    return {
        subscription_agreement_effective_date: null,
        commitment_amount: commitmentAmount,
        transaction_date: a.payment_date,
        capital_contribution_amount: capitalContributionAmount,
        distribution_amount_received: distributionAmountReceived,
        reinvestable_amount: reinvestableAmount,
        cumulative_capital_contributions: a.inception_to_date_contributions,
        remaining_commitment_formula_value: a.remaining_commitment,
        remaining_commitment: a.remaining_commitment,
        cash_flow: currentTransactionCashFlow,
        remarks: remarksParts.join(' '),
        distribution_details: breakdown.distribution_breakdown,
        distribution_not_allocated_to_reinvestment: round2(Math.max(distributionAmountReceived - reinvestableAmount, 0)),
        tax_expense: taxExpense,
        amount_due_from_limited_partner: amountDue,
        management_fee_rebate: a.management_fee_rebate ?? 0,
        net_management_fee: a.net_management_fee ?? 0,
        additional_payment_due_to_subsequent_closing: a.additional_payment_due_to_subsequent_closing,
        additional_payment_received: a.additional_payment_received ?? 0,
        return_of_capital: returnOfCapital,
        gain: gain,
        interest: interest,
    };
}
function calculateExcelFields(extracted, a, previousState = null) {
    const b = extracted.capital_contribution_amount || 0;
    const d = extracted.reinvestable_amount || 0;
    const distributionReceived = extracted.distribution_amount_received || 0;
    const taxExpense = extracted.tax_expense || 0;
    const amountDue = extracted.amount_due_from_limited_partner || 0;
    let cumulativeCapitalContributions = a.inception_to_date_contributions;
    let remainingCommitment = a.remaining_commitment;
    let cumulativeCashFlow = null;
    const calculationSources = {
        cumulative_capital_contributions: 'from_report_cumulative_value_no_previous_state',
        remaining_commitment: 'from_report_cumulative_value_no_previous_state',
        cash_flow: 'current_transaction_cash_flow_no_previous_state',
        cumulative_cash_flow: 'not_calculated_previous_state_missing',
    };
    const currentCashFlow = calculateCurrentTransactionCashFlow(b, distributionReceived);
    let finalCashFlowForExcel = currentCashFlow;
    // No previous_state → fall back to the report's own inception-to-date cumulatives.
    if (previousState == null) {
        const reportCumulativeContributions = a.inception_to_date_contributions || 0;
        const reportCumulativeDistributions = a.inception_to_date_distributions || 0;
        if (reportCumulativeContributions) {
            cumulativeCashFlow = round2(-reportCumulativeContributions + (reportCumulativeDistributions || 0));
            finalCashFlowForExcel = cumulativeCashFlow;
            calculationSources.cash_flow = 'from_report_cumulative_values_no_previous_state';
            calculationSources.cumulative_cash_flow = 'from_report_cumulative_values_no_previous_state';
        }
    }
    // previous_state provided → normal 2nd/3rd/… report flow.
    if (previousState) {
        const previousE = previousState.cumulative_capital_contributions;
        const previousF = previousState.remaining_commitment;
        const previousCashFlow = previousState.cumulative_cash_flow;
        if (previousE != null) {
            cumulativeCapitalContributions = round2(previousE + b);
            calculationSources.cumulative_capital_contributions = 'calculated_from_previous_state';
        }
        if (previousF != null) {
            remainingCommitment = round2(previousF - b + d);
            calculationSources.remaining_commitment = 'calculated_from_previous_state';
        }
        if (previousCashFlow != null) {
            cumulativeCashFlow = round2(previousCashFlow + currentCashFlow);
            finalCashFlowForExcel = cumulativeCashFlow;
            calculationSources.cash_flow = 'cumulative_cash_flow_calculated_from_previous_state';
            calculationSources.cumulative_cash_flow = 'calculated_from_previous_state';
        }
    }
    const distributionNotAllocated = round2(Math.max(distributionReceived - d, 0));
    const calculatedFields = {
        cumulative_capital_contributions: cumulativeCapitalContributions,
        remaining_commitment_formula_value: remainingCommitment,
        remaining_commitment: remainingCommitment,
        current_transaction_cash_flow: currentCashFlow,
        cumulative_cash_flow: cumulativeCashFlow,
        cash_flow_for_excel: finalCashFlowForExcel,
        distribution_not_allocated_to_reinvestment: distributionNotAllocated,
        remarks: extracted.remarks,
        distribution_details: extracted.distribution_details ?? [],
        tax_expense: taxExpense,
        amount_due_from_limited_partner: amountDue,
    };
    return {
        input_values_for_current_row: {
            subscription_agreement_effective_date: extracted.subscription_agreement_effective_date,
            commitment_amount: extracted.commitment_amount,
            transaction_date: extracted.transaction_date,
            capital_contribution_amount: b,
            distribution_amount_received: distributionReceived,
            reinvestable_amount: d,
            tax_expense: taxExpense,
            amount_due_from_limited_partner: amountDue,
        },
        previous_state_used: previousState,
        calculated_excel_fields: calculatedFields,
        calculation_sources: calculationSources,
    };
}
// ── Validation ─────────────────────────────────────────────────────────────────
function buildValidation(excelFields, a, breakdown, calculationResult) {
    const requiredExcelFields = [
        'subscription_agreement_effective_date', 'commitment_amount', 'transaction_date',
        'capital_contribution_amount', 'distribution_amount_received', 'reinvestable_amount',
        'cumulative_capital_contributions', 'remaining_commitment', 'cash_flow',
        'remarks', 'distribution_details',
    ];
    const missingExcelFields = [];
    const matchedExcelFields = [];
    for (const field of requiredExcelFields) {
        const value = excelFields[field];
        if (value == null || value === '')
            missingExcelFields.push(field);
        else
            matchedExcelFields.push(field);
    }
    const capitalCallBreakdownTotal = round2(breakdown.capital_call_breakdown.reduce((s, i) => s + (i.amount ?? 0), 0));
    const distributionBreakdownTotal = round2(breakdown.distribution_breakdown
        .filter(i => i.amount != null && i.purpose !== 'tax_expense')
        .reduce((s, i) => s + (i.amount ?? 0), 0));
    const currentContribution = a.current_gross_capital_contribution || 0;
    const currentDistribution = a.current_distribution_amount || 0;
    const taxExpense = a.tax_expense || 0;
    const amountDue = a.amount_due_from_limited_partner;
    // Report-only validation of net amount due (NOT used for Excel cash flow).
    const calculatedAmountDue = round2(currentContribution - currentDistribution + taxExpense);
    const isAmountDueMatched = amountDue != null ? round2(calculatedAmountDue) === round2(amountDue) : null;
    const reportE = a.inception_to_date_contributions;
    const calcE = calculationResult.calculated_excel_fields.cumulative_capital_contributions;
    const reportF = a.remaining_commitment;
    const calcF = calculationResult.calculated_excel_fields.remaining_commitment;
    const cc = calculationResult.calculated_excel_fields;
    return {
        missing_excel_fields: missingExcelFields,
        matched_excel_fields: matchedExcelFields,
        calculation_checks: {
            capital_call_breakdown_total: capitalCallBreakdownTotal,
            current_gross_capital_contribution: currentContribution,
            is_capital_call_breakdown_matched: currentContribution ? round2(capitalCallBreakdownTotal) === round2(currentContribution) : null,
            distribution_breakdown_total_excluding_tax: distributionBreakdownTotal,
            current_distribution_amount: currentDistribution,
            is_distribution_breakdown_matched: currentDistribution ? round2(distributionBreakdownTotal) === round2(currentDistribution) : null,
            reported_amount_due: amountDue,
            calculated_amount_due_for_report_validation_only: calculatedAmountDue,
            is_amount_due_matched: isAmountDueMatched,
            report_cumulative_capital_contributions: reportE,
            calculated_cumulative_capital_contributions: calcE,
            is_cumulative_capital_contributions_matched_with_report: reportE != null && calcE != null ? round2(reportE) === round2(calcE) : null,
            report_remaining_commitment: reportF,
            calculated_remaining_commitment: calcF,
            is_remaining_commitment_matched_with_report: reportF != null && calcF != null ? round2(reportF) === round2(calcF) : null,
            current_transaction_cash_flow: cc.current_transaction_cash_flow,
            cumulative_cash_flow: cc.cumulative_cash_flow,
            cash_flow_for_excel: cc.cash_flow_for_excel,
            tax_expense_excluded_from_cash_flow: taxExpense,
        },
        needs_review: true,
        warnings: [
            'For NB reports, capital_contribution_amount is gross contribution used for cumulative contribution calculation.',
            'current_transaction_cash_flow is calculated as -capital_contribution_amount + distribution_amount_received.',
            'Tax expense and Amount Due are extracted and validated separately, but they are NOT used in Excel cash flow.',
            'If previous_state.cumulative_cash_flow is provided, final_excel_fields.cash_flow becomes cumulative cash flow.',
            'Distributable proceeds are treated as reinvestable because the notice states they are subject to reinvestment.',
        ],
    };
}
// ── Main module function ───────────────────────────────────────────────────────
function extractNbRealestateReport(rawText, fileName = '', previousState = null) {
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
    // Excel cash_flow becomes cumulative if previous_state.cumulative_cash_flow was provided;
    // otherwise it stays the current transaction cash flow. Tax is never included here.
    finalExcelFields.cash_flow = calculated.cash_flow_for_excel ?? finalExcelFields.cash_flow;
    finalExcelFields.current_transaction_cash_flow = calculated.current_transaction_cash_flow;
    finalExcelFields.cumulative_cash_flow = calculated.cumulative_cash_flow;
    finalExcelFields.distribution_not_allocated_to_reinvestment = calculated.distribution_not_allocated_to_reinvestment ?? finalExcelFields.distribution_not_allocated_to_reinvestment;
    return {
        source_file_name: fileName,
        extraction_status: 'success',
        module_name: 'nb_realestate_secondary_opportunities',
        document_type: 'capital_call_notice_with_deemed_distribution',
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