// EGGlogU Reactive Store — wraps loadData/saveData with events
// Single source of truth for application state
// Per-user isolation + AES-256-GCM encryption at rest

import { Bus } from './bus.js';
import { genId, todayStr } from './utils.js';

const STORAGE_KEY_BASE = 'egglogu_data';
const STORAGE_QUOTA = 5 * 1024 * 1024;
const EVICTION_ORDER = ['egglogu_sync_snapshot', 'egglogu_bugs', 'egglogu_suggestions', 'egglogu_offline_tickets'];
const CRYPTO_KEY_NAME = 'egglogu_ek'; // encryption key stored in localStorage per-user

/* ── Per-user storage key ── */
function _currentEmail() {
  try {
    const u = JSON.parse(localStorage.getItem('egglogu_current_user') || '{}');
    if (u.email) return u.email.toLowerCase();
  } catch (e) { /* ignore */ }
  return null;
}

function _storageKey() {
  const email = _currentEmail();
  return email ? STORAGE_KEY_BASE + '_' + email : STORAGE_KEY_BASE;
}

/* ── Per-user scoped key helper (for other modules) ── */
function scopedKey(base) {
  const email = _currentEmail();
  return email ? base + '_' + email : base;
}

/* ── AES-256-GCM Encryption ── */
const _cryptoAvailable = typeof crypto !== 'undefined' && crypto.subtle;

async function _getOrCreateKey() {
  const email = _currentEmail();
  const keyName = email ? CRYPTO_KEY_NAME + '_' + email : CRYPTO_KEY_NAME;
  const stored = localStorage.getItem(keyName);
  if (stored) {
    try {
      const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } catch (e) { /* regenerate */ }
  }
  // Generate new key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(keyName, btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
}

async function _encrypt(plaintext) {
  if (!_cryptoAvailable) return plaintext;
  try {
    const key = await _getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    // Pack: iv (12 bytes) + ciphertext → base64
    const packed = new Uint8Array(iv.length + ciphertext.byteLength);
    packed.set(iv);
    packed.set(new Uint8Array(ciphertext), iv.length);
    return 'ENC1:' + btoa(String.fromCharCode(...packed));
  } catch (e) {
    console.warn('[Store] Encryption failed, storing plaintext:', e.message);
    return plaintext;
  }
}

async function _decrypt(data) {
  if (!_cryptoAvailable || !data.startsWith('ENC1:')) return data;
  try {
    const key = await _getOrCreateKey();
    const packed = Uint8Array.from(atob(data.slice(5)), c => c.charCodeAt(0));
    const iv = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.warn('[Store] Decryption failed:', e.message);
    return null;
  }
}

const DEFAULT_DATA = {
  farm: { name: 'Mi Granja', location: '', capacity: 500, currency: '$', lat: null, lng: null, owmApiKey: '', mqttBroker: '', mqttUser: '', mqttPass: '', mqttTopicPrefix: 'egglogu/', houses: [], routes: [], suppliers: [] },
  flocks: [], dailyProduction: [], vaccines: [], medications: [], outbreaks: [],
  feed: { purchases: [], consumption: [] }, clients: [], clientClaims: [], orders: [],
  finances: { income: [], expenses: [], receivables: [], payables: [], budgets: [] },
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
let _saving = false; // prevent concurrent saves

/**
 * Safe localStorage.setItem with quota management and eviction.
 */
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      for (const evictBase of EVICTION_ORDER) {
        const ek = scopedKey(evictBase);
        if (localStorage.getItem(ek)) {
          localStorage.removeItem(ek);
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
  if (!D.finances.payables) D.finances.payables = [];
  if (!D.finances.budgets) D.finances.budgets = [];
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
   * Handles decryption transparently.
   */
  load() {
    if (_data) return _data;
    try {
      const key = _storageKey();
      let raw = localStorage.getItem(key);
      // Migrate: if per-user key is empty but legacy key has data, copy it over
      if (!raw && key !== STORAGE_KEY_BASE) {
        const legacy = localStorage.getItem(STORAGE_KEY_BASE);
        if (legacy) {
          raw = legacy;
          safeSetItem(key, legacy);
        }
      }
      if (raw) {
        // If encrypted, we need async — but load() is sync for compat.
        // Encrypted data starts with ENC1: — handle inline
        if (raw.startsWith('ENC1:')) {
          // Return defaults now, loadAsync will replace
          _data = JSON.parse(JSON.stringify(DEFAULT_DATA));
          this._loadAsync(key, raw);
        } else {
          _data = migrateData(JSON.parse(raw));
          // Schedule async encryption of plaintext legacy data
          this._encryptAndSave();
        }
      } else {
        _data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      }
    } catch (e) {
      _data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    return _data;
  },

  /**
   * Async load — decrypts and replaces data, then emits refresh.
   */
  async _loadAsync(key, raw) {
    const decrypted = await _decrypt(raw);
    if (decrypted) {
      _data = migrateData(JSON.parse(decrypted));
      Bus.emit('data:changed', { source: 'decrypt' });
    }
  },

  /**
   * Encrypt current plaintext data and re-save.
   */
  async _encryptAndSave() {
    if (!_data || _saving) return;
    _saving = true;
    try {
      const encrypted = await _encrypt(JSON.stringify(_data));
      safeSetItem(_storageKey(), encrypted);
    } catch (e) { /* keep plaintext */ }
    _saving = false;
  },

  /**
   * Async load — use this when you can await (e.g. app boot).
   */
  async loadAsync() {
    const key = _storageKey();
    let raw = localStorage.getItem(key);
    // Migration from legacy key
    if (!raw && key !== STORAGE_KEY_BASE) {
      const legacy = localStorage.getItem(STORAGE_KEY_BASE);
      if (legacy) {
        raw = legacy;
      }
    }
    if (raw) {
      if (raw.startsWith('ENC1:')) {
        const decrypted = await _decrypt(raw);
        if (decrypted) {
          _data = migrateData(JSON.parse(decrypted));
        } else {
          _data = JSON.parse(JSON.stringify(DEFAULT_DATA));
        }
      } else {
        _data = migrateData(JSON.parse(raw));
      }
      // Always save encrypted
      const encrypted = await _encrypt(JSON.stringify(_data));
      safeSetItem(key, encrypted);
    } else {
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
   * Save data to localStorage (encrypted) and emit change event.
   * @param {Object} [d] - Data to save. If omitted, saves current cached data.
   * @param {string} [source] - What triggered the save (for debugging).
   */
  save(d, source = '') {
    _data = d || _data;
    // Sync save plaintext first for immediate persistence, then encrypt async
    const json = JSON.stringify(_data);
    // Attempt async encrypted save
    if (_cryptoAvailable && !_saving) {
      _saving = true;
      _encrypt(json).then(encrypted => {
        safeSetItem(_storageKey(), encrypted);
        _saving = false;
      }).catch(() => {
        safeSetItem(_storageKey(), json);
        _saving = false;
      });
    } else {
      safeSetItem(_storageKey(), json);
    }
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
  safeSet: safeSetItem,

  /**
   * Get a per-user scoped localStorage key.
   * Use this for any key that should be isolated per account.
   */
  scopedKey
};
