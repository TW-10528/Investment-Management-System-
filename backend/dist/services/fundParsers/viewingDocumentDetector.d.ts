export interface ViewingDocumentType {
    isViewingDoc: boolean;
    docType?: 'contract' | 'amendment' | 'audit' | 'financial_statement' | 'nav_report' | 'commitment_notice';
    reason?: string;
}
/**
 * Detect if a document is for viewing only (not a transaction).
 * Returns early to skip extraction for these document types.
 */
export declare function detectViewingDocument(text: string, fileName?: string): ViewingDocumentType;
//# sourceMappingURL=viewingDocumentDetector.d.ts.map