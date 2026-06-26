export interface FundTemplate {
    id: string;
    templateName: string;
    fundKey: string;
    manager?: string;
    fundNameJp?: string;
    strategy?: string;
    extractionSchema: Record<string, unknown>;
    sampleCount: number;
    confidence: number;
    createdBy?: string;
    createdAt: Date;
    lastUpdated: Date;
}
export interface PdfLabel {
    id: string;
    templateId: string;
    fileName: string;
    fileHash: string;
    values: Record<string, unknown>;
    extractionDate: Date;
    extractedBy?: string;
    pdfStoragePath?: string;
    validationLog?: Record<string, unknown>;
    createdAt: Date;
}
export interface OnboardingSession {
    id: string;
    fileName: string;
    fileHash: string;
    currentStep: number;
    fundKey?: string;
    fundDisplayName?: string;
    reportType?: string;
    aiConfidence?: number;
    extractedValues?: Record<string, unknown>;
    userEditedValues?: Record<string, unknown>;
    calculatedValues?: Record<string, unknown>;
    validationResults?: Record<string, unknown>[];
    templateId?: string;
    isNewTemplate: boolean;
    status: 'in_progress' | 'validated' | 'saved' | 'rejected';
    errorMessage?: string;
    userId?: string;
    userEmail?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface CorrectionFeedback {
    id: string;
    sessionId: string;
    correctedFields: string[];
    originalValues: Record<string, unknown>;
    correctedValues: Record<string, unknown>;
    feedback?: string;
    accepted: boolean;
    aiAnalysis?: Record<string, unknown>;
    createdBy?: string;
    createdAt: Date;
}
export interface ExtractionResult {
    B_capital_contribution?: number;
    C_distribution_received?: number;
    D_reinvestable?: number;
    transaction_date?: string;
    notes?: string;
    [key: string]: unknown;
}
export interface CalculatedValues {
    E_cumulative_drawn: number;
    F_investment_capacity: number;
    G_net_cash_flow: number;
    [key: string]: unknown;
}
export interface ValidationCheck {
    rule: string;
    pass: boolean;
    detail: string;
}
export interface ClassificationResult {
    fundKey: string;
    fundDisplayName: string;
    reportType: 'CAPITAL_CALL' | 'DISTRIBUTION' | 'VIEWING_DOCUMENT';
    isKnownFund: boolean;
    aiConfidence: number;
    suggestedTemplate?: string;
}
export interface OnboardingStepResponse {
    sessionId: string;
    step: number;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map