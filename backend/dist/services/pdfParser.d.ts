/**
 * PDF Parser Service — Advanced extraction for fund management documents.
 * Handles: Capital Call Notices, Distribution Notices, Financial Statements,
 *          and Combined Capital Call + Distribution notices.
 *
 * Key patterns learned:
 *   - "Capital Call and Deemed Distribution" → combined type
 *   - "Net Amount of Capital Call $X" → netCallUsd
 *   - "Amount of Capital Call $X" → grossCallUsd
 *   - "Project [Name]" → investment targets with sector/geography inference
 *   - Wire instructions: Bank, ABA, SWIFT, Account Name, Account Number
 *   - LP ID: "LPID[0-9]+" or "LP ID Number"
 *   - Commitment summary: "Commitment Amount $X", "Total Capital Called", "Unfunded Commitment"
 */
export interface WireInstructions {
    bank?: string;
    aba?: string;
    swift?: string;
    accountName?: string;
    accountNumber?: string;
    reference?: string;
}
export interface CommitmentSummary {
    commitmentUsd?: number;
    totalCalledUsd?: number;
    totalCalledPct?: number;
    unfundedUsd?: number;
    unfundedPct?: number;
    totalDistributionsUsd?: number;
    distributionMultiple?: number;
}
export interface InvestmentTarget {
    projectName: string;
    actualName?: string;
    amountUsd?: number;
    investmentType?: string;
    sector?: string;
    geography?: string;
    dealType?: string;
    description?: string;
}
export interface DistributionBreakdown {
    capitalReturnUsd?: number;
    incomeUsd?: number;
    recallableUsd?: number;
    totalUsd?: number;
    sources?: Array<{
        name: string;
        capitalReturn: number;
        gain: number;
        total: number;
    }>;
}
export interface ExtractedNotice {
    noticeType: 'capital_call' | 'distribution' | 'financial_statement';
    isCombined?: boolean;
    confidence: number;
    confidenceGrade: 'high' | 'medium' | 'low';
    fundName?: string;
    lpId?: string;
    amounts: number[];
    dates: string[];
    keywords: string[];
    grossCallUsd?: number;
    netCallUsd?: number;
    deemedDistUsd?: number;
    reinvestableUsd?: number;
    managementFeeUsd?: number;
    expenseUsd?: number;
    investmentAmountUsd?: number;
    callNumber?: number;
    callPct?: number;
    cumulativePct?: number;
    dueDate?: string;
    fxRate?: number;
    wireReference?: string;
    wireInstructions?: WireInstructions;
    commitmentSummary?: CommitmentSummary;
    distributionUsd?: number;
    distributionDate?: string;
    distributionBreakdown?: DistributionBreakdown;
    navUsd?: number;
    navDate?: string;
    period?: string;
    irr?: number;
    tvpi?: number;
    dpi?: number;
    investmentTargets?: InvestmentTarget[];
}
export declare function extractByKeyword(text: string, keywords: string[], extractionType: 'usd' | 'pct' | 'number' | 'date' | 'text'): string | number | undefined;
export declare function parsePdf(buffer: Buffer): Promise<ExtractedNotice>;
//# sourceMappingURL=pdfParser.d.ts.map