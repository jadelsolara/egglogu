#!/bin/bash
# restore-checkpoint.sh — Restaurar ERP desde un checkpoint
# Uso: bash restore-checkpoint.sh [timestamp]
# Sin argumento: restaura el último checkpoint

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

CHECKPOINT_DIR=".erp-checkpoints"

if [ -z "$1" ]; then
  if [ -f "${CHECKPOINT_DIR}/.latest" ]; then
    TIMESTAMP=$(cat "${CHECKPOINT_DIR}/.latest")
  else
    echo -e "${RED}Error: No hay checkpoint reciente. Especifica un timestamp.${NC}"
    echo "Checkpoints disponibles:"
    ls -d ${CHECKPOINT_DIR}/20* 2>/dev/null | sed 's|.*/||'
    exit 1
  fi
else
  TIMESTAMP="$1"
fi

CHECKPOINT_PATH="${CHECKPOINT_DIR}/${TIMESTAMP}"

if [ ! -d "$CHECKPOINT_PATH" ]; then
  echo -e "${RED}Error: Checkpoint $TIMESTAMP no encontrado.${NC}"
  echo "Checkpoints disponibles:"
  ls -d ${CHECKPOINT_DIR}/20* 2>/dev/null | sed 's|.*/||'
  exit 1
fi

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  AFP — RESTAURAR CHECKPOINT                   ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Checkpoint: ${YELLOW}${TIMESTAMP}${NC}"
echo ""

# Verificar integridad del checkpoint
if [ -f "${CHECKPOINT_PATH}/checksums.sha256" ]; then
  echo "Verificando integridad del checkpoint..."
  cd "$CHECKPOINT_PATH"
  if sha256sum -c checksums.sha256 --quiet 2>/dev/null; then
    echo -e "  ${GREEN}Integridad OK${NC}"
  else
    echo -e "  ${RED}ADVERTENCIA: Checksums no coinciden${NC}"
    read -p "  Continuar? (s/N): " CONFIRM
    if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
      echo "Cancelado."
      exit 1
    fi
  fi
  cd "$(dirname "$0")"
fi

# Mostrar qué archivos se van a restaurar
echo ""
echo "Archivos a restaurar:"
for f in "${CHECKPOINT_PATH}"/*; do
  BASENAME=$(basename "$f")
  if [ "$BASENAME" != "checksums.sha256" ] && [ "$BASENAME" != "meta.txt" ]; then
    echo -e "  ${BASENAME}"
  fi
done

echo ""
read -p "RESTAURAR estos archivos? Esto SOBRESCRIBE los actuales. (escribe RESTAURAR): " CONFIRM

if [ "$CONFIRM" != "RESTAURAR" ]; then
  echo "Cancelado. No se restauró nada."
  exit 0
fi

# Restaurar
for f in "${CHECKPOINT_PATH}"/*; do
  BASENAME=$(basename "$f")
  if [ "$BASENAME" != "checksums.sha256" ] && [ "$BASENAME" != "meta.txt" ]; then
    cp "$f" "./${BASENAME}"
    echo -e "  ${GREEN}Restaurado: ${BASENAME}${NC}"
  fi
done

# Recalcular CSP hash
if [ -f "auto-csp-hash.sh" ]; then
  echo ""
  echo "Recalculando CSP hash..."
  bash auto-csp-hash.sh
fi

# Sincronizar a live/
if [ -d "live" ]; then
  echo ""
  echo "Sincronizando a live/..."
  cp egglogu.html live/egglogu.html 2>/dev/null && echo -e "  ${GREEN}live/egglogu.html${NC}" || true
  cp egglogu.js live/egglogu.js 2>/dev/null && echo -e "  ${GREEN}live/egglogu.js${NC}" || true
fi

echo ""
echo -e "${GREEN}Restauración completa desde checkpoint ${TIMESTAMP}${NC}"
