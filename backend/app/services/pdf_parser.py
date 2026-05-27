"""
PDF Parser — extracts financial data from fund notices and financial statements.

Handles three document types:
  1. Capital Call Notices
  2. Distribution Notices
  3. Fund Financial Statements (for NAV)

The parser uses pdfplumber for text/table extraction, then regex patterns
to locate amounts, dates, and investment details.
"""
import re
import json
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  Helper patterns
# ─────────────────────────────────────────────────────────────────────────────

_AMOUNT_PATTERNS = [
    # $1,234,567.89  or  USD 1,234,567
    r'\$\s*([\d,]+(?:\.\d{1,2})?)',
    r'USD\s*([\d,]+(?:\.\d{1,2})?)',
    r'US\$\s*([\d,]+(?:\.\d{1,2})?)',
    r'([\d,]+(?:\.\d{1,2})?)\s*(?:USD|US Dollars)',
]

_DATE_PATTERNS = [
    # January 15, 2024 / Jan 15, 2024
    r'(\b(?:January|February|March|April|May|June|July|August|September|'
    r'October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
    r'\s+\d{1,2},?\s+\d{4}\b)',
    # 2024-01-15 / 2024/01/15
    r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})',
    # 15 January 2024
    r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|'
    r'October|November|December)\s+\d{4})',
    # MM/DD/YYYY
    r'(\d{1,2}/\d{1,2}/\d{4})',
]

_DATE_LABEL_PATTERNS = {
    "notice_date": [
        r'(?:Notice|Issue)\s*Date\s*:?\s*([^\n]+)',
        r'Date\s+of\s+Notice\s*:?\s*([^\n]+)',
        r'Dated\s*:?\s*([^\n]+)',
    ],
    "due_date": [
        r'(?:Due|Payment|Wire|Funding)\s+Date\s*:?\s*([^\n]+)',
        r'(?:Due|Payment)\s+by\s*:?\s*([^\n]+)',
        r'Payable\s+(?:on|by)\s*:?\s*([^\n]+)',
    ],
    "distribution_date": [
        r'[Dd]istribution\s+[Dd]ate\s*:?\s*([^\n]+)',
        r'[Pp]ayment\s+[Dd]ate\s*:?\s*([^\n]+)',
        r'[Rr]ecord\s+[Dd]ate\s*:?\s*([^\n]+)',
        r'[Dd]ate\s+of\s+[Dd]istribution\s*:?\s*([^\n]+)',
    ],
    "nav_date": [
        r'[Vv]aluation\s+[Dd]ate\s*:?\s*([^\n]+)',
        r'[Aa]s\s+of\s+([^\n\(]+)',
        r'[Qq]uarter\s+[Ee]nded?\s*:?\s*([^\n]+)',
        r'[Ff]iscal\s+[Yy]ear\s+[Ee]nded?\s*:?\s*([^\n]+)',
        r'[Pp]eriod\s+[Ee]nded?\s*:?\s*([^\n]+)',
    ],
}

_FUND_NAME_PATTERNS = [
    r'(?:Fund\s+Name|Partnership|Fund)\s*:?\s*([^\n]+)',
    r'(?:RE|TO|SUBJECT)\s*:\s*([^\n]+)',
]

_CALL_PCT_PATTERNS = [
    r'([\d.]+)\s*%\s+of\s+(?:your\s+)?(?:total\s+)?[Cc]ommitment',
    r'[Cc]apital\s+[Cc]all\s+(?:of\s+)?([\d.]+)\s*%',
    r'([\d.]+)\s*%\s+[Cc]apital\s+[Cc]all',
]

# ── Sector / Geography / Deal-type keyword maps ───────────────────────────────

_SECTOR_KEYWORDS: dict[str, list[str]] = {
    "Technology":         ["software", "saas", "cloud", "ai", "artificial intelligence",
                           "machine learning", "fintech", "cybersecurity", "data", "semiconductor",
                           "ecommerce", "marketplace", "platform", "app", "digital", "tech"],
    "Healthcare":         ["healthcare", "biotech", "pharmaceutical", "medtech", "medical device",
                           "clinical", "hospital", "diagnostics", "drug", "life science", "biopharma"],
    "Real Estate":        ["real estate", "reit", "property", "commercial", "residential",
                           "industrial property", "logistics", "warehouse", "office", "retail"],
    "Financial Services": ["financial", "insurance", "bank", "lending", "credit", "payments",
                           "asset management", "wealth", "fintech", "banking"],
    "Consumer":           ["consumer", "retail", "brand", "restaurant", "food", "beverage",
                           "e-commerce", "fashion", "lifestyle", "beauty"],
    "Industrial":         ["manufacturing", "industrial", "aerospace", "defense", "automation",
                           "engineering", "construction", "chemicals"],
    "Energy":             ["energy", "oil", "gas", "renewable", "solar", "wind", "power",
                           "utility", "clean energy", "infrastructure"],
    "Business Services":  ["business services", "outsourcing", "staffing", "logistics", "supply chain",
                           "distribution", "transportation", "consulting"],
    "Media & Entertainment": ["media", "entertainment", "gaming", "content", "streaming",
                              "publishing", "sports", "music"],
    "Education":          ["education", "edtech", "learning", "training", "school", "university"],
}

_GEOGRAPHY_KEYWORDS: dict[str, list[str]] = {
    "North America":   ["united states", "u.s.", "us ", "canada", "north america", "new york",
                        "california", "silicon valley", "texas", "chicago"],
    "Europe":          ["europe", "european", "uk", "united kingdom", "germany", "france",
                        "sweden", "netherlands", "spain", "italy", "london", "paris", "berlin",
                        "nordic", "scandinavia"],
    "Asia-Pacific":    ["asia", "asia-pacific", "apac", "australia", "singapore", "korea",
                        "india", "southeast asia", "asean", "hong kong", "taiwan"],
    "Japan":           ["japan", "japanese", "tokyo", "osaka", "日本"],
    "China":           ["china", "chinese", "prc", "mainland china", "shanghai", "beijing",
                        "shenzhen", "中国"],
    "Latin America":   ["latin america", "brazil", "mexico", "colombia", "argentina", "chile",
                        "peru", "latam"],
    "Middle East":     ["middle east", "uae", "saudi arabia", "israel", "dubai", "abu dhabi",
                        "gulf", "mena"],
    "Global":          ["global", "worldwide", "international", "multi-region"],
}

_DEAL_TYPE_KEYWORDS: dict[str, list[str]] = {
    "Buyout / LBO":      ["buyout", "lbo", "leveraged buyout", "management buyout", "mbo",
                          "acquisition", "take-private"],
    "Growth Equity":     ["growth equity", "growth capital", "growth stage", "expansion capital",
                          "series c", "series d"],
    "Venture Capital":   ["venture", "seed", "series a", "series b", "early stage", "startup",
                          "angel"],
    "Secondaries":       ["secondary", "secondaries", "lp interest", "portfolio sale"],
    "Real Estate":       ["real estate acquisition", "property acquisition", "reit", "core plus",
                          "value-add"],
    "Infrastructure":    ["infrastructure", "greenfield", "brownfield", "concession", "ppp"],
    "Private Credit":    ["private credit", "direct lending", "mezzanine", "unitranche",
                          "senior secured", "preferred equity"],
    "Follow-on":         ["follow-on", "add-on", "bolt-on", "additional investment",
                          "pro-rata", "reserve"],
    "Recapitalization":  ["recapitalization", "recap", "dividend recapitalization"],
}


def _detect_sector(text: str) -> str | None:
    lower = text.lower()
    hits: dict[str, int] = {}
    for sector, kws in _SECTOR_KEYWORDS.items():
        count = sum(1 for kw in kws if kw in lower)
        if count:
            hits[sector] = count
    return max(hits, key=lambda k: hits[k]) if hits else None


def _detect_geography(text: str) -> str | None:
    lower = text.lower()
    hits: dict[str, int] = {}
    for geo, kws in _GEOGRAPHY_KEYWORDS.items():
        count = sum(1 for kw in kws if kw in lower)
        if count:
            hits[geo] = count
    return max(hits, key=lambda k: hits[k]) if hits else None


def _detect_deal_type(text: str) -> str | None:
    lower = text.lower()
    hits: dict[str, int] = {}
    for dtype, kws in _DEAL_TYPE_KEYWORDS.items():
        count = sum(1 for kw in kws if kw in lower)
        if count:
            hits[dtype] = count
    return max(hits, key=lambda k: hits[k]) if hits else None


def _extract_keywords(text: str, max_keywords: int = 15) -> list[str]:
    """
    Extract the top meaningful keywords from the text.
    Strips common stop-words and financial boilerplate.
    """
    STOP_WORDS = {
        "the", "and", "for", "that", "this", "with", "are", "from", "have",
        "will", "your", "our", "has", "its", "any", "all", "not", "been",
        "each", "per", "may", "shall", "you", "we", "as", "of", "in", "to",
        "a", "an", "on", "at", "by", "is", "be", "do", "or", "if", "it",
        "up", "no", "so", "but", "was", "had", "did", "get", "set", "due",
        "date", "notice", "fund", "capital", "amount", "please", "hereby",
        "limited", "partnership", "investor", "management", "general",
        "partner", "pursuant", "agreement", "terms", "conditions",
    }
    words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    freq: dict[str, int] = {}
    for w in words:
        if w not in STOP_WORDS:
            freq[w] = freq.get(w, 0) + 1
    # Sort by frequency, return top N
    sorted_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [w for w, _ in sorted_words[:max_keywords]]


_INVESTMENT_TABLE_HEADER = re.compile(
    r'(?:Investment|Portfolio|Company|Project)\s+(?:Name|Description)?'
    r'\s+(?:Amount|Allocation)',
    re.IGNORECASE,
)

_NAV_PATTERNS = [
    r'(?:Total\s+)?Net\s+Asset\s+Value\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
    r'NAV\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
    r'Total\s+Net\s+Assets\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
    r"Partners'?\s+Capital\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)",
]

_DIST_TYPE_PATTERNS = {
    "Capital Return": [
        r'[Rr]eturn\s+of\s+[Cc]apital\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
        r'[Pp]rincipal\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
        r'[Rr]epayment\s+of\s+[Cc]apital\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
        r'[Rr]eturn\s+of\s+[Ii]nvestment\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
    ],
    "Income": [
        r'[Ii]ncome\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
        r'[Gg]ain\s+on\s+[Ss]ale\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
        r'[Rr]ealized\s+[Gg]ain\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
        r'[Pp]rofit\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)',
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
#  Utility functions
# ─────────────────────────────────────────────────────────────────────────────

def _parse_amount(text: str) -> Optional[Decimal]:
    """Extract the first dollar amount from a text snippet."""
    for pattern in _AMOUNT_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(1).replace(',', '')
            try:
                return Decimal(raw)
            except Exception:
                pass
    return None


def _parse_date(text: str) -> Optional[str]:
    """Try to extract and normalise a date from a text snippet."""
    for pattern in _DATE_PATTERNS:
        m = re.search(pattern, text.strip())
        if m:
            raw = m.group(1).strip().rstrip(',')
            # Try several known formats
            for fmt in [
                '%B %d %Y', '%B %d, %Y', '%b %d %Y', '%b %d, %Y',
                '%d %B %Y', '%d %b %Y',
                '%Y-%m-%d', '%Y/%m/%d',
                '%m/%d/%Y', '%m-%d-%Y',
            ]:
                try:
                    return datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
                except ValueError:
                    pass
    return None


def _find_labelled_date(text: str, label_key: str) -> Optional[str]:
    for pattern in _DATE_LABEL_PATTERNS.get(label_key, []):
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            result = _parse_date(m.group(1))
            if result:
                return result
    return None


def _extract_largest_amount(text: str) -> Optional[Decimal]:
    """Return the largest USD amount found in the text."""
    amounts = []
    for pattern in _AMOUNT_PATTERNS:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            raw = m.group(1).replace(',', '')
            try:
                amounts.append(Decimal(raw))
            except Exception:
                pass
    return max(amounts) if amounts else None


def _classify_notice(text: str) -> str:
    """Guess the notice type from its text."""
    lower = text.lower()
    if any(kw in lower for kw in ['capital call', 'drawdown notice', 'call notice',
                                   '出資払込', 'capital contribution']):
        return 'capital_call'
    if any(kw in lower for kw in ['distribution notice', 'distribution to investors',
                                   'proceeds', '分配', 'dividend notice']):
        return 'distribution'
    if any(kw in lower for kw in ['financial statement', 'net asset value', 'nav',
                                   'balance sheet', 'statement of assets']):
        return 'financial_statement'
    return 'capital_call'   # default fallback


# ─────────────────────────────────────────────────────────────────────────────
#  Investment table extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_investment_lines(text: str, tables: list) -> list[dict]:
    """
    Try to pull investment name → amount pairs from:
    1. pdfplumber tables (if any)
    2. Regex patterns in free text
    """
    investments = []

    # ── From tables ──────────────────────────────────────────────────────────
    for table in tables:
        if not table:
            continue
        header_row_idx = None
        for i, row in enumerate(table):
            row_str = ' '.join(str(c or '') for c in row)
            if re.search(r'(?:investment|company|portfolio|project|name)',
                         row_str, re.IGNORECASE):
                header_row_idx = i
                break

        if header_row_idx is not None:
            for row in table[header_row_idx + 1:]:
                if not row or all(not c for c in row):
                    continue
                row_text = [str(c or '').strip() for c in row]
                name = row_text[0]
                if not name or name.lower() in ('total', 'subtotal', ''):
                    continue
                # Look for an amount in the remaining cells
                amount = None
                for cell in row_text[1:]:
                    amount = _parse_amount(cell)
                    if amount and amount > 0:
                        break
                if name:
                    investments.append({
                        'project_name': name,
                        'amount_usd': float(amount or 0),
                        'investment_type': 'Equity',
                    })

    if investments:
        return investments

    # ── From free text (fallback) ─────────────────────────────────────────────
    # Look for lines like "  Project Alpha    $5,000,000"
    pattern = re.compile(
        r'^([A-Z][^\$\n]{2,50}?)\s+\$\s*([\d,]+(?:\.\d{2})?)',
        re.MULTILINE,
    )
    for m in pattern.finditer(text):
        name = m.group(1).strip()
        raw  = m.group(2).replace(',', '')
        if name.lower().rstrip(':') in (
                'total', 'subtotal', 'management fee', 'mgmt fee',
                'expenses', 'expense', 'net amount', 'amount due',
                'gross call amount', 'total amount due', 'net call amount',
                'amount payable', 'wire amount', 'total distribution amount',
            ):
                continue
        try:
            investments.append({
                'project_name': name,
                'amount_usd': float(Decimal(raw)),
                'investment_type': 'Equity',
            })
        except Exception:
            pass

    return investments


# ─────────────────────────────────────────────────────────────────────────────
#  Public API
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> tuple[str, list]:
    """
    Open a PDF and return (full_text, tables).
    Requires pdfplumber.
    """
    try:
        import pdfplumber
    except ImportError:
        logger.error("pdfplumber is not installed. Run: pip install pdfplumber")
        return "", []

    full_text = []
    all_tables: list = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                full_text.append(page_text)
                for table in page.extract_tables():
                    if table:
                        all_tables.append(table)
    except Exception as exc:
        logger.error(f"Failed to read PDF {file_path}: {exc}")

    return "\n".join(full_text), all_tables


def parse_capital_call(text: str, tables: list) -> dict:
    """Extract Capital Call fields from PDF text + tables."""
    result: dict = {"notice_type": "capital_call"}

    # Dates
    result["notice_date"] = _find_labelled_date(text, "notice_date")
    result["due_date"]    = _find_labelled_date(text, "due_date")

    # Call percentage
    for pattern in _CALL_PCT_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                result["call_pct"] = float(m.group(1))
            except Exception:
                pass
            break

    # Fund name (best effort)
    for pattern in _FUND_NAME_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            result["fund_name_hint"] = m.group(1).strip()
            break

    # Amounts — look for labelled fields first
    labelled = {
        "gross_call_usd": [
            r'[Gg]ross\s+[Cc]all\s+[Aa]mount\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Cc]apital\s+[Cc]ontribution\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Tt]otal\s+[Aa]mount\s+[Cc]alled\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Aa]mount\s+[Cc]alled\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Cc]all\s+[Aa]mount\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        ],
        "management_fee_usd": [
            r'[Mm]anagement\s+[Ff]ee\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Mm]gmt\.?\s+[Ff]ee\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        ],
        "expense_usd": [
            r'[Ee]xpenses?\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Oo]ther\s+[Cc]osts?\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        ],
        "distribution_usd": [
            r'[Nn]etting\s+[Dd]istribution\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Oo]ffset\s+[Dd]istribution\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Ss]imultaneous\s+[Dd]istribution\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        ],
        "net_call_usd": [
            r'[Nn]et\s+[Cc]all\s+[Aa]mount\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Aa]mount\s+[Dd]ue\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Tt]otal\s+[Aa]mount\s+[Dd]ue\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Aa]mount\s+[Pp]ayable\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Pp]lease\s+(?:wire|remit|pay)\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
            r'[Ww]ire\s+[Aa]mount\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        ],
    }

    for field, patterns in labelled.items():
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                raw = m.group(1).replace(',', '')
                try:
                    result[field] = float(Decimal(raw))
                except Exception:
                    pass
                break

    # If no gross_call found, fallback to largest amount
    if "gross_call_usd" not in result:
        largest = _extract_largest_amount(text)
        if largest:
            result["gross_call_usd"] = float(largest)

    # Investment breakdown
    investments = _extract_investment_lines(text, tables)
    if investments:
        result["investments"] = investments

    # Call number
    m = re.search(r'[Cc]all\s+[Nn]o\.?\s*(\d+)|#\s*(\d+)\s+[Cc]apital\s+[Cc]all',
                  text, re.IGNORECASE)
    if m:
        result["call_number"] = int(m.group(1) or m.group(2))

    # Intelligence extraction
    sector   = _detect_sector(text)
    geo      = _detect_geography(text)
    deal_t   = _detect_deal_type(text)
    keywords = _extract_keywords(text)
    if sector:   result["sector"]    = sector
    if geo:      result["geography"] = geo
    if deal_t:   result["deal_type"] = deal_t
    if keywords: result["keywords"]  = keywords

    return result


def parse_distribution(text: str, tables: list) -> dict:
    """Extract Distribution fields from PDF text + tables."""
    result: dict = {"notice_type": "distribution"}

    # Date
    result["distribution_date"] = (
        _find_labelled_date(text, "distribution_date")
        or _find_labelled_date(text, "notice_date")
        or _find_labelled_date(text, "due_date")
    )

    # Fund name
    for pattern in _FUND_NAME_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            result["fund_name_hint"] = m.group(1).strip()
            break

    # Total distribution amount
    total_patterns = [
        r'[Tt]otal\s+[Dd]istribution\s+[Aa]mount\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        r'[Aa]ggregate\s+[Dd]istribution\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        r'[Tt]otal\s+[Aa]mount\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        r'[Dd]istribution\s+[Aa]mount\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
        r'[Pp]roceeds\s*:?\s*\$?\s*([\d,]+(?:\.\d{2})?)',
    ]
    for pattern in total_patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(1).replace(',', '')
            try:
                result["amount_usd"] = float(Decimal(raw))
            except Exception:
                pass
            break

    if "amount_usd" not in result:
        largest = _extract_largest_amount(text)
        if largest:
            result["amount_usd"] = float(largest)

    # Breakdown by type
    type_amounts = {}
    for dist_type, patterns in _DIST_TYPE_PATTERNS.items():
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                raw = m.group(1).replace(',', '')
                try:
                    type_amounts[dist_type] = float(Decimal(raw))
                except Exception:
                    pass
                break

    if type_amounts:
        result["type_breakdown"] = type_amounts
        # Dominant type
        if type_amounts:
            result["dist_type"] = max(type_amounts, key=lambda k: type_amounts[k])

    # Recallable
    if re.search(r'recallable|recall', text, re.IGNORECASE):
        result["is_recallable"] = True
        m = re.search(
            r'[Rr]ecall\s+[Ee]xpir(?:y|ation|es?)\s*:?\s*([^\n]+)',
            text, re.IGNORECASE,
        )
        if m:
            result["recall_expiry"] = _parse_date(m.group(1))

    # Intelligence extraction
    sector   = _detect_sector(text)
    geo      = _detect_geography(text)
    keywords = _extract_keywords(text)
    if sector:   result["sector"]    = sector
    if geo:      result["geography"] = geo
    if keywords: result["keywords"]  = keywords

    return result


def parse_financial_statement(text: str, tables: list) -> dict:
    """Extract NAV data from a fund financial statement."""
    result: dict = {"notice_type": "financial_statement"}

    # NAV date
    result["nav_date"] = _find_labelled_date(text, "nav_date")

    # NAV amount
    for pattern in _NAV_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(1).replace(',', '')
            try:
                result["nav_usd"] = float(Decimal(raw))
            except Exception:
                pass
            break

    # Period
    m = re.search(
        r'(?:Quarter|Year|Period)\s+[Ee]nded?\s+([^\n,]+)',
        text, re.IGNORECASE,
    )
    if m:
        result["period"] = m.group(1).strip()

    # Fund name
    for pattern in _FUND_NAME_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            result["fund_name_hint"] = m.group(1).strip()
            break

    # Intelligence
    keywords = _extract_keywords(text, 10)
    if keywords: result["keywords"] = keywords

    return result


def parse_pdf(file_path: str, notice_type_hint: Optional[str] = None) -> dict:
    """
    Main entry point — parse a PDF and return structured extracted data.

    Returns a dict with keys:
      - notice_type: classified or provided type
      - raw_text: full extracted text
      - extracted: parsed fields (dates, amounts, etc.)
      - confidence: "high" | "medium" | "low"
    """
    text, tables = extract_text_from_pdf(file_path)

    if not text.strip():
        return {
            "notice_type": notice_type_hint or "capital_call",
            "raw_text": "",
            "extracted": {},
            "confidence": "low",
            "error": "Could not extract text from PDF",
        }

    notice_type = notice_type_hint or _classify_notice(text)

    if notice_type == "capital_call":
        extracted = parse_capital_call(text, tables)
    elif notice_type == "distribution":
        extracted = parse_distribution(text, tables)
    else:
        extracted = parse_financial_statement(text, tables)

    # Confidence heuristic
    important_fields = {
        "capital_call":        ["due_date", "gross_call_usd"],
        "distribution":        ["distribution_date", "amount_usd"],
        "financial_statement": ["nav_date", "nav_usd"],
    }
    found = sum(1 for f in important_fields.get(notice_type, []) if extracted.get(f))
    confidence = "high" if found == 2 else ("medium" if found == 1 else "low")

    return {
        "notice_type": notice_type,
        "raw_text": text,
        "extracted": extracted,
        "confidence": confidence,
    }
