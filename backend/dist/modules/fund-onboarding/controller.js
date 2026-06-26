"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSession = initializeSession;
exports.uploadAndClassify = uploadAndClassify;
exports.extractDocumentValues = extractDocumentValues;
exports.calculateValues = calculateValues;
exports.validateSession = validateSession;
exports.saveAsTemplate = saveAsTemplate;
exports.completeOnboarding = completeOnboarding;
exports.getSessionState = getSessionState;
exports.recordCorrectionFeedback = recordCorrectionFeedback;
exports.performWorkflowValidation = performWorkflowValidation;
const prisma_1 = require("../../lib/prisma");
const ai_extractor_1 = require("./ai-extractor");
const validation_engine_1 = require("./validation-engine");
const template_manager_1 = require("./template-manager");
const pdf_labeler_1 = require("./pdf-labeler");
/**
 * Initialize onboarding session
 */
async function initializeSession(buffer, fileName, userEmail) {
    const fileHash = (0, pdf_labeler_1.calculateFileHash)(buffer);
    // Check for duplicate
    const isDuplicate = await (0, pdf_labeler_1.isDuplicatePdf)(fileHash);
    if (isDuplicate) {
        throw new Error('This PDF has already been processed');
    }
    // Create session
    const session = await prisma_1.prisma.onboardingSession.create({
        data: {
            fileName,
            fileHash,
            currentStep: 1,
            status: 'in_progress',
            userEmail,
        },
    });
    return session;
}
/**
 * Step 1-2: Upload and classify document
 */
async function uploadAndClassify(sessionId, buffer) {
    // Extract PDF text
    const pdfText = await (0, ai_extractor_1.extractPdfTextForOnboarding)(buffer);
    if (!pdfText || pdfText.length < 20) {
        throw new Error('Could not extract sufficient text from PDF');
    }
    // Classify document
    const classification = await (0, ai_extractor_1.classifyDocument)(pdfText);
    // Update session with classification
    const session = await prisma_1.prisma.onboardingSession.update({
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
        session: session,
        pdfText,
        classification,
    };
}
/**
 * Step 3: Extract values from document
 */
async function extractDocumentValues(sessionId, pdfText, fundKey, userValues) {
    let extracted;
    let userEdited = false;
    if (userValues && Object.values(userValues).some((v) => v !== undefined)) {
        // User provided overrides
        extracted = userValues;
        userEdited = true;
    }
    else {
        // Use AI extraction
        extracted = await (0, ai_extractor_1.extractValues)(pdfText, fundKey);
    }
    // Store extracted values in session
    const session = await prisma_1.prisma.onboardingSession.update({
        where: { id: sessionId },
        data: {
            currentStep: 3,
            extractedValues: extracted,
            userEditedValues: userEdited ? extracted : undefined,
        },
    });
    return {
        session: session,
        extracted,
        userEdited,
    };
}
/**
 * Step 4: Calculate derived values
 */
async function calculateValues(sessionId, extractedValues, fundKey, previousE, previousF, previousG) {
    const calculated = (0, validation_engine_1.calculateDerivedValues)(extractedValues, fundKey, previousE ?? 0, previousF ?? 0, previousG ?? 0);
    const session = await prisma_1.prisma.onboardingSession.update({
        where: { id: sessionId },
        data: {
            currentStep: 4,
            calculatedValues: calculated,
        },
    });
    return {
        session: session,
        calculated,
    };
}
/**
 * Step 5: Validate extraction and calculations
 */
async function validateSession(sessionId, extractedValues, calculatedValues, fundKey) {
    const checks = (0, validation_engine_1.validateExtraction)(extractedValues, calculatedValues);
    const gate = (0, validation_engine_1.determineValidationGate)(checks);
    const session = await prisma_1.prisma.onboardingSession.update({
        where: { id: sessionId },
        data: {
            currentStep: 5,
            validationResults: checks,
            status: gate.level === 'reject' ? 'rejected' : 'validated',
        },
    });
    return {
        session: session,
        validationResults: checks,
        gateLevel: gate.level,
    };
}
/**
 * Step 6: Save as template
 */
async function saveAsTemplate(sessionId, extractedValues, templateName, fundKey, options) {
    let templateId = options?.existingTemplateId;
    if (options?.isNewTemplate || !templateId) {
        // Create new template
        const template = await (0, template_manager_1.upsertTemplate)(fundKey, templateName, {
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
    const session = await prisma_1.prisma.onboardingSession.update({
        where: { id: sessionId },
        data: {
            currentStep: 6,
            templateId,
            isNewTemplate: options?.isNewTemplate || false,
        },
    });
    return {
        session: session,
        templateId,
    };
}
/**
 * Step 7: Complete onboarding and finalize
 */
async function completeOnboarding(sessionId, templateId, fileName, fileHash, extractedValues, userEmail) {
    // Store PDF label for template learning
    await (0, template_manager_1.updateTemplateWithPdfLabel)(templateId, fileName, fileHash, extractedValues, userEmail);
    // Finalize session
    const session = await prisma_1.prisma.onboardingSession.update({
        where: { id: sessionId },
        data: {
            currentStep: 7,
            status: 'saved',
        },
    });
    return session;
}
/**
 * Get session state (for resuming workflows)
 */
async function getSessionState(sessionId) {
    const session = await prisma_1.prisma.onboardingSession.findUnique({
        where: { id: sessionId },
    });
    if (!session) {
        throw new Error('Session not found');
    }
    return session;
}
/**
 * Record user correction feedback
 */
async function recordCorrectionFeedback(sessionId, correctedFields, originalValues, correctedValues, feedback, userEmail) {
    await prisma_1.prisma.correctionFeedback.create({
        data: {
            sessionId,
            correctedFields,
            originalValues: originalValues,
            correctedValues: correctedValues,
            feedback,
            createdBy: userEmail,
        },
    });
}
/**
 * Full workflow validation (extract → calculate → validate → gate)
 */
async function performWorkflowValidation(extractedValues, fundKey, previousE, previousF, previousG, reportedNetWire) {
    const result = (0, validation_engine_1.performFullValidation)(extractedValues, fundKey, previousE, previousF, previousG, reportedNetWire);
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
//# sourceMappingURL=controller.js.map