"use strict";
// PaddleOCR sidecar wrapper — replaces tesseract.js for both the production
// scanned-PDF pipeline (pdfOcr.ts) and the AI-extract test harness.
//
// PaddleOCR (Baidu's PP-OCR models) reads Japanese financial notices far more
// reliably than Tesseract: side-by-side on the same synthetic SDG test image,
// Tesseract garbled "363,602,836円" into "363,.602,.836円" (silently parsed as
// 363.602 downstream), while PaddleOCR read every digit and comma correctly
// with ~99%+ confidence.
//
// Key design choice — batch all pages in one subprocess call:
// Each Python process pays a one-time model-load cost (~5s for PP-OCRv6).
// The old approach (one subprocess per page) made a 3-page PDF cost 3× that.
// paddleOcrImageBuffers() now saves every page to a temp file and passes ALL
// paths to the Python script in one execFile call.  paddle_ocr.py passes them
// as a list to ocr.predict() which keeps the loaded models in memory across pages.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paddleOcrImageBuffers = paddleOcrImageBuffers;
exports.paddleOcrImage = paddleOcrImage;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const VENV_PYTHON = path_1.default.join(__dirname, '../../../paddle-venv/bin/python');
const SCRIPT_PATH = path_1.default.join(__dirname, '../../../scripts/paddle_ocr.py');
// Budget: 5s model load + N pages × ~25s/page at 2x scale.
// 600s covers large scanned contracts (22-page subscription booklets etc.)
// on CPU-only machines where each page can take 60s+ at default resolution.
const TIMEOUT_MS = 600_000;
// Parse the JSON result from the sidecar's stdout.
// PaddleOCR/Paddle may emit progress lines; scan backwards for the JSON.
function parseOcrStdout(stdout) {
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const parsed = JSON.parse(lines[i]);
            if (parsed.error) {
                console.error('[paddleOcr] sidecar reported error:', parsed.error);
                return '';
            }
            return String(parsed.text ?? '');
        }
        catch {
            // not the JSON line — keep scanning backwards
        }
    }
    console.error('[paddleOcr] no parseable JSON in sidecar output:', stdout.slice(-400));
    return '';
}
/**
 * OCR a batch of already-rasterized page/image buffers (one PDF → N pages)
 * and return the combined text, in page order.
 *
 * All page buffers are written to temp files and passed to the Python script
 * in a single execFile call, so model weights are loaded only once regardless
 * of how many pages the PDF has.
 */
async function paddleOcrImageBuffers(buffers, lang = 'japan') {
    if (!buffers.length)
        return '';
    if (!fs_1.default.existsSync(VENV_PYTHON)) {
        console.error('[paddleOcr] venv not found at', VENV_PYTHON, '— run: python3 -m venv paddle-venv && paddle-venv/bin/pip install paddlepaddle paddleocr');
        return '';
    }
    // Write every page buffer to a uniquely-named temp file.
    const prefix = `paddle-ocr-${Date.now()}`;
    const tmpFiles = buffers.map((buf, i) => {
        if (!buf || buf.length === 0)
            return null; // skip zero-byte pages
        const f = path_1.default.join(os_1.default.tmpdir(), `${prefix}-p${i}.png`);
        fs_1.default.writeFileSync(f, buf);
        return f;
    }).filter((f) => f !== null);
    if (!tmpFiles.length) {
        console.error('[paddleOcr] all page buffers were empty — nothing to OCR');
        return '';
    }
    try {
        const { stdout } = await execFileAsync(VENV_PYTHON, [SCRIPT_PATH, ...tmpFiles, `--lang=${lang}`], { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
        return parseOcrStdout(stdout);
    }
    catch (err) {
        const detail = err.stdout?.trim() || '';
        console.error('[paddleOcr] subprocess failed:', err?.message ?? err, detail ? `| python stdout: ${detail.slice(-300)}` : '');
        return '';
    }
    finally {
        for (const f of tmpFiles) {
            try {
                fs_1.default.unlinkSync(f);
            }
            catch { /* ignore */ }
        }
    }
}
/**
 * OCR a single rasterized image buffer (PNG/JPG).
 * Returns '' on any failure — callers treat '' as "OCR produced nothing usable".
 */
async function paddleOcrImage(buffer, lang = 'japan') {
    return paddleOcrImageBuffers([buffer], lang);
}
//# sourceMappingURL=paddleOcr.js.map