/**
 * Normalise Japanese OCR output so the label/amount regexes match:
 *  - fullwidth digits ０-９ → ASCII digits
 *  - circled numbers ①②③…⑳ and ⓪ → ASCII digits
 *  - remove spaces between CJK glyphs and inside number groups
 */
export declare function normalizeOcrText(text: string): string;
export declare const WEAK_TEXT_THRESHOLD = 40;
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
export declare function ocrPdf(buffer: Buffer, opts?: {
    pageSampleLimit?: number;
    viewportScale?: number;
    headPages?: number;
    tailPages?: number;
}): Promise<string>;
/**
 * OCR a standalone scanned image (PNG/JPG/etc. — not a PDF) and return the
 * normalized text. Used for fund notices delivered as a photo/scan of a page
 * rather than a PDF file.
 */
export declare function ocrImage(buffer: Buffer): Promise<string>;
/**
 * Return the best available text for a PDF: pdf-parse text when it's substantial,
 * otherwise OCR text. `pdfText` is what pdf-parse already extracted.
 */
export declare function textWithOcrFallback(buffer: Buffer, pdfText: string, opts?: {
    pageSampleLimit?: number;
}): Promise<string>;
//# sourceMappingURL=pdfOcr.d.ts.map