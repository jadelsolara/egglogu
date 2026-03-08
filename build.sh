#!/usr/bin/env bash
# ============================================================
# EGGlogU Build Script v2.0 — 3 Pilares Architecture
# ============================================================
# Pillar tracking: AESTHETIC | FUNCTIONAL | OPERATIONAL
# Asset hashing, checksum verification, deploy preparation
# ============================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIVE_DIR="$PROJECT_DIR/live"
DIST_DIR="$LIVE_DIR/dist"
VERSION_FILE="$PROJECT_DIR/VERSION.json"
CHECKSUMS_FILE="$PROJECT_DIR/checksums-pillars.json"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; NC='\033[0m'

# ── Helper: compute hash of a file or section ──
file_hash() { sha256sum "$1" 2>/dev/null | cut -c1-16; }

section_hash() {
  local file="$1" start="$2" end="$3"
  sed -n "${start},${end}p" "$file" | sha256sum | cut -c1-16
}

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  EGGlogU Build v2.0 — 3 Pilares Deploy  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ════════════════════════════════════════
# STEP 1: Verify source files
# ════════════════════════════════════════
echo -e "${YELLOW}[1/8] Verificando archivos fuente...${NC}"

SRC_HTML="$PROJECT_DIR/egglogu.html"
[[ ! -f "$SRC_HTML" ]] && echo -e "${RED}ERROR: egglogu.html not found${NC}" && exit 1

# Find JS bundle (hashed or plain)
SRC_JS=""
if [[ -f "$DIST_DIR/egglogu-app.js" ]]; then
  SRC_JS="$DIST_DIR/egglogu-app.js"
else
  SRC_JS=$(find "$DIST_DIR" -maxdepth 1 -name 'egglogu-app.*.js' ! -name '*.map' | head -1)
fi
[[ -z "$SRC_JS" || ! -f "$SRC_JS" ]] && echo -e "${RED}ERROR: No JS bundle in dist/${NC}" && exit 1

echo -e "${GREEN}  ✓ egglogu.html${NC}"
echo -e "${GREEN}  ✓ $(basename "$SRC_JS")${NC}"

# ════════════════════════════════════════
# STEP 2: Detect pillar changes
# ════════════════════════════════════════
echo -e "${YELLOW}[2/8] Detectando cambios por pilar...${NC}"

# Compute current checksums
# AESTHETIC: <style> block (lines 26-478 in egglogu.html)
STYLE_START=$(grep -n '<style>' "$SRC_HTML" | head -1 | cut -d: -f1)
STYLE_END=$(grep -n '</style>' "$SRC_HTML" | head -1 | cut -d: -f1)
HASH_AESTHETIC=$(section_hash "$SRC_HTML" "$STYLE_START" "$STYLE_END")

# FUNCTIONAL: JS bundle
HASH_FUNCTIONAL=$(file_hash "$SRC_JS")

# OPERATIONAL: SW + _headers
HASH_SW=$(file_hash "$LIVE_DIR/sw.js")
HASH_HEADERS=$(file_hash "$LIVE_DIR/_headers")
HASH_OPERATIONAL="${HASH_SW}${HASH_HEADERS}"
HASH_OPERATIONAL=$(echo -n "$HASH_OPERATIONAL" | sha256sum | cut -c1-16)

# HTML structure (everything except <style> and <script>)
HASH_HTML_STRUCT=$(sed "${STYLE_START},${STYLE_END}d" "$SRC_HTML" | sha256sum | cut -c1-16)

# Load previous checksums if they exist
CHANGED_PILLARS=()
if [[ -f "$CHECKSUMS_FILE" ]]; then
  PREV_AESTHETIC=$(python3 -c "import json;print(json.load(open('$CHECKSUMS_FILE'))['aesthetic'])" 2>/dev/null || echo "none")
  PREV_FUNCTIONAL=$(python3 -c "import json;print(json.load(open('$CHECKSUMS_FILE'))['functional'])" 2>/dev/null || echo "none")
  PREV_OPERATIONAL=$(python3 -c "import json;print(json.load(open('$CHECKSUMS_FILE'))['operational'])" 2>/dev/null || echo "none")
  PREV_HTML=$(python3 -c "import json;print(json.load(open('$CHECKSUMS_FILE'))['html_structure'])" 2>/dev/null || echo "none")

  [[ "$HASH_AESTHETIC" != "$PREV_AESTHETIC" ]] && CHANGED_PILLARS+=("ESTÉTICO")
  [[ "$HASH_FUNCTIONAL" != "$PREV_FUNCTIONAL" ]] && CHANGED_PILLARS+=("FUNCIONAL")
  [[ "$HASH_OPERATIONAL" != "$PREV_OPERATIONAL" ]] && CHANGED_PILLARS+=("OPERACIONAL")
  [[ "$HASH_HTML_STRUCT" != "$PREV_HTML" ]] && CHANGED_PILLARS+=("HTML-ESTRUCTURA")
else
  CHANGED_PILLARS=("INITIAL BUILD")
fi

if [[ ${#CHANGED_PILLARS[@]} -eq 0 ]]; then
  echo -e "${GREEN}  ✓ Sin cambios detectados — nada que buildear${NC}"
  echo -e "  Usa --force para forzar rebuild"
  [[ "${1:-}" != "--force" ]] && exit 0
  CHANGED_PILLARS=("FORCED")
fi

echo -e "${MAGENTA}  Pilares modificados: ${CHANGED_PILLARS[*]}${NC}"

# ════════════════════════════════════════
# STEP 3: Safety check — warn if multiple pillars changed
# ════════════════════════════════════════
echo -e "${YELLOW}[3/8] Verificación de seguridad...${NC}"

PILLAR_COUNT=${#CHANGED_PILLARS[@]}
if [[ $PILLAR_COUNT -gt 1 && "${CHANGED_PILLARS[0]}" != "INITIAL BUILD" && "${CHANGED_PILLARS[0]}" != "FORCED" ]]; then
  echo -e "${RED}  ⚠ ALERTA: ${PILLAR_COUNT} pilares cambiaron simultáneamente${NC}"
  echo -e "${RED}  Pilares: ${CHANGED_PILLARS[*]}${NC}"
  echo -e "${YELLOW}  Esto puede indicar cambios accidentales fuera del alcance.${NC}"
  echo -e "${YELLOW}  Si es intencional, confirma con: build.sh --force${NC}"
  if [[ "${1:-}" != "--force" ]]; then
    read -p "  ¿Continuar? (s/N): " CONFIRM
    [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]] && echo "Build cancelado." && exit 1
  fi
else
  echo -e "${GREEN}  ✓ Cambio aislado en pilar(es) — seguro${NC}"
fi

# ════════════════════════════════════════
# STEP 4: Hash JS bundle
# ════════════════════════════════════════
echo -e "${YELLOW}[4/8] Generando hash del bundle JS...${NC}"

JS_HASH=$(sha256sum "$SRC_JS" | cut -c1-8)
HASHED_JS="egglogu-app.${JS_HASH}.js"

echo -e "${GREEN}  ✓ Hash: ${JS_HASH}${NC}"
echo -e "${GREEN}  ✓ Bundle: dist/${HASHED_JS}${NC}"

# ════════════════════════════════════════
# STEP 5: Clean old hashed bundles
# ════════════════════════════════════════
echo -e "${YELLOW}[5/8] Limpiando bundles anteriores...${NC}"

OLD=0
for f in "$DIST_DIR"/egglogu-app.*.js; do
  if [[ -f "$f" && "$(basename "$f")" != "$HASHED_JS" ]]; then
    rm -f "$f"
    echo -e "  Eliminado: $(basename "$f")"
    ((OLD++)) || true
  fi
done
echo -e "${GREEN}  ✓ $OLD bundle(s) viejo(s) eliminado(s)${NC}"

# Copy new hashed bundle (keep plain as source-of-truth)
cp "$SRC_JS" "$DIST_DIR/$HASHED_JS"
echo -e "${GREEN}  ✓ Creado: dist/${HASHED_JS}${NC}"

# ════════════════════════════════════════
# STEP 6: Update HTML references
# ════════════════════════════════════════
echo -e "${YELLOW}[6/8] Actualizando egglogu.html...${NC}"

# Update script tag to point to hashed bundle
sed -i -E "s|dist/egglogu-app(\.[a-f0-9]{8})?\.js(\?v=[0-9]+)?|dist/${HASHED_JS}|g" "$SRC_HTML"

# Update/add the inline cache-buster version key
# This forces browsers with old SW to purge and reload
BUILD_NUM=$(python3 -c "import json;print(json.load(open('$VERSION_FILE'))['build']['number'])" 2>/dev/null || echo "0")
BUILD_NUM=$((BUILD_NUM + 1))

# Replace the purge script with updated version
sed -i -E "s/_eggl_purge_v[0-9]+/_eggl_purge_v${BUILD_NUM}/g" "$SRC_HTML"

# Sync to live/
cp "$SRC_HTML" "$LIVE_DIR/egglogu.html"

# Verify
if grep -q "$HASHED_JS" "$LIVE_DIR/egglogu.html"; then
  echo -e "${GREEN}  ✓ HTML actualizado → dist/${HASHED_JS}${NC}"
else
  echo -e "${RED}  ✗ ERROR: script tag no actualizado!${NC}" && exit 1
fi

# ════════════════════════════════════════
# STEP 7: Sync live/app/ (mirror)
# ════════════════════════════════════════
echo -e "${YELLOW}[7/8] Sincronizando live/app/...${NC}"

APP_DIR="$LIVE_DIR/app"
if [[ -d "$APP_DIR" ]]; then
  # Sync key files to app/
  for f in egglogu.html sw.js manifest.json offline.html _headers; do
    [[ -f "$LIVE_DIR/$f" ]] && cp "$LIVE_DIR/$f" "$APP_DIR/$f"
  done
  # Sync dist/
  mkdir -p "$APP_DIR/dist"
  cp "$DIST_DIR/$HASHED_JS" "$APP_DIR/dist/$HASHED_JS"
  # Clean old hashed bundles from app/dist/
  for f in "$APP_DIR/dist"/egglogu-app.*.js; do
    [[ -f "$f" && "$(basename "$f")" != "$HASHED_JS" ]] && rm -f "$f"
  done
  # Also keep the plain bundle in app/dist for backwards compat
  [[ -f "$DIST_DIR/egglogu-app.js" ]] && cp "$DIST_DIR/egglogu-app.js" "$APP_DIR/dist/egglogu-app.js"
  echo -e "${GREEN}  ✓ live/app/ sincronizado${NC}"
else
  echo -e "${GREEN}  ✓ live/app/ no existe — skip${NC}"
fi

# ════════════════════════════════════════
# STEP 8: Save checksums + update VERSION.json + manifest
# ════════════════════════════════════════
echo -e "${YELLOW}[8/8] Guardando checksums y manifesto...${NC}"

BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Save pillar checksums
cat > "$CHECKSUMS_FILE" <<CKSUM
{
  "aesthetic": "${HASH_AESTHETIC}",
  "functional": "${HASH_FUNCTIONAL}",
  "operational": "${HASH_OPERATIONAL}",
  "html_structure": "${HASH_HTML_STRUCT}",
  "js_bundle": "dist/${HASHED_JS}",
  "buildTime": "${BUILD_TIME}",
  "buildNumber": ${BUILD_NUM},
  "changedPillars": "$(IFS=,; echo "${CHANGED_PILLARS[*]}")"
}
CKSUM

# Update VERSION.json build info
python3 -c "
import json
v = json.load(open('$VERSION_FILE'))
v['build']['number'] = $BUILD_NUM
v['build']['lastBuildTime'] = '$BUILD_TIME'
v['build']['jsBundle'] = 'dist/$HASHED_JS'
v['build']['changedPillars'] = '$(IFS=,; echo "${CHANGED_PILLARS[*]}")'
json.dump(v, open('$VERSION_FILE', 'w'), indent=2, ensure_ascii=False)
"

# Build manifest for production (served to browser for version check)
cat > "$LIVE_DIR/build-manifest.json" <<MANIFEST
{
  "v": ${BUILD_NUM},
  "t": "${BUILD_TIME}",
  "js": "dist/${HASHED_JS}",
  "sw": "sw.js"
}
MANIFEST

# Copy manifest to app/ too
[[ -d "$APP_DIR" ]] && cp "$LIVE_DIR/build-manifest.json" "$APP_DIR/build-manifest.json"

echo -e "${GREEN}  ✓ Checksums guardados${NC}"
echo -e "${GREEN}  ✓ VERSION.json actualizado (build #${BUILD_NUM})${NC}"

# ════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║            BUILD COMPLETADO              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo -e "  Build:    #${BUILD_NUM}"
echo -e "  Bundle:   dist/${HASHED_JS}"
echo -e "  Cambios:  ${CHANGED_PILLARS[*]}"
echo -e "  Tiempo:   ${BUILD_TIME}"
echo ""
echo -e "${YELLOW}Checksums por pilar:${NC}"
echo -e "  ESTÉTICO:    ${HASH_AESTHETIC}"
echo -e "  FUNCIONAL:   ${HASH_FUNCTIONAL}"
echo -e "  OPERACIONAL: ${HASH_OPERATIONAL}"
echo -e "  HTML-STRUCT: ${HASH_HTML_STRUCT}"
echo ""
echo -e "${YELLOW}Deploy:${NC}"
echo -e "  1. Subir carpeta ${CYAN}live/${NC} a Cloudflare Pages"
echo -e "  2. Purge cache en Cloudflare (Settings → Caching → Purge Everything)"
echo -e "  3. ${RED}IMPORTANTE: Eliminar Cache Rules custom en Cloudflare Dashboard${NC}"
echo -e "  4. Verificar en ventana privada: egglogu.com/egglogu.html"
echo ""
