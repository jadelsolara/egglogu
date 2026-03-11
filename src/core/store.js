// EGGlogU Reactive Store — wraps loadData/saveData with events
// Single source of truth for application state

import { Bus } from './bus.js';
import { genId, todayStr } from './utils.js';

const STORAGE_KEY = 'egglogu_data';
const STORAGE_QUOTA = 5 * 1024 * 1024;
const EVICTION_ORDER = ['egglogu_sync_snapshot', 'egglogu_bugs', 'egglogu_suggestions', 'egglogu_offline_tickets'];

const DEFAULT_DATA = {
  farm: { name: 'Mi Granja', location: '', capacity: 500, currency: '$', lat: null, lng: null, owmApiKey: '', mqttBroker: '', mqttUser: '', mqttPass: '', mqttTopicPrefix: 'egglogu/', houses: [], routes: [], suppliers: [] },
  flocks: [], dailyProduction: [], vaccines: [], medications: [], outbreaks: [],
  feed: { purchases: [], consumption: [] }, clients: [], clientClaims: [], orders: [],
  finances: { income: [], expenses: [], receivables: [] },
  inventory: [], storageLocations: [], reservations: [],
  environment: [], checklist: [], logbook: [], personnel: [],
  kpiSnapshots: [], weatherCache: [], stressEvents: [], iotReadings: [], predictions: [],
  biosecurity: { visitors: [], zones: [], pestSightings: [], protocols: [] },
  traceability: { batches: [] },
  productionPlans: [],
  auditLog: [],
  users: [], pendingActivations: [],
  settings: {
    minFeedStock: 50, maxMortality: 5, alertDaysBefore: 3,
    campoMode: false, vetMode: false, fontScale: 'normal', darkMode: false,
    plan: { tier: 'enterprise', status: 'active', is_trial: true, modules: [] },
    ownerEmail: '',
    taxRate: 0, depreciationYears: 5, assetValue: 0,
    defaultChecklist: ['chk_collect_eggs', 'chk_feed_birds', 'chk_check_water', 'chk_check_health', 'chk_cleaning', 'chk_record_temp']
  }
};

let _data = null;
let _autoBackupTimer = null;
let _syncTimer = null;

/**
 * Safe localStorage.setItem with quota management and eviction.
 */
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      for (const evictKey of EVICTION_ORDER) {
        if (localStorage.getItem(evictKey)) {
          localStorage.removeItem(evictKey);
          try { localStorage.setItem(key, value); return true; } catch (_) { /* continue */ }
        }
      }
      Bus.emit('storage:full');
      return false;
    }
    throw e;
  }
}

/**
 * Apply data migrations for backward compatibility.
 */
function migrateData(D) {
  for (const k of Object.keys(DEFAULT_DATA)) {
    if (!(k in D)) D[k] = JSON.parse(JSON.stringify(DEFAULT_DATA[k]));
  }
  if (!D.feed.purchases) D.feed.purchases = [];
  if (!D.feed.consumption) D.feed.consumption = [];
  if (!D.finances.receivables) D.finances.receivables = [];
  ['medications', 'outbreaks', 'clients', 'checklist', 'logbook', 'personnel', 'kpiSnapshots', 'weatherCache', 'stressEvents', 'iotReadings', 'predictions'].forEach(k => { if (!D[k]) D[k] = []; });
  // v2 farm fields
  if (D.farm.lat === undefined) D.farm.lat = null;
  if (D.farm.lng === undefined) D.farm.lng = null;
  if (!D.farm.owmApiKey) D.farm.owmApiKey = '';
  if (!D.farm.mqttBroker) D.farm.mqttBroker = '';
  if (!D.farm.mqttUser) D.farm.mqttUser = '';
  if (!D.farm.mqttPass) D.farm.mqttPass = '';
  if (!D.farm.mqttTopicPrefix) D.farm.mqttTopicPrefix = 'egglogu/';
  // v4 farm config
  if (!D.farm.houses) D.farm.houses = [];
  if (!D.farm.routes) D.farm.routes = [];
  if (!D.farm.suppliers) D.farm.suppliers = [];
  // v3 modules
  if (!D.biosecurity) D.biosecurity = { visitors: [], zones: [], pestSightings: [], protocols: [] };
  if (!D.biosecurity.visitors) D.biosecurity.visitors = [];
  if (!D.biosecurity.zones) D.biosecurity.zones = [];
  if (!D.biosecurity.pestSightings) D.biosecurity.pestSightings = [];
  if (!D.biosecurity.protocols) D.biosecurity.protocols = [];
  if (!D.traceability) D.traceability = { batches: [] };
  if (!D.traceability.batches) D.traceability.batches = [];
  if (!D.productionPlans) D.productionPlans = [];
  if (!D.inventory) D.inventory = [];
  if (!D.storageLocations) D.storageLocations = [];
  if (!D.reservations) D.reservations = [];
  if (!D.auditLog) D.auditLog = [];
  if (!D.clientClaims) D.clientClaims = [];
  if (!D.orders) D.orders = [];
  if (!D.users) D.users = [];
  // Settings defaults
  if (D.settings.taxRate === undefined) D.settings.taxRate = 0;
  if (D.settings.depreciationYears === undefined) D.settings.depreciationYears = 5;
  if (D.settings.assetValue === undefined) D.settings.assetValue = 0;
  if (D.settings.campoMode === undefined) D.settings.campoMode = false;
  if (D.settings.vetMode === undefined) D.settings.vetMode = false;
  if (!D.settings.fontScale) D.settings.fontScale = 'normal';
  if (D.settings.darkMode === undefined) D.settings.darkMode = false;
  return D;
}

export const Store = {
  /**
   * Load data from localStorage (cached after first call).
   */
  load() {
    if (_data) return _data;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _data = migrateData(JSON.parse(raw));
      } else {
        _data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      }
    } catch (e) {
      _data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    return _data;
  },

  /**
   * Get current data (loads if needed).
   */
  get() {
    return _data || this.load();
  },

  /**
   * Save data to localStorage and emit change event.
   * @param {Object} [d] - Data to save. If omitted, saves current cached data.
   * @param {string} [source] - What triggered the save (for debugging).
   */
  save(d, source = '') {
    _data = d || _data;
    safeSetItem(STORAGE_KEY, JSON.stringify(_data));
    Bus.emit('data:changed', { source });
    Bus.emit('data:sync-needed');
  },

  /**
   * Update a specific path in the data and save.
   * @param {string} path - Dot-separated path (e.g. 'farm.name', 'flocks')
   * @param {*} value - New value
   */
  set(path, value) {
    const D = this.get();
    const parts = path.split('.');
    let obj = D;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
      if (!obj) return;
    }
    obj[parts[parts.length - 1]] = value;
    this.save(D, `set:${path}`);
  },

  /**
   * Get a nested value by dot path.
   */
  getPath(path) {
    const D = this.get();
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), D);
  },

  /**
   * Get currency symbol from farm settings.
   */
  currency() {
    return (this.get().farm.currency) || '$';
  },

  /**
   * Reset cached data (force re-read from localStorage on next load).
   */
  invalidate() {
    _data = null;
  },

  /**
   * Get the DEFAULT_DATA template.
   */
  getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  },

  /**
   * Safe localStorage setter (with quota management).
   */
  safeSet: safeSetItem
};
