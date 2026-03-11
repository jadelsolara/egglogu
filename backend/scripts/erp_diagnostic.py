"""ERP Build Diagnostic — Self-checking system for EGGlogU/FarmLogU ERPs.

Validates each build level (F0-F6) automatically.
Run: python -m scripts.erp_diagnostic [--level N] [--all] [--fix] [--json]

Exit codes:
  0 = all checks pass
  1 = failures found
  2 = script error
"""

import argparse
import importlib
import inspect
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── Project paths ─────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent  # backend/
SRC = PROJECT_ROOT / "src"
MODELS_DIR = SRC / "models"
SCHEMAS_DIR = SRC / "schemas"
API_DIR = SRC / "api"
SERVICES_DIR = SRC / "services"
SEEDS_DIR = SRC / "seeds"
ALEMBIC_DIR = PROJECT_ROOT / "alembic"
TESTS_DIR = PROJECT_ROOT / "tests"


# ── Result types ──────────────────────────────────────────────
@dataclass
class Check:
    name: str
    level: int  # F0-F6
    passed: bool
    message: str
    fix_hint: Optional[str] = None
    severity: str = "error"  # error | warning | info


@dataclass
class LevelReport:
    level: int
    name: str
    checks: list[Check] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(c.passed for c in self.checks if c.severity == "error")

    @property
    def score(self) -> str:
        total = len(self.checks)
        ok = sum(1 for c in self.checks if c.passed)
        pct = (ok / total * 100) if total else 0
        return f"{ok}/{total} ({pct:.0f}%)"

    @property
    def gate_open(self) -> bool:
        """Can we proceed to the next level?"""
        errors = [c for c in self.checks if not c.passed and c.severity == "error"]
        return len(errors) == 0


LEVEL_NAMES = {
    0: "Domain Design",
    1: "Data Model",
    2: "Business Services",
    3: "API Layer",
    4: "Frontend State",
    5: "UI Components",
    6: "Tests & CI",
}


# ═══════════════════════════════════════════════════════════════
# LEVEL 0: Domain Design
# ═══════════════════════════════════════════════════════════════
def check_f0(report: LevelReport):
    """F0 — Domain Design checks."""

    # 0.1 Models exist
    model_files = list(MODELS_DIR.glob("*.py"))
    model_files = [f for f in model_files if f.name not in ("__init__.py", "base.py")]
    report.checks.append(Check(
        name="model_files_exist",
        level=0,
        passed=len(model_files) >= 10,
        message=f"{len(model_files)} model files found",
        fix_hint="Create model files in src/models/",
    ))

    # 0.2 Base mixins defined
    base_py = MODELS_DIR / "base.py"
    if base_py.exists():
        content = base_py.read_text()
        has_tenant = "TenantMixin" in content
        has_timestamp = "TimestampMixin" in content
        has_softdel = "SoftDeleteMixin" in content
        report.checks.append(Check(
            name="base_mixins_defined",
            level=0,
            passed=all([has_tenant, has_timestamp, has_softdel]),
            message=f"Tenant={has_tenant}, Timestamp={has_timestamp}, SoftDelete={has_softdel}",
            fix_hint="Define TenantMixin, TimestampMixin, SoftDeleteMixin in src/models/base.py",
        ))
    else:
        report.checks.append(Check(
            name="base_mixins_defined", level=0, passed=False,
            message="base.py not found", fix_hint="Create src/models/base.py",
        ))

    # 0.3 Auth model has Organization + User + Role
    auth_py = MODELS_DIR / "auth.py"
    if auth_py.exists():
        content = auth_py.read_text()
        has_org = "class Organization" in content
        has_user = "class User" in content
        has_role = "class Role" in content or "Role" in content
        report.checks.append(Check(
            name="core_auth_models",
            level=0,
            passed=all([has_org, has_user, has_role]),
            message=f"Organization={has_org}, User={has_user}, Role={has_role}",
            fix_hint="Define Organization, User, Role in src/models/auth.py",
        ))
    else:
        report.checks.append(Check(
            name="core_auth_models", level=0, passed=False,
            message="auth.py not found",
        ))

    # 0.4 Multi-tenant: models reference organization_id
    tenant_count = 0
    for f in model_files:
        content = f.read_text()
        if "organization_id" in content or "TenantMixin" in content:
            tenant_count += 1
    report.checks.append(Check(
        name="multi_tenant_coverage",
        level=0,
        passed=tenant_count >= len(model_files) * 0.5,
        message=f"{tenant_count}/{len(model_files)} models are tenant-scoped",
        fix_hint="Add TenantMixin to business models",
        severity="warning" if tenant_count >= len(model_files) * 0.3 else "error",
    ))

    # 0.5 Enums defined for states
    enum_count = 0
    for f in model_files:
        content = f.read_text()
        enum_count += len(re.findall(r"class \w+\(.*(?:str,\s*Enum|enum\.Enum)", content))
    report.checks.append(Check(
        name="enums_defined",
        level=0,
        passed=enum_count >= 5,
        message=f"{enum_count} enum classes found",
        fix_hint="Define enums for states/types in models",
    ))

    # 0.6 __init__.py exports all models
    init_py = MODELS_DIR / "__init__.py"
    if init_py.exists():
        init_content = init_py.read_text()
        import_count = init_content.count("from src.models.")
        report.checks.append(Check(
            name="models_init_exports",
            level=0,
            passed=import_count >= len(model_files) * 0.8,
            message=f"{import_count} imports in __init__.py vs {len(model_files)} model files",
            fix_hint="Export all models from src/models/__init__.py",
        ))
    else:
        report.checks.append(Check(
            name="models_init_exports", level=0, passed=False,
            message="__init__.py not found",
        ))


# ═══════════════════════════════════════════════════════════════
# LEVEL 1: Data Model
# ═══════════════════════════════════════════════════════════════
def check_f1(report: LevelReport):
    """F1 — Data Model checks."""

    # 1.1 Alembic configured
    alembic_ini = PROJECT_ROOT / "alembic.ini"
    report.checks.append(Check(
        name="alembic_configured",
        level=1,
        passed=alembic_ini.exists(),
        message=f"alembic.ini {'found' if alembic_ini.exists() else 'MISSING'}",
        fix_hint="Run: alembic init alembic",
    ))

    # 1.2 Migration files exist
    versions_dir = ALEMBIC_DIR / "versions"
    if versions_dir.exists():
        migrations = list(versions_dir.glob("*.py"))
        report.checks.append(Check(
            name="migrations_exist",
            level=1,
            passed=len(migrations) >= 1,
            message=f"{len(migrations)} migration files",
            fix_hint="Run: alembic revision --autogenerate -m 'initial'",
        ))
    else:
        report.checks.append(Check(
            name="migrations_exist", level=1, passed=False,
            message="alembic/versions/ not found",
        ))

    # 1.3 Alembic chain integrity (1 head, 1 base) — file-based parsing (no alembic import needed)
    try:
        import re as _re
        versions_dir = PROJECT_ROOT / "alembic" / "versions"
        revision_map = {}  # revision -> down_revision
        for mig_file in versions_dir.glob("*.py"):
            content = mig_file.read_text()
            rev_match = _re.search(r'^revision(?:\s*:\s*\w+)?\s*=\s*["\']([^"\']+)["\']', content, _re.MULTILINE)
            down_match = _re.search(r'^down_revision(?:\s*:\s*[^\n=]+)?\s*=\s*["\']([^"\']*)["\']', content, _re.MULTILINE)
            down_none = _re.search(r'^down_revision(?:\s*:\s*[^\n=]+)?\s*=\s*None', content, _re.MULTILINE)
            if rev_match:
                rev_id = rev_match.group(1)
                if down_none:
                    down_id = None
                elif down_match:
                    down_id = down_match.group(1) or None
                else:
                    down_id = None
                revision_map[rev_id] = down_id

        n_revs = len(revision_map)
        # Bases = revisions whose down_revision is None
        bases = [r for r, d in revision_map.items() if d is None]
        # Heads = revisions that no other revision points to as down_revision
        all_down = set(d for d in revision_map.values() if d is not None)
        heads = [r for r in revision_map if r not in all_down]
        n_heads, n_bases = len(heads), len(bases)

        report.checks.append(Check(
            name="alembic_chain_integrity",
            level=1,
            passed=n_heads == 1 and n_bases == 1,
            message=f"heads={n_heads}, bases={n_bases}, revisions={n_revs}",
            fix_hint="Fix broken chain: alembic merge heads" if n_heads > 1 else None,
        ))
    except Exception as e:
        report.checks.append(Check(
            name="alembic_chain_integrity", level=1, passed=False,
            message=f"Could not verify: {e}",
        ))

    # 1.4 FK real (no string IDs for relationships)
    model_files = [f for f in MODELS_DIR.glob("*.py")
                   if f.name not in ("__init__.py", "base.py")]
    string_fk_count = 0
    for f in model_files:
        content = f.read_text()
        # Look for relationship() without ForeignKey in same model
        if "relationship(" in content and "ForeignKey" not in content:
            # This model has relationships but no FKs — check if FKs are in mixins
            if "TenantMixin" not in content:
                string_fk_count += 1
    report.checks.append(Check(
        name="fk_real_not_strings",
        level=1,
        passed=string_fk_count == 0,
        message=f"{string_fk_count} models with relationships but no ForeignKey",
        fix_hint="Add ForeignKey columns for all relationships",
        severity="warning",
    ))

    # 1.5 Seeds exist
    seeds_exist = (SEEDS_DIR / "demo_seed.py").exists()
    report.checks.append(Check(
        name="seeds_exist",
        level=1,
        passed=seeds_exist,
        message=f"demo_seed.py {'found' if seeds_exist else 'MISSING'}",
        fix_hint="Create src/seeds/demo_seed.py with realistic test data",
    ))

    # 1.6 Seed runner exists
    runner_exists = (SEEDS_DIR / "run_seeds.py").exists()
    report.checks.append(Check(
        name="seed_runner_exists",
        level=1,
        passed=runner_exists,
        message=f"run_seeds.py {'found' if runner_exists else 'MISSING'}",
        fix_hint="Create src/seeds/run_seeds.py CLI",
    ))

    # 1.7 Models use proper back_populates
    missing_backpop = 0
    total_rels = 0
    for f in model_files:
        content = f.read_text()
        rels = re.findall(r"relationship\(", content)
        total_rels += len(rels)
        # Count relationships without back_populates (allowing multi-line)
        blocks = re.findall(r"relationship\([^)]{0,500}\)", content, re.DOTALL)
        for block in blocks:
            if "back_populates" not in block and "backref" not in block:
                # One-way relationships are OK for some cases
                missing_backpop += 1
    report.checks.append(Check(
        name="relationships_bidirectional",
        level=1,
        passed=missing_backpop <= total_rels * 0.2,
        message=f"{total_rels} relationships, {missing_backpop} one-way (intentional OK)",
        severity="warning",
    ))

    # 1.8 TimestampMixin coverage
    ts_count = 0
    for f in model_files:
        content = f.read_text()
        if "TimestampMixin" in content or "created_at" in content:
            ts_count += 1
    report.checks.append(Check(
        name="timestamp_coverage",
        level=1,
        passed=ts_count >= len(model_files) * 0.8,
        message=f"{ts_count}/{len(model_files)} models have timestamps",
        fix_hint="Add TimestampMixin to all models",
    ))


# ═══════════════════════════════════════════════════════════════
# LEVEL 2: Business Services
# ═══════════════════════════════════════════════════════════════
def check_f2(report: LevelReport):
    """F2 — Business Services checks."""

    # 2.1 Services directory exists
    report.checks.append(Check(
        name="services_dir_exists",
        level=2,
        passed=SERVICES_DIR.exists(),
        message=f"src/services/ {'found' if SERVICES_DIR.exists() else 'MISSING'}",
        fix_hint="Create src/services/ directory",
    ))

    if not SERVICES_DIR.exists():
        report.checks.append(Check(
            name="services_count", level=2, passed=False,
            message="No services directory",
        ))
        return

    # 2.2 Service files exist
    service_files = list(SERVICES_DIR.glob("*.py"))
    service_files = [f for f in service_files if f.name != "__init__.py"]
    report.checks.append(Check(
        name="services_count",
        level=2,
        passed=len(service_files) >= 5,
        message=f"{len(service_files)} service files",
        fix_hint="Create service files: 1 per domain",
    ))

    # 2.3 Services follow BaseService pattern (own __init__ or inherits BaseService)
    base_pattern_count = 0
    for f in service_files:
        content = f.read_text()
        has_init = "def __init__" in content and ("db" in content or "session" in content)
        inherits_base = "BaseService" in content and "class " in content
        if has_init or inherits_base:
            base_pattern_count += 1
    report.checks.append(Check(
        name="services_base_pattern",
        level=2,
        passed=base_pattern_count >= len(service_files) * 0.7 if service_files else False,
        message=f"{base_pattern_count}/{len(service_files)} follow BaseService pattern",
        fix_hint="Services should accept (db, org_id, user_id) in __init__",
    ))

    # 2.4 No business logic in API routes
    api_files = list(API_DIR.glob("*.py")) if API_DIR.exists() else []
    api_files = [f for f in api_files if f.name != "__init__.py"]
    logic_in_routes = 0
    for f in api_files:
        content = f.read_text()
        # Heuristic: if route has db.add/db.execute/db.query directly, logic leaked
        direct_db = len(re.findall(r"\bdb\.(add|execute|query|commit|flush)\b", content))
        if direct_db > 2:  # Some db.commit() is OK for simple CRUD
            logic_in_routes += 1
    report.checks.append(Check(
        name="no_logic_in_routes",
        level=2,
        passed=logic_in_routes <= len(api_files) * 0.3 if api_files else True,
        message=f"{logic_in_routes}/{len(api_files)} routes have direct DB access (should delegate to services)",
        fix_hint="Move db.add/db.execute from routes to services",
        severity="warning",
    ))

    # 2.5 Service tests exist
    service_tests = list(TESTS_DIR.glob("**/test_*service*")) if TESTS_DIR.exists() else []
    report.checks.append(Check(
        name="service_tests_exist",
        level=2,
        passed=len(service_tests) >= 1,
        message=f"{len(service_tests)} service test files",
        fix_hint="Create tests/test_services/ with unit tests",
        severity="warning",
    ))


# ═══════════════════════════════════════════════════════════════
# LEVEL 3: API Layer
# ═══════════════════════════════════════════════════════════════
def check_f3(report: LevelReport):
    """F3 — API Layer checks."""

    # 3.1 API directory exists
    report.checks.append(Check(
        name="api_dir_exists",
        level=3,
        passed=API_DIR.exists(),
        message=f"src/api/ {'found' if API_DIR.exists() else 'MISSING'}",
        fix_hint="Create src/api/ directory",
    ))

    if not API_DIR.exists():
        return

    # 3.2 Route files exist
    api_files = [f for f in API_DIR.glob("*.py") if f.name != "__init__.py"]
    report.checks.append(Check(
        name="route_files_count",
        level=3,
        passed=len(api_files) >= 5,
        message=f"{len(api_files)} route files",
    ))

    # 3.3 Pydantic schemas exist
    report.checks.append(Check(
        name="schemas_dir_exists",
        level=3,
        passed=SCHEMAS_DIR.exists(),
        message=f"src/schemas/ {'found' if SCHEMAS_DIR.exists() else 'MISSING'}",
        fix_hint="Create src/schemas/ with Pydantic v2 schemas",
    ))

    if SCHEMAS_DIR.exists():
        schema_files = [f for f in SCHEMAS_DIR.glob("*.py") if f.name != "__init__.py"]
        report.checks.append(Check(
            name="schema_files_count",
            level=3,
            passed=len(schema_files) >= 5,
            message=f"{len(schema_files)} schema files",
            fix_hint="Create Pydantic schemas: Create, Read, Update per entity",
        ))

    # 3.4 Routes use response_model
    response_model_count = 0
    total_routes = 0
    for f in api_files:
        content = f.read_text()
        routes = re.findall(r"@router\.(get|post|put|patch|delete)\(", content)
        total_routes += len(routes)
        response_model_count += len(re.findall(r"response_model\s*=", content))
    report.checks.append(Check(
        name="routes_have_response_model",
        level=3,
        passed=response_model_count >= total_routes * 0.5 if total_routes else True,
        message=f"{response_model_count}/{total_routes} routes have response_model",
        fix_hint="Add response_model=SchemaRead to all route decorators",
        severity="warning",
    ))

    # 3.5 Error handling (exceptions.py exists)
    exceptions_file = SRC / "core" / "exceptions.py"
    report.checks.append(Check(
        name="exception_handler_exists",
        level=3,
        passed=exceptions_file.exists(),
        message=f"exceptions.py {'found' if exceptions_file.exists() else 'MISSING'}",
        fix_hint="Create src/core/exceptions.py with domain exceptions",
    ))

    # 3.6 Auth dependency (get_current_user)
    has_auth_dep = False
    for f in api_files:
        content = f.read_text()
        if "get_current_user" in content or "Depends(" in content:
            has_auth_dep = True
            break
    report.checks.append(Check(
        name="auth_dependency",
        level=3,
        passed=has_auth_dep,
        message=f"Auth dependency {'found' if has_auth_dep else 'MISSING'} in routes",
        fix_hint="Use Depends(get_current_user) in protected routes",
    ))


# ═══════════════════════════════════════════════════════════════
# LEVEL 4: Frontend State
# ═══════════════════════════════════════════════════════════════
def check_f4(report: LevelReport):
    """F4 — Frontend State checks."""
    frontend_root = PROJECT_ROOT.parent  # EGGlogU root

    # 4.1 Store exists
    store_candidates = list(frontend_root.glob("**/store.js")) + list(frontend_root.glob("**/store.ts"))
    report.checks.append(Check(
        name="store_exists",
        level=4,
        passed=len(store_candidates) >= 1,
        message=f"{len(store_candidates)} store file(s) found",
        fix_hint="Create src/core/store.js with centralized state",
    ))

    # 4.2 API client exists
    api_candidates = list(frontend_root.glob("**/api.js")) + list(frontend_root.glob("**/api.ts"))
    report.checks.append(Check(
        name="api_client_exists",
        level=4,
        passed=len(api_candidates) >= 1,
        message=f"{len(api_candidates)} API client file(s) found",
        fix_hint="Create src/core/api.js with fetch wrapper + auth",
    ))

    # 4.3 Event bus exists
    bus_candidates = list(frontend_root.glob("**/bus.js")) + list(frontend_root.glob("**/bus.ts"))
    report.checks.append(Check(
        name="event_bus_exists",
        level=4,
        passed=len(bus_candidates) >= 1,
        message=f"{len(bus_candidates)} event bus file(s) found",
        fix_hint="Create src/core/bus.js for component communication",
    ))

    # 4.4 i18n exists
    i18n_candidates = (list(frontend_root.glob("**/i18n.js")) +
                       list(frontend_root.glob("**/translations.js")) +
                       list(frontend_root.glob("**/i18n.ts")))
    report.checks.append(Check(
        name="i18n_exists",
        level=4,
        passed=len(i18n_candidates) >= 1,
        message=f"{len(i18n_candidates)} i18n file(s) found",
        fix_hint="Create i18n system for multi-language support",
        severity="warning",
    ))


# ═══════════════════════════════════════════════════════════════
# LEVEL 5: UI Components
# ═══════════════════════════════════════════════════════════════
def check_f5(report: LevelReport):
    """F5 — UI Components checks."""
    frontend_root = PROJECT_ROOT.parent

    # 5.1 Component files exist
    components = (list(frontend_root.glob("src/components/*.js")) +
                  list(frontend_root.glob("src/components/*.ts")))
    report.checks.append(Check(
        name="component_files_count",
        level=5,
        passed=len(components) >= 5,
        message=f"{len(components)} component files",
        fix_hint="Create Web Components in src/components/",
    ))

    # 5.2 Components use Shadow DOM or custom elements
    shadow_count = 0
    for f in components:
        try:
            content = f.read_text()
            if "attachShadow" in content or "customElements.define" in content:
                shadow_count += 1
        except Exception:
            pass
    report.checks.append(Check(
        name="components_use_shadow_dom",
        level=5,
        passed=shadow_count >= len(components) * 0.5 if components else False,
        message=f"{shadow_count}/{len(components)} use Shadow DOM / custom elements",
        severity="warning",
    ))

    # 5.3 No component exceeds 500 lines
    oversized = []
    for f in components:
        try:
            lines = len(f.read_text().splitlines())
            if lines > 500:
                oversized.append(f"{f.name} ({lines} lines)")
        except Exception:
            pass
    report.checks.append(Check(
        name="component_size_limit",
        level=5,
        passed=len(oversized) == 0,
        message=f"{len(oversized)} oversized components" + (f": {', '.join(oversized[:3])}" if oversized else ""),
        fix_hint="Decompose components larger than 500 lines",
        severity="warning",
    ))

    # 5.4 Build pipeline exists (Vite)
    vite_config = list(frontend_root.glob("vite.config.*"))
    report.checks.append(Check(
        name="build_pipeline_exists",
        level=5,
        passed=len(vite_config) >= 1,
        message=f"vite.config {'found' if vite_config else 'MISSING'}",
        fix_hint="Create vite.config.js for build pipeline",
    ))


# ═══════════════════════════════════════════════════════════════
# LEVEL 6: Tests & CI
# ═══════════════════════════════════════════════════════════════
def check_f6(report: LevelReport):
    """F6 — Tests & CI checks."""

    # 6.1 Test directory exists
    report.checks.append(Check(
        name="tests_dir_exists",
        level=6,
        passed=TESTS_DIR.exists(),
        message=f"tests/ {'found' if TESTS_DIR.exists() else 'MISSING'}",
        fix_hint="Create tests/ directory",
    ))

    if TESTS_DIR.exists():
        test_files = list(TESTS_DIR.glob("**/test_*.py"))
        report.checks.append(Check(
            name="test_files_count",
            level=6,
            passed=len(test_files) >= 5,
            message=f"{len(test_files)} test files",
            fix_hint="Create test files for each domain",
        ))
    else:
        report.checks.append(Check(
            name="test_files_count", level=6, passed=False,
            message="No tests directory",
        ))

    # 6.2 CI pipeline exists
    ci_candidates = (
        list(PROJECT_ROOT.parent.glob(".github/workflows/*.yml")) +
        list(PROJECT_ROOT.parent.glob(".github/workflows/*.yaml"))
    )
    report.checks.append(Check(
        name="ci_pipeline_exists",
        level=6,
        passed=len(ci_candidates) >= 1,
        message=f"{len(ci_candidates)} CI workflow files",
        fix_hint="Create .github/workflows/ci.yml",
    ))

    # 6.3 conftest.py exists
    conftest = TESTS_DIR / "conftest.py" if TESTS_DIR.exists() else None
    report.checks.append(Check(
        name="conftest_exists",
        level=6,
        passed=conftest is not None and conftest.exists(),
        message=f"conftest.py {'found' if conftest and conftest.exists() else 'MISSING'}",
        fix_hint="Create tests/conftest.py with fixtures",
    ))

    # 6.4 Docker Compose exists
    docker_compose = PROJECT_ROOT / "docker-compose.yml"
    if not docker_compose.exists():
        docker_compose = PROJECT_ROOT.parent / "docker-compose.yml"
    report.checks.append(Check(
        name="docker_compose_exists",
        level=6,
        passed=docker_compose.exists(),
        message=f"docker-compose.yml {'found' if docker_compose.exists() else 'MISSING'}",
        fix_hint="Create docker-compose.yml for local dev environment",
    ))

    # 6.5 Safe deploy script exists
    safe_deploy = PROJECT_ROOT / "scripts" / "safe_deploy.sh"
    report.checks.append(Check(
        name="safe_deploy_exists",
        level=6,
        passed=safe_deploy.exists(),
        message=f"safe_deploy.sh {'found' if safe_deploy.exists() else 'MISSING'}",
        fix_hint="Create scripts/safe_deploy.sh for zero-downtime deploys",
    ))


# ═══════════════════════════════════════════════════════════════
# Runner
# ═══════════════════════════════════════════════════════════════
LEVEL_CHECKERS = {
    0: check_f0,
    1: check_f1,
    2: check_f2,
    3: check_f3,
    4: check_f4,
    5: check_f5,
    6: check_f6,
}


def run_diagnostics(levels: list[int] | None = None) -> list[LevelReport]:
    """Run diagnostic checks for specified levels (or all)."""
    if levels is None:
        levels = sorted(LEVEL_CHECKERS.keys())

    reports = []
    for lvl in levels:
        report = LevelReport(level=lvl, name=LEVEL_NAMES[lvl])
        checker = LEVEL_CHECKERS.get(lvl)
        if checker:
            checker(report)
        reports.append(report)
    return reports


def print_report(reports: list[LevelReport], as_json: bool = False):
    """Print diagnostic report."""
    if as_json:
        data = []
        for r in reports:
            data.append({
                "level": r.level,
                "name": r.name,
                "score": r.score,
                "gate_open": r.gate_open,
                "checks": [
                    {"name": c.name, "passed": c.passed, "message": c.message,
                     "severity": c.severity, "fix_hint": c.fix_hint}
                    for c in r.checks
                ],
            })
        print(json.dumps(data, indent=2))
        return

    print()
    print("=" * 70)
    print("  ERP BUILD DIAGNOSTIC — EGGlogU / FarmLogU")
    print("=" * 70)

    all_pass = True
    for r in reports:
        gate = "OPEN" if r.gate_open else "BLOCKED"
        gate_icon = "[PASS]" if r.gate_open else "[FAIL]"
        print(f"\n  F{r.level}: {r.name}")
        print(f"  Score: {r.score}  |  Gate: {gate_icon} {gate}")
        print(f"  {'─' * 60}")

        for c in r.checks:
            icon = "[OK]" if c.passed else ("[!!]" if c.severity == "error" else "[~~]")
            print(f"    {icon} {c.name}: {c.message}")
            if not c.passed and c.fix_hint:
                print(f"        -> FIX: {c.fix_hint}")

        if not r.gate_open:
            all_pass = False
            print(f"\n  ** GATE BLOCKED — Fix errors above before proceeding to F{r.level + 1} **")

    print(f"\n{'=' * 70}")
    if all_pass:
        max_level = max(r.level for r in reports)
        if max_level < 6:
            print(f"  All checked levels PASS. Next: F{max_level + 1} ({LEVEL_NAMES.get(max_level + 1, 'Done')})")
        else:
            print("  ALL LEVELS PASS. System is production-ready.")
    else:
        blocked = [r.level for r in reports if not r.gate_open]
        print(f"  BLOCKED at: {', '.join(f'F{l}' for l in blocked)}")
    print("=" * 70)
    print()


def main():
    parser = argparse.ArgumentParser(description="ERP Build Diagnostic")
    parser.add_argument("--level", "-l", type=int, help="Check specific level (0-6)")
    parser.add_argument("--all", "-a", action="store_true", help="Check all levels")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--up-to", "-u", type=int, help="Check from F0 up to level N")
    args = parser.parse_args()

    if args.level is not None:
        levels = [args.level]
    elif args.up_to is not None:
        levels = list(range(args.up_to + 1))
    elif args.all:
        levels = None
    else:
        levels = None  # Default: check all

    reports = run_diagnostics(levels)
    print_report(reports, as_json=args.json)

    # Exit code: 0 if all pass, 1 if any fail
    has_failures = any(not r.gate_open for r in reports)
    sys.exit(1 if has_failures else 0)


if __name__ == "__main__":
    main()
