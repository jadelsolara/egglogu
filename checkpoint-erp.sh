#!/bin/bash
# checkpoint-erp.sh — Anti-Fuckup Protocol: Checkpoint antes de modificar ERP
# Crea backup timestamped de archivos ERP ANTES de cualquier edición.
# OBLIGATORIO correrlo antes de tocar egglogu.html o egglogu.js.

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

CHECKPOINT_DIR=".erp-checkpoints"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CHECKPOINT_NAME="${CHECKPOINT_DIR}/${TIMESTAMP}"

ERP_FILES=("egglogu.html" "egglogu.js")

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  AFP — CHECKPOINT ERP                         ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# Crear directorio del checkpoint
mkdir -p "$CHECKPOINT_NAME"

# Copiar archivos ERP
for f in "${ERP_FILES[@]}"; do
  if [ -f "$f" ]; then
    cp "$f" "${CHECKPOINT_NAME}/${f}"
    HASH=$(sha256sum "$f" | cut -d' ' -f1)
    echo "$HASH  $f" >> "${CHECKPOINT_NAME}/checksums.sha256"
    echo -e "  ${GREEN}+${NC} $f → ${CHECKPOINT_NAME}/${f}"
  fi
done

# Guardar metadata
cat > "${CHECKPOINT_NAME}/meta.txt" << METAEOF
checkpoint: $TIMESTAMP
created: $(date -Iseconds)
reason: ${1:-"pre-edit checkpoint"}
files: ${ERP_FILES[*]}
METAEOF

# Mantener solo los últimos 20 checkpoints (limpieza automática)
TOTAL=$(ls -d ${CHECKPOINT_DIR}/20* 2>/dev/null | wc -l)
if [ "$TOTAL" -gt 20 ]; then
  EXCESS=$((TOTAL - 20))
  ls -d ${CHECKPOINT_DIR}/20* | head -n "$EXCESS" | xargs rm -rf
  echo -e "  ${YELLOW}Limpieza: eliminados $EXCESS checkpoints antiguos${NC}"
fi

echo ""
echo -e "${GREEN}Checkpoint creado: ${CHECKPOINT_NAME}${NC}"
echo -e "Archivos guardados: ${#ERP_FILES[@]}"
echo -e "Para restaurar: ${YELLOW}bash restore-checkpoint.sh ${TIMESTAMP}${NC}"
echo ""

# Escribir el último checkpoint para referencia rápida
echo "$TIMESTAMP" > "${CHECKPOINT_DIR}/.latest"
