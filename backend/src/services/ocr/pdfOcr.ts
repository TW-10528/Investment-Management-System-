// PDF OCR fallback for scanned (image-only) notices.
//
// Most fund PDFs carry a text layer that pdf-parse reads directly. Some funds —
// notably the Japanese SDG notices — are scanned images with no text layer, so
// pdf-parse returns almost nothing. For those we rasterize each page to a PNG and
// run Tesseract (Japanese + English) purely in Node, no system packages required.
//
// Language models live in backend/ocr-langs/{jpn,eng}.traineddata.gz (git LFS) so OCR
// needs no network access at runtime.

import path from 'path'
import { createWorker } from 'tesseract.js'
import { pdfToPng } from 'pdf-to-png-converter'

// ponytail: Windows fix for pdf-to-png-converter. It feeds pdfjs a cMapUrl ending
// in "\" (path.sep), but pdfjs 5.x throws unless the URL ends in "/", and the lib
// exposes no override. Patch its normalizePath to use forward slashes. Remove when
// the lib fixes Windows paths or accepts a cMapUrl prop. (CommonJS build — require ok.)
{
  const npPath = path.join(path.dirname(require.resolve('pdf-to-png-converter')), 'normalizePath.js')
  const npMod = require(npPath)
  const orig = npMod.normalizePath
  npMod.normalizePath = (p: string) => orig(p).replace(/\\/g, '/')
}

const LANG_PATH = path.join(process.cwd(), 'ocr-langs')

// CJK = Hiragana, Katakana, CJK ideographs, and fullwidth forms. Used to strip the
// spaces Tesseract inserts between Japanese glyphs.
const CJK = '\\u3040-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef'

/**
 * Clean up Japanese OCR output so the label/amount regexes match:
 *  - circled numbers ①②③…⑳ and ⓪ → ASCII digits
 *  - fullwidth digits ０-９ → ASCII digits
 *  - remove the spaces Tesseract inserts between CJK glyphs and inside numbers
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
 * Returns '' if rasterization or OCR fails (caller keeps the pdf-parse text).
 */
export async function ocrPdf(buffer: Buffer): Promise<string> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  try {
    const pages = await pdfToPng(buffer, {
      viewportScale: 4.0,             // 4x render — needed to read amounts inside
                                      // bordered tables (e.g. SDG 払込み頂く金額 row)
    })
    if (!pages.length) return ''

    // jpn+eng: Japanese body text plus the Latin "SDG" / numbers.
    worker = await createWorker('jpn+eng', 1, {
      langPath: LANG_PATH,
      gzip:     true,
      cachePath: LANG_PATH,
    })
    // PSM 11 (sparse text) finds amounts scattered through table cells that the
    // default layout analysis drops — without it the SDG 払込み頂く金額 figure was
    // being missed while the bottom-of-table 現在の出資未履行金額 was read.
    await worker.setParameters({ tessedit_pageseg_mode: '11' as any })

    const parts: string[] = []
    for (const page of pages) {
      const { data } = await worker.recognize(page.content)
      if (data.text) parts.push(data.text)
    }
    return normalizeOcrText(parts.join('\n'))
  } catch (err: any) {
    console.error('[ocrPdf] OCR failed:', err?.message ?? err)
    return ''
  } finally {
    if (worker) { try { await worker.terminate() } catch { /* ignore */ } }
  }
}

/**
 * Return the best available text for a PDF: pdf-parse text when it's substantial,
 * otherwise OCR text. `pdfText` is what pdf-parse already extracted.
 */
export async function textWithOcrFallback(buffer: Buffer, pdfText: string): Promise<string> {
  if ((pdfText?.trim().length ?? 0) >= WEAK_TEXT_THRESHOLD) return pdfText
  const ocrText = await ocrPdf(buffer)
  // Keep whichever is longer (OCR can occasionally come back empty).
  return ocrText.trim().length > (pdfText?.trim().length ?? 0) ? ocrText : pdfText
}
