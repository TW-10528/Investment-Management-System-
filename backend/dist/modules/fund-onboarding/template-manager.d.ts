import type { FundTemplate } from './types';
/**
 * Create or get a fund template
 */
export declare function createOrGetTemplate(templateName: string, fundKey: string, options?: {
    manager?: string;
    fundNameJp?: string;
    strategy?: string;
    extractionSchema?: Record<string, unknown>;
    createdBy?: string;
}): Promise<FundTemplate>;
/**
 * Get template by fund key
 */
export declare function getTemplateByFundKey(fundKey: string): Promise<FundTemplate | null>;
/**
 * Get template by ID
 */
export declare function getTemplateById(templateId: string): Promise<FundTemplate | null>;
/**
 * List all templates with pagination
 */
export declare function listTemplates(limit?: number, offset?: number, search?: string): Promise<{
    templates: FundTemplate[];
    total: number;
}>;
/**
 * Update template with new PDF label and recalculate confidence
 */
export declare function updateTemplateWithPdfLabel(templateId: string, fileName: string, fileHash: string, extractedValues: Record<string, unknown>, extractedBy?: string, pdfStoragePath?: string, validationLog?: Record<string, unknown>): Promise<{
    template: FundTemplate;
    newConfidence: number;
}>;
/**
 * Update template extraction schema based on user feedback
 */
export declare function updateTemplateSchema(templateId: string, newSchema: Record<string, unknown>): Promise<FundTemplate>;
/**
 * Get template with all its PDF labels (learning history)
 */
export declare function getTemplateWithHistory(templateId: string): Promise<FundTemplate & {
    pdfLabels: any[];
}>;
/**
 * Search templates by name or fund key
 */
export declare function searchTemplates(query: string): Promise<FundTemplate[]>;
/**
 * Delete a template (cascade deletes its PDF labels)
 */
export declare function deleteTemplate(templateId: string): Promise<void>;
/**
 * Get templates with high confidence (ready for auto-processing)
 */
export declare function getHighConfidenceTemplates(minConfidence?: number): Promise<FundTemplate[]>;
/**
 * Upsert template: create if not exists, update if exists
 */
export declare function upsertTemplate(fundKey: string, templateName: string, options?: {
    manager?: string;
    fundNameJp?: string;
    strategy?: string;
    extractionSchema?: Record<string, unknown>;
    createdBy?: string;
}): Promise<FundTemplate>;
//# sourceMappingURL=template-manager.d.ts.map