from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.fund import Fund, FundStrategy
from app.models.capital_call import CapitalCall, CallStatus
from app.models.distribution import Distribution
from app.services.calculation_engine import CalculationEngine
from app.services.audit_service import log_action
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from decimal import Decimal
import uuid

router = APIRouter()


class FundCreate(BaseModel):
    fund_name               : str
    fund_name_jp            : Optional[str]          = None
    manager                 : Optional[str]          = None
    administrator           : Optional[str]          = None
    strategy                : Optional[FundStrategy] = None
    vintage_year            : Optional[int]          = None
    currency                : str                    = "USD"
    commitment_usd          : Decimal                = Decimal(0)
    entry_fx_rate           : Optional[Decimal]      = None
    contract_date           : Optional[date]         = None
    investment_period_start : Optional[date]         = None
    investment_period_end   : Optional[date]         = None
    fund_term_years         : Optional[int]          = None
    management_fee_pct      : Optional[Decimal]      = Decimal(0)
    carry_pct               : Optional[Decimal]      = Decimal(0)
    hurdle_rate_pct         : Optional[Decimal]      = Decimal(0)
    wire_bank               : Optional[str]          = None
    wire_account_name       : Optional[str]          = None
    wire_account_number     : Optional[str]          = None
    wire_aba                : Optional[str]          = None
    wire_swift              : Optional[str]          = None
    wire_reference          : Optional[str]          = None
    notes                   : Optional[str]          = None


@router.get("/")
def list_funds(db: Session = Depends(get_db)):
    funds = db.query(Fund).filter(Fund.is_active == True).order_by(Fund.fund_name).all()
    return [CalculationEngine.fund_summary(f, db) for f in funds]


@router.get("/{fund_id}")
def get_fund(fund_id: str, db: Session = Depends(get_db)):
    fund = db.query(Fund).filter(Fund.id == uuid.UUID(fund_id)).first()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    summary = CalculationEngine.fund_summary(fund, db)
    return {
        "id":                   str(fund.id),
        "fund_name":            fund.fund_name,
        "fund_name_jp":         fund.fund_name_jp,
        "manager":              fund.manager,
        "administrator":        fund.administrator,
        "strategy":             fund.strategy,
        "vintage_year":         fund.vintage_year,
        "currency":             fund.currency,
        "commitment_usd":       float(fund.commitment_usd or 0),
        "commitment_jpy":       float(fund.commitment_jpy or 0),
        "entry_fx_rate":        float(fund.entry_fx_rate) if fund.entry_fx_rate else None,
        "contract_date":        str(fund.contract_date) if fund.contract_date else None,
        "investment_period_start": str(fund.investment_period_start) if fund.investment_period_start else None,
        "investment_period_end":   str(fund.investment_period_end)   if fund.investment_period_end   else None,
        "fund_term_years":      fund.fund_term_years,
        "management_fee_pct":   float(fund.management_fee_pct or 0),
        "carry_pct":            float(fund.carry_pct or 0),
        "hurdle_rate_pct":      float(fund.hurdle_rate_pct or 0),
        "wire_bank":            fund.wire_bank,
        "wire_account_name":    fund.wire_account_name,
        "wire_account_number":  fund.wire_account_number,
        "wire_aba":             fund.wire_aba,
        "wire_swift":           fund.wire_swift,
        "wire_reference":       fund.wire_reference,
        "notes":                fund.notes,
        "is_active":            fund.is_active,
        "summary":              summary,
    }


@router.get("/{fund_id}/ledger")
def get_fund_ledger(fund_id: str, db: Session = Depends(get_db)):
    """Return the full Excel-style transaction ledger for a fund."""
    fund = db.query(Fund).filter(Fund.id == uuid.UUID(fund_id)).first()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    paid = db.query(CapitalCall).filter(
        CapitalCall.fund_id == fund.id,
        CapitalCall.status  == CallStatus.PAID,
    ).order_by(CapitalCall.execution_date, CapitalCall.due_date).all()

    dists = db.query(Distribution).filter(
        Distribution.fund_id == fund.id
    ).order_by(Distribution.distribution_date).all()

    txns = []
    for c in paid:
        txns.append({
            "date":             c.execution_date or c.due_date,
            "tx_type":          "capital_call",
            "description":      f"Capital Call #{c.call_number}",
            "fx_rate":          float(c.fx_rate) if c.fx_rate else None,
            "capital_paid_in":  float(c.gross_call_usd or 0),
            "capital_received": float(c.distribution_usd or 0),
            "reinvestable":     float(c.reinvestable_usd or 0),
            "fund_id":          str(fund.id),
            "fund_name":        fund.fund_name,
            "call_id":          str(c.id),
            "call_number":      c.call_number,
            "wire_reference":   c.wire_reference,
        })
    for d in dists:
        txns.append({
            "date":             d.distribution_date,
            "tx_type":          "distribution",
            "description":      f"{d.dist_type}",
            "fx_rate":          float(d.fx_rate) if d.fx_rate else None,
            "capital_paid_in":  0.0,
            "capital_received": float(d.amount_usd or 0),
            "reinvestable":     float(d.reinvestable_usd or 0),
            "fund_id":          str(fund.id),
            "fund_name":        fund.fund_name,
            "dist_id":          str(d.id),
        })

    if not txns:
        return {
            "fund_id":    str(fund.id),
            "fund_name":  fund.fund_name,
            "commitment": float(fund.commitment_usd or 0),
            "rows":       [],
            "snapshot":   None,
        }

    from decimal import Decimal as D
    commitment = D(str(fund.commitment_usd or 0))

    # Build ledger with Decimal-safe inputs
    txns_decimal = []
    for t in sorted(txns, key=lambda x: x["date"]):
        txns_decimal.append({
            **t,
            "capital_paid_in":  D(str(t["capital_paid_in"])),
            "capital_received": D(str(t["capital_received"])),
            "reinvestable":     D(str(t["reinvestable"])),
            "fx_rate":          D(str(t["fx_rate"])) if t["fx_rate"] else None,
        })

    rows, snap = CalculationEngine.build_ledger(commitment, txns_decimal)

    def row_to_dict(r, raw_tx):
        return {
            "date":              str(r.date),
            "tx_type":           r.tx_type,
            "description":       r.description,
            "fx_rate":           float(r.fx_rate) if r.fx_rate else None,
            "capital_paid_in":   float(r.capital_paid_in),
            "capital_received":  float(r.capital_received),
            "reinvestable":      float(r.reinvestable),
            "cumulative_called": float(r.cumulative_called),
            "investment_capacity": float(r.investment_capacity),
            "cash_flow":         float(r.cash_flow),
            "net_cash_position": float(r.net_cash_position),
            "capital_paid_jpy":  float(r.capital_paid_jpy),
            "capital_received_jpy": float(r.capital_received_jpy),
            "call_id":           raw_tx.get("call_id"),
            "dist_id":           raw_tx.get("dist_id"),
            "wire_reference":    raw_tx.get("wire_reference"),
        }

    sorted_txns = sorted(txns_decimal, key=lambda x: x["date"])
    return {
        "fund_id":    str(fund.id),
        "fund_name":  fund.fund_name,
        "commitment": float(commitment),
        "rows":       [row_to_dict(r, sorted_txns[i]) for i, r in enumerate(rows)],
        "snapshot":   {
            "commitment_usd":      float(snap.commitment_usd),
            "total_called_usd":    float(snap.total_called_usd),
            "total_received_usd":  float(snap.total_received_usd),
            "drawn_pct":           float(snap.drawn_pct),
            "unfunded_usd":        float(snap.unfunded_usd),
            "investment_capacity": float(snap.investment_capacity),
            "net_cash_position":   float(snap.net_cash_position),
            "dpi":                 float(snap.dpi),
        },
    }


@router.post("/")
def create_fund(fund: FundCreate, db: Session = Depends(get_db),
                user = Depends(get_current_user)):
    db_fund = Fund(**fund.model_dump())
    if fund.entry_fx_rate and fund.commitment_usd:
        db_fund.commitment_jpy = int(fund.commitment_usd * fund.entry_fx_rate)
    db.add(db_fund)
    db.flush()
    log_action(db, "CREATE", "funds", user.email, str(user.id),
               str(db_fund.id), new_values=fund.model_dump(mode="json"))
    db.commit()
    db.refresh(db_fund)
    return {"id": str(db_fund.id), "fund_name": db_fund.fund_name}


@router.put("/{fund_id}")
def update_fund(fund_id: str, fund: FundCreate,
                db: Session = Depends(get_db),
                user = Depends(get_current_user)):
    db_fund = db.query(Fund).filter(Fund.id == uuid.UUID(fund_id)).first()
    if not db_fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    for k, v in fund.model_dump(exclude_unset=True).items():
        setattr(db_fund, k, v)
    if fund.entry_fx_rate and fund.commitment_usd:
        db_fund.commitment_jpy = int(fund.commitment_usd * fund.entry_fx_rate)
    log_action(db, "UPDATE", "funds", user.email, str(user.id), fund_id)
    db.commit()
    return {"id": str(db_fund.id), "fund_name": db_fund.fund_name}


@router.delete("/{fund_id}")
def deactivate_fund(fund_id: str, db: Session = Depends(get_db),
                    user = Depends(get_current_user)):
    db_fund = db.query(Fund).filter(Fund.id == uuid.UUID(fund_id)).first()
    if not db_fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    db_fund.is_active = False
    db.commit()
    return {"message": "Fund deactivated"}
