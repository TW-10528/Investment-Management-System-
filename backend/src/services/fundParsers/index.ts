// Fund parser dispatcher — detects fund from PDF text and runs the right parser.
// Returns a ParsedFundNotice whose fields map directly to calculationEngine.ts Transaction.

import pdfParse from 'pdf-parse'
import { detectFundKey } from './detector'
import { parseNbRealEstate } from './nb-real-estate'
import { parseHamiltonLane } from './hamilton-lane'
import { parseHamiltonStrategic } from './hamilton-strategic'
import { parseDoverStreet } from './dover-street'
import { extractSdgNotice } from './sdgExtractor'
import { parseGoldmanSachs } from './goldman-sachs'
import { parseSigulerGuff } from './siguler-guff'
import { parseCapulaGrv } from './capula-grv'
import { textWithOcrFallback, ocrImage } from '../ocr/pdfOcr'
import type { ParsedFundNotice } from './types'

export type { ParsedFundNotice }

// PDFs start with the "%PDF-" magic bytes — but the spec allows up to ~1024
// bytes of arbitrary leading data before it (some scanner/export pipelines
// prepend a few bytes). Checking only byte 0 would misclassify those as a raw
// image and route them into the wrong OCR path, so scan the whole tolerance
// window. Anything with no "%PDF-" anywhere in it (a phone photo or scan
// uploaded directly as PNG/JPG, with no PDF wrapper at all) has no text layer
// to even attempt pdf-parse on, so it goes straight to OCR.
function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')
}

// ── Dispatch table — add new fund parsers here ────────────────────────────────
// 'sdg-lps' is handled separately below (extractSdgNotice takes a fileName and
// can return null), so it's intentionally not in this single-arg table.
const PARSERS: Record<string, (text: string) => ParsedFundNotice> = {
  'nb-real-estate':     parseNbRealEstate,
  'hamilton-lane':      parseHamiltonLane,
  'hamilton-strategic': parseHamiltonStrategic,
  'dover-street':       parseDoverStreet,
  'goldman-sachs':      parseGoldmanSachs,
  'siguler-guff':       parseSigulerGuff,
  'capula-grv':         parseCapulaGrv,
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function parseFundPdf(buffer: Buffer, fileName = ''): Promise<ParsedFundNotice> {
  let text: string
  if (isPdfBuffer(buffer)) {
    const { text: pdfText } = await pdfParse(buffer, { max: 0 })
    // Scanned, image-only PDFs (e.g. the Japanese SDG fund) have no text layer —
    // pdf-parse returns almost nothing. Fall back to OCR for those. Text-layer
    // PDFs (every other fund) skip OCR entirely, so there's no added cost for them.
    text = await textWithOcrFallback(buffer, pdfText)
  } else {
    // A photo/scan delivered directly as an image (no PDF wrapper) — there is no
    // text layer to even try, so go straight to OCR.
    text = await ocrImage(buffer)
  }

  const fundKey = detectFundKey(text)

  // SDG uses the deterministic extractSdgNotice instead of the PARSERS table.
  // detectFundKey() is the routing gate here rather than extractSdgNotice's
  // own internal "/SDGs/i" check: Tesseract regularly reads the fullwidth ｓ in
  // SDGｓ as a separate "S" with a space ("SDG S"), which fails that strict
  // regex even on a genuine SDG document — detector.ts's signature is more
  // OCR-tolerant (it also accepts サード, the Thirdwave investor name, as an
  // anchor). If detectFundKey nonetheless can't get a usable result out of
  // extractSdgNotice (truly unreadable text), fall through to unknownFund.
  if (fundKey === 'sdg-lps') {
    const sdgResult = extractSdgNotice(text, fileName)
    if (sdgResult) {
      sdgResult.rawText = text
      return sdgResult
    }
    return unknownFund(text)
  }

  const parser = PARSERS[fundKey]
  if (!parser) {
    return unknownFund(text)
  }

  // Dover depends on the filename date: some report tables render differently
  // per PDF layout and the filename date keys report-confirmed fallback values.
  // Other parsers ignore it.
  const result =
    fundKey === 'dover-street' ? parseDoverStreet(text, null, fileName)
    : parser(text)
  result.rawText = text
  return result
}

// ── Fallback for unrecognised funds ───────────────────────────────────────────

function unknownFund(text: string): ParsedFundNotice {
  return {
    fundKey:          'unknown',
    fundName:         'Unknown Fund',
    noticeType:       'capital_call',
    noticeDate:       new Date().toISOString().slice(0, 10),
    dueDate:          new Date().toISOString().slice(0, 10),
    grossCallUsd:     0,
    distributionUsd:  0,
    reinvestableUsd:  0,
    commitmentUsd:    0,
    totalCalledUsd:   0,
    unfundedUsd:      0,
    callPct:          0,
    wireReference:    null,
    investmentTargets: [],
    confidence:       0,
    confidenceGrade:  'low',
    rawText:          text,
  }
}
