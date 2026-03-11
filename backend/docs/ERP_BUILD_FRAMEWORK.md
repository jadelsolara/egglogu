# ERP SaaS Build Framework v1.0

**Origen:** EGGlogU (primer producto de la fabrica)
**Aplica a:** Cualquier ERP SaaS futuro — PigLogU, CowLogU, Toque 360, etc.
**Principio:** Cada ERP que sale mejora la fabrica. La fabrica mejora el siguiente ERP.

---

## FILOSOFIA

```
EGGlogU v1 = exploracion ("funciona?")
EGGlogU v2 = industrializacion ("ahora bien, repetible, verificable")
FarmLogU   = plataforma ("la fabrica produce verticales")
```

La fabrica tiene 3 sistemas:
1. **Build Levels** — 7 fases con gates (no avanzas sin pasar)
2. **Checklist Automatico** — verificacion sin intervencion humana
3. **Autodiagnostico** — `python scripts/erp_diagnostic.py` revisa todo

---

## NIVELES DE CONSTRUCCION (F0-F6)

Cada nivel tiene:
- **Que se hace** (tareas)
- **Gate de salida** (criterio para avanzar)
- **Checklist automatico** (script lo verifica)
- **Lecciones de EGGlogU** (lo que aprendimos)

### NIVEL F0: Diseno de Dominio
**Antes de escribir una sola linea de codigo.**

| Tarea | Entregable | Verificable |
|-------|-----------|-------------|
| Mapear entidades del negocio | Lista de modelos con campos | Script cuenta modelos |
| Definir relaciones (quien pertenece a quien) | FK map | Script verifica ForeignKey |
| Listar reglas de negocio en espanol plano | Documento BUSINESS_RULES.md | Archivo existe |
| Definir estados y transiciones | Enums en modelos | Script cuenta enums |
| Separar CORE vs MODULO | Mapa core/module | Documentado |
| Definir mixins base | base.py con TenantMixin, TimestampMixin, SoftDeleteMixin | Script verifica |

**Gate F0:** Todos los modelos mapeados, mixins definidos, auth models existen, >50% tenant-scoped
**Leccion EGGlogU:** Empezamos sin separar core/modulo y costo 2 sesiones rehacer. SIEMPRE separar primero.

---

### NIVEL F1: Data Model (Capa 0)
**La base de datos es la verdad. Todo lo demas se construye encima.**

| Tarea | Entregable | Verificable |
|-------|-----------|-------------|
| Modelos SQLAlchemy con mixins | *.py en src/models/ | Script cuenta archivos |
| FK reales (nunca strings) | ForeignKey en cada relacion | Script verifica |
| Enums tipados para estados | class XxxStatus(str, Enum) | Script cuenta enums |
| Migraciones Alembic | alembic/versions/*.py | Script verifica cadena |
| Seeds con datos realistas | src/seeds/demo_seed.py | Archivo existe |
| __init__.py exporta todo | from src.models.xxx import Xxx | Script compara imports vs archivos |
| Relationships bidireccionales | back_populates en ambos lados | Script audita |

**Gate F1:** Alembic chain = 1 head + 1 base, seeds existen, >80% TimestampMixin coverage
**Leccion EGGlogU:**
- Campo names deben coincidir EXACTO entre seed y modelo (temp_c, no temperature)
- AuditLog usa string IDs por diseno (sobrevive deletes) — documentar excepciones
- CRM/Community sin TenantMixin es correcto (platform-wide)

---

### NIVEL F2: Business Services (Capa 1) — LA CLAVE
**Aqui vive la logica. Si cambias una regla, solo tocas 1 archivo.**

| Tarea | Entregable | Verificable |
|-------|-----------|-------------|
| 1 service por dominio | src/services/*.py | Script cuenta |
| Patron BaseService(db, org_id, user_id) | Todas las clases heredan | Script verifica |
| Reglas de negocio SOLO aqui | Cero db.add() en routes | Script audita routes |
| Tests unitarios por service | tests/test_services/*.py | Script cuenta |
| Services CORE genericos | AuthService, BillingService | Archivos existen |
| Services MODULO especificos | FlockService, ProductionService | Archivos existen |

**Gate F2:** >=5 services, >70% siguen BaseService pattern, tests de service existen
**Leccion EGGlogU v1:** No teniamos services — logica en routes, componentes, store. Cambiar 1 regla = tocar 3 archivos. NUNCA MAS.

```python
# PATRON SERVICE — El corazon de la fabrica
class BaseService:
    def __init__(self, db: AsyncSession, org_id: UUID, user_id: UUID):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id

class FlockService(BaseService):
    async def create(self, data: FlockCreate) -> Flock:
        # TODA la logica aqui
        ...
    async def get_active(self) -> list[Flock]:
        # Filtro tenant automatico via self.org_id
        ...
```

---

### NIVEL F3: API Layer (Capa 2)
**Las rutas NO piensan. Solo reciben, delegan, responden.**

| Tarea | Entregable | Verificable |
|-------|-----------|-------------|
| Rutas delegan a Services | @router.post -> service.create() | Script audita |
| Pydantic schemas (Create, Read, Update) | src/schemas/*.py | Script cuenta |
| response_model en cada ruta | response_model=XxxRead | Script cuenta |
| Error handling centralizado | src/core/exceptions.py | Archivo existe |
| Auth dependency en rutas protegidas | Depends(get_current_user) | Script verifica |
| Versionado /v1/ | Prefijo en todas las rutas | Grep verifica |

**Gate F3:** >=5 route files, >=5 schema files, exceptions.py existe, auth dependency presente
**Leccion EGGlogU:** Routes con 200+ lineas de logica son imposibles de testear. Service pattern lo resuelve.

```python
# PATRON RUTA — Solo delega (max 10 lineas por endpoint)
@router.post("/flocks", response_model=FlockRead)
async def create_flock(data: FlockCreate, db=Depends(get_db), user=Depends(get_current_user)):
    service = FlockService(db, user.organization_id, user.id)
    return await service.create(data)
```

---

### NIVEL F4: Frontend State (Capa 3)
**El frontend es un espejo del backend. No inventa datos.**

| Tarea | Entregable | Verificable |
|-------|-----------|-------------|
| Store centralizado | src/core/store.js | Archivo existe |
| API client con auth | src/core/api.js | Archivo existe |
| Event bus | src/core/bus.js | Archivo existe |
| i18n multi-idioma | src/i18n/translations.js | Archivo existe |
| Offline queue (si aplica) | IndexedDB + sync | Implementado |

**Gate F4:** Store, API client, event bus existen
**Leccion EGGlogU:** Bus de eventos evita acoplamiento entre componentes. Store con namespace por modulo escala mejor.

---

### NIVEL F5: UI Components (Capa 4)
**Componentes reciben datos, renderizan, emiten eventos. NADA MAS.**

| Tarea | Entregable | Verificable |
|-------|-----------|-------------|
| Componentes atomicos reutilizables | fl-button, fl-datatable, fl-modal | Archivos existen |
| Modulos de negocio componen atomicos | egg-dashboard, egg-flocks | Archivos existen |
| Shadow DOM para aislamiento | attachShadow() en cada componente | Script verifica |
| Max 500 lineas por componente | Ningun archivo >500 lines | Script cuenta |
| Build pipeline (Vite) | vite.config.js | Archivo existe |

**Gate F5:** >=5 componentes, >50% usan Shadow DOM, vite.config existe
**Leccion EGGlogU v1:** Componentes de 1700 lineas son imposibles de mantener. Max 300-500 es el sweet spot.

---

### NIVEL F6: Tests & CI (Capa 5)
**Si CI no pasa, no se deploya. Punto.**

| Tarea | Entregable | Verificable |
|-------|-----------|-------------|
| Tests unitarios (services) | tests/test_services/ | Script cuenta |
| Tests integracion (API) | tests/test_api/ | Script cuenta |
| conftest.py con fixtures | tests/conftest.py | Archivo existe |
| CI pipeline | .github/workflows/ci.yml | Archivo existe |
| Docker Compose para dev | docker-compose.yml | Archivo existe |
| Safe deploy script | scripts/safe_deploy.sh | Archivo existe |

**Gate F6:** >=5 test files, CI exists, conftest exists, docker-compose exists
**Leccion EGGlogU:** Deploy sin health checks = downtime. SIEMPRE safe_deploy.sh.

---

## SISTEMA DE AUTODIAGNOSTICO

### Ejecucion
```bash
# Desde backend/
python scripts/erp_diagnostic.py              # Todos los niveles
python scripts/erp_diagnostic.py --level 1    # Solo F1
python scripts/erp_diagnostic.py --up-to 3    # F0 hasta F3
python scripts/erp_diagnostic.py --json       # Salida JSON (para CI)
```

### Salida ejemplo
```
======================================================================
  ERP BUILD DIAGNOSTIC — EGGlogU / FarmLogU
======================================================================

  F0: Domain Design
  Score: 6/6 (100%)  |  Gate: [PASS] OPEN
  ──────────────────────────────────────────────────────────
    [OK] model_files_exist: 36 model files found
    [OK] base_mixins_defined: Tenant=True, Timestamp=True, SoftDelete=True
    [OK] core_auth_models: Organization=True, User=True, Role=True
    [OK] multi_tenant_coverage: 45/36 models are tenant-scoped
    [OK] enums_defined: 55 enum classes found
    [OK] models_init_exports: 36 imports in __init__.py vs 36 model files

  F1: Data Model
  Score: 8/8 (100%)  |  Gate: [PASS] OPEN
  ──────────────────────────────────────────────────────────
    [OK] alembic_configured: alembic.ini found
    [OK] migrations_exist: 27 migration files
    [OK] alembic_chain_integrity: heads=1, bases=1, revisions=27
    ...
```

### Integracion con CI
```yaml
# .github/workflows/ci.yml
- name: ERP Diagnostic
  run: |
    cd backend
    python scripts/erp_diagnostic.py --json > diagnostic.json
    python scripts/erp_diagnostic.py --up-to 3  # Fail CI if F0-F3 not passing
```

---

## CHECKLIST POR NIVEL (para humanos)

### Pre-F0 (antes de empezar un ERP nuevo)
- [ ] Definir vertical del negocio (avicola, porcino, agricola, etc.)
- [ ] Listar 10-20 entidades principales del dominio
- [ ] Identificar que es CORE (auth, billing) vs MODULO (dominio especifico)
- [ ] Copiar estructura base de FarmLogU template

### Pre-F1
- [ ] F0 gate OPEN (correr diagnostico)
- [ ] Todos los modelos tienen campo en papel antes de codigo
- [ ] Decidir que modelos llevan SoftDelete vs hard delete

### Pre-F2
- [ ] F1 gate OPEN
- [ ] `alembic upgrade head` funciona limpio
- [ ] Seeds generan datos realistas

### Pre-F3
- [ ] F2 gate OPEN
- [ ] Puedo ejecutar `service.create()` desde un test sin UI ni API

### Pre-F4
- [ ] F3 gate OPEN
- [ ] API responde JSON correcto en Postman/curl

### Pre-F5
- [ ] F4 gate OPEN
- [ ] Store refleja datos del backend

### Pre-F6
- [ ] F5 gate OPEN
- [ ] UI renderiza datos reales
- [ ] Flujo completo funciona end-to-end

---

## REGLA DE ORO
```
1 cambio de negocio = 1 archivo (el Service)
1 modulo nuevo = copiar estructura + llenar Services + registrar module.js
Si toco mas de 1 capa por cambio -> el diseno esta mal
```

## ANTI-PATRONES (cristalizados de EGGlogU v1)
1. Empezar por la UI y "despues vemos el backend"
2. Logica de validacion duplicada en frontend Y backend
3. Componentes de 1000+ lineas que hacen todo
4. Rutas API que calculan, validan, guardan, y responden
5. Store sin estrategia de sync clara
6. Tests solo al final (o nunca)
7. Monolito JS que crece sin estructura
8. Mezclar codigo de modulos diferentes en mismos archivos
9. Seeds con nombres de campo inventados (SIEMPRE leer el modelo primero)
10. Asumir que grep no miente (verificar leyendo el archivo real)

## VELOCIDAD ESPERADA POR ERP
```
ERP #1 (EGGlogU):  ~3 meses (construyendo fabrica al mismo tiempo)
ERP #2:            ~4-6 semanas (fabrica ya existe, solo llenar modulo)
ERP #3+:           ~2-3 semanas (fabrica pulida, patrones conocidos)
```

---

## VERSIONAMIENTO DEL FRAMEWORK

| Version | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-03-11 | Version inicial basada en EGGlogU v1 learnings |

**Regla:** Cada ERP terminado actualiza este documento con lecciones nuevas.
