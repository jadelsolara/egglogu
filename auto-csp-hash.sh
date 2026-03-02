#!/bin/bash
# auto-csp-hash.sh — Recalcula automáticamente el CSP SHA-256 hash
# Se ejecuta automáticamente via pre-commit hook o manualmente
# Protege que el CSS del ERP nunca se rompa por hash desactualizado

set -e
cd "$(dirname "$0")"

FILE="egglogu.html"
LIVE_FILE="live/egglogu.html"

if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE no encontrado"
  exit 1
fi

# Extraer el <style> y calcular SHA-256
NEW_HASH=$(python3 -c "
import hashlib, base64, re
html = open('$FILE').read()
match = re.search(r'<style>(.*?)</style>', html, re.S)
if not match:
    print('ERROR')
    exit(1)
style = match.group(1)
digest = hashlib.sha256(style.encode()).digest()
print('sha256-' + base64.b64encode(digest).decode())
")

if [ "$NEW_HASH" = "ERROR" ]; then
  echo "ERROR: No se encontró <style> en $FILE"
  exit 1
fi

# Extraer hash actual del CSP
CURRENT_HASH=$(grep -oP "style-src[^;]*sha256-[A-Za-z0-9+/=]+" "$FILE" | grep -oP "sha256-[A-Za-z0-9+/=]+")

if [ "$NEW_HASH" = "$CURRENT_HASH" ]; then
  echo "CSP hash OK — sin cambios necesarios ($NEW_HASH)"
else
  echo "CSP hash DESACTUALIZADO"
  echo "  Anterior: $CURRENT_HASH"
  echo "  Nuevo:    $NEW_HASH"

  # Reemplazar hash en el CSP meta tag
  sed -i "s|$CURRENT_HASH|$NEW_HASH|g" "$FILE"

  # Asegurar que unsafe-inline esté presente
  if ! grep -q "'unsafe-inline'" "$FILE"; then
    sed -i "s|style-src 'self'|style-src 'self' 'unsafe-inline'|" "$FILE"
  fi

  echo "  CSP actualizado en $FILE"

  # Re-stage si estamos en contexto de git commit
  git add "$FILE" 2>/dev/null || true
fi

# Sincronizar a live/
if [ -f "$LIVE_FILE" ]; then
  if ! diff -q "$FILE" "$LIVE_FILE" > /dev/null 2>&1; then
    cp "$FILE" "$LIVE_FILE"
    echo "  Sincronizado: $FILE → $LIVE_FILE"
    git add "$LIVE_FILE" 2>/dev/null || true
  else
    echo "  live/ ya sincronizado"
  fi
fi

# Actualizar checksums si cambiaron
if [ -f "checksums-erp.sha256" ]; then
  sha256sum egglogu.html egglogu.js > checksums-erp.sha256 2>/dev/null
  git add checksums-erp.sha256 2>/dev/null || true
  echo "  checksums-erp.sha256 actualizado"
fi

echo "=== CSP Auto-Hash: COMPLETADO ==="
