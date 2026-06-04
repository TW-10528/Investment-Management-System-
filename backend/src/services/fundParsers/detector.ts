// Fund detector — identifies which fund a PDF belongs to from its raw text.

export type FundKey =
  | 'goldman-sachs'
  | 'siguler-guff'
  | 'nb-real-estate'
  // ── Add remaining 6 funds here as you provide their PDFs ──
  | 'unknown'

interface FundSignature {
  key:      FundKey
  patterns: RegExp[]   // ALL must match (AND logic)
}

const SIGNATURES: FundSignature[] = [
  {
    key: 'goldman-sachs',
    patterns: [
      /goldman\s+sachs/i,
      /vintage\s+x/i,
    ],
  },
  {
    key: 'siguler-guff',
    patterns: [
      /siguler\s+guff/i,
    ],
  },
  {
    key: 'nb-real-estate',
    patterns: [
      /NB\s+Real\s+Estate\s+Secondary\s+Opportunities/i,
    ],
  },
  // ── Stubs for remaining 7 funds ─────────────────────────────────────────────
  // Add each fund's unique identifying text patterns below.
  // Example:
  // {
  //   key: 'blackstone',
  //   patterns: [/blackstone/i, /bx\s+real\s+estate/i],
  // },
]

export function detectFundKey(text: string): FundKey {
  for (const sig of SIGNATURES) {
    if (sig.patterns.every(p => p.test(text))) {
      return sig.key
    }
  }
  return 'unknown'
}
