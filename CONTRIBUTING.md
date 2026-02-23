# Contributing to EGGlogU

Thank you for your interest in contributing to EGGlogU, a Poultry Farm Management SaaS platform. This guide will help you set up your development environment and understand the contribution workflow.

---

## Project Overview

EGGlogU is an offline-first, multi-tenant PWA for poultry farm management. It handles production tracking, flock health, feed management, biosecurity, traceability, financials, IoT environment monitoring, and client management. The platform supports 8 languages and is built for both small farms and enterprise operations.

**Key characteristics:**

- Multi-tenant architecture: Organization > Farm > House > DailyRecord
- Offline-first: IndexedDB local storage with background sync
- SaaS billing via Stripe (Hobby / Starter / Pro / Enterprise tiers)
- JWT + Google OAuth authentication with offline PIN fallback

---

## Tech Stack

| Layer     | Technology                                              |
|-----------|---------------------------------------------------------|
| Backend   | Python 3.12, FastAPI 0.115, SQLAlchemy 2.0 (async), Pydantic v2 |
| Database  | PostgreSQL 16 (via asyncpg), Alembic migrations        |
| Cache     | Redis 7 (rate limiting, session data)                   |
| Frontend  | Single-file HTML (`egglogu.html`, 7,272 lines), vanilla JS, Tailwind CSS, IndexedDB |
| Auth      | JWT (python-jose), Google OAuth, Apple Sign-In, Microsoft Identity, bcrypt password hashing |
| Payments  | Stripe (subscriptions + webhooks)                       |
| Email     | Resend API (verification, password reset, team invites) |
| Container | Docker, Docker Compose                                  |
| Tests     | pytest + pytest-asyncio (backend), JS unit tests (frontend) |

---

## Code Structure

```
EGGlogU/
├── egglogu.html              # Frontend PWA (single-file, 7,272 lines)
├── sw.js                     # Service Worker for offline support
├── manifest.json             # PWA manifest
├── backend/
│   ├── docker-compose.yml    # PostgreSQL + Redis + App
│   ├── Dockerfile            # Python 3.12-slim container
│   ├── requirements.txt      # Python dependencies
│   ├── alembic/              # Database migrations
│   ├── alembic.ini
│   ├── src/
│   │   ├── main.py           # FastAPI app, middleware, router registration
│   │   ├── config.py         # Pydantic Settings (reads .env)
│   │   ├── database.py       # Async SQLAlchemy engine + session
│   │   ├── api/              # Route modules (18 domain modules)
│   │   │   ├── auth.py       # Register, login, OAuth (Google/Apple/Microsoft), password reset, team invites
│   │   │   ├── farms.py      # Farm CRUD
│   │   │   ├── flocks.py     # Flock lifecycle
│   │   │   ├── production.py # Daily egg production records
│   │   │   ├── health.py     # Flock health & mortality
│   │   │   ├── feed.py       # Feed inventory & FCR
│   │   │   ├── finance.py    # Revenue, expenses, P&L
│   │   │   ├── environment.py# IoT sensor readings
│   │   │   ├── biosecurity.py# Biosecurity protocols
│   │   │   ├── traceability.py# Lot traceability
│   │   │   ├── planning.py   # Production planning
│   │   │   ├── billing.py    # Stripe subscriptions
│   │   │   ├── support.py    # Support tickets, FAQ, auto-responses
│   │   │   ├── clients.py    # B2B client management
│   │   │   ├── operations.py # Operational tasks
│   │   │   ├── sync.py       # Offline data synchronization
│   │   │   ├── healthcheck.py# /api/health endpoint for LB probes
│   │   │   ├── leads.py      # Lead capture for landing page
│   │   │   ├── trace_public.py # Public QR traceability
│   │   │   └── deps.py       # Shared dependencies (auth, plan checks)
│   │   ├── core/             # Business logic & utilities
│   │   │   ├── security.py   # JWT creation/verification, bcrypt
│   │   │   ├── rate_limit.py # Redis-based rate limiting
│   │   │   ├── plans.py      # Plan feature gates & tier limits
│   │   │   ├── exceptions.py # HTTP exception classes
│   │   │   ├── email.py      # Resend email integration
│   │   │   └── stripe.py     # Stripe helpers
│   │   ├── models/           # SQLAlchemy ORM models (21+ models)
│   │   │   ├── base.py       # TimestampMixin, SoftDeleteMixin, TenantMixin
│   │   │   ├── auth.py       # Organization, User, Role
│   │   │   ├── farm.py       # Farm
│   │   │   ├── flock.py      # Flock, BreedCurve
│   │   │   ├── production.py # DailyProduction
│   │   │   ├── health.py     # Vaccine, Medication, Outbreak, StressEvent
│   │   │   ├── feed.py       # FeedPurchase, FeedConsumption
│   │   │   ├── client.py     # Client
│   │   │   ├── finance.py    # Income, Expense, Receivable
│   │   │   ├── environment.py# EnvironmentReading, IoTReading, WeatherCache
│   │   │   ├── operations.py # ChecklistItem, LogbookEntry, Personnel
│   │   │   ├── analytics.py  # KPISnapshot, Prediction
│   │   │   ├── biosecurity.py# BiosecurityVisitor, BiosecurityZone, PestSighting, BiosecurityProtocol
│   │   │   ├── traceability.py# TraceabilityBatch
│   │   │   ├── planning.py   # ProductionPlan
│   │   │   ├── subscription.py# Subscription
│   │   │   ├── support.py    # SupportTicket, TicketMessage, SupportRating, FAQArticle, AutoResponse
│   │   │   └── lead.py       # Lead
│   │   └── schemas/          # Pydantic request/response schemas
│   └── tests/                # Backend test suite
│       ├── conftest.py       # Fixtures (async DB, test client)
│       ├── test_auth.py
│       ├── test_farms.py
│       └── test_health.py
├── tests/                    # Frontend / E2E tests
│   ├── egglogu.test.js
│   └── e2e/
└── docs/                     # Additional documentation
```

---

## Development Environment Setup

### Prerequisites

- Python 3.12+
- Docker and Docker Compose
- Git
- (Optional) Node.js 18+ for frontend tests

### 1. Clone the Repository

```bash
git clone <repository-url>
cd EGGlogU
```

### 2. Start Infrastructure (PostgreSQL + Redis)

```bash
cd backend
docker compose up -d postgres redis
```

This starts PostgreSQL 16 on port 5432 and Redis 7 on port 6379.

### 3. Create a Virtual Environment

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Configure Environment Variables

```bash
cp .env.example .env   # if available, otherwise create manually
```

At minimum, set these in `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://egglogu:egglogu@localhost:5432/egglogu
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=<generate-a-strong-random-string>
FRONTEND_URL=http://localhost:3000

# OAuth (optional for local dev)
GOOGLE_CLIENT_ID=<your-google-client-id>
APPLE_CLIENT_ID=<your-apple-client-id>
APPLE_TEAM_ID=<your-apple-team-id>
APPLE_KEY_ID=<your-apple-key-id>
MICROSOFT_CLIENT_ID=<your-microsoft-client-id>
MICROSOFT_TENANT_ID=<your-microsoft-tenant-id>

# Email (optional for local dev)
RESEND_API_KEY=<your-resend-api-key>

# Payments (optional for local dev)
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
```

**Never commit `.env` files.** They are already in `.gitignore`.

### 5. Run Database Migrations

```bash
cd backend
alembic upgrade head
```

### 6. Start the Backend

```bash
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 7. Serve the Frontend (for local development)

Any static file server works since the frontend is a single HTML file:

```bash
# From project root
python -m http.server 3000
```

Then open `http://localhost:3000/egglogu.html`.

---

## Running Tests

### Backend Tests

```bash
cd backend
pytest                    # Run all tests
pytest tests/test_auth.py # Run a specific file
pytest -v                 # Verbose output
pytest -x                 # Stop on first failure
```

Tests use `aiosqlite` as an in-memory SQLite backend, so no external database is needed.

### Frontend Tests

```bash
# From project root
npm test                  # or: node egglogu.test.js
```

---

## How to Deploy

### Docker Compose (Full Stack)

```bash
cd backend
docker compose up --build -d
```

This builds the app image and starts all three services (app, postgres, redis).

### Production Deployment

- **Frontend**: Deployed to Cloudflare Pages at `egglogu.com`
- **Backend API**: Deployed on VPS GoldHuevos at `api.egglogu.com` via Docker Compose
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`)

Set all required environment variables in the VPS `.env` file. Ensure `JWT_SECRET_KEY` is a strong, unique secret (the app refuses to start if it detects the default value).

### Database Migrations in Production

```bash
alembic upgrade head
```

Always run migrations before deploying a new version that includes model changes.

---

## Code Style Guidelines

### Python (Backend)

- **Formatter:** Follow PEP 8. Use 4-space indentation, 120-character max line length.
- **Type hints:** Required on all function signatures. Use `Mapped[]` for SQLAlchemy columns.
- **Async everywhere:** All database operations must be async (`AsyncSession`, `await`).
- **Naming conventions:**
  - Files: `snake_case.py`
  - Classes: `PascalCase`
  - Functions/variables: `snake_case`
  - Constants: `UPPER_SNAKE_CASE`
- **Imports:** Group as stdlib, third-party, local. Sort alphabetically within groups.
- **Models:** Always include `TimestampMixin` (created_at/updated_at). Multi-tenant models include `TenantMixin`.
- **Schemas:** Use Pydantic v2 `model_validate()`, not deprecated v1 methods.
- **Error handling:** Use the exception classes in `src/core/exceptions.py` (`NotFoundError`, `ForbiddenError`, etc.). Never return raw 500 errors.

### JavaScript (Frontend)

- Vanilla JS only (no frameworks).
- Functions prefixed by module: `prod_`, `health_`, `feed_`, etc.
- All user-facing strings must go through the i18n translation system (8 languages).
- IndexedDB operations must handle offline gracefully.

---

## Pull Request Process

1. **Branch from `main`:** Create a feature branch with a descriptive name.
   ```bash
   git checkout -b feat/add-export-csv
   ```

2. **Keep commits focused:** Each commit should represent one logical change. Use conventional commit prefixes:
   - `feat:` new feature
   - `fix:` bug fix
   - `ui:` visual/UX changes
   - `security:` security improvements
   - `docs:` documentation only
   - `refactor:` code restructuring without behavior change
   - `test:` adding/updating tests

3. **Write/update tests:** All new API endpoints must have corresponding tests in `backend/tests/`.

4. **Run tests locally:** Ensure `pytest` passes with zero failures before pushing.

5. **Open a PR against `main`:**
   - Title: short, imperative summary (e.g., "Add CSV export for production records")
   - Description: explain *what* changed and *why*. Include screenshots for UI changes.
   - Link related issues if applicable.

6. **Review checklist:**
   - [ ] Tests pass
   - [ ] No secrets in committed files
   - [ ] Database migrations included if models changed (`alembic revision --autogenerate -m "description"`)
   - [ ] New endpoints documented in schema (FastAPI auto-generates from type hints)
   - [ ] Multi-language strings added for both ES and EN at minimum

7. **Merge:** After approval, squash-merge into `main`.

---

## Questions?

Open an issue in the repository or reach out to the maintainers. We appreciate every contribution, from typo fixes to major features.
