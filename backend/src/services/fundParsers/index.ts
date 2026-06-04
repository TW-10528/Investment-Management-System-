// Fund parser dispatcher — detects fund from PDF text and runs the right parser.
// Returns a ParsedFundNotice whose fields map directly to calculationEngine.ts Transaction.

import pdfParse from 'pdf-parse'
import { detectFundKey } from './detector'
import { parseGoldmanSachs } from './goldman-sachs'
import { parseSigulerGuff }  from './siguler-guff'
import { parseNbRealEstate } from './nb-real-estate'
import type { ParsedFundNotice } from './types'

export type { ParsedFundNotice }

// ── Dispatch table — add new fund parsers here ────────────────────────────────
const PARSERS: Record<string, (text: string) => ParsedFundNotice> = {
  'goldman-sachs':  parseGoldmanSachs,
  'siguler-guff':   parseSigulerGuff,
  'nb-real-estate': parseNbRealEstate,
  // 'blackstone':    parseBlackstone,
  // 'kkr':           parseKkr,
  // ... remaining 7 funds
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function parseFundPdf(buffer: Buffer): Promise<ParsedFundNotice> {
  const { text } = await pdfParse(buffer, { max: 0 })

  const fundKey = detectFundKey(text)

  const parser = PARSERS[fundKey]
  if (!parser) {
    return unknownFund(text)
  }

  const result = parser(text)
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
