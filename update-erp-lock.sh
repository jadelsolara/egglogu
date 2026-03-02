#!/bin/bash
# update-erp-lock.sh — ÚNICO método autorizado para actualizar el locked backup
# Requiere confirmación interactiva del usuario (no funciona desde scripts)

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CURRENT="egglogu.html"
LOCK_HASH_FILE=".erp-lock-sha256"

# Detectar el locked backup más reciente
LOCKED=$(ls -t live/egglogu.html.bak.*_locked 2>/dev/null | head -1)

if [ -z "$LOCKED" ]; then
  echo -e "${RED}FATAL: No se encontró ningún backup locked en live/${NC}"
  exit 1
fi

# Verificar que estamos en terminal interactiva (no script/pipe)
if [ ! -t 0 ]; then
  echo -e "${RED}FATAL: Este script solo funciona en terminal interactiva${NC}"
  echo -e "${RED}No se puede ejecutar desde otro script, pipe, o redirección${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  ACTUALIZACIÓN DE LOCKED BACKUP${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "  Backup actual: ${GREEN}$LOCKED${NC}"
echo -e "  Fuente:        ${GREEN}$CURRENT${NC}"
echo ""

# Mostrar diferencias
DIFF=$(diff \
  <(grep -v 'Content-Security-Policy' "$CURRENT") \
  <(grep -v 'Content-Security-Policy' "$LOCKED") || true)

if [ -z "$DIFF" ]; then
  echo -e "${GREEN}No hay diferencias (excepto CSP). ¿Seguro que necesitas actualizar?${NC}"
else
  echo "Diferencias (excluyendo CSP):"
  echo "$DIFF" | head -30
  echo ""
  DIFF_LINES=$(echo "$DIFF" | grep -c '^[<>]' || true)
  echo -e "${YELLOW}Total líneas diferentes: $DIFF_LINES${NC}"
fi

echo ""
echo -e "${RED}⚠️  ADVERTENCIA: Esta acción reemplaza el backup de referencia del ERP.${NC}"
echo -e "${RED}   El guardian usará el nuevo backup para validar integridad.${NC}"
echo ""

# Fecha para el nuevo locked backup
TODAY=$(date +%Y%m%d)
NEW_LOCKED="live/egglogu.html.bak.${TODAY}_locked"

echo -e "Nuevo backup será: ${GREEN}$NEW_LOCKED${NC}"
echo ""
echo -n "Escribe ACTUALIZAR para confirmar: "
read -r CONFIRM

if [ "$CONFIRM" != "ACTUALIZAR" ]; then
  echo ""
  echo -e "${YELLOW}Cancelado. No se realizaron cambios.${NC}"
  exit 0
fi

# Crear nuevo locked backup
cp "$CURRENT" "$NEW_LOCKED"
echo ""
echo -e "${GREEN}✅ Backup creado: $NEW_LOCKED${NC}"

# Actualizar hash
NEW_SHA=$(sha256sum "$NEW_LOCKED")
echo "$NEW_SHA" > "$LOCK_HASH_FILE"
echo -e "${GREEN}✅ Hash actualizado en $LOCK_HASH_FILE${NC}"
echo "   $NEW_SHA"

# Actualizar referencia en guard-erp.sh
if grep -q 'LOCKED=' guard-erp.sh; then
  sed -i "s|^LOCKED=.*|LOCKED=\"$NEW_LOCKED\"|" guard-erp.sh
  echo -e "${GREEN}✅ guard-erp.sh actualizado con nuevo locked path${NC}"
fi

# Actualizar referencia en pre-commit hook
HOOK=".git/hooks/pre-commit"
if [ -f "$HOOK" ] && grep -q 'LOCKED=' "$HOOK"; then
  sed -i "s|LOCKED=.*|LOCKED=\"\$REPO_ROOT/$NEW_LOCKED\"|" "$HOOK"
  echo -e "${GREEN}✅ pre-commit hook actualizado con nuevo locked path${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ LOCKED BACKUP ACTUALIZADO EXITOSAMENTE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
