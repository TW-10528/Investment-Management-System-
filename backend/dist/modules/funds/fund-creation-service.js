"use strict";
/**
 * Fund Creation Service
 * Handles creating new funds from extracted data with auto-processing
 */
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
exports.createFundFromExtraction = createFundFromExtraction;
exports.updateFundExtractionTemplate = updateFundExtractionTemplate;
const prisma_1 = require("../../lib/prisma");
const templateMgr = __importStar(require("../fund-onboarding/template-manager"));
const pdfLabeler = __importStar(require("../fund-onboarding/pdf-labeler"));
/**
 * Create a new fund from extracted data
 * This also:
 * - Creates FundTemplate for learning
 * - Stores extraction template in Fund.aiExtractionTemplate
 * - Auto-creates Capital Call/Distribution
 * - Creates FundReport
 */
async function createFundFromExtraction(req) {
    try {
        // 1. Create the Fund record
        const fund = await prisma_1.prisma.fund.create({
            data: {
                fundName: req.userEditedFundData.fundName,
                manager: req.userEditedFundData.manager,
                strategy: req.userEditedFundData.strategy,
                vintageYear: req.userEditedFundData.vintageYear,
                currency: req.userEditedFundData.currency,
                commitmentUsd: req.userEditedFundData.commitmentUsd || 0,
                entryFxRate: req.userEditedFundData.entryFxRate,
                managementFeePct: req.userEditedFundData.managementFeePct,
                carryPct: req.userEditedFundData.carryPct,
                hurdleRatePct: req.userEditedFundData.hurdleRatePct,
                // Store extraction template for AI learning
                aiExtractionTemplate: {
                    lastExtractedData: req.userEditedFundData,
                    lastUpdated: new Date().toISOString(),
                    extractionCount: 1,
                    userCorrectedFields: req.userCorrectedFields,
                    documentType: req.userEditedDocumentData.documentType,
                },
            },
        });
        // 2. Create FundTemplate in fund-onboarding module for intelligent learning
        const fundKey = req.userEditedFundData.fundName
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        const fundTemplate = await templateMgr.createOrGetTemplate(req.userEditedFundData.fundName, fundKey, {
            manager: req.userEditedFundData.manager,
            strategy: req.userEditedFundData.strategy,
            extractionSchema: {
                fundName: req.userEditedFundData.fundName,
                manager: req.userEditedFundData.manager,
                strategy: req.userEditedFundData.strategy,
                commitment: req.userEditedFundData.commitmentUsd,
                documentType: req.userEditedDocumentData.documentType,
            },
            createdBy: req.userEmail,
        });
        // 3. Store PDF label for learning history
        await pdfLabeler.storePdfLabel(fundTemplate.id, req.pdfData.fileName, req.pdfData.fileHash, req.userEditedDocumentData, req.userEmail, req.pdfData.filePath, {
            userCorrected: req.userCorrectedFields.length > 0,
            correctedFields: req.userCorrectedFields,
        });
        // 4. Create FundReport (stores the PDF metadata)
        // Use custom doc type if "OTHER" was selected, otherwise use the standard type
        const reportType = req.userEditedDocumentData.documentType === 'OTHER' && req.userEditedDocumentData.customDocType
            ? req.userEditedDocumentData.customDocType
            : req.userEditedDocumentData.documentType;
        const fundReport = await prisma_1.prisma.fundReport.create({
            data: {
                fundId: fund.id,
                filename: req.pdfData.fileName,
                filePath: req.pdfData.filePath,
                reportType,
                noticeDate: req.userEditedDocumentData.noticeDate
                    ? new Date(req.userEditedDocumentData.noticeDate)
                    : new Date(),
                dueDate: req.userEditedDocumentData.dueDate
                    ? new Date(req.userEditedDocumentData.dueDate)
                    : new Date(),
                callPct: 0,
                netCallUsd: 0,
                cumulativePct: 0,
                commitmentUsd: req.userEditedFundData.commitmentUsd || 0,
                extractedData: req.extractedData.rawExtraction,
            },
        });
        // 5. Auto-create Capital Call or Distribution based on document type
        let capitalCall = null;
        let distribution = null;
        const docType = req.userEditedDocumentData.documentType.toUpperCase();
        const amount = req.userEditedDocumentData.amount || 0;
        if (docType === 'CAPITAL_CALL') {
            capitalCall = await prisma_1.prisma.capitalCall.create({
                data: {
                    fundId: fund.id,
                    noticeDate: req.userEditedDocumentData.noticeDate
                        ? new Date(req.userEditedDocumentData.noticeDate)
                        : new Date(),
                    dueDate: req.userEditedDocumentData.dueDate
                        ? new Date(req.userEditedDocumentData.dueDate)
                        : new Date(),
                    grossCallUsd: amount,
                    distributionUsd: 0,
                    reinvestableUsd: 0,
                    netCallUsd: amount,
                    fxRate: req.userEditedFundData.entryFxRate,
                    netCallJpy: 0,
                    status: 'pending',
                    sourcePdfId: fundReport.id,
                },
            });
        }
        else if (docType === 'DISTRIBUTION') {
            distribution = await prisma_1.prisma.distribution.create({
                data: {
                    fundId: fund.id,
                    distributionDate: req.userEditedDocumentData.noticeDate
                        ? new Date(req.userEditedDocumentData.noticeDate)
                        : new Date(),
                    distType: 'cash',
                    amountUsd: amount,
                    amountJpy: 0,
                    fxRate: req.userEditedFundData.entryFxRate,
                    reinvestableUsd: 0,
                },
            });
        }
        // For other document types (Financial Statement, NAV Report, etc.), just store FundReport
        return {
            fund,
            fundReport,
            capitalCall,
            distribution,
        };
    }
    catch (error) {
        console.error('[fund-creation] Error:', error);
        throw new Error(`Failed to create fund: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Update fund's extraction template when user edits data
 * This teaches the AI for future extractions
 */
async function updateFundExtractionTemplate(fundId, editedData, correctedFields) {
    const fund = await prisma_1.prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund)
        throw new Error('Fund not found');
    const currentTemplate = fund.aiExtractionTemplate || {};
    const updated = {
        lastExtractedData: editedData,
        lastUpdated: new Date().toISOString(),
        extractionCount: (currentTemplate.extractionCount || 0) + 1,
        userCorrectedFields: correctedFields,
        previousExtractions: currentTemplate.lastExtractedData,
    };
    await prisma_1.prisma.fund.update({
        where: { id: fundId },
        data: { aiExtractionTemplate: updated },
    });
}
//# sourceMappingURL=fund-creation-service.js.map