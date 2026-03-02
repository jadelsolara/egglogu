#!/bin/bash
# Verifica que los archivos críticos del ERP no fueron alterados
cd "$(dirname "$0")"
echo "=== EGGlogU ERP Integrity Check ==="
if sha256sum -c checksums-erp.sha256 --quiet 2>/dev/null; then
  echo "✅ ERP INTACTO — egglogu.html y egglogu.js sin cambios"
  exit 0
else
  echo "❌ ALERTA: Archivos ERP modificados!"
  sha256sum -c checksums-erp.sha256 2>&1
  exit 1
fi
