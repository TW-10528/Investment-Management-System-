"""FX Rates API – manual entry + live fetch from frankfurter.app (free, no key needed)."""
import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.fx_rate import FxRate
from pydantic import BaseModel
from datetime import date, timedelta
from decimal import Decimal

router = APIRouter()


class FxRateCreate(BaseModel):
    rate_date : date
    usd_jpy   : Decimal
    rate_type : str = "MUFG_TTM"


@router.get("/")
def list_rates(db: Session = Depends(get_db)):
    return db.query(FxRate).order_by(FxRate.rate_date.desc()).limit(60).all()


@router.get("/latest")
def latest_rate(db: Session = Depends(get_db)):
    rate = db.query(FxRate).order_by(FxRate.rate_date.desc()).first()
    if rate:
        return {"date": str(rate.rate_date), "usd_jpy": float(rate.usd_jpy),
                "source": rate.source or "manual"}
    return {"date": None, "usd_jpy": None, "source": None}


@router.get("/live")
def live_rate():
    """Fetch live USD/JPY from frankfurter.app (ECB data – free, no API key)."""
    try:
        resp = httpx.get(
            "https://api.frankfurter.dev/v1/latest?from=USD&to=JPY",
            timeout=8.0,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
        rate = data["rates"]["JPY"]
        return {
            "date"   : data["date"],
            "usd_jpy": rate,
            "source" : "frankfurter.app (ECB)",
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not fetch live rate: {e}")


@router.get("/history")
def rate_history(days: int = 30, db: Session = Depends(get_db)):
    since = date.today() - timedelta(days=days)
    rates = (
        db.query(FxRate)
        .filter(FxRate.rate_date >= since)
        .order_by(FxRate.rate_date.asc())
        .all()
    )
    return [{"date": str(r.rate_date), "usd_jpy": float(r.usd_jpy), "source": r.source or "manual"} for r in rates]


@router.post("/")
def create_rate(rate: FxRateCreate,
                db: Session = Depends(get_db),
                user = Depends(get_current_user)):
    existing = db.query(FxRate).filter(FxRate.rate_date == rate.rate_date).first()
    if existing:
        existing.usd_jpy   = rate.usd_jpy
        existing.rate_type = rate.rate_type
        db.commit()
        return existing
    db_rate = FxRate(**rate.model_dump())
    db.add(db_rate)
    db.commit()
    db.refresh(db_rate)
    return db_rate
