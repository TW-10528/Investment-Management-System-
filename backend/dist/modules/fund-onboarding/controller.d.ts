import type { OnboardingSession, ExtractionResult, CalculatedValues, ClassificationResult } from './types';
/**
 * Initialize onboarding session
 */
export declare function initializeSession(buffer: Buffer, fileName: string, userEmail?: string): Promise<OnboardingSession>;
/**
 * Step 1-2: Upload and classify document
 */
export declare function uploadAndClassify(sessionId: string, buffer: Buffer): Promise<{
    session: OnboardingSession;
    pdfText: string;
    classification: ClassificationResult;
}>;
/**
 * Step 3: Extract values from document
 */
export declare function extractDocumentValues(sessionId: string, pdfText: string, fundKey: string, userValues?: ExtractionResult): Promise<{
    session: OnboardingSession;
    extracted: ExtractionResult;
    userEdited: boolean;
}>;
/**
 * Step 4: Calculate derived values
 */
export declare function calculateValues(sessionId: string, extractedValues: ExtractionResult, fundKey: string, previousE?: number, previousF?: number, previousG?: number): Promise<{
    session: OnboardingSession;
    calculated: CalculatedValues;
}>;
/**
 * Step 5: Validate extraction and calculations
 */
export declare function validateSession(sessionId: string, extractedValues: ExtractionResult, calculatedValues: CalculatedValues, fundKey: string): Promise<{
    session: OnboardingSession;
    validationResults: Array<{
        rule: string;
        pass: boolean;
        detail: string;
    }>;
    gateLevel: 'auto' | 'warning' | 'review' | 'reject';
}>;
/**
 * Step 6: Save as template
 */
export declare function saveAsTemplate(sessionId: string, extractedValues: ExtractionResult, templateName: string, fundKey: string, options?: {
    manager?: string;
    fundNameJp?: string;
    strategy?: string;
    isNewTemplate?: boolean;
    existingTemplateId?: string;
    createdBy?: string;
}): Promise<{
    session: OnboardingSession;
    templateId: string;
}>;
/**
 * Step 7: Complete onboarding and finalize
 */
export declare function completeOnboarding(sessionId: string, templateId: string, fileName: string, fileHash: string, extractedValues: ExtractionResult, userEmail?: string): Promise<OnboardingSession>;
/**
 * Get session state (for resuming workflows)
 */
export declare function getSessionState(sessionId: string): Promise<OnboardingSession>;
/**
 * Record user correction feedback
 */
export declare function recordCorrectionFeedback(sessionId: string, correctedFields: string[], originalValues: Record<string, unknown>, correctedValues: Record<string, unknown>, feedback?: string, userEmail?: string): Promise<void>;
/**
 * Full workflow validation (extract → calculate → validate → gate)
 */
export declare function performWorkflowValidation(extractedValues: ExtractionResult, fundKey: string, previousE?: number, previousF?: number, previousG?: number, reportedNetWire?: number): Promise<{
    calculated: CalculatedValues;
    checks: Array<{
        rule: string;
        pass: boolean;
        detail: string;
    }>;
    gate: {
        level: 'auto' | 'warning' | 'review' | 'reject';
        label: string;
        color: string;
    };
}>;
//# sourceMappingURL=controller.d.ts.map