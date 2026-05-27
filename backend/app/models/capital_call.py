import uuid, enum
from sqlalchemy import Column, String, Numeric, Date, Integer, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class CallStatus(str, enum.Enum):
    PENDING   = "pending"
    APPROVED  = "approved"
    PAID      = "paid"
    CANCELLED = "cancelled"


class CapitalCall(Base):
    __tablename__ = "capital_calls"

    id                        = Column(GUID, primary_key=True, default=uuid.uuid4)
    fund_id                   = Column(GUID, ForeignKey("funds.id"), nullable=False)
    notice_date               = Column(Date, nullable=False)
    due_date                  = Column(Date, nullable=False)
    call_number               = Column(Integer)
    call_pct                  = Column(Numeric(8, 4), default=0)  # % of commitment called
    gross_call_usd            = Column(Numeric(20, 2), default=0) # B: 出資払込金額
    distribution_usd          = Column(Numeric(20, 2), default=0) # deemed distribution offset
    reinvestable_usd          = Column(Numeric(20, 2), default=0) # D: うち再投資当可能額
    net_call_usd              = Column(Numeric(20, 2), default=0) # net amount wired
    fx_rate                   = Column(Numeric(12, 4))            # MUFG TTM on execution date
    net_call_jpy              = Column(Numeric(22, 0), default=0)
    investment_amount_usd     = Column(Numeric(20, 2), default=0)
    management_fee_usd        = Column(Numeric(20, 2), default=0)
    expense_usd               = Column(Numeric(20, 2), default=0)
    status                    = Column(SAEnum(CallStatus), default=CallStatus.PENDING)
    approved_by               = Column(GUID, ForeignKey("users.id"), nullable=True)
    approved_at               = Column(DateTime(timezone=True))
    paid_at                   = Column(DateTime(timezone=True))
    execution_date            = Column(Date)                      # actual wire date
    wire_reference            = Column(String(100))
    wire_fee_jpy              = Column(Numeric(14, 0), default=0)
    is_recallable             = Column(Boolean, default=False)
    notes                     = Column(String(2000))
    created_at                = Column(DateTime(timezone=True), server_default=func.now())
    updated_at                = Column(DateTime(timezone=True), onupdate=func.now())

    fund       = relationship("Fund", back_populates="capital_calls")
    line_items = relationship("CallLineItem", back_populates="capital_call", cascade="all, delete-orphan")


class CallLineItem(Base):
    __tablename__ = "call_line_items"

    id              = Column(GUID, primary_key=True, default=uuid.uuid4)
    capital_call_id = Column(GUID, ForeignKey("capital_calls.id"), nullable=False)
    investment_name = Column(String(255))
    line_type       = Column(String(50))
    amount_usd      = Column(Numeric(20, 2), default=0)
    is_recallable   = Column(Boolean, default=False)

    capital_call = relationship("CapitalCall", back_populates="line_items")
