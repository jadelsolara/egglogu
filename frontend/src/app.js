/**
 * EGGlogU — Application Entry Point
 * Orchestrates all modular imports for the ES Modules build.
 * During migration, this coexists with the monolithic egglogu.js.
 *
 * Build: Vite bundles this into ../dist/egglogu.js
 * The monolith continues handling rendering; modules provide
 * clean data/business logic that gradually replaces inline code.
 */

// ── Core Layer ───────────────────────────────────────────
import { bus, Events } from '@core/event-bus.js';
import { $, genId, todayStr, fmtNum, fmtMoney, fmtDate, debounce, throttle, showToast } from '@core/utils.js';
import { sanitizeHTML, escapeAttr, validateInput, validateForm } from '@core/security.js';
import { t, getLang, setLang } from '@core/translations.js';
import { getData, saveData, loadData, addRecord, updateRecord, deleteRecord } from '@core/data.js';
import { syncToServer, scheduleSyncToServer } from '@core/sync.js';
import { apiService } from '@core/api-service.js';
import { wsClient } from '@core/websocket.js';

// ── Route Bridge (Strangler Fig) ─────────────────────────
import { registerRoute, getRouteOverride, getStatus as getRouteStatus } from '@core/route-bridge.js';
import { isEnabled, enable, disable, getAll as getAllFlags } from '@core/feature-flags.js';
import { createDataTable } from '@core/datatable-bridge.js';
import { kpi, emptyState, openModal as modalOpen, closeModal as modalClose, toast as toastMsg, paginate, paginationControls, validateForm as vForm, clearFieldErrors, showFieldError, showConfirm, catalogSelect, flockSelect } from '@core/render-utils.js';

// ── Feature Modules ──────────────────────────────────────
import * as Dashboard from '@modules/dashboard.js';
import * as Production from '@modules/production.js';
import * as Health from '@modules/health.js';
import * as Flocks from '@modules/flocks.js';
import * as Feed from '@modules/feed.js';
import * as Clients from '@modules/clients.js';
import * as Finance from '@modules/finance.js';
import * as Analytics from '@modules/analytics.js';
import * as Operations from '@modules/operations.js';
import * as Environment from '@modules/environment.js';
import * as Biosecurity from '@modules/biosecurity.js';
import * as Traceability from '@modules/traceability.js';
import * as Planning from '@modules/planning.js';
import * as Support from '@modules/support.js';
import * as Admin from '@modules/admin.js';
import * as Inventory from '@modules/inventory.js';

// ── Module Registry ──────────────────────────────────────
// Exposes all modules on window.EGGlogU for gradual migration
// The monolith can call window.EGGlogU.Production.addRecord() etc.

const EGGlogU = {
  // Core
  bus,
  Events,
  apiService,

  // Modules
  Dashboard,
  Production,
  Health,
  Flocks,
  Feed,
  Clients,
  Finance,
  Analytics,
  Operations,
  Environment,
  Biosecurity,
  Traceability,
  Planning,
  Support,
  Admin,
  Inventory,

  // Route Bridge
  routeBridge: { registerRoute, getRouteOverride, getRouteStatus },
  featureFlags: { isEnabled, enable, disable, getAllFlags },

  // Version
  version: '2.0.0',
  buildDate: new Date().toISOString(),
};

window.EGGlogU = EGGlogU;

// ── Event Bus Cross-Module Wiring ────────────────────────
// Connect module events for reactive updates

bus.on(Events.PRODUCTION_ADDED, () => {
  Dashboard.saveKPISnapshot();
});

bus.on(Events.DATA_CHANGED, () => {
  scheduleSyncToServer();
});

// ── WebSocket Integration ────────────────────────────────
// Auto-connect when user is authenticated

function initWebSocket() {
  const data = getData();
  const farmId = data.farm?.id;
  if (!farmId || !apiService.isLoggedIn()) return;

  // wsClient singleton from websocket.js handles connection,
  // heartbeat, reconnect, and event routing via the event bus.
  wsClient.connect(farmId);
}

// ── Initialization ───────────────────────────────────────

function init() {
  console.log(`[EGGlogU] Modular build v${EGGlogU.version} loaded`);
  console.log('[EGGlogU] Route Bridge:', getRouteStatus());

  // Load persisted data
  loadData();

  // Attempt WebSocket connection (non-blocking)
  try {
    initWebSocket();
  } catch (e) {
    console.warn('[EGGlogU] WebSocket init skipped:', e.message);
  }

  // Emit ready event
  bus.emit(Events.APP_READY, { version: EGGlogU.version });
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export default EGGlogU;
