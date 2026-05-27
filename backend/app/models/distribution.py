import uuid, enum
from sqlalchemy import Column, String, Numeric, Date, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class DistributionType(str, enum.Enum):
    CAPITAL_RETURN = "Capital Return"
    INCOME         = "Income"
    RECALLABLE     = "Recallable"
    DEEMED         = "Deemed Distribution"


class Distribution(Base):
    __tablename__ = "distributions"

    id                = Column(GUID, primary_key=True, default=uuid.uuid4)
    fund_id           = Column(GUID, ForeignKey("funds.id"), nullable=False)
    distribution_date = Column(Date, nullable=False)
    dist_type         = Column(SAEnum(DistributionType))
    amount_usd        = Column(Numeric(20, 2), default=0)    # C: 出資受領金額
    reinvestable_usd  = Column(Numeric(20, 2), default=0)    # D: うち再投資当可能額
    fx_rate           = Column(Numeric(12, 4))
    amount_jpy        = Column(Numeric(22, 0), default=0)
    is_recallable     = Column(Boolean, default=False)
    recall_expiry     = Column(Date)
    is_recalled       = Column(Boolean, default=False)
    notes             = Column(String(1000))
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    fund = relationship("Fund", back_populates="distributions")
