/**
 * Fund Creation Service
 * Handles creating new funds from extracted data with auto-processing
 */

import { prisma } from '../../lib/prisma';
import * as templateMgr from '../fund-onboarding/template-manager';
import * as pdfLabeler from '../fund-onboarding/pdf-labeler';
import type { FundExtractionResult } from './unknown-fund-extractor';

export interface CreateFundRequest {
  extractedData: FundExtractionResult;
  userEditedFundData: {
    fundName: string;
    manager?: string;
    strategy?: string;
    vintageYear?: number;
    currency: string;
    commitmentUsd?: number;
    entryFxRate?: number;
    managementFeePct?: number;
    carryPct?: number;
    hurdleRatePct?: number;
  };
  userEditedDocumentData: {
    documentType: string;
    customDocType?: string; // Custom document type if "OTHER" is selected
    amount?: number;
    noticeDate?: string;
    dueDate?: string;
  };
  pdfData: {
    fileName: string;
    fileHash: string;
    filePath: string;
  };
  userEmail?: string;
  userCorrectedFields: string[];
}

/**
 * Create a new fund from extracted data
 * This also:
 * - Creates FundTemplate for learning
 * - Stores extraction template in Fund.aiExtractionTemplate
 * - Auto-creates Capital Call/Distribution
 * - Creates FundReport
 */
export async function createFundFromExtraction(
  req: CreateFundRequest
): Promise<{
  fund: any;
  fundReport: any;
  capitalCall?: any;
  distribution?: any;
}> {
  try {
    // 1. Create the Fund record
    const fund = await prisma.fund.create({
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
        } as any,
      },
    });

    // 2. Create FundTemplate in fund-onboarding module for intelligent learning
    const fundKey = req.userEditedFundData.fundName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const fundTemplate = await templateMgr.createOrGetTemplate(
      req.userEditedFundData.fundName,
      fundKey,
      {
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
      }
    );

    // 3. Store PDF label for learning history
    await pdfLabeler.storePdfLabel(
      fundTemplate.id,
      req.pdfData.fileName,
      req.pdfData.fileHash,
      req.userEditedDocumentData,
      req.userEmail,
      req.pdfData.filePath,
      {
        userCorrected: req.userCorrectedFields.length > 0,
        correctedFields: req.userCorrectedFields,
      }
    );

    // 4. Create FundReport (stores the PDF metadata)
    // Use custom doc type if "OTHER" was selected, otherwise use the standard type
    const reportType =
      req.userEditedDocumentData.documentType === 'OTHER' && req.userEditedDocumentData.customDocType
        ? req.userEditedDocumentData.customDocType
        : req.userEditedDocumentData.documentType;

    const fundReport = await prisma.fundReport.create({
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
        extractedData: req.extractedData.rawExtraction as any,
      },
    });

    // 5. Auto-create Capital Call or Distribution based on document type
    let capitalCall = null;
    let distribution = null;

    const docType = req.userEditedDocumentData.documentType.toUpperCase();
    const amount = req.userEditedDocumentData.amount || 0;

    if (docType === 'CAPITAL_CALL') {
      capitalCall = await prisma.capitalCall.create({
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
    } else if (docType === 'DISTRIBUTION') {
      distribution = await prisma.distribution.create({
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
  } catch (error) {
    console.error('[fund-creation] Error:', error);
    throw new Error(
      `Failed to create fund: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update fund's extraction template when user edits data
 * This teaches the AI for future extractions
 */
export async function updateFundExtractionTemplate(
  fundId: string,
  editedData: Record<string, any>,
  correctedFields: string[]
): Promise<void> {
  const fund = await prisma.fund.findUnique({ where: { id: fundId } });
  if (!fund) throw new Error('Fund not found');

  const currentTemplate = fund.aiExtractionTemplate as Record<string, any> || {};

  const updated = {
    lastExtractedData: editedData,
    lastUpdated: new Date().toISOString(),
    extractionCount: (currentTemplate.extractionCount || 0) + 1,
    userCorrectedFields: correctedFields,
    previousExtractions: currentTemplate.lastExtractedData,
  };

  await prisma.fund.update({
    where: { id: fundId },
    data: { aiExtractionTemplate: updated as any },
  });
}
