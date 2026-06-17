// Fund PDF extractor — runs OCR then calls the local AI model via Ollama.
// The returned ParsedFundNotice is always a pending result; a human reviewer
// verifies and approves before any ledger records are created.

import pdfParse from 'pdf-parse'
import { textWithOcrFallback } from '../ocr/pdfOcr'
import { extractFundNoticeWithAI } from './aiExtractor'
import { extractSdgNotice } from './sdgExtractor'
import type { ParsedFundNotice } from './types'

export type { ParsedFundNotice }

export async function parseFundPdf(
  buffer: Buffer,
  fileName = '',
  knownFunds: { fundKey: string; fundName: string }[] = [],
): Promise<ParsedFundNotice> {
  const { text: pdfText } = await pdfParse(buffer, { max: 0 })

  // Scanned / image-only PDFs (e.g. Japanese SDG fund) have no text layer —
  // fall back to Tesseract OCR so the AI still gets readable text to work with.
  const usedOcr = (pdfText?.trim().length ?? 0) < 40
  if (usedOcr) {
    console.log(`[EXTRACT] OCR     : embedded text too short (${pdfText?.trim().length ?? 0} chars) — running Tesseract`)
  }
  const text = await textWithOcrFallback(buffer, pdfText)
  if (usedOcr) {
    console.log(`[EXTRACT] OCR     : produced ${text.length.toLocaleString()} chars`)
  }

  // The SDG fund is a single fixed Japanese template — a deterministic regex reads
  // its amounts exactly. Use it before falling back to the AI extractor (which is
  // kept for the other funds' varied English formats).
  const sdg = extractSdgNotice(text, fileName)
  const result = sdg ?? await extractFundNoticeWithAI(text, fileName, knownFunds)

  // Prepend OCR info to the extraction log if OCR was used
  if (usedOcr && result.extractionLog) {
    result.extractionLog.unshift(`OCR: Tesseract used (embedded text was ${pdfText?.trim().length ?? 0} chars, too short)`)
  } else if (result.extractionLog) {
    result.extractionLog.unshift(`Text source: embedded PDF text (${pdfText?.trim().length ?? 0} chars)`)
  }

  return result
}
