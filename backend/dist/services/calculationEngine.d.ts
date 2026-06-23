/**
 * Calculation Engine — TypeScript port of the Python version.
 *
 * Mirrors the Thirdwave Excel sheet column formulas:
 *   A  Contract effective date
 *   B  Capital paid-in          (gross call wired OUT)
 *   C  Capital received         (distributions IN)
 *   D  Reinvestable portion     (subset of C)
 *   E  Cumulative called        = prev_E + B
 *   F  Investment capacity      = prev_F - B + D
 *   G  Cash flow (period)       = -B + C
 *   H  NET Cash Position        = prev_H + G  (running)
 *
 * All arithmetic uses decimal.js to avoid float rounding errors.
 */
import Decimal from 'decimal.js';
export interface Transaction {
    date: Date;
    txType: 'capital_call' | 'distribution';
    description: string;
    fxRate: Decimal | null;
    capitalPaidIn: Decimal;
    capitalReceived: Decimal;
    reinvestable: Decimal;
    manualCashFlow?: Decimal | null;
    unfundedAfterCall?: Decimal | null;
    callId?: string;
    distId?: string;
    wireReference?: string | null;
    notes?: string | null;
    returnOfCapital?: Decimal | null;
    gain?: Decimal | null;
    interest?: Decimal | null;
}
export interface LedgerRow extends Transaction {
    cumulativeCalled: Decimal;
    investmentCapacity: Decimal;
    cashFlow: Decimal;
    netCashPosition: Decimal;
    capitalPaidJpy: Decimal;
    capitalReceivedJpy: Decimal;
}
export interface FundSnapshot {
    commitmentUsd: Decimal;
    totalCalledUsd: Decimal;
    totalReceivedUsd: Decimal;
    drawnPct: Decimal;
    unfundedUsd: Decimal;
    investmentCapacity: Decimal;
    netCashPosition: Decimal;
    dpi: Decimal;
}
export declare class CalculationEngine {
    /** Build a full Excel-style ledger from sorted transactions.
     *
     * `commitmentHistory` — optional sorted list of commitment step-ups (SDG).
     * Each entry is `{ commitmentAmount, effectiveDate }`. For each transaction
     * the engine picks the entry with the largest effectiveDate ≤ tx.date and
     * computes F = commitment_at_date - E + D.  When no history is supplied (or
     * no entry is found for a date) the engine falls back to unfundedAfterCall
     * or the generic prev_F - B + D formula.
     */
    static buildLedger(commitmentUsd: Decimal, transactions: Transaction[], defaultFx?: Decimal, commitmentHistory?: Array<{
        commitmentAmount: Decimal;
        effectiveDate: Date;
    }>): {
        rows: LedgerRow[];
        snapshot: FundSnapshot;
    };
    /**
     * Annualised IRR (XIRR) from dated cash flows via bisection on NPV.
     * Returns a fraction (0.18 = 18%) or null when it can't be solved (needs at
     * least one inflow and one outflow with a sign change).
     */
    static xirr(flows: {
        date: Date;
        amount: number;
    }[]): number | null;
    /** Get current fund summary (used by list and dashboard endpoints). */
    static fundSummary(fund: any): Promise<Record<string, unknown>>;
}
//# sourceMappingURL=calculationEngine.d.ts.map