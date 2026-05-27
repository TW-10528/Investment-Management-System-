from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.capital_call import CapitalCall, CallLineItem, CallStatus
from app.models.fund import Fund
from app.models.fx_rate import FxRate
from app.services.audit_service import log_action
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import uuid

router = APIRouter()

class CapitalCallCreate(BaseModel):
    fund_id              : str
    notice_date          : date
    due_date             : date
    execution_date       : Optional[date]    = None
    call_number          : Optional[int]     = None
    call_pct             : Optional[Decimal] = Decimal(0)
    gross_call_usd       : Decimal           = Decimal(0)
    distribution_usd     : Decimal           = Decimal(0)
    reinvestable_usd     : Decimal           = Decimal(0)
    net_call_usd         : Optional[Decimal] = None
    fx_rate              : Optional[Decimal] = None
    investment_amount_usd: Optional[Decimal] = Decimal(0)
    management_fee_usd   : Optional[Decimal] = Decimal(0)
    expense_usd          : Optional[Decimal] = Decimal(0)
    wire_reference       : Optional[str]     = None
    wire_fee_jpy         : Optional[Decimal] = Decimal(0)
    is_recallable        : bool              = False
    notes                : Optional[str]     = None
    # Allow historical/initial entry to skip the pending→approved→paid workflow
    initial_status       : Optional[str]     = None   # "paid" for historical calls

def _call_to_dict(c):
    return {
        "id": str(c.id), "fund_id": str(c.fund_id),
        "notice_date": str(c.notice_date), "due_date": str(c.due_date),
        "execution_date": str(c.execution_date) if c.execution_date else None,
        "call_number": c.call_number, "call_pct": float(c.call_pct) if c.call_pct else None,
        "gross_call_usd": float(c.gross_call_usd or 0),
        "distribution_usd": float(c.distribution_usd or 0),
        "reinvestable_usd": float(c.reinvestable_usd or 0),
        "net_call_usd": float(c.net_call_usd or 0),
        "fx_rate": float(c.fx_rate) if c.fx_rate else None,
        "net_call_jpy": float(c.net_call_jpy or 0),
        "investment_amount_usd": float(c.investment_amount_usd or 0),
        "management_fee_usd": float(c.management_fee_usd or 0),
        "expense_usd": float(c.expense_usd or 0),
        "status": c.status, "wire_reference": c.wire_reference,
        "wire_fee_jpy": float(c.wire_fee_jpy or 0),
        "is_recallable": c.is_recallable, "notes": c.notes,
        "paid_at": str(c.paid_at) if c.paid_at else None,
    }

@router.get("/")
def list_calls(fund_id: Optional[str] = None, status: Optional[str] = None,
               db: Session = Depends(get_db)):
    q = db.query(CapitalCall)
    if fund_id:
        q = q.filter(CapitalCall.fund_id == uuid.UUID(fund_id))
    if status:
        q = q.filter(CapitalCall.status == status)
    calls = q.order_by(CapitalCall.due_date.desc()).all()
    result = []
    for c in calls:
        d = _call_to_dict(c)
        fund = db.query(Fund).filter(Fund.id == c.fund_id).first()
        d["fund_name"] = fund.fund_name if fund else ""
        result.append(d)
    return result

@router.post("/")
def create_call(call: CapitalCallCreate, db: Session = Depends(get_db),
                user = Depends(get_current_user)):
    fund = db.query(Fund).filter(Fund.id == uuid.UUID(call.fund_id)).first()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    net_usd = call.net_call_usd or (call.gross_call_usd - call.distribution_usd)
    fx_rate = call.fx_rate
    if not fx_rate:
        latest_fx = db.query(FxRate).order_by(FxRate.rate_date.desc()).first()
        fx_rate = latest_fx.usd_jpy if latest_fx else Decimal("150")
    net_jpy = int(net_usd * fx_rate)
    resolved_exec_date = (
        call.execution_date
        or (call.due_date if call.initial_status == "paid" else None)
    )
    db_call = CapitalCall(
        fund_id=uuid.UUID(call.fund_id), notice_date=call.notice_date,
        due_date=call.due_date, execution_date=resolved_exec_date,
        call_number=call.call_number, call_pct=call.call_pct,
        gross_call_usd=call.gross_call_usd, distribution_usd=call.distribution_usd,
        reinvestable_usd=call.reinvestable_usd, net_call_usd=net_usd,
        fx_rate=fx_rate, net_call_jpy=net_jpy,
        investment_amount_usd=call.investment_amount_usd,
        management_fee_usd=call.management_fee_usd, expense_usd=call.expense_usd,
        wire_reference=call.wire_reference, wire_fee_jpy=call.wire_fee_jpy,
        is_recallable=call.is_recallable, notes=call.notes,
        status=CallStatus.PAID if call.initial_status == "paid" else CallStatus.PENDING,
        paid_at=datetime.utcnow() if call.initial_status == "paid" else None,
    )
    db.add(db_call)
    db.commit()
    db.refresh(db_call)
    return _call_to_dict(db_call)

@router.patch("/{call_id}/approve")
def approve_call(call_id: str, db: Session = Depends(get_db),
                 user = Depends(get_current_user)):
    c = db.query(CapitalCall).filter(CapitalCall.id == uuid.UUID(call_id)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    c.status = CallStatus.APPROVED
    c.approved_by = user.id
    c.approved_at = datetime.utcnow()
    db.commit()
    return _call_to_dict(c)

@router.patch("/{call_id}/mark-paid")
def mark_paid(call_id: str, db: Session = Depends(get_db),
              user = Depends(get_current_user)):
    c = db.query(CapitalCall).filter(CapitalCall.id == uuid.UUID(call_id)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    c.status = CallStatus.PAID
    c.paid_at = datetime.utcnow()
    if not c.execution_date:
        c.execution_date = c.due_date
    db.commit()
    return _call_to_dict(c)

@router.get("/{call_id}")
def get_call(call_id: str, db: Session = Depends(get_db)):
    c = db.query(CapitalCall).filter(CapitalCall.id == uuid.UUID(call_id)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    return _call_to_dict(c)
