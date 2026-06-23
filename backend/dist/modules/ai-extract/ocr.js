"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPdfText = extractPdfText;
const pdfOcr_1 = require("../../services/ocr/pdfOcr");
// PDFs start with the "%PDF-" magic bytes — but the spec allows up to ~1024
// bytes of arbitrary leading data before it (some scanner/export pipelines
// prepend a few bytes). Checking only byte 0 misclassifies those as raw
// images and routes them into the wrong OCR path.
function isPdfBuffer(buffer) {
    return buffer.subarray(0, 1024).toString('latin1').includes('%PDF-');
}
async function extractPdfText(buffer) {
    if (!isPdfBuffer(buffer)) {
        // Raw image upload (no PDF wrapper) — go straight to PaddleOCR.
        // 'japan' model handles both Japanese kanji/kana and Latin digits/punctuation.
        const text = await (0, pdfOcr_1.ocrImage)(buffer);
        return { text, usedOcr: true };
    }
    // Try native text extraction first (fast, works for digital/text-layer PDFs).
    try {
        const pdfParse = (await Promise.resolve().then(() => __importStar(require('pdf-parse')))).default;
        const parsed = await pdfParse(buffer);
        const pdfText = parsed.text?.trim() ?? '';
        if (pdfText.length >= pdfOcr_1.WEAK_TEXT_THRESHOLD) {
            return { text: pdfText, usedOcr: false };
        }
        // Scanned / image-only PDF — OCR via PaddleOCR.
        // For the ai-extract preview step, we only need to classify the document and
        // read the key amounts — not full fidelity. Use 1× viewport scale (~72 DPI)
        // instead of the default 2×: runs ~3× faster on CPU (~7s/page vs ~24s/page)
        // and is sufficient for the large Japanese text in contracts and call notices.
        // Limit to first 2 + last 1 pages (3 total) for documents longer than 5 pages.
        // 3 pages × ~60s/page on slow CPU = ~180s, safely under the 600s OCR timeout.
        // headPages=2 covers the fund name / date; tailPages=1 covers the signature page
        // where commitment amounts typically appear.
        const ocrText = await (0, pdfOcr_1.ocrPdf)(buffer, { pageSampleLimit: 5, viewportScale: 1.0, headPages: 2, tailPages: 1 });
        const text = ocrText.trim().length > pdfText.length ? ocrText : pdfText;
        return { text, usedOcr: true };
    }
    catch {
        // pdf-parse itself crashed (corrupt PDF, etc.) — still try OCR.
        const text = await (0, pdfOcr_1.ocrPdf)(buffer, { pageSampleLimit: 5, viewportScale: 1.0, headPages: 2, tailPages: 1 });
        return { text, usedOcr: true };
    }
}
//# sourceMappingURL=ocr.js.map