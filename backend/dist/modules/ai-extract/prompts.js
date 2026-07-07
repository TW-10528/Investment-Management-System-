"use strict";
// All AI prompts transcribed from the Calculation Document.
// Placeholders: {{DOCUMENT_TEXT}}
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTOR_PROMPTS = exports.CLASSIFIER_PROMPT = exports.SYSTEM_PROMPT = void 0;
exports.SYSTEM_PROMPT = `/no_think
You are the extraction engine for an Investment Management System used by a
corporate finance department. You read fund capital-call and distribution
notices and return STRICTLY STRUCTURED JSON.

ABSOLUTE RULES:
1. You extract and classify ONLY. You NEVER compute cumulative values
   (cumulative contributions, remaining commitment, cumulative cash flow).
   Those are calculated by a separate deterministic engine.
2. Return ONLY valid JSON. No prose, no markdown, no code fences, no comments.
3. Every monetary value must be a number with no currency symbols, no commas,
   no parentheses. Convert accounting negatives in parentheses to negative
   numbers: "(26,824)" becomes -26824.
4. If a field is not present in the document, return null. Never guess.
5. Never invent labels or values not physically in the document text.
6. Preserve the sign convention exactly as defined per fund below.
7. If you are unsure, lower the confidence score rather than guessing a value.`;
exports.CLASSIFIER_PROMPT = `TASK: Identify which fund issued this report and what type of report it is.

KNOWN FUNDS (return the exact key on the left):
  NB_REAL_ESTATE   → "NB Real Estate Secondary Opportunities", "Neuberger Berman"
  HAMILTON_SEC     → "Hamilton Lane Secondary Fund VI-B"
  HAMILTON_STRAT   → "Hamilton Lane Strategic Opportunities Fund IX-B"
  SDG              → "SDGｓ投資事業有限責任組合", "SDG", Japanese AFM report
  DOVER            → "Dover Street" + Roman numeral (XI, XII, XIII, etc.), "HarbourVest"
                     ⚠️ CRITICAL: Extract the EXACT Roman numeral from document:
                     - "Dover Street XII Feeder Fund" → report this as "Dover Street XII"
                     - "Dover Street XI Feeder Fund" → report this as "Dover Street XI"
                     - Compare carefully: XII ≠ XI, XIII ≠ XII
  GOLDMAN          → "Vintage", "Goldman Sachs Asset Management", "SCSp"
  SIGULER_GUFF     → "Siguler Guff Small Buyout Opportunities Fund"
  CAPULA           → "Capula Global Relative Value", "CGRV"

REPORT TYPES — transaction documents (will be calculated and added to ledger):
  CAPITAL_CALL          → calls capital only (B>0, C=0)
  DISTRIBUTION          → distribution only (B=0, C>0)
  NETTED_CALL           → both capital call and distribution in one notice
  INITIAL_CONTRIBUTION  → first contribution / commitment confirmation

REPORT TYPES — reference documents (stored for viewing, no ledger calculation):
  FINANCIAL_STATEMENT   → audited/unaudited financial statements, balance sheets, P&L
  NAV_REPORT            → net asset value report, portfolio valuation, fund NAV
  QUARTERLY_REPORT      → quarterly investor update, performance report
  ANNUAL_REPORT         → annual report, yearly review
  TAX_DOCUMENT          → tax statement, K-1, withholding notice, tax certificate
  AUDIT_REPORT          → auditor's report, independent audit
  COMMITMENT_NOTICE     → subscription/investment agreement, 出資契約書, 匿名組合契約書, 有限責任組合契約書, commitment letter — documents that state the LP's total commitment amount but are NOT capital calls or distributions
  OTHER                 → any other fund-related document not matching above

NB REAL ESTATE DOCUMENT TYPE GUIDE (critical):
  Analyze the document content to determine the actual type:
  - Look for "Limited Partner's Share of Capital Contribution" → indicates B (capital call)
  - Look for "Limited Partner's Share of Distributable Proceeds" → indicates C (distribution)
  - IF both sections are present with non-zero amounts → NETTED_CALL
  - IF only capital contribution section present → CAPITAL_CALL
  - IF only distribution section present → DISTRIBUTION
  Do NOT assume all NB Real Estate docs are the same type. Check what's actually in
  the document text before classifying.

SDG DOCUMENT TYPE GUIDE (critical — SDG notices use investment terms that can mislead):
  CAPITAL_CALL  → SDG 払込通知書: contains "払込み頂く金額" (amount to pay in).
                  The presence of "出資未履行金額" (unfunded balance) does NOT make
                  this a COMMITMENT_NOTICE — unfunded balance appears on every call notice.
  DISTRIBUTION  → SDG 収益分配通知: contains "分配金額", "貴社への分配金額", or "組合財産の分配".
  COMMITMENT_NOTICE → SDG 出資契約書 / 有限責任組合契約書: a multi-page partnership
                  agreement document. Contains "出資約束金額" or "コミットメント金額"
                  as the LP commitment, and does NOT contain "払込み頂く金額".

INSTRUCTIONS:
- Match on fund legal name, manager name, or distinctive labels in the text.
- If no known fund matches with confidence, set fund_key to "UNKNOWN".
- confidence_score reflects how certain the fund identity is (0-100).
- Choose the most specific report_type that matches. When in doubt between a
  transaction type and a reference type, pick whichever fits the document purpose.

Return JSON exactly:
{
  "fund_key": "",
  "fund_display_name": "",
  "report_type": "",
  "currency": "USD | JPY",
  "confidence_score": 0
}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`;
// ── Fund-specific extraction prompts ─────────────────────────────────────────
const COMMON_SCHEMA = `
Return ONLY this JSON shape (common output schema):
{
  "transaction_date": "YYYY-MM-DD",
  "B_capital_contribution": null,
  "C_distribution_received": null,
  "D_reinvestable": null,
  "return_of_capital": null,
  "gain": null,
  "interest": null,
  "report_provided_unfunded_before": null,
  "report_provided_remaining_after": null,
  "subsequent_close_interest": null,
  "total_commitment_amount": null,
  "notes": "",
  "extraction_confidence": 0
}`;
exports.EXTRACTOR_PROMPTS = {
    NB_REAL_ESTATE: `You are extracting from an NB Real Estate Secondary Opportunities notice.

DATE EXTRACTION (CRITICAL):
- Look for "Payment Date:" or "payment date" in the document → USE THIS DATE
- Fallback: Use "Total Net Cash Distribution:" date if available
- DO NOT use the letter date or today's date. Find the actual payment/execution date.

FIELD MAPPING (handles all three formats):

IF CAPITAL CALL ONLY (no distribution):
- B = "Limited Partner's Share of Capital Contribution" + Net Management Fee
     (Net Management Fee = Management Fee Amount - Management Fee Rebate)
- C = 0, D = 0

IF DISTRIBUTION ONLY (no capital call, or capital call is deemed/negative):
- B = "Capital Contributions Required for Partnership Management Fees" if present
     (if shown in parentheses/negative, this is a deduction from C, so B = 0)
- C = "Limited Partner's Share of Distributable Proceeds"
- D = "Limited Partner's Share of Distributable Proceeds" (same as C)

IF CAPITAL CALL + DISTRIBUTION (NETTED):
- B = "Limited Partner's Share of Capital Contribution"
- C = "Limited Partner's Share of Distributable Proceeds"
- D = "Limited Partner's Share of Distributable Proceeds"

FINANCE DETAIL:
- return_of_capital = Limited Partner's Share of Distributable Proceeds
- gain = 0
- interest = 0
- total_commitment_amount = Original Commitment or "Commitment" amount if shown
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    HAMILTON_SEC: `You are extracting from a Hamilton Lane Secondary Fund VI-B notice.

REPORT TYPE matters:

IF CAPITAL CALL report:
- B = "Capital call for investments" + "Capital call for management fees"
      + "Capital call for expenses"
- "Subsequent close interest payable/receivable" is extracted to
  subsequent_close_interest but is NOT included in B.
- C = 0, D = 0, return_of_capital = 0, gain = 0, interest = 0

IF DISTRIBUTION report:
- B = 0
- C = total distribution amount
- D = recallable portion =
      "return of capital recallable" + "investment income recallable"
      + "realized gain recallable"
- return_of_capital = "Distribution of return of capital"
                    + "Distribution of return of capital (recallable)"
- gain = "Distribution of realized gain"
       + "Distribution of realized gain (recallable)"
- interest = "Distribution of investment income"
           + "Distribution of investment income (recallable)"

COMMITMENT DETAIL:
- total_commitment_amount = LP's total commitment (often shows as "Commitment" or "Your Commitment" in notices). Extract if visible on the report.
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    HAMILTON_STRAT: `You are extracting from a Hamilton Lane Strategic Opportunities IX-B notice.

REPORT TYPE matters:

IF normal CAPITAL CALL:
- B = sum of capital call components
- C = 0, D = 0, return_of_capital = 0, gain = 0, interest = 0

IF TRUE-UP / RETURN OF UNUSED CAPITAL:
- "Return of unused capital for investments" → D (reinvestable/recallable)
- "Subsequent close interest receivable" → subsequent_close_interest (and interest)
- C = distribution amount received
- D = return of unused capital / recallable distribution

IF NET CAPITAL CALL (both sections present):
- B = total capital call
- C = total distribution + subsequent close interest receivable
- D = recallable distribution / total distribution

FINANCE DETAIL (if "Current Distribution Accounting Treatment" present):
- return_of_capital = "Repayment of principal"
- gain = 0
- interest = "Interest income" + "Other investment income"
           + subsequent close interest receivable

IMPORTANT SIGN NOTE: this fund can have negative B (returned capital) and
L = C - D can be negative. Extract raw values exactly; do not normalize signs.
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    SDG: `You are extracting from an SDGｓ投資事業有限責任組合 (SDG) Japanese notice.
The text may come from OCR and contain minor character errors. Match labels
flexibly but never invent numbers.

JAPANESE LABELS:
- 払込金額               = B (capital_contribution_amount)
- 現在の出資未履行額      = report_provided_unfunded_before
- 本出資後の出資未履行額   = report_provided_remaining_after
- 収益分配額 / 組合財産の分配 = C (distribution amount)

IF CAPITAL CALL report:
- B = 払込金額
- C = 0, D = 0, return_of_capital = 0, gain = 0, interest = 0

IF DISTRIBUTION report:
- B = 0
- C = distribution amount
- D = 0
- return_of_capital = 0, gain = 0
- interest = C   (SDG distribution is recorded entirely as interest)

DATE: if a clear date is not readable in the text, return null for
transaction_date — the system will use the filename date instead.
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    DOVER: `You are extracting from a Dover Street XI Feeder Fund notice.

IF INITIAL CONTRIBUTION report:
- B = Total Calls amount (e.g. 3,800,000)
- C = 0, D = 0
- "Total Interest" is closing/actual payment detail and is NOT distribution
  interest → interest = 0
- return_of_capital = 0, gain = 0

IF CASH DISTRIBUTION report:
- B = 0
- C = Return of Capital + Gain + Interest
- D = 0
- return_of_capital = Return of Capital
- gain = Gain
- interest = Interest/Other if present, else 0

IF CAPITAL CALL AND DEEMED DISTRIBUTION report:
- B = Capital Call amount
- C = Deemed Distribution / Gross Distribution / Net Distribution
- D = 0
- return_of_capital = Return of Capital
- gain = Gain
- interest = 0 unless interest/other income is present
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    GOLDMAN: `You are extracting from a Goldman Sachs Vintage capital contribution notice.

- B = capital contribution amount ("Gross Contribution")
- C = 0, D = 0
- return_of_capital = null, gain = null, interest = null
  (Goldman reports do not provide this breakdown)
- Also extract report_provided_remaining_after if "Outstanding Commitment"
  is shown.
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    SIGULER_GUFF: `You are extracting from a Siguler Guff Small Buyout Opportunities notice.
These are percentage-based capital call reports.

EXTRACT:
- B = capital call amount ("Your share of this capital call is")
- capital_call_percent = the "% of commitments" figure
- funded_after_call_percent = "you will have funded X% of your commitment"
- C = 0, D = 0
- return_of_capital = null, gain = null, interest = null

Put capital_call_percent and funded_after_call_percent in "notes" as
"call_pct=4.9;funded_pct=9.8". The calc engine infers commitment from these.
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    CAPULA: `You are extracting from a Capula Global Relative Value notice.

- Extract standard capital contribution or distribution fields:
  B = capital contribution if present, else 0
  C = distribution / "Distribution" amount if present, else 0
  D = 0
- return_of_capital = null, gain = null, interest = null
  (Capula reports do not provide this breakdown)
${COMMON_SCHEMA}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
    UNKNOWN: `TASK: This is a fund report from a fund NOT yet in the system. Analyze it and
propose a field-mapping template so it can be onboarded.

Identify and quote the EXACT label text used in this document for each concept:
1. Commitment amount
2. Capital contribution / capital call amount  (→ B)
3. Distribution amount received                (→ C)
4. Recallable / reinvestable amount            (→ D)
5. Return of capital portion
6. Gain / realized gain portion
7. Interest / investment income / other income portion
8. Unfunded commitment before transaction
9. Remaining commitment after transaction

Return JSON exactly:
{
  "suggested_fund_key": "",
  "suggested_display_name": "",
  "currency": "",
  "needs_ocr": false,
  "report_types_seen": [],
  "label_mapping": {
    "commitment_amount_label": "",
    "B_capital_contribution_label": "",
    "C_distribution_label": "",
    "D_reinvestable_label": "",
    "return_of_capital_label": "",
    "gain_label": "",
    "interest_label": "",
    "unfunded_before_label": "",
    "remaining_after_label": ""
  },
  "sample_extracted_values": {
    "B_capital_contribution": null,
    "C_distribution_received": null,
    "D_reinvestable": null
  },
  "mapping_confidence": 0,
  "open_questions_for_human": []
}

DOCUMENT TEXT:
"""
{{DOCUMENT_TEXT}}
"""`,
};
//# sourceMappingURL=prompts.js.map