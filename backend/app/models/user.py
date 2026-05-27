import uuid, enum
from sqlalchemy import Column, String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
from app.core.database import Base, GUID


class UserRole(str, enum.Enum):
    USER            = "user"           # Default for self-registration — view only
    BOARD_MEMBER    = "board_member"   # View only
    FINANCE_STAFF   = "finance_staff"  # Edit access (Finance Dept)
    FINANCE_MANAGER = "finance_manager"# Edit access (Finance Dept)
    ADMIN           = "admin"          # Full access + user management


class UserStatus(str, enum.Enum):
    PENDING  = "pending"   # self-registered, awaiting admin approval
    ACTIVE   = "active"    # approved, can log in
    INACTIVE = "inactive"  # deactivated by admin


class User(Base):
    __tablename__ = "users"

    id              = Column(GUID, primary_key=True, default=uuid.uuid4)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    full_name       = Column(String(255))
    full_name_jp    = Column(String(255))
    hashed_password = Column(String(255))
    role            = Column(SAEnum(UserRole), default=UserRole.FINANCE_STAFF)
    # status replaces the old is_active boolean for finer control
    status          = Column(String(20), default=UserStatus.ACTIVE)
    is_active       = Column(Boolean, default=True)   # kept for backwards-compat
    last_login      = Column(DateTime(timezone=False))
    created_at      = Column(DateTime(timezone=False), server_default=func.now())
    updated_at      = Column(DateTime(timezone=False), onupdate=func.now())
