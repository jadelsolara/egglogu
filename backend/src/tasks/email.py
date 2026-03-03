"""Async email tasks via Celery.

Moves email sending out of the request path for better response times.
Uses Resend API for delivery.
"""

import logging

from src.worker import app

logger = logging.getLogger("egglogu.tasks.email")


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_verification_email(self, to_email: str, verification_url: str, lang: str = "en"):
    """Send email verification link."""
    try:
        from src.core.email import send_email_sync

        subject = {
            "en": "Verify your EGGlogU account",
            "es": "Verifica tu cuenta de EGGlogU",
        }.get(lang, "Verify your EGGlogU account")

        send_email_sync(
            to=to_email,
            subject=subject,
            html=f'<p>Click to verify: <a href="{verification_url}">{verification_url}</a></p>',
        )
        logger.info("Verification email sent to %s", to_email)
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", to_email, exc)
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_password_reset_email(self, to_email: str, reset_url: str, lang: str = "en"):
    """Send password reset link."""
    try:
        from src.core.email import send_email_sync

        subject = {
            "en": "Reset your EGGlogU password",
            "es": "Restablecer tu contraseña de EGGlogU",
        }.get(lang, "Reset your EGGlogU password")

        send_email_sync(
            to=to_email,
            subject=subject,
            html=f'<p>Reset your password: <a href="{reset_url}">{reset_url}</a></p>',
        )
        logger.info("Password reset email sent to %s", to_email)
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", to_email, exc)
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_team_invite_email(self, to_email: str, invite_url: str, org_name: str, lang: str = "en"):
    """Send team invitation email."""
    try:
        from src.core.email import send_email_sync

        subject = {
            "en": f"You're invited to join {org_name} on EGGlogU",
            "es": f"Te invitan a unirte a {org_name} en EGGlogU",
        }.get(lang, f"You're invited to join {org_name} on EGGlogU")

        send_email_sync(
            to=to_email,
            subject=subject,
            html=f'<p>Join {org_name}: <a href="{invite_url}">{invite_url}</a></p>',
        )
        logger.info("Team invite email sent to %s for org %s", to_email, org_name)
    except Exception as exc:
        logger.error("Failed to send team invite to %s: %s", to_email, exc)
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_alert_email(self, to_email: str, subject: str, body_html: str):
    """Send generic alert email (health alerts, threshold breaches, etc.)."""
    try:
        from src.core.email import send_email_sync
        send_email_sync(to=to_email, subject=subject, html=body_html)
        logger.info("Alert email sent to %s: %s", to_email, subject)
    except Exception as exc:
        logger.error("Failed to send alert email to %s: %s", to_email, exc)
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def send_new_device_alert(self, to_email: str, device_info: dict, lang: str = "en"):
    """Send new device login alert."""
    try:
        from src.core.email import send_email_sync

        subject = {
            "en": "New device login detected - EGGlogU",
            "es": "Nuevo inicio de sesión detectado - EGGlogU",
        }.get(lang, "New device login detected - EGGlogU")

        ip = device_info.get("ip", "unknown")
        ua = device_info.get("user_agent", "unknown")
        send_email_sync(
            to=to_email,
            subject=subject,
            html=f"<p>New login from IP: {ip}<br>Device: {ua}</p>",
        )
        logger.info("New device alert sent to %s", to_email)
    except Exception as exc:
        logger.error("Failed to send new device alert to %s: %s", to_email, exc)
        raise self.retry(exc=exc)
