"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalculationEngine = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../lib/prisma");
decimal_js_1.default.set({ rounding: decimal_js_1.default.ROUND_HALF_UP, precision: 28 });
// ── Engine ────────────────────────────────────────────────────────────────────
class CalculationEngine {
    /** Build a full Excel-style ledger from sorted transactions.
     *
     * `commitmentHistory` — optional sorted list of commitment step-ups (SDG).
     * Each entry is `{ commitmentAmount, effectiveDate }`. For each transaction
     * the engine picks the entry with the largest effectiveDate ≤ tx.date and
     * computes F = commitment_at_date - E + D.  When no history is supplied (or
     * no entry is found for a date) the engine falls back to unfundedAfterCall
     * or the generic prev_F - B + D formula.
     */
    static buildLedger(commitmentUsd, transactions, defaultFx = new decimal_js_1.default('150'), commitmentHistory = []) {
        // Pre-sort history descending so the first match is always the latest applicable entry.
        const histSorted = [...commitmentHistory].sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
        // Also get ascending sort for finding the oldest (initial) commitment
        const histSortedAsc = [...commitmentHistory].sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
        function commitmentAt(date) {
            // Find latest entry with effectiveDate <= date
            const entry = histSorted.find(h => h.effectiveDate <= date);
            if (entry)
                return entry.commitmentAmount;
            // For dates before first history entry, use the oldest (initial) commitment
            if (histSortedAsc.length > 0)
                return histSortedAsc[0].commitmentAmount;
            return null;
        }
        const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
        let E = new decimal_js_1.default(0); // cumulative called (pure sum of B — D does NOT reduce E)
        let cumD = new decimal_js_1.default(0); // cumulative reinvestable (tracked separately for F)
        let F = commitmentUsd; // investment capacity
        let H = new decimal_js_1.default(0); // net cash position
        const rows = [];
        for (const tx of sorted) {
            const B = tx.capitalPaidIn;
            const C = tx.capitalReceived;
            const D = tx.reinvestable;
            const rate = tx.fxRate ?? defaultFx;
            E = E.plus(B); // E = prev_E + B  (cumulative capital called, D never reduces E)
            cumD = cumD.plus(D); // track cumulative reinvestable separately
            // F — investment capacity = commitment − E + cumulative D
            //  1. Commitment history entry available: use commitment_at_date
            //  2. Standard: F = prev_F − B + D  (equivalent to commitment − E + cumD)
            const histCommitment = histSorted.length > 0 ? commitmentAt(tx.date) : null;
            if (histCommitment != null && histCommitment.gt(0)) {
                F = histCommitment.minus(E).plus(cumD); // F = commitment − E + cumD
            }
            else {
                F = F.minus(B).plus(D); // F = prev_F − B + D
            }
            // G = -B + C, unless a manual cash-flow value was entered for this row.
            const G = tx.manualCashFlow != null ? tx.manualCashFlow : new decimal_js_1.default(0).minus(B).plus(C);
            H = H.plus(G); // H = prev_H + G
            rows.push({
                ...tx,
                cumulativeCalled: E,
                investmentCapacity: F,
                cashFlow: G,
                netCashPosition: H,
                capitalPaidJpy: B.mul(rate).toDecimalPlaces(0),
                capitalReceivedJpy: C.mul(rate).toDecimalPlaces(0),
            });
        }
        const totalCalled = rows.reduce((s, r) => s.plus(r.capitalPaidIn), new decimal_js_1.default(0));
        const totalReceived = rows.reduce((s, r) => s.plus(r.capitalReceived), new decimal_js_1.default(0));
        const lastRow = rows[rows.length - 1];
        // Snapshot commitment: prefer the most recent history entry (latest commitment step-up)
        // over the fund-level commitmentUsd when history is present.
        const latestHistCommitment = histSorted.length > 0 ? histSorted[0].commitmentAmount : null;
        const snapshotCommitment = latestHistCommitment ?? commitmentUsd;
        // drawnPct: use the latest effective commitment.
        const drawnPct = snapshotCommitment.gt(0)
            ? totalCalled.div(snapshotCommitment).mul(100).toDecimalPlaces(2)
            : new decimal_js_1.default(0);
        // unfundedUsd = F from the last ledger row. The row's investmentCapacity already
        // accounts for commitment history step-ups and the correct E = ΣB − ΣD formula.
        const unfundedUsd = lastRow != null
            ? lastRow.investmentCapacity
            : commitmentUsd;
        const snapshot = {
            commitmentUsd: snapshotCommitment,
            totalCalledUsd: totalCalled,
            totalReceivedUsd: totalReceived,
            drawnPct,
            unfundedUsd,
            investmentCapacity: lastRow?.investmentCapacity ?? commitmentUsd,
            netCashPosition: lastRow?.netCashPosition ?? new decimal_js_1.default(0),
            dpi: totalCalled.gt(0)
                ? totalReceived.div(totalCalled).toDecimalPlaces(4)
                : new decimal_js_1.default(0),
        };
        return { rows, snapshot };
    }
    /**
     * Annualised IRR (XIRR) from dated cash flows via bisection on NPV.
     * Returns a fraction (0.18 = 18%) or null when it can't be solved (needs at
     * least one inflow and one outflow with a sign change).
     */
    static xirr(flows) {
        const valid = flows.filter(x => x.amount !== 0 && !Number.isNaN(x.amount));
        if (valid.length < 2)
            return null;
        if (!valid.some(x => x.amount < 0) || !valid.some(x => x.amount > 0))
            return null;
        const t0 = Math.min(...valid.map(x => x.date.getTime()));
        const yrs = (d) => (d.getTime() - t0) / (365.25 * 24 * 3600 * 1000);
        const npv = (r) => valid.reduce((s, x) => s + x.amount / Math.pow(1 + r, yrs(x.date)), 0);
        let lo = -0.9999, hi = 100;
        let flo = npv(lo), fhi = npv(hi);
        if (flo * fhi > 0)
            return null; // no sign change in range
        for (let i = 0; i < 256; i++) {
            const mid = (lo + hi) / 2;
            const fm = npv(mid);
            if (Math.abs(fm) < 1e-7 || (hi - lo) < 1e-9)
                return mid;
            if (flo * fm < 0) {
                hi = mid;
                fhi = fm;
            }
            else {
                lo = mid;
                flo = fm;
            }
        }
        return (lo + hi) / 2;
    }
    /** Get current fund summary (used by list and dashboard endpoints). */
    static async fundSummary(fund) {
        const [paidCalls, distributions, navRec, commitmentHistory] = await Promise.all([
            prisma_1.prisma.capitalCall.findMany({
                where: { fundId: fund.id, status: { in: ['approved', 'paid'] } },
                orderBy: { executionDate: 'asc' },
            }),
            prisma_1.prisma.distribution.findMany({
                where: { fundId: fund.id },
                orderBy: { distributionDate: 'asc' },
            }),
            prisma_1.prisma.navRecord.findFirst({ where: { fundId: fund.id }, orderBy: { navDate: 'desc' } }),
            prisma_1.prisma.fundCommitmentHistory.findMany({
                where: { fundId: fund.id },
                orderBy: { effectiveDate: 'asc' },
            }),
        ]);
        const navUsd = navRec ? parseFloat(navRec.navUsd?.toString() ?? '0') : 0;
        const navDate = navRec ? new Date(navRec.navDate) : null;
        const commitment = new decimal_js_1.default(fund.commitmentUsd.toString());
        const txns = [
            ...paidCalls.map((c) => ({
                date: c.executionDate ?? c.dueDate,
                txType: 'capital_call',
                description: `Capital Call #${c.callNumber}`,
                fxRate: c.fxRate ? new decimal_js_1.default(c.fxRate.toString()) : null,
                capitalPaidIn: new decimal_js_1.default(c.grossCallUsd.toString()),
                capitalReceived: new decimal_js_1.default(c.distributionUsd.toString()),
                reinvestable: new decimal_js_1.default(c.reinvestableUsd.toString()),
                callId: c.id,
                wireReference: c.wireReference,
            })),
            ...distributions.map((d) => ({
                date: d.distributionDate,
                txType: 'distribution',
                description: d.distType,
                fxRate: d.fxRate ? new decimal_js_1.default(d.fxRate.toString()) : null,
                capitalPaidIn: new decimal_js_1.default(0),
                capitalReceived: new decimal_js_1.default(d.amountUsd.toString()),
                reinvestable: new decimal_js_1.default(d.reinvestableUsd.toString()),
                distId: d.id,
            })),
        ];
        if (txns.length === 0) {
            return {
                fund_id: fund.id,
                fund_name: fund.fundName,
                fund_name_jp: fund.fundNameJp,
                manager: fund.manager,
                strategy: fund.strategy,
                vintage_year: fund.vintageYear,
                currency: fund.currency,
                commitment_usd: 0,
                total_called_usd: 0,
                total_received_usd: 0,
                total_called_jpy: 0,
                total_received_jpy: 0,
                drawn_pct: 0,
                unfunded_usd: 0,
                investment_capacity: 0,
                net_cash_position: 0,
                nav_usd: navUsd,
                total_value_usd: navUsd,
                moic: 0,
                irr: null,
                is_active: fund.isActive,
                dpi: 0,
                tvpi: 0,
            };
        }
        const commHistory = commitmentHistory.map(h => ({
            commitmentAmount: new decimal_js_1.default(h.commitmentAmount.toString()),
            effectiveDate: new Date(h.effectiveDate),
        }));
        const { rows, snapshot } = CalculationEngine.buildLedger(commitment, txns, new decimal_js_1.default('150'), commHistory);
        const f = (d) => parseFloat(d.toString());
        // JPY totals (sum of each row's B×fx / C×fx) for the dashboard's per-fund view.
        const totalCalledJpy = rows.reduce((s, r) => s.plus(r.capitalPaidJpy), new decimal_js_1.default(0));
        const totalReceivedJpy = rows.reduce((s, r) => s.plus(r.capitalReceivedJpy), new decimal_js_1.default(0));
        const called = f(snapshot.totalCalledUsd);
        const received = f(snapshot.totalReceivedUsd);
        const totalValue = received + navUsd; // Distributions + NAV
        const moic = called > 0 ? Math.round(totalValue / called * 10000) / 10000 : 0;
        const tvpi = moic; // same metric for these funds
        // IRR from each row's net cash flow (G), plus the residual NAV as a terminal inflow.
        const irrFlows = rows.map(r => ({ date: r.date, amount: f(r.cashFlow) }));
        if (navUsd > 0 && navDate)
            irrFlows.push({ date: navDate, amount: navUsd });
        const irrRaw = CalculationEngine.xirr(irrFlows);
        const irr = irrRaw != null ? Math.round(irrRaw * 1000) / 10 : null; // % to 1 dp
        return {
            fund_id: fund.id,
            fund_name: fund.fundName,
            fund_name_jp: fund.fundNameJp,
            manager: fund.manager,
            strategy: fund.strategy,
            vintage_year: fund.vintageYear,
            currency: fund.currency,
            commitment_usd: f(commitment),
            contract_commitment_usd: fund.contractCommitmentUsd ? f(new decimal_js_1.default(fund.contractCommitmentUsd.toString())) : null,
            total_called_usd: called,
            total_received_usd: received,
            total_called_jpy: f(totalCalledJpy),
            total_received_jpy: f(totalReceivedJpy),
            drawn_pct: f(snapshot.drawnPct),
            unfunded_usd: f(snapshot.unfundedUsd),
            investment_capacity: f(snapshot.investmentCapacity),
            net_cash_position: f(snapshot.netCashPosition),
            nav_usd: navUsd,
            total_value_usd: totalValue,
            moic: moic,
            tvpi: tvpi,
            irr: irr,
            dpi: f(snapshot.dpi),
            is_active: fund.isActive,
        };
    }
}
exports.CalculationEngine = CalculationEngine;
//# sourceMappingURL=calculationEngine.js.map