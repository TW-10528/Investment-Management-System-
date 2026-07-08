/**
 * Unknown Fund Extraction Service
 * Handles AI extraction for unknown funds with context from fund-onboarding module
 */

import { extractPdfText } from '../ai-extract/ocr';
import { SYSTEM_PROMPT, EXTRACTOR_PROMPTS } from '../ai-extract/prompts';
import { config } from '../../config/index';
import { prisma } from '../../lib/prisma';

export interface FundExtractionResult {
  fundData: {
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
  documentData: {
    documentType: string;
    amount?: number;
    noticeDate?: string;
    dueDate?: string;
    transactionDate?: string;
  };
  extractionConfidence: number;
  rawExtraction: Record<string, any>;
}

/**
 * Call AI model (reuse from ai-extract pattern)
 */
async function callModel(
  baseUrl: string,
  model: string,
  system: string,
  user: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.aiApiKey) headers['Authorization'] = `Bearer ${config.aiApiKey}`;

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

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content ?? '';
  return content;
}

/**
 * Parse JSON response from model
 */
function parseJSON(raw: string): Record<string, any> | null {
  const s = raw?.trim() ?? '';
  const cleaned = s
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Truncate long text
 */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}

/**
 * Extract data for unknown fund from PDF
 */
export async function extractUnknownFundData(
  buffer: Buffer,
  fileName: string
): Promise<FundExtractionResult> {
  try {
    // Extract PDF text
    let pdfText = '';
    try {
      const result = await extractPdfText(buffer);
      pdfText = result.text;
    } catch {
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

    const modelUrl = config.aiModelUrl.replace(/\/+$/, '');
    const modelName = config.aiModelName;

    const raw = await callModel(modelUrl, modelName, SYSTEM_PROMPT, extractionPrompt);
    const parsed = parseJSON(raw);

    if (!parsed) {
      throw new Error('AI returned invalid JSON');
    }

    // Map extracted data to fund and document structures
    const result: FundExtractionResult = {
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
  } catch (error) {
    throw new Error(
      `Fund extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get AI context from existing fund template (for learning)
 * If fund was created before, use previous extraction data as context
 */
export async function getFundExtractionContext(
  fundName: string
): Promise<Record<string, any> | null> {
  try {
    // Search for fund by name
    const existingFund = await prisma.fund.findFirst({
      where: {
        fundName: {
          contains: fundName,
          mode: 'insensitive',
        },
      },
    });

    if (existingFund?.aiExtractionTemplate) {
      return existingFund.aiExtractionTemplate as Record<string, any>;
    }

    // Also check fund-onboarding templates
    const fundTemplate = await prisma.fundTemplate.findFirst({
      where: {
        templateName: {
          contains: fundName,
          mode: 'insensitive',
        },
      },
    });

    if (fundTemplate?.extractionSchema) {
      return fundTemplate.extractionSchema as Record<string, any>;
    }

    return null;
  } catch {
    return null;
  }
}
