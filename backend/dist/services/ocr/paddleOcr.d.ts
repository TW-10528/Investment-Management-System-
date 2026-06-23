export type PaddleOcrLang = 'japan' | 'en';
/**
 * OCR a batch of already-rasterized page/image buffers (one PDF → N pages)
 * and return the combined text, in page order.
 *
 * All page buffers are written to temp files and passed to the Python script
 * in a single execFile call, so model weights are loaded only once regardless
 * of how many pages the PDF has.
 */
export declare function paddleOcrImageBuffers(buffers: Buffer[], lang?: PaddleOcrLang): Promise<string>;
/**
 * OCR a single rasterized image buffer (PNG/JPG).
 * Returns '' on any failure — callers treat '' as "OCR produced nothing usable".
 */
export declare function paddleOcrImage(buffer: Buffer, lang?: PaddleOcrLang): Promise<string>;
//# sourceMappingURL=paddleOcr.d.ts.map