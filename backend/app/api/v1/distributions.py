from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.distribution import Distribution, DistributionType
from app.models.fund import Fund
from pydantic import BaseModel
from typing import Optional
from datetime import date
from decimal import Decimal
import uuid

router = APIRouter()

class DistributionCreate(BaseModel):
    fund_id          : str
    distribution_date: date
    dist_type        : DistributionType = DistributionType.CAPITAL_RETURN
    amount_usd       : Decimal          = Decimal(0)
    reinvestable_usd : Decimal          = Decimal(0)
    fx_rate          : Optional[Decimal] = None
    is_recallable    : bool             = False
    recall_expiry    : Optional[date]   = None
    notes            : Optional[str]    = None

def _dist_to_dict(d):
    return {
        "id": str(d.id), "fund_id": str(d.fund_id),
        "distribution_date": str(d.distribution_date),
        "dist_type": d.dist_type,
        "amount_usd": float(d.amount_usd or 0),
        "reinvestable_usd": float(d.reinvestable_usd or 0),
        "fx_rate": float(d.fx_rate) if d.fx_rate else None,
        "amount_jpy": float(d.amount_jpy or 0),
        "is_recallable": d.is_recallable,
        "recall_expiry": str(d.recall_expiry) if d.recall_expiry else None,
        "is_recalled": d.is_recalled,
        "notes": d.notes,
    }

@router.get("/")
def list_distributions(fund_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Distribution)
    if fund_id:
        q = q.filter(Distribution.fund_id == uuid.UUID(fund_id))
    dists = q.order_by(Distribution.distribution_date.desc()).all()
    result = []
    for d in dists:
        item = _dist_to_dict(d)
        fund = db.query(Fund).filter(Fund.id == d.fund_id).first()
        item["fund_name"] = fund.fund_name if fund else ""
        result.append(item)
    return result

@router.post("/")
def create_distribution(dist: DistributionCreate, db: Session = Depends(get_db),
                         user = Depends(get_current_user)):
    from app.models.fx_rate import FxRate
    fx_rate = dist.fx_rate
    if not fx_rate:
        latest = db.query(FxRate).order_by(FxRate.rate_date.desc()).first()
        fx_rate = latest.usd_jpy if latest else Decimal("150")
    amount_jpy = int(dist.amount_usd * fx_rate)
    db_dist = Distribution(
        fund_id=uuid.UUID(dist.fund_id),
        distribution_date=dist.distribution_date,
        dist_type=dist.dist_type,
        amount_usd=dist.amount_usd,
        reinvestable_usd=dist.reinvestable_usd,
        fx_rate=fx_rate, amount_jpy=amount_jpy,
        is_recallable=dist.is_recallable,
        recall_expiry=dist.recall_expiry,
        notes=dist.notes,
    )
    db.add(db_dist)
    db.commit()
    db.refresh(db_dist)
    return _dist_to_dict(db_dist)

@router.get("/{dist_id}")
def get_distribution(dist_id: str, db: Session = Depends(get_db)):
    d = db.query(Distribution).filter(Distribution.id == uuid.UUID(dist_id)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return _dist_to_dict(d)

@router.delete("/{dist_id}")
def delete_distribution(dist_id: str, db: Session = Depends(get_db),
                         user = Depends(get_current_user)):
    d = db.query(Distribution).filter(Distribution.id == uuid.UUID(dist_id)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(d)
    db.commit()
    return {"message": "Deleted"}
