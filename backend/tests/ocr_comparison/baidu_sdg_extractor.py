"""
SDG LPS Module with Baidu OCR Integration

This is a test version of sdg_lps_module.py that uses Baidu OCR (via EasyOCR/TrOCR)
instead of Paddle OCR for text extraction from Japanese PDFs.

All extraction logic remains the same as the original module, only the OCR backend is different.

Production goal:
- Use only the uploaded report PDF text/OCR text.
- Do NOT depend on Excel.
- Currency is JPY. No FX conversion is performed.
- Supports Japanese SDG capital call and distribution notices.

Testing focus:
- Compare Baidu OCR text extraction quality with Paddle OCR
- Measure accuracy of field extraction from OCR output
- Benchmark performance differences
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

from baidu_ocr_extractor import BaiduOCRExtractor, normalize_text, clean_amount


# ============================================================
# 1. PDF utility with Baidu OCR
# ============================================================

def extract_pdf_text_pdfplumber(file_path: str) -> str:
    """Extract text using pdfplumber (built-in text extraction)."""
    if pdfplumber is None:
        raise ImportError("pdfplumber is required. Install with: pip install pdfplumber")

    text_parts: List[str] = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)


def extract_pdf_text_with_ocr(file_path: str, ocr_method: str = "easyocr") -> str:
    """
    Extract text from PDF using Baidu OCR method.

    Args:
        file_path: Path to PDF file
        ocr_method: OCR method ('easyocr', 'trocr', 'paddle')

    Returns:
        Extracted text
    """
    try:
        extractor = BaiduOCRExtractor(method=ocr_method)
        return extractor.extract_text_from_pdf(file_path)
    except Exception as e:
        print(f"OCR extraction failed: {e}")
        return ""


def extract_pdf_text_hybrid(file_path: str, ocr_method: str = "easyocr") -> Dict[str, Any]:
    """
    Extract text using both pdfplumber and OCR, then merge results.

    This approach provides both extraction methods for comparison:
    - pdfplumber: Fast text extraction for PDFs with embedded text
    - Baidu OCR: Handles scanned documents

    Returns:
        Dictionary with both extraction results and metadata
    """
    pdfplumber_text = ""
    ocr_text = ""

    # Try pdfplumber first
    try:
        pdfplumber_text = extract_pdf_text_pdfplumber(file_path)
    except Exception as e:
        print(f"pdfplumber extraction failed: {e}")

    # Try Baidu OCR
    try:
        ocr_text = extract_pdf_text_with_ocr(file_path, ocr_method=ocr_method)
    except Exception as e:
        print(f"Baidu OCR extraction failed: {e}")

    # Use pdfplumber if strong (>300 chars), otherwise fall back to OCR
    if len(pdfplumber_text) > 300:
        primary_text = pdfplumber_text
        extraction_method = "pdfplumber"
    elif len(ocr_text) > 300:
        primary_text = ocr_text
        extraction_method = ocr_method
    else:
        primary_text = pdfplumber_text + "\n" + ocr_text
        extraction_method = "hybrid_weak"

    return {
        "primary_text": primary_text,
        "extraction_method": extraction_method,
        "pdfplumber_text": pdfplumber_text,
        "pdfplumber_length": len(pdfplumber_text),
        "ocr_text": ocr_text,
        "ocr_length": len(ocr_text),
    }


# ============================================================
# 2. Flexible Japanese field extraction (from original)
# ============================================================

def find_amount_after_label(text: str, label_patterns: List[str], window: int = 260) -> Optional[float]:
    """
    Finds a JPY amount after flexible label patterns.
    Works with OCR line breaks.
    """
    for label in label_patterns:
        pattern = label + rf"[\s\S]{{0,{window}}}?([0-9][0-9,\.]*)\s*円"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return clean_amount(match.group(1))
    return None


def find_date_after_label(text: str, label_patterns: List[str], window: int = 120) -> Optional[str]:
    """Find Japanese date after label."""
    for label in label_patterns:
        pattern = label + rf"[\s\S]{{0,{window}}}?(\d{{4}}\s*年\s*\d{{1,2}}\s*月\s*\d{{1,2}}\s*日)"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return normalize_japanese_date(match.group(1))
    return None


def find_notice_date(text: str) -> Optional[str]:
    """Extract notice date from text."""
    match = re.search(r"(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)", text)
    if match:
        return normalize_japanese_date(match.group(1))
    return None


def normalize_japanese_date(value: Optional[str]) -> Optional[str]:
    """Normalize Japanese date format."""
    if not value:
        return None

    value = value.strip()
    value = value.replace(" ", "").replace("　", "")
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
    Extract date from filename.
    Supports: SDG_290524.pdf -> 2024-05-29
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


def detect_document_type(text: str) -> str:
    """Detect if document is capital call or distribution notice."""
    if "組合財産の分配" in text or "収益分配" in text or "分配金" in text:
        return "distribution_notice"
    if "振込送金のご請求" in text or "払込み頂く金額" in text or "払込み期限" in text:
        return "capital_call_notice"
    return "unknown_sdg_notice"


def extract_distribution_amount(text: str) -> Optional[float]:
    """Extract distribution amount from text."""
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

    match = re.search(r"分配[\s\S]{0,300}?金額[\s\S]{0,80}?([0-9][0-9,\.]*)\s*円", text)
    if match:
        return clean_amount(match.group(1))

    return None


def extract_distribution_date(text: str, file_name: str = "") -> Optional[str]:
    """Extract distribution payment date."""
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

    return parse_filename_date(file_name)


# ============================================================
# 3. Core extraction
# ============================================================

def extract_all_fields(text: str, file_name: str = "") -> Dict[str, Any]:
    """Extract all fields from SDG notice text."""
    text = normalize_text(text)
    document_type = detect_document_type(text)

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

    # OCR fallback for current unfunded amount
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

    remaining_after_payment = find_amount_after_label(
        text,
        [
            r"本出資後の出資未履行金額",
            r"後の出資未履行金額",
            r"本\s*出\s*資\s*後\s*の\s*出\s*資\s*未\s*履\s*行\s*金\s*額",
            r"後\s*の\s*出\s*資\s*未\s*履\s*行\s*金\s*額",
        ],
        window=260,
    )

    distribution_amount = extract_distribution_amount(text)

    notice_date = find_notice_date(text)

    if document_type == "distribution_notice":
        transaction_date = filename_date or extract_distribution_date(text, file_name=file_name)
        capital_contribution_amount = 0.0
        distribution_amount_received = distribution_amount or 0.0
        reinvestable_amount = 0.0
        remarks = "組合財産の分配（収益分配）."
    elif document_type == "capital_call_notice":
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
# 4. Excel fields mapping and calculation
# ============================================================

def amount_or_zero(value: Optional[float]) -> float:
    """Return value or 0.0."""
    return float(value) if value is not None else 0.0


def calculate_current_transaction_cash_flow(
    capital_contribution_amount: float,
    distribution_amount_received: float,
) -> float:
    """Calculate cash flow for current transaction."""
    return round(
        -float(capital_contribution_amount or 0.0)
        + float(distribution_amount_received or 0.0),
        2,
    )


def map_to_excel_fields(all_fields: Dict[str, Any]) -> Dict[str, Any]:
    """Map extracted fields to Excel column format."""
    b = all_fields.get("capital_contribution_amount_for_excel") or 0.0
    c = all_fields.get("distribution_amount_received_for_excel") or 0.0
    d = all_fields.get("reinvestable_amount_for_excel") or 0.0

    current_transaction_cash_flow = calculate_current_transaction_cash_flow(b, c)

    return {
        "subscription_agreement_effective_date": None,
        "commitment_amount": None,
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
        "distribution_not_allocated_to_reinvestment": round(max(c - d, 0.0), 2),

        "return_of_capital": all_fields.get("return_of_capital", 0.0),
        "gain": all_fields.get("gain", 0.0),
        "interest": all_fields.get("interest_other", 0.0),
        "interest_other": all_fields.get("interest_other", 0.0),

        "current_unfunded_commitment": all_fields.get("current_unfunded_commitment"),
        "remaining_after_payment": all_fields.get("remaining_after_payment"),
    }


# ============================================================
# 5. Validation
# ============================================================

def build_validation(
    excel_fields: Dict[str, Any],
    all_fields: Dict[str, Any],
) -> Dict[str, Any]:
    """Validate extracted fields."""
    b = excel_fields.get("capital_contribution_amount") or 0.0
    c = excel_fields.get("distribution_amount_received") or 0.0

    missing: List[str] = []
    if not excel_fields.get("transaction_date"):
        missing.append("transaction_date")
    if all_fields.get("is_capital_call") and not b:
        missing.append("capital_contribution_amount")
    if all_fields.get("is_distribution") and not c:
        missing.append("distribution_amount_received")
    if all_fields.get("is_capital_call") and all_fields.get("current_unfunded_commitment") is None:
        missing.append("current_unfunded_commitment")
    if (
        all_fields.get("is_capital_call")
        and all_fields.get("remaining_after_payment") is None
        and all_fields.get("current_unfunded_commitment") is None
    ):
        missing.append("remaining_after_payment")

    return {
        "missing_fields": missing,
        "needs_review": bool(missing),
        "warnings": [
            "Currency is JPY. No FX conversion is performed.",
            "This test module uses Baidu OCR (EasyOCR/TrOCR) for comparison with Paddle OCR.",
            "For accurate results, upload SDG reports in transaction date order.",
        ],
    }


# ============================================================
# 6. Main extraction function
# ============================================================

def extract_sdg_notice_with_baidu_ocr(
    pdf_path: str,
    ocr_method: str = "easyocr",
    use_hybrid: bool = True,
) -> Dict[str, Any]:
    """
    Extract SDG notice using Baidu OCR.

    Args:
        pdf_path: Path to PDF file
        ocr_method: OCR method ('easyocr', 'trocr', 'paddle')
        use_hybrid: Use hybrid extraction (pdfplumber + OCR)

    Returns:
        Extraction result with all fields and validation
    """
    file_name = os.path.basename(pdf_path)

    # Extract text
    if use_hybrid:
        extraction_result = extract_pdf_text_hybrid(pdf_path, ocr_method=ocr_method)
        text = extraction_result["primary_text"]
        extraction_info = {
            "extraction_method": extraction_result["extraction_method"],
            "pdfplumber_length": extraction_result["pdfplumber_length"],
            "ocr_length": extraction_result["ocr_length"],
        }
    else:
        text = extract_pdf_text_with_ocr(pdf_path, ocr_method=ocr_method)
        extraction_info = {
            "extraction_method": ocr_method,
            "text_length": len(text),
        }

    # Extract all fields
    all_fields = extract_all_fields(text, file_name=file_name)
    excel_fields = map_to_excel_fields(all_fields)
    validation = build_validation(excel_fields, all_fields)

    return {
        "source_file_name": file_name,
        "extraction_status": "success",
        "module_name": "sdg_lps_baidu_ocr_test",
        "ocr_method": ocr_method,
        "extraction_info": extraction_info,
        "document_type": all_fields.get("document_type"),
        "fund_name": all_fields.get("fund_name"),
        "company_name": all_fields.get("company_name"),
        "currency": "JPY",
        "extracted_fields": all_fields,
        "excel_fields": excel_fields,
        "validation": validation,
        "extracted_text_preview": text[:500] + "..." if len(text) > 500 else text,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="SDG LPS Extractor with Baidu OCR"
    )
    parser.add_argument("pdf_path", help="Path to SDG PDF")
    parser.add_argument(
        "--method",
        default="easyocr",
        choices=["easyocr", "trocr", "paddle"],
        help="OCR method to use",
    )
    parser.add_argument(
        "--no-hybrid",
        action="store_true",
        help="Use OCR only (not hybrid with pdfplumber)",
    )

    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(f"Error: PDF not found: {args.pdf_path}")
        sys.exit(1)

    print(f"Extracting SDG notice from: {args.pdf_path}")
    print(f"OCR method: {args.method}")
    print("=" * 80)

    result = extract_sdg_notice_with_baidu_ocr(
        args.pdf_path,
        ocr_method=args.method,
        use_hybrid=not args.no_hybrid,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
