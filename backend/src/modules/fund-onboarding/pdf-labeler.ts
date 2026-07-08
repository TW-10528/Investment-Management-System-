import { createHash } from 'crypto';
import type { PdfLabel } from './types';
import { prisma } from '../../lib/prisma';

/**
 * Calculate SHA256 hash of PDF buffer
 */
export function calculateFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Store PDF label record with extracted values
 * This creates the learning data for the template improvement loop
 */
export async function storePdfLabel(
  templateId: string,
  fileName: string,
  fileHash: string,
  extractedValues: Record<string, unknown>,
  extractedBy?: string,
  pdfStoragePath?: string,
  validationLog?: Record<string, unknown>
): Promise<PdfLabel> {
  const label = await prisma.pdfLabel.create({
    data: {
      templateId,
      fileName,
      fileHash,
      values: extractedValues as any,
      extractionDate: new Date(),
      extractedBy,
      pdfStoragePath,
      validationLog: validationLog as any,
    },
  });

  return label as PdfLabel;
}

/**
 * Get all PDF labels for a template (learning history)
 */
export async function getTemplateLearningHistory(templateId: string): Promise<PdfLabel[]> {
  const labels = await prisma.pdfLabel.findMany({
    where: { templateId },
    orderBy: { extractionDate: 'desc' },
  });

  return labels as PdfLabel[];
}

/**
 * Update template confidence based on accumulated PDF labels
 * Higher confidence when we have consistent successful extractions
 */
export async function updateTemplateConfidence(templateId: string): Promise<number> {
  const labels = await getTemplateLearningHistory(templateId);
  const sampleCount = labels.length;

  // Confidence calculation:
  // - Start at 0.5 for first PDF
  // - Increase to 0.75 at 3 consistent PDFs
  // - Increase to 0.85 at 5 consistent PDFs
  // - Increase to 0.95 at 10+ consistent PDFs
  let confidence = 0.5;
  if (sampleCount >= 3) confidence = 0.75;
  if (sampleCount >= 5) confidence = 0.85;
  if (sampleCount >= 10) confidence = 0.95;

  // Update template
  const updated = await prisma.fundTemplate.update({
    where: { id: templateId },
    data: {
      confidence,
      sampleCount,
      lastUpdated: new Date(),
    },
  });

  return confidence;
}

/**
 * Check if PDF has already been processed (duplicate detection)
 */
export async function isDuplicatePdf(fileHash: string): Promise<boolean> {
  const existing = await prisma.pdfLabel.findFirst({
    where: { fileHash },
  });

  return !!existing;
}

/**
 * Get extraction schema from template for this fund
 * Returns the mapping of PDF labels to extracted fields
 */
export async function getTemplateExtractionSchema(
  templateId: string
): Promise<Record<string, unknown> | null> {
  const template = await prisma.fundTemplate.findUnique({
    where: { id: templateId },
  });

  return (template?.extractionSchema as Record<string, unknown>) || null;
}

/**
 * Analyze learning history to detect inconsistencies
 * Returns fields that vary significantly across PDFs
 */
export async function analyzeTemplateConsistency(templateId: string): Promise<{
  consistent: string[];
  inconsistent: string[];
  fieldStats: Record<string, any>;
}> {
  const labels = await getTemplateLearningHistory(templateId);

  if (labels.length < 2) {
    return {
      consistent: [],
      inconsistent: [],
      fieldStats: {},
    };
  }

  const fieldStats: Record<string, any> = {};

  // Collect all field names and their values
  labels.forEach((label) => {
    const values = label.values as Record<string, unknown>;
    Object.keys(values).forEach((field) => {
      if (!fieldStats[field]) {
        fieldStats[field] = {
          values: [],
          isConsistent: true,
        };
      }
      fieldStats[field].values.push(values[field]);
    });
  });

  // Determine consistency: numeric fields can vary by ±5%, text fields must match exactly
  Object.keys(fieldStats).forEach((field) => {
    const values = fieldStats[field].values as unknown[];
    const numericValues = values.filter((v) => typeof v === 'number') as number[];

    if (numericValues.length > 0) {
      const avg = numericValues.reduce((a, b) => a + b) / numericValues.length;
      const variance = numericValues.every((v) => Math.abs(v - avg) <= avg * 0.05);
      fieldStats[field].isConsistent = variance;
    } else {
      // Text field: all must match
      const firstValue = values[0];
      fieldStats[field].isConsistent = values.every((v) => v === firstValue);
    }
  });

  const consistent = Object.keys(fieldStats).filter(
    (f) => fieldStats[f].isConsistent
  );
  const inconsistent = Object.keys(fieldStats).filter(
    (f) => !fieldStats[f].isConsistent
  );

  return { consistent, inconsistent, fieldStats };
}
