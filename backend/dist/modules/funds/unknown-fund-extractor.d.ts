/**
 * Unknown Fund Extraction Service
 * Handles AI extraction for unknown funds with context from fund-onboarding module
 */
export interface FundExtractionResult {
    fundData: {
        fundName: string;
        manager?: string;
        strategy?: string;
        vintageYear?: number;
        currency: string;
        commitmentUsd?: number;
        entryFxRate?: number;
        managementFeePct?: number;
        carryPct?: number;
        hurdleRatePct?: number;
    };
    documentData: {
        documentType: string;
        amount?: number;
        noticeDate?: string;
        dueDate?: string;
        transactionDate?: string;
    };
    extractionConfidence: number;
    rawExtraction: Record<string, any>;
}
/**
 * Extract data for unknown fund from PDF
 */
export declare function extractUnknownFundData(buffer: Buffer, fileName: string): Promise<FundExtractionResult>;
/**
 * Get AI context from existing fund template (for learning)
 * If fund was created before, use previous extraction data as context
 */
export declare function getFundExtractionContext(fundName: string): Promise<Record<string, any> | null>;
//# sourceMappingURL=unknown-fund-extractor.d.ts.map