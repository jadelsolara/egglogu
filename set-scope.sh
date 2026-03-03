#!/bin/bash
# set-scope.sh — AFP: Declarar alcance de sesión
# Define qué archivos pueden modificarse en esta sesión de trabajo.
# El pre-commit hook bloqueará cambios a archivos fuera del alcance.
#
# Uso:
#   bash set-scope.sh erp          → Solo archivos ERP
#   bash set-scope.sh landing      → Solo archivos Landing
#   bash set-scope.sh backend      → Solo archivos backend
#   bash set-scope.sh "file1 file2" → Archivos específicos
#   bash set-scope.sh clear        → Eliminar scope (permitir todo)

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCOPE_FILE=".session-scope"

if [ -z "$1" ]; then
  if [ -f "$SCOPE_FILE" ]; then
    echo -e "${CYAN}Alcance actual:${NC}"
    cat "$SCOPE_FILE"
  else
    echo -e "${YELLOW}Sin alcance definido. Todos los archivos permitidos.${NC}"
    echo ""
    echo "Uso: bash set-scope.sh [erp|landing|backend|\"archivo1 archivo2\"|clear]"
  fi
  exit 0
fi

case "$1" in
  erp)
    cat > "$SCOPE_FILE" << 'EOF'
# SESSION SCOPE: ERP
# Solo se permiten cambios a archivos ERP
egglogu.html
egglogu.js
live/egglogu.html
live/egglogu.js
checksums-erp.sha256
auto-csp-hash.sh
EOF
    echo -e "${GREEN}Alcance definido: ERP${NC}"
    ;;
  landing)
    cat > "$SCOPE_FILE" << 'EOF'
# SESSION SCOPE: LANDING
# Solo se permiten cambios a archivos Landing
index.html
i18n-landing.js
live/index.html
live/i18n-landing.js
EOF
    echo -e "${GREEN}Alcance definido: LANDING${NC}"
    ;;
  backend)
    cat > "$SCOPE_FILE" << 'EOF'
# SESSION SCOPE: BACKEND
# Solo se permiten cambios a archivos Backend
backend/*
EOF
    echo -e "${GREEN}Alcance definido: BACKEND${NC}"
    ;;
  clear)
    rm -f "$SCOPE_FILE"
    echo -e "${GREEN}Alcance eliminado. Todos los archivos permitidos.${NC}"
    exit 0
    ;;
  *)
    # Archivos específicos
    echo "# SESSION SCOPE: CUSTOM" > "$SCOPE_FILE"
    echo "# Archivos permitidos:" >> "$SCOPE_FILE"
    for f in $1; do
      echo "$f" >> "$SCOPE_FILE"
    done
    echo -e "${GREEN}Alcance definido: CUSTOM${NC}"
    ;;
esac

echo ""
echo -e "${CYAN}Archivos permitidos en esta sesión:${NC}"
grep -v '^#' "$SCOPE_FILE" | grep -v '^$'
echo ""
echo -e "Para cambiar: ${YELLOW}bash set-scope.sh [erp|landing|backend|clear]${NC}"
