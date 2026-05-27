from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME   : str  = "Thirdwave IMS"
    ENVIRONMENT: str  = "local"
    DEBUG      : bool = True

    DATABASE_URL: str = "sqlite:///./ims.db"
    SECRET_KEY  : str = "change-this-in-production-use-openssl-rand-hex-32"
    ALGORITHM   : str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    STORAGE_BACKEND   : str           = "local"
    LOCAL_STORAGE_PATH: str           = "./storage"
    AWS_S3_BUCKET     : Optional[str] = None
    AWS_REGION        : str           = "ap-northeast-1"

    # ── Email / OTP (Outlook / Office 365 or Gmail) ───────────────────────────
    # Leave SMTP_USER / SMTP_PASSWORD empty to run in DEV mode:
    #   → OTP is printed to console AND returned in the API response.
    # For Gmail: set SMTP_HOST=smtp.gmail.com  SMTP_PORT=587
    # For Outlook/O365: set SMTP_HOST=smtp.office365.com  SMTP_PORT=587
    SMTP_HOST    : str           = "smtp.office365.com"
    SMTP_PORT    : int           = 587
    SMTP_USER    : Optional[str] = None   # sender email e.g. noreply@thirdwave.co.jp
    SMTP_PASSWORD: Optional[str] = None   # app-password (NOT your regular login password)
    SMTP_FROM    : str           = "Thirdwave IMS <noreply@thirdwave.co.jp>"
    OTP_EXPIRE_MINUTES: int      = 10

    # ── Security / Login lockout ──────────────────────────────────────────────
    MAX_LOGIN_ATTEMPTS   : int  = 5    # failed attempts before lockout
    LOCKOUT_WINDOW_MINUTES: int = 10   # sliding window to count attempts (minutes)
    LOCKOUT_MINUTES      : int  = 15   # how long account stays locked (minutes)

    # ── For internal closed-system use: reveal when email is not found ────────
    # Set False for public-facing systems to prevent email enumeration.
    REVEAL_EMAIL_NOT_FOUND: bool = True

    # ── Admin notification ────────────────────────────────────────────────────
    # Set to the admin's email address to receive notifications when new users
    # self-register (status=pending) and need approval.
    ADMIN_EMAIL: Optional[str] = None

    # ── File upload storage ───────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"   # where uploaded PDFs are saved

    class Config:
        env_file       = ".env"
        case_sensitive = True


settings = Settings()
