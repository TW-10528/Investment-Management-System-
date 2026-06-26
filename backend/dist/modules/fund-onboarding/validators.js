"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionDetailsResponseSchema = exports.templateDetailsResponseSchema = exports.templatesListResponseSchema = exports.correctionFeedbackRequestSchema = exports.completeResponseSchema = exports.saveTemplateResponseSchema = exports.saveTemplateRequestSchema = exports.validateResponseSchema = exports.validateRequestSchema = exports.calculatedResponseSchema = exports.extractResponseSchema = exports.extractRequestSchema = exports.classificationResponseSchema = exports.uploadResponseSchema = exports.uploadRequestSchema = void 0;
const zod_1 = require("zod");
// Upload request
exports.uploadRequestSchema = zod_1.z.object({
    file: zod_1.z.instanceof(File).refine((file) => file.type === 'application/pdf' || file.type.startsWith('image/'), 'File must be PDF or image'),
});
// Upload response
exports.uploadResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    fileName: zod_1.z.string(),
    fileHash: zod_1.z.string(),
    step: zod_1.z.literal(1),
    pdfPreview: zod_1.z.string().optional(),
});
// Classification response
exports.classificationResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    step: zod_1.z.literal(2),
    fundKey: zod_1.z.string(),
    fundDisplayName: zod_1.z.string(),
    reportType: zod_1.z.enum(['CAPITAL_CALL', 'DISTRIBUTION', 'VIEWING_DOCUMENT']),
    aiConfidence: zod_1.z.number().min(0).max(1),
    isKnownFund: zod_1.z.boolean(),
    suggestedTemplate: zod_1.z.string().optional(),
});
// Extract request
exports.extractRequestSchema = zod_1.z.object({
    B_capital_contribution: zod_1.z.number().optional(),
    C_distribution_received: zod_1.z.number().optional(),
    D_reinvestable: zod_1.z.number().optional(),
    transaction_date: zod_1.z.string().datetime().optional(),
    notes: zod_1.z.string().optional(),
});
// Extract response
exports.extractResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    step: zod_1.z.literal(3),
    extraction: zod_1.z.record(zod_1.z.unknown()),
    extractedValues: zod_1.z.record(zod_1.z.unknown()),
    userEdited: zod_1.z.boolean(),
});
// Calculated values response
exports.calculatedResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    step: zod_1.z.literal(4),
    extraction: zod_1.z.record(zod_1.z.unknown()),
    calculation: zod_1.z.record(zod_1.z.unknown()),
    prevState: zod_1.z.record(zod_1.z.unknown()).optional(),
});
// Validate request
exports.validateRequestSchema = zod_1.z.object({
    prevE: zod_1.z.number().optional(),
    prevF: zod_1.z.number().optional(),
    prevG: zod_1.z.number().optional(),
});
// Validate response
exports.validateResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    step: zod_1.z.literal(5),
    validationResults: zod_1.z.array(zod_1.z.object({
        rule: zod_1.z.string(),
        pass: zod_1.z.boolean(),
        detail: zod_1.z.string(),
    })),
    isValid: zod_1.z.boolean(),
    gateLevel: zod_1.z.enum(['auto', 'warning', 'review', 'reject']),
});
// Save template request
exports.saveTemplateRequestSchema = zod_1.z.object({
    templateName: zod_1.z.string().min(1),
    fundKey: zod_1.z.string().min(1),
    manager: zod_1.z.string().optional(),
    strategy: zod_1.z.string().optional(),
    isNewTemplate: zod_1.z.boolean(),
    templateId: zod_1.z.string().optional(),
});
// Save template response
exports.saveTemplateResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    step: zod_1.z.literal(6),
    templateId: zod_1.z.string().uuid(),
    message: zod_1.z.string(),
});
// Complete response
exports.completeResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    step: zod_1.z.literal(7),
    templateId: zod_1.z.string().uuid(),
    fundKey: zod_1.z.string(),
    status: zod_1.z.literal('completed'),
    message: zod_1.z.string(),
});
// Correction feedback request
exports.correctionFeedbackRequestSchema = zod_1.z.object({
    correctedFields: zod_1.z.array(zod_1.z.string()),
    originalValues: zod_1.z.record(zod_1.z.unknown()),
    correctedValues: zod_1.z.record(zod_1.z.unknown()),
    feedback: zod_1.z.string().optional(),
});
// Templates list response
exports.templatesListResponseSchema = zod_1.z.object({
    templates: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid(),
        templateName: zod_1.z.string(),
        fundKey: zod_1.z.string(),
        manager: zod_1.z.string().optional(),
        sampleCount: zod_1.z.number(),
        confidence: zod_1.z.number(),
        lastUpdated: zod_1.z.string().datetime(),
    })),
    total: zod_1.z.number(),
});
// Template details response
exports.templateDetailsResponseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    templateName: zod_1.z.string(),
    fundKey: zod_1.z.string(),
    manager: zod_1.z.string().optional(),
    strategy: zod_1.z.string().optional(),
    fundNameJp: zod_1.z.string().optional(),
    extractionSchema: zod_1.z.record(zod_1.z.unknown()),
    pdfLabels: zod_1.z.array(zod_1.z.object({
        fileName: zod_1.z.string(),
        fileHash: zod_1.z.string(),
        values: zod_1.z.record(zod_1.z.unknown()),
        extractionDate: zod_1.z.string().datetime(),
        extractedBy: zod_1.z.string().optional(),
    })),
    sampleCount: zod_1.z.number(),
    confidence: zod_1.z.number(),
    lastUpdated: zod_1.z.string().datetime(),
});
// Session details response
exports.sessionDetailsResponseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    fileName: zod_1.z.string(),
    fileHash: zod_1.z.string(),
    currentStep: zod_1.z.number(),
    fundKey: zod_1.z.string().optional(),
    fundDisplayName: zod_1.z.string().optional(),
    reportType: zod_1.z.string().optional(),
    extractedValues: zod_1.z.record(zod_1.z.unknown()).optional(),
    userEditedValues: zod_1.z.record(zod_1.z.unknown()).optional(),
    calculatedValues: zod_1.z.record(zod_1.z.unknown()).optional(),
    validationResults: zod_1.z.array(zod_1.z.record(zod_1.z.unknown())).optional(),
    status: zod_1.z.string(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
//# sourceMappingURL=validators.js.map