export interface ResolvedFund {
    id: string;
    fundName: string;
    commitmentUsd: number;
}
/**
 * Find the Fund DB record for a given fundKey.
 * Searches by fund name (case-insensitive) using the patterns above.
 * Returns null if no matching fund exists in the DB yet.
 */
export declare function resolveFund(fundKey: string): Promise<ResolvedFund | null>;
//# sourceMappingURL=fund-resolver.d.ts.map