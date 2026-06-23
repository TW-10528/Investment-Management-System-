"use strict";
// Fund detector — identifies which fund a PDF belongs to from its raw text.
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFundKey = detectFundKey;
const SIGNATURES = [
    {
        key: 'nb-real-estate',
        patterns: [
            /NB\s+Real\s+Estate\s+Secondary\s+Opportunities/i,
        ],
    },
    {
        key: 'hamilton-lane',
        patterns: [
            /Hamilton\s+Lane\s+Secondary\s+Fund/i,
        ],
    },
    {
        key: 'hamilton-strategic',
        patterns: [
            /Hamilton\s+Lane\s+Strategic\s+Opportunities/i,
        ],
    },
    {
        key: 'dover-street',
        patterns: [
            /Dover\s+Street\s+XI/i,
        ],
    },
    {
        // SDGs 投資事業有限責任組合 — Japanese JPY fund (Thirdwave / サードウェーブ).
        // Keyed on two markers that OCR recovers reliably: the Japanese LPS phrase plus
        // the サード (Thirdwave) investor name. "SDGs" itself is NOT used because OCR
        // misreads the G (e.g. "SDos"/"SDCs"); no other fund in this system is Japanese,
        // so these two together are unambiguous.
        key: 'sdg-lps',
        patterns: [
            /投資事業有限責任組合/,
            // Either the SDG marker (G is OCR-misread as o/C, so allow SD[GOC]s) or the
            // サード (Thirdwave) investor name. Text-layer PDFs match the former; scanned
            // OCR'd ones reliably match the latter.
            /サード|SD[GOC]s/i,
        ],
    },
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
    // ── Stubs for remaining funds ───────────────────────────────────────────────
    // Add each fund's unique identifying text patterns below.
    // Example:
    // {
    //   key: 'blackstone',
    //   patterns: [/blackstone/i, /bx\s+real\s+estate/i],
    // },
];
function detectFundKey(text) {
    for (const sig of SIGNATURES) {
        if (sig.patterns.every(p => p.test(text))) {
            return sig.key;
        }
    }
    return 'unknown';
}
//# sourceMappingURL=detector.js.map