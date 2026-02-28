# EGGlogU — Poultry Farm Management SaaS

## Stack
Frontend: Single HTML (egglogu.html, 7,272 lines), vanilla JS (egglogu.js, 10,040 lines), IndexedDB offline, Service Worker PWA
Backend: Python 3.12 + FastAPI 0.115 + SQLAlchemy 2.0 async + PostgreSQL 16 + Redis 7, Docker Compose
Auth: JWT + Google OAuth + Apple Sign-In + Microsoft Identity + Resend email verification + offline PIN

## Structure
- egglogu.html — Frontend (7,272 lines)
- backend/src/api/ — FastAPI routes (auth, farms, flocks, production, health, feed, clients, finance, environment, operations, sync, biosecurity, traceability, planning, billing, support, healthcheck, leads, trace_public)
- backend/src/models/ — SQLAlchemy models (Organization, User, Role, Farm, Flock, BreedCurve, DailyProduction, Vaccine, Medication, Outbreak, StressEvent, FeedPurchase, FeedConsumption, Client, Income, Expense, Receivable, EnvironmentReading, IoTReading, WeatherCache, ChecklistItem, LogbookEntry, Personnel, KPISnapshot, Prediction, BiosecurityVisitor, BiosecurityZone, PestSighting, BiosecurityProtocol, TraceabilityBatch, ProductionPlan, Subscription, SupportTicket, TicketMessage, SupportRating, FAQArticle, AutoResponse, Lead)
- backend/src/schemas/ — Pydantic v2 schemas
- backend/src/core/ — Business logic (security.py, rate_limit.py, plans.py, exceptions.py, email.py, stripe.py)
- backend/alembic/ — DB migrations

## Key Details
- 8 languages (ES, EN, PT, FR, DE, IT, JA, ZH)
- Multi-tenant: Organization → Farm → Flock → DailyProduction
- Offline-first: IndexedDB local, dual-write sync when online
- Pricing: Hobby $9/mo / Starter $19/mo / Pro $49/mo / Enterprise $99/mo (30-day free trial)
- 18 API route modules, 21+ SQLAlchemy models

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
- 8-language support with 17 new translation keys per language

## Active Work
- Post-launch: live at egglogu.com, monitoring and iterating
- Support module operational (tickets, FAQ, auto-responses, AI assistant v2.0)
- Sync strategy refinement (delta sync planned, currently full-push)
