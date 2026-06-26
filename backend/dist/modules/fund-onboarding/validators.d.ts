import { z } from 'zod';
export declare const uploadRequestSchema: z.ZodObject<{
    file: z.ZodEffects<z.ZodType<import("buffer").File, z.ZodTypeDef, import("buffer").File>, import("buffer").File, import("buffer").File>;
}, "strip", z.ZodTypeAny, {
    file: import("buffer").File;
}, {
    file: import("buffer").File;
}>;
export type UploadRequest = z.infer<typeof uploadRequestSchema>;
export declare const uploadResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    fileName: z.ZodString;
    fileHash: z.ZodString;
    step: z.ZodLiteral<1>;
    pdfPreview: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    step: 1;
    fileName: string;
    fileHash: string;
    pdfPreview?: string | undefined;
}, {
    sessionId: string;
    step: 1;
    fileName: string;
    fileHash: string;
    pdfPreview?: string | undefined;
}>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export declare const classificationResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    step: z.ZodLiteral<2>;
    fundKey: z.ZodString;
    fundDisplayName: z.ZodString;
    reportType: z.ZodEnum<["CAPITAL_CALL", "DISTRIBUTION", "VIEWING_DOCUMENT"]>;
    aiConfidence: z.ZodNumber;
    isKnownFund: z.ZodBoolean;
    suggestedTemplate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fundKey: string;
    sessionId: string;
    step: 2;
    reportType: "CAPITAL_CALL" | "DISTRIBUTION" | "VIEWING_DOCUMENT";
    isKnownFund: boolean;
    fundDisplayName: string;
    aiConfidence: number;
    suggestedTemplate?: string | undefined;
}, {
    fundKey: string;
    sessionId: string;
    step: 2;
    reportType: "CAPITAL_CALL" | "DISTRIBUTION" | "VIEWING_DOCUMENT";
    isKnownFund: boolean;
    fundDisplayName: string;
    aiConfidence: number;
    suggestedTemplate?: string | undefined;
}>;
export type ClassificationResponse = z.infer<typeof classificationResponseSchema>;
export declare const extractRequestSchema: z.ZodObject<{
    B_capital_contribution: z.ZodOptional<z.ZodNumber>;
    C_distribution_received: z.ZodOptional<z.ZodNumber>;
    D_reinvestable: z.ZodOptional<z.ZodNumber>;
    transaction_date: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    notes?: string | undefined;
    transaction_date?: string | undefined;
    B_capital_contribution?: number | undefined;
    C_distribution_received?: number | undefined;
    D_reinvestable?: number | undefined;
}, {
    notes?: string | undefined;
    transaction_date?: string | undefined;
    B_capital_contribution?: number | undefined;
    C_distribution_received?: number | undefined;
    D_reinvestable?: number | undefined;
}>;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export declare const extractResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    step: z.ZodLiteral<3>;
    extraction: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    extractedValues: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    userEdited: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    step: 3;
    extraction: Record<string, unknown>;
    extractedValues: Record<string, unknown>;
    userEdited: boolean;
}, {
    sessionId: string;
    step: 3;
    extraction: Record<string, unknown>;
    extractedValues: Record<string, unknown>;
    userEdited: boolean;
}>;
export type ExtractResponse = z.infer<typeof extractResponseSchema>;
export declare const calculatedResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    step: z.ZodLiteral<4>;
    extraction: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    calculation: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    prevState: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    step: 4;
    extraction: Record<string, unknown>;
    calculation: Record<string, unknown>;
    prevState?: Record<string, unknown> | undefined;
}, {
    sessionId: string;
    step: 4;
    extraction: Record<string, unknown>;
    calculation: Record<string, unknown>;
    prevState?: Record<string, unknown> | undefined;
}>;
export type CalculatedResponse = z.infer<typeof calculatedResponseSchema>;
export declare const validateRequestSchema: z.ZodObject<{
    prevE: z.ZodOptional<z.ZodNumber>;
    prevF: z.ZodOptional<z.ZodNumber>;
    prevG: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    prevE?: number | undefined;
    prevF?: number | undefined;
    prevG?: number | undefined;
}, {
    prevE?: number | undefined;
    prevF?: number | undefined;
    prevG?: number | undefined;
}>;
export type ValidateRequest = z.infer<typeof validateRequestSchema>;
export declare const validateResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    step: z.ZodLiteral<5>;
    validationResults: z.ZodArray<z.ZodObject<{
        rule: z.ZodString;
        pass: z.ZodBoolean;
        detail: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        detail: string;
        pass: boolean;
        rule: string;
    }, {
        detail: string;
        pass: boolean;
        rule: string;
    }>, "many">;
    isValid: z.ZodBoolean;
    gateLevel: z.ZodEnum<["auto", "warning", "review", "reject"]>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    step: 5;
    validationResults: {
        detail: string;
        pass: boolean;
        rule: string;
    }[];
    gateLevel: "reject" | "warning" | "auto" | "review";
    isValid: boolean;
}, {
    sessionId: string;
    step: 5;
    validationResults: {
        detail: string;
        pass: boolean;
        rule: string;
    }[];
    gateLevel: "reject" | "warning" | "auto" | "review";
    isValid: boolean;
}>;
export type ValidateResponse = z.infer<typeof validateResponseSchema>;
export declare const saveTemplateRequestSchema: z.ZodObject<{
    templateName: z.ZodString;
    fundKey: z.ZodString;
    manager: z.ZodOptional<z.ZodString>;
    strategy: z.ZodOptional<z.ZodString>;
    isNewTemplate: z.ZodBoolean;
    templateId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    templateName: string;
    fundKey: string;
    isNewTemplate: boolean;
    manager?: string | undefined;
    strategy?: string | undefined;
    templateId?: string | undefined;
}, {
    templateName: string;
    fundKey: string;
    isNewTemplate: boolean;
    manager?: string | undefined;
    strategy?: string | undefined;
    templateId?: string | undefined;
}>;
export type SaveTemplateRequest = z.infer<typeof saveTemplateRequestSchema>;
export declare const saveTemplateResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    step: z.ZodLiteral<6>;
    templateId: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    sessionId: string;
    step: 6;
    templateId: string;
}, {
    message: string;
    sessionId: string;
    step: 6;
    templateId: string;
}>;
export type SaveTemplateResponse = z.infer<typeof saveTemplateResponseSchema>;
export declare const completeResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    step: z.ZodLiteral<7>;
    templateId: z.ZodString;
    fundKey: z.ZodString;
    status: z.ZodLiteral<"completed">;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "completed";
    message: string;
    fundKey: string;
    sessionId: string;
    step: 7;
    templateId: string;
}, {
    status: "completed";
    message: string;
    fundKey: string;
    sessionId: string;
    step: 7;
    templateId: string;
}>;
export type CompleteResponse = z.infer<typeof completeResponseSchema>;
export declare const correctionFeedbackRequestSchema: z.ZodObject<{
    correctedFields: z.ZodArray<z.ZodString, "many">;
    originalValues: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    correctedValues: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    feedback: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    correctedFields: string[];
    originalValues: Record<string, unknown>;
    correctedValues: Record<string, unknown>;
    feedback?: string | undefined;
}, {
    correctedFields: string[];
    originalValues: Record<string, unknown>;
    correctedValues: Record<string, unknown>;
    feedback?: string | undefined;
}>;
export type CorrectionFeedbackRequest = z.infer<typeof correctionFeedbackRequestSchema>;
export declare const templatesListResponseSchema: z.ZodObject<{
    templates: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        templateName: z.ZodString;
        fundKey: z.ZodString;
        manager: z.ZodOptional<z.ZodString>;
        sampleCount: z.ZodNumber;
        confidence: z.ZodNumber;
        lastUpdated: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        templateName: string;
        fundKey: string;
        sampleCount: number;
        lastUpdated: string;
        confidence: number;
        manager?: string | undefined;
    }, {
        id: string;
        templateName: string;
        fundKey: string;
        sampleCount: number;
        lastUpdated: string;
        confidence: number;
        manager?: string | undefined;
    }>, "many">;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    templates: {
        id: string;
        templateName: string;
        fundKey: string;
        sampleCount: number;
        lastUpdated: string;
        confidence: number;
        manager?: string | undefined;
    }[];
    total: number;
}, {
    templates: {
        id: string;
        templateName: string;
        fundKey: string;
        sampleCount: number;
        lastUpdated: string;
        confidence: number;
        manager?: string | undefined;
    }[];
    total: number;
}>;
export type TemplatesListResponse = z.infer<typeof templatesListResponseSchema>;
export declare const templateDetailsResponseSchema: z.ZodObject<{
    id: z.ZodString;
    templateName: z.ZodString;
    fundKey: z.ZodString;
    manager: z.ZodOptional<z.ZodString>;
    strategy: z.ZodOptional<z.ZodString>;
    fundNameJp: z.ZodOptional<z.ZodString>;
    extractionSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    pdfLabels: z.ZodArray<z.ZodObject<{
        fileName: z.ZodString;
        fileHash: z.ZodString;
        values: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        extractionDate: z.ZodString;
        extractedBy: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        values: Record<string, unknown>;
        fileName: string;
        fileHash: string;
        extractionDate: string;
        extractedBy?: string | undefined;
    }, {
        values: Record<string, unknown>;
        fileName: string;
        fileHash: string;
        extractionDate: string;
        extractedBy?: string | undefined;
    }>, "many">;
    sampleCount: z.ZodNumber;
    confidence: z.ZodNumber;
    lastUpdated: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    templateName: string;
    fundKey: string;
    extractionSchema: Record<string, unknown>;
    sampleCount: number;
    lastUpdated: string;
    confidence: number;
    pdfLabels: {
        values: Record<string, unknown>;
        fileName: string;
        fileHash: string;
        extractionDate: string;
        extractedBy?: string | undefined;
    }[];
    manager?: string | undefined;
    strategy?: string | undefined;
    fundNameJp?: string | undefined;
}, {
    id: string;
    templateName: string;
    fundKey: string;
    extractionSchema: Record<string, unknown>;
    sampleCount: number;
    lastUpdated: string;
    confidence: number;
    pdfLabels: {
        values: Record<string, unknown>;
        fileName: string;
        fileHash: string;
        extractionDate: string;
        extractedBy?: string | undefined;
    }[];
    manager?: string | undefined;
    strategy?: string | undefined;
    fundNameJp?: string | undefined;
}>;
export type TemplateDetailsResponse = z.infer<typeof templateDetailsResponseSchema>;
export declare const sessionDetailsResponseSchema: z.ZodObject<{
    id: z.ZodString;
    fileName: z.ZodString;
    fileHash: z.ZodString;
    currentStep: z.ZodNumber;
    fundKey: z.ZodOptional<z.ZodString>;
    fundDisplayName: z.ZodOptional<z.ZodString>;
    reportType: z.ZodOptional<z.ZodString>;
    extractedValues: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    userEditedValues: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    calculatedValues: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    validationResults: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    status: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    fileName: string;
    fileHash: string;
    currentStep: number;
    fundKey?: string | undefined;
    reportType?: string | undefined;
    fundDisplayName?: string | undefined;
    extractedValues?: Record<string, unknown> | undefined;
    userEditedValues?: Record<string, unknown> | undefined;
    calculatedValues?: Record<string, unknown> | undefined;
    validationResults?: Record<string, unknown>[] | undefined;
}, {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    fileName: string;
    fileHash: string;
    currentStep: number;
    fundKey?: string | undefined;
    reportType?: string | undefined;
    fundDisplayName?: string | undefined;
    extractedValues?: Record<string, unknown> | undefined;
    userEditedValues?: Record<string, unknown> | undefined;
    calculatedValues?: Record<string, unknown> | undefined;
    validationResults?: Record<string, unknown>[] | undefined;
}>;
export type SessionDetailsResponse = z.infer<typeof sessionDetailsResponseSchema>;
//# sourceMappingURL=validators.d.ts.map