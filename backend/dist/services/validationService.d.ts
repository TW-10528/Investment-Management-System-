export type FlagSeverity = 'error' | 'warning' | 'info';
export interface ValidationFlag {
    field: string;
    severity: FlagSeverity;
    message: string;
    expected?: string;
    actual?: string;
}
export interface HistoricalContext {
    callCount: number;
    avgGrossCallUsd: number;
    stdGrossCallUsd: number;
    avgManagementFeeUsd: number;
    avgCallPct: number;
    avgDaysBetweenCalls: number;
    lastCallNumber: number;
    lastCumulativePct: number;
    commitmentUsdInDb: number;
}
export interface ValidationResult {
    ran: boolean;
    overallRisk: 'low' | 'medium' | 'high';
    flags: ValidationFlag[];
    historicalContext: HistoricalContext | null;
    summary: string;
    validatedAt: string;
}
export declare function validateExtractedNotice(fundId: string | null, extractedData: Record<string, any>, noticeType: string): Promise<ValidationResult>;
//# sourceMappingURL=validationService.d.ts.map