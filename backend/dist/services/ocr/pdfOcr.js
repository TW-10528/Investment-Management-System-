"use strict";
// PDF OCR fallback for scanned (image-only) notices.
//
// Most fund PDFs carry a text layer that pdf-parse reads directly. Some funds —
// notably the Japanese SDG notices — are scanned images with no text layer, so
// pdf-parse returns almost nothing. For those we rasterize each page to a PNG and
// run PaddleOCR (Baidu PP-OCR, Japanese + Latin) via the paddle-venv subprocess.
//
// See paddleOcr.ts for the subprocess wrapper; scripts/paddle_ocr.py is the
// sidecar that calls PaddleOCR's Python API. PaddleOCR reads Japanese financial
// tables (amounts, commas, kanji labels) far more reliably than Tesseract:
// side-by-side on the same SDG test image Tesseract garbled "363,602,836円" into
// "363,.602,.836円" while PaddleOCR read every digit and comma correctly.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEAK_TEXT_THRESHOLD = void 0;
exports.normalizeOcrText = normalizeOcrText;
exports.ocrPdf = ocrPdf;
exports.ocrImage = ocrImage;
exports.textWithOcrFallback = textWithOcrFallback;
const path_1 = __importDefault(require("path"));
const pdf_to_png_converter_1 = require("pdf-to-png-converter");
const paddleOcr_1 = require("./paddleOcr");
// Windows fix for pdf-to-png-converter: it feeds pdfjs a cMapUrl ending in "\"
// (path.sep), but pdfjs 5.x throws unless the URL ends in "/", and the lib
// exposes no override. Patch its normalizePath to use forward slashes. No-op
// on Linux/Mac (paths already use "/"). Remove when the lib fixes Windows
// paths or accepts a cMapUrl prop. (CommonJS build — require ok.)
{
    const npPath = path_1.default.join(path_1.default.dirname(require.resolve('pdf-to-png-converter')), 'normalizePath.js');
    const npMod = require(npPath);
    const orig = npMod.normalizePath;
    npMod.normalizePath = (p) => orig(p).replace(/\\/g, '/');
}
// CJK = Hiragana, Katakana, CJK ideographs, and fullwidth forms. Used to strip the
// spaces some OCR engines insert between Japanese glyphs.
const CJK = '\\u3040-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef';
/**
 * Normalise Japanese OCR output so the label/amount regexes match:
 *  - fullwidth digits ０-９ → ASCII digits
 *  - circled numbers ①②③…⑳ and ⓪ → ASCII digits
 *  - remove spaces between CJK glyphs and inside number groups
 */
function normalizeOcrText(text) {
    if (!text)
        return '';
    let s = text;
    // Fullwidth digits ０-９ → 0-9
    s = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
    // Circled digits: ⓪ → 0, ①-⑨ → 1-9, ⑩-⑳ → 10-20
    s = s.replace(/⓪/g, '0');
    s = s.replace(/[①-⑨]/g, c => String(c.charCodeAt(0) - 0x2460 + 1));
    s = s.replace(/[⑩-⑳]/g, c => String(c.charCodeAt(0) - 0x2469 + 10));
    // Remove spaces between two CJK glyphs (repeat to catch overlapping runs).
    const cjkSpace = new RegExp(`([${CJK}]) +(?=[${CJK}])`, 'g');
    for (let i = 0; i < 4; i++)
        s = s.replace(cjkSpace, '$1');
    // Remove spaces between a CJK glyph and a digit (either order).
    s = s.replace(new RegExp(`([${CJK}]) +(?=[0-9])`, 'g'), '$1');
    s = s.replace(new RegExp(`([0-9]) +(?=[${CJK}])`, 'g'), '$1');
    // Remove spaces inside number groups: "363, 602, 836" → "363,602,836".
    s = s.replace(/([0-9]) +(?=[0-9])/g, '$1');
    s = s.replace(/([0-9,.]) +(?=[0-9])/g, '$1');
    return s;
}
// Below this many characters of pdf-parse text we treat the PDF as scanned and
// fall back to OCR.
exports.WEAK_TEXT_THRESHOLD = 40;
/**
 * OCR every page of a scanned PDF and return the combined text.
 *
 * Options:
 *   viewportScale  — PNG render DPI factor (default 2.0 = ~144 DPI).
 *                    Use 1.0 (~72 DPI) for large legal text where speed matters more than
 *                    sub-pixel accuracy — runs ~3× faster than 2.0 on CPU.
 *   pageSampleLimit — when the PDF has MORE than this many pages, only rasterise and OCR
 *                    the first 3 + last 2 pages (where commitment amounts / key labels live).
 *                    Capital-call notices are 1–5 pages so the limit never fires for them.
 */
async function ocrPdf(buffer, opts = {}) {
    const { pageSampleLimit, viewportScale = 2.0, headPages = 3, tailPages = 2 } = opts;
    try {
        // For large PDFs, limit which pages we rasterize.
        // pdf-parse reads the page count cheaply (no rendering), then pdfToPng receives
        // an explicit pagesToProcess list so skipped pages are never rendered.
        let pagesToProcess = undefined;
        if (pageSampleLimit != null) {
            try {
                const pdfParse = (await Promise.resolve().then(() => __importStar(require('pdf-parse')))).default;
                const meta = await pdfParse(buffer, { max: 0 });
                const totalPages = meta.numpages ?? 0;
                if (totalPages > pageSampleLimit) {
                    // 1-indexed: headPages from the front (cover / definitions) + tailPages from the
                    // back (signatures / totals). headPages/tailPages are caller-controlled so the
                    // AI-extract preview step can use fewer pages (faster) than the full ledger path.
                    const head = Math.min(headPages, totalPages);
                    const tailStart = Math.max(head + 1, totalPages - tailPages + 1);
                    const tail = Array.from({ length: Math.min(tailPages, Math.max(0, totalPages - tailStart + 1)) }, (_, i) => tailStart + i);
                    pagesToProcess = [...Array.from({ length: head }, (_, i) => i + 1), ...tail];
                    console.info(`[ocrPdf] large PDF (${totalPages} pages) — sampling pages [${pagesToProcess.join(', ')}] at ${viewportScale}×`);
                }
            }
            catch { /* fall through and rasterize all pages */ }
        }
        const pages = await (0, pdf_to_png_converter_1.pdfToPng)(buffer, {
            viewportScale,
            ...(pagesToProcess ? { pagesToProcess } : {}),
        });
        const buffers = pages.map(p => p.content).filter((c) => !!c);
        if (!buffers.length)
            return '';
        const text = await (0, paddleOcr_1.paddleOcrImageBuffers)(buffers, 'japan');
        return normalizeOcrText(text);
    }
    catch (err) {
        console.error('[ocrPdf] rasterization failed:', err?.message ?? err);
        return '';
    }
}
/**
 * OCR a standalone scanned image (PNG/JPG/etc. — not a PDF) and return the
 * normalized text. Used for fund notices delivered as a photo/scan of a page
 * rather than a PDF file.
 */
async function ocrImage(buffer) {
    const text = await (0, paddleOcr_1.paddleOcrImage)(buffer, 'japan');
    return normalizeOcrText(text);
}
/**
 * Return the best available text for a PDF: pdf-parse text when it's substantial,
 * otherwise OCR text. `pdfText` is what pdf-parse already extracted.
 */
async function textWithOcrFallback(buffer, pdfText, opts = {}) {
    if ((pdfText?.trim().length ?? 0) >= exports.WEAK_TEXT_THRESHOLD)
        return pdfText;
    const ocrText = await ocrPdf(buffer, opts);
    // Keep whichever is longer (OCR can occasionally come back empty).
    return ocrText.trim().length > (pdfText?.trim().length ?? 0) ? ocrText : pdfText;
}
//# sourceMappingURL=pdfOcr.js.map