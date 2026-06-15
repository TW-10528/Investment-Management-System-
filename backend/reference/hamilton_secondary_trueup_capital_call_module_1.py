"""
Hamilton Lane Secondary Fund VI-B LP extraction module.

Purpose:
- Extract both Capital Call and Distribution notices for Hamilton Lane Secondary Fund VI-B LP.
- Map extracted values to the company's standard Excel fields.
- Calculate cumulative Excel fields using optional previous_state from PostgreSQL.

Supported examples:
- HAM_140524.pdf       Capital Call with subsequent close interest payable
- HAM_250924.pdf       Capital Call with subsequent close interest receivable
- HAM_D011124.pdf      Distribution
- HAM_171224.pdf       Capital Call
- HAM_D020525.pdf      Distribution
- HAM_090925.pdf       Capital Call
- HAM_031225.pdf       Capital Call
- HAM_240326.pdf       Capital Call

Company Excel mapping:
A / commitment_amount = Capital commitment
B / capital_contribution_amount = capital-call components only
    - Capital call for investments
    - Capital call for management fees
    - Capital call for expenses
    - Excludes subsequent close interest payable / receivable
C / distribution_amount_received = distribution transaction total, positive
D / reinvestable_amount = recallable distribution amount only
E / cumulative_capital_contributions = previous E + B, or report Amounts drawn when previous_state is missing
F / remaining_commitment = previous F - B + D, or report Remaining unfunded commitment when previous_state is missing
G / current_transaction_cash_flow = -B + C
cash_flow / cumulative_cash_flow = previous cumulative cash flow + current_transaction_cash_flow,
    or -report Amounts drawn + report Cumulative distributions when previous_state is missing

Run directly:
    pip install pdfplumber
    python hamilton_secondary_trueup_capital_call_module.py "uploads/HAM_140524.pdf"

Run with previous state:
    python hamilton_secondary_trueup_capital_call_module.py "uploads/HAM_250924.pdf" \
      '{"cumulative_capital_contributions":750000,"remaining_commitment":4250000,"cumulative_cash_flow":-750000}'

Import usage from FastAPI:
    from hamilton_secondary_trueup_capital_call_module import extract_hamilton_secondary_trueup_report
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
# 1. PDF / text utilities
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
    text = text.replace("\xa0", " ").replace("\u200b", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return text.strip()


def normalize_date(date_text: Optional[str]) -> Optional[str]:
    if not date_text:
        return None

    date_text = date_text.strip()
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_text


def clean_amount(value: Optional[str], absolute: bool = False) -> Optional[float]:
    if value is None:
        return None

    value = str(value).strip()
    if value in {"-", "$-", "$ -", "—"}:
        return 0.0

    value = (
        value.replace("$", "")
        .replace("¥", "")
        .replace(",", "")
        .replace("%", "")
        .replace(" ", "")
    )

    is_negative = False
    if value.startswith("(") and value.endswith(")"):
        is_negative = True
        value = value[1:-1]

    if value in {"", "-"}:
        return 0.0

    try:
        amount = float(value)
        if is_negative:
            amount = -amount
        if absolute:
            amount = abs(amount)
        return amount
    except ValueError:
        return None


def amount_or_zero(value: Optional[float]) -> float:
    return float(value) if value is not None else 0.0


_AMOUNT_PATTERN = r"(\$?\s*\([\d,]+(?:\.\d+)?%?\)|\(?\$?\s*-?[\d,]+(?:\.\d+)?%?\)?|\$?\s*-)"


def find_amount_by_label(
    text: str,
    labels: List[str],
    absolute: bool = True,
    occurrence: int = 1,
) -> Optional[float]:
    for label in labels:
        pattern = rf"{re.escape(label)}\s*:?\s*{_AMOUNT_PATTERN}"
        matches = list(re.finditer(pattern, text, flags=re.IGNORECASE))
        if len(matches) >= occurrence:
            return clean_amount(matches[occurrence - 1].group(1), absolute=absolute)
    return None


def find_first_date(text: str) -> Optional[str]:
    match = re.search(r"\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b", text)
    return normalize_date(match.group(1)) if match else None


def find_date_by_label(text: str, labels: List[str]) -> Optional[str]:
    for label in labels:
        pattern = rf"{re.escape(label)}\s*:?\s*([A-Za-z]+\s+\d{{1,2}},\s+\d{{4}})"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return normalize_date(match.group(1))
    return None


def find_transaction_date(text: str) -> Optional[str]:
    # Example: September 25, 2024 Transaction
    match = re.search(r"\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+Transaction\b", text, flags=re.IGNORECASE)
    if match:
        return normalize_date(match.group(1))

    # Fallback for capital call and distribution due date headers
    return find_date_by_label(text, ["Capital Call Due Date", "Distribution Due Date"])


def detect_currency(text: str) -> str:
    if "$" in text:
        return "USD"
    if "¥" in text or "JPY" in text.upper():
        return "JPY"
    if "€" in text or "EUR" in text.upper():
        return "EUR"
    return "unknown"


def detect_document_type(text: str) -> str:
    lower = text.lower()
    if "re: distribution" in lower or "distribution amount:" in lower:
        return "distribution_notice"
    if "re: capital call" in lower or "capital call amount:" in lower:
        return "capital_call_notice"
    return "unknown_notice"


def find_company_name(text: str) -> Optional[str]:
    investor_match = re.search(r"Investor:\s*([^\n]+)", text, flags=re.IGNORECASE)
    if investor_match:
        return " ".join(investor_match.group(1).strip().split())

    match = re.search(
        r"Hamilton Lane Secondary Fund VI-B LP\s*\n\s*([A-Za-z0-9 .,&'-]+?)\s*\n\s*Current Transaction Detail",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        return " ".join(match.group(1).strip().split())

    return None


# ============================================================
# 2. Extraction
# ============================================================

def extract_all_fields(text: str) -> Dict[str, Any]:
    document_type = detect_document_type(text)
    notice_date = find_first_date(text)
    transaction_date = find_transaction_date(text)

    capital_call_due_date = find_date_by_label(text, ["Capital Call Due Date"])
    distribution_due_date = find_date_by_label(text, ["Distribution Due Date"])

    capital_call_amount_header = find_amount_by_label(text, ["Capital Call Amount"], absolute=True)
    distribution_amount_header = find_amount_by_label(text, ["Distribution Amount"], absolute=True)

    # Current transaction total can be positive for capital call and negative/parentheses for distribution.
    transaction_total_signed = find_amount_by_label(text, ["Transaction total"], absolute=False)
    transaction_total_abs = abs(transaction_total_signed) if transaction_total_signed is not None else None

    # Capital call components. These should be included in Excel B.
    capital_call_for_investments = find_amount_by_label(text, ["Capital call for investments"], absolute=True)
    capital_call_for_management_fees = find_amount_by_label(text, ["Capital call for management fees"], absolute=True)
    capital_call_for_expenses = find_amount_by_label(text, ["Capital call for expenses"], absolute=True)

    # Interest true-up items. These are extracted but excluded from Excel B/C cash-flow formula.
    subsequent_close_interest_payable = find_amount_by_label(text, ["Subsequent close interest payable"], absolute=True)
    subsequent_close_interest_receivable = find_amount_by_label(text, ["Subsequent close interest (receivable)"], absolute=True)

    # Distribution components. Use absolute positive amounts for Excel C / details.
    dist_return_capital = find_amount_by_label(text, ["Distribution of return of capital"], absolute=True)
    dist_return_capital_recallable = find_amount_by_label(text, ["Distribution of return of capital (recallable)"], absolute=True)
    dist_investment_income = find_amount_by_label(text, ["Distribution of investment income"], absolute=True)
    dist_investment_income_recallable = find_amount_by_label(text, ["Distribution of investment income (recallable)"], absolute=True)
    dist_realized_gain = find_amount_by_label(text, ["Distribution of realized gain"], absolute=True)
    dist_realized_gain_recallable = find_amount_by_label(text, ["Distribution of realized gain (recallable)"], absolute=True)

    # Commitment summary.
    capital_commitment = find_amount_by_label(text, ["Capital commitment"], absolute=True)
    amounts_drawn = find_amount_by_label(text, ["Amounts drawn"], absolute=True)
    recallable_amounts_distributed = find_amount_by_label(text, ["Recallable amounts distributed"], absolute=True) or 0.0
    remaining_unfunded_commitment = find_amount_by_label(text, ["Remaining unfunded commitment"], absolute=True)
    cumulative_distributions = find_amount_by_label(text, ["Cumulative distributions"], absolute=True) or 0.0

    # Bank/wire fields.
    bank_name = None
    bank_match = re.search(r"Bank:\s*([^\n]+)", text, flags=re.IGNORECASE)
    if bank_match:
        bank_name = bank_match.group(1).strip()

    aba_number = None
    aba_match = re.search(r"ABA\s*#:\s*([0-9 ]+)", text, flags=re.IGNORECASE)
    if aba_match:
        aba_number = aba_match.group(1).strip()

    swift_code = None
    swift_match = re.search(r"SWIFT\s*Code:\s*([A-Za-z0-9]+)", text, flags=re.IGNORECASE)
    if swift_match:
        swift_code = swift_match.group(1).strip()

    account_number = None
    account_number_match = re.search(r"Account Number:\s*([0-9]+)", text, flags=re.IGNORECASE)
    if account_number_match:
        account_number = account_number_match.group(1).strip()

    account_name = None
    account_name_match = re.search(r"Account Name:\s*([^\n]+)", text, flags=re.IGNORECASE)
    if account_name_match:
        account_name = account_name_match.group(1).strip()

    reference = None
    ref_match = re.search(r"Reference:\s*[“\"]?([^”\"\n]+)[”\"]?", text, flags=re.IGNORECASE)
    if ref_match:
        reference = ref_match.group(1).strip()

    # Excel B: positive capital call components only.
    capital_component_values = [
        capital_call_for_investments,
        capital_call_for_management_fees,
        capital_call_for_expenses,
    ]
    capital_contribution_amount = round(sum(v for v in capital_component_values if v is not None), 2)

    # If component lines are unavailable but this is a capital call, fallback to transaction/header amount.
    if capital_contribution_amount == 0 and document_type == "capital_call_notice":
        capital_contribution_amount = transaction_total_abs or capital_call_amount_header or 0.0

    # Excel C: distribution received is total distribution amount.
    distribution_amount_received = 0.0
    if document_type == "distribution_notice":
        distribution_amount_received = transaction_total_abs or distribution_amount_header or 0.0

    # Excel D: reinvestable / recallable distribution only.
    reinvestable_amount = round(
        amount_or_zero(dist_return_capital_recallable)
        + amount_or_zero(dist_investment_income_recallable)
        + amount_or_zero(dist_realized_gain_recallable),
        2,
    )

    # Distribution details by category, matching company Excel detail columns.
    return_of_capital_total = round(amount_or_zero(dist_return_capital) + amount_or_zero(dist_return_capital_recallable), 2)
    investment_income_total = round(amount_or_zero(dist_investment_income) + amount_or_zero(dist_investment_income_recallable), 2)
    realized_gain_total = round(amount_or_zero(dist_realized_gain) + amount_or_zero(dist_realized_gain_recallable), 2)

    return {
        "document_type": document_type,
        "notice_date": notice_date,
        "transaction_date": transaction_date,
        "capital_call_due_date": capital_call_due_date,
        "distribution_due_date": distribution_due_date,
        "capital_call_amount_header": capital_call_amount_header,
        "distribution_amount_header": distribution_amount_header,
        "transaction_total_signed": transaction_total_signed,
        "transaction_total_abs": transaction_total_abs,
        "capital_call_for_investments": capital_call_for_investments,
        "capital_call_for_management_fees": capital_call_for_management_fees,
        "capital_call_for_expenses": capital_call_for_expenses,
        "subsequent_close_interest_payable": subsequent_close_interest_payable,
        "subsequent_close_interest_receivable": subsequent_close_interest_receivable,
        "capital_commitment": capital_commitment,
        "amounts_drawn": amounts_drawn,
        "recallable_amounts_distributed": recallable_amounts_distributed,
        "remaining_unfunded_commitment": remaining_unfunded_commitment,
        "cumulative_distributions": cumulative_distributions,
        "distribution_return_of_capital": dist_return_capital,
        "distribution_return_of_capital_recallable": dist_return_capital_recallable,
        "distribution_investment_income": dist_investment_income,
        "distribution_investment_income_recallable": dist_investment_income_recallable,
        "distribution_realized_gain": dist_realized_gain,
        "distribution_realized_gain_recallable": dist_realized_gain_recallable,
        "return_of_capital_total": return_of_capital_total,
        "investment_income_total": investment_income_total,
        "realized_gain_total": realized_gain_total,
        "capital_contribution_amount": capital_contribution_amount,
        "distribution_amount_received": distribution_amount_received,
        "reinvestable_amount": reinvestable_amount,
        "distribution_not_allocated_to_reinvestment": round(distribution_amount_received - reinvestable_amount, 2),
        "actual_payment_amount": capital_call_amount_header or (transaction_total_abs if document_type == "capital_call_notice" else 0.0),
        "actual_distribution_amount": distribution_amount_header or (transaction_total_abs if document_type == "distribution_notice" else 0.0),
        "bank_name": bank_name,
        "aba_number": aba_number,
        "swift_code": swift_code,
        "account_number": account_number,
        "account_name": account_name,
        "reference": reference,
    }


# ============================================================
# 3. Breakdown
# ============================================================

def build_breakdown(all_fields: Dict[str, Any]) -> Dict[str, Any]:
    capital_call_breakdown: List[Dict[str, Any]] = []
    distribution_breakdown: List[Dict[str, Any]] = []

    if all_fields.get("capital_call_for_investments") is not None:
        capital_call_breakdown.append({
            "purpose": "investment",
            "label": "Capital call for investments",
            "amount": all_fields["capital_call_for_investments"],
            "excel_usage": "capital_contribution_amount_component",
        })

    if all_fields.get("capital_call_for_management_fees") is not None:
        capital_call_breakdown.append({
            "purpose": "management_fee",
            "label": "Capital call for management fees",
            "amount": all_fields["capital_call_for_management_fees"],
            "excel_usage": "capital_contribution_amount_component",
        })

    if all_fields.get("capital_call_for_expenses") is not None:
        capital_call_breakdown.append({
            "purpose": "fund_expense",
            "label": "Capital call for expenses",
            "amount": all_fields["capital_call_for_expenses"],
            "excel_usage": "capital_contribution_amount_component",
        })

    if all_fields.get("subsequent_close_interest_payable") is not None:
        capital_call_breakdown.append({
            "purpose": "subsequent_close_interest_payable",
            "label": "Subsequent close interest payable",
            "amount": all_fields["subsequent_close_interest_payable"],
            "excel_usage": "actual_payment_only_not_excel_capital_contribution",
        })

    if all_fields.get("subsequent_close_interest_receivable") is not None:
        distribution_breakdown.append({
            "purpose": "subsequent_close_interest_receivable",
            "label": "Subsequent close interest receivable",
            "amount": all_fields["subsequent_close_interest_receivable"],
            "excel_usage": "remark_only_not_excel_distribution_amount",
        })

    if all_fields.get("return_of_capital_total"):
        distribution_breakdown.append({
            "purpose": "return_of_capital",
            "label": "Distribution of return of capital",
            "amount": all_fields["return_of_capital_total"],
            "recallable_amount": amount_or_zero(all_fields.get("distribution_return_of_capital_recallable")),
            "excel_usage": "distribution_details_return_of_capital",
        })

    if all_fields.get("realized_gain_total"):
        distribution_breakdown.append({
            "purpose": "realized_gain",
            "label": "Distribution of realized gain",
            "amount": all_fields["realized_gain_total"],
            "recallable_amount": amount_or_zero(all_fields.get("distribution_realized_gain_recallable")),
            "excel_usage": "distribution_details_gain",
        })

    if all_fields.get("investment_income_total"):
        distribution_breakdown.append({
            "purpose": "investment_income",
            "label": "Distribution of investment income",
            "amount": all_fields["investment_income_total"],
            "recallable_amount": amount_or_zero(all_fields.get("distribution_investment_income_recallable")),
            "excel_usage": "distribution_details_interest_other",
        })

    return {
        "capital_call_breakdown": capital_call_breakdown,
        "distribution_breakdown": distribution_breakdown,
    }


# ============================================================
# 4. Excel mapping and calculation
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
    capital_contribution_amount = amount_or_zero(all_fields.get("capital_contribution_amount"))
    distribution_amount_received = amount_or_zero(all_fields.get("distribution_amount_received"))
    reinvestable_amount = amount_or_zero(all_fields.get("reinvestable_amount"))

    current_transaction_cash_flow = calculate_current_transaction_cash_flow(
        capital_contribution_amount=capital_contribution_amount,
        distribution_amount_received=distribution_amount_received,
    )

    remarks_parts = []
    if all_fields.get("document_type") == "capital_call_notice":
        remarks_parts.append("Hamilton Lane capital call notice.")
        if all_fields.get("capital_call_for_investments") is not None:
            remarks_parts.append(f"Capital {all_fields['capital_call_for_investments']:,.0f}.")
        if all_fields.get("capital_call_for_management_fees") is not None:
            remarks_parts.append(f"Management fee {all_fields['capital_call_for_management_fees']:,.0f}.")
        if all_fields.get("capital_call_for_expenses") is not None:
            remarks_parts.append(f"Expense {all_fields['capital_call_for_expenses']:,.0f}.")
        if all_fields.get("subsequent_close_interest_payable") is not None:
            remarks_parts.append(f"Subsequent close interest payable {all_fields['subsequent_close_interest_payable']:,.0f}; excluded from Excel cash flow.")
        if all_fields.get("subsequent_close_interest_receivable") is not None:
            remarks_parts.append(f"Subsequent close interest receivable {all_fields['subsequent_close_interest_receivable']:,.0f}; excluded from Excel cash flow.")
    elif all_fields.get("document_type") == "distribution_notice":
        remarks_parts.append("Hamilton Lane distribution notice.")
        remarks_parts.append("Recallable distribution is treated as reinvestable amount.")
    else:
        remarks_parts.append("Hamilton Lane notice.")

    return {
        "subscription_agreement_effective_date": None,
        "commitment_amount": all_fields.get("capital_commitment"),
        "transaction_date": all_fields.get("transaction_date"),
        "capital_contribution_amount": capital_contribution_amount,
        "distribution_amount_received": distribution_amount_received,
        "reinvestable_amount": reinvestable_amount,
        "cumulative_capital_contributions": all_fields.get("amounts_drawn"),
        "remaining_commitment_formula_value": all_fields.get("remaining_unfunded_commitment"),
        "remaining_commitment": all_fields.get("remaining_unfunded_commitment"),
        "cash_flow": current_transaction_cash_flow,
        "remarks": " ".join(remarks_parts),
        "distribution_details": breakdown.get("distribution_breakdown", []),
        "distribution_not_allocated_to_reinvestment": all_fields.get("distribution_not_allocated_to_reinvestment"),
        "return_of_capital": all_fields.get("return_of_capital_total") or 0.0,
        "gain": all_fields.get("realized_gain_total") or 0.0,
        "interest": all_fields.get("investment_income_total") or 0.0,
        "interest_other": all_fields.get("investment_income_total") or 0.0,
        "subsequent_close_interest_payable": all_fields.get("subsequent_close_interest_payable") or 0.0,
        "subsequent_close_interest_receivable": all_fields.get("subsequent_close_interest_receivable") or 0.0,
        "actual_payment_amount": all_fields.get("actual_payment_amount") or 0.0,
        "actual_distribution_amount": all_fields.get("actual_distribution_amount") or 0.0,
    }


def calculate_excel_fields(
    extracted_excel_fields: Dict[str, Any],
    all_fields: Dict[str, Any],
    previous_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    b = amount_or_zero(extracted_excel_fields.get("capital_contribution_amount"))
    c = amount_or_zero(extracted_excel_fields.get("distribution_amount_received"))
    d = amount_or_zero(extracted_excel_fields.get("reinvestable_amount"))

    report_e = all_fields.get("amounts_drawn")
    report_f = all_fields.get("remaining_unfunded_commitment")
    report_cumulative_distributions = amount_or_zero(all_fields.get("cumulative_distributions"))

    cumulative_capital_contributions = report_e
    remaining_commitment = report_f
    cumulative_cash_flow = None

    calculation_sources = {
        "cumulative_capital_contributions": "from_report_amounts_drawn_no_previous_state",
        "remaining_commitment": "from_report_remaining_unfunded_commitment_no_previous_state",
        "cash_flow": "from_report_amounts_drawn_and_cumulative_distributions_no_previous_state",
        "cumulative_cash_flow": "from_report_amounts_drawn_and_cumulative_distributions_no_previous_state",
    }

    current_cash_flow = calculate_current_transaction_cash_flow(
        capital_contribution_amount=b,
        distribution_amount_received=c,
    )

    # Fallback when DB previous_state is missing:
    # company Excel cumulative cash flow = -Amounts drawn + Cumulative distributions.
    if report_e is not None:
        cumulative_cash_flow = round(-float(report_e) + float(report_cumulative_distributions), 2)
        final_cash_flow_for_excel = cumulative_cash_flow
    else:
        final_cash_flow_for_excel = current_cash_flow
        cumulative_cash_flow = None
        calculation_sources["cash_flow"] = "current_transaction_cash_flow_no_previous_state"
        calculation_sources["cumulative_cash_flow"] = "not_calculated_previous_state_missing"

    if previous_state:
        previous_e = previous_state.get("cumulative_capital_contributions")
        previous_f = previous_state.get("remaining_commitment")
        previous_cash_flow = previous_state.get("cumulative_cash_flow")

        if previous_e is not None:
            cumulative_capital_contributions = round(float(previous_e) + b, 2)
            calculation_sources["cumulative_capital_contributions"] = "calculated_from_previous_state"

        if previous_f is not None:
            remaining_commitment = round(float(previous_f) - b + d, 2)
            calculation_sources["remaining_commitment"] = "calculated_from_previous_state"

        if previous_cash_flow is not None:
            cumulative_cash_flow = round(float(previous_cash_flow) + current_cash_flow, 2)
            final_cash_flow_for_excel = cumulative_cash_flow
            calculation_sources["cash_flow"] = "cumulative_cash_flow_calculated_from_previous_state"
            calculation_sources["cumulative_cash_flow"] = "calculated_from_previous_state"

    distribution_not_allocated = round(c - d, 2)

    calculated_fields = {
        "cumulative_capital_contributions": cumulative_capital_contributions,
        "remaining_commitment_formula_value": remaining_commitment,
        "remaining_commitment": remaining_commitment,
        "current_transaction_cash_flow": current_cash_flow,
        "cumulative_cash_flow": cumulative_cash_flow,
        "cash_flow_for_excel": final_cash_flow_for_excel,
        "distribution_not_allocated_to_reinvestment": distribution_not_allocated,
        "remarks": extracted_excel_fields.get("remarks"),
        "distribution_details": extracted_excel_fields.get("distribution_details", []),
        "return_of_capital": extracted_excel_fields.get("return_of_capital"),
        "gain": extracted_excel_fields.get("gain"),
        "interest_other": extracted_excel_fields.get("interest_other"),
        "subsequent_close_interest_payable": extracted_excel_fields.get("subsequent_close_interest_payable"),
        "subsequent_close_interest_receivable": extracted_excel_fields.get("subsequent_close_interest_receivable"),
        "actual_payment_amount": extracted_excel_fields.get("actual_payment_amount"),
        "actual_distribution_amount": extracted_excel_fields.get("actual_distribution_amount"),
    }

    return {
        "input_values_for_current_row": {
            "subscription_agreement_effective_date": extracted_excel_fields.get("subscription_agreement_effective_date"),
            "commitment_amount": extracted_excel_fields.get("commitment_amount"),
            "transaction_date": extracted_excel_fields.get("transaction_date"),
            "capital_contribution_amount": b,
            "distribution_amount_received": c,
            "reinvestable_amount": d,
        },
        "previous_state_used": previous_state,
        "calculated_excel_fields": calculated_fields,
        "calculation_sources": calculation_sources,
    }


# ============================================================
# 5. Validation
# ============================================================

def build_validation(
    excel_fields: Dict[str, Any],
    all_fields: Dict[str, Any],
    breakdown: Dict[str, Any],
    calculation_result: Dict[str, Any],
) -> Dict[str, Any]:
    required_excel_fields = [
        "subscription_agreement_effective_date",
        "commitment_amount",
        "transaction_date",
        "capital_contribution_amount",
        "distribution_amount_received",
        "reinvestable_amount",
        "cumulative_capital_contributions",
        "remaining_commitment",
        "cash_flow",
        "remarks",
        "distribution_details",
    ]

    missing_excel_fields: List[str] = []
    matched_excel_fields: List[str] = []

    for field in required_excel_fields:
        value = excel_fields.get(field)
        if value is None or value == "":
            missing_excel_fields.append(field)
        else:
            matched_excel_fields.append(field)

    capital_call_breakdown_total_excel = round(sum(
        item["amount"] for item in breakdown.get("capital_call_breakdown", [])
        if item.get("amount") is not None and item.get("excel_usage") == "capital_contribution_amount_component"
    ), 2)

    distribution_breakdown_total = round(sum(
        item["amount"] for item in breakdown.get("distribution_breakdown", [])
        if item.get("amount") is not None and item.get("purpose") in {"return_of_capital", "realized_gain", "investment_income"}
    ), 2)

    report_e = all_fields.get("amounts_drawn")
    calc_e = calculation_result["calculated_excel_fields"].get("cumulative_capital_contributions")
    report_f = all_fields.get("remaining_unfunded_commitment")
    calc_f = calculation_result["calculated_excel_fields"].get("remaining_commitment")

    current_cash_flow = calculation_result["calculated_excel_fields"].get("current_transaction_cash_flow")
    cumulative_cash_flow = calculation_result["calculated_excel_fields"].get("cumulative_cash_flow")
    cash_flow_for_excel = calculation_result["calculated_excel_fields"].get("cash_flow_for_excel")

    return {
        "missing_excel_fields": missing_excel_fields,
        "matched_excel_fields": matched_excel_fields,
        "calculation_checks": {
            "document_type": all_fields.get("document_type"),
            "capital_call_breakdown_total_for_excel_B": capital_call_breakdown_total_excel,
            "capital_contribution_amount": excel_fields.get("capital_contribution_amount"),
            "is_capital_call_breakdown_matched_to_excel_B": (
                round(capital_call_breakdown_total_excel, 2) == round(excel_fields.get("capital_contribution_amount") or 0.0, 2)
                if excel_fields.get("capital_contribution_amount") else None
            ),
            "distribution_breakdown_total": distribution_breakdown_total,
            "distribution_amount_received": excel_fields.get("distribution_amount_received"),
            "is_distribution_breakdown_matched": (
                round(distribution_breakdown_total, 2) == round(excel_fields.get("distribution_amount_received") or 0.0, 2)
                if excel_fields.get("distribution_amount_received") else None
            ),
            "report_amounts_drawn": report_e,
            "calculated_cumulative_capital_contributions": calc_e,
            "is_cumulative_capital_contributions_matched_with_report": (
                round(report_e, 2) == round(calc_e, 2) if report_e is not None and calc_e is not None else None
            ),
            "report_remaining_commitment": report_f,
            "calculated_remaining_commitment": calc_f,
            "is_remaining_commitment_matched_with_report": (
                round(report_f, 2) == round(calc_f, 2) if report_f is not None and calc_f is not None else None
            ),
            "current_transaction_cash_flow": current_cash_flow,
            "cumulative_cash_flow": cumulative_cash_flow,
            "cash_flow_for_excel": cash_flow_for_excel,
            "report_cumulative_distributions": all_fields.get("cumulative_distributions"),
            "report_recallable_amounts_distributed": all_fields.get("recallable_amounts_distributed"),
            "transaction_total_signed": all_fields.get("transaction_total_signed"),
            "transaction_total_abs": all_fields.get("transaction_total_abs"),
        },
        "needs_review": True,
        "warnings": [
            "Capital calls: Excel capital_contribution_amount includes investment, management fee, and expense components, but excludes subsequent close interest payable/receivable.",
            "Distributions: distribution_amount_received uses total distribution, reinvestable_amount uses recallable distribution components only, and L column is calculated as C - D, including negative values.",
            "If previous_state values are provided, cumulative Excel fields use previous_state. If not, report cumulative values are used as fallback.",
        ],
    }


# ============================================================
# 6. Main module function
# ============================================================

def extract_hamilton_secondary_trueup_report(
    text: str,
    file_name: str = "",
    previous_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    text = normalize_text(text)
    all_fields = extract_all_fields(text)
    breakdown = build_breakdown(all_fields)
    excel_fields = map_to_excel_fields(all_fields, breakdown)
    calculation_result = calculate_excel_fields(excel_fields, all_fields, previous_state)
    validation = build_validation(excel_fields, all_fields, breakdown, calculation_result)

    calculated = calculation_result.get("calculated_excel_fields", {})

    final_excel_fields = dict(excel_fields)
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

    final_excel_fields["return_of_capital"] = calculated.get("return_of_capital")
    final_excel_fields["gain"] = calculated.get("gain")
    final_excel_fields["interest_other"] = calculated.get("interest_other")

    return {
        "source_file_name": file_name,
        "extraction_status": "success",
        "module_name": "hamilton_secondary_fund_vi_b",
        "document_type": all_fields.get("document_type"),
        "company_name": find_company_name(text),
        "fund_name": "Hamilton Lane Secondary Fund VI-B LP",
        "currency": detect_currency(text),
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


# Backward-compatible alias if needed.
extract_hamilton_secondary_fund_vi_report = extract_hamilton_secondary_trueup_report


# ============================================================
# 7. CLI runner
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
        print("Usage: python hamilton_secondary_trueup_capital_call_module.py '<pdf_path>' [previous_state_json_or_file]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    previous_state = _load_previous_state_from_arg(sys.argv[2]) if len(sys.argv) >= 3 else None

    text = extract_pdf_text(pdf_path)
    result = extract_hamilton_secondary_trueup_report(
        text=text,
        file_name=os.path.basename(pdf_path),
        previous_state=previous_state,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
