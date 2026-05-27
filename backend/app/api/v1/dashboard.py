from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.fund import Fund
from app.models.capital_call import CapitalCall, CallStatus
from app.models.fx_rate import FxRate
from app.models.distribution import Distribution, DistributionType
from app.models.nav_record import NavRecord
from app.models.investment_target import InvestmentTarget
from app.services.calculation_engine import CalculationEngine
from datetime import date
from decimal import Decimal

router = APIRouter()


def _latest_nav_per_fund(funds, db: Session) -> dict:
    """Return {fund_id_str: NavRecord} for each fund that has NAV data."""
    result = {}
    for fund in funds:
        nav = (
            db.query(NavRecord)
            .filter(NavRecord.fund_id == fund.id)
            .order_by(NavRecord.nav_date.desc())
            .first()
        )
        if nav:
            result[str(fund.id)] = nav
    return result


def _distribution_breakdown(db: Session) -> dict:
    """
    Aggregate distributions by type across ALL funds.
    Returns: {capital_return_usd, income_usd, recallable_usd, deemed_usd, total_usd}
    """
    breakdown = {
        "capital_return_usd": 0.0,
        "income_usd":         0.0,
        "recallable_usd":     0.0,
        "deemed_usd":         0.0,
        "total_usd":          0.0,
    }
    dists = db.query(Distribution).all()
    for d in dists:
        amt = float(d.amount_usd or 0)
        breakdown["total_usd"] += amt
        if d.dist_type == DistributionType.CAPITAL_RETURN:
            breakdown["capital_return_usd"] += amt
        elif d.dist_type == DistributionType.INCOME:
            breakdown["income_usd"] += amt
        elif d.dist_type == DistributionType.RECALLABLE:
            breakdown["recallable_usd"] += amt
        elif d.dist_type == DistributionType.DEEMED:
            breakdown["deemed_usd"] += amt
    return breakdown


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    funds = db.query(Fund).filter(Fund.is_active == True).all()

    all_summaries = [CalculationEngine.fund_summary(f, db) for f in funds]

    total_commitment = sum(s["commitment_usd"]     for s in all_summaries)
    total_called     = sum(s["total_called_usd"]   for s in all_summaries)
    total_received   = sum(s["total_received_usd"] for s in all_summaries)
    net_cash_pos     = sum(s["net_cash_position"]   for s in all_summaries)
    dry_powder       = sum(s["unfunded_usd"]        for s in all_summaries)

    pending = db.query(CapitalCall).filter(CapitalCall.status == CallStatus.PENDING).all()
    overdue = [c for c in pending if c.due_date < date.today()]

    latest_fx = db.query(FxRate).order_by(FxRate.rate_date.desc()).first()

    drawn_pct = (total_called / total_commitment * 100) if total_commitment else 0

    # Per-strategy breakdown
    strategy_map = {}
    for s in all_summaries:
        strat = s.get("strategy") or "Other"
        if strat not in strategy_map:
            strategy_map[strat] = {"commitment": 0, "called": 0, "count": 0}
        strategy_map[strat]["commitment"] += s["commitment_usd"]
        strategy_map[strat]["called"]     += s["total_called_usd"]
        strategy_map[strat]["count"]      += 1

    # Distribution breakdown (principal vs profit)
    dist_breakdown = _distribution_breakdown(db)

    # Latest NAV per fund
    nav_map = _latest_nav_per_fund(funds, db)
    total_nav_usd = sum(float(v.nav_usd or 0) for v in nav_map.values())

    nav_by_fund = [
        {
            "fund_id"  : str(fund.id),
            "fund_name": fund.fund_name,
            "nav_date" : str(nav_map[str(fund.id)].nav_date),
            "nav_usd"  : float(nav_map[str(fund.id)].nav_usd or 0),
            "period"   : nav_map[str(fund.id)].period,
        }
        for fund in funds
        if str(fund.id) in nav_map
    ]

    # Recent investment targets (last 8 across all funds)
    recent_investments_q = (
        db.query(InvestmentTarget)
        .order_by(InvestmentTarget.created_at.desc())
        .limit(8)
        .all()
    )
    recent_investments = []
    fund_name_cache: dict = {}
    for it in recent_investments_q:
        fid = str(it.fund_id)
        if fid not in fund_name_cache:
            f = db.query(Fund).filter(Fund.id == it.fund_id).first()
            fund_name_cache[fid] = f.fund_name if f else ""
        recent_investments.append({
            "id"             : str(it.id),
            "fund_id"        : fid,
            "fund_name"      : fund_name_cache[fid],
            "project_name"   : it.project_name,
            "actual_name"    : it.actual_name,
            "investment_date": str(it.investment_date) if it.investment_date else None,
            "amount_usd"     : float(it.amount_usd or 0),
            "investment_type": it.investment_type,
        })

    return {
        # Core portfolio metrics
        "total_funds"          : len(funds),
        "total_commitment_usd" : total_commitment,
        "total_called_usd"     : total_called,
        "total_received_usd"   : total_received,
        "net_cash_position"    : net_cash_pos,
        "drawn_pct"            : round(drawn_pct, 2),
        "unfunded_usd"         : dry_powder,
        "dry_powder_usd"       : dry_powder,   # alias for clarity

        # Pending / overdue
        "pending_calls_count"  : len(pending),
        "overdue_calls_count"  : len(overdue),
        "overdue_calls": [
            {
                "id"          : str(c.id),
                "due_date"    : str(c.due_date),
                "net_call_usd": float(c.net_call_usd or 0),
            }
            for c in overdue
        ],

        # FX
        "latest_fx_rate" : float(latest_fx.usd_jpy) if latest_fx else None,
        "latest_fx_date" : str(latest_fx.rate_date)  if latest_fx else None,

        # Per-fund summaries (for the table)
        "fund_summaries"     : all_summaries,
        "strategy_breakdown" : [
            {"strategy": k, **v}
            for k, v in strategy_map.items()
        ],

        # Distribution P&L breakdown
        "distribution_breakdown": dist_breakdown,

        # NAV
        "total_nav_usd": total_nav_usd,
        "nav_by_fund"  : nav_by_fund,

        # Recent investments
        "recent_investments": recent_investments,
    }
