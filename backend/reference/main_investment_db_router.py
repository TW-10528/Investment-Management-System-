import json
import os
import re
import uuid
from typing import Optional, Dict, Any, List

import pdfplumber

# SDG OCR imports
try:
    import fitz  # PyMuPDF
    import pytesseract
    from PIL import Image
    SDG_OCR_AVAILABLE = True
    SDG_OCR_IMPORT_ERROR = None
except Exception as e:
    fitz = None
    pytesseract = None
    Image = None
    SDG_OCR_AVAILABLE = False
    SDG_OCR_IMPORT_ERROR = str(e)

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

# ============================================================
# Database
# ============================================================

try:
    from database import (
        get_or_create_fund,
        get_latest_previous_state,
        save_investment_transaction,
        list_transactions,
        get_connection,
    )
    DATABASE_AVAILABLE = True
    DATABASE_IMPORT_ERROR = None
except Exception as e:
    DATABASE_AVAILABLE = False
    DATABASE_IMPORT_ERROR = str(e)


# ============================================================
# Fund modules
# ============================================================

try:
    from nb_realestate_module_updated import extract_nb_realestate_report
    NB_AVAILABLE = True
    NB_IMPORT_ERROR = None
except Exception as e:
    extract_nb_realestate_report = None
    NB_AVAILABLE = False
    NB_IMPORT_ERROR = str(e)


try:
    from siguler_guff_capital_call_module_v2 import extract_siguler_guff_capital_call_report
    SIGULER_AVAILABLE = True
    SIGULER_IMPORT_ERROR = None
except Exception as e:
    extract_siguler_guff_capital_call_report = None
    SIGULER_AVAILABLE = False
    SIGULER_IMPORT_ERROR = str(e)


try:
    from goldman_vintage_x_capital_contribution_module import extract_goldman_vintage_x_report
    GOLDMAN_AVAILABLE = True
    GOLDMAN_IMPORT_ERROR = None
except Exception as e:
    extract_goldman_vintage_x_report = None
    GOLDMAN_AVAILABLE = False
    GOLDMAN_IMPORT_ERROR = str(e)


try:
    from capula_grv_distribution_module import extract_capula_grv_distribution_report
    CAPULA_AVAILABLE = True
    CAPULA_IMPORT_ERROR = None
except Exception as e:
    extract_capula_grv_distribution_report = None
    CAPULA_AVAILABLE = False
    CAPULA_IMPORT_ERROR = str(e)


try:
    from hamilton_secondary_trueup_capital_call_module import extract_hamilton_secondary_trueup_report
    HAMILTON_TRUEUP_AVAILABLE = True
    HAMILTON_TRUEUP_IMPORT_ERROR = None
except Exception as e:
    extract_hamilton_secondary_trueup_report = None
    HAMILTON_TRUEUP_AVAILABLE = False
    HAMILTON_TRUEUP_IMPORT_ERROR = str(e)


try:
    from hamilton_strategic_opportunities_module import extract_hamilton_strategic_report
    HAMILTON_STRATEGIC_AVAILABLE = True
    HAMILTON_STRATEGIC_IMPORT_ERROR = None
except Exception as e:
    extract_hamilton_strategic_report = None
    HAMILTON_STRATEGIC_AVAILABLE = False
    HAMILTON_STRATEGIC_IMPORT_ERROR = str(e)


try:
    from dover_street_xi_module import extract_dover_street_xi_report
    DOVER_AVAILABLE = True
    DOVER_IMPORT_ERROR = None
except Exception as e:
    extract_dover_street_xi_report = None
    DOVER_AVAILABLE = False
    DOVER_IMPORT_ERROR = str(e)


try:
    from sdg_lps_module import extract_sdg_lps_report
    SDG_AVAILABLE = True
    SDG_IMPORT_ERROR = None
except Exception as e:
    extract_sdg_lps_report = None
    SDG_AVAILABLE = False
    SDG_IMPORT_ERROR = str(e)


# ============================================================
# FastAPI app
# ============================================================

app = FastAPI(title="Investment Report Extractor API with PostgreSQL")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ============================================================
# Utility functions
# ============================================================

def extract_pdf_text(file_path: str) -> str:
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


def is_sdg_file(file_name: str) -> bool:
    return bool(file_name and file_name.lower().startswith("sdg"))


def has_sdg_required_values(text: str) -> bool:
    """
    Decide whether normal pdfplumber text is enough for SDG.
    If these fields are missing, run Tesseract OCR.
    """
    if not text:
        return False

    has_capital_call_values = (
        "払込み頂く金額" in text
        and "現在の出資未履行金額" in text
        and ("本出資後の出資未履行金額" in text or "後の出資未履行金額" in text)
    )

    has_distribution_values = (
        ("組合財産の分配" in text or "収益分配" in text or "分配金" in text)
        and ("分配金額" in text or "金額" in text)
    )

    return has_capital_call_values or has_distribution_values


def extract_text_with_tesseract_ocr(file_path: str) -> str:
    """
    OCR fallback for scanned Japanese SDG PDFs.
    Requires:
        sudo apt install tesseract-ocr tesseract-ocr-jpn tesseract-ocr-script-jpan
        pip install pytesseract pymupdf pillow
    """
    if not SDG_OCR_AVAILABLE:
        raise RuntimeError(f"SDG OCR libraries not available: {SDG_OCR_IMPORT_ERROR}")

    doc = fitz.open(file_path)
    all_text = []

    for page_no, page in enumerate(doc, start=1):
        mat = fitz.Matrix(3, 3)
        pix = page.get_pixmap(matrix=mat, alpha=False)

        image_path = f"/tmp/sdg_ocr_page_{page_no}.png"
        pix.save(image_path)

        img = Image.open(image_path)

        page_text = pytesseract.image_to_string(
            img,
            lang="jpn+eng",
            config="--oem 1 --psm 11",
        )

        all_text.append(f"\n--- OCR PAGE {page_no} ---\n{page_text}")

    return "\n".join(all_text)


def parse_previous_state(previous_state_json: Optional[str]) -> Optional[Dict[str, Any]]:
    if not previous_state_json:
        return None

    try:
        parsed = json.loads(previous_state_json)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        return None

    return None


def detect_fund_type(text: str) -> Dict[str, str]:
    lower = text.lower()

    if (
        "nb real estate secondary opportunities" in lower
        or "nb alternatives advisers" in lower
        or "amount due from limited partner" in lower
    ):
        return {
            "fund_key": "nb_realestate_secondary_opportunities",
            "fund_name": "NB Real Estate Secondary Opportunities",
            "module_name": "nb_realestate_secondary_opportunities",
            "required_module": "NB",
        }

    if "siguler guff small buyout opportunities fund vi" in lower:
        return {
            "fund_key": "siguler_guff_small_buyout_opportunities_vi_f",
            "fund_name": "Siguler Guff Small Buyout Opportunities Fund VI (F), LP",
            "module_name": "siguler_guff_small_buyout_capital_call",
            "required_module": "SIGULER",
        }

    if "vintage x" in lower and "goldman" in lower:
        return {
            "fund_key": "goldman_sachs_vintage_x_flagship_offshore",
            "fund_name": "Vintage X (Flagship) Offshore SCSp",
            "module_name": "goldman_sachs_vintage_x_capital_contribution",
            "required_module": "GOLDMAN",
        }

    if "capula global relative value trust" in lower or "capulaoff2" in lower:
        return {
            "fund_key": "capula_global_relative_value_trust",
            "fund_name": "Capula Global Relative Value Trust",
            "module_name": "capula_global_relative_value_distribution",
            "required_module": "CAPULA",
        }

    # IMPORTANT: check Strategic before broad Hamilton Secondary
    if "hamilton lane strategic opportunities fund ix-b lp" in lower:
        return {
            "fund_key": "hamilton_lane_strategic_opportunities_ix_b",
            "fund_name": "Hamilton Lane Strategic Opportunities Fund IX-B LP",
            "module_name": "hamilton_strategic_opportunities_fund_ix_b",
            "required_module": "HAMILTON_STRATEGIC",
        }

    if "hamilton lane secondary fund vi-b lp" in lower:
        return {
            "fund_key": "hamilton_lane_secondary_fund_vi_b",
            "fund_name": "Hamilton Lane Secondary Fund VI-B LP",
            "module_name": "hamilton_secondary_fund_vi_b",
            "required_module": "HAMILTON_TRUEUP",
        }

    if "dover street xi feeder fund l.p." in lower or "dover xi feeder" in lower:
        return {
            "fund_key": "dover_street_xi_feeder_fund",
            "fund_name": "Dover Street XI Feeder Fund L.P.",
            "module_name": "dover_street_xi_feeder_fund",
            "required_module": "DOVER",
        }

    if (
        "sdgs 投資事業有限責任組合" in lower
        or "sdg_" in lower
        or "sdgs_lps" in lower
        or "sdgs 投資" in lower
    ):
        return {
            "fund_key": "sdgs_lps_jpy",
            "fund_name": "SDGs 投資事業有限責任組合",
            "module_name": "sdgs_lps_jpy",
            "required_module": "SDG",
        }

    return {
        "fund_key": "unknown_fund",
        "fund_name": "Unknown Fund",
        "module_name": "unknown_module",
        "required_module": "UNKNOWN",
    }


def module_status(required_module: str) -> Dict[str, Any]:
    mapping = {
        "NB": (NB_AVAILABLE, NB_IMPORT_ERROR),
        "SIGULER": (SIGULER_AVAILABLE, SIGULER_IMPORT_ERROR),
        "GOLDMAN": (GOLDMAN_AVAILABLE, GOLDMAN_IMPORT_ERROR),
        "CAPULA": (CAPULA_AVAILABLE, CAPULA_IMPORT_ERROR),
        "HAMILTON_TRUEUP": (HAMILTON_TRUEUP_AVAILABLE, HAMILTON_TRUEUP_IMPORT_ERROR),
        "HAMILTON_STRATEGIC": (HAMILTON_STRATEGIC_AVAILABLE, HAMILTON_STRATEGIC_IMPORT_ERROR),
        "DOVER": (DOVER_AVAILABLE, DOVER_IMPORT_ERROR),
        "SDG": (SDG_AVAILABLE, SDG_IMPORT_ERROR),
    }

    available, error = mapping.get(required_module, (False, "No matching fund module detected."))
    return {"available": available, "error": error}


def run_fund_module(
    required_module: str,
    text: str,
    file_name: str,
    previous_state: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if required_module == "NB":
        return extract_nb_realestate_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    if required_module == "SIGULER":
        return extract_siguler_guff_capital_call_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    if required_module == "GOLDMAN":
        return extract_goldman_vintage_x_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    if required_module == "CAPULA":
        return extract_capula_grv_distribution_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    if required_module == "HAMILTON_TRUEUP":
        return extract_hamilton_secondary_trueup_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    if required_module == "HAMILTON_STRATEGIC":
        return extract_hamilton_strategic_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    if required_module == "DOVER":
        return extract_dover_street_xi_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    if required_module == "SDG":
        return extract_sdg_lps_report(
            text=text,
            file_name=file_name,
            previous_state=previous_state,
        )

    return {
        "extraction_status": "error",
        "message": "No matching extraction module found.",
    }


def prepare_fund_and_previous_state(
    fund_info: Dict[str, str],
    manual_previous_state: Optional[Dict[str, Any]],
    use_db_previous_state: bool,
) -> Dict[str, Any]:
    if not DATABASE_AVAILABLE:
        return {
            "fund": None,
            "previous_state": manual_previous_state,
            "previous_state_source": "manual_or_none_database_unavailable",
            "database_error": DATABASE_IMPORT_ERROR,
        }

    fund_currency = "JPY" if fund_info.get("required_module") == "SDG" else "USD"

    fund = get_or_create_fund(
        fund_key=fund_info["fund_key"],
        fund_name=fund_info["fund_name"],
        module_name=fund_info["module_name"],
        currency=fund_currency,
        commitment_amount=None,
    )

    if manual_previous_state is not None:
        return {
            "fund": fund,
            "previous_state": manual_previous_state,
            "previous_state_source": "manual_previous_state_json",
            "database_error": None,
        }

    if use_db_previous_state:
        db_previous_state = get_latest_previous_state(fund["id"])
        return {
            "fund": fund,
            "previous_state": db_previous_state,
            "previous_state_source": "database_latest_transaction" if db_previous_state else "database_empty_first_transaction",
            "database_error": None,
        }

    return {
        "fund": fund,
        "previous_state": None,
        "previous_state_source": "not_used",
        "database_error": None,
    }


# ============================================================
# API endpoints
# ============================================================

@app.get("/")
def root():
    return {
        "message": "Investment Report Extractor API with PostgreSQL is running.",
        "upload_endpoint": "/extract-report",
        "docs": "/docs",
        "database_available": DATABASE_AVAILABLE,
        "database_error": DATABASE_IMPORT_ERROR,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "database_available": DATABASE_AVAILABLE,
        "database_error": DATABASE_IMPORT_ERROR,
        "modules": {
            "nb": {"available": NB_AVAILABLE, "error": NB_IMPORT_ERROR},
            "siguler": {"available": SIGULER_AVAILABLE, "error": SIGULER_IMPORT_ERROR},
            "goldman": {"available": GOLDMAN_AVAILABLE, "error": GOLDMAN_IMPORT_ERROR},
            "capula": {"available": CAPULA_AVAILABLE, "error": CAPULA_IMPORT_ERROR},
            "hamilton_secondary": {"available": HAMILTON_TRUEUP_AVAILABLE, "error": HAMILTON_TRUEUP_IMPORT_ERROR},
            "hamilton_strategic": {"available": HAMILTON_STRATEGIC_AVAILABLE, "error": HAMILTON_STRATEGIC_IMPORT_ERROR},
            "dover": {"available": DOVER_AVAILABLE, "error": DOVER_IMPORT_ERROR},
            "sdg": {
                "available": SDG_AVAILABLE,
                "error": SDG_IMPORT_ERROR,
                "ocr_available": SDG_OCR_AVAILABLE,
                "ocr_error": SDG_OCR_IMPORT_ERROR,
            },
        },
    }


@app.post("/extract-report")
async def extract_report(
    file: UploadFile = File(...),
    previous_state_json: Optional[str] = Form(default=None),
    use_db_previous_state: bool = Form(default=True),
    save_to_db: bool = Form(default=True),
    include_raw_text: bool = Form(default=False),
):
    if not file.filename:
        return {
            "extraction_status": "error",
            "message": "No filename provided.",
        }

    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension != ".pdf":
        return {
            "extraction_status": "error",
            "message": "Currently only PDF files are supported.",
        }

    unique_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())

    text = extract_pdf_text(file_path)

    # SDG Japanese PDFs can be scanned/image PDFs.
    # First use pdfplumber. If required SDG values are missing, run Tesseract OCR and append OCR text.
    if is_sdg_file(file.filename):
        if not has_sdg_required_values(text):
            try:
                ocr_text = extract_text_with_tesseract_ocr(file_path)
                text = (text or "") + "\n\n" + ocr_text
            except Exception as e:
                text = (text or "") + f"\n\nSDG OCR failed: {e}"

        # Add filename marker so detect_fund_type can detect SDG even when OCR labels are imperfect.
        text = f"sdg_ filename: {file.filename}\n" + (text or "")

    if not text.strip():
        return {
            "extraction_status": "error",
            "message": "No text found in PDF. This may be a scanned PDF and needs OCR.",
        }

    normalized_text = normalize_text(text)
    manual_previous_state = parse_previous_state(previous_state_json)

    fund_info = detect_fund_type(normalized_text)
    required_module = fund_info["required_module"]

    status = module_status(required_module)
    if not status["available"]:
        return {
            "extraction_status": "error",
            "message": "Required fund module is not available or fund type was not detected.",
            "detected_fund_info": fund_info,
            "module_error": status["error"],
        }

    previous_state_info = prepare_fund_and_previous_state(
        fund_info=fund_info,
        manual_previous_state=manual_previous_state,
        use_db_previous_state=use_db_previous_state,
    )

    result = run_fund_module(
        required_module=required_module,
        text=normalized_text,
        file_name=file.filename,
        previous_state=previous_state_info["previous_state"],
    )

    result["detected_fund_info"] = fund_info
    result["previous_state_source"] = previous_state_info["previous_state_source"]
    result["previous_state_used_for_calculation"] = previous_state_info["previous_state"]

    if include_raw_text:
        result["raw_text"] = normalized_text

    if save_to_db:
        if not DATABASE_AVAILABLE:
            result["database_saved"] = False
            result["database_error"] = DATABASE_IMPORT_ERROR
            return result

        try:
            fund = previous_state_info["fund"]
            saved_row = save_investment_transaction(
                fund_id=fund["id"],
                result=result,
            )
            result["database_saved"] = True
            result["database_transaction_id"] = saved_row["id"]
            result["database_fund_id"] = fund["id"]
        except Exception as e:
            result["database_saved"] = False
            result["database_error"] = str(e)
    else:
        result["database_saved"] = False
        result["database_save_skipped"] = True

    return result


@app.get("/funds")
def get_funds():
    if not DATABASE_AVAILABLE:
        return {
            "database_available": False,
            "error": DATABASE_IMPORT_ERROR,
        }

    from psycopg2.extras import RealDictCursor

    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM funds ORDER BY id")
            rows = cur.fetchall()
            return {
                "database_available": True,
                "funds": rows,
            }
    finally:
        conn.close()


@app.get("/transactions/{fund_key}")
def get_transactions(fund_key: str):
    if not DATABASE_AVAILABLE:
        return {
            "database_available": False,
            "error": DATABASE_IMPORT_ERROR,
        }

    rows = list_transactions(fund_key)

    cleaned = []
    for row in rows:
        item = {}
        for key, value in row.items():
            if hasattr(value, "isoformat"):
                item[key] = value.isoformat()
            elif value.__class__.__name__ == "Decimal":
                item[key] = float(value)
            else:
                item[key] = value
        cleaned.append(item)

    return {
        "fund_key": fund_key,
        "count": len(cleaned),
        "transactions": cleaned,
    }
