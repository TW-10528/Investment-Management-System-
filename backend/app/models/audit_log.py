import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id         = Column(GUID, primary_key=True, default=uuid.uuid4)
    user_id    = Column(GUID)
    user_email = Column(String(255))
    action     = Column(String(50))
    table_name = Column(String(100))
    record_id  = Column(String(36))
    old_values = Column(Text)   # JSON stored as text (SQLite-compatible)
    new_values = Column(Text)
    ip_address = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
