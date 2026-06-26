"use strict";
/**
 * Unknown Fund Extraction Service
 * Handles AI extraction for unknown funds with context from fund-onboarding module
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractUnknownFundData = extractUnknownFundData;
exports.getFundExtractionContext = getFundExtractionContext;
const ocr_1 = require("../ai-extract/ocr");
const prompts_1 = require("../ai-extract/prompts");
const index_1 = require("../../config/index");
const prisma_1 = require("../../lib/prisma");
/**
 * Call AI model (reuse from ai-extract pattern)
 */
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
/**
 * Parse JSON response from model
 */
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
/**
 * Truncate long text
 */
function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}
/**
 * Extract data for unknown fund from PDF
 */
async function extractUnknownFundData(buffer, fileName) {
    try {
        // Extract PDF text
        let pdfText = '';
        try {
            const result = await (0, ocr_1.extractPdfText)(buffer);
            pdfText = result.text;
        }
        catch {
            throw new Error('Could not extract text from PDF');
        }
        if (!pdfText || pdfText.length < 20) {
            throw new Error('PDF contains insufficient text for extraction');
        }
        // Create specialized prompt for unknown fund extraction
        const extractionPrompt = `You are extracting fund information from a financial document.

Return JSON with this exact structure:
{
  "fund_name": "string - official fund name",
  "manager": "string - fund manager company name",
  "strategy": "string - investment strategy (e.g., Secondary, Growth, etc.)",
  "vintage_year": number - year fund was established,
  "currency": "USD or JPY",
  "commitment_amount": number - LP commitment in USD,
  "entry_fx_rate": number - if applicable,
  "management_fee_pct": number - percentage,
  "carry_pct": number - percentage,
  "hurdle_rate_pct": number - percentage,
  "document_type": "string - CAPITAL_CALL | DISTRIBUTION | FINANCIAL_STATEMENT | NAV_REPORT | QUARTERLY_REPORT | ANNUAL_REPORT | TAX_DOCUMENT | AUDIT_REPORT | COMMITMENT_NOTICE | OTHER",
  "amount": number - transaction or reported amount in USD,
  "notice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "transaction_date": "YYYY-MM-DD",
  "extraction_confidence": 0-100,
  "notes": "any relevant extraction notes"
}

DOCUMENT TEXT:
"""
${truncate(pdfText, 8000)}
"""`;
        const modelUrl = index_1.config.aiModelUrl.replace(/\/+$/, '');
        const modelName = index_1.config.aiModelName;
        const raw = await callModel(modelUrl, modelName, prompts_1.SYSTEM_PROMPT, extractionPrompt);
        const parsed = parseJSON(raw);
        if (!parsed) {
            throw new Error('AI returned invalid JSON');
        }
        // Map extracted data to fund and document structures
        const result = {
            fundData: {
                fundName: parsed.fund_name || 'Unknown Fund',
                manager: parsed.manager,
                strategy: parsed.strategy,
                vintageYear: parsed.vintage_year,
                currency: parsed.currency || 'USD',
                commitmentUsd: parsed.commitment_amount,
                entryFxRate: parsed.entry_fx_rate,
                managementFeePct: parsed.management_fee_pct,
                carryPct: parsed.carry_pct,
                hurdleRatePct: parsed.hurdle_rate_pct,
            },
            documentData: {
                documentType: parsed.document_type || 'OTHER',
                amount: parsed.amount,
                noticeDate: parsed.notice_date,
                dueDate: parsed.due_date,
                transactionDate: parsed.transaction_date,
            },
            extractionConfidence: parsed.extraction_confidence ?? 75,
            rawExtraction: parsed,
        };
        return result;
    }
    catch (error) {
        throw new Error(`Fund extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Get AI context from existing fund template (for learning)
 * If fund was created before, use previous extraction data as context
 */
async function getFundExtractionContext(fundName) {
    try {
        // Search for fund by name
        const existingFund = await prisma_1.prisma.fund.findFirst({
            where: {
                fundName: {
                    contains: fundName,
                    mode: 'insensitive',
                },
            },
        });
        if (existingFund?.aiExtractionTemplate) {
            return existingFund.aiExtractionTemplate;
        }
        // Also check fund-onboarding templates
        const fundTemplate = await prisma_1.prisma.fundTemplate.findFirst({
            where: {
                templateName: {
                    contains: fundName,
                    mode: 'insensitive',
                },
            },
        });
        if (fundTemplate?.extractionSchema) {
            return fundTemplate.extractionSchema;
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=unknown-fund-extractor.js.map