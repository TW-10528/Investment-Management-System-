"""User management — admin only."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, hash_password
from app.models.user import User, UserRole, UserStatus
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

router = APIRouter()

MAX_ACTIVE_USERS = 10


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email        : EmailStr
    full_name    : str
    full_name_jp : Optional[str] = None
    password     : str
    role         : UserRole = UserRole.FINANCE_STAFF


class UserUpdate(BaseModel):
    full_name    : Optional[str]      = None
    full_name_jp : Optional[str]      = None
    role         : Optional[UserRole] = None
    is_active    : Optional[bool]     = None
    password     : Optional[str]      = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_dict(u: User) -> dict:
    return {
        "id"          : str(u.id),
        "email"       : u.email,
        "full_name"   : u.full_name,
        "full_name_jp": u.full_name_jp,
        "role"        : u.role,
        "status"      : u.status,
        "is_active"   : u.is_active,
        "last_login"  : str(u.last_login)  if u.last_login  else None,
        "created_at"  : str(u.created_at)  if u.created_at  else None,
    }


def _require_admin(current_user) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Admin access required.")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/pending-count")
def pending_count(
    db           : Session = Depends(get_db),
    current_user           = Depends(get_current_user),
):
    """Return the count of users awaiting approval (admin only)."""
    _require_admin(current_user)
    count = db.query(User).filter(User.status == UserStatus.PENDING).count()
    return {"count": count}


@router.get("/")
def list_users(
    db           : Session = Depends(get_db),
    current_user           = Depends(get_current_user),
):
    """List ALL users (active + pending + inactive) — admin only."""
    _require_admin(current_user)
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [_user_dict(u) for u in users]


@router.post("/")
def create_user(
    body         : UserCreate,
    db           : Session = Depends(get_db),
    current_user           = Depends(get_current_user),
):
    """Admin creates a user directly (immediately active, any role)."""
    _require_admin(current_user)

    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already registered.")

    active_count = db.query(User).filter(User.status == UserStatus.ACTIVE).count()
    if active_count >= MAX_ACTIVE_USERS:
        raise HTTPException(
            400,
            f"System limit of {MAX_ACTIVE_USERS} active users reached. "
            "Deactivate a user before adding a new one.",
        )

    db_user = User(
        email           = body.email,
        full_name       = body.full_name,
        full_name_jp    = body.full_name_jp,
        hashed_password = hash_password(body.password),
        role            = body.role,
        status          = UserStatus.ACTIVE,
        is_active       = True,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return _user_dict(db_user)


@router.post("/{user_id}/approve")
def approve_user(
    user_id      : str,
    role         : Optional[UserRole] = Query(default=None, description="Role to assign on approval"),
    db           : Session = Depends(get_db),
    current_user           = Depends(get_current_user),
):
    """Approve a pending user — grants login access. Optionally assign role during approval."""
    _require_admin(current_user)
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(404, "User not found.")
    if user.status != UserStatus.PENDING:
        raise HTTPException(400, f"User is not pending (current status: {user.status}).")

    # Enforce hard cap before approving
    active_count = db.query(User).filter(User.status == UserStatus.ACTIVE).count()
    if active_count >= MAX_ACTIVE_USERS:
        raise HTTPException(
            400,
            f"Cannot approve: system already has {MAX_ACTIVE_USERS} active users. "
            "Deactivate another user first.",
        )

    user.status    = UserStatus.ACTIVE
    user.is_active = True
    if role is not None:
        user.role = role  # Admin assigns role during approval
    db.commit()
    db.refresh(user)
    return {"message": f"{user.full_name} approved and can now log in.", **_user_dict(user)}


@router.post("/{user_id}/reject")
def reject_user(
    user_id      : str,
    db           : Session = Depends(get_db),
    current_user           = Depends(get_current_user),
):
    """Reject a pending user registration."""
    _require_admin(current_user)
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(404, "User not found.")
    if user.status != UserStatus.PENDING:
        raise HTTPException(400, "User is not pending.")

    user.status    = UserStatus.INACTIVE
    user.is_active = False
    db.commit()
    return {"message": f"{user.full_name}'s registration has been rejected."}


@router.put("/{user_id}")
def update_user(
    user_id      : str,
    body         : UserUpdate,
    db           : Session = Depends(get_db),
    current_user           = Depends(get_current_user),
):
    """Update user details — admin only."""
    _require_admin(current_user)
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(404, "User not found.")

    if body.full_name    is not None: user.full_name    = body.full_name
    if body.full_name_jp is not None: user.full_name_jp = body.full_name_jp
    if body.role         is not None: user.role         = body.role
    if body.is_active    is not None:
        user.is_active = body.is_active
        user.status    = UserStatus.ACTIVE if body.is_active else UserStatus.INACTIVE
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters.")
        user.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return _user_dict(user)


@router.delete("/{user_id}")
def deactivate_user(
    user_id      : str,
    db           : Session = Depends(get_db),
    current_user           = Depends(get_current_user),
):
    """Deactivate (soft-delete) a user — admin only."""
    _require_admin(current_user)
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(404, "User not found.")
    if str(user.id) == str(current_user.id):
        raise HTTPException(400, "You cannot deactivate your own account.")
    user.is_active = False
    user.status    = UserStatus.INACTIVE
    db.commit()
    return {"message": f"{user.email} deactivated."}
