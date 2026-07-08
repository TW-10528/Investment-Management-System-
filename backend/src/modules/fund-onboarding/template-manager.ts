import { prisma } from '../../lib/prisma';
import type { FundTemplate } from './types';
import { updateTemplateConfidence, storePdfLabel } from './pdf-labeler';

/**
 * Create or get a fund template
 */
export async function createOrGetTemplate(
  templateName: string,
  fundKey: string,
  options?: {
    manager?: string;
    fundNameJp?: string;
    strategy?: string;
    extractionSchema?: Record<string, unknown>;
    createdBy?: string;
  }
): Promise<FundTemplate> {
  // Check if template already exists
  const existing = await prisma.fundTemplate.findUnique({
    where: { fundKey },
  });

  if (existing) {
    return existing as FundTemplate;
  }

  // Create new template
  const template = await prisma.fundTemplate.create({
    data: {
      templateName,
      fundKey,
      manager: options?.manager,
      fundNameJp: options?.fundNameJp,
      strategy: options?.strategy,
      extractionSchema: (options?.extractionSchema || {}) as any,
      sampleCount: 0,
      confidence: 0.5,
      createdBy: options?.createdBy,
    },
  });

  return template as FundTemplate;
}

/**
 * Get template by fund key
 */
export async function getTemplateByFundKey(fundKey: string): Promise<FundTemplate | null> {
  const template = await prisma.fundTemplate.findUnique({
    where: { fundKey },
  });

  return template ? (template as FundTemplate) : null;
}

/**
 * Get template by ID
 */
export async function getTemplateById(templateId: string): Promise<FundTemplate | null> {
  const template = await prisma.fundTemplate.findUnique({
    where: { id: templateId },
  });

  return template ? (template as FundTemplate) : null;
}

/**
 * List all templates with pagination
 */
export async function listTemplates(
  limit: number = 20,
  offset: number = 0,
  search?: string
): Promise<{ templates: FundTemplate[]; total: number }> {
  const where = search
    ? {
        OR: [
          { templateName: { contains: search, mode: 'insensitive' as const } },
          { fundKey: { contains: search, mode: 'insensitive' as const } },
          { manager: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [templates, total] = await Promise.all([
    prisma.fundTemplate.findMany({
      where,
      orderBy: { lastUpdated: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.fundTemplate.count({ where }),
  ]);

  return {
    templates: templates as FundTemplate[],
    total,
  };
}

/**
 * Update template with new PDF label and recalculate confidence
 */
export async function updateTemplateWithPdfLabel(
  templateId: string,
  fileName: string,
  fileHash: string,
  extractedValues: Record<string, unknown>,
  extractedBy?: string,
  pdfStoragePath?: string,
  validationLog?: Record<string, unknown>
): Promise<{
  template: FundTemplate;
  newConfidence: number;
}> {
  // Store the PDF label
  await storePdfLabel(
    templateId,
    fileName,
    fileHash,
    extractedValues as Record<string, unknown>,
    extractedBy,
    pdfStoragePath,
    validationLog
  );

  // Recalculate confidence
  const newConfidence = await updateTemplateConfidence(templateId);

  // Get updated template
  const template = await getTemplateById(templateId);

  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  return { template, newConfidence };
}

/**
 * Update template extraction schema based on user feedback
 */
export async function updateTemplateSchema(
  templateId: string,
  newSchema: Record<string, unknown>
): Promise<FundTemplate> {
  const template = await prisma.fundTemplate.update({
    where: { id: templateId },
    data: {
      extractionSchema: newSchema as any,
      lastUpdated: new Date(),
    },
  });

  return template as FundTemplate;
}

/**
 * Get template with all its PDF labels (learning history)
 */
export async function getTemplateWithHistory(
  templateId: string
): Promise<FundTemplate & { pdfLabels: any[] }> {
  const template = await prisma.fundTemplate.findUnique({
    where: { id: templateId },
    include: {
      pdfLabels: {
        orderBy: { extractionDate: 'desc' },
      },
    },
  });

  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  return template as FundTemplate & { pdfLabels: any[] };
}

/**
 * Search templates by name or fund key
 */
export async function searchTemplates(query: string): Promise<FundTemplate[]> {
  const templates = await prisma.fundTemplate.findMany({
    where: {
      OR: [
        { templateName: { contains: query, mode: 'insensitive' as const } },
        { fundKey: { contains: query, mode: 'insensitive' as const } },
        { manager: { contains: query, mode: 'insensitive' as const } },
      ],
    },
    orderBy: { confidence: 'desc' },
    take: 10,
  });

  return templates as FundTemplate[];
}

/**
 * Delete a template (cascade deletes its PDF labels)
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  await prisma.fundTemplate.delete({
    where: { id: templateId },
  });
}

/**
 * Get templates with high confidence (ready for auto-processing)
 */
export async function getHighConfidenceTemplates(
  minConfidence: number = 0.85
): Promise<FundTemplate[]> {
  const templates = await prisma.fundTemplate.findMany({
    where: {
      confidence: { gte: minConfidence },
    },
    orderBy: { confidence: 'desc' },
  });

  return templates as FundTemplate[];
}

/**
 * Upsert template: create if not exists, update if exists
 */
export async function upsertTemplate(
  fundKey: string,
  templateName: string,
  options?: {
    manager?: string;
    fundNameJp?: string;
    strategy?: string;
    extractionSchema?: Record<string, unknown>;
    createdBy?: string;
  }
): Promise<FundTemplate> {
  const template = await prisma.fundTemplate.upsert({
    where: { fundKey },
    create: {
      fundKey,
      templateName,
      manager: options?.manager,
      fundNameJp: options?.fundNameJp,
      strategy: options?.strategy,
      extractionSchema: (options?.extractionSchema || {}) as any,
      sampleCount: 0,
      confidence: 0.5,
      createdBy: options?.createdBy,
    },
    update: {
      templateName,
      manager: options?.manager,
      fundNameJp: options?.fundNameJp,
      strategy: options?.strategy,
      extractionSchema:
        options?.extractionSchema !== undefined
          ? (options.extractionSchema as any)
          : undefined,
      lastUpdated: new Date(),
    },
  });

  return template as FundTemplate;
}
