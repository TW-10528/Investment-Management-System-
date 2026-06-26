"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const ocr_1 = require("./ocr");
const index_1 = require("../../config/index");
const prompts_1 = require("./prompts");
const calc_1 = require("./calc");
const sdgExtractor_1 = require("../../services/fundParsers/sdgExtractor");
const index_2 = require("../../services/fundParsers/nb-real-estate/index");
const index_3 = require("../../services/fundParsers/hamilton-lane/index");
const index_4 = require("../../services/fundParsers/hamilton-strategic/index");
const index_5 = require("../../services/fundParsers/dover-street/index");
const router = new hono_1.Hono();
// ── POST /api/v1/ai-extract/test ──────────────────────────────────────────────
// Accepts: multipart form with:
//   file         – PDF file
//   prev_e       – previous cumulative contributions  (default 0)
//   prev_f       – previous unfunded commitment       (default 0)
//   prev_g       – previous net cash flow             (default 0)
//   model_url    – Ollama/vLLM base URL               (optional, overrides config)
//   model_name   – model name                         (optional, overrides config)
router.post('/test', async (c) => {
    try {
        const body = await c.req.parseBody();
        const fileField = body['file'];
        if (!fileField || typeof fileField === 'string') {
            return c.json({ detail: 'No PDF file uploaded. Send multipart form with field "file".' }, 400);
        }
        const file = fileField;
        const buffer = Buffer.from(await file.arrayBuffer());
        // ── Extract PDF text (OCR fallback for scanned PDFs) ──────────────────
        let pdfText = '';
        let usedOcr = false;
        try {
            const result = await (0, ocr_1.extractPdfText)(buffer);
            pdfText = result.text;
            usedOcr = result.usedOcr;
        }
        catch {
            return c.json({ detail: 'Could not parse PDF. Ensure the file is a valid PDF.' }, 400);
        }
        if (!pdfText || pdfText.length < 20) {
            return c.json({
                detail: 'Could not extract text from this PDF even after OCR. The file may be corrupt or in an unsupported format.',
            }, 422);
        }
        // ── Let AI model classify the document ────────────────────────────────────
        // Do NOT do early viewing document detection here - the Qwen AI model should
        // be the source of truth for document classification. It will distinguish between
        // capital calls, distributions, and viewing documents (audit, financial, etc.).
        // ── Previous state for calc engine ────────────────────────────────────
        const prev = {
            E: parseFloat(String(body['prev_e'] ?? '0')) || 0,
            F: parseFloat(String(body['prev_f'] ?? '0')) || 0,
            G: parseFloat(String(body['prev_g'] ?? '0')) || 0,
        };
        // ── Model config ──────────────────────────────────────────────────────
        const modelUrl = String(body['model_url'] || index_1.config.aiModelUrl).replace(/\/+$/, '');
        const modelName = String(body['model_name'] || index_1.config.aiModelName);
        // ── SDG deterministic fast-path ───────────────────────────────────────
        // The deterministic regex extractor is more reliable than the AI classifier
        // for SDG documents (AI can mis-classify capital-call notices as COMMITMENT_NOTICE
        // and the AI model itself may be unavailable). Any document the extractor
        // recognises as SDG bypasses Stage 1 & 2 entirely.
        // If no amount was found (confidence = 0.3) the frontend shows 0 with a low
        // gate score so the user knows to review — still better than a 500 error.
        const sdgDet = (0, sdgExtractor_1.extractSdgNotice)(pdfText, file.name);
        if (sdgDet) {
            const detReportType = sdgDet.noticeType === 'distribution' ? 'DISTRIBUTION' : 'CAPITAL_CALL';
            const detExtraction = {
                transaction_date: sdgDet.dueDate,
                B_capital_contribution: sdgDet.grossCallUsd ?? null, // Preserve 0 values (capital calls can be 0)
                C_distribution_received: sdgDet.distributionUsd ?? null, // Preserve 0 values
                D_reinvestable: sdgDet.reinvestableUsd ?? null, // Preserve 0 values
                return_of_capital: null,
                gain: null,
                interest: sdgDet.interestUsd ?? null,
                report_provided_unfunded_before: sdgDet.currentUnfundedUsd ?? null, // Preserve 0 values
                report_provided_remaining_after: sdgDet.unfundedUsd ?? null, // Preserve 0 values
                subsequent_close_interest: null,
                notes: (sdgDet.extractionLog ?? []).join(' | '),
                extraction_confidence: Math.round(sdgDet.confidence * 100),
            };
            const detCalc = (0, calc_1.applyCalcEngine)(detExtraction, 'SDG', prev);
            const detChecks = (0, calc_1.runCrossChecks)(detExtraction, detCalc);
            const detConf = Math.round(sdgDet.confidence * 100);
            return c.json({
                pdf_characters: pdfText.length,
                pdf_preview: pdfText.slice(0, 500),
                classification: {
                    fund_key: 'SDG',
                    fund_display_name: sdgDet.fundName,
                    report_type: detReportType,
                    currency: 'JPY',
                    confidence_score: detConf,
                    deterministic: true,
                },
                extraction: detExtraction,
                calculation: detCalc,
                cross_checks: detChecks,
                confidence_gate: confidenceGate(detConf, detConf),
                model_used: 'deterministic/sdg-extractor',
            });
        }
        // ── Stage 1: Classify ─────────────────────────────────────────────────
        const classifyPrompt = prompts_1.CLASSIFIER_PROMPT.replace('{{DOCUMENT_TEXT}}', truncate(pdfText, 6000));
        const stage1Raw = await callModel(modelUrl, modelName, prompts_1.SYSTEM_PROMPT, classifyPrompt);
        const classification = parseJSON(stage1Raw);
        if (!classification) {
            return c.json({
                detail: 'Model returned invalid JSON for classification.',
                raw_response: stage1Raw,
            }, 502);
        }
        const { fund_key, fund_display_name, report_type, currency, confidence_score } = classification;
        const isUnknown = !fund_key || fund_key === 'UNKNOWN' || confidence_score < 75;
        // ── Stage 2: Extract ──────────────────────────────────────────────────
        const extractorTemplate = prompts_1.EXTRACTOR_PROMPTS[fund_key] ?? prompts_1.EXTRACTOR_PROMPTS['UNKNOWN'];
        const extractPrompt = extractorTemplate.replace('{{DOCUMENT_TEXT}}', truncate(pdfText, 8000));
        const stage2Raw = await callModel(modelUrl, modelName, prompts_1.SYSTEM_PROMPT, extractPrompt);
        const extraction = parseJSON(stage2Raw);
        if (!extraction) {
            return c.json({
                detail: 'Model returned invalid JSON for extraction.',
                classification,
                raw_response: stage2Raw,
            }, 502);
        }
        // ── Rich Extraction (override AI for known fund types) ─────────────────
        // For funds with dedicated parsers (NB Real Estate, Hamilton, Dover, SDG), use the
        // rich extractor instead of AI to get more accurate values for the preview
        const RICH_FUNDS = ['NB_REAL_ESTATE', 'HAMILTON_SEC', 'HAMILTON_STRAT', 'DOVER', 'SDG'];
        if (RICH_FUNDS.includes(fund_key) && pdfText) {
            try {
                let richNotice = null;
                if (fund_key === 'NB_REAL_ESTATE')
                    richNotice = (0, index_2.parseNbRealEstate)(pdfText);
                else if (fund_key === 'HAMILTON_SEC')
                    richNotice = (0, index_3.parseHamiltonLane)(pdfText);
                else if (fund_key === 'HAMILTON_STRAT')
                    richNotice = (0, index_4.parseHamiltonStrategic)(pdfText);
                else if (fund_key === 'DOVER')
                    richNotice = (0, index_5.parseDoverStreet)(pdfText, null, '');
                else if (fund_key === 'SDG')
                    richNotice = (0, sdgExtractor_1.extractSdgNotice)(pdfText, file.name);
                // Override AI extraction with rich extraction values
                if (richNotice) {
                    extraction.B_capital_contribution = richNotice.grossCallUsd ?? extraction.B_capital_contribution;
                    extraction.C_distribution_received = richNotice.distributionUsd ?? extraction.C_distribution_received;
                    extraction.D_reinvestable = richNotice.reinvestableUsd ?? extraction.D_reinvestable;
                    extraction.return_of_capital = richNotice.returnOfCapitalUsd ?? extraction.return_of_capital;
                    extraction.gain = richNotice.gainUsd ?? extraction.gain;
                    extraction.interest = richNotice.interestUsd ?? extraction.interest;
                    extraction.transaction_date = richNotice.dueDate ?? extraction.transaction_date;
                    extraction.total_commitment_amount = richNotice.commitmentUsd ?? extraction.total_commitment_amount;
                }
            }
            catch (richErr) {
                // Rich extraction failed, continue with AI values
                console.warn('[ai-extract] Rich extraction failed, using AI values:', richErr);
            }
        }
        // ── Stage 3: Deterministic calc (AI never does this) ──────────────────
        let calcResult = null;
        let crossChecks = null;
        if (!isUnknown && report_type !== 'COMMITMENT_NOTICE') {
            calcResult = (0, calc_1.applyCalcEngine)(extraction, fund_key, prev);
            crossChecks = (0, calc_1.runCrossChecks)(extraction, calcResult);
        }
        // ── Confidence gate ───────────────────────────────────────────────────
        const extractionConf = extraction.extraction_confidence ?? extraction.mapping_confidence ?? 0;
        const gate = confidenceGate(confidence_score, extractionConf);
        return c.json({
            // ── Input
            pdf_characters: pdfText.length,
            pdf_preview: pdfText.slice(0, 500),
            // ── Stage 1
            classification: {
                fund_key,
                fund_display_name,
                report_type,
                currency,
                confidence_score,
            },
            // ── Stage 2
            extraction,
            // ── Stage 3 (deterministic — null for UNKNOWN funds)
            calculation: calcResult,
            cross_checks: crossChecks,
            // ── Gate
            confidence_gate: gate,
            model_used: `${modelUrl} / ${modelName}`,
        });
    }
    catch (err) {
        if (err.message?.includes('fetch') || err.code === 'ECONNREFUSED') {
            return c.json({
                detail: `Cannot reach AI model at ${index_1.config.aiModelUrl}. Is Ollama/vLLM running?`,
                hint: 'Start Ollama: ollama serve  |  then pull: ollama pull qwen2.5:32b',
            }, 503);
        }
        console.error('[ai-extract]', err);
        return c.json({ detail: err.message ?? 'Internal error' }, 500);
    }
});
// ── GET /api/v1/ai-extract/status ─────────────────────────────────────────────
router.get('/status', async (c) => {
    const url = c.req.query('model_url') || index_1.config.aiModelUrl;
    const name = c.req.query('model_name') || index_1.config.aiModelName;
    const headers = {};
    if (index_1.config.aiApiKey)
        headers['Authorization'] = `Bearer ${index_1.config.aiApiKey}`;
    try {
        const res = await fetch(`${url.replace(/\/+$/, '')}/v1/models`, {
            headers,
            signal: AbortSignal.timeout(3000),
        });
        const data = res.ok ? await res.json() : null;
        // vLLM returns { object: "list", data: [{ id: "model-name", ... }] }
        const models = (data?.data ?? []).map((m) => m.id ?? m.name ?? m);
        const available = models.some(m => m === name || m.startsWith(name.split(':')[0]));
        return c.json({
            reachable: res.ok,
            target_model: name,
            model_available: available,
            models_on_server: models,
        });
    }
    catch {
        return c.json({ reachable: false, target_model: name, model_available: false, models_on_server: [] });
    }
});
// ── Helpers ───────────────────────────────────────────────────────────────────
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
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    return content;
}
function parseJSON(raw) {
    const s = raw?.trim() ?? '';
    // Strip markdown fences if model wraps output
    const cleaned = s.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
    try {
        return JSON.parse(cleaned);
    }
    catch { /* fall through */ }
    // Try to find first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        }
        catch { /* ignore */ }
    }
    return null;
}
function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}
function confidenceGate(classify, extract) {
    const min = Math.min(classify, extract);
    if (min >= 95)
        return { level: 'auto', label: 'Auto-process', color: 'green' };
    if (min >= 90)
        return { level: 'warning', label: 'Auto-process + flag warning', color: 'yellow' };
    if (min >= 75)
        return { level: 'review', label: 'Manual review required', color: 'orange' };
    return { level: 'reject', label: 'Do not save — manual entry', color: 'red' };
}
exports.default = router;
//# sourceMappingURL=ai-extract.routes.js.map