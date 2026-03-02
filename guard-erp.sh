#!/bin/bash
# guard-erp.sh — GUARDIAN DEL ERP
# Compara egglogu.html contra el backup locked
# Solo permite diferencias en la línea CSP (meta http-equiv Content-Security-Policy)
# Si hay CUALQUIER otro cambio → BLOQUEA y alerta

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

LOCKED="live/egglogu.html.bak.20260301_locked"
CURRENT="egglogu.html"
LIVE="live/egglogu.html"

if [ ! -f "$LOCKED" ]; then
  echo -e "${RED}FATAL: Backup locked no encontrado: $LOCKED${NC}"
  exit 1
fi

ERRORS=0

check_file() {
  local FILE="$1"
  local LABEL="$2"

  if [ ! -f "$FILE" ]; then
    echo -e "${YELLOW}SKIP: $FILE no existe${NC}"
    return
  fi

  # Diff excluyendo la línea CSP
  local DIFF=$(diff \
    <(grep -v 'Content-Security-Policy' "$FILE") \
    <(grep -v 'Content-Security-Policy' "$LOCKED") \
  )

  if [ -z "$DIFF" ]; then
    echo -e "${GREEN}✅ $LABEL — INTACTO (idéntico al locked excepto CSP)${NC}"
  else
    echo -e "${RED}❌ ALERTA: $LABEL MODIFICADO FUERA DEL CSP${NC}"
    echo -e "${RED}Diferencias encontradas:${NC}"
    echo "$DIFF" | head -30
    echo ""
    echo -e "${YELLOW}Líneas diferentes: $(echo "$DIFF" | grep -c '^[<>]')${NC}"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "========================================="
echo "  GUARDIAN ERP — Verificación de Integridad"
echo "  Backup de referencia: $LOCKED"
echo "========================================="
echo ""

check_file "$CURRENT" "egglogu.html (raíz)"
check_file "$LIVE" "live/egglogu.html"

echo ""

# Verificar que root y live son iguales entre sí
if [ -f "$CURRENT" ] && [ -f "$LIVE" ]; then
  if diff -q "$CURRENT" "$LIVE" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ root ↔ live — SINCRONIZADOS${NC}"
  else
    echo -e "${RED}❌ root ↔ live — DESINCRONIZADOS${NC}"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}=========================================${NC}"
  echo -e "${RED}  ❌ FALLO: $ERRORS problemas detectados${NC}"
  echo -e "${RED}  RESTAURAR: cp $LOCKED egglogu.html && bash auto-csp-hash.sh${NC}"
  echo -e "${RED}=========================================${NC}"
  exit 1
else
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}  ✅ ERP BLINDADO — Todo intacto${NC}"
  echo -e "${GREEN}=========================================${NC}"
  exit 0
fi
