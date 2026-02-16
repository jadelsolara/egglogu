# EGGlogU Enterprise — Arquitectura SaaS de Grado Industrial

**Versión:** 1.0.0
**Fecha:** 2026-02-15
**Clasificación:** Documento Estratégico — Arquitectura de Producto
**Autor:** Jose Antonio / GenieOS

---

## Tabla de Contenidos

1. [Estado Actual vs Estado Objetivo](#1-estado-actual-vs-estado-objetivo)
2. [Arquitectura de Infraestructura](#2-arquitectura-de-infraestructura)
3. [Modelo de Datos — PostgreSQL Multi-Tenant](#3-modelo-de-datos--postgresql-multi-tenant)
4. [Pipeline de Bugs Autorreparable](#4-pipeline-de-bugs-autorreparable)
5. [Sistema de Actualizaciones Obligatorias](#5-sistema-de-actualizaciones-obligatorias)
6. [Aislamiento de Fallos — Zero Contagion](#6-aislamiento-de-fallos--zero-contagion)
7. [Notificaciones Esenciales](#7-notificaciones-esenciales)
8. [Escalamiento — De 1 Granja a 10 Millones](#8-escalamiento--de-1-granja-a-10-millones)
9. [Tiers de Servicio](#9-tiers-de-servicio)
10. [Seguridad y Compliance](#10-seguridad-y-compliance)
11. [Costos de Infraestructura](#11-costos-de-infraestructura)
12. [Roadmap de Migración](#12-roadmap-de-migración)
13. [SLA y Garantías](#13-sla-y-garantías)
14. [Análisis de Saturación Post-Migración](#14-análisis-de-saturación-post-migración)
15. [Command Center Global](#15-command-center-global--panel-ejecutivo-del-fundador)
16. [FarmlogU — El Paraguas Multi-Especie](#16-farmlogu--el-paraguas-multi-especie)
    - 16.9 [Posicionamiento de Marca — "The Necessary Farm Tool"](#169-posicionamiento-de-marca--the-necessary-farm-tool)
    - 16.10 [Portabilidad de Datos — "La Jaula Abierta"](#1610-portabilidad-de-datos--la-jaula-abierta)
    - 16.11 [Core Invariants](#1611-lo-que-nunca-cambia-core-invariants)

---

## 1. Estado Actual vs Estado Objetivo

### 1.1 Estado Actual (v1.0 — PWA Offline)

| Dimensión | Valor Actual | Límite |
|-----------|-------------|--------|
| Arquitectura | Single HTML (4,025 líneas) | No escala a equipo |
| Almacenamiento | localStorage | **5 MB techo duro** |
| Backend | Ninguno | No hay API |
| Base de datos | JSON en navegador | Sin queries, sin índices |
| Autenticación | PIN 4 dígitos local | Sin verificación real |
| Sincronización | Ninguna | Datos atrapados en 1 dispositivo |
| Bug reporting | Ninguno | Usuario pierde datos sin aviso |
| Actualizaciones | Manual (re-descargar HTML) | Versiones divergen |
| Aislamiento | Total (cada navegador es isla) | Sin datos agregados |
| Notificaciones | Ninguna | Sin alertas de producción |
| Soporte empresarial | No existe | No apto para industria |

### 1.2 Datos Reales — Simulación MEGA (28 parvadas, 15,464 gallinas, 1,000 clientes)

| Módulo | Registros | Peso | % del Total |
|--------|-----------|------|-------------|
| dailyProduction | 10,220 | 3,158 KB | 62.4% |
| inventory | 4,096 | 549 KB | 10.9% |
| finances (income+expenses) | 2,479 | 494 KB | 9.8% |
| clients | 1,000 | 315 KB | 6.2% |
| feed (purchases+consumption) | 1,519 | 168 KB | 3.3% |
| vaccines | 668 | 143 KB | 2.8% |
| auditLog | 444 | 75 KB | 1.5% |
| environment | 365 | 66 KB | 1.3% |
| biosecurity | 206 | 33 KB | 0.6% |
| Otros (checklist, logbook, kpi, flocks, users) | 232 | 53 KB | 1.2% |
| **TOTAL** | **21,229** | **4.94 MB** | **98.8% de 5 MB** |

### 1.3 Punto de Saturación Actual

| Tipo de Granja | Clientes | Parvadas | Gallinas | 1 Año | Años hasta 5 MB |
|----------------|----------|----------|----------|-------|-----------------|
| Familiar | 30-50 | 3-5 | 500-2K | 0.15 MB | **34 años** |
| Pequeña | 100 | 5 | 2K | 0.49 MB | **10 años** |
| Mediana | 500 | 15 | 8K | 2.47 MB | **2 años** |
| Grande/Industrial | 1,000+ | 28+ | 15K+ | 4.94 MB | **1 año** |

### 1.4 Estado Objetivo (v2.0 — Enterprise SaaS)

| Dimensión | Objetivo |
|-----------|---------|
| Arquitectura | Microservicios containerizados (Docker/K8s) |
| Almacenamiento | PostgreSQL + Redis + S3 (sin límite práctico) |
| Backend | API REST + WebSocket (real-time) |
| Base de datos | PostgreSQL con particionamiento por tenant + índices |
| Autenticación | OAuth 2.0 + MFA + SSO empresarial |
| Sincronización | Real-time multi-dispositivo + offline-first con sync |
| Bug reporting | **Automático** — detección → reporte → fix → deploy |
| Actualizaciones | **Obligatorias** — Service Worker force-update |
| Aislamiento | **Fallo en Granja A jamás afecta Granja B** |
| Notificaciones | Solo esenciales: producción + bugs críticos |
| Soporte empresarial | SLA 99.95%, soporte dedicado, on-premise opcional |

---

## 2. Arquitectura de Infraestructura

### 2.1 Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE CLIENTE (PWA)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Chrome   │  │ Safari   │  │ Firefox  │  │ App Nativa│        │
│  │ (desktop)│  │ (iOS)    │  │ (Android)│  │ (Electron)│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬──────┘        │
│       │              │              │              │              │
│  ┌────┴──────────────┴──────────────┴──────────────┴──────┐      │
│  │              SERVICE WORKER (v2)                        │      │
│  │  • Cache-first para assets                              │      │
│  │  • Network-first para datos                             │      │
│  │  • Force-update cuando hay nueva versión                │      │
│  │  • Error capture + auto-report                          │      │
│  │  • IndexedDB local (offline queue)                      │      │
│  └────────────────────────┬───────────────────────────────┘      │
└───────────────────────────┼──────────────────────────────────────┘
                            │ HTTPS + WSS
┌───────────────────────────┼──────────────────────────────────────┐
│                     CAPA DE EDGE                                 │
│  ┌────────────────────────┴───────────────────────────────┐      │
│  │              CLOUDFLARE (CDN + WAF + DDoS)              │      │
│  │  • 330+ PoPs globales                                   │      │
│  │  • Rate limiting: 100 req/min por tenant                │      │
│  │  • WAF rules: OWASP Top 10                              │      │
│  │  • Edge caching para assets estáticos                   │      │
│  └────────────────────────┬───────────────────────────────┘      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                     CAPA DE API                                  │
│  ┌────────────────────────┴───────────────────────────────┐      │
│  │              LOAD BALANCER (nginx / Cloudflare LB)      │      │
│  └───┬──────────┬──────────┬──────────┬──────────┬───────┘      │
│      │          │          │          │          │                │
│  ┌───┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐            │
│  │ API-1 │  │ API-2│  │ API-3│  │ API-4│  │ API-N│            │
│  │(Node) │  │      │  │      │  │      │  │      │            │
│  └───┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘            │
│      │         │         │         │         │                  │
│  ┌───┴─────────┴─────────┴─────────┴─────────┴──────────┐      │
│  │              MESSAGE QUEUE (Redis Streams)             │      │
│  │  • Bug reports (prioridad alta)                        │      │
│  │  • Sync events (prioridad media)                       │      │
│  │  • Analytics (prioridad baja, batch)                   │      │
│  └──────────────────────┬────────────────────────────────┘      │
└─────────────────────────┼────────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────────┐
│                    CAPA DE SERVICIOS                              │
│  ┌──────────┐  ┌────────┴──┐  ┌──────────┐  ┌──────────┐        │
│  │ AUTH     │  │ SYNC      │  │ BUG      │  │ NOTIFY   │        │
│  │ Service  │  │ Service   │  │ Pipeline │  │ Service  │        │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘        │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐        │
│  │ BILLING  │  │ ANALYTICS │  │ UPDATE   │  │ EXPORT   │        │
│  │ Service  │  │ Service   │  │ Service  │  │ Service  │        │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘        │
└──────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────────┐
│                    CAPA DE DATOS                                 │
│  ┌──────────┐  ┌────────┴──┐  ┌──────────┐  ┌──────────┐        │
│  │PostgreSQL│  │ Redis     │  │ S3       │  │ClickHouse│        │
│  │ (OLTP)   │  │ (Cache +  │  │ (Backups │  │ (Analytics│        │
│  │ Primary  │  │  Sessions │  │  + Media)│  │  OLAP)   │        │
│  │ + Replica│  │  + Queue) │  │          │  │          │        │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Stack Tecnológico

| Componente | Tecnología | Justificación |
|------------|-----------|---------------|
| **Frontend** | PWA (HTML/JS/CSS) → evoluciona a React/Svelte | Mantiene offline-first, agrega real-time |
| **API** | Node.js + Fastify | Misma base de código, 2x más rápido que Express |
| **DB Primaria** | PostgreSQL 16 | ACID, particionamiento nativo, JSON/JSONB, extensiones geográficas |
| **Cache** | Redis 7 | Sessions, rate limiting, pub/sub para real-time, queue para bugs |
| **Object Storage** | S3/R2 (Cloudflare) | Backups, exports, media (fotos de parvadas) |
| **Analytics** | ClickHouse | Columnar, 100x más rápido que PG para aggregations sobre millones de rows |
| **CDN/WAF** | Cloudflare | Ya contratado, 330+ PoPs, DDoS gratis |
| **Containers** | Docker + K8s (o Fly.io para MVP) | Auto-scaling, rolling updates, zero-downtime deploy |
| **CI/CD** | GitHub Actions | Gratis para repos privados, integra con todo |
| **Monitoring** | Prometheus + Grafana | Open source, estándar industria |
| **Error Tracking** | Sentry (self-hosted o cloud) | Stack traces, breadcrumbs, release tracking |
| **Email** | Proton Bridge (transaccional crítico) + Resend (notificaciones) | E2E para datos sensibles, Resend para volumen |

### 2.3 Principio Fundamental: Offline-First con Sync

```
GRANJA (sin internet)          NUBE (siempre disponible)
┌─────────────────────┐        ┌─────────────────────┐
│  IndexedDB (250MB+) │        │  PostgreSQL (∞)     │
│  ┌───────────────┐  │        │  ┌───────────────┐  │
│  │ datos locales │  │  sync  │  │ datos master  │  │
│  │ + cola de     │◄─┼───────►┼──│ + historial   │  │
│  │   cambios     │  │  CRDT  │  │   completo    │  │
│  └───────────────┘  │        │  └───────────────┘  │
│                     │        │                     │
│  Service Worker     │        │  Sync Service       │
│  detecta conexión   │        │  resuelve conflictos│
│  → envía cola       │        │  → CRDT merge       │
│  → recibe updates   │        │  → notifica otros   │
└─────────────────────┘        └─────────────────────┘
```

**CRDT (Conflict-free Replicated Data Type)**: Cuando dos dispositivos editan datos sin conexión, el merge es automático y determinístico. Sin conflictos, sin pérdida de datos.

---

## 3. Modelo de Datos — PostgreSQL Multi-Tenant

### 3.1 Estrategia de Aislamiento: Schema-per-Tenant

Cada granja tiene su propio schema de PostgreSQL. Esto garantiza:
- **Aislamiento total**: Un `SELECT *` en Granja A jamás toca datos de Granja B
- **Backup independiente**: Se puede restaurar una granja sin afectar otras
- **Performance**: Índices y vacuum por schema, no compiten
- **Compliance**: Datos de cada país en su región (GDPR, etc.)

```sql
-- Estructura por tenant
CREATE SCHEMA tenant_farm_00001;
CREATE SCHEMA tenant_farm_00002;
-- ... hasta tenant_farm_NNNNNNN

-- Cada schema tiene las mismas tablas
SET search_path TO tenant_farm_00001;
```

### 3.2 Tablas Principales (por schema)

```sql
-- ═══════════════════════════════════════════════
-- CORE: Granja y Usuarios
-- ═══════════════════════════════════════════════

CREATE TABLE farm (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    country         CHAR(2) NOT NULL,        -- ISO 3166-1
    timezone        TEXT NOT NULL,            -- e.g. 'America/Santiago'
    currency        CHAR(3) NOT NULL,         -- ISO 4217
    locale          CHAR(5) NOT NULL,         -- e.g. 'es-CL'
    tier            TEXT NOT NULL DEFAULT 'free',  -- free/pro/enterprise
    created_at      TIMESTAMPTZ DEFAULT now(),
    settings        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id         UUID REFERENCES farm(id),
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('owner','manager','worker','vet')),
    pin_hash        TEXT,                     -- bcrypt, no plaintext
    mfa_secret      TEXT,                     -- TOTP para enterprise
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- PRODUCCIÓN: El 62.4% del volumen de datos
-- ═══════════════════════════════════════════════

CREATE TABLE flocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    breed           TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    birth_date      DATE NOT NULL,
    entry_date      DATE NOT NULL,
    status          TEXT DEFAULT 'active',
    curve_adjust    NUMERIC(3,2) DEFAULT 1.00,
    vet_controlled  BOOLEAN DEFAULT false,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_production (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flock_id        UUID REFERENCES flocks(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    eggs_collected  INTEGER NOT NULL,
    eggs_broken     INTEGER DEFAULT 0,
    eggs_s          INTEGER DEFAULT 0,
    eggs_m          INTEGER DEFAULT 0,
    eggs_l          INTEGER DEFAULT 0,
    eggs_xl         INTEGER DEFAULT 0,
    eggs_jumbo      INTEGER DEFAULT 0,
    mortality       INTEGER DEFAULT 0,
    hd_percent      NUMERIC(5,2),
    notes           TEXT,
    recorded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    -- Partición por fecha para performance
    CONSTRAINT unique_flock_date UNIQUE (flock_id, date)
) PARTITION BY RANGE (date);

-- Particiones automáticas por mes
CREATE TABLE daily_production_2026_01 PARTITION OF daily_production
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE daily_production_2026_02 PARTITION OF daily_production
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- pg_partman crea particiones futuras automáticamente

-- ═══════════════════════════════════════════════
-- INVENTARIO Y FINANZAS
-- ═══════════════════════════════════════════════

CREATE TABLE inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL,
    flock_id        UUID REFERENCES flocks(id),
    egg_type        TEXT NOT NULL,             -- S/M/L/XL/Jumbo
    qty_in          INTEGER DEFAULT 0,
    qty_out         INTEGER DEFAULT 0,
    balance         INTEGER NOT NULL,
    source          TEXT,                      -- 'production' | 'sale' | 'adjustment'
    ref_id          UUID,                      -- FK a production o income
    created_at      TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (date);

CREATE TABLE clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    channel         TEXT NOT NULL CHECK (channel IN ('wholesale','retail','direct','organic','export')),
    contact         TEXT,
    phone           TEXT,
    email           TEXT,
    vet_controlled  BOOLEAN DEFAULT false,
    credit_limit    NUMERIC(12,2) DEFAULT 0,
    balance         NUMERIC(12,2) DEFAULT 0,
    active          BOOLEAN DEFAULT true,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE income (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL,
    client_id       UUID REFERENCES clients(id),
    channel         TEXT NOT NULL,
    egg_type        TEXT,
    qty             INTEGER NOT NULL,
    unit_price      NUMERIC(10,4) NOT NULL,
    total           NUMERIC(12,2) NOT NULL,
    payment_status  TEXT DEFAULT 'paid',
    notes           TEXT,
    recorded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (date);

CREATE TABLE expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL,
    category        TEXT NOT NULL,             -- feed/labor/vet/utilities/maintenance/other
    description     TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    vendor          TEXT,
    receipt_url     TEXT,                      -- S3 path
    recorded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (date);

-- ═══════════════════════════════════════════════
-- SALUD Y BIOSEGURIDAD
-- ═══════════════════════════════════════════════

CREATE TABLE vaccines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flock_id        UUID REFERENCES flocks(id),
    date            DATE NOT NULL,
    vaccine_name    TEXT NOT NULL,
    batch_number    TEXT,
    dose_ml         NUMERIC(6,2),
    administered_by UUID REFERENCES users(id),
    next_due        DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE health_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flock_id        UUID REFERENCES flocks(id),
    date            DATE NOT NULL,
    type            TEXT NOT NULL,             -- outbreak/treatment/inspection
    description     TEXT NOT NULL,
    severity        TEXT CHECK (severity IN ('low','medium','high','critical')),
    resolved        BOOLEAN DEFAULT false,
    resolved_date   DATE,
    recorded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE feed_consumption (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flock_id        UUID REFERENCES flocks(id),
    date            DATE NOT NULL,
    feed_type       TEXT NOT NULL,
    qty_kg          NUMERIC(10,2) NOT NULL,
    cost_per_kg     NUMERIC(8,4),
    batch_number    TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (date);

CREATE TABLE biosecurity (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL,
    type            TEXT NOT NULL,             -- visitor/disinfection/inspection
    details         JSONB NOT NULL,
    recorded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE environment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL,
    temp_min        NUMERIC(5,2),
    temp_max        NUMERIC(5,2),
    humidity        NUMERIC(5,2),
    light_hours     NUMERIC(4,1),
    source          TEXT DEFAULT 'manual',     -- manual/sensor/api
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- AUDITORÍA Y SISTEMA
-- ═══════════════════════════════════════════════

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,     -- BIGINT, no UUID (volumen alto)
    ts              TIMESTAMPTZ DEFAULT now(),
    user_id         UUID REFERENCES users(id),
    action          TEXT NOT NULL,              -- create/update/delete
    module          TEXT NOT NULL,
    detail          TEXT,
    before_data     JSONB,
    after_data      JSONB
) PARTITION BY RANGE (ts);

CREATE TABLE bug_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts              TIMESTAMPTZ DEFAULT now(),
    user_id         UUID,
    app_version     TEXT NOT NULL,
    error_type      TEXT NOT NULL,              -- js_error/api_error/data_corruption/ui_glitch
    error_message   TEXT NOT NULL,
    stack_trace     TEXT,
    browser         TEXT,
    os              TEXT,
    screen          TEXT,                       -- qué pantalla estaba abierta
    breadcrumbs     JSONB,                      -- últimas 20 acciones del usuario
    data_snapshot   JSONB,                      -- estado relevante (sin datos sensibles)
    status          TEXT DEFAULT 'new',         -- new/triaged/fixing/deployed/closed
    fix_version     TEXT,                       -- versión donde se corrigió
    fix_commit      TEXT,                       -- SHA del commit
    resolved_at     TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════
-- ÍNDICES CRÍTICOS
-- ═══════════════════════════════════════════════

CREATE INDEX idx_production_flock_date ON daily_production (flock_id, date DESC);
CREATE INDEX idx_production_date ON daily_production (date DESC);
CREATE INDEX idx_income_client_date ON income (client_id, date DESC);
CREATE INDEX idx_income_channel ON income (channel, date DESC);
CREATE INDEX idx_expenses_category_date ON expenses (category, date DESC);
CREATE INDEX idx_inventory_flock_type ON inventory (flock_id, egg_type, date DESC);
CREATE INDEX idx_audit_module ON audit_log (module, ts DESC);
CREATE INDEX idx_bugs_status ON bug_reports (status, ts DESC);
CREATE INDEX idx_vaccines_flock_next ON vaccines (flock_id, next_due);
CREATE INDEX idx_clients_channel ON clients (channel) WHERE active = true;
```

### 3.3 Capacidad Post-Migración

| Métrica | localStorage (actual) | PostgreSQL (objetivo) |
|---------|----------------------|----------------------|
| Límite de almacenamiento | 5 MB | **Ilimitado** (disco) |
| Registros de producción | ~10K/año antes de saturar | **Billones** con particionamiento |
| Clientes por granja | ~1,000 máximo | **Sin límite** |
| Años de histórico | 1 (granja grande) | **Décadas** |
| Queries concurrentes | 0 (no hay DB) | **10,000+/segundo** |
| Backups | Manual (export JSON) | **Automático cada hora** |
| Búsqueda full-text | No | **PostgreSQL FTS + índices** |

---

## 4. Pipeline de Bugs Autorreparable

### 4.1 Principio: El usuario NUNCA debe diagnosticar un bug

El flujo es:
1. **El bug se detecta SOLO** (o el usuario aprieta "Send" una vez)
2. **Llega a nuestra base con contexto completo**
3. **Se prueba, se corrige, se despliega**
4. **Actualización obligatoria llega a TODOS los usuarios afectados**
5. **Si un producer tiene el bug, se asegura que NINGÚN otro lo tenga**

### 4.2 Captura Automática en el Cliente

```javascript
// ═══════════════════════════════════════════════
// ERROR CAPTURE — Service Worker + App Level
// ═══════════════════════════════════════════════

class BugCapture {
    constructor() {
        this.breadcrumbs = [];      // últimas 20 acciones
        this.MAX_BREADCRUMBS = 20;
        this.VERSION = document.querySelector('meta[name="app-version"]').content;
        this.TENANT_ID = localStorage.getItem('tenant_id');
        this.setupListeners();
    }

    setupListeners() {
        // 1. JavaScript errors (síncronos)
        window.onerror = (msg, src, line, col, err) => {
            this.capture('js_error', msg, err?.stack, { src, line, col });
        };

        // 2. Promise rejections (asíncronos)
        window.addEventListener('unhandledrejection', (e) => {
            this.capture('js_error', e.reason?.message || String(e.reason),
                         e.reason?.stack);
        });

        // 3. API errors (fetch wrapper)
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                const res = await originalFetch(...args);
                if (!res.ok && res.status >= 500) {
                    this.capture('api_error', `${res.status} ${res.statusText}`,
                                 null, { url: args[0], status: res.status });
                }
                return res;
            } catch (err) {
                this.capture('api_error', err.message, err.stack,
                             { url: args[0] });
                throw err;
            }
        };

        // 4. Data corruption detection
        // Runs on every save — checks data integrity
        window.addEventListener('egglogu:save', (e) => {
            const issues = this.validateData(e.detail);
            if (issues.length > 0) {
                this.capture('data_corruption', issues.join('; '),
                             null, { issues });
            }
        });

        // 5. Performance degradation
        if ('PerformanceObserver' in window) {
            const obs = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.duration > 3000) {  // > 3 segundos
                        this.capture('performance',
                            `Slow operation: ${entry.name} (${entry.duration}ms)`,
                            null, { duration: entry.duration, name: entry.name });
                    }
                }
            });
            obs.observe({ entryTypes: ['measure'] });
        }
    }

    addBreadcrumb(action, detail) {
        this.breadcrumbs.push({
            ts: Date.now(),
            action,
            detail: typeof detail === 'string' ? detail : JSON.stringify(detail)
        });
        if (this.breadcrumbs.length > this.MAX_BREADCRUMBS) {
            this.breadcrumbs.shift();
        }
    }

    async capture(type, message, stack, extra = {}) {
        const report = {
            app_version:  this.VERSION,
            error_type:   type,
            error_message: message,
            stack_trace:  stack || null,
            browser:      navigator.userAgent,
            os:           navigator.platform,
            screen:       this.getCurrentScreen(),
            breadcrumbs:  [...this.breadcrumbs],
            locale:       navigator.language,
            online:       navigator.onLine,
            timestamp:    new Date().toISOString(),
            ...extra
        };

        // Si hay conexión → enviar directo
        if (navigator.onLine) {
            try {
                await fetch('/api/bugs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Tenant': this.TENANT_ID
                    },
                    body: JSON.stringify(report)
                });
            } catch {
                // Si falla el envío, guardar offline
                this.queueOffline(report);
            }
        } else {
            this.queueOffline(report);
        }

        // Mostrar al usuario: botón "Send" para confirmación
        // (el reporte ya se envió, pero el botón da sensación de control)
        this.showBugToast(type, message);
    }

    showBugToast(type, message) {
        // Solo para errores visibles al usuario
        if (type === 'performance') return;

        // Toast minimalista: "Se detectó un problema. [Enviar reporte]"
        // El botón "Enviar" es cosmético — ya se envió automáticamente
        // Pero si el auto-envío falló, el botón reintenta
    }

    queueOffline(report) {
        // Guardar en IndexedDB para enviar cuando haya conexión
        const tx = this.db.transaction('bug_queue', 'readwrite');
        tx.objectStore('bug_queue').add(report);
    }

    validateData(data) {
        const issues = [];
        // Verificar integridad referencial
        if (data.dailyProduction) {
            const flockIds = new Set((data.flocks || []).map(f => f.id));
            for (const p of data.dailyProduction) {
                if (!flockIds.has(p.flockId)) {
                    issues.push(`Production ${p.id} references non-existent flock ${p.flockId}`);
                }
            }
        }
        // Verificar que balance de inventario nunca sea negativo
        if (data.inventory) {
            for (const inv of data.inventory) {
                if (inv.balance < 0) {
                    issues.push(`Inventory ${inv.id} has negative balance: ${inv.balance}`);
                }
            }
        }
        return issues;
    }

    getCurrentScreen() {
        return document.querySelector('[data-screen].active')?.dataset?.screen || 'unknown';
    }
}

// Inicializar al cargar la app
const bugCapture = new BugCapture();

// Cada acción del usuario deja breadcrumb
// (ya integrado en los event handlers de la app)
function navigateTo(screen) {
    bugCapture.addBreadcrumb('navigate', screen);
    // ... render screen
}
function saveRecord(module, data) {
    bugCapture.addBreadcrumb('save', { module, id: data.id });
    // ... save data
}
```

### 4.3 Pipeline Backend — De Reporte a Fix Automático

```
FASE 1: INGESTA (0-5 segundos)
┌──────────────────────────────────────────────┐
│  POST /api/bugs                              │
│  → Validar payload                           │
│  → Deduplicar (mismo error+version = merge)  │
│  → Insertar en bug_reports                   │
│  → Publicar en Redis Stream 'bugs:new'       │
└──────────────────┬───────────────────────────┘
                   │
FASE 2: TRIAGE AUTOMÁTICO (5-30 segundos)
┌──────────────────┴───────────────────────────┐
│  BUG TRIAGE WORKER                           │
│  → Clasificar severidad:                     │
│    • CRITICAL: data_corruption, crash loop   │
│    • HIGH: api_error 5xx, js_error en core   │
│    • MEDIUM: ui_glitch, performance          │
│    • LOW: edge case, cosmético               │
│  → Agrupar por fingerprint (stack trace hash)│
│  → Si es NUEVO (primer reporte):             │
│    • Crear issue en GitHub automáticamente   │
│    • Asignar label por módulo                │
│    • Si CRITICAL: alerta Slack/email al team │
│  → Si es CONOCIDO (ya reportado):            │
│    • Incrementar counter de affected_users   │
│    • Agregar breadcrumbs al issue existente  │
│  → Actualizar status: new → triaged          │
└──────────────────┬───────────────────────────┘
                   │
FASE 3: CORRECCIÓN (minutos a horas)
┌──────────────────┴───────────────────────────┐
│  EQUIPO DE DESARROLLO                        │
│  → CRITICAL: fix inmediato (< 2 horas)       │
│  → HIGH: fix en < 24 horas                   │
│  → MEDIUM: próximo sprint                    │
│  → LOW: backlog                              │
│                                              │
│  Cada fix incluye:                           │
│  1. Test que reproduce el bug exacto         │
│  2. Fix del código                           │
│  3. Test que verifica la corrección          │
│  4. git commit con ref al bug report ID      │
└──────────────────┬───────────────────────────┘
                   │
FASE 4: CI/CD AUTOMÁTICO (5-15 minutos)
┌──────────────────┴───────────────────────────┐
│  GITHUB ACTIONS PIPELINE                     │
│  → git push → trigger pipeline               │
│  → Lint + Type check                         │
│  → Unit tests (Jest, 100% core coverage)     │
│  → Integration tests (Playwright)            │
│  → Build PWA bundle                          │
│  → Deploy a STAGING                          │
│  → Smoke tests en staging                    │
│  → Si pasa → promote a CANARY (5% tráfico)  │
│  → Monitorear 15 min en canary               │
│  → Si error rate < 0.1% → PRODUCTION (100%) │
│  → Si error rate >= 0.1% → ROLLBACK AUTO    │
└──────────────────┬───────────────────────────┘
                   │
FASE 5: ACTUALIZACIÓN OBLIGATORIA (segundos)
┌──────────────────┴───────────────────────────┐
│  SERVICE WORKER FORCE-UPDATE                 │
│  → Nueva versión en CDN                      │
│  → SW detecta cambio de hash                 │
│  → Descarga en background                    │
│  → Notifica al usuario: "Actualización       │
│    disponible — se aplicará al recargar"     │
│  → Si CRITICAL: fuerza recarga en 60s        │
│  → Bug report status → 'deployed'            │
│  → Verificar que affected_users ya no        │
│    reportan el mismo error → 'closed'        │
└──────────────────────────────────────────────┘
```

### 4.4 Tiempos de Respuesta por Severidad

| Severidad | Ejemplo | Detección | Triage | Fix | Deploy | Total |
|-----------|---------|-----------|--------|-----|--------|-------|
| **CRITICAL** | Pérdida de datos, crash loop | Automático (5s) | Auto (30s) | < 2h | < 15min | **< 2.5 horas** |
| **HIGH** | API 500, error en módulo core | Automático (5s) | Auto (30s) | < 24h | < 15min | **< 24 horas** |
| **MEDIUM** | UI rota, lentitud | Automático (5s) | Auto (30s) | Próximo sprint | Release semanal | **< 2 semanas** |
| **LOW** | Cosmético, edge case | Manual (usuario) | Manual | Backlog | Release mensual | **< 2 meses** |

### 4.5 Ejemplo Concreto: Un Bug en Producción

```
08:00  Granjero en Colombia abre módulo de producción → JavaScript error
       → BugCapture.capture() automáticamente:
         {
           error_type: "js_error",
           error_message: "Cannot read property 'qty' of undefined",
           stack_trace: "at renderProd (egglogu.js:2847:15)...",
           breadcrumbs: [
             { action: "navigate", detail: "dashboard" },
             { action: "navigate", detail: "production" },
             { action: "save", detail: { module: "production", id: "abc123" } }
           ],
           app_version: "2.1.3",
           screen: "production"
         }

08:00  → POST /api/bugs → INSERT → Redis Stream

08:00  → Triage Worker: fingerprint = hash(stack_trace)
       → NUEVO bug, severidad HIGH (core module)
       → Crea GitHub Issue #847
       → Alerta Slack: "🔴 HIGH: renderProd crash v2.1.3 (1 user)"

08:05  → 3 granjas más reportan lo mismo
       → Counter: affected_users = 4
       → Issue #847 updated: "4 users affected"

09:30  → Developer identifica: flock sin campo 'qty' (migración incompleta)
       → Escribe test que reproduce el caso
       → Fix: add fallback `flock.qty || flock.hens || 0`
       → Test pasa
       → git push → CI pipeline starts

09:45  → Pipeline: lint ✓ → tests ✓ → build ✓ → staging ✓ → canary (5%)
10:00  → Canary 15 min → error rate 0.00% → promote to production
10:01  → CDN actualizado → Service Workers detectan nuevo hash
10:02  → Las 4 granjas afectadas reciben notificación:
         "Actualización v2.1.4 disponible"
10:03  → Al recargar, el bug desapareció
10:05  → Zero nuevos reportes del mismo fingerprint → auto-close Issue #847

TIEMPO TOTAL: bug detectado 08:00, corregido para todos 10:02 = 2 HORAS
```

---

## 5. Sistema de Actualizaciones Obligatorias

### 5.1 Service Worker v2 — Force Update

```javascript
// sw.js — Service Worker con control de versiones
const APP_VERSION = '2.1.4';
const CACHE_NAME = `egglogu-${APP_VERSION}`;
const CRITICAL_UPDATE = false;  // true = forzar recarga inmediata

// Assets que siempre deben estar actualizados
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/app.css',
    '/manifest.json'
];

// ═══════════════════════════════════════════════
// INSTALL: Descargar nueva versión en background
// ═══════════════════════════════════════════════
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => {
                // Activar inmediatamente (no esperar a que cierren la tab)
                return self.skipWaiting();
            })
    );
});

// ═══════════════════════════════════════════════
// ACTIVATE: Limpiar caches viejos + notificar
// ═══════════════════════════════════════════════
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            );
        }).then(() => {
            // Tomar control de todas las tabs abiertas
            return self.clients.claim();
        }).then(() => {
            // Notificar a todas las tabs
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'UPDATE_AVAILABLE',
                        version: APP_VERSION,
                        critical: CRITICAL_UPDATE
                    });
                });
            });
        })
    );
});

// ═══════════════════════════════════════════════
// CHECK: Verificar actualizaciones cada 5 minutos
// ═══════════════════════════════════════════════
setInterval(async () => {
    try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version, critical, minVersion } = await res.json();

        if (version !== APP_VERSION) {
            // Hay nueva versión → trigger update
            self.registration.update();
        }

        // Si la versión actual es menor que minVersion → forzar
        if (compareVersions(APP_VERSION, minVersion) < 0) {
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'FORCE_UPDATE',
                        version,
                        reason: 'security_or_critical_fix'
                    });
                });
            });
        }
    } catch {
        // Sin conexión — no hacer nada, seguir con versión actual
    }
}, 5 * 60 * 1000);  // cada 5 minutos
```

### 5.2 Flujo en el Cliente

```javascript
// En la app principal
navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, version, critical } = event.data;

    switch (type) {
        case 'UPDATE_AVAILABLE':
            if (critical) {
                // CRITICAL: Banner fijo + countdown 60 segundos
                showUpdateBanner(
                    `Actualización de seguridad v${version}. ` +
                    `Se aplicará automáticamente en 60 segundos.`,
                    { countdown: 60, dismissable: false }
                );
                setTimeout(() => window.location.reload(), 60000);
            } else {
                // NORMAL: Banner dismissable
                showUpdateBanner(
                    `Nueva versión v${version} disponible.`,
                    { dismissable: true, action: () => window.location.reload() }
                );
            }
            break;

        case 'FORCE_UPDATE':
            // Versión actual tiene vulnerabilidad o bug crítico
            // Guardar datos pendientes → recargar
            syncPendingData().then(() => window.location.reload());
            break;
    }
});
```

### 5.3 Endpoint de Versión

```javascript
// GET /api/version
// Responde en < 10ms (Redis cache)
app.get('/api/version', async (req, res) => {
    const versionInfo = await redis.get('app:current_version');
    // {
    //   version: "2.1.4",           // última versión
    //   critical: false,             // ¿es update crítico?
    //   minVersion: "2.1.0",         // versión mínima aceptada
    //   changelog: "Fixed production module crash",
    //   releasedAt: "2026-02-15T10:00:00Z"
    // }
    res.json(JSON.parse(versionInfo));
});
```

### 5.4 Política de Versiones

| Tipo de Update | Frecuencia | Obligatoriedad | Countdown |
|----------------|-----------|----------------|-----------|
| **CRITICAL** (seguridad, pérdida de datos) | Inmediato | Forzado en 60s | Sí, 60s |
| **HIGH** (bug en core) | Inmediato | Forzado al recargar | No |
| **NORMAL** (mejoras, bugs menores) | Semanal | Sugerido, aplica al recargar | No |
| **FEATURE** (nuevas funciones) | Mensual | Opcional por 30 días, luego forzado | No |

---

## 6. Aislamiento de Fallos — Zero Contagion

### 6.1 Principio: Un Bug en Granja A NUNCA Afecta Granja B

```
┌────────────────────────────────────────────────────────────┐
│                  ARQUITECTURA DE AISLAMIENTO                │
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Granja A │  │ Granja B │  │ Granja C │  │ Granja N │  │
│  │ Schema A │  │ Schema B │  │ Schema C │  │ Schema N │  │
│  │ ════════ │  │ ════════ │  │ ════════ │  │ ════════ │  │
│  │ Muro de  │  │ Muro de  │  │ Muro de  │  │ Muro de  │  │
│  │ fuego DB │  │ fuego DB │  │ fuego DB │  │ fuego DB │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │              │        │
│  ┌────┴──────────────┴──────────────┴──────────────┴────┐  │
│  │              API GATEWAY (tenant-aware)               │  │
│  │  Cada request tiene X-Tenant header                   │  │
│  │  Middleware valida: token.tenant === request.tenant    │  │
│  │  Row-Level Security en PostgreSQL como segunda capa   │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Capas de Aislamiento

| Capa | Mecanismo | Qué Protege |
|------|-----------|-------------|
| **1. Schema isolation** | Cada tenant = schema separado en PostgreSQL | Datos nunca se mezclan |
| **2. Connection pooling** | Pool separado por tenant (PgBouncer) | Un tenant lento no bloquea otros |
| **3. Rate limiting** | 100 req/min por tenant | Un tenant no consume toda la API |
| **4. Resource quotas** | CPU/RAM limits por tier | Enterprise no compite con Free |
| **5. Circuit breaker** | Si un tenant genera 5 errores en 1 min, se aísla | Bug en A no cascadea a B |
| **6. Canary deploy** | Updates van al 5% primero | Bug nuevo afecta 5%, no 100% |
| **7. Feature flags** | Funciones nuevas se activan por tenant | Rollout gradual |
| **8. Backup isolation** | Cada tenant tiene backup independiente | Restaurar A no toca B |

### 6.3 Circuit Breaker Pattern

```javascript
// Cada tenant tiene su propio circuit breaker
class TenantCircuitBreaker {
    constructor(tenantId) {
        this.tenantId = tenantId;
        this.failures = 0;
        this.threshold = 5;        // 5 fallos
        this.window = 60000;       // en 1 minuto
        this.cooldown = 300000;    // 5 min de cooldown
        this.state = 'CLOSED';     // CLOSED | OPEN | HALF_OPEN
        this.lastFailure = 0;
    }

    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailure > this.cooldown) {
                this.state = 'HALF_OPEN';
            } else {
                // Tenant aislado — responder con datos cacheados
                return this.getCachedResponse();
            }
        }

        try {
            const result = await operation();
            if (this.state === 'HALF_OPEN') {
                this.state = 'CLOSED';
                this.failures = 0;
            }
            return result;
        } catch (err) {
            this.failures++;
            this.lastFailure = Date.now();
            if (this.failures >= this.threshold) {
                this.state = 'OPEN';
                // Notificar al equipo: tenant aislado
                alertTeam(`Circuit breaker OPEN for ${this.tenantId}`);
            }
            throw err;
        }
    }
}
```

### 6.4 Despliegue Canary — Protección contra Bugs Nuevos

```
DEPLOYMENT PIPELINE — Zero Risk

Paso 1: Build + Test (CI)
   └─ 100% tests pasan → continuar
   └─ Algún test falla → ABORT, no se deploya

Paso 2: Deploy a STAGING (réplica exacta de producción)
   └─ Smoke tests automáticos (login, crear producción, ver dashboard)
   └─ Si falla → ABORT

Paso 3: CANARY — 5% del tráfico va a nueva versión
   └─ Monitorear 15 minutos:
      • Error rate (debe ser < 0.1%)
      • Latency p99 (debe ser < actual × 1.5)
      • Memory leaks (debe ser estable)
   └─ Si alguna métrica falla → ROLLBACK AUTOMÁTICO en < 30 segundos

Paso 4: GRADUAL ROLLOUT
   └─ 5% → 25% → 50% → 100%
   └─ Cada paso: 15 minutos de observación
   └─ Cualquier anomalía → rollback al paso anterior

Paso 5: 100% PRODUCTION
   └─ Old version kept alive 24h como fallback
   └─ Si surge problema → rollback instantáneo (< 30 segundos)

RESULTADO: Un bug nuevo MÁXIMO afecta al 5% de usuarios por 15 minutos.
           En el peor caso: 25% por 15 minutos.
           NUNCA el 100%.
```

---

## 7. Notificaciones Esenciales

### 7.1 Principio: Solo lo que IMPORTA para producir huevos y mantener la app estable

```
╔════════════════════════════════════════════════════════════╗
║  CATEGORÍAS DE NOTIFICACIÓN — Solo 2                      ║
║                                                           ║
║  1. PRODUCCIÓN — Lo que afecta los huevos y el dinero     ║
║  2. SISTEMA    — Lo que afecta la estabilidad de la app   ║
║                                                           ║
║  TODO lo demás es RUIDO y NO se notifica.                 ║
╚════════════════════════════════════════════════════════════╝
```

### 7.2 Notificaciones de Producción

| Trigger | Mensaje | Canal | Frecuencia |
|---------|---------|-------|------------|
| HD% cae > 10% vs promedio 7 días | "Producción de [Parvada X] cayó 15%. Revisar salud." | Push + In-app | 1x/día máximo |
| Mortalidad > umbral (2%/semana) | "Mortalidad elevada en [Parvada X]: 3.2% esta semana." | Push + In-app | 1x/semana |
| Inventario bajo (< 2 días de stock) | "Stock de huevos tipo L: 120 unidades (1.5 días)." | In-app | 1x/día |
| Vacuna vence en 7 días | "Vacuna Newcastle para [Parvada X] vence el [fecha]." | Push + In-app | 1x (7 días antes) |
| Feed stock < 3 días | "Alimento restante: 450 kg (~2.5 días)." | Push + In-app | 1x/día |
| Factura impaga > 30 días | "Cliente [X] debe $[monto] (45 días)." | In-app | 1x/semana |
| Margen negativo este mes | "Alerta: margen operativo -2.3% este mes." | Push + In-app | 1x/mes |

### 7.3 Notificaciones de Sistema

| Trigger | Mensaje | Canal | Frecuencia |
|---------|---------|-------|------------|
| Actualización disponible | "v2.1.4 disponible. Se aplicará al recargar." | In-app banner | 1x por versión |
| Actualización crítica | "Actualización de seguridad. Se aplica en 60s." | In-app modal | Inmediato |
| Bug reportado exitosamente | "Reporte enviado. Trabajamos en la solución." | In-app toast (3s) | 1x por bug |
| Bug corregido | "El problema reportado fue corregido en v2.1.4." | In-app toast | 1x por fix |
| Sync fallido 3x | "No se pudo sincronizar. Datos guardados localmente." | In-app subtle | 1x/hora máximo |
| Backup completado | (Silencioso — solo visible en Config) | Ninguno | Nunca |

### 7.4 Lo que NO se notifica (anti-spam)

- Nuevas funciones (se descubren al usar la app)
- Tips o sugerencias
- Marketing o upsell
- Logros o gamificación
- Recordatorios de usar la app
- Cambios cosméticos
- Actualizaciones menores no-críticas completadas
- Cada sync exitoso
- Cada backup exitoso

### 7.5 Control del Usuario

```javascript
// Settings de notificación — el usuario controla todo
const DEFAULT_NOTIFICATION_SETTINGS = {
    production: {
        hdDropAlert:        true,    // caída de producción
        mortalityAlert:     true,    // mortalidad elevada
        inventoryLow:       true,    // stock bajo
        vaccineDue:         true,    // vacunas próximas
        feedLow:            true,    // alimento bajo
        unpaidInvoice:      true,    // facturas impagas
        marginNegative:     true,    // margen negativo
    },
    system: {
        criticalUpdate:     true,    // NO desactivable — siempre llega
        normalUpdate:       true,
        bugFixed:           false,   // off por defecto
    },
    channels: {
        push:               true,    // notificaciones del navegador
        inApp:              true,    // siempre activo, no desactivable
        email:              false,   // off por defecto
    },
    quietHours: {
        enabled:            true,
        from:               '22:00',
        to:                 '06:00',
        timezone:           'auto'   // detecta del navegador
    }
};
```

---

## 8. Escalamiento — De 1 Granja a 10 Millones

### 8.1 Fases de Crecimiento

```
FASE 1: MVP SaaS (0 — 1,000 granjas)
├─ Infraestructura: 1 servidor (Fly.io o Railway)
├─ DB: PostgreSQL single instance (shared schemas)
├─ Cache: Redis single instance
├─ Costo: $20-50/mes
├─ Equipo: 1 developer (Jose Antonio)
└─ Revenue: $0-5K/mes (mayormente Free tier)

FASE 2: Product-Market Fit (1K — 10K granjas)
├─ Infraestructura: 2-3 servidores + read replicas
├─ DB: PostgreSQL primary + 1 replica
├─ Cache: Redis cluster (3 nodos)
├─ CDN: Cloudflare (ya existente)
├─ Costo: $200-500/mes
├─ Equipo: 2-3 personas
└─ Revenue: $10K-50K/mes

FASE 3: Escala Regional (10K — 100K granjas)
├─ Infraestructura: Kubernetes cluster multi-AZ
├─ DB: PostgreSQL con Citus (distributed) o CockroachDB
├─ Cache: Redis Cluster (6+ nodos)
├─ Analytics: ClickHouse para dashboards agregados
├─ Multi-región: LATAM + SE Asia + Africa
├─ Costo: $2K-10K/mes
├─ Equipo: 5-10 personas
└─ Revenue: $100K-500K/mes

FASE 4: Escala Global (100K — 1M granjas)
├─ Infraestructura: Multi-region K8s (3+ regiones)
├─ DB: CockroachDB multi-region o PostgreSQL por región
├─ Datos: Petabytes de producción histórica
├─ AI/ML: Modelos predictivos de producción, precios, enfermedades
├─ Costo: $20K-100K/mes
├─ Equipo: 20-50 personas
└─ Revenue: $1M-5M/mes

FASE 5: Monopolio (1M — 10M granjas)
├─ Infraestructura: Multi-cloud (AWS + GCP + Azure para redundancia)
├─ DB: Sharded por región geográfica
├─ Edge computing: procesamiento local en cada país
├─ Compliance: oficina legal por continente
├─ Marketplace: integración con proveedores, compradores, veterinarios
├─ Costo: $500K-2M/mes
├─ Equipo: 200-500 personas
└─ Revenue: $10M-50M/mes
```

### 8.2 Números Duros de Capacidad por Fase

| Métrica | Fase 1 | Fase 2 | Fase 3 | Fase 4 | Fase 5 |
|---------|--------|--------|--------|--------|--------|
| Granjas | 1K | 10K | 100K | 1M | 10M |
| Registros/día | 30K | 300K | 3M | 30M | 300M |
| Storage | 5 GB | 50 GB | 500 GB | 5 TB | 50 TB |
| API req/seg | 50 | 500 | 5K | 50K | 500K |
| Uptime SLA | 99% | 99.5% | 99.9% | 99.95% | 99.99% |
| Latencia p99 | 500ms | 200ms | 100ms | 50ms | 30ms |

### 8.3 Auto-Scaling Rules

```yaml
# Kubernetes HPA (Horizontal Pod Autoscaler)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: egglogu-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: egglogu-api
  minReplicas: 2          # mínimo 2 para alta disponibilidad
  maxReplicas: 50         # máximo 50 pods
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70    # escalar si CPU > 70%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80    # escalar si RAM > 80%
    - type: Pods
      pods:
        metric:
          name: requests_per_second
        target:
          type: AverageValue
          averageValue: "100"       # máximo 100 req/s por pod
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60   # esperar 1 min antes de escalar
      policies:
        - type: Pods
          value: 4                     # agregar hasta 4 pods a la vez
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300  # esperar 5 min antes de reducir
      policies:
        - type: Pods
          value: 1                     # remover 1 pod a la vez
          periodSeconds: 120
```

---

## 9. Tiers de Servicio

### 9.1 Tabla de Planes

| Feature | Free | Pro ($9/mes) | Enterprise ($49/mes) | Industrial (Custom) |
|---------|------|-------------|---------------------|---------------------|
| Parvadas | 5 | 20 | 100 | Ilimitado |
| Clientes | 50 | 500 | 5,000 | Ilimitado |
| Usuarios | 2 | 5 | 25 | Ilimitado |
| Historial | 1 año | 3 años | 10 años | Ilimitado |
| Almacenamiento | 100 MB | 1 GB | 10 GB | Ilimitado |
| Dispositivos sync | 1 | 3 | 10 | Ilimitado |
| Export (CSV/PDF) | Básico | Completo | Completo + API | Completo + API + BI |
| Notificaciones push | 5/día | 20/día | Ilimitado | Ilimitado |
| Soporte | Comunidad | Email (48h) | Email (4h) + Chat | Dedicado + SLA |
| Analytics | Básico | Avanzado | Avanzado + Benchmarking | Custom + AI Predictions |
| Bioseguridad | Básico | Completo | Completo + Trazabilidad | Compliance certificado |
| Vacunas | Manual | + Recordatorios | + Integración veterinaria | + Reportes regulatorios |
| API access | No | Read-only | Full CRUD | Full + Webhooks |
| SSO | No | No | Google/Microsoft | SAML/OIDC custom |
| MFA | No | TOTP | TOTP + Hardware keys | + Biometric |
| White-label | No | No | No | Sí |
| On-premise | No | No | No | Sí |
| Uptime SLA | Best effort | 99.5% | 99.9% | 99.95% |
| Backup frequency | Diario | Cada 6h | Cada hora | Cada 15min |
| Data residency | Auto | Elegir región | Elegir región | Dedicado |

### 9.2 Modelo de Revenue Proyectado

| Fase | Granjas | Free (70%) | Pro (20%) | Enterprise (8%) | Industrial (2%) | MRR |
|------|---------|-----------|-----------|-----------------|-----------------|-----|
| 1 | 1K | 700 | 200 × $9 | 80 × $49 | 20 × $200 | **$9,720** |
| 2 | 10K | 7K | 2K × $9 | 800 × $49 | 200 × $200 | **$97,200** |
| 3 | 100K | 70K | 20K × $9 | 8K × $49 | 2K × $200 | **$972,000** |
| 4 | 1M | 700K | 200K × $9 | 80K × $49 | 20K × $200 | **$9.72M** |
| 5 | 10M | 7M | 2M × $9 | 800K × $49 | 200K × $200 | **$97.2M** |

### 9.3 Límites Técnicos por Tier (Enforcement)

```javascript
// Middleware de enforcement de tier
const TIER_LIMITS = {
    free:       { flocks: 5,   clients: 50,   users: 2,   storage_mb: 100,   api_rpm: 30 },
    pro:        { flocks: 20,  clients: 500,  users: 5,   storage_mb: 1024,  api_rpm: 120 },
    enterprise: { flocks: 100, clients: 5000, users: 25,  storage_mb: 10240, api_rpm: 600 },
    industrial: { flocks: Infinity, clients: Infinity, users: Infinity, storage_mb: Infinity, api_rpm: 6000 }
};

async function enforceTierLimits(req, res, next) {
    const tenant = req.tenant;
    const limits = TIER_LIMITS[tenant.tier];

    // Ejemplo: crear parvada
    if (req.path === '/api/flocks' && req.method === 'POST') {
        const currentCount = await db.query(
            `SELECT COUNT(*) FROM ${tenant.schema}.flocks WHERE status = 'active'`
        );
        if (currentCount >= limits.flocks) {
            return res.status(402).json({
                error: 'tier_limit',
                message: `Tu plan ${tenant.tier} permite ${limits.flocks} parvadas activas.`,
                upgrade_url: '/settings/billing'
            });
        }
    }
    next();
}
```

---

## 10. Seguridad y Compliance

### 10.1 Capas de Seguridad

| Capa | Implementación |
|------|---------------|
| **Transport** | TLS 1.3 obligatorio (Cloudflare enforced) |
| **Autenticación** | OAuth 2.0 + PKCE (no passwords en URLs) |
| **Autorización** | RBAC por rol + tenant isolation |
| **MFA** | TOTP (Google Auth) + backup codes |
| **API** | JWT con rotación cada 15 min + refresh token (7 días) |
| **Datos en reposo** | AES-256 encryption en PostgreSQL (pgcrypto) |
| **Datos en tránsito** | TLS 1.3 end-to-end |
| **Secrets** | HashiCorp Vault o env vars (nunca en código) |
| **WAF** | Cloudflare WAF (OWASP Top 10, SQLi, XSS) |
| **DDoS** | Cloudflare (incluido en plan gratuito) |
| **Rate limiting** | Per-tenant, per-endpoint (Redis) |
| **Audit** | Toda operación loggeada con user, timestamp, before/after |
| **Backup** | Encrypted en S3 con lifecycle policy |
| **Penetration testing** | Anual (Enterprise+) |

### 10.2 Compliance por Región

| Región | Regulación | Requisito | Implementación |
|--------|-----------|-----------|----------------|
| **EU/UK** | GDPR | Data residency, right to delete, DPO | Región EU, purge API, DPA |
| **LATAM** | LGPD (Brasil), Ley 19.628 (Chile) | Consentimiento, portabilidad | Consent flow, export API |
| **USA** | CCPA (California) | Opt-out, disclosure | Privacy policy, opt-out |
| **SE Asia** | PDPA (Tailandia, Singapur) | Consent, cross-border | Región APAC, consent |
| **Avícola** | SENASA (AR), SAG (CL), MAPA (BR) | Trazabilidad, registro sanitario | Módulo trazabilidad, export regulatorio |

### 10.3 Trazabilidad de Huevos (Compliance Avícola)

```sql
-- Trazabilidad completa: del huevo al cliente
CREATE TABLE traceability_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code      TEXT UNIQUE NOT NULL,    -- Código único del lote
    flock_id        UUID REFERENCES flocks(id),
    production_date DATE NOT NULL,
    egg_type        TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    expiry_date     DATE NOT NULL,           -- production_date + 28 días (estándar)
    storage_temp    NUMERIC(4,1),            -- °C
    quality_grade   TEXT,                    -- AA, A, B
    sold_to         UUID REFERENCES clients(id),
    sold_date       DATE,
    status          TEXT DEFAULT 'in_stock', -- in_stock/sold/expired/recalled
    recall_reason   TEXT,                    -- si hay recall
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- En caso de brote: rastrear todos los lotes de la parvada afectada
-- y notificar a los clientes que los compraron
-- SELECT c.name, c.phone, tb.batch_code, tb.sold_date
-- FROM traceability_batches tb
-- JOIN clients c ON tb.sold_to = c.id
-- WHERE tb.flock_id = '<flock_with_outbreak>'
-- AND tb.sold_date >= '<outbreak_date>' - interval '28 days';
```

---

## 11. Costos de Infraestructura

### 11.1 Desglose por Fase

| Componente | Fase 1 (1K) | Fase 2 (10K) | Fase 3 (100K) | Fase 4 (1M) |
|------------|-------------|-------------|---------------|-------------|
| Compute (API) | $15 | $100 | $1,500 | $15,000 |
| PostgreSQL | $15 | $100 | $800 | $5,000 |
| Redis | $0 (embedded) | $30 | $200 | $1,500 |
| S3/R2 storage | $1 | $10 | $100 | $1,000 |
| CDN (Cloudflare) | $0 | $20 | $200 | $2,000 |
| Monitoring | $0 (free tier) | $30 | $200 | $1,000 |
| Error tracking | $0 (Sentry free) | $26 | $80 | $300 |
| CI/CD | $0 (GitHub free) | $0 | $100 | $500 |
| DNS/SSL | $0 (Cloudflare) | $0 | $0 | $0 |
| **Total/mes** | **$31** | **$316** | **$3,180** | **$26,300** |
| **Costo/granja** | **$0.031** | **$0.032** | **$0.032** | **$0.026** |
| **MRR** | **$9,720** | **$97,200** | **$972,000** | **$9.72M** |
| **Margen bruto** | **99.7%** | **99.7%** | **99.7%** | **99.7%** |

### 11.2 Dato Clave: Margen Bruto del 99.7%

El costo de infraestructura por granja es ~$0.03/mes. Incluso el plan Free cuesta prácticamente nada de servir. Este margen es posible porque:

1. **Offline-first**: El 95% del procesamiento ocurre en el navegador del usuario
2. **Sync es incremental**: Solo se envían deltas, no el dataset completo
3. **CDN absorbe el tráfico estático**: Cloudflare sirve HTML/JS/CSS gratis
4. **PostgreSQL es eficiente**: Con particionamiento y buenos índices, un servidor maneja miles de tenants

---

## 12. Roadmap de Migración

### 12.1 Fase 0 — Preparación (2 semanas)

```
Semana 1:
├─ Definir API contract (OpenAPI 3.0 spec)
├─ Diseñar schema PostgreSQL final
├─ Configurar CI/CD (GitHub Actions)
├─ Configurar staging environment
└─ Seleccionar hosting (Fly.io para MVP)

Semana 2:
├─ Implementar auth service (OAuth 2.0 + JWT)
├─ Implementar tenant provisioning
├─ Migrar Service Worker a v2 (sync + force-update)
└─ Setup Sentry para error tracking
```

### 12.2 Fase 1 — API + Sync (4 semanas)

```
Semana 3-4:
├─ API endpoints CRUD para todos los módulos
├─ Middleware: auth, tenant isolation, rate limiting
├─ Tests unitarios para cada endpoint
└─ Sync engine: IndexedDB ↔ PostgreSQL (CRDT)

Semana 5-6:
├─ Migrar frontend: localStorage → IndexedDB + API
├─ Offline queue (guardar cambios sin conexión)
├─ Auto-sync cuando hay conexión
├─ Migration script: localStorage → API import
└─ Integration tests (Playwright)
```

### 12.3 Fase 2 — Bug Pipeline + Updates (2 semanas)

```
Semana 7:
├─ BugCapture class en frontend
├─ POST /api/bugs endpoint
├─ Triage Worker (clasificación automática)
├─ GitHub Issue auto-creation
└─ Alertas Slack/email para CRITICAL/HIGH

Semana 8:
├─ Service Worker force-update mechanism
├─ /api/version endpoint
├─ Canary deployment pipeline
├─ Rollback automático
└─ Notificación "actualización disponible"
```

### 12.4 Fase 3 — Notificaciones + Producción (2 semanas)

```
Semana 9:
├─ Push notification service (Web Push API)
├─ Notification rules engine
├─ Quiet hours implementation
├─ User notification preferences UI
└─ Production alert triggers (HD%, mortalidad, etc.)

Semana 10:
├─ Billing integration (Stripe)
├─ Tier enforcement middleware
├─ Settings/billing UI
├─ Landing page update
└─ Documentation
```

### 12.5 Fase 4 — Launch (1 semana)

```
Semana 11:
├─ Beta con 50 granjas reales
├─ Fix bugs encontrados
├─ Performance testing (load test 1,000 concurrent)
├─ Security audit (OWASP checklist)
├─ Launch público
└─ Monitoring dashboards (Grafana)
```

**Total: 11 semanas** de desarrollo → MVP SaaS con bug pipeline completo.

---

## 13. SLA y Garantías

### 13.1 Service Level Agreement

| Nivel | Uptime | Downtime Máximo/Mes | Compensación |
|-------|--------|---------------------|-------------|
| Free | Best effort | Sin garantía | Ninguna |
| Pro | 99.5% | 3h 39min | 10% crédito |
| Enterprise | 99.9% | 43 min | 25% crédito |
| Industrial | 99.95% | 21 min | 50% crédito + soporte directo |

### 13.2 Recovery Point Objective (RPO) & Recovery Time Objective (RTO)

| Tier | RPO (máxima pérdida de datos) | RTO (tiempo para restaurar) |
|------|------------------------------|----------------------------|
| Free | 24 horas | 4 horas |
| Pro | 6 horas | 1 hora |
| Enterprise | 1 hora | 15 minutos |
| Industrial | 15 minutos | 5 minutos |

### 13.3 Garantías de Bug Response

| Severidad | Detección | Respuesta | Fix Deployed |
|-----------|-----------|-----------|-------------|
| CRITICAL | Automático (< 5s) | Alerta inmediata | < 4 horas |
| HIGH | Automático (< 5s) | < 1 hora | < 24 horas |
| MEDIUM | Automático (< 5s) | < 24 horas | < 2 semanas |
| LOW | Manual / automático | < 1 semana | < 2 meses |

---

## 14. Análisis de Saturación Post-Migración

### 14.1 Comparación: Antes vs Después

| Dimensión | Antes (localStorage) | Después (PostgreSQL SaaS) |
|-----------|---------------------|--------------------------|
| **Storage por granja** | 5 MB (DURO) | Ilimitado |
| **Años de datos** | 1 (grande) / 34 (típica) | **Décadas sin límite** |
| **Clientes por granja** | ~1,000 max | **Sin límite** |
| **Granjas totales** | N/A (cada una es isla) | **10 millones+** |
| **Registros totales** | ~21,000 | **Trillones** |
| **Bug detection** | No existe | **Automático < 5 segundos** |
| **Bug fix delivery** | Manual re-download | **Automático < 4 horas** |
| **Contagion risk** | 0 (islas) | **0 (schema isolation)** |
| **Multi-device** | No | **Sí, real-time sync** |
| **Offline** | Sí (100%) | **Sí (offline-first + sync)** |

### 14.2 Punto de Saturación Post-Migración

```
¿Dónde satura la versión SaaS?

ALMACENAMIENTO: No satura.
  PostgreSQL escala horizontalmente (Citus/CockroachDB).
  A 10M granjas × 5 GB/granja = 50 TB.
  50 TB es manejable con cloud storage ($1,000/mes en S3).

COMPUTE: No satura con auto-scaling.
  K8s escala pods automáticamente.
  500K req/s es factible con 50 pods.

NETWORK: No satura.
  Cloudflare CDN absorbe assets estáticos.
  API solo maneja deltas (JSON pequeños).

BASE DE DATOS: Satura a ~5M granjas en single-region PostgreSQL.
  Solución: CockroachDB multi-region o sharding por continente.
  Con sharding: no satura hasta ~100M granjas.

REAL BOTTLENECK: No es técnico. Es OPERACIONAL.
  → Soporte técnico a 10M granjas
  → Compliance en 190+ países
  → Traducción y localización
  → Competencia de gigantes (SAP, Oracle)
  → Equipo humano necesario

VEREDICTO FINAL:
╔═══════════════════════════════════════════════════════════╗
║ Con la arquitectura SaaS descrita en este documento,     ║
║ EGGlogU NO tiene punto de saturación técnica hasta       ║
║ ~100 millones de granjas. El techo es operacional        ║
║ (personas, legal, competencia), no tecnológico.          ║
║                                                          ║
║ El monopolio global es técnicamente viable.              ║
║ La app puede atender desde una granja familiar hasta     ║
║ una operación industrial de 1M+ gallinas sin cambiar     ║
║ de arquitectura.                                         ║
║                                                          ║
║ Estabilidad: 99.95% uptime con zero-contagion.           ║
║ Bugs: auto-detectados, auto-reportados, auto-corregidos. ║
║ Updates: obligatorias, canary-tested, rollback < 30s.    ║
╚═══════════════════════════════════════════════════════════╝
```

---

## Apéndice A: Glosario

| Término | Definición |
|---------|-----------|
| **Canary Deploy** | Enviar nueva versión al 5% del tráfico antes de ir a 100% |
| **Circuit Breaker** | Patrón que aísla un componente fallido para evitar cascada |
| **CRDT** | Conflict-free Replicated Data Type — merge automático sin conflictos |
| **HD%** | Hen-Day percentage — huevos producidos / gallinas vivas × 100 |
| **Multi-tenant** | Múltiples organizaciones en la misma infraestructura, aisladas |
| **PWA** | Progressive Web App — app web que funciona offline |
| **RPO** | Recovery Point Objective — máxima pérdida de datos aceptable |
| **RTO** | Recovery Time Objective — tiempo máximo para restaurar servicio |
| **Schema isolation** | Cada tenant tiene su propio namespace en la base de datos |
| **Service Worker** | Script del navegador que intercepta requests y maneja cache/updates |
| **SLA** | Service Level Agreement — garantía de disponibilidad |
| **Tenant** | Una granja (organización) dentro del sistema multi-tenant |

---

## 15. Command Center Global — Panel Ejecutivo del Fundador

### 15.1 Qué Es

Dashboard exclusivo para Jose Antonio (y equipo ejecutivo futuro) que muestra el estado global de toda la plataforma en tiempo real. **Datos anonimizados** — zero violación de privacidad, pero inteligencia completa para tomar decisiones de crecimiento.

```
┌─────────────────────────────────────────────────────────────────┐
│                    EGGLOGU COMMAND CENTER                        │
│                    ══════════════════════                        │
│  Solo accesible con rol: PLATFORM_ADMIN                         │
│  URL: command.egglogu.com (separado de la app de usuarios)      │
│  Auth: OAuth 2.0 + MFA obligatorio + IP whitelist               │
│  Datos: SOLO anonimizados / agregados — NUNCA datos de granja   │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Dashboards Principales

#### Dashboard 1: Market Share & Adopción

```
┌─────────────────────────────────────────────────────────────┐
│  MARKET SHARE                                     Live 🟢   │
│  ═══════════                                                │
│                                                             │
│  Total Granjas Activas:     47,832                          │
│  Granjas Nuevas (30 días):  +2,341 (+5.1%)                  │
│  Churn (30 días):           -187 (0.4%)                     │
│  Net Growth:                +2,154 (+4.7%)                  │
│                                                             │
│  ┌─ Por Región ─────────────────────────────────────────┐   │
│  │ LATAM        ████████████████████████░░░  28,699 (60%)│   │
│  │ SE Asia      ██████████░░░░░░░░░░░░░░░░   9,566 (20%)│   │
│  │ Africa       █████░░░░░░░░░░░░░░░░░░░░░   4,783 (10%)│   │
│  │ Europe       ███░░░░░░░░░░░░░░░░░░░░░░░   2,870 (6%) │   │
│  │ N. America   ██░░░░░░░░░░░░░░░░░░░░░░░░   1,435 (3%) │   │
│  │ Other        █░░░░░░░░░░░░░░░░░░░░░░░░░     479 (1%) │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Top 10 Países ──────────────────────────────────────┐   │
│  │ 1. Brasil       12,450 │ 6. India        1,890      │   │
│  │ 2. México        8,320 │ 7. Tailandia    1,650      │   │
│  │ 3. Colombia      4,210 │ 8. Nigeria      1,430      │   │
│  │ 4. Argentina     2,890 │ 9. Chile        1,210      │   │
│  │ 5. Indonesia     2,340 │ 10. Perú        1,080      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Por Sector ─────────────────────────────────────────┐   │
│  │ Familiar (< 500 gallinas)     62%                     │   │
│  │ Pequeña (500-5K)              24%                     │   │
│  │ Mediana (5K-50K)               11%                    │   │
│  │ Industrial (50K+)              3%                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Dashboard 2: Resultados Financieros (Plataforma)

```
┌─────────────────────────────────────────────────────────────┐
│  FINANCIALS                                    Feb 2026     │
│  ══════════                                                 │
│                                                             │
│  MRR (Monthly Recurring Revenue):    $97,200                │
│  ARR (Annual Run Rate):              $1,166,400             │
│  ARPU (Avg Revenue Per User):        $2.03                  │
│                                                             │
│  ┌─ Revenue por Tier ───────────────────────────────────┐   │
│  │ Free      (70%):  33,482 granjas    $0        (0%)    │   │
│  │ Pro       (20%):   9,566 × $9  =   $86,094   (62%)   │   │
│  │ Enterprise (8%):   3,827 × $49 =   $187,523  (26%)   │   │
│  │ Industrial (2%):     957 × $200=   $191,400  (12%)   │   │
│  │ TOTAL MRR:                         $465,017           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Unit Economics ─────────────────────────────────────┐   │
│  │ CAC (Cost of Acquisition):        $0.50 (organic)     │   │
│  │ LTV (Lifetime Value):             $145.80             │   │
│  │ LTV:CAC Ratio:                    291:1               │   │
│  │ Payback Period:                   < 1 mes             │   │
│  │ Gross Margin:                     99.7%               │   │
│  │ Net Margin (post-team):           72%                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Revenue por Región ─────────────────────────────────┐   │
│  │ LATAM        $278,510 (59.9%)                         │   │
│  │ SE Asia      $93,003  (20.0%)                         │   │
│  │ Africa       $46,501  (10.0%)                         │   │
│  │ Europe       $32,551  (7.0%)                          │   │
│  │ N. America   $14,452  (3.1%)                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Dashboard 3: KPIs Agregados de Producción (Anonimizados)

```
┌─────────────────────────────────────────────────────────────┐
│  INDUSTRY INTELLIGENCE (Anonimizado)           Global       │
│  ═══════════════════════════════════                        │
│                                                             │
│  Gallinas monitoreadas:    84.2 millones                    │
│  Huevos registrados/día:   67.4 millones                    │
│  HD% promedio global:      82.3%                            │
│                                                             │
│  ┌─ HD% por Región ─────────────────────────────────────┐   │
│  │ Europa          88.2%  ████████████████████░░         │   │
│  │ N. America      86.7%  ███████████████████░░░         │   │
│  │ LATAM           83.1%  ██████████████████░░░░         │   │
│  │ SE Asia         79.4%  ████████████████░░░░░░         │   │
│  │ Africa          71.8%  ██████████████░░░░░░░░         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Mortalidad Promedio ────────────────────────────────┐   │
│  │ Con control VET:       1.2%/mes                       │   │
│  │ Sin control VET:       3.8%/mes                       │   │
│  │ Diferencia:            3.2x mejor con VET             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Precio Promedio por Canal (USD/huevo) ──────────────┐   │
│  │ Orgánico:   $0.38  │ Retail:     $0.20               │   │
│  │ Directo:    $0.24  │ Wholesale:  $0.14               │   │
│  │ Export:     $0.30  │                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Tendencias (últimos 12 meses) ─────────────────────┐   │
│  │ Precio feed: +8.3% (inflación global)                 │   │
│  │ Precio huevo: +5.1% (demanda creciente)               │   │
│  │ Margen promedio: -1.2pp (feed sube más que huevo)     │   │
│  │ Adopción VET: +14% (más granjas con veterinario)      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Dashboard 4: Salud de la Plataforma (Bugs + Uptime)

```
┌─────────────────────────────────────────────────────────────┐
│  PLATFORM HEALTH                               Live 🟢      │
│  ═══════════════                                            │
│                                                             │
│  Uptime (30 días):         99.97%                           │
│  Incidents (30 días):      1 (P3, resolved in 45min)        │
│  MTTR (Mean Time to Repair): 38 minutos                     │
│                                                             │
│  ┌─ Bug Pipeline ──────────────────────────────────────┐    │
│  │ Bugs reportados (30d):    47                         │    │
│  │ Auto-detectados:          39 (83%)                   │    │
│  │ User-reported:            8 (17%)                    │    │
│  │ Resueltos:                44 (94%)                   │    │
│  │ Pendientes:               3 (LOW severity)           │    │
│  │ Tiempo promedio a fix:    4.2 horas                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Versiones Activas ─────────────────────────────────┐    │
│  │ v2.1.4 (current):    96.8% de usuarios              │    │
│  │ v2.1.3:               2.9% (updating...)             │    │
│  │ v2.1.2 o anterior:    0.3% (offline > 7 días)        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Performance ───────────────────────────────────────┐    │
│  │ API latency p50:     23ms                            │    │
│  │ API latency p99:     89ms                            │    │
│  │ Error rate:          0.02%                           │    │
│  │ Sync success rate:   99.8%                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 15.3 Anonimización — Cómo Funciona

```
PRINCIPIO: Jose Antonio ve TENDENCIAS y AGREGADOS, nunca datos individuales.

┌──────────────────────────────────────────────────────────────┐
│  DATO REAL (en la DB)           →  DATO EN COMMAND CENTER   │
│  ──────────────────────            ──────────────────────    │
│  "Granja El Sol, Colombia,      →  "Colombia, región         │
│   1,200 gallinas, HD% 84%,         Andina: HD% promedio     │
│   $12,400 revenue"                  83.1%, ARPU $2.03"      │
│                                                              │
│  NUNCA se muestra:                                           │
│  ✗ Nombre de granja                                          │
│  ✗ Nombre de dueño                                           │
│  ✗ Dirección                                                 │
│  ✗ Revenue individual                                        │
│  ✗ Número de gallinas individual                              │
│  ✗ Datos de clientes del granjero                            │
│                                                              │
│  SIEMPRE se muestra como:                                    │
│  ✓ Promedio por región/país/sector                           │
│  ✓ Percentiles (p25, p50, p75)                               │
│  ✓ Tendencias (% cambio mes a mes)                           │
│  ✓ Conteos agregados (total granjas, total gallinas)         │
│  ✓ Distribuciones (% por tier, % por canal)                  │
│                                                              │
│  REGLA K-ANONYMITY:                                          │
│  Si un segmento tiene < 10 granjas, NO se muestra.           │
│  Ejemplo: si solo hay 3 granjas en Paraguay,                 │
│  Paraguay se agrupa en "LATAM — Otros"                       │
└──────────────────────────────────────────────────────────────┘
```

### 15.4 Schema del Command Center (PostgreSQL — schema `platform_analytics`)

```sql
-- SEPARADO de los schemas de tenants
-- Se alimenta con ETL nocturno (no impacta performance de usuarios)

CREATE SCHEMA platform_analytics;
SET search_path TO platform_analytics;

-- Snapshot diario por país/sector (anonimizado)
CREATE TABLE daily_metrics (
    id              BIGSERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    country         CHAR(2) NOT NULL,
    region          TEXT NOT NULL,              -- LATAM, SE_ASIA, AFRICA, etc.
    sector          TEXT NOT NULL,              -- familiar, small, medium, industrial
    tier            TEXT NOT NULL,              -- free, pro, enterprise, industrial
    -- Adopción
    active_farms    INTEGER NOT NULL,
    new_farms       INTEGER DEFAULT 0,
    churned_farms   INTEGER DEFAULT 0,
    -- Producción agregada
    total_hens      BIGINT,
    total_eggs      BIGINT,
    avg_hd_percent  NUMERIC(5,2),
    avg_mortality   NUMERIC(5,2),
    avg_fcr         NUMERIC(4,2),
    -- Financiero (plataforma)
    mrr_segment     NUMERIC(12,2),
    -- Precios de mercado (anonimizado)
    avg_egg_price_wholesale  NUMERIC(8,4),
    avg_egg_price_retail     NUMERIC(8,4),
    avg_egg_price_organic    NUMERIC(8,4),
    avg_feed_cost_per_kg     NUMERIC(8,4),
    -- Salud
    pct_vet_controlled       NUMERIC(5,2),
    avg_vaccines_per_flock   NUMERIC(4,1),
    CONSTRAINT unique_daily UNIQUE (date, country, sector, tier)
) PARTITION BY RANGE (date);

-- Bug metrics (ya 100% anonimizado por naturaleza)
CREATE TABLE bug_metrics (
    id              BIGSERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    total_reports   INTEGER DEFAULT 0,
    auto_detected   INTEGER DEFAULT 0,
    critical        INTEGER DEFAULT 0,
    high            INTEGER DEFAULT 0,
    medium          INTEGER DEFAULT 0,
    low             INTEGER DEFAULT 0,
    avg_fix_hours   NUMERIC(6,1),
    pct_resolved    NUMERIC(5,2)
);

-- Cohort analysis (retención)
CREATE TABLE cohort_retention (
    cohort_month    DATE NOT NULL,             -- mes de registro
    months_since    INTEGER NOT NULL,           -- 0, 1, 2, ... 24
    farms_start     INTEGER NOT NULL,
    farms_active    INTEGER NOT NULL,
    retention_pct   NUMERIC(5,2) NOT NULL,
    CONSTRAINT unique_cohort UNIQUE (cohort_month, months_since)
);

-- Feature usage (qué módulos se usan más)
CREATE TABLE feature_usage (
    date            DATE NOT NULL,
    module          TEXT NOT NULL,              -- production, inventory, finances, health, etc.
    country         CHAR(2),
    sector          TEXT,
    daily_active    INTEGER NOT NULL,           -- farms que usaron este módulo hoy
    actions_count   INTEGER NOT NULL,           -- total de acciones en el módulo
    CONSTRAINT unique_feature UNIQUE (date, module, country, sector)
);
```

### 15.5 Filtros del Command Center

| Filtro | Opciones | Ejemplo |
|--------|---------|---------|
| **Región** | Global, LATAM, SE Asia, Africa, Europe, N. America | "Solo LATAM" |
| **País** | Todos los países con >= 10 granjas | "Brasil" |
| **Sector** | Familiar, Pequeña, Mediana, Industrial, Todos | "Industrial" |
| **Tier** | Free, Pro, Enterprise, Industrial, Todos | "Solo pagantes" |
| **Período** | Hoy, 7d, 30d, 90d, 1Y, All-time, Custom | "Últimos 90 días" |
| **Canal de venta** | Wholesale, Retail, Direct, Organic, Export | "Orgánico" |
| **VET status** | Con VET, Sin VET, Todos | "Con VET" |

---

## 16. FarmlogU — El Paraguas Multi-Especie

### 16.1 Visión

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║                        FARMLOGU                               ║
║                    ════════════════                            ║
║       "La herramienta necesaria de toda granja."              ║
║                                                               ║
║  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           ║
║  │             │  │             │  │             │           ║
║  │   EGGlogU   │  │   COWlogU   │  │   PIGlogU   │           ║
║  │   🥚 Aves   │  │   🐄 Bovino │  │   🐷 Porcino│           ║
║  │             │  │             │  │             │           ║
║  └─────────────┘  └─────────────┘  └─────────────┘           ║
║                                                               ║
║  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           ║
║  │             │  │             │  │             │           ║
║  │  FISHlogU   │  │  BEElogU    │  │  GOATlogU   │           ║
║  │  🐟 Acuicul.│  │  🐝 Apicul. │  │  🐐 Caprino │           ║
║  │             │  │             │  │             │           ║
║  └─────────────┘  └─────────────┘  └─────────────┘           ║
║                                                               ║
║         Command Center Unificado — farmlogu.com               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### 16.2 Cada Vertical — Qué Mide (Cobertura Completa por Especie)

| Vertical | Animal | **TODOS sus Productos** | KPIs Core |
|----------|--------|------------------------|-----------|
| **EGGlogU** | Gallinas, codornices, patas | Huevos (todos los tamaños), carne de ave, plumas, guano | HD%, mortalidad, FCR, inventario huevos |
| **COWlogU** | Vacas lecheras, ganado de carne, doble propósito | **Leche** (líquida, queso, yogurt, mantequilla) + **Carne** (cortes, subproductos) + Cuero | Litros/día, % grasa, peso vivo, gestación, rendimiento canal, calidad leche SCC |
| **PIGlogU** | Cerdos (engorde, reproductores, lechones) | **Toda la carne porcina** (cortes frescos, embutidos, subproductos) + Piel + Grasa | Conversión alimenticia, lechones/parto, peso al sacrificio, rendimiento canal, ciclo reproductivo |
| **FISHlogU** | Tilapia, salmón, trucha, camarón | Pescado/marisco | Densidad/m³, O₂ disuelto, tasa de crecimiento, mortalidad |
| **BEElogU** | Abejas | Miel, cera, polen | kg miel/colmena, fortaleza colonia, varroa count |
| **GOATlogU** | Cabras, ovejas | Leche / Carne / Lana | Litros/día, kg lana, fertilidad, peso |

### 16.3 Arquitectura Compartida vs Específica

```
┌─────────────────────────────────────────────────────────────┐
│                   FARMLOGU PLATFORM CORE                     │
│                                                             │
│  Compartido (80% del código):                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • Auth & Users (OAuth, RBAC, MFA)                    │    │
│  │ • Tenant Management (schemas, isolation)              │    │
│  │ • Client Management (CRM básico)                     │    │
│  │ • Finances (income, expenses, P&L, tax)              │    │
│  │ • Inventory (generic: in/out/balance)                │    │
│  │ • Biosecurity (zones, visitors, disinfection)        │    │
│  │ • Environment (temp, humidity, conditions)           │    │
│  │ • Feed Management (purchase, consumption, FCR)       │    │
│  │ • Personnel (workers, shifts, payroll)               │    │
│  │ • Audit Log (every operation tracked)                │    │
│  │ • Bug Pipeline (capture → fix → deploy)              │    │
│  │ • Notifications (push, in-app, email)                │    │
│  │ • Sync Engine (offline-first, CRDT)                  │    │
│  │ • Billing (Stripe, tiers)                            │    │
│  │ • Export/Import (CSV, PDF, API)                      │    │
│  │ • Compliance (traceability, regulatory export)       │    │
│  │ • i18n (8+ idiomas con WALTZ)                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Específico por vertical (20% del código):                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ EGGlogU  │  │ COWlogU  │  │ PIGlogU  │  │ FISHlogU │    │
│  │──────────│  │──────────│  │──────────│  │──────────│    │
│  │Breed     │  │Breed     │  │Breed     │  │Species   │    │
│  │curves    │  │curves    │  │curves    │  │curves    │    │
│  │Egg types │  │Milk comp.│  │Litter    │  │Water     │    │
│  │Incubation│  │Lactation │  │Fattening │  │quality   │    │
│  │HD%       │  │Gestation │  │Slaughter │  │Density   │    │
│  │Grading   │  │AI/Breed  │  │Carcass   │  │Harvest   │    │
│  │Vaccine   │  │Vaccine   │  │Vaccine   │  │Disease   │    │
│  │schedule  │  │schedule  │  │schedule  │  │schedule  │    │
│  │(poultry) │  │(bovine)  │  │(porcine) │  │(aquatic) │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 16.4 Granja Multi-Especie — Un Productor Usa Varios

```
Ejemplo: "Hacienda Los Alamos" tiene gallinas, vacas y cerdos.
         Compra UN plan FarmlogU y activa 3 módulos:

┌─────────────────────────────────────────────────────────┐
│  Hacienda Los Alamos — FarmlogU Enterprise              │
│                                                         │
│  Sidebar:                                               │
│  ┌──────────────────┐                                   │
│  │ 📊 Dashboard     │  ← Vista unificada de toda la    │
│  │                  │     hacienda (todas las especies)  │
│  ├──────────────────┤                                   │
│  │ 🥚 EGGlogU      │  ← 12 parvadas, 8,000 gallinas   │
│  │   Producción     │                                   │
│  │   Inventario     │                                   │
│  │   Salud          │                                   │
│  ├──────────────────┤                                   │
│  │ 🐄 COWlogU      │  ← 45 vacas lecheras             │
│  │   Ordeño         │                                   │
│  │   Gestación      │                                   │
│  │   Salud          │                                   │
│  ├──────────────────┤                                   │
│  │ 🐷 PIGlogU      │  ← 200 cerdos en engorde         │
│  │   Lotes          │                                   │
│  │   Faena          │                                   │
│  │   Salud          │                                   │
│  ├──────────────────┤                                   │
│  │ 💰 Finanzas     │  ← P&L consolidado de TODO       │
│  │ 👥 Clientes     │  ← Clientes compran huevos,      │
│  │                  │     leche Y carne                 │
│  │ 📋 Bioseguridad │  ← Unificado para toda la granja │
│  │ ⚙️  Config      │                                   │
│  └──────────────────┘                                   │
└─────────────────────────────────────────────────────────┘
```

### 16.5 Pricing FarmlogU Multi-Especie

| Plan | 1 Especie | 2 Especies | 3+ Especies |
|------|-----------|-----------|-------------|
| **Free** | Gratis (1 módulo) | N/A | N/A |
| **Pro** | $9/mes | $15/mes (33% desc.) | $19/mes (50%+ desc.) |
| **Enterprise** | $49/mes | $79/mes | $99/mes |
| **Industrial** | $200/mes | $350/mes | $450/mes |

Cada especie adicional cuesta menos porque el 80% de la infraestructura (auth, finanzas, clientes, bioseguridad) ya está pagada.

### 16.6 Command Center FarmlogU — Vista Multi-Especie

```
┌─────────────────────────────────────────────────────────────┐
│  FARMLOGU COMMAND CENTER                       Global 🟢    │
│  ═══════════════════════                                    │
│                                                             │
│  ┌─ Plataforma Total ──────────────────────────────────┐    │
│  │ Granjas activas:      312,000                        │    │
│  │ Países:               87                             │    │
│  │ MRR total:            $2.8M                          │    │
│  │ ARR:                  $33.6M                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Por Vertical ──────────────────────────────────────┐    │
│  │                                                      │    │
│  │ EGGlogU  🥚  187,200 granjas   $1.12M MRR  (40%)   │    │
│  │ COWlogU  🐄   78,000 granjas   $0.84M MRR  (30%)   │    │
│  │ PIGlogU  🐷   31,200 granjas   $0.42M MRR  (15%)   │    │
│  │ FISHlogU 🐟   9,360 granjas    $0.22M MRR  (8%)    │    │
│  │ GOATlogU 🐐   3,120 granjas    $0.11M MRR  (4%)    │    │
│  │ BEElogU  🐝   3,120 granjas    $0.09M MRR  (3%)    │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Multi-Especie Adoption ────────────────────────────┐    │
│  │ Solo 1 especie:      78%                             │    │
│  │ 2 especies:          16%                             │    │
│  │ 3+ especies:          6%                             │    │
│  │ ARPU multi-especie:  $14.20 (vs $2.03 single)       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [EGGlogU] [COWlogU] [PIGlogU] [FISHlogU] [GOATlogU]       │
│  ← Click para ver Command Center de cada vertical           │
└─────────────────────────────────────────────────────────────┘
```

### 16.7 TAM por Vertical (Total Addressable Market)

| Vertical | Granjas Mundiales Estimadas | TAM (100% captura × $10 ARPU) |
|----------|---------------------------|-------------------------------|
| **EGGlogU** (aves) | 5-10 millones | $600M - $1.2B/año |
| **COWlogU** (bovino) | 2-5 millones | $240M - $600M/año |
| **PIGlogU** (porcino) | 1-3 millones | $120M - $360M/año |
| **FISHlogU** (acuicultura) | 0.5-2 millones | $60M - $240M/año |
| **GOATlogU** (caprino/ovino) | 1-3 millones | $120M - $360M/año |
| **BEElogU** (apicultura) | 0.5-1 millón | $60M - $120M/año |
| **FarmlogU Total** | **10-24 millones** | **$1.2B - $2.9B/año** |

### 16.8 Orden de Lanzamiento (Estrategia)

```
╔═══════════════════════════════════════════════════════════════╗
║  PRIORIDAD ABSOLUTA: EGGLOGU PRIMERO                         ║
║                                                               ║
║  No se toca ninguna otra vertical hasta que EGGlogU esté:     ║
║  ✓ Backend SaaS estable en producción                        ║
║  ✓ 10K+ granjas activas                                      ║
║  ✓ Pipeline de bugs funcionando autónomo                     ║
║  ✓ Revenue positivo y creciendo                              ║
║  ✓ Infraestructura probada bajo carga real                   ║
║                                                               ║
║  RECIÉN ENTONCES se evalúa la segunda vertical.               ║
╚═══════════════════════════════════════════════════════════════╝

AÑO 1: EGGlogU → ÚNICO FOCO
        ├── YA CONSTRUIDO — solo necesita backend
        ├── Validar modelo SaaS completo con usuarios reales
        ├── Alcanzar 10K granjas, estabilizar infra
        └── NADA más se desarrolla hasta que esto funcione

AÑO 2+: COWlogU → SOLO si EGGlogU ya es rentable y estable
         Reusar 80% del código de EGGlogU
         Específico: módulos de lactación, gestación, toda la carne

AÑO 3+: PIGlogU → SOLO si COWlogU valida el modelo multi-especie
         Específico: toda la carne porcina, ciclo reproductivo, faena

AÑO 4+: FISHlogU + GOATlogU → Nichos rentables
         Acuicultura crece 5-7% anual (industria más rápida)

AÑO 5+: BEElogU + unificación FarmlogU
         Rebrand: EGGlogU/COWlogU/etc. → FarmlogU con módulos
         Command Center unificado multi-especie

RESULTADO AÑO 5:
  FarmlogU con 6 verticales
  ~100K-500K granjas
  $1M-5M MRR
  80% código compartido entre verticales
  1 Command Center para gobernarlos a todos

NOTA: Los años son MÍNIMOS, no deadlines. Cada vertical
se lanza SOLO cuando la anterior ya es sólida. Calidad > velocidad.
```

### 16.9 Posicionamiento de Marca — "The Necessary Farm Tool"

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║          FARMLOGU = HERRAMIENTA NECESARIA DE GRANJA           ║
║                                                               ║
║  No es un "nice to have". No es un lujo. No es opcional.      ║
║                                                               ║
║  FarmlogU es tan necesario para una granja como:              ║
║  • El tractor es necesario para arar                         ║
║  • La balanza es necesaria para pesar                        ║
║  • El termómetro es necesario para medir temperatura          ║
║                                                               ║
║  FarmlogU es necesario para PRODUCIR, MEDIR y CRECER.         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

**Cómo se logra el status de "necesario":**

| Estrategia | Qué Hace | Resultado |
|------------|----------|-----------|
| **Dependencia operativa** | El granjero registra producción diaria en la app | Sin la app, pierde trazabilidad |
| **Compliance obligatorio** | Exportadores NECESITAN reportes sanitarios digitales | Sin la app, no pueden exportar |
| **Ventaja financiera medible** | VET vs NOVET: 12-18% margen vs -2% a +5% | Sin la app, pierde dinero |
| **Red de veterinarios** | Vets recomiendan la app como parte del servicio | Se vuelve estándar de la industria |
| **Gobierno/regulación** | Trazabilidad from-farm-to-table cada vez más exigida | La app es el camino más fácil para cumplir |
| **Educación técnica** | Universidades agrícolas la usan como herramienta docente | Nuevos granjeros crecen usándola |

**Mensaje de marca por vertical:**

| Vertical | Tagline |
|----------|---------|
| **EGGlogU** | "Cada huevo cuenta. EGGlogU los cuenta todos." |
| **COWlogU** | "De la leche a la carne. Todo tu hato en un solo lugar." |
| **PIGlogU** | "Toda tu piara. Todo tu negocio porcino. Controlado." |
| **FarmlogU** | "La herramienta necesaria de toda granja." |

**Posicionamiento competitivo:**

```
Otras apps de granja:    "Te ayudamos a organizar tu granja"  (OPTIONAL)
FarmlogU:                "Sin esto, tu granja pierde dinero"   (NECESSARY)

La diferencia: FarmlogU no se vende como software.
Se vende como INFRAESTRUCTURA PRODUCTIVA.
Igual que el alimento balanceado. Igual que las vacunas.
Si no lo tienes, produces menos.
```

**Realidad del mercado — Por qué no hay competencia real:**

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  LA INDUSTRIA AVÍCOLA MUEVE $300B+/AÑO GLOBALMENTE.          ║
║  Las herramientas digitales disponibles:                      ║
║                                                               ║
║    • Excel con macros de los años 90                         ║
║    • Apps genéricas de "farm management" con 5 campos         ║
║    • Software legacy de escritorio que corre en Windows XP    ║
║    • Cuadernos de papel (literal — millones de granjas)       ║
║                                                               ║
║  No es culpa nuestra que la competencia nunca se puso         ║
║  las pilas. El mercado estuvo desatendido por DÉCADAS.        ║
║                                                               ║
║  Para construir lo que FarmlogU tiene se necesita:            ║
║                                                               ║
║    1. Conocimiento avícola profundo                          ║
║       → No basta saber programar. Hay que entender           ║
║         HD%, FCR, curvas de producción por raza,              ║
║         protocolos sanitarios, bioseguridad, nutrición,       ║
║         canales de comercialización, normativa por país.      ║
║                                                               ║
║    2. Conocimiento del usuario real                           ║
║       → El granjero promedio no tiene WiFi estable,           ║
║         no tiene laptop, trabaja 12 horas al día,             ║
║         y necesita que la app funcione con una mano           ║
║         mientras sostiene una gallina con la otra.            ║
║                                                               ║
║    3. Voluntad de construir 22 módulos                       ║
║       → Las startups quieren MVP de 3 features y vender.     ║
║         Nadie quiere construir bioseguridad, trazabilidad,    ║
║         audit trails, y curvas de raza. No es "sexy".        ║
║         Pero es lo que la industria NECESITA.                 ║
║                                                               ║
║    4. Visión de ecosistema completo                          ║
║       → Otros ven "app de huevos". Nosotros vemos:           ║
║         producción + finanzas + sanidad + compliance +        ║
║         clientes + inventario + personal + ambiente +         ║
║         trazabilidad + predicción + Command Center.           ║
║                                                               ║
║  ═══════════════════════════════════════════════════════       ║
║  RESULTADO: El mercado no está vacío por accidente.           ║
║  Está vacío porque NADIE hizo el trabajo completo.            ║
║  FarmlogU lo hizo. Y por eso los 201 campos no son            ║
║  un capricho — son la realidad de lo que una granja           ║
║  necesita medir para ser rentable.                            ║
║                                                               ║
║  La competencia no va a cerrar esa brecha rápido.             ║
║  Necesitarían años de conocimiento de dominio que              ║
║  no tienen, construyendo features que no consideran           ║
║  importantes, para un usuario que no entienden.               ║
╚═══════════════════════════════════════════════════════════════╝
```

### 16.10 Portabilidad de Datos — "La Jaula Abierta"

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║          PRINCIPIO: EL DATO ES DEL GRANJERO. SIEMPRE.         ║
║                                                               ║
║  El usuario puede exportar TODO, en CUALQUIER momento,        ║
║  en MÚLTIPLES formatos. Cero restricciones.                   ║
║                                                               ║
║  PERO — nuestro schema es tan profundo y rico que             ║
║  importarlo en otra plataforma = perder el 70-90% de          ║
║  la información. No por candado. Por complejidad real.        ║
║                                                               ║
║  Y NOSOTROS leemos TODO lo que exista afuera.                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

#### 16.10.1 Formatos de Exportación (el usuario elige)

| Formato | Contenido | Uso Típico |
|---------|-----------|------------|
| **JSON completo** | 22 módulos, 201+ campos, relaciones intactas | Backup total, migración entre dispositivos FarmlogU |
| **CSV por módulo** | 1 archivo CSV por módulo (producción, finanzas, clientes, etc.) | Excel, Google Sheets, análisis externo |
| **PDF reporte** | Resumen ejecutivo con gráficos, KPIs, financiero | Bancos, inversionistas, auditores, gobierno |
| **Excel (.xlsx)** | Múltiples hojas (1 por módulo) con fórmulas preservadas | Contadores, análisis financiero |
| **XML sanitario** | Formato estándar de trazabilidad pecuaria | Entes reguladores (SAG, SENASA, USDA) |
| **API REST** | Endpoints por módulo con paginación | Integración con ERPs, sistemas del cliente |

#### 16.10.2 Por Qué la Exportación NO es Riesgo Competitivo

```
SCHEMA EGGLOGU — 22 módulos, 201+ campos únicos:

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  MÓDULOS (22):                                                  │
│  ├── flocks (12 campos)         ← razas, curvas, curveAdjust   │
│  ├── dailyProduction (17 campos) ← por tipo, canal, yolk score │
│  ├── inventory (8 campos)       ← tracking in/out por tipo     │
│  ├── clients (14 campos)        ← 5 canales, precios por talla │
│  ├── finances.income (10 campos) ← por canal + tipo + cliente  │
│  ├── finances.expenses (6 campos)                               │
│  ├── finances.receivables                                       │
│  ├── vaccines (9 campos)        ← cobertura %, método, schedule│
│  ├── medications (9 campos)     ← retiro, dosis, ruta           │
│  ├── outbreaks (9 campos)       ← enfermedad, tratamiento       │
│  ├── feed.purchases (6 campos)  ← proveedor, tipo, costo/kg    │
│  ├── feed.consumption (5 campos) ← por parvada/día             │
│  ├── environment (8 campos)     ← temp, humedad, amoniaco, luz │
│  ├── biosecurity.zones (6 campos)                               │
│  ├── biosecurity.visitors (8 campos) ← placa, desinfección     │
│  ├── biosecurity.disinfections (7 campos)                       │
│  ├── checklist (6 campos)       ← turnos, items, usuario        │
│  ├── personnel (7 campos)       ← roles, salarios              │
│  ├── kpiSnapshots (11 campos)   ← HD%, FCR, costo/huevo        │
│  ├── logbook (6 campos)         ← bitácora operativa           │
│  ├── traceability (lotes + códigos)                             │
│  ├── auditLog (7 campos)        ← quién hizo qué y cuándo     │
│  └── users (5 campos)           ← roles RBAC                   │
│                                                                 │
│  TOTAL: 201+ campos únicos con relaciones cruzadas              │
│                                                                 │
│  RELACIONES INTERNAS:                                           │
│  • dailyProduction → flockId → flocks                           │
│  • inventory → flockId + ref → dailyProduction/income           │
│  • finances.income → clientId → clients + marketChannel         │
│  • vaccines → flockId → flocks (con schedule predictivo)        │
│  • feed.consumption → flockId (cálculo FCR automático)          │
│  • biosecurity.disinfections → zoneId → zones                   │
│  • kpiSnapshots → agregación de TODOS los módulos               │
│  • auditLog → referencia cruzada con TODA operación             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

COMPETIDOR TÍPICO — 3 a 5 módulos, ~30 campos:

┌──────────────────────────┐
│  • producción (5 campos) │
│  • ventas (4 campos)     │
│  • gastos (3 campos)     │
│  • inventario básico     │
│  • notas                 │
└──────────────────────────┘
```

**¿Qué pasa cuando un usuario exporta de EGGlogU e intenta usar sus datos en otro sistema?**

**IMPORTANTE: El usuario NUNCA pierde su información.** La tiene completa en sus archivos exportados (JSON, CSV, Excel). Toda. Sin excepción.

El problema es del OTRO sistema: **no tiene los features para usar esos datos.**

| Dato EGGlogU (el usuario lo tiene) | ¿El competidor puede USARLO? | Resultado en el otro sistema |
|-------------------------------------|------------------------------|------------------------------|
| Producción por tipo de huevo (S/M/L/XL/Jumbo) | ❌ Solo acepta total | Dato existe en su archivo pero no tiene dónde meterlo → inútil |
| Precio por canal de mercado (5 canales) | ❌ Precio único | Tiene 5 precios distintos pero el otro sistema solo lee 1 |
| Curvas de producción por raza con `curveAdjust` | ❌ No existe el módulo | El dato está en su JSON pero el sistema no sabe qué hacer con él |
| Score de yema + color de cáscara | ❌ No existe | Información de calidad huérfana |
| 668 registros de vacunas con cobertura % | ❌ No existe | Historial sanitario completo sin hogar |
| Bioseguridad (zonas + visitantes + desinfecciones) | ❌ No existe | Datos de compliance que nadie lee |
| Ambiente (temp + humedad + amoniaco + ventilación) | ❌ No existe | Datos ambientales sin correlación |
| Audit log (quién hizo qué, cuándo, antes/después) | ❌ No existe | Trazabilidad operativa descartada |
| FCR calculado por parvada con feed real | ❌ No existe | Eficiencia alimenticia ignorada |
| 25 combinaciones precio (5 canales × 5 tallas) | ❌ 1 precio genérico | Toda la estrategia de pricing colapsada en 1 número |

**Resultado: el usuario tiene 100% de sus datos. Pero al intentar subirlos a otro sistema, ese sistema solo puede LEER el ~15-30%.** El resto del archivo queda ahí — el usuario lo conserva — pero es como tener una enciclopedia para alguien que solo sabe leer el índice. Básicamente empiezan de nuevo con números generales.

#### 16.10.3 Importación — Nosotros Leemos TODO

```
╔═══════════════════════════════════════════════════════════════╗
║  FARMLOGU IMPORTA DESDE CUALQUIER FUENTE                     ║
║                                                               ║
║  Formato          │  Cómo lo leemos                          ║
║  ─────────────────┼──────────────────────────────────────     ║
║  CSV genérico     │  Parser inteligente con mapeo de campos  ║
║  Excel (.xlsx)    │  Detección automática de columnas         ║
║  JSON (cualquier) │  Mapper flexible con schema matching      ║
║  XML sanitario    │  Parsers SENASA/SAG/USDA precargados     ║
║  Otro *logU       │  FarmlogU JSON = importación perfecta    ║
║  Competidor X     │  Templates de mapeo por competidor        ║
║  Datos manuales   │  Wizard guiado paso a paso               ║
║                                                               ║
║  REGLA: Si el dato existe en algún formato,                   ║
║         FarmlogU lo lee. Cero fricciones de entrada.          ║
╚═══════════════════════════════════════════════════════════════╝
```

**Sistema de Mapeo Inteligente (Import Wizard):**

```
Paso 1: Usuario sube archivo (CSV, Excel, JSON, XML)
         ↓
Paso 2: Motor de detección analiza columnas/campos
        "Detectamos: fecha, cantidad_huevos, precio, nombre_cliente"
         ↓
Paso 3: Auto-mapeo a schema FarmlogU
        fecha → dailyProduction.date ✓
        cantidad_huevos → dailyProduction.eggsCollected ✓
        precio → finances.income.unitPrice ✓
        nombre_cliente → clients.name ✓
         ↓
Paso 4: Campos no mapeados → sugerir módulo destino
        "columna_desconocida" → ¿Notas? ¿Campo personalizado?
         ↓
Paso 5: Preview + confirmación
        "Se importarán 2,340 registros en 4 módulos. ¿Confirmar?"
         ↓
Paso 6: Importación + audit log
        "Importados 2,340 registros. Los campos vacíos se pueden
         completar después desde cada módulo."
```

**Lector Inteligente de Datos — Motor de Importación:**

```
╔═══════════════════════════════════════════════════════════════╗
║  FARMLOGU DATA READER — LEE TODO, DE CUALQUIER FUENTE        ║
║                                                               ║
║  JSON:                                                        ║
║  ├── Detecta schema automáticamente                          ║
║  ├── Mapea campos por nombre, tipo y contenido               ║
║  ├── Reconoce formatos de fecha (ISO, US, EU, LATAM)          ║
║  ├── Identifica IDs y relaciones entre entidades             ║
║  └── Si es FarmlogU JSON → importación perfecta 1:1          ║
║                                                               ║
║  CSV:                                                         ║
║  ├── Auto-detecta separador (coma, punto y coma, tab)        ║
║  ├── Lee headers y sugiere mapeo a módulos FarmlogU          ║
║  ├── Maneja encodings (UTF-8, Latin-1, Windows-1252)         ║
║  ├── Tolera datos sucios (espacios, formatos mixtos)         ║
║  └── Multi-archivo: sube 5 CSV y los mapea a 5 módulos      ║
║                                                               ║
║  Excel (.xlsx):                                               ║
║  ├── Lee múltiples hojas (1 hoja = 1 módulo potencial)       ║
║  ├── Detecta tablas dentro de hojas con encabezados          ║
║  ├── Ignora celdas de formato/resumen (solo datos puros)     ║
║  ├── Convierte fórmulas a valores                            ║
║  └── Preserva tipos de dato (número, fecha, texto)           ║
║                                                               ║
║  INTELIGENCIA:                                                ║
║  ├── "huevos", "eggs", "ovos" → dailyProduction.eggsCollected║
║  ├── "ventas", "sales", "vendas" → finances.income           ║
║  ├── "vacuna", "vaccine" → vaccines                          ║
║  ├── Aprende de importaciones previas del usuario            ║
║  └── Sugiere: "Este archivo parece ser producción diaria"    ║
╚═══════════════════════════════════════════════════════════════╝
```

**Templates de importación pre-construidos para competidores conocidos:**

| Fuente | Campos que leemos | Qué gana el usuario al migrar |
|--------|------------------|-------------------------------|
| Excel manual típico | fecha, cantidad, precio (todo lo que tenga) | +195 campos nuevos disponibles para llenar |
| Poultry Manager (app básica) | producción, mortalidad, feed | +180 campos (bioseguridad, trazabilidad, canales, etc.) |
| Agrobit / similar | producción, finanzas básicas | +170 campos (vacunas, ambiente, audit, etc.) |
| CSV de gobierno/regulador | trazabilidad, lotes, sanitario | Se integra directo a traceability + biosecurity |
| Desde otro FarmlogU | 201+ campos → 201+ campos | **Migración 1:1 perfecta — cero pérdida** |

#### 16.10.4 El Efecto Neto — Embudo Asimétrico

```
                    ENTRADA                    SALIDA
                    ═══════                    ══════

  Desde cualquier   ████████████████  →  FarmlogU
  formato/app       ████████████████       │
                    ████████████████       │  201+ campos
                    (100% importado)        │  22 módulos
                    Lector inteligente      │  relaciones cruzadas
                    lee JSON/CSV/Excel      │

  FarmlogU          ████████████████  →  Archivo del usuario
  exporta todo      ████████████████       │
                    ████████████████       │  EL USUARIO TIENE TODO
                    (100% exportado)        │  En JSON, CSV, Excel
                                           │  Nada se pierde.
                                           │
                    Pero si sube ese        ▼
                    archivo a OTRO      ████░░░░░░░░░░░░
                    sistema, ese solo    ~15-30% utilizable
                    puede USAR:         El otro sistema no tiene
                                        features para el resto.
                                        Los datos EXISTEN pero
                                        quedan huérfanos.

  ════════════════════════════════════════════════════════
  RESULTADO:
  • Migrar HACIA FarmlogU = fácil (leemos todo con IA)
  • Exportar DESDE FarmlogU = completo (100% del usuario)
  • Usar esa exportación en OTRO sistema = ~15-30% útil
    (no porque falten datos, sino porque faltan FEATURES)

  No es lock-in. Es DEPTH-in.
  El dato siempre es tuyo. Pero solo FarmlogU sabe leerlo todo.
```

#### 16.10.5 Garantías de Portabilidad (Compliance GDPR/regulatorio)

| Garantía | Detalle |
|----------|---------|
| **Derecho a exportar** | Cualquier usuario, cualquier tier (incluso Free), puede exportar TODO en JSON |
| **Tiempo de exportación** | < 30 segundos para cualquier volumen |
| **Sin penalización** | Exportar no bloquea, no cobra extra, no limita funciones |
| **Formato estándar** | JSON + CSV siempre disponibles (no formatos propietarios) |
| **Datos eliminables** | Usuario puede pedir eliminación total (GDPR Art. 17) → se borra de TODO incluyendo backups en 30 días |
| **API abierta** | Tier Pro+ tiene API REST para extraer datos programáticamente |
| **Transparencia** | El usuario ve exactamente qué datos tenemos (descarga = espejo exacto) |

**Mensaje al usuario en la app:**

```
┌──────────────────────────────────────────────────────┐
│  Tus datos son TUYOS.                                │
│                                                      │
│  Puedes exportarlos en cualquier momento,             │
│  en el formato que prefieras.                        │
│  Sin costos extra. Sin restricciones. Sin trucos.    │
│                                                      │
│  [Exportar JSON]  [Exportar CSV]  [Exportar PDF]     │
│  [Exportar Excel] [Exportar XML]  [API Access]       │
└──────────────────────────────────────────────────────┘
```

**La confianza genera retención. El lock-in genera resentimiento.**
FarmlogU elige confianza. Y la profundidad del sistema hace el resto.

### 16.11 Lo que Nunca Cambia (Core Invariants)

```
╔═══════════════════════════════════════════════════════════════╗
║  PRINCIPIOS FARMLOGU — No negociables                         ║
║                                                               ║
║  1. OFFLINE-FIRST — Las granjas NO tienen internet confiable  ║
║     La app SIEMPRE funciona sin conexión.                     ║
║                                                               ║
║  2. PRIVACIDAD ABSOLUTA — Datos del granjero son del granjero ║
║     Command Center solo ve datos anonimizados/agregados.      ║
║     K-anonymity: segmentos < 10 granjas = ocultos.            ║
║                                                               ║
║  3. ZERO CONTAGION — Bug en una granja no afecta a otra       ║
║     Schema isolation + circuit breakers + canary deploy.      ║
║                                                               ║
║  4. BUGS SE ARREGLAN SOLOS — Detección automática + pipeline  ║
║     El granjero aprieta "Send" UNA vez. Nosotros lo hacemos.  ║
║                                                               ║
║  5. ESTABILIDAD > FEATURES — 99.95% uptime siempre            ║
║     Mejor tener 10 módulos perfectos que 50 inestables.       ║
║                                                               ║
║  6. 8+ IDIOMAS — WALTZ garantiza que suena nativo             ║
║     No es traducción literal. Es transcreación cultural.      ║
║                                                               ║
║  7. SIMPLICIDAD — Un granjero sin educación técnica puede     ║
║     usar la app. Si necesita manual, fallamos en UX.          ║
║                                                               ║
║  8. JAULA ABIERTA — El usuario SIEMPRE puede exportar TODO    ║
║     En JSON, CSV, PDF, Excel, XML. Sin costo, sin límite.    ║
║     Nuestro moat es la PROFUNDIDAD, no el candado.            ║
║     201+ campos. 22 módulos. Ningún competidor los lee.       ║
╚═══════════════════════════════════════════════════════════════╝
```

---

*Documento generado por GenieOS — ATLAS + SENTINEL + FORGE + TERMINATOR + VAULT + RADAR + HUNTER*
*Última actualización: 2026-02-15*
