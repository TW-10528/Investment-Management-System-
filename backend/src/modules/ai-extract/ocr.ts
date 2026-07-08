import { ocrPdf, ocrImage, WEAK_TEXT_THRESHOLD } from '../../services/ocr/pdfOcr'

// PDFs start with the "%PDF-" magic bytes — but the spec allows up to ~1024
// bytes of arbitrary leading data before it (some scanner/export pipelines
// prepend a few bytes). Checking only byte 0 misclassifies those as raw
// images and routes them into the wrong OCR path.
function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')
}

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; usedOcr: boolean }> {
  console.log(`[extractPdfText] Starting with ${buffer.length} bytes`)

  if (!isPdfBuffer(buffer)) {
    console.log('[extractPdfText] Not a PDF buffer — treating as raw image')
    const text = await ocrImage(buffer)
    console.log(`[extractPdfText] Image OCR returned ${text.length} chars`)
    return { text, usedOcr: true }
  }

  console.log('[extractPdfText] PDF detected — trying native text extraction first')
  try {
    const pdfParse = (await import('pdf-parse')).default
    const startTime = Date.now()
    const parsed   = await pdfParse(buffer)
    const elapsed = Date.now() - startTime
    const pdfText  = parsed.text?.trim() ?? ''
    console.log(`[extractPdfText] pdf-parse completed in ${elapsed}ms, extracted ${pdfText.length} chars`)

    if (pdfText.length >= WEAK_TEXT_THRESHOLD) {
      console.log(`[extractPdfText] ✓ Sufficient text from pdf-parse (${pdfText.length} >= ${WEAK_TEXT_THRESHOLD})`)
      return { text: pdfText, usedOcr: false }
    }

    console.log(`[extractPdfText] Insufficient text (${pdfText.length} < ${WEAK_TEXT_THRESHOLD}) — falling back to OCR`)
    const isLikelySdg = buffer.toString('latin1', 0, 2000).includes('SDG')
    console.log(`[extractPdfText] Document appears to be ${isLikelySdg ? 'SDG' : 'non-SDG'}`)

    const viewportScale = isLikelySdg ? 0.5 : 1.0
    const headPages = isLikelySdg ? 1 : 2
    const tailPages = isLikelySdg ? 0 : 1

    console.log(`[extractPdfText] Starting OCR with scale=${viewportScale}, headPages=${headPages}, tailPages=${tailPages}`)
    const ocrStartTime = Date.now()
    const ocrText = await ocrPdf(buffer, { pageSampleLimit: 5, viewportScale, headPages, tailPages })
    const ocrElapsed = Date.now() - ocrStartTime
    console.log(`[extractPdfText] OCR completed in ${ocrElapsed}ms, extracted ${ocrText.length} chars`)

    const text = ocrText.trim().length > pdfText.length ? ocrText : pdfText
    console.log(`[extractPdfText] Using ${ocrText.length > pdfText.length ? 'OCR' : 'pdf-parse'} text (${text.length} chars)`)
    return { text, usedOcr: true }
  } catch (err: any) {
    console.error('[extractPdfText] pdf-parse crashed:', err?.message ?? err)
    console.error('[extractPdfText] Exception details:', {
      message: err?.message,
      code: err?.code,
      type: err?.constructor?.name,
      stack: err?.stack?.split('\n')[0]
    })
    console.log('[extractPdfText] Attempting OCR as fallback')

    try {
      const isLikelySdg = buffer.toString('latin1', 0, 2000).includes('SDG')
      const viewportScale = isLikelySdg ? 0.5 : 1.0

      console.log(`[extractPdfText] Starting OCR (fallback) with scale=${viewportScale}`)
      const ocrStartTime = Date.now()
      const text = await ocrPdf(buffer, { pageSampleLimit: 5, viewportScale, headPages: 2, tailPages: 1 })
      const ocrElapsed = Date.now() - ocrStartTime
      console.log(`[extractPdfText] OCR (fallback) completed in ${ocrElapsed}ms, extracted ${text.length} chars`)

      return { text, usedOcr: true }
    } catch (ocrErr: any) {
      console.error('[extractPdfText] OCR fallback also failed:', ocrErr?.message ?? ocrErr)
      console.error('[extractPdfText] OCR Error details:', {
        message: ocrErr?.message,
        code: ocrErr?.code,
        type: ocrErr?.constructor?.name
      })
      throw ocrErr
    }
  }
}
