export interface Extracted {
    B_capital_contribution: number | null;
    C_distribution_received: number | null;
    D_reinvestable: number | null;
    return_of_capital: number | null;
    gain: number | null;
    interest: number | null;
    report_provided_unfunded_before: number | null;
    report_provided_remaining_after: number | null;
    subsequent_close_interest: number | null;
    notes: string;
}
export interface PrevState {
    E: number;
    F: number;
    G: number;
}
export interface CalcResult {
    B: number;
    C: number;
    D: number;
    L: number;
    cash_flow: number;
    E: number;
    F: number;
    G: number;
    commitment_inferred: number | null;
}
export interface CrossCheck {
    rule: string;
    pass: boolean;
    detail: string;
}
export declare function applyCalcEngine(ext: Extracted, fund_key: string, prev: PrevState): CalcResult;
export declare function runCrossChecks(ext: Extracted, calc: CalcResult, reportedNetWire?: number | null): CrossCheck[];
//# sourceMappingURL=calc.d.ts.map