import re
import secrets

import httpx

from src.config import settings
from src.core.email_archive import archive_email


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html).strip()


async def _send_email(
    to: str, subject: str, html: str, tipo: str = "respuesta"
) -> None:
    archive_email(tipo, to, subject, _strip_html(html))
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
    link = f"{settings.FRONTEND_URL}/egglogu.html?verify={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#2563eb">Bienvenido a EGGlogU 360</h2>
      <p>Confirma tu email haciendo clic en el siguiente enlace:</p>
      <a href="{link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Verificar Email
      </a>
      <p style="color:#666;font-size:13px">Si no creaste esta cuenta, ignora este mensaje.</p>
      <p style="color:#999;font-size:11px">Si el botón no funciona, copia este enlace: {link}</p>
    </div>
    """
    await _send_email(email, "Verifica tu email — EGGlogU", html, tipo="verificacion")


async def send_password_reset(email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/egglogu.html?reset={token}"
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
    await _send_email(
        email, "Restablecer contraseña — EGGlogU", html, tipo="recuperacion"
    )


async def send_team_invite(
    email: str, member_name: str, role: str, org_name: str, invited_by: str
) -> None:
    link = f"{settings.FRONTEND_URL}/egglogu.html"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#2563eb">Te han invitado a EGGlogU 360</h2>
      <p><strong>{invited_by}</strong> te ha agregado como <strong>{role}</strong> en la organización <strong>{org_name}</strong>.</p>
      <p>Para acceder a la plataforma, haz clic en el siguiente enlace:</p>
      <a href="{link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Acceder a EGGlogU
      </a>
      <p style="color:#666;font-size:13px">Si no reconoces esta invitación, ignora este mensaje.</p>
    </div>
    """
    await _send_email(
        email, f"{invited_by} te invitó a EGGlogU 360", html, tipo="invitacion"
    )


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
    await _send_email(email, f"Bienvenido a EGGlogU, {name}", html, tipo="bienvenida")
