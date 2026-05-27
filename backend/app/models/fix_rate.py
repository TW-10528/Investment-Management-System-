import uuid
from sqlalchemy import Column, Numeric, Date, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base

class FxRate(Base):
    __tablename__ = "fx_rates"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rate_date  = Column(Date, nullable=False, unique=True)
    usd_jpy    = Column(Numeric(12, 4), nullable=False)
    rate_type  = Column(String(20), default="MUFG_TTM")
    source     = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())