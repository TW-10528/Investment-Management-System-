import { z } from 'zod';

// Upload request
export const uploadRequestSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => file.type === 'application/pdf' || file.type.startsWith('image/'),
    'File must be PDF or image'
  ),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

// Upload response
export const uploadResponseSchema = z.object({
  sessionId: z.string().uuid(),
  fileName: z.string(),
  fileHash: z.string(),
  step: z.literal(1),
  pdfPreview: z.string().optional(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

// Classification response
export const classificationResponseSchema = z.object({
  sessionId: z.string().uuid(),
  step: z.literal(2),
  fundKey: z.string(),
  fundDisplayName: z.string(),
  reportType: z.enum(['CAPITAL_CALL', 'DISTRIBUTION', 'VIEWING_DOCUMENT']),
  aiConfidence: z.number().min(0).max(1),
  isKnownFund: z.boolean(),
  suggestedTemplate: z.string().optional(),
});

export type ClassificationResponse = z.infer<typeof classificationResponseSchema>;

// Extract request
export const extractRequestSchema = z.object({
  B_capital_contribution: z.number().optional(),
  C_distribution_received: z.number().optional(),
  D_reinvestable: z.number().optional(),
  transaction_date: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type ExtractRequest = z.infer<typeof extractRequestSchema>;

// Extract response
export const extractResponseSchema = z.object({
  sessionId: z.string().uuid(),
  step: z.literal(3),
  extraction: z.record(z.unknown()),
  extractedValues: z.record(z.unknown()),
  userEdited: z.boolean(),
});

export type ExtractResponse = z.infer<typeof extractResponseSchema>;

// Calculated values response
export const calculatedResponseSchema = z.object({
  sessionId: z.string().uuid(),
  step: z.literal(4),
  extraction: z.record(z.unknown()),
  calculation: z.record(z.unknown()),
  prevState: z.record(z.unknown()).optional(),
});

export type CalculatedResponse = z.infer<typeof calculatedResponseSchema>;

// Validate request
export const validateRequestSchema = z.object({
  prevE: z.number().optional(),
  prevF: z.number().optional(),
  prevG: z.number().optional(),
});

export type ValidateRequest = z.infer<typeof validateRequestSchema>;

// Validate response
export const validateResponseSchema = z.object({
  sessionId: z.string().uuid(),
  step: z.literal(5),
  validationResults: z.array(
    z.object({
      rule: z.string(),
      pass: z.boolean(),
      detail: z.string(),
    })
  ),
  isValid: z.boolean(),
  gateLevel: z.enum(['auto', 'warning', 'review', 'reject']),
});

export type ValidateResponse = z.infer<typeof validateResponseSchema>;

// Save template request
export const saveTemplateRequestSchema = z.object({
  templateName: z.string().min(1),
  fundKey: z.string().min(1),
  manager: z.string().optional(),
  strategy: z.string().optional(),
  isNewTemplate: z.boolean(),
  templateId: z.string().optional(),
});

export type SaveTemplateRequest = z.infer<typeof saveTemplateRequestSchema>;

// Save template response
export const saveTemplateResponseSchema = z.object({
  sessionId: z.string().uuid(),
  step: z.literal(6),
  templateId: z.string().uuid(),
  message: z.string(),
});

export type SaveTemplateResponse = z.infer<typeof saveTemplateResponseSchema>;

// Complete response
export const completeResponseSchema = z.object({
  sessionId: z.string().uuid(),
  step: z.literal(7),
  templateId: z.string().uuid(),
  fundKey: z.string(),
  status: z.literal('completed'),
  message: z.string(),
});

export type CompleteResponse = z.infer<typeof completeResponseSchema>;

// Correction feedback request
export const correctionFeedbackRequestSchema = z.object({
  correctedFields: z.array(z.string()),
  originalValues: z.record(z.unknown()),
  correctedValues: z.record(z.unknown()),
  feedback: z.string().optional(),
});

export type CorrectionFeedbackRequest = z.infer<typeof correctionFeedbackRequestSchema>;

// Templates list response
export const templatesListResponseSchema = z.object({
  templates: z.array(
    z.object({
      id: z.string().uuid(),
      templateName: z.string(),
      fundKey: z.string(),
      manager: z.string().optional(),
      sampleCount: z.number(),
      confidence: z.number(),
      lastUpdated: z.string().datetime(),
    })
  ),
  total: z.number(),
});

export type TemplatesListResponse = z.infer<typeof templatesListResponseSchema>;

// Template details response
export const templateDetailsResponseSchema = z.object({
  id: z.string().uuid(),
  templateName: z.string(),
  fundKey: z.string(),
  manager: z.string().optional(),
  strategy: z.string().optional(),
  fundNameJp: z.string().optional(),
  extractionSchema: z.record(z.unknown()),
  pdfLabels: z.array(
    z.object({
      fileName: z.string(),
      fileHash: z.string(),
      values: z.record(z.unknown()),
      extractionDate: z.string().datetime(),
      extractedBy: z.string().optional(),
    })
  ),
  sampleCount: z.number(),
  confidence: z.number(),
  lastUpdated: z.string().datetime(),
});

export type TemplateDetailsResponse = z.infer<typeof templateDetailsResponseSchema>;

// Session details response
export const sessionDetailsResponseSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  fileHash: z.string(),
  currentStep: z.number(),
  fundKey: z.string().optional(),
  fundDisplayName: z.string().optional(),
  reportType: z.string().optional(),
  extractedValues: z.record(z.unknown()).optional(),
  userEditedValues: z.record(z.unknown()).optional(),
  calculatedValues: z.record(z.unknown()).optional(),
  validationResults: z.array(z.record(z.unknown())).optional(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SessionDetailsResponse = z.infer<typeof sessionDetailsResponseSchema>;
