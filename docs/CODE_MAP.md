# EGGlogU Code Map

> Single-file PWA: `egglogu.html` -- 7,272 lines, ~358 functions, ~723 KB

This document maps the major sections, functions, data model, and external dependencies of the EGGlogU codebase. It is intended to guide future development and eventual modularization.

---

## File Structure Overview

```
egglogu.html
  Lines 1-25      HTML head, meta tags, CSP, external scripts (Chart.js, Leaflet, MQTT, simple-statistics, Google Identity)
  Lines 26-288    <style> block -- all CSS (~263 lines, minified)
  Lines 289-405   HTML body -- login screen, confirm dialog, sidebar nav, section containers, modal, toast
  Lines 406-7272  <script> block -- all JavaScript
```

---

## Major Code Sections (by line range)

| Line Range   | Section                              | Description                                                                  |
|-------------|--------------------------------------|------------------------------------------------------------------------------|
| 1-25        | HTML Head                            | Meta tags, CSP policy, external library imports (Chart.js, Leaflet, MQTT, simple-statistics, Google Sign-In) |
| 26-288      | CSS Styles                           | Full stylesheet including responsive, dark mode, sidebar, cards, forms, modals, themes |
| 289-310     | Login Screen HTML                    | Social login buttons (Google, Apple, Microsoft), email/password fields, sign-up button |
| 311-378     | App Shell HTML                       | Sidebar navigation (18 sections grouped in 5 categories), language selector (8 langs), Campo/Vet mode toggles, logout |
| 379-397     | Section Containers                   | 18 `<div class="section">` containers (dashboard, produccion, lotes, sanidad, alimento, clientes, inventario, finanzas, analisis, operaciones, bioseguridad, trazabilidad, planificacion, ambiente, carencias, soporte, admin, config) |
| 398-406     | Modal + Toast HTML                   | Modal overlay with title/body, toast notification element |
| 407-445     | Global Error Handler + Bug Reporter  | `window.onerror` and `unhandledrejection` capture, error queue (`_bugErrors`), user-friendly toast on runtime errors |
| 446-891     | Translations (8 languages)           | `T` object with keys for ES, EN, PT, FR, DE, IT, JA, ZH -- ~400+ translation keys per language |
| 892-903     | Lifecycle Roadmap                    | `LIFECYCLE` array -- poultry lifecycle stages (cria, recria, pre-postura, postura, declive, muda, descarte) with week ranges and colors |
| 904-971     | Onboarding Tutorials                 | `ONBOARDING` object -- per-section tutorial content (title, description, tips) in all 8 languages |
| 972-1002    | Themes                               | `THEMES` object (blue, green, purple, black, dark) with CSS variable mappings; `applyTheme()` |
| 1003-1012   | Core Utilities                       | `t()` (translate), `fmtNum()`, `fmtMoney()`, `fmtDate()`, `genId()`, `currency()`, `todayStr()` |
| 1003-1012   | Security: XSS Prevention             | `sanitizeHTML()`, `escapeAttr()`, `safeHTML()` -- tag-stripping sanitizers |
| 1013-1074   | Security: Input Validation           | `validateInput()` (rules: required, maxLength, numeric, min, max, date), `validateForm()`, `showFieldError()`, `clearFieldErrors()` |
| 1055-1074   | UX: Custom Confirm Dialog            | `showConfirm()` returns Promise, `confirmYes()`, `confirmNo()` |
| 1075-1210   | API Service Layer                    | `apiService` object -- JWT token management, `_request()` with auto-refresh, auth endpoints (login, register, googleAuth, appleAuth, microsoftAuth, refresh, logout), sync endpoint, entity CRUD (farms, flocks, clients, billing) |
| 1211-1278   | Security: Authentication             | `hashPassword()` / `hashPin()` (SHA-256 + salt), `verifyPinHash()`, `migratePinIfNeeded()`, `isFirstRun()`, `isAuthenticated()`, rate limiting (loginAttempts, pinAttempts with 5-minute lockout) |
| 1279-1330   | Google Sign-In                       | `signInWithGoogle()`, `handleGoogleCallback()`, `createLocalOAuthUser()` |
| 1331-1358   | Apple Sign-In                        | `signInWithApple()` -- Apple OAuth flow via Apple JS SDK |
| 1359-1386   | Microsoft Sign-In                    | `signInWithMicrosoft()` -- Microsoft Identity OAuth flow via MSAL.js |
| 1387-1495   | Login/Logout Logic                   | `doLogin()` (email/password auth with server fallback to local), `doLogout()`, `checkAuth()` |
| 1496-1513   | Data Model (DEFAULT_DATA)            | Default data structure -- see "Data Model" section below |
| 1514-1552   | Commercial Breeds Database           | `COMMERCIAL_BREEDS` array (16 breeds) with eggs/year, egg color, egg weight, FCR; `BREED_CURVES` with weekly hen-day percentages (week 18-80) |
| 1553-1588   | Catalogs                             | `CATALOGS` object -- feedTypes, eggSizes, shellColors, yolkScores, deathCauses, vaccineTypes, medications, expenseCategories, incomeCategories, housingTypes, biosecurityZoneTypes |
| 1589-1760   | Catalog Translations (WALTZ)         | `CATALOG_T` -- translations for all catalog items in 8 languages |
| 1761-1763   | Locale Map (WALTZ)                   | `LOCALE_MAP` -- language code to locale string mapping |
| 1764-1821   | Catalog Helpers                      | `tc()` (translate catalog), `flockSelect()`, `houseSelect()`, `rackSelect()`, `routeSelect()`, `catalogSelect()`, `feedTypeSelect()`, `loadData()`, `saveData()` |
| 1822-1857   | Server Sync                          | `scheduleSyncToServer()`, `syncToServer()` -- dual-write to localStorage + API with 3-second debounce |
| 1858-1899   | Server Data Load                     | `loadFromServer()` -- initial hydration from API (farms, flocks, clients, billing) |
| 1900-1911   | Pagination System                    | `paginate()`, `paginationControls()` -- generic paginator for tables |
| 1912-2231   | VENG Validation Engines              | Zero-tolerance validation framework with 4 processors: GATE (input validation), XVAL (cross-validation), MATHV (math verification), TRACE (error tracing), CENSUS (aggregated deficiency report) |
| 2232-2240   | Audit Trail                          | `logAudit()` -- records create/update/delete operations with before/after snapshots |
| 2241-2276   | Auto-Backup via Cache API            | Automatic backups using browser Cache API with restore functionality |
| 2277-2355   | Role Permissions                     | `ROLE_PERMISSIONS` (owner, manager, operator, viewer), `hasPermission()`, custom permissions system |
| 2356-2380   | KPI Snapshot System                  | `takeKpiSnapshot()` -- daily KPI capture (total eggs, mortality, FCR, revenue, active flocks) |
| 2356-2446   | Dashboard Quick Entry                | `renderQuickEntry()` -- rapid data-entry widgets for daily production |
| 2447-2456   | Vaccine Schedule                     | `generateVaccineCalendar()` -- auto-generates vaccine schedule based on flock age and breed |
| 2457-2514   | UI Helpers                           | `toggleNavGroup()`, `HEAVY_SECTIONS`, render routing (`R` object maps section names to render functions) |
| 2473-2514   | Onboarding Tutorial System           | `renderOnboarding()`, `dismissTutorial()`, `_injectOnboarding()` -- overlay tutorial widgets |
| 2515-2526   | Navigation (`nav()`)                 | Core navigation function -- activates section, triggers render, handles heavy sections with loading spinner |
| 2527-2533   | Router (R object)                    | Maps section names to render functions |
| 2534-2560   | Toast, Empty State, Language Switch  | `toggleSidebar()`, `toast()`, `emptyState()`, `switchLang()` |
| 2561-2703   | Alerts System + Dashboard            | Alert generation, `renderDashboard()` -- KPI cards, production trend chart, weather widget, alerts, quick entry |
| 2704-2820   | Flocks Module                        | `renderFlocks()`, `showFlockForm()`, `saveFlock()`, `deleteFlock()`, `showFlockRoadmap()`, lifecycle stage calculations |
| 2821-2909   | Production Module                    | `renderProduction()`, `filterProd()`, `showProdForm()`, `saveProd()`, `deleteProd()` -- daily egg collection records with size breakdown |
| 2910-3094   | Sanidad (Health) Module              | `renderSanidad()` with 3 sub-tabs: Vaccines (`renderVaccinesTab`), Medications (`renderMedicationsTab`), Outbreaks (`renderOutbreaksTab`) |
| 3095-3193   | Feed Module                          | `renderFeed()` with sub-tabs: Purchases (`renderFeedPurchases`) and Consumption (`renderFeedConsumption`) |
| 3194-3254   | Clients Module                       | `renderClients()`, CRUD for client records (name, contact, type, route) |
| 3255-3307   | Inventory Module                     | `renderInventory()` -- egg inventory tracking (in/out movements by size) |
| 3308-3559   | Finances Module                      | `renderFinances()` with 4 sub-tabs: Income, Expenses, Receivables, Summary (P&L with depreciation, tax, margin analysis) |
| 3560-3685   | Analysis Module                      | `renderAnalysis()` with sub-tabs: Comparison (flock vs flock), Seasonality, Profitability (cost per egg, break-even), KPI Evolution charts |
| 3686-3810   | Operations Module                    | `renderOperations()` with sub-tabs: Daily Checklist, Logbook, Personnel management |
| 3811-3918   | Environment Module                   | `renderEnvironment()` with sub-tabs: Manual entry, IoT readings, History -- temperature, humidity, light hours, ventilation, density |
| 3919-4074   | Carencias (VENG Census) Module       | `renderCarencias()` -- aggregated deficiency/gap analysis across all data (missing records, validation failures, data quality scores) |
| 4075-4527   | Support Module (NEW)                 | `renderSoporte()` -- user support tickets (create/view/close), FAQ system with search and helpful votes, auto-responses per category |
| 4528-4887   | Admin SaaS Module                    | `renderAdmin()` -- user management (CRUD with roles), billing/subscription management (Stripe integration), plan tiers (Hobby/Starter/Pro/Enterprise), audit log viewer, owner protection, pending user deletion |
| 4888-5517   | Config Module                        | `renderConfig()` -- farm settings, alert thresholds, data export/import/reset, theme selection, font scale, checklist customization, weather API key, MQTT config, geolocation/map, houses/routes/suppliers management |
| 5518-5616   | Weather API (OpenWeatherMap)         | `fetchWeather()`, `fetchForecast()`, `renderWeatherWidget()`, `testWeatherApi()` -- current conditions + 3-day forecast with THI (Temperature-Humidity Index) alerts |
| 5617-5640   | Geolocation & Map (Leaflet)          | `initMap()`, `getGeolocation()` -- farm location picker with Leaflet.js map |
| 5641-5782   | IoT/MQTT Integration                 | `connectMQTT()`, `handleMqttMessage()` -- real-time sensor data via MQTT (mqtt.js) |
| 5783-5857   | Stress Events                        | `renderStressEventsTab()` -- heat/cold stress event tracking with THI calculations |
| 5858-6098   | Biosecurity Module                   | `renderBiosecurity()` with sub-tabs: Visitors log, Zones (risk areas), Pest Sightings, Protocols/procedures |
| 6099-6209   | Egg Traceability Module              | `renderTraceability()` -- batch traceability with QR code generation, chain-of-custody from flock to client |
| 6210-6293   | Production Planning Module           | `renderPlanning()` -- production targets, forecasting based on breed curves, planning vs actual comparison |
| 6294-6351   | Campo Mode                           | `toggleCampoMode()`, `renderCampoDashboard()` -- simplified field-worker interface (large buttons, quick entry only) |
| 6352-6402   | Vet Mode                             | `toggleVetMode()`, `renderVetFlock()` -- veterinarian-focused view (health records, vaccine status, outbreak history per flock) |
| 6403-6460   | Outbreak Risk Classifier (UI)        | Visual rendering of ML outbreak risk predictions |
| 6461-6492   | Multi-step Forecast (UI)             | Visual rendering of production forecasts with confidence intervals |
| 6493-6539   | Recommendation Engine                | Rule-based recommendations (feed adjustments, vaccine reminders, stocking density alerts) based on current farm state |
| 6540-6551   | Accessibility Helpers                | `applyFontScale()`, keyboard navigation, ARIA attribute injection |
| 6552-6832   | PIN Login System                     | `showPinLogin()`, `verifyPin()`, `showSignUp()`, `processSignUp()`, `showForgotPin()` -- offline PIN-based authentication with SHA-256 hashing, rate limiting, sign-up with server registration |
| 6833-6967   | Forgot Password                      | `showForgotPassword()`, `showForgotPasswordFromPin()`, server-side email reset via `apiService.forgotPassword()` and `apiService.resetPassword()`, email verification flow |
| 6968-7065   | Init                                 | `init()` -- boot sequence: handle URL params (reset token, verify token), refresh JWT, auth gate, load data, apply theme/settings, PIN login or dashboard, keyboard nav setup, focus trap |
| 7066-7266   | Bug Reporter Widget                  | Floating bug report button, bug panel UI, `renderBugPanel()`, bug submission/sending to server, local bug storage with 200-item cap |
| 7267-7272   | Service Worker Registration          | `navigator.serviceWorker.register('sw.js')` |

---

## Data Model

All application data is stored in `localStorage` under the key `egglogu_data` as a single JSON object. The default structure (`DEFAULT_DATA`, line 1409) is:

```javascript
{
  farm: {
    name: 'Mi Granja',
    location: '',
    capacity: 500,
    currency: '$',
    lat: null,                  // Geolocation latitude
    lng: null,                  // Geolocation longitude
    owmApiKey: '',              // OpenWeatherMap API key
    mqttBroker: '',             // MQTT broker URL
    mqttUser: '',               // MQTT username
    mqttPass: '',               // MQTT password
    mqttTopicPrefix: 'egglogu/',
    houses: [],                 // Farm houses/buildings [{id, name, capacity, racks:[]}]
    routes: [],                 // Delivery routes [{name, ...}]
    suppliers: []               // Suppliers [{name, ...}]
  },

  flocks: [{
    id, name, breed, count, status, housingType, targetCurve,
    curveAdjust, birthDate, purchaseDate, supplier, cost, notes
  }],

  dailyProduction: [{
    id, date, flockId, eggsCollected, eggsBroken,
    eggsS, eggsM, eggsL, eggsXL, eggsJumbo,
    shellColor, yolkScore, deaths, deathCause,
    eggType, marketChannel, notes
  }],

  vaccines: [{
    id, flockId, date, vaccine, dose, route, lot, technician, notes, status
  }],

  medications: [{
    id, flockId, date, name, dose, route, withdrawal, reason, notes
  }],

  outbreaks: [{
    id, flockId, date, disease, affected, deaths, treatment, status, notes
  }],

  feed: {
    purchases: [{id, date, type, brand, quantity, cost, supplier, notes}],
    consumption: [{id, date, flockId, type, quantity, notes}]
  },

  clients: [{
    id, name, contact, phone, email, type, route, address, notes
  }],

  finances: {
    income: [{id, date, category, description, amount, client, notes}],
    expenses: [{id, date, category, description, amount, notes}],
    receivables: [{id, clientId, date, amount, dueDate, status, notes}]
  },

  inventory: [{
    id, date, flockId, eggType, qtyIn, qtyOut, source, ref
  }],

  environment: [{
    id, date, houseId, temp, humidity, lightHours, ventilation, density, notes
  }],

  checklist: [{id, date, items: [{key, done}]}],
  logbook: [{id, date, entry, author}],
  personnel: [{id, name, role, phone, email, startDate, notes}],

  kpiSnapshots: [{date, totalEggs, mortality, fcr, revenue, activeFlocks}],
  weatherCache: [{date, temp, humidity, wind, description}],
  stressEvents: [{id, date, type, thi, duration, flockId, notes}],
  iotReadings: [{id, ts, sensor, value, unit}],
  predictions: [{id, date, type, value, confidence}],

  biosecurity: {
    visitors: [{id, date, name, company, purpose, approved, notes}],
    zones: [{id, name, riskLevel, description}],
    pestSightings: [{id, date, type, location, action, notes}],
    protocols: [{id, name, frequency, lastDone, notes}]
  },

  traceability: {
    batches: [{id, date, flockId, quantity, houseId, rack, destination, clientId, code, notes}]
  },

  productionPlans: [{id, flockId, startDate, endDate, targetEggs, notes}],
  auditLog: [{ts, action, module, detail, before, after}],

  users: [{
    id, name, email, role, pinHash, pinSalt, status, created
  }],

  pendingActivations: [],

  settings: {
    minFeedStock: 50,
    maxMortality: 5,
    alertDaysBefore: 3,
    campoMode: false,
    vetMode: false,
    fontScale: 'normal',
    darkMode: false,
    dismissedTutorials: [],
    plan: {
      tier: 'hobby',           // hobby | starter | pro | enterprise
      baseCost: 9,             // $9 / $19 / $49 / $99 per month
      includedUsers: 1,
      extraUserCost: 2.99,
      billingCycle: 'monthly',
      currency: 'USD',
      startDate: '',
      upgradedAt: ''
    },
    ownerEmail: '',
    taxRate: 0,
    depreciationYears: 5,
    assetValue: 0,
    defaultChecklist: [
      'chk_collect_eggs', 'chk_feed_birds', 'chk_check_water',
      'chk_check_health', 'chk_cleaning', 'chk_record_temp'
    ]
  }
}
```

### Other localStorage Keys

| Key                       | Purpose                              |
|---------------------------|--------------------------------------|
| `egglogu_data`            | Main data blob (JSON)                |
| `egglogu_auth`            | Local auth credentials `{user, hash, salt}` (SHA-256) |
| `egglogu_session`         | Session flag in `sessionStorage`     |
| `egglogu_tokens`          | JWT access + refresh tokens (JSON)   |
| `egglogu_lang`            | Selected language code (es/en/pt/fr/de/it/ja/zh) |
| `egglogu_theme`           | Selected theme name (blue/green/purple/black/dark) |
| `egglogu_last_sync`       | ISO timestamp of last server sync    |
| `egglogu_api_base`        | Override API base URL                |
| `egglogu_google_client_id`| Google OAuth client ID               |
| `egglogu_bugs`            | Bug reports queue (JSON array, max 200) |

---

## API Endpoints Used

Base URL: `https://api.egglogu.com/api/v1` (overridable via `egglogu_api_base`)

| Method | Path                      | Purpose                            |
|--------|---------------------------|------------------------------------|
| GET    | /auth/config              | Available OAuth providers          |
| POST   | /auth/login               | Email/password login               |
| POST   | /auth/register            | New account registration           |
| POST   | /auth/google              | Google OAuth token exchange        |
| POST   | /auth/apple               | Apple Sign-In token exchange       |
| POST   | /auth/microsoft           | Microsoft Identity token exchange  |
| POST   | /auth/refresh             | JWT token refresh                  |
| POST   | /auth/logout              | Server logout                      |
| POST   | /auth/resend-verification | Resend email verification          |
| POST   | /auth/verify-email        | Verify email with token            |
| POST   | /auth/forgot-password     | Request password reset email       |
| POST   | /auth/reset-password      | Reset password with token          |
| POST   | /auth/send-team-invite    | Invite user by email with role     |
| GET    | /auth/me                  | Get current user profile           |
| POST   | /sync                     | Bulk data push (full dataset)      |
| GET    | /farms                    | List farms                         |
| GET    | /flocks                   | List flocks                        |
| GET    | /clients                  | List clients                       |
| GET    | /billing/status           | Get subscription status            |
| POST   | /billing/checkout         | Create Stripe checkout session     |
| GET    | /billing/portal           | Get Stripe customer portal URL     |
| GET    | /support/faq              | List FAQ articles                  |
| POST   | /support/faq/{id}/helpful | Vote FAQ article as helpful        |
| GET    | /support/tickets          | List user's support tickets        |
| POST   | /support/tickets          | Create support ticket              |
| POST   | /support/tickets/{id}/messages | Add message to ticket         |
| POST   | /support/tickets/{id}/close    | Close a ticket               |
| POST   | /support/tickets/{id}/rate     | Rate support experience      |
| GET    | /support/sync             | Sync support data                  |
| POST   | /leads                    | Lead capture (landing page)        |
| GET    | /health                   | Healthcheck (load balancer)        |

### External APIs

| Service              | Usage                                    |
|----------------------|------------------------------------------|
| OpenWeatherMap       | Current weather + 3-day forecast (user provides API key) |
| Google Identity      | OAuth2 sign-in (`accounts.google.com`)   |
| Apple Sign-In        | OAuth2 sign-in (`appleid.apple.com`)     |
| Microsoft Identity   | OAuth2 sign-in (`login.microsoftonline.com`) |
| ip-api.com           | IP-based geolocation on signup           |
| Resend               | Email verification, password reset, team invites |
| Stripe               | Billing, checkout sessions, customer portal, webhooks |
| MQTT Broker          | IoT sensor data (user-configured)        |

---

## External Libraries (loaded via CDN)

| Library              | Version | Purpose                              |
|----------------------|---------|--------------------------------------|
| Chart.js             | 4.4.7   | Production trend charts, KPI evolution graphs, seasonality charts |
| Leaflet              | 1.9.4   | Farm location map picker             |
| mqtt.js              | 5.14.1  | MQTT client for IoT sensor integration |
| simple-statistics    | 7.8.8   | Linear regression, z-score, statistical calculations for ML predictions |
| Google Identity      | -       | Google Sign-In button + callback     |

---

## Navigation Architecture

The app uses a single-page architecture with 18 sections. The `nav(section)` function (line 2515):

1. Hides all sections, shows the target section.
2. Updates sidebar active states.
3. Triggers the section's render function via the `R` routing object (line 2527).
4. Heavy sections (dashboard, analisis, finanzas, bioseguridad, trazabilidad, carencias, admin, soporte) show a loading spinner and render in a `requestAnimationFrame` callback.
5. Injects onboarding tutorials for first-time visitors.
6. Applies ARIA attributes post-render.

### Section Groups (Sidebar)

1. **Principal**: Dashboard, Produccion, Lotes, Alimento, Ambiente
2. **Salud**: Sanidad, Bioseguridad
3. **Negocio**: Clientes, Inventario, Finanzas
4. **Avanzado**: Analisis, Operaciones, Trazabilidad, Planificacion, Carencias
5. **Soporte**: Soporte (tickets, FAQ)
6. **Sistema**: Admin, Config

### Special Modes

- **Campo Mode** (line 6294): Simplified interface for field workers -- hides advanced sections, shows large quick-entry buttons.
- **Vet Mode** (line 6352): Veterinarian-focused view -- emphasizes health records, vaccines, outbreaks per flock.

---

## Authentication Flow

1. **Fresh start (no data)**: Login screen shows with email/password fields + social login buttons (Google, Apple, Microsoft).
2. **Email/password registration**: `doLogin()` creates local auth entry (SHA-256 hashed password + salt). If online, registers with server and sends email verification via Resend API. User must verify email before first login.
3. **Google OAuth** (line 1279): `signInWithGoogle()` via Google Identity Services SDK → server exchanges token at `/auth/google`.
4. **Apple Sign-In** (line 1331): `signInWithApple()` via Apple JS SDK → server exchanges token at `/auth/apple`.
5. **Microsoft Identity** (line 1359): `signInWithMicrosoft()` via MSAL.js → server exchanges token at `/auth/microsoft`.
6. **Return visit with users**: PIN login overlay appears. User selects their name from dropdown, enters 4-digit PIN.
7. **JWT session**: If JWT refresh token exists and device is online, auto-refreshes token and skips PIN.
8. **Team invites**: Owner/admin can invite users by email via `/auth/send-team-invite`. Invitee receives email with activation link.
9. **Rate limiting**: 5 failed PIN attempts triggers 5-minute lockout with countdown timer. Server-side: 5 login/min, 3 register/min.

---

## Key Architectural Patterns

1. **Single-file PWA**: Everything in one HTML file for maximum offline reliability. Service Worker (`sw.js`) caches the file.
2. **Dual-write storage**: Every save writes to both localStorage and schedules an API sync (if authenticated).
3. **VENG validation**: Multi-layer validation engine (GATE, XVAL, MATHV, TRACE, CENSUS) ensures data quality before saving. Warnings are shown but can be acknowledged; errors block saves.
4. **Audit trail**: All CRUD operations are logged with before/after snapshots.
5. **Catalog-driven UI**: Dropdowns populated from `CATALOGS` object rather than free-text, reducing data entry errors.
6. **i18n via `t()` function**: All user-facing text goes through the translation function. HTML elements with `data-t` attributes are auto-translated on language switch.
7. **Auto-backup**: Cache API stores periodic backups independently of localStorage.
8. **Role-based access**: 4 roles (owner, manager, operator, viewer) with section-level permissions.

---

## Modularization Candidates

For future refactoring into separate files/modules:

| Candidate              | Lines     | Priority | Notes                                    |
|------------------------|-----------|----------|------------------------------------------|
| Translations (T)       | 446-891   | HIGH     | ~445 lines, easy to extract to JSON      |
| Catalog Translations   | 1589-1760 | HIGH     | ~170 lines, pure data                    |
| VENG Validation        | 1912-2231 | MEDIUM   | ~320 lines, self-contained engine        |
| Support Module         | 4075-4527 | MEDIUM   | ~450 lines, self-contained module        |
| Breeds + Curves        | 1514-1552 | LOW      | ~40 lines, pure data                     |
| Catalogs               | 1553-1588 | LOW      | ~35 lines, pure data                     |
| API Service Layer      | 1075-1210 | MEDIUM   | ~135 lines, isolated with clear interface|
| Bug Reporter           | 7066-7266 | LOW      | ~200 lines, fully self-contained widget  |
