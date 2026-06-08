// Fund parser dispatcher — detects fund from PDF text and runs the right parser.
// Returns a ParsedFundNotice whose fields map directly to calculationEngine.ts Transaction.

import pdfParse from 'pdf-parse'
import { detectFundKey } from './detector'
import { parseNbRealEstate } from './nb-real-estate'
import { parseHamiltonLane } from './hamilton-lane'
import { parseHamiltonStrategic } from './hamilton-strategic'
import { parseDoverStreet } from './dover-street'
import { parseSdgLps } from './sdg-lps'
import { textWithOcrFallback } from '../ocr/pdfOcr'
import type { ParsedFundNotice } from './types'

export type { ParsedFundNotice }

// ── Dispatch table — add new fund parsers here ────────────────────────────────
const PARSERS: Record<string, (text: string) => ParsedFundNotice> = {
  'nb-real-estate':    parseNbRealEstate,
  'hamilton-lane':     parseHamiltonLane,
  'hamilton-strategic': parseHamiltonStrategic,
  'dover-street':      parseDoverStreet,
  'sdg-lps':           parseSdgLps,
  // 'blackstone':    parseBlackstone,
  // 'kkr':           parseKkr,
  // ... remaining 3 funds
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function parseFundPdf(buffer: Buffer, fileName = ''): Promise<ParsedFundNotice> {
  const { text: pdfText } = await pdfParse(buffer, { max: 0 })

  // Scanned, image-only notices (e.g. the Japanese SDG fund) have no text layer —
  // pdf-parse returns almost nothing. Fall back to OCR for those. Text-layer PDFs
  // (every other fund) skip OCR entirely, so there's no added cost for them.
  const text = await textWithOcrFallback(buffer, pdfText)

  const fundKey = detectFundKey(text)

  const parser = PARSERS[fundKey]
  if (!parser) {
    return unknownFund(text)
  }

  // SDG and Dover depend on the filename date: SDG because Japanese OCR misreads
  // dates, Dover because some report tables render differently per PDF layout and
  // the filename date keys report-confirmed fallback values. Other parsers ignore it.
  const result =
    fundKey === 'sdg-lps'      ? parseSdgLps(text, null, fileName)
    : fundKey === 'dover-street' ? parseDoverStreet(text, null, fileName)
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
