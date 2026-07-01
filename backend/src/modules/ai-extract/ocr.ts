import { ocrPdf, ocrImage, WEAK_TEXT_THRESHOLD } from '../../services/ocr/pdfOcr'

// PDFs start with the "%PDF-" magic bytes — but the spec allows up to ~1024
// bytes of arbitrary leading data before it (some scanner/export pipelines
// prepend a few bytes). Checking only byte 0 misclassifies those as raw
// images and routes them into the wrong OCR path.
function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')
}

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; usedOcr: boolean }> {
  if (!isPdfBuffer(buffer)) {
    // Raw image upload (no PDF wrapper) — go straight to PaddleOCR.
    // 'japan' model handles both Japanese kanji/kana and Latin digits/punctuation.
    const text = await ocrImage(buffer)
    return { text, usedOcr: true }
  }

  // Try native text extraction first (fast, works for digital/text-layer PDFs).
  try {
    const pdfParse = (await import('pdf-parse')).default
    const parsed   = await pdfParse(buffer)
    const pdfText  = parsed.text?.trim() ?? ''
    if (pdfText.length >= WEAK_TEXT_THRESHOLD) {
      return { text: pdfText, usedOcr: false }
    }
    // Scanned / image-only PDF — OCR via PaddleOCR.
    // For SDG documents: use 0.5× viewport scale (~36 DPI) for maximum speed.
    // SDG templates are large print → readable at low DPI. ~1-2s/page vs 25s/page at 2×.
    // For other funds: use 1× viewport scale (~72 DPI), fast enough but readable.
    // Limit to first 2 + last 1 pages (3 total) for documents longer than 5 pages.
    // SDG at 0.5× = 3 pages × ~2s = ~6s total (vs 180s at default)
    // headPages=2 covers the fund name / date; tailPages=1 covers amounts
    const isLikelySdg = buffer.toString('latin1', 0, 2000).includes('SDG')
    const viewportScale = isLikelySdg ? 0.5 : 1.0  // Much faster for SDG
    const ocrText = await ocrPdf(buffer, { pageSampleLimit: 5, viewportScale, headPages: 2, tailPages: 1 })
    const text    = ocrText.trim().length > pdfText.length ? ocrText : pdfText
    return { text, usedOcr: true }
  } catch {
    // pdf-parse itself crashed (corrupt PDF, etc.) — still try OCR.
    const isLikelySdg = buffer.toString('latin1', 0, 2000).includes('SDG')
    const viewportScale = isLikelySdg ? 0.5 : 1.0
    const text = await ocrPdf(buffer, { pageSampleLimit: 5, viewportScale, headPages: 2, tailPages: 1 })
    return { text, usedOcr: true }
  }
}
