"""
Archivado local de correos EGGlogU.

Todo correo (contacto, ticket, verificación, bienvenida, recuperación,
invitaciones, respuestas) se guarda en subcarpetas de CORREOS_DIR.
Formato: {timestamp}_{email_sanitized}.txt
"""

import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from src.config import settings

logger = logging.getLogger(__name__)

SUBCARPETAS = {
    "contacto": "contacto",
    "ticket": "tickets",
    "verificacion": "verificacion",
    "bienvenida": "bienvenida",
    "recuperacion": "recuperacion",
    "invitacion": "invitaciones",
    "respuesta": "respuestas",
}


def _sanitize(text: str) -> str:
    return re.sub(r"[^\w\-.]", "_", text)[:80]


def _ensure_dir(subcarpeta: str) -> Path:
    path = Path(settings.CORREOS_DIR) / subcarpeta
    path.mkdir(parents=True, exist_ok=True)
    return path


def archive_email(
    tipo: str,
    to: str,
    subject: str,
    body: str,
    extra: dict | None = None,
) -> str | None:
    """Guarda una copia del correo en la subcarpeta correspondiente.

    Returns the file path on success, None on failure.
    """
    subcarpeta = SUBCARPETAS.get(tipo, tipo)
    try:
        directory = _ensure_dir(subcarpeta)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{ts}_{_sanitize(to)}.txt"
        filepath = directory / filename

        lines = [
            f"Fecha: {datetime.now(timezone.utc).isoformat()}",
            f"Tipo: {tipo}",
            f"Para: {to}",
            f"Asunto: {subject}",
        ]
        if extra:
            for k, v in extra.items():
                lines.append(f"{k}: {v}")
        lines.append("")
        lines.append("--- CONTENIDO ---")
        lines.append(body)

        filepath.write_text("\n".join(lines), encoding="utf-8")
        return str(filepath)
    except Exception:
        logger.exception("Failed to archive email tipo=%s to=%s", tipo, to)
        return None


def archive_lead(email: str, data: dict) -> str | None:
    """Archiva un lead/contacto capturado."""
    subject = f"Nuevo lead: {data.get('farm_name', 'Sin nombre')}"
    body_lines = [f"{k}: {v}" for k, v in data.items() if v]
    return archive_email("contacto", email, subject, "\n".join(body_lines))


def archive_ticket(
    ticket_number: str,
    user_email: str,
    subject: str,
    description: str,
    category: str,
    priority: str,
) -> str | None:
    """Archiva la creación de un ticket de soporte."""
    return archive_email(
        "ticket",
        user_email,
        f"[{ticket_number}] {subject}",
        description,
        extra={"Ticket": ticket_number, "Categoria": category, "Prioridad": priority},
    )


def archive_ticket_reply(
    ticket_number: str,
    from_email: str,
    message: str,
    is_admin: bool,
) -> str | None:
    """Archiva una respuesta en un ticket."""
    tipo = "respuesta" if is_admin else "ticket"
    return archive_email(
        tipo,
        from_email,
        f"[{ticket_number}] {'Admin' if is_admin else 'Usuario'} responde",
        message,
        extra={
            "Ticket": ticket_number,
            "Remitente": "admin" if is_admin else "usuario",
        },
    )
