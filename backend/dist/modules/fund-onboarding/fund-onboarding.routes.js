"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const controller = __importStar(require("./controller"));
const templateMgr = __importStar(require("./template-manager"));
const validators_1 = require("./validators");
const router = new hono_1.Hono();
// ── POST /api/v1/fund-onboarding/upload ──────────────────────────────────────
// Step 1: Upload PDF and initialize onboarding session
router.post('/upload', async (c) => {
    try {
        const body = await c.req.parseBody();
        const fileField = body['file'];
        if (!fileField || typeof fileField === 'string') {
            return c.json({ detail: 'No PDF file uploaded. Send multipart form with field "file".' }, 400);
        }
        const file = fileField;
        const buffer = Buffer.from(await file.arrayBuffer());
        const userEmail = c.req.header('X-User-Email');
        // Initialize session
        const session = await controller.initializeSession(buffer, file.name, userEmail);
        return c.json({
            sessionId: session.id,
            fileName: session.fileName,
            fileHash: session.fileHash,
            step: 1,
        });
    }
    catch (err) {
        console.error('[fund-onboarding] Upload error:', err);
        return c.json({ detail: err.message || 'Upload failed' }, err.message?.includes('duplicate') ? 409 : 400);
    }
});
// ── GET /api/v1/fund-onboarding/sessions/:sessionId/classification ──────────
// Step 2: Classify document (viewing vs transaction, known vs unknown fund)
router.get('/sessions/:sessionId/classification', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const session = await controller.getSessionState(sessionId);
        if (!session.fileHash) {
            return c.json({ detail: 'Session not properly initialized' }, 400);
        }
        // Note: In a real implementation, you'd retrieve the PDF buffer from storage
        // For now, we return a placeholder indicating the user should upload first
        return c.json({
            detail: 'Classification requires the PDF buffer. Use a POST request instead.',
            hint: 'Call POST /upload first, then POST /sessions/:sessionId/classify with the PDF.',
        }, 400);
    }
    catch (err) {
        return c.json({ detail: err.message || 'Classification failed' }, 500);
    }
});
// ── POST /api/v1/fund-onboarding/sessions/:sessionId/classify ──────────────
// Step 2: Classify document with PDF data
router.post('/sessions/:sessionId/classify', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const body = await c.req.parseBody();
        const fileField = body['file'];
        if (!fileField || typeof fileField === 'string') {
            return c.json({ detail: 'No PDF file. Send multipart form with field "file".' }, 400);
        }
        const file = fileField;
        const buffer = Buffer.from(await file.arrayBuffer());
        // Upload and classify
        const { session, classification } = await controller.uploadAndClassify(sessionId, buffer);
        return c.json({
            sessionId: session.id,
            step: 2,
            fundKey: classification.fundKey,
            fundDisplayName: classification.fundDisplayName,
            reportType: classification.reportType,
            aiConfidence: classification.aiConfidence,
            isKnownFund: classification.isKnownFund,
            suggestedTemplate: classification.isKnownFund
                ? classification.fundKey
                : undefined,
        });
    }
    catch (err) {
        console.error('[fund-onboarding] Classification error:', err);
        return c.json({ detail: err.message || 'Classification failed' }, 500);
    }
});
// ── POST /api/v1/fund-onboarding/sessions/:sessionId/extract ────────────────
// Step 3: Extract values (AI or user override)
router.post('/sessions/:sessionId/extract', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const session = await controller.getSessionState(sessionId);
        // Validate request
        const reqData = await c.req.json();
        const validated = validators_1.extractRequestSchema.partial().safeParse(reqData);
        if (!validated.success) {
            return c.json({ detail: 'Invalid request', errors: validated.error }, 400);
        }
        // For now, return placeholder (full implementation would require PDF buffer)
        return c.json({
            sessionId: session.id,
            step: 3,
            message: 'Extraction step placeholder - full implementation requires PDF buffer storage',
        });
    }
    catch (err) {
        return c.json({ detail: err.message || 'Extraction failed' }, 500);
    }
});
// ── GET /api/v1/fund-onboarding/sessions/:sessionId/calculated ──────────────
// Step 4: Get calculated derived values (read-only)
router.get('/sessions/:sessionId/calculated', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const session = await controller.getSessionState(sessionId);
        if (!session.extractedValues) {
            return c.json({ detail: 'No extracted values yet. Complete extraction step first.' }, 400);
        }
        const extracted = session.extractedValues;
        const calculated = await controller.calculateValues(sessionId, extracted, session.fundKey || 'UNKNOWN');
        return c.json({
            sessionId: session.id,
            step: 4,
            extraction: extracted,
            calculation: calculated.calculated,
            prevState: {
                E_prev: 0,
                F_prev: 0,
                G_prev: 0,
            },
        });
    }
    catch (err) {
        return c.json({ detail: err.message || 'Calculation failed' }, 500);
    }
});
// ── POST /api/v1/fund-onboarding/sessions/:sessionId/validate ──────────────
// Step 5: Validate extraction and calculations
router.post('/sessions/:sessionId/validate', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const session = await controller.getSessionState(sessionId);
        if (!session.extractedValues || !session.calculatedValues) {
            return c.json({ detail: 'Extraction and calculation must be complete first.' }, 400);
        }
        const extracted = session.extractedValues;
        const calculated = session.calculatedValues;
        const result = await controller.validateSession(sessionId, extracted, calculated, session.fundKey || 'UNKNOWN');
        return c.json({
            sessionId: session.id,
            step: 5,
            validationResults: result.validationResults,
            isValid: result.gateLevel !== 'reject',
            gateLevel: result.gateLevel,
        });
    }
    catch (err) {
        return c.json({ detail: err.message || 'Validation failed' }, 500);
    }
});
// ── POST /api/v1/fund-onboarding/sessions/:sessionId/save-template ──────────
// Step 6: Save as template
router.post('/sessions/:sessionId/save-template', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const session = await controller.getSessionState(sessionId);
        if (!session.extractedValues) {
            return c.json({ detail: 'Extracted values required before saving template.' }, 400);
        }
        const reqData = await c.req.json();
        const validated = validators_1.saveTemplateRequestSchema.safeParse(reqData);
        if (!validated.success) {
            return c.json({ detail: 'Invalid request', errors: validated.error }, 400);
        }
        const userEmail = c.req.header('X-User-Email');
        const { templateName, fundKey, manager, strategy, isNewTemplate, templateId } = validated.data;
        const result = await controller.saveAsTemplate(sessionId, session.extractedValues, templateName, fundKey, {
            manager,
            fundNameJp: undefined,
            strategy,
            isNewTemplate,
            existingTemplateId: templateId,
            createdBy: userEmail,
        });
        return c.json({
            sessionId: session.id,
            step: 6,
            templateId: result.templateId,
            message: 'Template saved successfully',
        });
    }
    catch (err) {
        console.error('[fund-onboarding] Save template error:', err);
        return c.json({ detail: err.message || 'Save failed' }, 500);
    }
});
// ── POST /api/v1/fund-onboarding/sessions/:sessionId/complete ───────────────
// Step 7: Complete onboarding
router.post('/sessions/:sessionId/complete', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const session = await controller.getSessionState(sessionId);
        if (!session.templateId) {
            return c.json({ detail: 'Template must be saved before completing.' }, 400);
        }
        const userEmail = c.req.header('X-User-Email');
        const completed = await controller.completeOnboarding(sessionId, session.templateId, session.fileName, session.fileHash, session.extractedValues, userEmail);
        return c.json({
            sessionId: completed.id,
            step: 7,
            templateId: session.templateId,
            fundKey: session.fundKey,
            status: 'completed',
            message: 'Fund onboarding complete. Template ready for future extractions.',
        });
    }
    catch (err) {
        console.error('[fund-onboarding] Complete error:', err);
        return c.json({ detail: err.message || 'Completion failed' }, 500);
    }
});
// ── GET /api/v1/fund-onboarding/templates ─────────────────────────────────
// Browse templates library
router.get('/templates', async (c) => {
    try {
        const limit = parseInt(c.req.query('limit') ?? '20', 10);
        const offset = parseInt(c.req.query('offset') ?? '0', 10);
        const search = c.req.query('search');
        const { templates, total } = await templateMgr.listTemplates(limit, offset, search);
        return c.json({
            templates: templates.map((t) => ({
                id: t.id,
                templateName: t.templateName,
                fundKey: t.fundKey,
                manager: t.manager,
                strategy: t.strategy,
                sampleCount: t.sampleCount,
                confidence: t.confidence,
                lastUpdated: t.lastUpdated.toISOString(),
            })),
            total,
        });
    }
    catch (err) {
        return c.json({ detail: err.message || 'Failed to list templates' }, 500);
    }
});
// ── GET /api/v1/fund-onboarding/templates/:templateId ──────────────────────
// Get template details with PDF labels
router.get('/templates/:templateId', async (c) => {
    try {
        const templateId = c.req.param('templateId');
        const template = await templateMgr.getTemplateWithHistory(templateId);
        return c.json({
            id: template.id,
            templateName: template.templateName,
            fundKey: template.fundKey,
            manager: template.manager,
            strategy: template.strategy,
            fundNameJp: template.fundNameJp,
            extractionSchema: template.extractionSchema,
            pdfLabels: (template.pdfLabels || []).map((label) => ({
                fileName: label.fileName,
                fileHash: label.fileHash,
                values: label.values,
                extractionDate: label.extractionDate.toISOString(),
                extractedBy: label.extractedBy,
            })),
            sampleCount: template.sampleCount,
            confidence: template.confidence,
            lastUpdated: template.lastUpdated.toISOString(),
        });
    }
    catch (err) {
        return c.json({ detail: err.message || 'Template not found' }, 404);
    }
});
// ── POST /api/v1/fund-onboarding/sessions/:sessionId/feedback ──────────────
// Record correction feedback for learning loop
router.post('/sessions/:sessionId/feedback', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const reqData = await c.req.json();
        const validated = validators_1.correctionFeedbackRequestSchema.safeParse(reqData);
        if (!validated.success) {
            return c.json({ detail: 'Invalid request', errors: validated.error }, 400);
        }
        const userEmail = c.req.header('X-User-Email');
        const { correctedFields, originalValues, correctedValues, feedback } = validated.data;
        await controller.recordCorrectionFeedback(sessionId, correctedFields, originalValues, correctedValues, feedback, userEmail);
        return c.json({
            message: 'Feedback recorded. AI will analyze this correction for template improvement.',
        });
    }
    catch (err) {
        return c.json({ detail: err.message || 'Feedback recording failed' }, 500);
    }
});
// ── GET /api/v1/fund-onboarding/sessions/:sessionId ───────────────────────
// Get session state (for resuming workflows)
router.get('/sessions/:sessionId', async (c) => {
    try {
        const sessionId = c.req.param('sessionId');
        const session = await controller.getSessionState(sessionId);
        return c.json({
            id: session.id,
            fileName: session.fileName,
            fileHash: session.fileHash,
            currentStep: session.currentStep,
            fundKey: session.fundKey,
            fundDisplayName: session.fundDisplayName,
            reportType: session.reportType,
            extractedValues: session.extractedValues,
            userEditedValues: session.userEditedValues,
            calculatedValues: session.calculatedValues,
            validationResults: session.validationResults,
            status: session.status,
            createdAt: session.createdAt.toISOString(),
            updatedAt: session.updatedAt.toISOString(),
        });
    }
    catch (err) {
        return c.json({ detail: err.message || 'Session not found' }, 404);
    }
});
exports.default = router;
//# sourceMappingURL=fund-onboarding.routes.js.map