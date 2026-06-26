import { extractPdfText } from '../ai-extract/ocr';
import { SYSTEM_PROMPT, CLASSIFIER_PROMPT, EXTRACTOR_PROMPTS } from '../ai-extract/prompts';
import { config } from '../../config/index';
import type { ClassificationResult, ExtractionResult } from './types';

// Call AI model (reuse from ai-extract pattern)
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

// Parse JSON response from model (reuse from ai-extract pattern)
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

// Truncate long text (reuse from ai-extract pattern)
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}

// Extract PDF text and return for classification
export async function extractPdfTextForOnboarding(buffer: Buffer): Promise<string> {
  try {
    const result = await extractPdfText(buffer);
    return result.text;
  } catch {
    throw new Error('Could not extract text from PDF');
  }
}

// Classify document: is it a viewing document or transaction document?
export async function classifyDocument(
  pdfText: string
): Promise<ClassificationResult> {
  try {
    const modelUrl = config.aiModelUrl.replace(/\/+$/, '');
    const modelName = config.aiModelName;

    const classifyPrompt = CLASSIFIER_PROMPT.replace(
      '{{DOCUMENT_TEXT}}',
      truncate(pdfText, 6000)
    );

    const raw = await callModel(modelUrl, modelName, SYSTEM_PROMPT, classifyPrompt);
    const parsed = parseJSON(raw);

    if (!parsed) {
      throw new Error('Invalid JSON response from model');
    }

    const {
      fund_key,
      fund_display_name,
      report_type,
      currency,
      confidence_score,
    } = parsed;

    const isKnownFund =
      fund_key &&
      fund_key !== 'UNKNOWN' &&
      confidence_score >= 75;

    return {
      fundKey: fund_key || 'UNKNOWN',
      fundDisplayName: fund_display_name || 'Unknown Fund',
      reportType: report_type || 'OTHER',
      isKnownFund,
      aiConfidence: confidence_score || 0,
    };
  } catch (error) {
    throw new Error(
      `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Extract values from document for unknown fund
export async function extractValues(
  pdfText: string,
  fundKey: string = 'UNKNOWN'
): Promise<ExtractionResult> {
  try {
    const modelUrl = config.aiModelUrl.replace(/\/+$/, '');
    const modelName = config.aiModelName;

    // Use fund-specific extractor prompt or default to UNKNOWN
    const extractorTemplate = EXTRACTOR_PROMPTS[fundKey] || EXTRACTOR_PROMPTS['UNKNOWN'];
    const extractPrompt = extractorTemplate.replace(
      '{{DOCUMENT_TEXT}}',
      truncate(pdfText, 8000)
    );

    const raw = await callModel(modelUrl, modelName, SYSTEM_PROMPT, extractPrompt);
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
  } catch (error) {
    throw new Error(
      `Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
