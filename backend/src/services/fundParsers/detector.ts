// Fund detector — identifies which fund a PDF belongs to from its raw text.

export type FundKey =
  | 'goldman-sachs'
  | 'siguler-guff'
  | 'capula-grv'
  | 'dover-street-xi'
  // ── Add remaining 4 funds here as you provide their PDFs ──
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
    key: 'capula-grv',
    patterns: [/capula\s+global\s+relative\s+value\s+trust|capulaoff2/i],
  },
  {
    key: 'dover-street-xi',
    patterns: [/dover\s+street\s+xi\s+feeder\s+fund/i],
  },
  // ── Stubs for remaining 4 funds ──────────────────────────────────────────────
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
