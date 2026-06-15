"""
Email sending for Szól.

Two backends are supported — whichever is configured is used:
  Gmail SMTP  — set GMAIL_USER + GMAIL_APP_PASSWORD (free, 500/day)
  Resend API  — set RESEND_API_KEY + RESEND_FROM (requires custom domain)

If neither is configured, sending is skipped and new users are auto-verified.
"""
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests

from .config import settings

log = logging.getLogger(__name__)


def _send_via_gmail(to_email: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Szól <{settings.GMAIL_USER}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as server:
        server.login(settings.GMAIL_USER, settings.GMAIL_APP_PASSWORD)
        server.sendmail(settings.GMAIL_USER, to_email, msg.as_string())


def _send_via_resend(to_email: str, subject: str, html: str) -> None:
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json={"from": settings.RESEND_FROM, "to": [to_email], "subject": subject, "html": html},
        timeout=10,
    )
    if resp.status_code not in (200, 201):
        log.error("Resend error %s: %s", resp.status_code, resp.text)


def send_verification_email(to_email: str, username: str, token: str) -> None:
    verify_url = f"{settings.BACKEND_URL}/users/verify-email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#16a34a">Verify your Sz&#xF3;l account</h2>
      <p>Hi {username},</p>
      <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
      <a href="{verify_url}"
         style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;
                text-decoration:none;border-radius:6px;font-weight:600">
        Verify email
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">
        If you didn&apos;t create a Sz&#xF3;l account, you can safely ignore this email.
      </p>
    </div>
    """
    subject = "Verify your Szól account"
    try:
        if settings.GMAIL_USER and settings.GMAIL_APP_PASSWORD:
            _send_via_gmail(to_email, subject, html)
        elif settings.RESEND_API_KEY:
            _send_via_resend(to_email, subject, html)
        else:
            log.warning("No email sender configured — skipping verification email")
    except Exception as exc:
        log.error("Failed to send verification email to %s: %s", to_email, exc)
