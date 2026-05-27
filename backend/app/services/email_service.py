"""
Email service — sends OTP codes via SMTP.

Supports:
  • Office 365 / Outlook  (smtp.office365.com:587)
  • Gmail                 (smtp.gmail.com:587)
  • Any STARTTLS SMTP server

DEV MODE (SMTP_USER or SMTP_PASSWORD not set):
  → Logs OTP to console in a visible banner.
  → Returns True so the frontend flow continues normally.
  → The /forgot-password endpoint also includes `dev_otp` in its JSON response
    so the ForgotPassword page can display the code directly in the UI.
"""
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr
from app.core.config import settings

logger = logging.getLogger(__name__)


def _raw_email(addr: str) -> str:
    """Extract bare email from 'Name <email>' format."""
    _, raw = parseaddr(addr)
    return raw or addr


def _build_otp_email(to_email: str, otp: str, full_name: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Thirdwave IMS] Your Password Reset Code: {otp}"
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = to_email

    plain = (
        f"Thirdwave Investment Management System\n"
        f"{'─'*40}\n\n"
        f"Hello {full_name},\n\n"
        f"Your password reset code is:\n\n"
        f"    {otp}\n\n"
        f"This code expires in {settings.OTP_EXPIRE_MINUTES} minutes.\n\n"
        f"If you did not request this, please ignore this email.\n\n"
        f"{'─'*40}\n"
        f"Thirdwave Financial Inc. · Investment Management Platform\n"
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:48px 20px;">
  <table width="520" cellpadding="0" cellspacing="0" border="0"
         style="background:#ffffff;border-radius:16px;overflow:hidden;
                box-shadow:0 4px 24px rgba(0,0,0,0.10);">

    <!-- Header -->
    <tr><td style="background:#0d1a3a;padding:32px 40px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr>
          <td style="vertical-align:middle;padding-right:12px;">
            <img src="https://marketplace.intel.com/file-asset/a5Q3b0000006DOdEAM_a5S3b0000016NjFEAU"
                 alt="Thirdwave" height="36" style="display:block;" />
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;letter-spacing:1px;
                text-transform:uppercase;">Investment Management System</p>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:40px 40px 28px;">
      <p style="margin:0 0 6px;color:#1e293b;font-size:16px;font-weight:600;">
        Hello {full_name},
      </p>
      <p style="margin:0 0 28px;color:#64748b;font-size:14px;line-height:1.7;">
        We received a request to reset your Thirdwave IMS password.<br>
        Use the verification code below to continue:
      </p>

      <!-- OTP Box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:0 0 28px;">
        <tr><td style="background:#f1f5ff;border:2px solid #c7d7fd;
                       border-radius:14px;padding:32px 20px;text-align:center;">
          <p style="margin:0 0 8px;color:#4f46e5;font-size:11px;font-weight:700;
                    letter-spacing:3px;text-transform:uppercase;">Your Reset Code</p>
          <p style="margin:0;color:#0f172a;font-size:48px;font-weight:900;
                    letter-spacing:14px;font-family:'Courier New',Courier,monospace;">
            {otp}
          </p>
        </td></tr>
      </table>

      <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;text-align:center;">
        ⏱&nbsp; Expires in <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong>
      </p>
      <p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">
        Didn't request this? You can safely ignore this email.
      </p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                   padding:18px 40px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
        Thirdwave Financial Inc.&nbsp;·&nbsp;Investment Management Platform<br>
        This is an automated message — please do not reply.
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>"""

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html,  "html"))
    return msg


def _build_admin_notification_email(
    admin_email: str,
    new_user_name: str,
    new_user_email: str,
) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Thirdwave IMS] New User Pending Approval: {new_user_name}"
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = admin_email

    plain = (
        f"Thirdwave Investment Management System\n"
        f"{'─'*40}\n\n"
        f"A new user has registered and is awaiting your approval.\n\n"
        f"  Name  : {new_user_name}\n"
        f"  Email : {new_user_email}\n\n"
        f"Please log in to the IMS and approve or reject this account.\n\n"
        f"{'─'*40}\n"
        f"Thirdwave Financial Inc. · Investment Management Platform\n"
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:48px 20px;">
  <table width="520" cellpadding="0" cellspacing="0" border="0"
         style="background:#ffffff;border-radius:16px;overflow:hidden;
                box-shadow:0 4px 24px rgba(0,0,0,0.10);">

    <!-- Header -->
    <tr><td style="background:#0d1a3a;padding:32px 40px;text-align:center;">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">Thirdwave IMS</p>
      <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;letter-spacing:1px;
                text-transform:uppercase;">New User Registration</p>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:40px 40px 28px;">
      <p style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600;">
        Action Required: New User Pending Approval
      </p>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.7;">
        A new user has self-registered and is waiting for your approval
        before they can access the system.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:0 0 28px;background:#f8fafc;border:1px solid #e2e8f0;
                    border-radius:12px;padding:20px;">
        <tr><td style="padding:8px 20px;">
          <p style="margin:0;color:#64748b;font-size:12px;font-weight:600;
                    text-transform:uppercase;letter-spacing:1px;">Name</p>
          <p style="margin:4px 0 0;color:#0f172a;font-size:15px;font-weight:600;">
            {new_user_name}
          </p>
        </td></tr>
        <tr><td style="padding:8px 20px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#64748b;font-size:12px;font-weight:600;
                    text-transform:uppercase;letter-spacing:1px;">Email</p>
          <p style="margin:4px 0 0;color:#0f172a;font-size:15px;">{new_user_email}</p>
        </td></tr>
      </table>

      <p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">
        Log in to the IMS → Users section to approve or reject this account.
      </p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                   padding:18px 40px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
        Thirdwave Financial Inc.&nbsp;·&nbsp;Investment Management Platform<br>
        This is an automated message — please do not reply.
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>"""

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html,  "html"))
    return msg


def send_admin_notification_email(
    admin_email: str,
    new_user_name: str,
    new_user_email: str,
) -> bool:
    """
    Notify the admin that a new user has registered and needs approval.
    Returns True on success (or in DEV mode), False on failure.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning(
            "\n"
            + "═" * 56 + "\n"
            + f"  [DEV MODE] New user pending approval\n"
            + f"  Name  : {new_user_name}\n"
            + f"  Email : {new_user_email}\n"
            + "  Configure SMTP_USER + SMTP_PASSWORD to send real emails.\n"
            + "═" * 56
        )
        return True

    try:
        msg = _build_admin_notification_email(admin_email, new_user_name, new_user_email)
        from_addr = _raw_email(settings.SMTP_FROM) or settings.SMTP_USER

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(from_addr, [admin_email], msg.as_string())

        logger.info(f"Admin notification sent to {admin_email} for new user {new_user_email}")
        return True

    except Exception as exc:
        logger.error(f"Failed to send admin notification: {exc}")
        return False


def send_otp_email(to_email: str, otp: str, full_name: str = "User") -> bool:
    """
    Send an OTP email.
    Returns True on success, False on failure.
    In DEV MODE (no SMTP credentials) logs OTP to console and returns True.
    """
    # ─── DEV MODE ────────────────────────────────────────────────────────────
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning(
            "\n"
            + "═" * 56 + "\n"
            + f"  [DEV MODE] Password Reset OTP for {to_email}\n"
            + f"  Code : {otp}\n"
            + f"  Valid: {settings.OTP_EXPIRE_MINUTES} minutes\n"
            + "  Configure SMTP_USER + SMTP_PASSWORD in .env\n"
            + "  to send real emails via Outlook or Gmail.\n"
            + "═" * 56
        )
        return True   # Let the frontend flow continue; OTP is in the API response

    # ─── REAL SMTP SEND ──────────────────────────────────────────────────────
    try:
        msg = _build_otp_email(to_email, otp, full_name)
        # Use raw email addr for SMTP envelope (NOT "Name <email>")
        from_addr = _raw_email(settings.SMTP_FROM) or settings.SMTP_USER

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(from_addr, [to_email], msg.as_string())

        logger.info(f"OTP email sent to {to_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed. "
            "For Gmail: use an App Password (not your regular password). "
            "For Office 365: ensure SMTP AUTH is enabled for the account."
        )
        return False
    except Exception as exc:
        logger.error(f"Failed to send OTP email to {to_email}: {exc}")
        return False
