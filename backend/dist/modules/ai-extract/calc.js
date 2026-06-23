"use strict";
// Deterministic calculation engine — never delegated to AI.
// Applies E, F, G formulas from the Calculation Document.
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCalcEngine = applyCalcEngine;
exports.runCrossChecks = runCrossChecks;
function applyCalcEngine(ext, fund_key, prev) {
    const B = ext.B_capital_contribution ?? 0;
    const C = ext.C_distribution_received ?? 0;
    const D = ext.D_reinvestable ?? 0;
    let E = prev.E;
    let F = prev.F;
    let G = prev.G;
    let commitment_inferred = null;
    if (fund_key === 'SDG' &&
        ext.report_provided_unfunded_before !== null &&
        ext.report_provided_remaining_after !== null) {
        // SDG commitment-change exception — commitment can grow
        const current_total = prev.E + ext.report_provided_unfunded_before;
        E = current_total - ext.report_provided_remaining_after;
        F = ext.report_provided_remaining_after;
        G = prev.G + (-B + C);
    }
    else if (fund_key === 'SIGULER_GUFF') {
        // Infer commitment from call_pct + funded_pct in notes
        const callPct = parseNoteValue(ext.notes, 'call_pct');
        const fundedPct = parseNoteValue(ext.notes, 'funded_pct');
        if (callPct && B) {
            commitment_inferred = B / (callPct / 100);
        }
        if (prev.E > 0) {
            E = prev.E + B;
            F = prev.F - B + D;
        }
        else if (commitment_inferred && fundedPct) {
            E = commitment_inferred * fundedPct / 100;
            F = commitment_inferred - E;
        }
        else {
            E = prev.E + B;
            F = prev.F - B + D;
        }
        G = prev.G + (-B + C);
    }
    else {
        // Standard formula
        E = prev.E + B;
        F = prev.F - B + D;
        G = prev.G + (-B + C);
    }
    const L = C - D;
    const cash_flow = -B + C;
    return { B, C, D, L, cash_flow, E, F, G, commitment_inferred };
}
function runCrossChecks(ext, calc, reportedNetWire) {
    const checks = [];
    const C = calc.C;
    const D = calc.D;
    // D must not exceed C
    checks.push({
        rule: 'D ≤ C (recallable cannot exceed distribution)',
        pass: D <= C + 0.01,
        detail: `D=${fmt(D)}, C=${fmt(C)}`,
    });
    // Finance detail reconciliation
    if (ext.return_of_capital !== null && ext.gain !== null && ext.interest !== null) {
        const sum = ext.return_of_capital + ext.gain + ext.interest;
        const pass = Math.abs(sum - C) <= 1;
        checks.push({
            rule: 'return_of_capital + gain + interest = C',
            pass,
            detail: `${fmt(ext.return_of_capital)} + ${fmt(ext.gain)} + ${fmt(ext.interest)} = ${fmt(sum)} vs C=${fmt(C)}`,
        });
    }
    // Net wire check
    if (reportedNetWire !== null && reportedNetWire !== undefined) {
        const pass = Math.abs(calc.cash_flow - reportedNetWire) <= 1;
        checks.push({
            rule: 'Net cash flow matches reported wire amount',
            pass,
            detail: `Calculated ${fmt(calc.cash_flow)} vs reported ${fmt(reportedNetWire)}`,
        });
    }
    // F must not go negative
    checks.push({
        rule: 'F (unfunded) ≥ 0',
        pass: calc.F >= -0.01,
        detail: `F=${fmt(calc.F)}`,
    });
    return checks;
}
function parseNoteValue(notes, key) {
    const match = notes?.match(new RegExp(`${key}=([\\d.]+)`));
    return match ? parseFloat(match[1]) : null;
}
function fmt(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
//# sourceMappingURL=calc.js.map