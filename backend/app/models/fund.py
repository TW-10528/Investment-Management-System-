import uuid, enum
from sqlalchemy import Column, String, Numeric, Date, Integer, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class FundStrategy(str, enum.Enum):
    BUYOUT         = "Buyout"
    GROWTH         = "Growth"
    VENTURE        = "Venture"
    SECONDARIES    = "Secondaries"
    PRIVATE_CREDIT = "Private Credit"
    REAL_ESTATE    = "Real Estate"
    INFRASTRUCTURE = "Infrastructure"
    HEDGE_FUND     = "Hedge Fund"
    OTHER          = "Other"


class Fund(Base):
    __tablename__ = "funds"

    id                      = Column(GUID, primary_key=True, default=uuid.uuid4)
    fund_name               = Column(String(255), nullable=False)
    fund_name_jp            = Column(String(255))
    manager                 = Column(String(255))
    administrator           = Column(String(255))
    strategy                = Column(SAEnum(FundStrategy))
    vintage_year            = Column(Integer)
    currency                = Column(String(3), default="USD")
    commitment_usd          = Column(Numeric(20, 2), default=0)
    commitment_jpy          = Column(Numeric(22, 0), default=0)
    entry_fx_rate           = Column(Numeric(12, 4))          # MUFG TTM at contract date
    contract_date           = Column(Date)                     # 出資契約効力発生日
    investment_period_start = Column(Date)
    investment_period_end   = Column(Date)
    fund_term_years         = Column(Integer)
    management_fee_pct      = Column(Numeric(8, 4), default=0)
    carry_pct               = Column(Numeric(8, 4), default=0)
    hurdle_rate_pct         = Column(Numeric(8, 4), default=0)
    wire_bank               = Column(String(255))
    wire_account_name       = Column(String(255))
    wire_account_number     = Column(String(100))
    wire_aba                = Column(String(50))
    wire_swift              = Column(String(50))
    wire_reference          = Column(String(100))
    notes                   = Column(String(2000))
    is_active               = Column(Boolean, default=True)
    created_at              = Column(DateTime(timezone=True), server_default=func.now())
    updated_at              = Column(DateTime(timezone=True), onupdate=func.now())

    capital_calls   = relationship("CapitalCall",  back_populates="fund", cascade="all, delete-orphan")
    distributions   = relationship("Distribution", back_populates="fund", cascade="all, delete-orphan")
