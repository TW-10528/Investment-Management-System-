"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrGetTemplate = createOrGetTemplate;
exports.getTemplateByFundKey = getTemplateByFundKey;
exports.getTemplateById = getTemplateById;
exports.listTemplates = listTemplates;
exports.updateTemplateWithPdfLabel = updateTemplateWithPdfLabel;
exports.updateTemplateSchema = updateTemplateSchema;
exports.getTemplateWithHistory = getTemplateWithHistory;
exports.searchTemplates = searchTemplates;
exports.deleteTemplate = deleteTemplate;
exports.getHighConfidenceTemplates = getHighConfidenceTemplates;
exports.upsertTemplate = upsertTemplate;
const prisma_1 = require("../../lib/prisma");
const pdf_labeler_1 = require("./pdf-labeler");
/**
 * Create or get a fund template
 */
async function createOrGetTemplate(templateName, fundKey, options) {
    // Check if template already exists
    const existing = await prisma_1.prisma.fundTemplate.findUnique({
        where: { fundKey },
    });
    if (existing) {
        return existing;
    }
    // Create new template
    const template = await prisma_1.prisma.fundTemplate.create({
        data: {
            templateName,
            fundKey,
            manager: options?.manager,
            fundNameJp: options?.fundNameJp,
            strategy: options?.strategy,
            extractionSchema: (options?.extractionSchema || {}),
            sampleCount: 0,
            confidence: 0.5,
            createdBy: options?.createdBy,
        },
    });
    return template;
}
/**
 * Get template by fund key
 */
async function getTemplateByFundKey(fundKey) {
    const template = await prisma_1.prisma.fundTemplate.findUnique({
        where: { fundKey },
    });
    return template ? template : null;
}
/**
 * Get template by ID
 */
async function getTemplateById(templateId) {
    const template = await prisma_1.prisma.fundTemplate.findUnique({
        where: { id: templateId },
    });
    return template ? template : null;
}
/**
 * List all templates with pagination
 */
async function listTemplates(limit = 20, offset = 0, search) {
    const where = search
        ? {
            OR: [
                { templateName: { contains: search, mode: 'insensitive' } },
                { fundKey: { contains: search, mode: 'insensitive' } },
                { manager: { contains: search, mode: 'insensitive' } },
            ],
        }
        : {};
    const [templates, total] = await Promise.all([
        prisma_1.prisma.fundTemplate.findMany({
            where,
            orderBy: { lastUpdated: 'desc' },
            skip: offset,
            take: limit,
        }),
        prisma_1.prisma.fundTemplate.count({ where }),
    ]);
    return {
        templates: templates,
        total,
    };
}
/**
 * Update template with new PDF label and recalculate confidence
 */
async function updateTemplateWithPdfLabel(templateId, fileName, fileHash, extractedValues, extractedBy, pdfStoragePath, validationLog) {
    // Store the PDF label
    await (0, pdf_labeler_1.storePdfLabel)(templateId, fileName, fileHash, extractedValues, extractedBy, pdfStoragePath, validationLog);
    // Recalculate confidence
    const newConfidence = await (0, pdf_labeler_1.updateTemplateConfidence)(templateId);
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
async function updateTemplateSchema(templateId, newSchema) {
    const template = await prisma_1.prisma.fundTemplate.update({
        where: { id: templateId },
        data: {
            extractionSchema: newSchema,
            lastUpdated: new Date(),
        },
    });
    return template;
}
/**
 * Get template with all its PDF labels (learning history)
 */
async function getTemplateWithHistory(templateId) {
    const template = await prisma_1.prisma.fundTemplate.findUnique({
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
    return template;
}
/**
 * Search templates by name or fund key
 */
async function searchTemplates(query) {
    const templates = await prisma_1.prisma.fundTemplate.findMany({
        where: {
            OR: [
                { templateName: { contains: query, mode: 'insensitive' } },
                { fundKey: { contains: query, mode: 'insensitive' } },
                { manager: { contains: query, mode: 'insensitive' } },
            ],
        },
        orderBy: { confidence: 'desc' },
        take: 10,
    });
    return templates;
}
/**
 * Delete a template (cascade deletes its PDF labels)
 */
async function deleteTemplate(templateId) {
    await prisma_1.prisma.fundTemplate.delete({
        where: { id: templateId },
    });
}
/**
 * Get templates with high confidence (ready for auto-processing)
 */
async function getHighConfidenceTemplates(minConfidence = 0.85) {
    const templates = await prisma_1.prisma.fundTemplate.findMany({
        where: {
            confidence: { gte: minConfidence },
        },
        orderBy: { confidence: 'desc' },
    });
    return templates;
}
/**
 * Upsert template: create if not exists, update if exists
 */
async function upsertTemplate(fundKey, templateName, options) {
    const template = await prisma_1.prisma.fundTemplate.upsert({
        where: { fundKey },
        create: {
            fundKey,
            templateName,
            manager: options?.manager,
            fundNameJp: options?.fundNameJp,
            strategy: options?.strategy,
            extractionSchema: (options?.extractionSchema || {}),
            sampleCount: 0,
            confidence: 0.5,
            createdBy: options?.createdBy,
        },
        update: {
            templateName,
            manager: options?.manager,
            fundNameJp: options?.fundNameJp,
            strategy: options?.strategy,
            extractionSchema: options?.extractionSchema !== undefined
                ? options.extractionSchema
                : undefined,
            lastUpdated: new Date(),
        },
    });
    return template;
}
//# sourceMappingURL=template-manager.js.map