"""
NavRecord — Net Asset Value snapshots extracted from fund financial statements.
"""
import uuid
from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class NavRecord(Base):
    __tablename__ = "nav_records"

    id         = Column(GUID, primary_key=True, default=uuid.uuid4)
    fund_id    = Column(GUID, ForeignKey("funds.id"), nullable=False)
    notice_id  = Column(GUID, ForeignKey("notice_uploads.id"), nullable=True)
    nav_date   = Column(Date, nullable=False)
    nav_usd    = Column(Numeric(20, 2), default=0)
    nav_jpy    = Column(Numeric(22, 0), default=0)
    fx_rate    = Column(Numeric(12, 4))
    period     = Column(String(50))     # e.g. "Q1 2024", "FY2023"
    notes      = Column(String(1000))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    fund   = relationship("Fund")
    notice = relationship("NoticeUpload", back_populates="nav_records")
