import { prisma } from '../../lib/prisma';
import {
  extractPdfTextForOnboarding,
  classifyDocument,
  extractValues,
} from './ai-extractor';
import {
  calculateDerivedValues,
  validateExtraction,
  determineValidationGate,
  performFullValidation,
} from './validation-engine';
import {
  createOrGetTemplate,
  getTemplateByFundKey,
  updateTemplateWithPdfLabel,
  upsertTemplate,
  getTemplateWithHistory,
} from './template-manager';
import { calculateFileHash, isDuplicatePdf } from './pdf-labeler';
import type {
  OnboardingSession,
  ExtractionResult,
  CalculatedValues,
  ClassificationResult,
} from './types';

/**
 * Initialize onboarding session
 */
export async function initializeSession(
  buffer: Buffer,
  fileName: string,
  userEmail?: string
): Promise<OnboardingSession> {
  const fileHash = calculateFileHash(buffer);

  // Check for duplicate
  const isDuplicate = await isDuplicatePdf(fileHash);
  if (isDuplicate) {
    throw new Error('This PDF has already been processed');
  }

  // Create session
  const session = await prisma.onboardingSession.create({
    data: {
      fileName,
      fileHash,
      currentStep: 1,
      status: 'in_progress',
      userEmail,
    },
  });

  return session as OnboardingSession;
}

/**
 * Step 1-2: Upload and classify document
 */
export async function uploadAndClassify(
  sessionId: string,
  buffer: Buffer
): Promise<{
  session: OnboardingSession;
  pdfText: string;
  classification: ClassificationResult;
}> {
  // Extract PDF text
  const pdfText = await extractPdfTextForOnboarding(buffer);

  if (!pdfText || pdfText.length < 20) {
    throw new Error('Could not extract sufficient text from PDF');
  }

  // Classify document
  const classification = await classifyDocument(pdfText);

  // Update session with classification
  const session = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      currentStep: 2,
      fundKey: classification.fundKey,
      fundDisplayName: classification.fundDisplayName,
      reportType: classification.reportType,
      aiConfidence: classification.aiConfidence,
    },
  });

  return {
    session: session as OnboardingSession,
    pdfText,
    classification,
  };
}

/**
 * Step 3: Extract values from document
 */
export async function extractDocumentValues(
  sessionId: string,
  pdfText: string,
  fundKey: string,
  userValues?: ExtractionResult
): Promise<{
  session: OnboardingSession;
  extracted: ExtractionResult;
  userEdited: boolean;
}> {
  let extracted: ExtractionResult;
  let userEdited = false;

  if (userValues && Object.values(userValues).some((v) => v !== undefined)) {
    // User provided overrides
    extracted = userValues;
    userEdited = true;
  } else {
    // Use AI extraction
    extracted = await extractValues(pdfText, fundKey);
  }

  // Store extracted values in session
  const session = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      currentStep: 3,
      extractedValues: extracted as any,
      userEditedValues: userEdited ? (extracted as any) : undefined,
    },
  });

  return {
    session: session as OnboardingSession,
    extracted,
    userEdited,
  };
}

/**
 * Step 4: Calculate derived values
 */
export async function calculateValues(
  sessionId: string,
  extractedValues: ExtractionResult,
  fundKey: string,
  previousE?: number,
  previousF?: number,
  previousG?: number
): Promise<{
  session: OnboardingSession;
  calculated: CalculatedValues;
}> {
  const calculated = calculateDerivedValues(
    extractedValues,
    fundKey,
    previousE ?? 0,
    previousF ?? 0,
    previousG ?? 0
  );

  const session = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      currentStep: 4,
      calculatedValues: calculated as any,
    },
  });

  return {
    session: session as OnboardingSession,
    calculated,
  };
}

/**
 * Step 5: Validate extraction and calculations
 */
export async function validateSession(
  sessionId: string,
  extractedValues: ExtractionResult,
  calculatedValues: CalculatedValues,
  fundKey: string
): Promise<{
  session: OnboardingSession;
  validationResults: Array<{ rule: string; pass: boolean; detail: string }>;
  gateLevel: 'auto' | 'warning' | 'review' | 'reject';
}> {
  const checks = validateExtraction(extractedValues, calculatedValues);
  const gate = determineValidationGate(checks);

  const session = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      currentStep: 5,
      validationResults: checks as any,
      status: gate.level === 'reject' ? 'rejected' : 'validated',
    },
  });

  return {
    session: session as OnboardingSession,
    validationResults: checks,
    gateLevel: gate.level,
  };
}

/**
 * Step 6: Save as template
 */
export async function saveAsTemplate(
  sessionId: string,
  extractedValues: ExtractionResult,
  templateName: string,
  fundKey: string,
  options?: {
    manager?: string;
    fundNameJp?: string;
    strategy?: string;
    isNewTemplate?: boolean;
    existingTemplateId?: string;
    createdBy?: string;
  }
): Promise<{
  session: OnboardingSession;
  templateId: string;
}> {
  let templateId = options?.existingTemplateId;

  if (options?.isNewTemplate || !templateId) {
    // Create new template
    const template = await upsertTemplate(fundKey, templateName, {
      manager: options?.manager,
      fundNameJp: options?.fundNameJp,
      strategy: options?.strategy,
      createdBy: options?.createdBy,
    });
    templateId = template.id;
  }

  if (!templateId) {
    throw new Error('Failed to create or retrieve template');
  }

  // Update session
  const session = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      currentStep: 6,
      templateId,
      isNewTemplate: options?.isNewTemplate || false,
    },
  });

  return {
    session: session as OnboardingSession,
    templateId,
  };
}

/**
 * Step 7: Complete onboarding and finalize
 */
export async function completeOnboarding(
  sessionId: string,
  templateId: string,
  fileName: string,
  fileHash: string,
  extractedValues: ExtractionResult,
  userEmail?: string
): Promise<OnboardingSession> {
  // Store PDF label for template learning
  await updateTemplateWithPdfLabel(
    templateId,
    fileName,
    fileHash,
    extractedValues as Record<string, unknown>,
    userEmail
  );

  // Finalize session
  const session = await prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      currentStep: 7,
      status: 'saved',
    },
  });

  return session as OnboardingSession;
}

/**
 * Get session state (for resuming workflows)
 */
export async function getSessionState(sessionId: string): Promise<OnboardingSession> {
  const session = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  return session as OnboardingSession;
}

/**
 * Record user correction feedback
 */
export async function recordCorrectionFeedback(
  sessionId: string,
  correctedFields: string[],
  originalValues: Record<string, unknown>,
  correctedValues: Record<string, unknown>,
  feedback?: string,
  userEmail?: string
): Promise<void> {
  await prisma.correctionFeedback.create({
    data: {
      sessionId,
      correctedFields,
      originalValues: originalValues as any,
      correctedValues: correctedValues as any,
      feedback,
      createdBy: userEmail,
    },
  });
}

/**
 * Full workflow validation (extract → calculate → validate → gate)
 */
export async function performWorkflowValidation(
  extractedValues: ExtractionResult,
  fundKey: string,
  previousE?: number,
  previousF?: number,
  previousG?: number,
  reportedNetWire?: number
): Promise<{
  calculated: CalculatedValues;
  checks: Array<{ rule: string; pass: boolean; detail: string }>;
  gate: { level: 'auto' | 'warning' | 'review' | 'reject'; label: string; color: string };
}> {
  const result = performFullValidation(
    extractedValues,
    fundKey,
    previousE,
    previousF,
    previousG,
    reportedNetWire
  );

  return {
    calculated: result.calculated,
    checks: result.checks,
    gate: {
      level: result.gate.level,
      label: result.gate.label,
      color: result.gate.color,
    },
  };
}
