"""
Authentication endpoints.

Login flow:
  - Only users with status='active' can log in.
  - status='pending' → needs admin approval.
  - status='inactive' → deactivated by admin.

Signup flow:
  - Public self-registration; new users get status='pending'.
  - Admin sees pending users in /users and can approve or reject.
  - Max 10 total active users in the system.

Security:
  - bcrypt passwords, JWT tokens (8h)
  - In-memory login-attempt tracker → account lockout after N failures
  - Rate limiting via slowapi
  - Crypto-secure OTP (secrets module)
"""
import secrets
import string
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, hash_password, get_current_user
from app.core.config import settings
from app.core.limiter import limiter
from app.models.user import User, UserRole, UserStatus
from app.models.otp import OtpToken
from app.services.email_service import send_otp_email, send_admin_notification_email
from pydantic import BaseModel, EmailStr
from typing import Optional

router = APIRouter()

MAX_ACTIVE_USERS = 10   # Hard cap on active users in the system


# ── Schemas ──────────────────────────────────────────────────────────────────

# Roles users are allowed to request during self-signup (admin is never self-assigned)
_SELF_SIGNUP_ROLES = {
    UserRole.USER,
    UserRole.BOARD_MEMBER,
    UserRole.FINANCE_STAFF,
    UserRole.FINANCE_MANAGER,
}


class SignupRequest(BaseModel):
    full_name   : str
    email       : EmailStr
    password    : str
    role        : UserRole = UserRole.USER   # user selects during signup


class UserCreate(BaseModel):
    email        : EmailStr
    full_name    : str
    full_name_jp : Optional[str] = None
    password     : str
    role         : UserRole = UserRole.USER


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp  : str


class ResetPasswordRequest(BaseModel):
    email       : EmailStr
    otp         : str
    new_password: str


# ── In-memory login-attempt tracker ─────────────────────────────────────────

_login_attempts: dict[str, list[datetime]] = defaultdict(list)


def _check_lockout(email: str) -> None:
    now          = datetime.utcnow()
    window_start = now - timedelta(minutes=settings.LOCKOUT_WINDOW_MINUTES)
    _login_attempts[email] = [t for t in _login_attempts[email] if t > window_start]
    if len(_login_attempts[email]) >= settings.MAX_LOGIN_ATTEMPTS:
        last         = _login_attempts[email][-1]
        lockout_until = last + timedelta(minutes=settings.LOCKOUT_MINUTES)
        if now < lockout_until:
            remaining = max(1, int((lockout_until - now).total_seconds() / 60) + 1)
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Try again in {remaining} minute(s).",
            )


def _record_failed(email: str) -> None:
    _login_attempts[email].append(datetime.utcnow())


def _clear_attempts(email: str) -> None:
    _login_attempts.pop(email, None)


# ── OTP helper ────────────────────────────────────────────────────────────────

def _generate_otp(length: int = 6) -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(length))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/signup")
@limiter.limit("5/minute")
def signup(request: Request, body: SignupRequest, db: Session = Depends(get_db)):
    """
    Public self-registration.
    New accounts get status='pending' — an admin must approve before login.
    Max 10 active users hard cap.
    """
    email = body.email.lower().strip()

    if not body.full_name.strip():
        raise HTTPException(400, "Full name is required.")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "An account with this email already exists.")

    # Password validation
    pw = body.password
    if len(pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    score = sum([
        len(pw) >= 8,
        any(c.isupper() for c in pw),
        any(c.isdigit() for c in pw),
        any(c in string.punctuation for c in pw),
    ])
    if score < 2:
        raise HTTPException(400, "Password is too weak. Use uppercase letters and numbers.")

    # Sanitize role — never allow self-assigning admin
    safe_role = body.role if body.role in _SELF_SIGNUP_ROLES else UserRole.USER

    db_user = User(
        email           = email,
        full_name       = body.full_name.strip(),
        hashed_password = hash_password(pw),
        role            = safe_role,               # requested role (admin confirms/changes on approval)
        status          = UserStatus.PENDING,   # awaiting admin approval
        is_active       = False,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # ── Notify admin of pending registration ─────────────────────────────────
    if settings.ADMIN_EMAIL:
        try:
            send_admin_notification_email(
                admin_email   = settings.ADMIN_EMAIL,
                new_user_name = db_user.full_name,
                new_user_email= db_user.email,
            )
        except Exception:
            pass  # Don't fail signup if notification fails
    else:
        # DEV: always log so admin knows
        send_admin_notification_email(
            admin_email    = "admin@thirdwave.co.jp",
            new_user_name  = db_user.full_name,
            new_user_email = db_user.email,
        )

    return {
        "message": (
            "Registration submitted successfully. "
            "Your account is pending administrator approval. "
            "You will be able to log in once approved."
        ),
        "email"    : db_user.email,
        "full_name": db_user.full_name,
        "status"   : db_user.status,
    }


@router.post("/login")
@limiter.limit("10/minute")
def login(
    request: Request,
    form   : OAuth2PasswordRequestForm = Depends(),
    db     : Session = Depends(get_db),
):
    email = form.username.lower().strip()
    _check_lockout(email)

    user = db.query(User).filter(User.email == email).first()

    # Wrong credentials
    if not user or not verify_password(form.password, user.hashed_password):
        _record_failed(email)
        left = max(0, settings.MAX_LOGIN_ATTEMPTS - len(_login_attempts[email]))
        detail = "Invalid email or password."
        if left <= 2:
            detail += f" {left} attempt(s) left before lockout."
        raise HTTPException(401, detail)

    # Account status checks
    if user.status == UserStatus.PENDING:
        raise HTTPException(
            403,
            "Your account is awaiting administrator approval. "
            "Please contact your administrator.",
        )
    if user.status == UserStatus.INACTIVE or not user.is_active:
        raise HTTPException(
            403,
            "Your account has been deactivated. Contact your administrator.",
        )

    # Success
    _clear_attempts(email)
    user.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({
        "sub" : user.email,
        "role": user.role,
        "name": user.full_name,
    })
    return {
        "access_token": token,
        "token_type"  : "bearer",
        "role"        : user.role,
        "name"        : user.full_name,
        "email"       : user.email,
    }


@router.get("/me")
def get_me(current_user = Depends(get_current_user)):
    return {
        "email"       : current_user.email,
        "role"        : current_user.role,
        "name"        : current_user.full_name,
        "full_name_jp": current_user.full_name_jp,
        "last_login"  : str(current_user.last_login) if current_user.last_login else None,
    }


@router.post("/register")
def register(
    user        : UserCreate,
    db          : Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """Admin-only: create a user with any role (bypasses pending flow)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Admin access required.")
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(400, "Email already registered.")
    if len(user.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    db_user = User(
        email           = user.email,
        full_name       = user.full_name,
        full_name_jp    = user.full_name_jp,
        hashed_password = hash_password(user.password),
        role            = user.role,
        status          = UserStatus.ACTIVE,
        is_active       = True,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"message": "User created.", "email": db_user.email, "role": db_user.role}


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    body   : ForgotPasswordRequest,
    db     : Session = Depends(get_db),
):
    email = body.email.lower().strip()
    user  = db.query(User).filter(
        User.email  == email,
        User.status == UserStatus.ACTIVE,
    ).first()

    if not user:
        if settings.REVEAL_EMAIL_NOT_FOUND:
            raise HTTPException(
                404,
                "No active account found with that email. "
                "Contact your administrator.",
            )
        return {"message": "If that email exists, an OTP has been sent."}

    # Invalidate old OTPs
    db.query(OtpToken).filter(
        OtpToken.email == email,
        OtpToken.used  == False,
    ).update({"used": True})
    db.commit()

    otp        = _generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
    db.add(OtpToken(email=email, token=otp, expires_at=expires_at))
    db.commit()

    sent = send_otp_email(email, otp, user.full_name or "User")
    if not sent:
        raise HTTPException(503, "Could not send email. Contact your administrator.")

    response: dict = {
        "message": (
            f"OTP sent to {email}. "
            f"Valid for {settings.OTP_EXPIRE_MINUTES} minutes."
        ),
    }
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        response["dev_mode"] = True
        response["dev_otp"]  = otp
    return response


@router.post("/verify-otp")
def verify_otp(body: VerifyOtpRequest, db: Session = Depends(get_db)):
    now    = datetime.utcnow()
    record = db.query(OtpToken).filter(
        OtpToken.email      == body.email.lower().strip(),
        OtpToken.token      == body.otp,
        OtpToken.used       == False,
        OtpToken.expires_at > now,
    ).first()
    if not record:
        raise HTTPException(400, "Invalid or expired code. Request a new one.")
    return {"valid": True}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    now    = datetime.utcnow()
    record = db.query(OtpToken).filter(
        OtpToken.email      == body.email.lower().strip(),
        OtpToken.token      == body.otp,
        OtpToken.used       == False,
        OtpToken.expires_at > now,
    ).first()
    if not record:
        raise HTTPException(400, "Invalid or expired code.")

    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user:
        raise HTTPException(404, "User not found.")

    pw = body.new_password
    if len(pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    score = sum([len(pw) >= 8, any(c.isupper() for c in pw),
                 any(c.isdigit() for c in pw), any(c in string.punctuation for c in pw)])
    if score < 2:
        raise HTTPException(400, "Password too weak. Use uppercase letters and numbers.")

    user.hashed_password = hash_password(pw)
    record.used          = True
    db.commit()
    return {"message": "Password reset successfully. You can now sign in."}
