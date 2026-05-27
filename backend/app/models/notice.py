"""
NoticeUpload — records each PDF notice uploaded by users.
After admin approval the extracted data is written to the CF tables.
"""
import uuid, enum
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class NoticeType(str, enum.Enum):
    CAPITAL_CALL        = "capital_call"
    DISTRIBUTION        = "distribution"
    FINANCIAL_STATEMENT = "financial_statement"


class NoticeStatus(str, enum.Enum):
    PENDING  = "pending"   # uploaded, awaiting admin review
    APPROVED = "approved"  # admin approved → CF records created
    REJECTED = "rejected"  # admin rejected


class NoticeUpload(Base):
    __tablename__ = "notice_uploads"

    id             = Column(GUID, primary_key=True, default=uuid.uuid4)
    fund_id        = Column(GUID, ForeignKey("funds.id"), nullable=True)
    notice_type    = Column(SAEnum(NoticeType), nullable=False)
    status         = Column(SAEnum(NoticeStatus), default=NoticeStatus.PENDING)
    file_name      = Column(String(255), nullable=False)
    file_path      = Column(String(500))           # server-side path
    raw_text       = Column(Text)                  # full extracted text
    extracted_data = Column(Text)                  # JSON of parsed fields
    admin_notes    = Column(String(2000))
    uploaded_by    = Column(GUID, ForeignKey("users.id"), nullable=True)
    reviewed_by    = Column(GUID, ForeignKey("users.id"), nullable=True)
    reviewed_at    = Column(DateTime(timezone=True))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    fund               = relationship("Fund")
    investment_targets = relationship("InvestmentTarget", back_populates="notice",
                                      cascade="all, delete-orphan")
    nav_records        = relationship("NavRecord", back_populates="notice",
                                      cascade="all, delete-orphan")
