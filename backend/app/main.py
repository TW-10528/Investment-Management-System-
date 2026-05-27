import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.database import engine, Base
from app.core.config import settings
from app.core.limiter import limiter
import app.models
from app.api.v1 import auth, funds, capital_calls, fx_rates, dashboard, distributions, users, notices

# Create all tables (including new ones)
Base.metadata.create_all(bind=engine)

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title   = "Investment Management System API",
    version = "1.0.0",
    docs_url= "/docs",
)

# ── Rate limiting ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:80",
        "https://yourdomain.com",
    ],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth.router,           prefix="/api/v1/auth",           tags=["Auth"])
app.include_router(funds.router,          prefix="/api/v1/funds",          tags=["Funds"])
app.include_router(capital_calls.router,  prefix="/api/v1/capital-calls",  tags=["Capital Calls"])
app.include_router(distributions.router,  prefix="/api/v1/distributions",  tags=["Distributions"])
app.include_router(fx_rates.router,       prefix="/api/v1/fx-rates",       tags=["FX Rates"])
app.include_router(dashboard.router,      prefix="/api/v1/dashboard",      tags=["Dashboard"])
app.include_router(users.router,          prefix="/api/v1/users",          tags=["Users"])
app.include_router(notices.router,        prefix="/api/v1/notices",        tags=["Notices"])


@app.get("/health")
def health():
    return {
        "status"     : "healthy",
        "environment": settings.ENVIRONMENT,
        "smtp_configured": bool(settings.SMTP_USER and settings.SMTP_PASSWORD),
    }
