"use strict";
// Fund parser dispatcher — detects fund from PDF text and runs the right parser.
// Returns a ParsedFundNotice whose fields map directly to calculationEngine.ts Transaction.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFundPdf = parseFundPdf;
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const detector_1 = require("./detector");
const nb_real_estate_1 = require("./nb-real-estate");
const hamilton_lane_1 = require("./hamilton-lane");
const hamilton_strategic_1 = require("./hamilton-strategic");
const dover_street_1 = require("./dover-street");
const sdgExtractor_1 = require("./sdgExtractor");
const goldman_sachs_1 = require("./goldman-sachs");
const siguler_guff_1 = require("./siguler-guff");
const capula_grv_1 = require("./capula-grv");
const pdfOcr_1 = require("../ocr/pdfOcr");
// PDFs start with the "%PDF-" magic bytes — but the spec allows up to ~1024
// bytes of arbitrary leading data before it (some scanner/export pipelines
// prepend a few bytes). Checking only byte 0 would misclassify those as a raw
// image and route them into the wrong OCR path, so scan the whole tolerance
// window. Anything with no "%PDF-" anywhere in it (a phone photo or scan
// uploaded directly as PNG/JPG, with no PDF wrapper at all) has no text layer
// to even attempt pdf-parse on, so it goes straight to OCR.
function isPdfBuffer(buffer) {
    return buffer.subarray(0, 1024).toString('latin1').includes('%PDF-');
}
// ── Dispatch table — add new fund parsers here ────────────────────────────────
// 'sdg-lps' is handled separately below (extractSdgNotice takes a fileName and
// can return null), so it's intentionally not in this single-arg table.
const PARSERS = {
    'nb-real-estate': nb_real_estate_1.parseNbRealEstate,
    'hamilton-lane': hamilton_lane_1.parseHamiltonLane,
    'hamilton-strategic': hamilton_strategic_1.parseHamiltonStrategic,
    'dover-street': dover_street_1.parseDoverStreet,
    'goldman-sachs': goldman_sachs_1.parseGoldmanSachs,
    'siguler-guff': siguler_guff_1.parseSigulerGuff,
    'capula-grv': capula_grv_1.parseCapulaGrv,
};
// ── Main entry point ──────────────────────────────────────────────────────────
async function parseFundPdf(buffer, fileName = '') {
    let text;
    if (isPdfBuffer(buffer)) {
        const { text: pdfText } = await (0, pdf_parse_1.default)(buffer, { max: 0 });
        // Scanned, image-only PDFs (e.g. the Japanese SDG fund) have no text layer —
        // pdf-parse returns almost nothing. Fall back to OCR for those. Text-layer
        // PDFs (every other fund) skip OCR entirely, so there's no added cost for them.
        text = await (0, pdfOcr_1.textWithOcrFallback)(buffer, pdfText);
    }
    else {
        // A photo/scan delivered directly as an image (no PDF wrapper) — there is no
        // text layer to even try, so go straight to OCR.
        text = await (0, pdfOcr_1.ocrImage)(buffer);
    }
    const fundKey = (0, detector_1.detectFundKey)(text);
    // SDG uses the deterministic extractSdgNotice instead of the PARSERS table.
    // detectFundKey() is the routing gate here rather than extractSdgNotice's
    // own internal "/SDGs/i" check: Tesseract regularly reads the fullwidth ｓ in
    // SDGｓ as a separate "S" with a space ("SDG S"), which fails that strict
    // regex even on a genuine SDG document — detector.ts's signature is more
    // OCR-tolerant (it also accepts サード, the Thirdwave investor name, as an
    // anchor). If detectFundKey nonetheless can't get a usable result out of
    // extractSdgNotice (truly unreadable text), fall through to unknownFund.
    if (fundKey === 'sdg-lps') {
        const sdgResult = (0, sdgExtractor_1.extractSdgNotice)(text, fileName);
        if (sdgResult) {
            sdgResult.rawText = text;
            return sdgResult;
        }
        return unknownFund(text);
    }
    const parser = PARSERS[fundKey];
    if (!parser) {
        return unknownFund(text);
    }
    // Dover depends on the filename date: some report tables render differently
    // per PDF layout and the filename date keys report-confirmed fallback values.
    // Other parsers ignore it.
    const result = fundKey === 'dover-street' ? (0, dover_street_1.parseDoverStreet)(text, null, fileName)
        : parser(text);
    result.rawText = text;
    return result;
}
// ── Fallback for unrecognised funds ───────────────────────────────────────────
function unknownFund(text) {
    return {
        fundKey: 'unknown',
        fundName: 'Unknown Fund',
        noticeType: 'capital_call',
        noticeDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        grossCallUsd: 0,
        distributionUsd: 0,
        reinvestableUsd: 0,
        commitmentUsd: 0,
        totalCalledUsd: 0,
        unfundedUsd: 0,
        callPct: 0,
        wireReference: null,
        investmentTargets: [],
        confidence: 0,
        confidenceGrade: 'low',
        rawText: text,
    };
}
//# sourceMappingURL=index.js.map