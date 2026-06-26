"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPdfTextForOnboarding = extractPdfTextForOnboarding;
exports.classifyDocument = classifyDocument;
exports.extractValues = extractValues;
const ocr_1 = require("../ai-extract/ocr");
const prompts_1 = require("../ai-extract/prompts");
const index_1 = require("../../config/index");
// Call AI model (reuse from ai-extract pattern)
async function callModel(baseUrl, model, system, user) {
    const headers = { 'Content-Type': 'application/json' };
    if (index_1.config.aiApiKey)
        headers['Authorization'] = `Bearer ${index_1.config.aiApiKey}`;
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            temperature: 0.1,
            stream: false,
            chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Model API error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json());
    const content = data?.choices?.[0]?.message?.content ?? '';
    return content;
}
// Parse JSON response from model (reuse from ai-extract pattern)
function parseJSON(raw) {
    const s = raw?.trim() ?? '';
    const cleaned = s
        .replace(/^```(?:json)?\n?/i, '')
        .replace(/\n?```$/, '')
        .trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        /* fall through */
    }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        }
        catch {
            /* ignore */
        }
    }
    return null;
}
// Truncate long text (reuse from ai-extract pattern)
function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}
// Extract PDF text and return for classification
async function extractPdfTextForOnboarding(buffer) {
    try {
        const result = await (0, ocr_1.extractPdfText)(buffer);
        return result.text;
    }
    catch {
        throw new Error('Could not extract text from PDF');
    }
}
// Classify document: is it a viewing document or transaction document?
async function classifyDocument(pdfText) {
    try {
        const modelUrl = index_1.config.aiModelUrl.replace(/\/+$/, '');
        const modelName = index_1.config.aiModelName;
        const classifyPrompt = prompts_1.CLASSIFIER_PROMPT.replace('{{DOCUMENT_TEXT}}', truncate(pdfText, 6000));
        const raw = await callModel(modelUrl, modelName, prompts_1.SYSTEM_PROMPT, classifyPrompt);
        const parsed = parseJSON(raw);
        if (!parsed) {
            throw new Error('Invalid JSON response from model');
        }
        const { fund_key, fund_display_name, report_type, currency, confidence_score, } = parsed;
        const isKnownFund = fund_key &&
            fund_key !== 'UNKNOWN' &&
            confidence_score >= 75;
        return {
            fundKey: fund_key || 'UNKNOWN',
            fundDisplayName: fund_display_name || 'Unknown Fund',
            reportType: report_type || 'OTHER',
            isKnownFund,
            aiConfidence: confidence_score || 0,
        };
    }
    catch (error) {
        throw new Error(`Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// Extract values from document for unknown fund
async function extractValues(pdfText, fundKey = 'UNKNOWN') {
    try {
        const modelUrl = index_1.config.aiModelUrl.replace(/\/+$/, '');
        const modelName = index_1.config.aiModelName;
        // Use fund-specific extractor prompt or default to UNKNOWN
        const extractorTemplate = prompts_1.EXTRACTOR_PROMPTS[fundKey] || prompts_1.EXTRACTOR_PROMPTS['UNKNOWN'];
        const extractPrompt = extractorTemplate.replace('{{DOCUMENT_TEXT}}', truncate(pdfText, 8000));
        const raw = await callModel(modelUrl, modelName, prompts_1.SYSTEM_PROMPT, extractPrompt);
        const parsed = parseJSON(raw);
        if (!parsed) {
            throw new Error('Invalid JSON response from extraction model');
        }
        return {
            B_capital_contribution: parsed.B_capital_contribution || undefined,
            C_distribution_received: parsed.C_distribution_received || undefined,
            D_reinvestable: parsed.D_reinvestable || undefined,
            transaction_date: parsed.transaction_date || undefined,
            notes: parsed.notes || '',
        };
    }
    catch (error) {
        throw new Error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=ai-extractor.js.map