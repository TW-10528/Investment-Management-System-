"""
SDGs 投資事業有限責任組合 OCR/text extraction module.

Production goal:
- Use only the uploaded report PDF text/OCR text.
- Do NOT depend on Excel.
- Currency is JPY. No FX conversion is performed.
- Supports Japanese SDG capital call and distribution notices.

Expected router flow:
1. Try pdfplumber text.
2. For SDG PDFs, run Tesseract OCR when text is weak or scanned.
3. Pass combined text to extract_sdg_lps_report().
4. Use PostgreSQL previous state for cumulative cash flow.

Main Excel mapping:
- Capital call:
    B 出資払込金額 / capital_contribution_amount = 払込み頂く金額
    C 出資受領金額 / distribution_amount_received = 0
    D 再投資充当可能額 / reinvestable_amount = 0
    current_transaction_cash_flow = -B

- Distribution:
    B = 0
    C = 分配金額
    D = 0
    current_transaction_cash_flow = C

SDG-specific cumulative logic:
- SDG commitment amount can change.
- For capital call reports, the report gives:
    現在の出資未履行金額 = current unfunded amount before transaction
    本出資後の出資未履行金額 = remaining commitment after transaction
- If previous cumulative contribution exists:
    current_total_commitment = previous_E + current_unfunded_commitment
    E = current_total_commitment - remaining_after_payment
    F = remaining_after_payment
- This handles commitment changes without Excel.
"""

import json
import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


# ============================================================
# 1. PDF utility
# ============================================================

def extract_pdf_text(file_path: str) -> str:
    if pdfplumber is None:
        raise ImportError("pdfplumber is required. Install with: pip install pdfplumber")

    text_parts: List[str] = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)


def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\xa0", " ").replace("\u200b", "")
    text = text.replace("，", ",")
    text = text.replace("．", ".")
    text = text.replace("（", "(").replace("）", ")")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return text.strip()


def clean_amount(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None

    value = str(value).strip()
    value = (
        value.replace(",", "")
        .replace(".", "") if re.search(r"\d\.\d{3}", value) else value
    )
    value = (
        value.replace(",", "")
        .replace("円", "")
        .replace("￥", "")
        .replace("¥", "")
        .replace(" ", "")
        .replace("\u3000", "")
    )

    if value in {"", "-", "－"}:
        return 0.0

    try:
        return float(value)
    except ValueError:
        return None


def amount_or_zero(value: Optional[float]) -> float:
    return float(value) if value is not None else 0.0


def normalize_japanese_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    value = value.strip()
    value = value.replace(" ", "").replace("\u3000", "")
    value = value.replace("年", "-").replace("月", "-").replace("日", "")
    value = value.replace("/", "-").replace(".", "-")

    match = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", value)
    if match:
        try:
            return datetime(
                int(match.group(1)),
                int(match.group(2)),
                int(match.group(3)),
            ).strftime("%Y-%m-%d")
        except ValueError:
            return None

    return None


def parse_filename_date(file_name: str) -> Optional[str]:
    """
    Supports:
      SDG_290524.pdf -> 2024-05-29
      SDG_080426 1.pdf -> 2026-04-08
    """
    base = os.path.basename(file_name or "")
    match = re.search(r"SDG[_-](\d{2})(\d{2})(\d{2})", base, flags=re.IGNORECASE)
    if not match:
        return None

    dd = int(match.group(1))
    mm = int(match.group(2))
    yy = int(match.group(3))
    yyyy = 2000 + yy

    try:
        return datetime(yyyy, mm, dd).strftime("%Y-%m-%d")
    except ValueError:
        return None


# ============================================================
# 2. Flexible Japanese field extraction
# ============================================================

def find_amount_after_label(text: str, label_patterns: List[str], window: int = 260) -> Optional[float]:
    """
    Finds a JPY amount after flexible label patterns.
    Works with OCR line breaks:
      払込み頂く金額
      363,602,836 円

    OCR often inserts spaces or breaks Japanese labels. Therefore label_patterns
    should include both normal labels and tolerant regex labels.
    """
    for label in label_patterns:
        pattern = label + rf"[\s\S]{{0,{window}}}?([0-9][0-9,\.]*)\s*円"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return clean_amount(match.group(1))
    return None


def find_date_after_label(text: str, label_patterns: List[str], window: int = 120) -> Optional[str]:
    for label in label_patterns:
        pattern = label + rf"[\s\S]{{0,{window}}}?(\d{{4}}\s*年\s*\d{{1,2}}\s*月\s*\d{{1,2}}\s*日)"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return normalize_japanese_date(match.group(1))
    return None


def find_notice_date(text: str) -> Optional[str]:
    match = re.search(r"(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)", text)
    if match:
        return normalize_japanese_date(match.group(1))
    return None


def detect_document_type(text: str) -> str:
    if "組合財産の分配" in text or "収益分配" in text or "分配金" in text:
        return "distribution_notice"
    if "振込送金のご請求" in text or "払込み頂く金額" in text or "払込み期限" in text:
        return "capital_call_notice"
    return "unknown_sdg_notice"


def extract_distribution_amount(text: str) -> Optional[float]:
    # Most distribution notices say:
    # 分配金額 ... 59,527,840 円
    # or 金額 36,037,560 円 near 分配.
    amount = find_amount_after_label(
        text,
        [
            r"分配金額(?:定額)?(?:と支払い期日)?",
            r"分配金額",
            r"収益分配",
            r"貴社に対して",
        ],
        window=220,
    )
    if amount is not None:
        return amount

    # Fallback: if distribution notice has "金額 36,037,560 円" close to "分配"
    match = re.search(r"分配[\s\S]{0,300}?金額[\s\S]{0,80}?([0-9][0-9,\.]*)\s*円", text)
    if match:
        return clean_amount(match.group(1))

    return None


def extract_distribution_date(text: str, file_name: str = "") -> Optional[str]:
    date_value = find_date_after_label(
        text,
        [
            r"振込日",
            r"支払い期日",
            r"支払期日",
            r"支払日",
        ],
        window=160,
    )
    if date_value:
        return date_value

    # If OCR cannot capture distribution payment date, filename date is acceptable
    # because SDG filenames are transaction-date based in the uploaded set.
    return parse_filename_date(file_name)


# ============================================================
# 3. Core extraction
# ============================================================

def extract_all_fields(text: str, file_name: str = "") -> Dict[str, Any]:
    text = normalize_text(text)
    document_type = detect_document_type(text)

    # If OCR text is extremely weak, use filename only for date. Values remain review-required.
    filename_date = parse_filename_date(file_name)

    payment_amount = find_amount_after_label(
        text,
        [
            r"払込み頂く金額",
            r"払込みいただく金額",
            r"払込(?:み)?頂く金額",
            r"払\s*込\s*み?\s*頂\s*く\s*金\s*額",
        ],
        window=180,
    )

    payment_due_date = find_date_after_label(
        text,
        [
            r"払込み期限",
            r"払込み期日",
            r"払込期限",
            r"払込期日",
        ],
        window=120,
    )

    current_unfunded = find_amount_after_label(
        text,
        [
            r"現在の出資未履行金額",
            r"現在の.*?出資未履行金額",
            r"現\s*在\s*の\s*出\s*資\s*未\s*履\s*行\s*金\s*額",
            r"現\s*在[\s\S]{0,40}?出\s*資\s*未\s*履\s*行\s*金\s*額",
        ],
        window=420,
    )

    # OCR fallback:
    # Some first SDG notices OCR the label/table poorly, but the current unfunded
    # amount still appears as a large JPY amount in the page. For SDG capital call
    # notices, when label-based extraction fails, use the largest JPY amount greater
    # than the current payment amount as current_unfunded_commitment.
    #
    # Example SDG_271022:
    #   payment_amount = 45,765,318
    #   current_unfunded = 1,000,000,000
    if current_unfunded is None:
        yen_amounts = []
        for amount_match in re.finditer(r"([0-9][0-9,\.]*)\s*円", text):
            amount = clean_amount(amount_match.group(1))
            if amount is not None:
                yen_amounts.append(amount)

        payment_for_filter = payment_amount or 0.0
        candidates = [
            amount for amount in yen_amounts
            if amount > payment_for_filter and amount >= 100_000_000
        ]

        if candidates:
            current_unfunded = max(candidates)

    remaining_after_payment = (
        find_amount_after_label(
            text,
            [
                r"本出資後の出資未履行金額",
                r"後の出資未履行金額",
                r"本\s*出\s*資\s*後\s*の\s*出\s*資\s*未\s*履\s*行\s*金\s*額",
                r"後\s*の\s*出\s*資\s*未\s*履\s*行\s*金\s*額",
            ],
            window=260,
        )
    )

    distribution_amount = extract_distribution_amount(text)

    notice_date = find_notice_date(text)

    if document_type == "distribution_notice":
        # SDG file names are transaction-date based and are more reliable than OCR dates.
        # Example: SDG_021122.pdf should be 2022-11-02, but OCR may read 2020-11-03.
        transaction_date = filename_date or extract_distribution_date(text, file_name=file_name)
        capital_contribution_amount = 0.0
        distribution_amount_received = distribution_amount or 0.0
        reinvestable_amount = 0.0
        remarks = "組合財産の分配（収益分配）."
    elif document_type == "capital_call_notice":
        # Prefer filename date because Japanese OCR sometimes misreads dates.
        transaction_date = filename_date or payment_due_date
        capital_contribution_amount = payment_amount or 0.0
        distribution_amount_received = 0.0
        reinvestable_amount = 0.0
        remarks = "投資事業有限責任組合契約書に基づく振込送金のご請求."
    else:
        transaction_date = filename_date
        capital_contribution_amount = payment_amount or 0.0
        distribution_amount_received = distribution_amount or 0.0
        reinvestable_amount = 0.0
        remarks = "SDGs 投資事業有限責任組合 transaction notice. Document type could not be confidently detected."

    return {
        "document_type": document_type,
        "is_capital_call": document_type == "capital_call_notice",
        "is_distribution": document_type == "distribution_notice",
        "fund_name": "SDGs 投資事業有限責任組合",
        "company_name": "株式会社サードウェーブ",
        "currency": "JPY",

        "notice_date": notice_date,
        "transaction_date": transaction_date,
        "filename_date": filename_date,

        "payment_amount": payment_amount,
        "payment_due_date": payment_due_date,
        "current_unfunded_commitment": current_unfunded,
        "remaining_after_payment": remaining_after_payment,
        "distribution_amount_from_text": distribution_amount,

        "capital_contribution_amount_for_excel": capital_contribution_amount,
        "distribution_amount_received_for_excel": distribution_amount_received,
        "reinvestable_amount_for_excel": reinvestable_amount,

        "return_of_capital": 0.0,
        "gain": 0.0,
        "interest_other": distribution_amount_received if document_type == "distribution_notice" else 0.0,
        "remarks": remarks,

        "ocr_or_pdf_text_length": len(text),
    }


# ============================================================
# 4. Breakdown
# ============================================================

def build_breakdown(all_fields: Dict[str, Any]) -> Dict[str, Any]:
    capital_call_breakdown: List[Dict[str, Any]] = []
    distribution_breakdown: List[Dict[str, Any]] = []

    b = all_fields.get("capital_contribution_amount_for_excel") or 0.0
    c = all_fields.get("distribution_amount_received_for_excel") or 0.0

    if b:
        capital_call_breakdown.append({
            "purpose": "capital_call",
            "label": "払込み頂く金額",
            "amount": b,
            "currency": "JPY",
            "excel_usage": "capital_contribution_amount",
        })

    if c:
        distribution_breakdown.append({
            "purpose": "interest_other",
            "label": "組合財産の分配（収益分配）",
            "amount": c,
            "currency": "JPY",
            "excel_usage": "distribution_amount_received_and_interest_other",
        })

    return {
        "capital_call_breakdown": capital_call_breakdown,
        "distribution_breakdown": distribution_breakdown,
    }


# ============================================================
# 5. Excel mapping and calculation
# ============================================================

def calculate_current_transaction_cash_flow(
    capital_contribution_amount: float,
    distribution_amount_received: float,
) -> float:
    return round(
        -float(capital_contribution_amount or 0.0)
        + float(distribution_amount_received or 0.0),
        2,
    )


def map_to_excel_fields(all_fields: Dict[str, Any], breakdown: Dict[str, Any]) -> Dict[str, Any]:
    b = all_fields.get("capital_contribution_amount_for_excel") or 0.0
    c = all_fields.get("distribution_amount_received_for_excel") or 0.0
    d = all_fields.get("reinvestable_amount_for_excel") or 0.0

    current_transaction_cash_flow = calculate_current_transaction_cash_flow(b, c)

    return {
        "subscription_agreement_effective_date": None,
        "commitment_amount": None,  # calculated later when previous_state exists
        "transaction_date": all_fields.get("transaction_date"),
        "mufg_ttm": None,

        "capital_contribution_amount": b,
        "distribution_amount_received": c,
        "reinvestable_amount": d,

        "cumulative_capital_contributions": None,
        "remaining_commitment_formula_value": all_fields.get("remaining_after_payment"),
        "remaining_commitment": all_fields.get("remaining_after_payment"),

        "cash_flow": current_transaction_cash_flow,
        "remarks": all_fields.get("remarks"),
        "distribution_details": breakdown.get("distribution_breakdown", []),
        "distribution_not_allocated_to_reinvestment": round(max(c - d, 0.0), 2),

        "return_of_capital": all_fields.get("return_of_capital", 0.0),
        "gain": all_fields.get("gain", 0.0),
        "interest": all_fields.get("interest_other", 0.0),
        "interest_other": all_fields.get("interest_other", 0.0),

        # Report-specific helper fields
        "current_unfunded_commitment": all_fields.get("current_unfunded_commitment"),
        "remaining_after_payment": all_fields.get("remaining_after_payment"),
    }


def calculate_excel_fields(
    extracted_excel_fields: Dict[str, Any],
    all_fields: Dict[str, Any],
    previous_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    b = amount_or_zero(extracted_excel_fields.get("capital_contribution_amount"))
    c = amount_or_zero(extracted_excel_fields.get("distribution_amount_received"))
    d = amount_or_zero(extracted_excel_fields.get("reinvestable_amount"))

    current_cash_flow = calculate_current_transaction_cash_flow(
        capital_contribution_amount=b,
        distribution_amount_received=c,
    )

    current_unfunded = all_fields.get("current_unfunded_commitment")
    remaining_after_payment = all_fields.get("remaining_after_payment")

    cumulative_capital_contributions = None
    remaining_commitment = remaining_after_payment
    commitment_amount = None
    cumulative_cash_flow = current_cash_flow
    final_cash_flow_for_excel = current_cash_flow

    calculation_sources = {
        "cumulative_capital_contributions": "not_available_without_previous_state",
        "remaining_commitment": "from_report_remaining_after_payment",
        "commitment_amount": "not_available_without_previous_state",
        "cash_flow": "current_transaction_cash_flow_no_previous_state",
        "cumulative_cash_flow": "current_transaction_cash_flow_no_previous_state",
    }

    if previous_state:
        previous_e = previous_state.get("cumulative_capital_contributions")
        previous_f = previous_state.get("remaining_commitment")
        previous_cash_flow = previous_state.get("cumulative_cash_flow")

        if all_fields.get("is_capital_call"):
            if previous_e is not None and current_unfunded is not None and remaining_after_payment is not None:
                # Correct SDG commitment-change logic from report fields.
                commitment_amount = round(float(previous_e) + float(current_unfunded), 2)
                cumulative_capital_contributions = round(commitment_amount - float(remaining_after_payment), 2)
                remaining_commitment = round(float(remaining_after_payment), 2)
                calculation_sources["commitment_amount"] = "previous_E_plus_report_current_unfunded"
                calculation_sources["cumulative_capital_contributions"] = "commitment_amount_minus_report_remaining"
                calculation_sources["remaining_commitment"] = "from_report_remaining_after_payment"
            elif previous_e is not None:
                cumulative_capital_contributions = round(float(previous_e) + b, 2)
                calculation_sources["cumulative_capital_contributions"] = "calculated_from_previous_state_simple"
            else:
                cumulative_capital_contributions = b
                calculation_sources["cumulative_capital_contributions"] = "current_row_only_previous_missing"

            if remaining_commitment is None and previous_f is not None:
                remaining_commitment = round(float(previous_f) - b + d, 2)
                calculation_sources["remaining_commitment"] = "calculated_from_previous_state_simple"

        elif all_fields.get("is_distribution"):
            if previous_e is not None:
                cumulative_capital_contributions = round(float(previous_e), 2)
                calculation_sources["cumulative_capital_contributions"] = "carried_forward_from_previous_state"
            if previous_f is not None:
                remaining_commitment = round(float(previous_f), 2)
                calculation_sources["remaining_commitment"] = "carried_forward_from_previous_state"
            if previous_e is not None and previous_f is not None:
                commitment_amount = round(float(previous_e) + float(previous_f), 2)
                calculation_sources["commitment_amount"] = "previous_E_plus_previous_F"

        if previous_cash_flow is not None:
            cumulative_cash_flow = round(float(previous_cash_flow) + current_cash_flow, 2)
            final_cash_flow_for_excel = cumulative_cash_flow
            calculation_sources["cash_flow"] = "cumulative_cash_flow_calculated_from_previous_state"
            calculation_sources["cumulative_cash_flow"] = "calculated_from_previous_state"

    else:
        if all_fields.get("is_capital_call"):
            if current_unfunded is not None and remaining_after_payment is not None:
                # First capital call can be derived from report:
                # commitment = current unfunded before call
                commitment_amount = round(float(current_unfunded), 2)
                cumulative_capital_contributions = round(commitment_amount - float(remaining_after_payment), 2)
                remaining_commitment = round(float(remaining_after_payment), 2)
                calculation_sources["commitment_amount"] = "from_report_current_unfunded_first_row"
                calculation_sources["cumulative_capital_contributions"] = "commitment_amount_minus_report_remaining_first_row"
            elif current_unfunded is not None:
                # Some first SDG notices show only:
                #   現在の出資未履行金額 = 1,000,000,000
                # and do not show 本出資後の出資未履行金額.
                # In that case:
                #   commitment_amount = current_unfunded
                #   E = B
                #   F = current_unfunded - B
                commitment_amount = round(float(current_unfunded), 2)
                cumulative_capital_contributions = round(b, 2)
                remaining_commitment = round(float(current_unfunded) - b + d, 2)
                calculation_sources["commitment_amount"] = "from_report_current_unfunded_first_row_no_after_value"
                calculation_sources["cumulative_capital_contributions"] = "current_capital_call_first_row"
                calculation_sources["remaining_commitment"] = "report_current_unfunded_minus_current_B"
            else:
                cumulative_capital_contributions = b
                calculation_sources["cumulative_capital_contributions"] = "current_row_only_previous_missing"

    distribution_not_allocated = round(max(c - d, 0.0), 2)

    calculated_fields = {
        "commitment_amount": commitment_amount,
        "cumulative_capital_contributions": cumulative_capital_contributions,
        "remaining_commitment_formula_value": remaining_commitment,
        "remaining_commitment": remaining_commitment,
        "current_transaction_cash_flow": current_cash_flow,
        "cumulative_cash_flow": cumulative_cash_flow,
        "cash_flow_for_excel": final_cash_flow_for_excel,
        "distribution_not_allocated_to_reinvestment": distribution_not_allocated,
        "remarks": extracted_excel_fields.get("remarks"),
        "distribution_details": extracted_excel_fields.get("distribution_details", []),
        "return_of_capital": extracted_excel_fields.get("return_of_capital", 0.0),
        "gain": extracted_excel_fields.get("gain", 0.0),
        "interest": extracted_excel_fields.get("interest", 0.0),
        "interest_other": extracted_excel_fields.get("interest_other", 0.0),
    }

    return {
        "input_values_for_current_row": {
            "subscription_agreement_effective_date": extracted_excel_fields.get("subscription_agreement_effective_date"),
            "commitment_amount": commitment_amount,
            "transaction_date": extracted_excel_fields.get("transaction_date"),
            "capital_contribution_amount": b,
            "distribution_amount_received": c,
            "reinvestable_amount": d,
            "return_of_capital": extracted_excel_fields.get("return_of_capital"),
            "gain": extracted_excel_fields.get("gain"),
            "interest_other": extracted_excel_fields.get("interest_other"),
            "current_unfunded_commitment": current_unfunded,
            "remaining_after_payment": remaining_after_payment,
        },
        "previous_state_used": previous_state,
        "calculated_excel_fields": calculated_fields,
        "calculation_sources": calculation_sources,
    }


# ============================================================
# 6. Validation
# ============================================================

def build_validation(
    excel_fields: Dict[str, Any],
    all_fields: Dict[str, Any],
    calculation_result: Dict[str, Any],
) -> Dict[str, Any]:
    b = excel_fields.get("capital_contribution_amount") or 0.0
    c = excel_fields.get("distribution_amount_received") or 0.0
    current_cf = calculation_result["calculated_excel_fields"].get("current_transaction_cash_flow")

    missing: List[str] = []
    if not excel_fields.get("transaction_date"):
        missing.append("transaction_date")
    if all_fields.get("is_capital_call") and not b:
        missing.append("capital_contribution_amount")
    if all_fields.get("is_distribution") and not c:
        missing.append("distribution_amount_received")
    if all_fields.get("is_capital_call") and all_fields.get("current_unfunded_commitment") is None:
        missing.append("current_unfunded_commitment")
    # remaining_after_payment is not always present in the first SDG notice.
    # If current_unfunded_commitment exists, F can be calculated as current_unfunded - B.
    if (
        all_fields.get("is_capital_call")
        and all_fields.get("remaining_after_payment") is None
        and all_fields.get("current_unfunded_commitment") is None
    ):
        missing.append("remaining_after_payment")

    return {
        "missing_important_fields": missing,
        "calculation_checks": {
            "currency": "JPY",
            "excel_b_capital_contribution_amount": b,
            "excel_c_distribution_amount_received": c,
            "excel_d_reinvestable_amount": excel_fields.get("reinvestable_amount"),
            "current_transaction_cash_flow": current_cf,
            "current_unfunded_commitment": all_fields.get("current_unfunded_commitment"),
            "remaining_after_payment": all_fields.get("remaining_after_payment"),
            "calculated_commitment_amount": calculation_result["calculated_excel_fields"].get("commitment_amount"),
            "calculated_cumulative_capital_contributions": calculation_result["calculated_excel_fields"].get("cumulative_capital_contributions"),
            "calculated_remaining_commitment": calculation_result["calculated_excel_fields"].get("remaining_commitment"),
            "cumulative_cash_flow": calculation_result["calculated_excel_fields"].get("cumulative_cash_flow"),
            "cash_flow_for_excel": calculation_result["calculated_excel_fields"].get("cash_flow_for_excel"),
            "ocr_or_pdf_text_length": all_fields.get("ocr_or_pdf_text_length"),
        },
        "needs_review": bool(missing),
        "warnings": [
            "Currency is JPY. No FX conversion is performed.",
            "This module does not use Excel fallback values; OCR numeric fallback uses amounts found in the report text only.",
            "For scanned Japanese PDFs, router should pass Tesseract OCR text to this module; filename date is preferred because OCR can misread Japanese dates.",
            "For accurate DB cumulative flow, upload SDG reports in transaction date order with use_db_previous_state=true. SDG finance detail columns: return_of_capital=0, gain=0, interest=distribution amount for distribution rows only.",
        ],
    }


# ============================================================
# 7. Main function
# ============================================================

def extract_sdg_lps_report(
    text: str,
    file_name: str = "",
    previous_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    text = normalize_text(text or "")
    all_fields = extract_all_fields(text, file_name=file_name)
    breakdown = build_breakdown(all_fields)
    excel_fields = map_to_excel_fields(all_fields, breakdown)
    calculation_result = calculate_excel_fields(excel_fields, all_fields, previous_state)
    validation = build_validation(excel_fields, all_fields, calculation_result)

    calculated = calculation_result.get("calculated_excel_fields", {})
    final_excel_fields = dict(excel_fields)

    final_excel_fields["commitment_amount"] = calculated.get(
        "commitment_amount",
        final_excel_fields.get("commitment_amount"),
    )

    final_excel_fields["cumulative_capital_contributions"] = calculated.get(
        "cumulative_capital_contributions",
        final_excel_fields.get("cumulative_capital_contributions"),
    )

    final_excel_fields["remaining_commitment_formula_value"] = calculated.get(
        "remaining_commitment_formula_value",
        final_excel_fields.get("remaining_commitment_formula_value"),
    )

    final_excel_fields["remaining_commitment"] = calculated.get(
        "remaining_commitment",
        final_excel_fields.get("remaining_commitment"),
    )

    final_excel_fields["cash_flow"] = calculated.get(
        "cash_flow_for_excel",
        final_excel_fields.get("cash_flow"),
    )

    final_excel_fields["current_transaction_cash_flow"] = calculated.get("current_transaction_cash_flow")
    final_excel_fields["cumulative_cash_flow"] = calculated.get("cumulative_cash_flow")

    final_excel_fields["distribution_not_allocated_to_reinvestment"] = calculated.get(
        "distribution_not_allocated_to_reinvestment",
        final_excel_fields.get("distribution_not_allocated_to_reinvestment"),
    )

    final_excel_fields["return_of_capital"] = calculated.get(
        "return_of_capital",
        final_excel_fields.get("return_of_capital", 0.0),
    )
    final_excel_fields["gain"] = calculated.get(
        "gain",
        final_excel_fields.get("gain", 0.0),
    )
    final_excel_fields["interest"] = calculated.get(
        "interest",
        final_excel_fields.get("interest", 0.0),
    )
    final_excel_fields["interest_other"] = calculated.get(
        "interest_other",
        final_excel_fields.get("interest_other", 0.0),
    )

    return {
        "source_file_name": file_name,
        "extraction_status": "success",
        "module_name": "sdgs_lps_jpy",
        "document_type": all_fields.get("document_type"),
        "company_name": all_fields.get("company_name"),
        "fund_name": all_fields.get("fund_name"),
        "currency": "JPY",
        "excel_fields": excel_fields,
        "all_extracted_fields": all_fields,
        "breakdown": breakdown,
        "validation": validation,
        "calculation_result": {
            **calculation_result,
            "final_excel_fields_for_frontend": final_excel_fields,
        },
        "final_excel_fields": final_excel_fields,
    }


extract_sdg_report = extract_sdg_lps_report


# ============================================================
# 8. CLI runner
# ============================================================

def _load_previous_state_from_arg(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    if not raw:
        return None

    if os.path.exists(raw):
        with open(raw, "r", encoding="utf-8") as f:
            return json.load(f)

    return json.loads(raw)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sdg_lps_module.py '<pdf_path>' [previous_state_json_or_file]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    previous_state = _load_previous_state_from_arg(sys.argv[2]) if len(sys.argv) >= 3 else None

    text = extract_pdf_text(pdf_path)
    result = extract_sdg_lps_report(
        text=text,
        file_name=os.path.basename(pdf_path),
        previous_state=previous_state,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
