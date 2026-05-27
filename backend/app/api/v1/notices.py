"""
Notice Upload API — upload Capital Call / Distribution / Financial Statement PDFs,
auto-extract data, admin reviews and approves → auto-creates CF records.
"""
import json
import os
import uuid
import shutil
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.models.notice import NoticeUpload, NoticeType, NoticeStatus
from app.models.investment_target import InvestmentTarget
from app.models.nav_record import NavRecord
from app.models.fund import Fund
from app.models.capital_call import CapitalCall, CallStatus
from app.models.distribution import Distribution, DistributionType
from app.models.user import UserRole
from app.services.pdf_parser import parse_pdf

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf"}
MAX_FILE_SIZE      = 20 * 1024 * 1024  # 20 MB


def _require_edit_role(current_user) -> None:
    """Allow edit for admin, finance_manager, finance_staff. Block board_member and user."""
    edit_roles = {UserRole.ADMIN, UserRole.FINANCE_MANAGER, UserRole.FINANCE_STAFF}
    if current_user.role not in edit_roles:
        raise HTTPException(403, "Your role does not have edit access.")


def _require_admin(current_user) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Admin access required.")


def _notice_to_dict(n: NoticeUpload, db: Session) -> dict:
    extracted = {}
    if n.extracted_data:
        try:
            extracted = json.loads(n.extracted_data)
        except Exception:
            pass
    fund = db.query(Fund).filter(Fund.id == n.fund_id).first() if n.fund_id else None
    return {
        "id"            : str(n.id),
        "fund_id"       : str(n.fund_id) if n.fund_id else None,
        "fund_name"     : fund.fund_name if fund else None,
        "notice_type"   : n.notice_type,
        "status"        : n.status,
        "file_name"     : n.file_name,
        "extracted_data": extracted,
        "admin_notes"   : n.admin_notes,
        "reviewed_at"   : str(n.reviewed_at) if n.reviewed_at else None,
        "created_at"    : str(n.created_at)  if n.created_at  else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_notices(
    notice_type : Optional[str] = None,
    status      : Optional[str] = None,
    fund_id     : Optional[str] = None,
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    """List all uploaded notices."""
    q = db.query(NoticeUpload).order_by(NoticeUpload.created_at.desc())
    if notice_type:
        q = q.filter(NoticeUpload.notice_type == notice_type)
    if status:
        q = q.filter(NoticeUpload.status == status)
    if fund_id:
        q = q.filter(NoticeUpload.fund_id == uuid.UUID(fund_id))
    return [_notice_to_dict(n, db) for n in q.all()]


@router.get("/pending-count")
def pending_notice_count(
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    count = db.query(NoticeUpload).filter(
        NoticeUpload.status == NoticeStatus.PENDING
    ).count()
    return {"count": count}


@router.get("/{notice_id}")
def get_notice(
    notice_id   : str,
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    n = db.query(NoticeUpload).filter(NoticeUpload.id == uuid.UUID(notice_id)).first()
    if not n:
        raise HTTPException(404, "Notice not found.")
    return _notice_to_dict(n, db)


@router.post("/upload")
async def upload_notice(
    file        : UploadFile = File(...),
    notice_type : str        = Form(...),
    fund_id     : Optional[str] = Form(None),
    db          : Session    = Depends(get_db),
    current_user             = Depends(get_current_user),
):
    """
    Upload a PDF notice.  The file is parsed immediately; the extracted data
    is stored for admin review before any CF records are created.
    """
    _require_edit_role(current_user)

    # Validate extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted.")

    # Validate notice type
    valid_types = {t.value for t in NoticeType}
    if notice_type not in valid_types:
        raise HTTPException(400, f"notice_type must be one of {valid_types}")

    # Validate fund if provided
    fund = None
    if fund_id:
        fund = db.query(Fund).filter(Fund.id == uuid.UUID(fund_id)).first()
        if not fund:
            raise HTTPException(404, "Fund not found.")

    # Save file
    upload_dir = os.path.join(
        settings.UPLOAD_DIR,
        str(datetime.utcnow().strftime("%Y%m")),
    )
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(upload_dir, safe_name)

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 20 MB limit.")
    with open(file_path, "wb") as f:
        f.write(contents)

    # Parse PDF
    parse_result = parse_pdf(file_path, notice_type_hint=notice_type)
    extracted    = parse_result.get("extracted", {})
    raw_text     = parse_result.get("raw_text", "")
    confidence   = parse_result.get("confidence", "low")

    # Attach confidence to extracted data
    extracted["_confidence"] = confidence

    # Create notice record
    notice = NoticeUpload(
        fund_id        = uuid.UUID(fund_id) if fund_id else None,
        notice_type    = notice_type,
        status         = NoticeStatus.PENDING,
        file_name      = file.filename,
        file_path      = file_path,
        raw_text       = raw_text[:50000],          # cap storage
        extracted_data = json.dumps(extracted),
        uploaded_by    = current_user.id,
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)

    return {
        "message"   : "PDF uploaded and parsed. Awaiting admin approval.",
        "notice_id" : str(notice.id),
        "confidence": confidence,
        "extracted" : extracted,
    }


@router.post("/{notice_id}/approve")
def approve_notice(
    notice_id   : str,
    fund_id     : Optional[str] = None,    # allow reassigning fund during approval
    admin_notes : Optional[str] = None,
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    """
    Admin approves a notice → automatically creates the corresponding CF record(s).
    """
    _require_admin(current_user)

    n = db.query(NoticeUpload).filter(NoticeUpload.id == uuid.UUID(notice_id)).first()
    if not n:
        raise HTTPException(404, "Notice not found.")
    if n.status != NoticeStatus.PENDING:
        raise HTTPException(400, f"Notice is already {n.status}.")

    # Optionally reassign fund
    if fund_id:
        fund = db.query(Fund).filter(Fund.id == uuid.UUID(fund_id)).first()
        if not fund:
            raise HTTPException(404, "Fund not found.")
        n.fund_id = uuid.UUID(fund_id)

    if not n.fund_id:
        raise HTTPException(400, "A fund must be selected before approving.")

    extracted: dict = {}
    if n.extracted_data:
        try:
            extracted = json.loads(n.extracted_data)
        except Exception:
            pass

    created = {}

    # ── Capital Call ──────────────────────────────────────────────────────────
    if n.notice_type == NoticeType.CAPITAL_CALL:
        from app.models.fx_rate import FxRate
        latest_fx = db.query(FxRate).order_by(FxRate.rate_date.desc()).first()
        fx_val    = Decimal(str(latest_fx.usd_jpy)) if latest_fx else Decimal("150")

        gross    = Decimal(str(extracted.get("gross_call_usd", 0) or 0))
        dist_off = Decimal(str(extracted.get("distribution_usd", 0) or 0))
        net      = Decimal(str(extracted.get("net_call_usd", 0) or 0))
        if not net:
            net = gross - dist_off

        notice_date = extracted.get("notice_date")
        due_date    = extracted.get("due_date")
        if not notice_date:
            notice_date = str(datetime.utcnow().date())
        if not due_date:
            due_date = notice_date

        from datetime import date as ddate
        def _to_date(s):
            try:
                return ddate.fromisoformat(s)
            except Exception:
                return ddate.today()

        cc = CapitalCall(
            fund_id              = n.fund_id,
            notice_date          = _to_date(notice_date),
            due_date             = _to_date(due_date),
            call_number          = extracted.get("call_number"),
            call_pct             = Decimal(str(extracted.get("call_pct", 0) or 0)),
            gross_call_usd       = gross,
            distribution_usd     = dist_off,
            net_call_usd         = net,
            management_fee_usd   = Decimal(str(extracted.get("management_fee_usd", 0) or 0)),
            expense_usd          = Decimal(str(extracted.get("expense_usd", 0) or 0)),
            net_call_jpy         = int(net * fx_val),
            status               = CallStatus.PENDING,
        )
        db.add(cc)
        db.flush()  # get cc.id

        # Investment targets
        sector    = extracted.get("sector")
        geography = extracted.get("geography")
        deal_type = extracted.get("deal_type")
        keywords  = extracted.get("keywords", [])
        kw_str    = ", ".join(keywords[:10]) if keywords else None

        for inv in extracted.get("investments", []):
            it = InvestmentTarget(
                notice_id       = n.id,
                fund_id         = n.fund_id,
                capital_call_id = cc.id,
                project_name    = inv.get("project_name", "Unknown"),
                amount_usd      = Decimal(str(inv.get("amount_usd", 0) or 0)),
                investment_type = inv.get("investment_type") or deal_type or "Equity",
                sector          = inv.get("sector") or sector,
                geography       = inv.get("geography") or geography,
                deal_type       = deal_type,
                keywords        = kw_str,
                investment_date = _to_date(notice_date),
            )
            db.add(it)

        created["capital_call_id"] = str(cc.id)

    # ── Distribution ──────────────────────────────────────────────────────────
    elif n.notice_type == NoticeType.DISTRIBUTION:
        from app.models.fx_rate import FxRate
        latest_fx = db.query(FxRate).order_by(FxRate.rate_date.desc()).first()
        fx_val    = Decimal(str(latest_fx.usd_jpy)) if latest_fx else Decimal("150")

        amount       = Decimal(str(extracted.get("amount_usd", 0) or 0))
        dist_date_s  = extracted.get("distribution_date")
        dist_type_s  = extracted.get("dist_type", "Capital Return")

        from datetime import date as ddate
        def _to_date(s):
            try:
                return ddate.fromisoformat(s)
            except Exception:
                return ddate.today()

        # Map string to enum
        dist_type_map = {
            "Capital Return"     : DistributionType.CAPITAL_RETURN,
            "Income"             : DistributionType.INCOME,
            "Recallable"         : DistributionType.RECALLABLE,
            "Deemed Distribution": DistributionType.DEEMED,
        }
        dist_type = dist_type_map.get(dist_type_s, DistributionType.CAPITAL_RETURN)

        d = Distribution(
            fund_id           = n.fund_id,
            distribution_date = _to_date(dist_date_s) if dist_date_s else ddate.today(),
            dist_type         = dist_type,
            amount_usd        = amount,
            fx_rate           = fx_val,
            amount_jpy        = int(amount * fx_val),
            is_recallable     = extracted.get("is_recallable", False),
        )
        db.add(d)
        created["distribution_id"] = "pending flush"

    # ── Financial Statement (NAV) ─────────────────────────────────────────────
    elif n.notice_type == NoticeType.FINANCIAL_STATEMENT:
        from app.models.fx_rate import FxRate
        latest_fx = db.query(FxRate).order_by(FxRate.rate_date.desc()).first()
        fx_val    = Decimal(str(latest_fx.usd_jpy)) if latest_fx else Decimal("150")

        nav_usd  = Decimal(str(extracted.get("nav_usd", 0) or 0))
        nav_date = extracted.get("nav_date")

        from datetime import date as ddate
        nav = NavRecord(
            fund_id   = n.fund_id,
            notice_id = n.id,
            nav_date  = ddate.fromisoformat(nav_date) if nav_date else ddate.today(),
            nav_usd   = nav_usd,
            nav_jpy   = int(nav_usd * fx_val),
            fx_rate   = fx_val,
            period    = extracted.get("period"),
        )
        db.add(nav)
        created["nav_record"] = "created"

    # Mark approved
    n.status      = NoticeStatus.APPROVED
    n.reviewed_by = current_user.id
    n.reviewed_at = datetime.utcnow()
    if admin_notes:
        n.admin_notes = admin_notes

    db.commit()

    return {
        "message": "Notice approved and records created.",
        "notice_id": str(n.id),
        "created": created,
    }


@router.post("/{notice_id}/reject")
def reject_notice(
    notice_id   : str,
    admin_notes : Optional[str] = None,
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    """Admin rejects a notice — no CF records are created."""
    _require_admin(current_user)

    n = db.query(NoticeUpload).filter(NoticeUpload.id == uuid.UUID(notice_id)).first()
    if not n:
        raise HTTPException(404, "Notice not found.")
    if n.status != NoticeStatus.PENDING:
        raise HTTPException(400, f"Notice is already {n.status}.")

    n.status      = NoticeStatus.REJECTED
    n.reviewed_by = current_user.id
    n.reviewed_at = datetime.utcnow()
    if admin_notes:
        n.admin_notes = admin_notes
    db.commit()

    return {"message": "Notice rejected.", "notice_id": str(n.id)}


@router.put("/{notice_id}/extracted")
def update_extracted_data(
    notice_id   : str,
    body        : dict,
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    """
    Allow admin/manager to correct the auto-extracted data before approving.
    Send only the fields you want to change.
    """
    _require_edit_role(current_user)

    n = db.query(NoticeUpload).filter(NoticeUpload.id == uuid.UUID(notice_id)).first()
    if not n:
        raise HTTPException(404, "Notice not found.")
    if n.status != NoticeStatus.PENDING:
        raise HTTPException(400, "Can only edit pending notices.")

    existing: dict = {}
    if n.extracted_data:
        try:
            existing = json.loads(n.extracted_data)
        except Exception:
            pass

    existing.update(body)
    n.extracted_data = json.dumps(existing)
    db.commit()

    return {"message": "Extracted data updated.", "extracted": existing}


# ── Investment targets ─────────────────────────────────────────────────────────

@router.get("/investments/all")
def all_investments(
    fund_id     : Optional[str] = None,
    sector      : Optional[str] = None,
    geography   : Optional[str] = None,
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    """Return all investment targets with optional filters (for Investments page)."""
    q = db.query(InvestmentTarget).order_by(InvestmentTarget.investment_date.desc(), InvestmentTarget.created_at.desc())
    if fund_id:   q = q.filter(InvestmentTarget.fund_id == uuid.UUID(fund_id))
    if sector:    q = q.filter(InvestmentTarget.sector == sector)
    if geography: q = q.filter(InvestmentTarget.geography == geography)
    targets = q.all()
    result = []
    fund_cache: dict = {}
    for t in targets:
        fid = str(t.fund_id)
        if fid not in fund_cache:
            f = db.query(Fund).filter(Fund.id == t.fund_id).first()
            fund_cache[fid] = f.fund_name if f else ""
        result.append({
            "id"             : str(t.id),
            "fund_id"        : fid,
            "fund_name"      : fund_cache[fid],
            "project_name"   : t.project_name,
            "actual_name"    : t.actual_name,
            "investment_date": str(t.investment_date) if t.investment_date else None,
            "amount_usd"     : float(t.amount_usd or 0),
            "investment_type": t.investment_type,
            "sector"         : t.sector,
            "geography"      : t.geography,
            "deal_type"      : t.deal_type,
            "keywords"       : t.keywords,
        })
    return result


@router.get("/investments/recent")
def recent_investments(
    limit       : int = 10,
    fund_id     : Optional[str] = None,
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    """Return recent investment targets across all funds (for dashboard)."""
    q = db.query(InvestmentTarget).order_by(InvestmentTarget.created_at.desc())
    if fund_id:
        q = q.filter(InvestmentTarget.fund_id == uuid.UUID(fund_id))
    targets = q.limit(limit).all()
    result = []
    for t in targets:
        fund = db.query(Fund).filter(Fund.id == t.fund_id).first()
        result.append({
            "id"             : str(t.id),
            "fund_id"        : str(t.fund_id),
            "fund_name"      : fund.fund_name if fund else None,
            "project_name"   : t.project_name,
            "actual_name"    : t.actual_name,
            "investment_date": str(t.investment_date) if t.investment_date else None,
            "amount_usd"     : float(t.amount_usd or 0),
            "investment_type": t.investment_type,
            "sector"         : t.sector,
            "geography"      : t.geography,
            "deal_type"      : t.deal_type,
            "keywords"       : t.keywords,
        })
    return result


# ── NAV records ───────────────────────────────────────────────────────────────

@router.get("/nav/latest")
def latest_nav_by_fund(
    db          : Session = Depends(get_db),
    current_user            = Depends(get_current_user),
):
    """Return the most recent NAV record for each active fund."""
    funds = db.query(Fund).filter(Fund.is_active == True).all()
    result = []
    for fund in funds:
        nav = (
            db.query(NavRecord)
            .filter(NavRecord.fund_id == fund.id)
            .order_by(NavRecord.nav_date.desc())
            .first()
        )
        if nav:
            result.append({
                "fund_id"  : str(fund.id),
                "fund_name": fund.fund_name,
                "nav_date" : str(nav.nav_date),
                "nav_usd"  : float(nav.nav_usd or 0),
                "nav_jpy"  : float(nav.nav_jpy or 0),
                "period"   : nav.period,
            })
    return result
