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

import path from 'path'
import { pdfToPng } from 'pdf-to-png-converter'
import { paddleOcrImageBuffers, paddleOcrImage } from './paddleOcr'

// Windows fix for pdf-to-png-converter: it feeds pdfjs a cMapUrl ending in "\"
// (path.sep), but pdfjs 5.x throws unless the URL ends in "/", and the lib
// exposes no override. Patch its normalizePath to use forward slashes. No-op
// on Linux/Mac (paths already use "/"). Remove when the lib fixes Windows
// paths or accepts a cMapUrl prop. (CommonJS build — require ok.)
{
  const npPath = path.join(path.dirname(require.resolve('pdf-to-png-converter')), 'normalizePath.js')
  const npMod = require(npPath)
  const orig = npMod.normalizePath
  npMod.normalizePath = (p: string) => orig(p).replace(/\\/g, '/')
}

// CJK = Hiragana, Katakana, CJK ideographs, and fullwidth forms. Used to strip the
// spaces some OCR engines insert between Japanese glyphs.
const CJK = '\\u3040-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef'

/**
 * Normalise Japanese OCR output so the label/amount regexes match:
 *  - fullwidth digits ０-９ → ASCII digits
 *  - circled numbers ①②③…⑳ and ⓪ → ASCII digits
 *  - remove spaces between CJK glyphs and inside number groups
 */
export function normalizeOcrText(text: string): string {
  if (!text) return ''
  let s = text
  // Fullwidth digits ０-９ → 0-9
  s = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
  // Circled digits: ⓪ → 0, ①-⑨ → 1-9, ⑩-⑳ → 10-20
  s = s.replace(/⓪/g, '0')
  s = s.replace(/[①-⑨]/g, c => String(c.charCodeAt(0) - 0x2460 + 1))
  s = s.replace(/[⑩-⑳]/g, c => String(c.charCodeAt(0) - 0x2469 + 10))
  // Remove spaces between two CJK glyphs (repeat to catch overlapping runs).
  const cjkSpace = new RegExp(`([${CJK}]) +(?=[${CJK}])`, 'g')
  for (let i = 0; i < 4; i++) s = s.replace(cjkSpace, '$1')
  // Remove spaces between a CJK glyph and a digit (either order).
  s = s.replace(new RegExp(`([${CJK}]) +(?=[0-9])`, 'g'), '$1')
  s = s.replace(new RegExp(`([0-9]) +(?=[${CJK}])`, 'g'), '$1')
  // Remove spaces inside number groups: "363, 602, 836" → "363,602,836".
  s = s.replace(/([0-9]) +(?=[0-9])/g, '$1')
  s = s.replace(/([0-9,.]) +(?=[0-9])/g, '$1')
  return s
}

// Below this many characters of pdf-parse text we treat the PDF as scanned and
// fall back to OCR.
export const WEAK_TEXT_THRESHOLD = 40

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
export async function ocrPdf(
  buffer: Buffer,
  opts: { pageSampleLimit?: number; viewportScale?: number; headPages?: number; tailPages?: number } = {},
): Promise<string> {
  const { pageSampleLimit, viewportScale = 2.0, headPages = 3, tailPages = 2 } = opts
  console.log(`[ocrPdf] Starting with ${buffer.length} bytes, scale=${viewportScale}`)

  try {
    let pagesToProcess: number[] | undefined = undefined
    if (pageSampleLimit != null) {
      try {
        console.log('[ocrPdf] Reading page count from PDF metadata...')
        const pdfParse  = (await import('pdf-parse')).default
        const metaStart = Date.now()
        const meta      = await pdfParse(buffer, { max: 0 })
        const metaElapsed = Date.now() - metaStart
        const totalPages: number = (meta as any).numpages ?? 0
        console.log(`[ocrPdf] PDF has ${totalPages} pages (metadata read took ${metaElapsed}ms)`)

        if (totalPages > pageSampleLimit) {
          const head      = Math.min(headPages, totalPages)
          const tailStart = Math.max(head + 1, totalPages - tailPages + 1)
          const tail      = Array.from(
            { length: Math.min(tailPages, Math.max(0, totalPages - tailStart + 1)) },
            (_, i) => tailStart + i,
          )
          pagesToProcess = [...Array.from({ length: head }, (_, i) => i + 1), ...tail]
          console.log(
            `[ocrPdf] Large PDF detected — sampling pages [${pagesToProcess.join(', ')}] at ${viewportScale}×`,
          )
        } else {
          console.log(`[ocrPdf] PDF has ${totalPages} pages (≤ ${pageSampleLimit}) — processing all pages`)
        }
      } catch (e: any) {
        console.warn('[ocrPdf] Failed to read page count:', e?.message)
      }
    }

    console.log('[ocrPdf] Starting PDF rasterization to PNG...')
    const rasterStart = Date.now()
    const pages = await pdfToPng(buffer, {
      viewportScale,
      ...(pagesToProcess ? { pagesToProcess } : {}),
    })
    const rasterElapsed = Date.now() - rasterStart
    console.log(`[ocrPdf] Rasterization completed in ${rasterElapsed}ms, got ${pages.length} pages`)

    const buffers = pages.map(p => p.content).filter((c): c is Buffer => !!c)
    console.log(`[ocrPdf] Extracted ${buffers.length} PNG buffers (sizes: ${buffers.map(b => b.length).join(', ')} bytes)`)

    if (!buffers.length) {
      console.warn('[ocrPdf] No buffers returned from rasterization')
      return ''
    }

    console.log(`[ocrPdf] Starting PaddleOCR on ${buffers.length} buffer(s) with lang=japan...`)
    const ocrStart = Date.now()
    const text = await paddleOcrImageBuffers(buffers, 'japan')
    const ocrElapsed = Date.now() - ocrStart
    console.log(`[ocrPdf] PaddleOCR completed in ${ocrElapsed}ms, returned ${text.length} chars`)

    const normalized = normalizeOcrText(text)
    console.log(`[ocrPdf] After normalization: ${normalized.length} chars`)
    return normalized
  } catch (err: any) {
    console.error('[ocrPdf] FAILED:', err?.message ?? err)
    console.error('[ocrPdf] error type:', err?.constructor?.name)
    console.error('[ocrPdf] error code:', err?.code)
    console.error('[ocrPdf] stack:', err?.stack?.split('\n').slice(0, 5).join(' | '))
    return ''
  }
}

/**
 * OCR a standalone scanned image (PNG/JPG/etc. — not a PDF) and return the
 * normalized text. Used for fund notices delivered as a photo/scan of a page
 * rather than a PDF file.
 */
export async function ocrImage(buffer: Buffer): Promise<string> {
  const text = await paddleOcrImage(buffer, 'japan')
  return normalizeOcrText(text)
}

/**
 * Return the best available text for a PDF: pdf-parse text when it's substantial,
 * otherwise OCR text. `pdfText` is what pdf-parse already extracted.
 */
export async function textWithOcrFallback(
  buffer: Buffer,
  pdfText: string,
  opts: { pageSampleLimit?: number } = {},
): Promise<string> {
  if ((pdfText?.trim().length ?? 0) >= WEAK_TEXT_THRESHOLD) return pdfText
  const ocrText = await ocrPdf(buffer, opts)
  // Keep whichever is longer (OCR can occasionally come back empty).
  return ocrText.trim().length > (pdfText?.trim().length ?? 0) ? ocrText : pdfText
}
