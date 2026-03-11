# EGGlogU — Poultry Farm Management SaaS

## Stack
Frontend: egglogu.html + Modular Web Components (src/components/egg-*.js) + Vite build → dist/egglogu-app.js, IndexedDB offline, Service Worker PWA
Backend: Python 3.12 + FastAPI 0.115 + SQLAlchemy 2.0 async + PostgreSQL 16 + Redis 7, Docker Compose
Auth: JWT + Google OAuth + Apple Sign-In + Microsoft Identity + Resend email verification + offline PIN

## Architecture (Modular — NO monolith)
- **Entry point:** `src/main.js` → Vite builds → `dist/egglogu-app.js`
- **Components:** `src/components/egg-*.js` (40+ Web Components with Shadow DOM)
- **Core:** `src/core/` (bus.js, store.js, api.js, i18n.js, helpers.js, index.js)
- **Translations:** `src/i18n/translations.js` (14 languages)
- **Auth boot:** `src/boot/auth.js`
- **MONOLITH DELETED 2026-03-11** — egglogu.js, egglogu-reports.js, egglogu-datatable.js, egglogu-workflows.js no longer exist. ALL changes go to src/components/ and src/core/.

## Structure
- egglogu.html — Frontend shell (loads dist/egglogu-app.js)
- src/main.js — Entry point (imports all components)
- src/components/ — Web Components (egg-flocks.js, egg-production.js, egg-dashboard.js, etc.)
- src/core/ — Shared modules (Store, Bus, i18n, API, helpers)
- src/i18n/translations.js — All translations (14 languages)
- backend/src/api/ — FastAPI routes (auth, farms, flocks, production, health, feed, clients, finance, environment, operations, sync, biosecurity, traceability, planning, billing, support, healthcheck, leads, trace_public)
- backend/src/models/ — SQLAlchemy models
- backend/src/schemas/ — Pydantic v2 schemas
- backend/src/core/ — Business logic (security.py, rate_limit.py, plans.py, exceptions.py, email.py, stripe.py)
- backend/alembic/ — DB migrations

## Key Details
- 14 languages (ES, EN, PT, FR, DE, IT, JA, ZH, RU, ID, AR, KO, TH, VI)
- Multi-tenant: Organization → Farm → Flock → DailyProduction
- Offline-first: IndexedDB local, dual-write sync when online
- Pricing: Hobbyist FREE / Starter $49/mo / Professional $99/mo / Enterprise $199/mo (30-day free trial, launch promo $75/mo x3 months)
- 18 API route modules, 21+ SQLAlchemy models

## Build Pipeline (OBLIGATORIO)
```
1. npx vite build                                    → dist/egglogu-app.js
2. cp dist/egglogu-app.js live/dist/egglogu-app.js   → staging
3. ./build.sh --force                                 → hash + sync live/ + live/app/ + manifests
```

## Deployment
- Frontend: Cloudflare Pages → egglogu.com
- Backend API: VPS GoldHuevos → api.egglogu.com (Docker Compose: app + PostgreSQL 16 + Redis 7)
- CI/CD: GitHub Actions (.github/workflows/ci.yml)
- Payments: Stripe (checkout sessions, customer portal, webhooks)
- Email: Resend API (verification, password reset, team invites)

## AI Assistant (Support Chat v2.0)
- Troubleshooting KB: 8 common issue categories with step-by-step resolution
- Bug classification: cosmetic/functional/critical/blocker with auto-priority
- Auto-ticket creation: AI creates tickets with full conversation transcript when unresolved
- Crowd urgency: localStorage-based issue dedup, auto-escalates priority (2+ medium, 5+ high, 10+ urgent)
- Read-only policy: blocks aesthetic/process change requests, redirects to suggestions
- Email notification flags: tickets marked for notify_on_resolve (backend integration pending)
- Bug triage: cosmetic+functional = auto-fix path, critical+blocker = team review escalation
- 14-language support

## BASE64 IMAGES — CRITICAL READ RULE
- egglogu.html contains inline base64 images on lines ~440 and ~472 (login logo + sidebar logo)
- favicon.svg, icons/icon.svg also contain embedded base64
- src/assets/sidebar-logo-base64.txt is a raw base64 dump
- **NEVER read these files without line limits that skip the base64 lines**
- Reading base64 image data causes API error "Could not process image" and crashes the session
- Safe patterns:
  - `Read(file, limit=430)` to read before the first base64 line
  - `Read(file, offset=475, limit=N)` to read after the base64 lines
  - Use `Grep` to find specific content (grep skips binary-like data)
  - Use `Bash(wc -l file)` to check file length before reading
- **NEVER read sidebar-logo-base64.txt or any file that is purely base64**
- When editing egglogu.html near base64 lines, use `Grep` to get surrounding context, then `Edit` with exact string match — do NOT read the base64 lines

## Active Work
- Post-launch: live at egglogu.com, monitoring and iterating
- Support module operational (tickets, FAQ, auto-responses, AI assistant v2.0)
- Sync strategy refinement (delta sync planned, currently full-push)
