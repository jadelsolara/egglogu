# Changelog

All notable changes to the EGGlogU project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2026-02-22

### Added
- Google OAuth authentication via Google Identity Services
- Apple Sign-In OAuth authentication
- Microsoft Identity OAuth authentication
- Email verification flow via Resend API (required before first login)
- Team invite emails — owners can invite users by email with role assignment
- Geolocation capture and IP-based location via ip-api.com
- UTM tracking for marketing attribution on signup
- Support module: ticket system with priority, status, and SLA tracking
- Support FAQ system with helpful vote tracking
- Support auto-responses for common ticket categories
- Support admin panel: ticket management, analytics, FAQ/auto-response CRUD
- Owner protection — owner account cannot be deactivated or role-changed
- Pending user deletion — admins can remove users awaiting activation
- Trial banner — 30-day free Enterprise trial with countdown
- Healthcheck endpoint at `/api/health` for load balancer probes
- Global rate limiting middleware (120 req/min per IP via Redis)
- Per-endpoint rate limiting on sensitive routes (login, register, password reset)
- Security headers middleware: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
- Lead capture endpoint at `/api/leads` for landing page signups
- Stripe billing integration: checkout sessions, customer portal, webhook handling
- 21+ SQLAlchemy models covering all domain entities
- Alembic database migrations

### Changed
- Pricing restructured to Hobby $9/mo / Starter $19/mo / Pro $49/mo / Enterprise $99/mo (4 tiers + suspended)
- API base URL moved from Railway to `api.egglogu.com` (VPS GoldHuevos)
- Frontend deployment moved to Cloudflare Pages at `egglogu.com`
- Backend deployment moved from Railway to dedicated VPS with Docker Compose
- Frontend expanded from ~6,000 to 7,272 lines
- Auth config endpoint exposes available OAuth providers dynamically
- Backend API version updated to 3.0.0
- Exception handlers now return clean 422/500 responses without leaking internals

### Fixed
- Owner self-deactivation prevention (owners can no longer deactivate themselves)
- Language selector behavior on mobile devices
- Mobile layout responsiveness across all modules

### Security
- JWT secret validation on startup — app refuses to start with default secret
- bcrypt password hashing (replaced PBKDF2)
- Restricted CORS origins (no wildcards, explicit frontend URL only)
- Docs/Redoc hidden in production to reduce attack surface
- Rate limiting on auth endpoints: 5 login attempts/min, 3 register attempts/min

## [3.0.0] - 2026-02-16

### Added
- Login, signup, and forgot-PIN flows with full form validation
- Onboarding tutorials per module for new users
- Inventory management system
- Audit trail for all critical operations
- Pagination across data-heavy views
- In-app bug reporter for user feedback
- Admin billing dashboard
- SaaS admin dashboard with sidebar collapse and pricing cards
- Client access roles and permissions
- Collapsible sidebar groups for navigation
- Accordion-style pricing section
- Vet mode with dedicated UI

### Changed
- Language selector redesigned as collapsible dropdown with country flags
- Per-user volume pricing model ($4.99 down to $2.49 at scale) with reinvestment philosophy
- Pricing tiers restructured to $19/$39/$79 with 20 modules
- Language buttons restored with white text for readability
- All deploy copies synced to single source of truth

### Fixed
- Language button styling (white text on dark background)
- `index.html` now correctly serves the landing page; app moved to `egglogu.html`
- Vet mode toggle behavior in sidebar

## [2.0.0] - 2026-02-15

### Added
- Zero Tolerance quality campaign
- Commercialization framework with 20 production modules

### Security
- PBKDF2 password hashing
- Rate limiting on auth endpoints
- Content Security Policy (CSP) headers
- Global error handler to prevent stack trace leaks

## [1.2.0] - 2026-02-12

### Added
- Commercial breeds system with breed-specific production parameters
- Favicon redesign (chicken-in-egg logo)
- Full live deployment pipeline

### Changed
- Auto-save snapshots of `egglogu.html` during active development sessions

## [1.1.0] - 2026-02-10

### Added
- Auto-detect device language for campaign/landing page
- EGGlogU 360 rebrand with chicken-in-egg logo
- Dedicated campaign page for marketing
- EGGlogU v3 feature set: 10 new features for competitive parity

### Fixed
- Campaign page language auto-detection now correctly reads `navigator.language`

## [1.0.0] - 2026-02-09

### Added
- Initial backend scaffold: FastAPI + SQLAlchemy + PostgreSQL + Redis
- JWT authentication with access and refresh tokens
- Multi-tenant data model (Organization, Farm, House, DailyRecord)
- API routes: auth, farms, flocks, production, health, feed
- Docker Compose for local development (postgres, redis, app)
- Hosting/landing pages
