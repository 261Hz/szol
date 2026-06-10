"""
Email sending via Resend (https://resend.com).
Set RESEND_API_KEY and RESEND_FROM in your environment.
"""
import logging
import requests
from .config import settings

log = logging.getLogger(__name__)


def send_verification_email(to_email: str, username: str, token: str) -> None:
    """Send the account verification email. Logs and swallows errors so a
    transient email failure never blocks registration."""
    if not settings.RESEND_API_KEY:
        log.warning("RESEND_API_KEY not set — skipping verification email")
        return

    verify_url = f"{settings.BACKEND_URL}/users/verify-email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#16a34a">Verify your Szol account</h2>
      <p>Hi {username},</p>
      <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
      <a href="{verify_url}"
         style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;
                text-decoration:none;border-radius:6px;font-weight:600">
        Verify email
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">
        If you didn't create a Szol account, you can safely ignore this email.
      </p>
    </div>
    """
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={
                "from":    settings.RESEND_FROM,
                "to":      [to_email],
                "subject": "Verify your Szol account",
                "html":    html,
            },
            timeout=10,
        )
        if resp.status_code not in (200, 201):
            log.error("Resend error %s: %s", resp.status_code, resp.text)
    except Exception as exc:
        log.error("Failed to send verification email: %s", exc)
