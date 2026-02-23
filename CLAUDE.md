# EGGlogU — Poultry Farm Management SaaS

## Stack
Frontend: Single HTML (egglogu.html, 7,272 lines), vanilla JS, IndexedDB offline, Service Worker PWA
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

## Active Work
- Post-launch: live at egglogu.com, monitoring and iterating
- Support module operational (tickets, FAQ, auto-responses)
- Sync strategy refinement (delta sync planned, currently full-push)
