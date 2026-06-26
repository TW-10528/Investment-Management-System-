import type { PdfLabel } from './types';
/**
 * Calculate SHA256 hash of PDF buffer
 */
export declare function calculateFileHash(buffer: Buffer): string;
/**
 * Store PDF label record with extracted values
 * This creates the learning data for the template improvement loop
 */
export declare function storePdfLabel(templateId: string, fileName: string, fileHash: string, extractedValues: Record<string, unknown>, extractedBy?: string, pdfStoragePath?: string, validationLog?: Record<string, unknown>): Promise<PdfLabel>;
/**
 * Get all PDF labels for a template (learning history)
 */
export declare function getTemplateLearningHistory(templateId: string): Promise<PdfLabel[]>;
/**
 * Update template confidence based on accumulated PDF labels
 * Higher confidence when we have consistent successful extractions
 */
export declare function updateTemplateConfidence(templateId: string): Promise<number>;
/**
 * Check if PDF has already been processed (duplicate detection)
 */
export declare function isDuplicatePdf(fileHash: string): Promise<boolean>;
/**
 * Get extraction schema from template for this fund
 * Returns the mapping of PDF labels to extracted fields
 */
export declare function getTemplateExtractionSchema(templateId: string): Promise<Record<string, unknown> | null>;
/**
 * Analyze learning history to detect inconsistencies
 * Returns fields that vary significantly across PDFs
 */
export declare function analyzeTemplateConsistency(templateId: string): Promise<{
    consistent: string[];
    inconsistent: string[];
    fieldStats: Record<string, any>;
}>;
//# sourceMappingURL=pdf-labeler.d.ts.map