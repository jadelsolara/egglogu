# EGGlogU — Bitácora de Versiones por Componente

> Última actualización: 2026-03-08
> Pedir "la bitácora" para revisar estado de todo.

---

## Frontend — Bundle JS (`live/dist/egglogu-app.js`)

| Versión | Hash | Fecha | Componente | Cambios | Estado |
|---------|------|-------|------------|---------|--------|
| v2.1.0 | 86573ee4 | 2026-03-08 | Superadmin robust + full-width + build.sh sync | Build via build.sh: synced live/ + live/app/. Sidebar superadmin 4-source detection. PIN login email fallback. 17x repeat(4,1fr) KPI grids. SW cache v3. | CURRENT |
| v2.0.0 | a8fdc1c3 | 2026-03-08 | ALL modules full-width + Superadmin auto-detect | KPIs 4-col grid en TODOS los módulos (15+). Superadmin auto-promote frontend: jadelsolara@pm.me → role:superadmin en setCurrentUser(), funciona online y offline. Responsive 900px→2col. | LOCKED |
| v1.9.0 | 91ee1ad0 | 2026-03-08 | Intelligence Hub + Nav collapse | Tab 🧠 Intelligence: 2-col grid layout, compact KPIs, funnel chart 120px, tables max-height 320px, module bars 2-col, all sections responsive. Nav groups collapsed por defecto. Privacy: k-anonymity≥5, CL+CH | LOCKED |
| v1.8.0 | ac344dd6 | 2026-03-08 | Superadmin Outbreaks | Tab outbreak alerts en superadmin: CRUD completo, formulario crear/editar/resolver/eliminar | LOCKED |
| v1.7.0 | — | 2026-03-08 | Outbreak Dashboard + Geolocation | Alertas geo-filtradas en dashboard, geolocalización auto, refresh 30min | LOCKED |
| v1.6.0 | 2b19e31a | 2026-03-08 | Superuser | Hardcode jadelsolara@pm.me, badge "SUPERUSER — FREE FOREVER", plan enterprise | LOCKED |
| v1.5.0 | 54bbcf04 | 2026-03-08 | Sidebar Nav + Logo | Chevron collapse, pill active, icon badges, logo sidebar | LOCKED |
| v1.4.0 | 35677d89 | 2026-03-08 | Temas | Solo blue + black, sidebar gradient adaptativo | LOCKED |
| v1.3.0 | 99e0445a | 2026-03-08 | Modos | Modo campo/vet fix (Shadow DOM) | LOCKED |
| v1.2.0 | 1ee467fd | 2026-03-08 | Sidebar | Sidebar gradient | LOCKED |
| v1.1.0 | fb0275ec | 2026-03-08 | Estética | Desktop aesthetics + logo + gitignore fix | LOCKED |
| v1.0.0 | — | 2026-03-07 | Baseline | Pre-fix baseline (responsive) | LOCKED |

---

## Backend — API (`backend/src/`)

| Versión | Fecha | Componente | Cambios | Estado |
|---------|-------|------------|---------|--------|
| b1.5.0 | 2026-03-08 | Intelligence API | GET /superadmin/intelligence — 12 secciones agregadas, k-anonymity≥5, dual compliance CL-Ley19628 + CH-FADP/nDSG | CURRENT |
| b1.4.0 | 2026-03-08 | Outbreak Alerts API | GET/POST/PATCH/DELETE superadmin/outbreak-alerts + GET health/outbreak-alerts geo-filtered Haversine | LOCKED |
| b1.3.0 | 2026-03-08 | OutbreakAlert Model + Migration | Modelo, enums, migración Alembic p7e8f9g0h123, esquemas Pydantic | LOCKED |
| b1.2.0 | 2026-03-08 | Superuser invisibilidad | Superuser invisible en todos los listados, bloqueo de otros superadmins | LOCKED |
| b1.1.0 | 2026-03-08 | Superuser hardcode | Auto-promote jadelsolara@pm.me, enterprise free forever en deps.py | LOCKED |
| b1.0.0 | 2026-03-08 | Precios corregidos | plans.py: Hobbyist FREE, Starter $49, Professional $99, Enterprise $199 | LOCKED |

---

## Componentes LOCKED (no tocar sin autorización)

| Componente | Versión | Fecha lock | Notas |
|------------|---------|------------|-------|
| Sidebar Nav | v1.5.0 | 2026-03-08 | Chevron, pill active, icon badges — PERFECTO |
| Sidebar Logo | v1.5.0 | 2026-03-08 | Base64, .sidebar-logo, 40×48px, border-radius:50%, box-shadow:0 2px 8px, gap:12px, subtítulo opacity:.6 — LOCKED DEFINITIVO. img slot="logo" en egg-app.js línea 67. NO TOCAR NUNCA. |
| Login/Registro UI | v1.1.0 | 2026-02-28 | Logo, imagen base64, CSS .login-card .login-logo |
| Botón "Acceso Clientes" | v1.1.0 | 2026-02-28 | Texto, emoji 🔑, padding, font-size |
| Globo Idiomas Landing | v1.1.0 | 2026-02-28 | position:fixed, fuera del nav |

---

## Precios Oficiales (LEGALMENTE VINCULANTES)

| Plan | Precio/mes | Precio/año | Estado |
|------|-----------|-----------|--------|
| Hobbyist | FREE | FREE | Publicado en egglogu.com |
| Starter | $49 | $490 | Publicado en egglogu.com |
| Professional | $99 | $990 | Publicado en egglogu.com |
| Enterprise | $199 | $1,990 | Publicado en egglogu.com |
| Promo lanzamiento | $75/mo x3 meses | — | Primeros 500 usuarios |

---

## Superuser — jadelsolara@pm.me

| Propiedad | Valor | Estado |
|-----------|-------|--------|
| Email | jadelsolara@pm.me | HARDCODED |
| Role | superadmin | AUTO-PROMOTE |
| Plan | enterprise | FREE FOREVER |
| Límites | NINGUNO | Sin restricciones |
| Visibilidad | INVISIBLE | No aparece en ningún listado |
| Exclusividad | ÚNICO | Nadie más puede ser superadmin |
| Administración | SOLO ÉL | Nadie más tiene acceso |

---

## Reglas de la Bitácora
1. Cada cambio = nueva entrada ANTES de push
2. Componente anterior = LOCKED inmediatamente
3. LOCKED = no se toca sin autorización explícita del usuario
4. Precios = verificar contra egglogu.com antes de cualquier cambio
5. Pedir "la bitácora" para revisar todo de un vistazo
