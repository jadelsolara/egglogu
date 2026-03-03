#!/bin/bash
# post-edit-verify.sh — AFP: Verificar cambios después de editar ERP
# Muestra diff exacto entre estado actual y último checkpoint.
# Correr DESPUÉS de cada edición para verificar que no hay cambios no deseados.

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

CHECKPOINT_DIR=".erp-checkpoints"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  AFP — POST-EDIT VERIFICATION                 ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# Encontrar último checkpoint
if [ ! -f "${CHECKPOINT_DIR}/.latest" ]; then
  echo -e "${RED}No hay checkpoint. Corre checkpoint-erp.sh ANTES de editar.${NC}"
  exit 1
fi

LATEST=$(cat "${CHECKPOINT_DIR}/.latest")
CHECKPOINT_PATH="${CHECKPOINT_DIR}/${LATEST}"

if [ ! -d "$CHECKPOINT_PATH" ]; then
  echo -e "${RED}Checkpoint $LATEST no encontrado.${NC}"
  exit 1
fi

echo -e "Comparando contra checkpoint: ${YELLOW}${LATEST}${NC}"
echo ""

CHANGES=0
PROBLEMS=0

for f in egglogu.html egglogu.js; do
  if [ ! -f "${CHECKPOINT_PATH}/${f}" ]; then
    continue
  fi

  if diff -q "$f" "${CHECKPOINT_PATH}/${f}" > /dev/null 2>&1; then
    echo -e "  ${GREEN}Sin cambios:${NC} $f"
  else
    CHANGES=$((CHANGES + 1))
    echo -e "  ${YELLOW}MODIFICADO:${NC} $f"

    # Contar líneas cambiadas
    ADDED=$(diff "${CHECKPOINT_PATH}/${f}" "$f" | grep "^>" | wc -l)
    REMOVED=$(diff "${CHECKPOINT_PATH}/${f}" "$f" | grep "^<" | wc -l)
    echo -e "    Líneas añadidas: ${GREEN}+${ADDED}${NC}"
    echo -e "    Líneas eliminadas: ${RED}-${REMOVED}${NC}"

    # Verificar zonas prohibidas
    DIFF_OUTPUT=$(diff "${CHECKPOINT_PATH}/${f}" "$f" || true)

    # Zona prohibida: Login/Registro
    if echo "$DIFF_OUTPUT" | grep -qi "login-card\|login-logo\|\.login"; then
      echo -e "    ${RED}ALERTA: Cambios en zona LOGIN (PROHIBIDA)${NC}"
      PROBLEMS=$((PROBLEMS + 1))
    fi

    # Zona prohibida: Sidebar logo base64
    if echo "$DIFF_OUTPUT" | grep -qi "sidebar-logo.*base64\|data:image.*sidebar"; then
      echo -e "    ${RED}ALERTA: Cambios en imagen SIDEBAR LOGO (PROHIBIDA)${NC}"
      PROBLEMS=$((PROBLEMS + 1))
    fi

    # Zona prohibida: Botón nav
    if echo "$DIFF_OUTPUT" | grep -qi "nav_login\|Acceso Clientes"; then
      echo -e "    ${RED}ALERTA: Cambios en BOTÓN NAV (PROHIBIDA)${NC}"
      PROBLEMS=$((PROBLEMS + 1))
    fi

    # Zona prohibida: Globo idiomas position
    if echo "$DIFF_OUTPUT" | grep -qi "lang-picker-fixed.*position"; then
      echo -e "    ${RED}ALERTA: Cambios en GLOBO IDIOMAS position (PROHIBIDA)${NC}"
      PROBLEMS=$((PROBLEMS + 1))
    fi

    echo ""
    echo -e "    ${CYAN}Diff resumido (primeras 30 líneas):${NC}"
    diff -u "${CHECKPOINT_PATH}/${f}" "$f" | head -35 | while IFS= read -r line; do
      if [[ "$line" == +* ]]; then
        echo -e "    ${GREEN}${line}${NC}"
      elif [[ "$line" == -* ]]; then
        echo -e "    ${RED}${line}${NC}"
      else
        echo "    $line"
      fi
    done
    echo ""
  fi
done

# Verificar sync con live/
echo -e "${CYAN}--- Verificación sync live/ ---${NC}"
SYNC_OK=true
for f in egglogu.html egglogu.js; do
  if [ -f "live/$f" ]; then
    if ! diff -q "$f" "live/$f" > /dev/null 2>&1; then
      echo -e "  ${RED}DESYNC:${NC} $f != live/$f"
      SYNC_OK=false
    else
      echo -e "  ${GREEN}SYNC OK:${NC} $f = live/$f"
    fi
  fi
done

# Verificar CSP hash
echo ""
echo -e "${CYAN}--- Verificación CSP hash ---${NC}"
CALC_HASH=$(python3 -c "
import hashlib, base64, re
html = open('egglogu.html').read()
match = re.search(r'<style>(.*?)</style>', html, re.S)
style = match.group(1)
digest = hashlib.sha256(style.encode()).digest()
print('sha256-' + base64.b64encode(digest).decode())
")
CSP_HASH=$(grep -oP "style-src[^;]*sha256-[A-Za-z0-9+/=]+" egglogu.html | grep -oP "sha256-[A-Za-z0-9+/=]+")

if [ "$CALC_HASH" = "$CSP_HASH" ]; then
  echo -e "  ${GREEN}CSP hash correcto: $CSP_HASH${NC}"
else
  echo -e "  ${RED}CSP hash INCORRECTO!${NC}"
  echo -e "  Calculado: $CALC_HASH"
  echo -e "  En archivo: $CSP_HASH"
  PROBLEMS=$((PROBLEMS + 1))
fi

# Resumen
echo ""
echo "═══════════════════════════════════════════"
if [ "$PROBLEMS" -gt 0 ]; then
  echo -e "${RED}RESULTADO: $PROBLEMS PROBLEMAS DETECTADOS${NC}"
  echo -e "${RED}REVISAR antes de commitear.${NC}"
  exit 1
elif [ "$CHANGES" -eq 0 ]; then
  echo -e "${GREEN}RESULTADO: Sin cambios desde checkpoint${NC}"
else
  echo -e "${GREEN}RESULTADO: $CHANGES archivo(s) modificados, 0 problemas${NC}"
  if [ "$SYNC_OK" = false ]; then
    echo -e "${YELLOW}RECORDATORIO: Sincronizar a live/ antes de deploy${NC}"
  fi
fi
echo "═══════════════════════════════════════════"
