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
    // For the ai-extract preview step, we only need to classify the document and
    // read the key amounts — not full fidelity. Use 1× viewport scale (~72 DPI)
    // instead of the default 2×: runs ~3× faster on CPU (~7s/page vs ~24s/page)
    // and is sufficient for the large Japanese text in contracts and call notices.
    // Limit to first 3 + last 2 pages for documents longer than 5 pages so a
    // 29-page contract completes in ~40s instead of hitting the 300s timeout.
    const ocrText = await ocrPdf(buffer, { pageSampleLimit: 5, viewportScale: 1.0 })
    const text    = ocrText.trim().length > pdfText.length ? ocrText : pdfText
    return { text, usedOcr: true }
  } catch {
    // pdf-parse itself crashed (corrupt PDF, etc.) — still try OCR.
    const text = await ocrPdf(buffer, { pageSampleLimit: 5, viewportScale: 1.0 })
    return { text, usedOcr: true }
  }
}
