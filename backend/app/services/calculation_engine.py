"""
Calculation Engine – mirrors the Excel sheet formulas used by Thirdwave.

Excel column mapping:
  A  出資契約効力発生日   Contract effective date
  B  出資払込金額        Capital paid-in (gross call amount wired OUT)
  C  出資受領金額        Capital received (distributions IN)
  D  うち再投資当可能額   Reinvestable portion of C
  E  出資額累計         = prev_E + B  (cumulative capital called)
  F  投資余力           = prev_F - B + D  (remaining investment capacity)
  G  キャッシュフロー     = -B + C  (net cash flow for that period)
  H  NET Cash Position  running net position
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from typing import List, Tuple, Optional
from dataclasses import dataclass


# ─────────────────────────────────────────────
#  Data containers
# ─────────────────────────────────────────────

@dataclass
class TransactionRow:
    """One row in the fund transaction ledger (capital call or distribution)."""
    date:             date
    tx_type:          str   # "capital_call" | "distribution"
    description:      str
    fx_rate:          Optional[Decimal]  # MUFG TTM on execution day
    # raw amounts
    capital_paid_in:  Decimal   # B
    capital_received: Decimal   # C
    reinvestable:     Decimal   # D (subset of C)
    # calculated
    cumulative_called: Decimal  # E
    investment_capacity: Decimal  # F
    cash_flow:        Decimal   # G = -B + C
    net_cash_position: Decimal  # H (running)
    # JPY equivalents
    capital_paid_jpy: Decimal
    capital_received_jpy: Decimal


@dataclass
class FundSnapshot:
    """Current state summary for a fund."""
    fund_id:              str
    fund_name:            str
    commitment_usd:       Decimal
    commitment_jpy:       Decimal
    total_called_usd:     Decimal     # Σ B
    total_received_usd:   Decimal     # Σ C
    total_reinvestable:   Decimal     # Σ D
    drawn_pct:            Decimal
    unfunded_usd:         Decimal     # commitment - E
    investment_capacity:  Decimal     # F (latest)
    cumulative_called:    Decimal     # E (latest)
    net_cash_flow:        Decimal     # Σ G
    net_cash_position:    Decimal     # H (latest)
    dpi:                  Decimal


# ─────────────────────────────────────────────
#  Core formulas
# ─────────────────────────────────────────────

class CalculationEngine:

    # ── Basic converters ──────────────────────

    @staticmethod
    def to_jpy(usd: Decimal, rate: Decimal) -> Decimal:
        if not rate:
            return Decimal(0)
        return (usd * rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    @staticmethod
    def drawn_pct(called: Decimal, commitment: Decimal) -> Decimal:
        if not commitment:
            return Decimal(0)
        return (called / commitment * 100).quantize(Decimal("0.01"))

    @staticmethod
    def dpi(distributions: Decimal, called: Decimal) -> Decimal:
        if not called:
            return Decimal(0)
        return (distributions / called).quantize(Decimal("0.0001"))

    # ── Excel column E, F, G, H ───────────────

    @staticmethod
    def next_E(prev_E: Decimal, B: Decimal) -> Decimal:
        """E = prev_E + B  (cumulative capital called)"""
        return prev_E + B

    @staticmethod
    def next_F(prev_F: Decimal, B: Decimal, D: Decimal) -> Decimal:
        """F = prev_F - B + D  (remaining investment capacity)"""
        return prev_F - B + D

    @staticmethod
    def cash_flow_G(B: Decimal, C: Decimal) -> Decimal:
        """G = -B + C  (net cash flow for the period)"""
        return -B + C

    @staticmethod
    def next_H(prev_H: Decimal, G: Decimal) -> Decimal:
        """H = prev_H + G  (running NET cash position)"""
        return prev_H + G

    # ── Full ledger builder ───────────────────

    @classmethod
    def build_ledger(
        cls,
        commitment_usd: Decimal,
        transactions: List[dict],
        current_fx: Decimal = Decimal("150"),
    ) -> Tuple[List[TransactionRow], FundSnapshot]:
        """
        Build the complete transaction ledger for a fund.

        Each transaction dict must contain:
          date, tx_type ("capital_call"/"distribution"), description,
          fx_rate (optional), capital_paid_in (B), capital_received (C),
          reinvestable (D), fund_id, fund_name
        """
        rows: List[TransactionRow] = []

        # Running accumulators
        E = Decimal(0)
        F = commitment_usd   # starts at full commitment
        H = Decimal(0)

        for tx in sorted(transactions, key=lambda x: x["date"]):
            B = Decimal(str(tx.get("capital_paid_in",  0) or 0))
            C = Decimal(str(tx.get("capital_received", 0) or 0))
            D = Decimal(str(tx.get("reinvestable",     0) or 0))
            rate = Decimal(str(tx.get("fx_rate") or current_fx))

            E = cls.next_E(E, B)
            F = cls.next_F(F, B, D)
            G = cls.cash_flow_G(B, C)
            H = cls.next_H(H, G)

            rows.append(TransactionRow(
                date              = tx["date"],
                tx_type           = tx["tx_type"],
                description       = tx.get("description", ""),
                fx_rate           = rate,
                capital_paid_in   = B,
                capital_received  = C,
                reinvestable      = D,
                cumulative_called = E,
                investment_capacity = F,
                cash_flow         = G,
                net_cash_position = H,
                capital_paid_jpy  = cls.to_jpy(B, rate),
                capital_received_jpy = cls.to_jpy(C, rate),
            ))

        total_C = sum((r.capital_received  for r in rows), Decimal(0))
        total_D = sum((r.reinvestable      for r in rows), Decimal(0))

        latest_E = rows[-1].cumulative_called   if rows else Decimal(0)
        latest_F = rows[-1].investment_capacity if rows else commitment_usd
        latest_H = rows[-1].net_cash_position   if rows else Decimal(0)

        snapshot = FundSnapshot(
            fund_id             = str(transactions[0].get("fund_id", "")) if transactions else "",
            fund_name           = transactions[0].get("fund_name", "")    if transactions else "",
            commitment_usd      = commitment_usd,
            commitment_jpy      = cls.to_jpy(commitment_usd, current_fx),
            total_called_usd    = latest_E,
            total_received_usd  = total_C,
            total_reinvestable  = total_D,
            drawn_pct           = cls.drawn_pct(latest_E, commitment_usd),
            unfunded_usd        = commitment_usd - latest_E,
            investment_capacity = latest_F,
            cumulative_called   = latest_E,
            net_cash_flow       = latest_H + latest_E,  # total outflow perspective
            net_cash_position   = latest_H,
            dpi                 = cls.dpi(total_C, latest_E),
        )

        return rows, snapshot

    # ── Simple fund summary (DB-driven) ───────

    @classmethod
    def fund_summary(cls, fund, db) -> dict:
        from app.models.capital_call import CapitalCall, CallStatus
        from app.models.distribution import Distribution

        paid = db.query(CapitalCall).filter(
            CapitalCall.fund_id == fund.id,
            CapitalCall.status  == CallStatus.PAID,
        ).order_by(CapitalCall.execution_date, CapitalCall.due_date).all()

        dists = db.query(Distribution).filter(
            Distribution.fund_id == fund.id
        ).order_by(Distribution.distribution_date).all()

        # Build transaction list
        txns = []
        for c in paid:
            txns.append({
                "date":             c.execution_date or c.due_date,
                "tx_type":          "capital_call",
                "description":      f"Capital Call #{c.call_number}",
                "fx_rate":          c.fx_rate,
                "capital_paid_in":  c.gross_call_usd or Decimal(0),
                "capital_received": c.distribution_usd or Decimal(0),
                "reinvestable":     c.reinvestable_usd or Decimal(0),
                "fund_id":          str(fund.id),
                "fund_name":        fund.fund_name,
            })
        for d in dists:
            txns.append({
                "date":             d.distribution_date,
                "tx_type":          "distribution",
                "description":      f"{d.dist_type} distribution",
                "fx_rate":          d.fx_rate,
                "capital_paid_in":  Decimal(0),
                "capital_received": d.amount_usd or Decimal(0),
                "reinvestable":     d.reinvestable_usd or Decimal(0),
                "fund_id":          str(fund.id),
                "fund_name":        fund.fund_name,
            })

        commitment = Decimal(str(fund.commitment_usd or 0))
        if not txns:
            return {
                "fund_id":            str(fund.id),
                "fund_name":          fund.fund_name,
                "strategy":           fund.strategy,
                "manager":            fund.manager,
                "commitment_usd":     float(commitment),
                "total_called_usd":   0.0,
                "drawn_pct":          0.0,
                "unfunded_usd":       float(commitment),
                "investment_capacity": float(commitment),
                "net_cash_position":  0.0,
                "total_received_usd": 0.0,
                "dpi":                0.0,
            }

        _, snap = cls.build_ledger(commitment, txns)
        return {
            "fund_id":            str(fund.id),
            "fund_name":          fund.fund_name,
            "fund_name_jp":       fund.fund_name_jp,
            "strategy":           fund.strategy,
            "manager":            fund.manager,
            "vintage_year":       fund.vintage_year,
            "currency":           fund.currency,
            "commitment_usd":     float(snap.commitment_usd),
            "total_called_usd":   float(snap.total_called_usd),
            "drawn_pct":          float(snap.drawn_pct),
            "unfunded_usd":       float(snap.unfunded_usd),
            "investment_capacity": float(snap.investment_capacity),
            "net_cash_position":  float(snap.net_cash_position),
            "total_received_usd": float(snap.total_received_usd),
            "dpi":                float(snap.dpi),
            "is_active":          fund.is_active,
        }
