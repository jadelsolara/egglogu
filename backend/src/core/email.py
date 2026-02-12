import secrets

import httpx

from src.config import settings


def generate_token() -> str:
    return secrets.token_urlsafe(32)


async def _send_email(to: str, subject: str, html: str) -> None:
    if not settings.RESEND_API_KEY:
        return
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={
                "from": f"EGGlogU <noreply@{settings.EMAIL_FROM_DOMAIN}>",
                "to": [to],
                "subject": subject,
                "html": html,
            },
        )


async def send_verification_email(email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#2563eb">Bienvenido a EGGlogU 360</h2>
      <p>Confirma tu email haciendo clic en el siguiente enlace:</p>
      <a href="{link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Verificar Email
      </a>
      <p style="color:#666;font-size:13px">Si no creaste esta cuenta, ignora este mensaje.</p>
    </div>
    """
    await _send_email(email, "Verifica tu email — EGGlogU", html)


async def send_password_reset(email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#2563eb">Restablecer contraseña</h2>
      <p>Haz clic en el enlace para cambiar tu contraseña:</p>
      <a href="{link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Restablecer Contraseña
      </a>
      <p style="color:#666;font-size:13px">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este mensaje.</p>
    </div>
    """
    await _send_email(email, "Restablecer contraseña — EGGlogU", html)


async def send_welcome(email: str, name: str) -> None:
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#2563eb">¡Bienvenido, {name}!</h2>
      <p>Tu cuenta en EGGlogU 360 está lista. Empieza a gestionar tu granja de forma profesional.</p>
      <a href="{settings.FRONTEND_URL}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Ir a EGGlogU
      </a>
    </div>
    """
    await _send_email(email, f"Bienvenido a EGGlogU, {name}", html)
