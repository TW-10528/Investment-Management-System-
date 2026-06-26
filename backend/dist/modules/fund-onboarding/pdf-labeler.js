"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFileHash = calculateFileHash;
exports.storePdfLabel = storePdfLabel;
exports.getTemplateLearningHistory = getTemplateLearningHistory;
exports.updateTemplateConfidence = updateTemplateConfidence;
exports.isDuplicatePdf = isDuplicatePdf;
exports.getTemplateExtractionSchema = getTemplateExtractionSchema;
exports.analyzeTemplateConsistency = analyzeTemplateConsistency;
const crypto_1 = require("crypto");
const prisma_1 = require("../../lib/prisma");
/**
 * Calculate SHA256 hash of PDF buffer
 */
function calculateFileHash(buffer) {
    return (0, crypto_1.createHash)('sha256').update(buffer).digest('hex');
}
/**
 * Store PDF label record with extracted values
 * This creates the learning data for the template improvement loop
 */
async function storePdfLabel(templateId, fileName, fileHash, extractedValues, extractedBy, pdfStoragePath, validationLog) {
    const label = await prisma_1.prisma.pdfLabel.create({
        data: {
            templateId,
            fileName,
            fileHash,
            values: extractedValues,
            extractionDate: new Date(),
            extractedBy,
            pdfStoragePath,
            validationLog: validationLog,
        },
    });
    return label;
}
/**
 * Get all PDF labels for a template (learning history)
 */
async function getTemplateLearningHistory(templateId) {
    const labels = await prisma_1.prisma.pdfLabel.findMany({
        where: { templateId },
        orderBy: { extractionDate: 'desc' },
    });
    return labels;
}
/**
 * Update template confidence based on accumulated PDF labels
 * Higher confidence when we have consistent successful extractions
 */
async function updateTemplateConfidence(templateId) {
    const labels = await getTemplateLearningHistory(templateId);
    const sampleCount = labels.length;
    // Confidence calculation:
    // - Start at 0.5 for first PDF
    // - Increase to 0.75 at 3 consistent PDFs
    // - Increase to 0.85 at 5 consistent PDFs
    // - Increase to 0.95 at 10+ consistent PDFs
    let confidence = 0.5;
    if (sampleCount >= 3)
        confidence = 0.75;
    if (sampleCount >= 5)
        confidence = 0.85;
    if (sampleCount >= 10)
        confidence = 0.95;
    // Update template
    const updated = await prisma_1.prisma.fundTemplate.update({
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
async function isDuplicatePdf(fileHash) {
    const existing = await prisma_1.prisma.pdfLabel.findFirst({
        where: { fileHash },
    });
    return !!existing;
}
/**
 * Get extraction schema from template for this fund
 * Returns the mapping of PDF labels to extracted fields
 */
async function getTemplateExtractionSchema(templateId) {
    const template = await prisma_1.prisma.fundTemplate.findUnique({
        where: { id: templateId },
    });
    return template?.extractionSchema || null;
}
/**
 * Analyze learning history to detect inconsistencies
 * Returns fields that vary significantly across PDFs
 */
async function analyzeTemplateConsistency(templateId) {
    const labels = await getTemplateLearningHistory(templateId);
    if (labels.length < 2) {
        return {
            consistent: [],
            inconsistent: [],
            fieldStats: {},
        };
    }
    const fieldStats = {};
    // Collect all field names and their values
    labels.forEach((label) => {
        const values = label.values;
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
        const values = fieldStats[field].values;
        const numericValues = values.filter((v) => typeof v === 'number');
        if (numericValues.length > 0) {
            const avg = numericValues.reduce((a, b) => a + b) / numericValues.length;
            const variance = numericValues.every((v) => Math.abs(v - avg) <= avg * 0.05);
            fieldStats[field].isConsistent = variance;
        }
        else {
            // Text field: all must match
            const firstValue = values[0];
            fieldStats[field].isConsistent = values.every((v) => v === firstValue);
        }
    });
    const consistent = Object.keys(fieldStats).filter((f) => fieldStats[f].isConsistent);
    const inconsistent = Object.keys(fieldStats).filter((f) => !fieldStats[f].isConsistent);
    return { consistent, inconsistent, fieldStats };
}
//# sourceMappingURL=pdf-labeler.js.map