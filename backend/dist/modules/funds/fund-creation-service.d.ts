/**
 * Fund Creation Service
 * Handles creating new funds from extracted data with auto-processing
 */
import type { FundExtractionResult } from './unknown-fund-extractor';
export interface CreateFundRequest {
    extractedData: FundExtractionResult;
    userEditedFundData: {
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
    userEditedDocumentData: {
        documentType: string;
        customDocType?: string;
        amount?: number;
        noticeDate?: string;
        dueDate?: string;
    };
    pdfData: {
        fileName: string;
        fileHash: string;
        filePath: string;
    };
    userEmail?: string;
    userCorrectedFields: string[];
}
/**
 * Create a new fund from extracted data
 * This also:
 * - Creates FundTemplate for learning
 * - Stores extraction template in Fund.aiExtractionTemplate
 * - Auto-creates Capital Call/Distribution
 * - Creates FundReport
 */
export declare function createFundFromExtraction(req: CreateFundRequest): Promise<{
    fund: any;
    fundReport: any;
    capitalCall?: any;
    distribution?: any;
}>;
/**
 * Update fund's extraction template when user edits data
 * This teaches the AI for future extractions
 */
export declare function updateFundExtractionTemplate(fundId: string, editedData: Record<string, any>, correctedFields: string[]): Promise<void>;
//# sourceMappingURL=fund-creation-service.d.ts.map