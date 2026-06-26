"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDerivedValues = calculateDerivedValues;
exports.validateExtraction = validateExtraction;
exports.determineValidationGate = determineValidationGate;
exports.performFullValidation = performFullValidation;
const calc_1 = require("../ai-extract/calc");
/**
 * Convert extracted values to the format expected by calc engine
 */
function normalizeExtractedValues(values) {
    return {
        B_capital_contribution: values.B_capital_contribution ?? null,
        C_distribution_received: values.C_distribution_received ?? null,
        D_reinvestable: values.D_reinvestable ?? null,
        return_of_capital: null,
        gain: null,
        interest: null,
        report_provided_unfunded_before: null,
        report_provided_remaining_after: null,
        subsequent_close_interest: null,
        notes: values.notes || '',
    };
}
/**
 * Calculate derived values (E, F, G) using deterministic engine
 * E = cumulative contributions
 * F = unfunded commitment
 * G = cumulative net cash flow
 */
function calculateDerivedValues(extractedValues, fundKey, previousE = 0, previousF = 0, previousG = 0) {
    const normalized = normalizeExtractedValues(extractedValues);
    const prevState = {
        E: previousE,
        F: previousF,
        G: previousG,
    };
    const result = (0, calc_1.applyCalcEngine)(normalized, fundKey, prevState);
    return {
        E_cumulative_drawn: result.E,
        F_investment_capacity: result.F,
        G_net_cash_flow: result.G,
    };
}
/**
 * Run validation checks on extracted and calculated values
 */
function validateExtraction(extractedValues, calculatedValues, reportedNetWire) {
    const normalized = normalizeExtractedValues(extractedValues);
    const calcResult = {
        B: extractedValues.B_capital_contribution ?? 0,
        C: extractedValues.C_distribution_received ?? 0,
        D: extractedValues.D_reinvestable ?? 0,
        L: (extractedValues.C_distribution_received ?? 0) - (extractedValues.D_reinvestable ?? 0),
        cash_flow: -(extractedValues.B_capital_contribution ?? 0) + (extractedValues.C_distribution_received ?? 0),
        E: calculatedValues.E_cumulative_drawn,
        F: calculatedValues.F_investment_capacity,
        G: calculatedValues.G_net_cash_flow,
        commitment_inferred: null,
    };
    const checks = (0, calc_1.runCrossChecks)(normalized, calcResult, reportedNetWire);
    return checks.map((check) => ({
        rule: check.rule,
        pass: check.pass,
        detail: check.detail,
    }));
}
/**
 * Determine the confidence gate level based on validation results
 */
function determineValidationGate(validationChecks) {
    const allPass = validationChecks.every((check) => check.pass);
    if (allPass) {
        return {
            level: 'auto',
            label: 'All checks passed - safe to save',
            color: 'green',
        };
    }
    const failCount = validationChecks.filter((check) => !check.pass).length;
    const totalCount = validationChecks.length;
    const failPct = (failCount / totalCount) * 100;
    if (failPct <= 25) {
        return {
            level: 'warning',
            label: 'Some checks failed - review before saving',
            color: 'yellow',
        };
    }
    if (failPct <= 50) {
        return {
            level: 'review',
            label: 'Multiple checks failed - manual review required',
            color: 'orange',
        };
    }
    return {
        level: 'reject',
        label: 'Critical validation errors - do not save',
        color: 'red',
    };
}
/**
 * Full validation pipeline: extract → calculate → validate → gate
 */
function performFullValidation(extractedValues, fundKey, previousE, previousF, previousG, reportedNetWire) {
    const calculated = calculateDerivedValues(extractedValues, fundKey, previousE, previousF, previousG);
    const checks = validateExtraction(extractedValues, calculated, reportedNetWire);
    const gate = determineValidationGate(checks);
    return { calculated, checks, gate };
}
//# sourceMappingURL=validation-engine.js.map