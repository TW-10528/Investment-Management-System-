"""One-time password table for password reset flow."""
import uuid
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class OtpToken(Base):
    __tablename__ = "otp_tokens"

    id         = Column(GUID, primary_key=True, default=uuid.uuid4)
    email      = Column(String(255), nullable=False, index=True)
    token      = Column(String(6),   nullable=False)
    used       = Column(Boolean, default=False)
    # Use timezone=False (naive UTC) for SQLite compatibility.
    # timezone=True can cause aware↔naive comparison failures in SQLite.
    expires_at = Column(DateTime(timezone=False), nullable=False)
    created_at = Column(DateTime(timezone=False), server_default=func.now())
