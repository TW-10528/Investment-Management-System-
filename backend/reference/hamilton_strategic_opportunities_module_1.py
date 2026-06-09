"""
Hamilton Lane Strategic Opportunities Fund IX-B LP extraction module.

Purpose:
- Extract values from Hamilton Lane Strategic Opportunities Fund IX-B LP capital call,
  distribution, close true-up, and net capital call notices.
- Map extracted values to the company's standard Excel fields.
- Calculate formula-based Excel fields using optional previous_state from PostgreSQL.

Supported samples:
- HAMS_24012025.pdf
- HAMS_07032025.pdf
- HAMS_26062025.pdf
- HAMS_15082025.pdf
- HAMS_12112025.pdf
- HAMS_04022026.pdf

Important business logic:
1. Normal capital call
   B capital_contribution_amount = capital call components / total capital call
   C distribution_amount_received = 0
   D reinvestable_amount = 0
   current_transaction_cash_flow = -B + C

2. Return of unused capital + subsequent close interest receivable
   Example:
       Return of unused capital for investments $ (162,237)
       Subsequent close interest (receivable) (5,912)
       Transaction total $ (168,149)

   Excel mapping:
       B = -162,237
       C = 5,912
       D = 162,237
       current_transaction_cash_flow = -(-162,237) + 5,912 = 168,149

3. Net capital call with distribution
   Example:
       Total capital call 187,013
       Total distribution (114,653)
       Subsequent close interest (receivable) (18,779)
       Transaction total $ 53,581

   Excel mapping:
       B = 187,013
       C = 114,653 + 18,779 = 133,432
       D = 114,653
       current_transaction_cash_flow = -187,013 + 133,432 = -53,581

4. Cumulative formulas:
   If previous_state exists:
       cumulative_capital_contributions = previous cumulative + B
       remaining_commitment = previous remaining - B + D
       cash_flow = previous cumulative_cash_flow + current_transaction_cash_flow

   If previous_state does not exist:
       use report cumulative values where available:
       cumulative_capital_contributions = Amounts drawn
       remaining_commitment = Remaining unfunded commitment
       cash_flow = -Amounts drawn + Cumulative distributions

Run directly:
    pip install pdfplumber
    python hamilton_strategic_opportunities_module.py "uploads/HAMS_24012025.pdf"

Run with previous state:
    python hamilton_strategic_opportunities_module.py "uploads/HAMS_07032025.pdf" \
      '{"cumulative_capital_contributions":584454,"remaining_commitment":2415546,"cumulative_cash_flow":-584454}'

Import usage:
    from hamilton_strategic_opportunities_module import (
        extract_hamilton_strategic_report,
        extract_pdf_text,
    )
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

# Supports normal and parenthesized amounts:
#   $ 584,454
#   (26,824)
#   $ (26,824)
#   $ -
_AMOUNT_PATTERN = r"(\$?\s*\(?\s*-?[\d,]+(?:\.\d+)?%?\s*\)?|\$?\s*-)"


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

    is_negative = False

    # Normalize currency first so "$ (26,824)" becomes "(26,824)"
    value = value.replace("$", "").replace("¥", "").strip()

    if value.startswith("(") and value.endswith(")"):
        is_negative = True
        value = value[1:-1]

    value = (
        value.replace(",", "")
        .replace("%", "")
        .replace(" ", "")
    )

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
    # Current Transaction Detail section has "February 4, 2026 Transaction"
    match = re.search(r"\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+Transaction\b", text, flags=re.IGNORECASE)
    if match:
        return normalize_date(match.group(1))

    return find_date_by_label(text, ["Capital Call Due Date", "Distribution Due Date"])


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


def find_flexible_amount(text: str, pattern_before_amount: str, absolute: bool = True) -> Optional[float]:
    """
    pattern_before_amount should be a regex ending just before the amount.
    """
    pattern = pattern_before_amount + r"\s*" + _AMOUNT_PATTERN
    match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
    if match:
        return clean_amount(match.group(1), absolute=absolute)
    return None


def find_accounting_treatment_amount(text: str, label: str) -> Optional[float]:
    """
    Extract amounts only from the Current Distribution Accounting Treatment section.

    This avoids wrong matches from narrative text like:
      "repayment of principal, $5..."
    and from individual portfolio lines.
    """
    section_match = re.search(
        r"Current\s+Distribution\s+Accounting\s+Treatment[\s\S]{0,1200}?Inception-to-Date\s+Activity",
        text,
        flags=re.IGNORECASE,
    )
    section = section_match.group(0) if section_match else text

    pattern = rf"{re.escape(label)}\s*:?:?\s*{_AMOUNT_PATTERN}"
    matches = list(re.finditer(pattern, section, flags=re.IGNORECASE))
    for match in matches:
        amount = clean_amount(match.group(1), absolute=True)
        if amount is not None:
            return amount
    return None


def detect_currency(text: str) -> str:
    if "$" in text or re.search(r"\bUSD\b", text, flags=re.IGNORECASE):
        return "USD"
    if "¥" in text or "JPY" in text.upper():
        return "JPY"
    if "€" in text or "EUR" in text.upper():
        return "EUR"
    return "unknown"


def find_company_name(text: str) -> Optional[str]:
    investor_match = re.search(r"Investor:\s*([^\n]+)", text, flags=re.IGNORECASE)
    if investor_match:
        return " ".join(investor_match.group(1).strip().split())

    match = re.search(
        r"Hamilton Lane Strategic Opportunities Fund IX-B LP\s*\n\s*([A-Za-z0-9 .,&'-]+?)\s*\n\s*Current Transaction Detail",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        return " ".join(match.group(1).strip().split())

    return None


def detect_fund_name(text: str) -> str:
    return "Hamilton Lane Strategic Opportunities Fund IX-B LP"


# ============================================================
# 2. Extraction
# ============================================================

def extract_all_fields(text: str) -> Dict[str, Any]:
    notice_date = find_first_date(text)
    transaction_date = find_transaction_date(text)
    capital_call_due_date = find_date_by_label(text, ["Capital Call Due Date"])
    distribution_due_date = find_date_by_label(text, ["Distribution Due Date"])

    capital_call_amount_header = find_amount_by_label(text, ["Capital Call Amount"], absolute=True)
    distribution_amount_header = find_amount_by_label(text, ["Distribution Amount"], absolute=True)

    transaction_total = find_amount_by_label(text, ["Transaction total"], absolute=False)

    capital_commitment = find_amount_by_label(text, ["Capital commitment"], absolute=True)
    amounts_drawn = find_amount_by_label(text, ["Amounts drawn"], absolute=True)
    recallable_amounts_distributed = find_amount_by_label(text, ["Recallable amounts distributed"], absolute=True)
    remaining_unfunded_commitment = find_amount_by_label(text, ["Remaining unfunded commitment"], absolute=True)
    cumulative_distributions = find_amount_by_label(text, ["Cumulative distributions"], absolute=True)

    # Capital call components
    # Many reports have one or more of these lines.
    capital_call_for_investments = find_amount_by_label(text, ["Capital call for investments"], absolute=True)

    capital_call_hl_so_holdings = find_flexible_amount(
        text,
        r"Capital\s+call\s+for\s+Hamilton\s+Lane\s+Strategic\s+Opportunities\s+Fund\s+IX\s+Holdings\s+LP",
        absolute=True,
    )

    capital_call_leveraged_blocker = find_flexible_amount(
        text,
        r"Capital\s+call\s+for\s+HL\s+SO\s+IX\s+Leveraged\s+Blocker\s+Inc\.",
        absolute=True,
    )

    capital_call_management_fees = find_amount_by_label(
        text,
        ["Capital call for management fees"],
        absolute=True,
    )

    capital_call_expenses = find_amount_by_label(
        text,
        ["Capital call for expenses"],
        absolute=True,
    )

    total_capital_call = find_amount_by_label(text, ["Total capital call"], absolute=True)

    # Return of unused capital is a negative contribution in Excel B.
    # Reports often print the value as "$ (26,824)".
    return_unused_capital_for_investments = find_amount_by_label(
        text,
        ["Return of unused capital for investments"],
        absolute=True,
    )

    if return_unused_capital_for_investments is None:
        return_unused_match = re.search(
            r"Return\s+of\s+unused\s+capital\s+for\s+investments\s+\$?\s*\(?\s*([\d,]+(?:\.\d+)?)\s*\)?",
            text,
            flags=re.IGNORECASE,
        )
        if return_unused_match:
            return_unused_capital_for_investments = clean_amount(
                return_unused_match.group(1),
                absolute=True,
            )

    # Distribution components
    total_distribution = find_amount_by_label(text, ["Total distribution"], absolute=True)

    # Accounting treatment section usually gives the real total distribution.
    accounting_total_distributions = find_amount_by_label(text, ["Total distributions"], absolute=True)

    # Subsequent close interest (receivable) is cash received but not recallable/reinvestable.
    subsequent_close_interest_receivable = find_flexible_amount(
        text,
        r"Subsequent\s+close\s+interest\s+\(receivable\)",
        absolute=True,
    )

    if subsequent_close_interest_receivable is None:
        interest_receivable_match = re.search(
            r"Subsequent\s+close\s+interest\s+\(receivable\)\s+\$?\s*\(?\s*([\d,]+(?:\.\d+)?)\s*\)?",
            text,
            flags=re.IGNORECASE,
        )
        if interest_receivable_match:
            subsequent_close_interest_receivable = clean_amount(
                interest_receivable_match.group(1),
                absolute=True,
            )

    # Subsequent close interest payable would be cash paid, but samples mainly have receivable.
    subsequent_close_interest_payable = find_flexible_amount(
        text,
        r"Subsequent\s+close\s+interest\s+payable",
        absolute=True,
    )

    # Accounting treatment details
    # Use only the "Current Distribution Accounting Treatment" section.
    # This is required for HAMS_030226 where Excel Return of Capital =
    # Repayment of principal 66,433.
    repayment_of_principal = find_accounting_treatment_amount(text, "Repayment of principal")
    interest_income = find_accounting_treatment_amount(text, "Interest income")
    other_investment_income = find_accounting_treatment_amount(text, "Other investment income")

    # Bank fields
    bank_name = None
    bank_match = re.search(r"Bank:\s*([^\n]+)", text, flags=re.IGNORECASE)
    if bank_match:
        bank_name = bank_match.group(1).strip()

    aba_number = None
    aba_match = re.search(r"ABA#?:\s*([0-9\-\s]+)", text, flags=re.IGNORECASE)
    if aba_match:
        aba_number = aba_match.group(1).strip()

    swift_code = None
    swift_match = re.search(r"Swift\s+Code:\s*([A-Za-z0-9]+)", text, flags=re.IGNORECASE)
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

    # Determine Excel capital contribution amount B.
    if return_unused_capital_for_investments is not None:
        # Negative B reduces cumulative capital contributions.
        capital_contribution_amount_for_excel = -abs(return_unused_capital_for_investments)
    elif total_capital_call is not None:
        capital_contribution_amount_for_excel = total_capital_call
    else:
        component_values = [
            capital_call_for_investments,
            capital_call_hl_so_holdings,
            capital_call_leveraged_blocker,
            capital_call_management_fees,
            capital_call_expenses,
        ]
        component_sum = sum(v for v in component_values if v is not None)
        if component_sum:
            capital_contribution_amount_for_excel = round(component_sum, 2)
        elif capital_call_amount_header is not None:
            capital_contribution_amount_for_excel = capital_call_amount_header
        else:
            capital_contribution_amount_for_excel = 0.0

    # Determine Excel distribution amount C and reinvestable amount D.
    #
    # IMPORTANT:
    # For true-up interest distribution reports such as HAMS_07032025 and HAMS_26062025,
    # the header "Distribution Amount" equals the transaction total, but Excel does NOT use
    # that full header amount as C. Excel separates:
    #   B = negative Return of unused capital for investments
    #   C = Subsequent close interest (receivable)
    #   D = 0
    #
    # Example HAMS_07032025:
    #   Return of unused capital for investments = (26,824)
    #   Subsequent close interest (receivable) = (244)
    #   Transaction total = (27,068)
    # Excel:
    #   B = -26,824
    #   C = 244
    #   D = 0
    if return_unused_capital_for_investments is not None:
        distribution_total_for_excel = 0.0

        # Excel logic for true-up interest distribution reports:
        #   B = negative Return of unused capital for investments
        #   C = Subsequent close interest (receivable)
        #   D = Return of unused capital for investments
        #
        # Example HAMS_07032025:
        #   B = -26,824
        #   C = 244
        #   D = 26,824
        #   F = Previous F - B + D
        distribution_amount_received_for_excel = float(subsequent_close_interest_receivable or 0.0)
        reinvestable_amount_for_excel = float(return_unused_capital_for_investments or 0.0)
    else:
        # Normal distribution / net capital call reports.
        # Use accounting treatment totals when available; otherwise total distribution.
        # Only use header distribution as a last fallback when there is no detailed section.
        distribution_total_for_excel = (
            accounting_total_distributions
            or total_distribution
            or (
                distribution_amount_header
                if (
                    distribution_amount_header is not None
                    and total_distribution is None
                    and accounting_total_distributions is None
                    and capital_contribution_amount_for_excel == 0.0
                )
                else 0.0
            )
            or 0.0
        )

        distribution_amount_received_for_excel = 0.0
        if distribution_total_for_excel:
            distribution_amount_received_for_excel += distribution_total_for_excel
        if subsequent_close_interest_receivable:
            distribution_amount_received_for_excel += subsequent_close_interest_receivable

        # If only transaction total is negative and no parsed distribution/return line,
        # use it as distribution amount fallback.
        if (
            distribution_amount_received_for_excel == 0.0
            and transaction_total is not None
            and transaction_total < 0
            and capital_contribution_amount_for_excel == 0.0
        ):
            distribution_amount_received_for_excel = abs(transaction_total)

        # For HLSO IX-B, accounting treatment says recallable. Use total distributions only,
        # not subsequent close interest.
        reinvestable_amount_for_excel = distribution_total_for_excel or 0.0

    actual_payment_amount = transaction_total
    if actual_payment_amount is None:
        if capital_call_amount_header is not None:
            actual_payment_amount = capital_call_amount_header
        elif distribution_amount_header is not None:
            actual_payment_amount = -distribution_amount_header

    return {
        "notice_date": notice_date,
        "capital_call_due_date": capital_call_due_date,
        "distribution_due_date": distribution_due_date,
        "transaction_date": transaction_date,
        "capital_call_amount_header": capital_call_amount_header,
        "distribution_amount_header": distribution_amount_header,
        "transaction_total": transaction_total,

        "capital_commitment": capital_commitment,
        "amounts_drawn": amounts_drawn,
        "recallable_amounts_distributed": recallable_amounts_distributed,
        "remaining_unfunded_commitment": remaining_unfunded_commitment,
        "cumulative_distributions": cumulative_distributions,

        "capital_call_for_investments": capital_call_for_investments,
        "capital_call_hl_so_ix_holdings": capital_call_hl_so_holdings,
        "capital_call_leveraged_blocker": capital_call_leveraged_blocker,
        "capital_call_management_fees": capital_call_management_fees,
        "capital_call_expenses": capital_call_expenses,
        "total_capital_call": total_capital_call,

        "return_unused_capital_for_investments": return_unused_capital_for_investments,
        "total_distribution": total_distribution,
        "accounting_total_distributions": accounting_total_distributions,
        "repayment_of_principal": repayment_of_principal,
        "interest_income": interest_income,
        "other_investment_income": other_investment_income,
        "subsequent_close_interest_receivable": subsequent_close_interest_receivable,
        "subsequent_close_interest_payable": subsequent_close_interest_payable,

        "capital_contribution_amount_for_excel": capital_contribution_amount_for_excel,
        "distribution_amount_received_for_excel": round(distribution_amount_received_for_excel, 2),
        "reinvestable_amount_for_excel": reinvestable_amount_for_excel,

        "actual_payment_amount": actual_payment_amount,
        "actual_cash_flow_from_transaction_total": -actual_payment_amount if actual_payment_amount is not None else None,

        "bank_name": bank_name,
        "aba_number": aba_number,
        "swift_code": swift_code,
        "account_number": account_number,
        "account_name": account_name,
    }


# ============================================================
# 3. Breakdown
# ============================================================

def build_breakdown(all_fields: Dict[str, Any]) -> Dict[str, Any]:
    capital_call_breakdown: List[Dict[str, Any]] = []
    distribution_breakdown: List[Dict[str, Any]] = []

    component_map = [
        ("investments", "Capital call for investments", all_fields.get("capital_call_for_investments")),
        ("hl_so_ix_holdings", "Capital call for Hamilton Lane Strategic Opportunities Fund IX Holdings LP", all_fields.get("capital_call_hl_so_ix_holdings")),
        ("leveraged_blocker", "Capital call for HL SO IX Leveraged Blocker Inc.", all_fields.get("capital_call_leveraged_blocker")),
        ("management_fees", "Capital call for management fees", all_fields.get("capital_call_management_fees")),
        ("expenses", "Capital call for expenses", all_fields.get("capital_call_expenses")),
        ("return_unused_capital", "Return of unused capital for investments", -abs(all_fields.get("return_unused_capital_for_investments")) if all_fields.get("return_unused_capital_for_investments") is not None else None),
    ]

    for purpose, label, amount in component_map:
        if amount is not None:
            capital_call_breakdown.append({
                "purpose": purpose,
                "label": label,
                "amount": amount,
                "excel_usage": "capital_contribution_amount_component",
            })

    if all_fields.get("accounting_total_distributions") is not None or all_fields.get("total_distribution") is not None:
        distribution_breakdown.append({
            "purpose": "recallable_distribution",
            "label": "Total distributions / Total distribution",
            "amount": all_fields.get("accounting_total_distributions") or all_fields.get("total_distribution"),
            "excel_usage": "distribution_amount_received_and_reinvestable_amount",
        })

    if all_fields.get("subsequent_close_interest_receivable") is not None:
        distribution_breakdown.append({
            "purpose": "subsequent_close_interest_receivable",
            "label": "Subsequent close interest (receivable)",
            "amount": all_fields["subsequent_close_interest_receivable"],
            "excel_usage": "distribution_amount_received_component_not_reinvestable",
        })

    if all_fields.get("subsequent_close_interest_payable") is not None:
        capital_call_breakdown.append({
            "purpose": "subsequent_close_interest_payable",
            "label": "Subsequent close interest payable",
            "amount": all_fields["subsequent_close_interest_payable"],
            "excel_usage": "actual_payment_only_not_excel_b",
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
    b = all_fields.get("capital_contribution_amount_for_excel") or 0.0
    c = all_fields.get("distribution_amount_received_for_excel") or 0.0
    d = all_fields.get("reinvestable_amount_for_excel") or 0.0

    current_transaction_cash_flow = calculate_current_transaction_cash_flow(b, c)

    remarks_parts = ["Hamilton Lane Strategic Opportunities Fund IX-B transaction notice."]

    if b > 0 and c > 0:
        remarks_parts.append("Net capital call: capital call is netted against distribution.")
    elif b > 0:
        remarks_parts.append("Capital call transaction.")
    elif b < 0:
        remarks_parts.append("Return of unused capital reduces cumulative capital contributions.")
    elif c > 0:
        remarks_parts.append("Distribution transaction.")

    if all_fields.get("subsequent_close_interest_receivable"):
        remarks_parts.append("Subsequent close interest receivable is included in distribution amount received but not reinvestable amount.")

    return {
        "subscription_agreement_effective_date": None,
        "commitment_amount": all_fields.get("capital_commitment"),
        "transaction_date": all_fields.get("transaction_date"),
        "capital_contribution_amount": b,
        "distribution_amount_received": c,
        "reinvestable_amount": d,
        "cumulative_capital_contributions": all_fields.get("amounts_drawn"),
        "remaining_commitment_formula_value": all_fields.get("remaining_unfunded_commitment"),
        "remaining_commitment": all_fields.get("remaining_unfunded_commitment"),
        "cash_flow": current_transaction_cash_flow,
        "remarks": " ".join(remarks_parts),
        "distribution_details": breakdown.get("distribution_breakdown", []),
        "distribution_not_allocated_to_reinvestment": round(c - d, 2),
        # Finance detail columns from accounting treatment / true-up sections.
        "return_of_capital": float(all_fields.get("repayment_of_principal") or 0.0),
        "gain": 0.0,
        "interest": round(
            float(all_fields.get("interest_income") or 0.0)
            + float(all_fields.get("other_investment_income") or 0.0)
            + float(all_fields.get("subsequent_close_interest_receivable") or 0.0),
            2,
        ),
        "interest_other": round(
            float(all_fields.get("interest_income") or 0.0)
            + float(all_fields.get("other_investment_income") or 0.0)
            + float(all_fields.get("subsequent_close_interest_receivable") or 0.0),
            2,
        ),
        "actual_payment_amount": all_fields.get("actual_payment_amount"),
        "actual_cash_flow_from_transaction_total": all_fields.get("actual_cash_flow_from_transaction_total"),
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
    report_cumulative_distributions = all_fields.get("cumulative_distributions") or 0.0

    cumulative_capital_contributions = report_e
    remaining_commitment = report_f
    cumulative_cash_flow = None

    calculation_sources = {
        "cumulative_capital_contributions": "from_report_amounts_drawn_no_previous_state",
        "remaining_commitment": "from_report_remaining_unfunded_commitment_no_previous_state",
        "cash_flow": "from_report_cumulative_values_no_previous_state",
        "cumulative_cash_flow": "from_report_cumulative_values_no_previous_state",
    }

    current_cash_flow = calculate_current_transaction_cash_flow(
        capital_contribution_amount=b,
        distribution_amount_received=c,
    )

    if report_e is not None:
        # General fallback when starting with a middle transaction:
        # cumulative cash flow ≈ -amounts drawn + cumulative distributions
        cumulative_cash_flow = round(-float(report_e) + float(report_cumulative_distributions), 2)
        final_cash_flow_for_excel = cumulative_cash_flow
    else:
        final_cash_flow_for_excel = current_cash_flow
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

    b = excel_fields.get("capital_contribution_amount") or 0.0
    c = excel_fields.get("distribution_amount_received") or 0.0
    current_cf = calculation_result["calculated_excel_fields"].get("current_transaction_cash_flow")

    transaction_total = all_fields.get("transaction_total")
    actual_cf = -transaction_total if transaction_total is not None else None

    capital_call_breakdown_total = round(sum(
        item["amount"] for item in breakdown.get("capital_call_breakdown", [])
        if item.get("amount") is not None and item.get("purpose") != "subsequent_close_interest_payable"
    ), 2)

    distribution_breakdown_total = round(sum(
        item["amount"] for item in breakdown.get("distribution_breakdown", [])
        if item.get("amount") is not None
    ), 2)

    report_e = all_fields.get("amounts_drawn")
    calc_e = calculation_result["calculated_excel_fields"].get("cumulative_capital_contributions")
    report_f = all_fields.get("remaining_unfunded_commitment")
    calc_f = calculation_result["calculated_excel_fields"].get("remaining_commitment")

    return {
        "missing_excel_fields": missing_excel_fields,
        "matched_excel_fields": matched_excel_fields,
        "calculation_checks": {
            "excel_b_capital_contribution_amount": b,
            "excel_c_distribution_amount_received": c,
            "excel_d_reinvestable_amount": excel_fields.get("reinvestable_amount"),
            "capital_call_breakdown_total": capital_call_breakdown_total,
            "distribution_breakdown_total": distribution_breakdown_total,
            "transaction_total_report_signed": transaction_total,
            "current_transaction_cash_flow": current_cf,
            "cash_flow_from_transaction_total": actual_cf,
            "is_current_cash_flow_matched_with_transaction_total": (
                round(current_cf, 2) == round(actual_cf, 2)
                if current_cf is not None and actual_cf is not None else None
            ),
            "report_cumulative_capital_contributions": report_e,
            "calculated_cumulative_capital_contributions": calc_e,
            "is_cumulative_capital_contributions_matched_with_report": (
                round(report_e, 2) == round(calc_e, 2)
                if report_e is not None and calc_e is not None else None
            ),
            "report_remaining_commitment": report_f,
            "calculated_remaining_commitment": calc_f,
            "is_remaining_commitment_matched_with_report": (
                round(report_f, 2) == round(calc_f, 2)
                if report_f is not None and calc_f is not None else None
            ),
            "cumulative_cash_flow": calculation_result["calculated_excel_fields"].get("cumulative_cash_flow"),
            "cash_flow_for_excel": calculation_result["calculated_excel_fields"].get("cash_flow_for_excel"),
        },
        "needs_review": True,
        "warnings": [
            "This module supports Hamilton Lane Strategic Opportunities Fund IX-B reports.",
            "Return of unused capital is mapped as a negative capital contribution amount.",
            "Subsequent close interest receivable is included in distribution_amount_received but excluded from reinvestable_amount. L column is calculated as C - D and can be negative.",
            "Current Distribution Accounting Treatment is used for return_of_capital / interest detail columns.",
            "For accurate DB cumulative flow, upload reports in transaction date order with use_db_previous_state=true.",
        ],
    }


# ============================================================
# 6. Main module function
# ============================================================

def extract_hamilton_strategic_report(
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

    document_type = "hamilton_strategic_transaction_notice"
    if final_excel_fields.get("capital_contribution_amount", 0) > 0 and final_excel_fields.get("distribution_amount_received", 0) > 0:
        document_type = "net_capital_call_notice"
    elif final_excel_fields.get("capital_contribution_amount", 0) > 0:
        document_type = "capital_call_notice"
    elif final_excel_fields.get("capital_contribution_amount", 0) < 0:
        document_type = "return_of_unused_capital_notice"
    elif final_excel_fields.get("distribution_amount_received", 0) > 0:
        document_type = "distribution_notice"

    return {
        "source_file_name": file_name,
        "extraction_status": "success",
        "module_name": "hamilton_strategic_opportunities_fund_ix_b",
        "document_type": document_type,
        "company_name": find_company_name(text),
        "fund_name": detect_fund_name(text),
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


# Compatibility alias if router uses another name later.
extract_hamilton_strategic_opportunities_report = extract_hamilton_strategic_report


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
        print("Usage: python hamilton_strategic_opportunities_module.py '<pdf_path>' [previous_state_json_or_file]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    previous_state = _load_previous_state_from_arg(sys.argv[2]) if len(sys.argv) >= 3 else None

    text = extract_pdf_text(pdf_path)
    result = extract_hamilton_strategic_report(
        text=text,
        file_name=os.path.basename(pdf_path),
        previous_state=previous_state,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
