"""
InvestmentTarget — records investment projects extracted from Capital Call notices.
Funds often use code/project names; the actual_name field captures the real company.
"""
import uuid
from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class InvestmentTarget(Base):
    __tablename__ = "investment_targets"

    id              = Column(GUID, primary_key=True, default=uuid.uuid4)
    notice_id       = Column(GUID, ForeignKey("notice_uploads.id"), nullable=True)
    fund_id         = Column(GUID, ForeignKey("funds.id"), nullable=False)
    capital_call_id = Column(GUID, ForeignKey("capital_calls.id"), nullable=True)
    project_name    = Column(String(255), nullable=False)  # code / project name in notice
    actual_name     = Column(String(255))                  # real company name if disclosed
    investment_date = Column(Date)
    amount_usd      = Column(Numeric(20, 2), default=0)
    amount_pct      = Column(Numeric(8, 4), default=0)     # % of call allocated to this investment
    investment_type = Column(String(100))                  # Equity, Debt, Follow-on, etc.
    sector          = Column(String(100))                  # e.g. Technology, Healthcare
    geography       = Column(String(100))                  # e.g. North America, Asia-Pacific
    deal_type       = Column(String(100))                  # e.g. LBO, Growth Equity, Venture
    keywords        = Column(String(1000))                 # comma-separated keywords from notice
    notes           = Column(String(1000))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    notice       = relationship("NoticeUpload", back_populates="investment_targets")
    fund         = relationship("Fund")
    capital_call = relationship("CapitalCall")
