/**
 * EGGlogU — Data Persistence Layer
 * IndexedDB + localStorage dual-write with offline-first architecture.
 * Extracted from egglogu.js lines 1436-1925.
 *
 * This module manages the DATA global state object and persistence.
 * During migration Phase A, it reads/writes the same localStorage keys
 * as the monolithic egglogu.js for full compatibility.
 */

import { bus, Events } from './event-bus.js';
import { genId } from './utils.js';

// ── Default Data Structure ──────────────────────────────
export const DEFAULT_DATA = {
  farm: { name: 'Mi Granja', location: '', capacity: 500, currency: '$', lat: null, lng: null },
  flocks: [],
  dailyProduction: [],
  vaccines: [],
  medications: [],
  outbreaks: [],
  stressEvents: [],
  feed: { purchases: [], consumption: [] },
  clients: [],
  clientClaims: [],
  finances: { income: [], expenses: [], receivables: [] },
  environment: [],
  operations: { checklist: [], logbook: [], personnel: [] },
  kpiSnapshots: [],
  predictions: [],
  breedCurves: [],
  biosecurity: { visitors: [], zones: [], pests: [], protocols: [] },
  traceability: [],
  plans: [],
  settings: {
    minFeedStock: 500,
    maxMortalityRate: 2,
    alertDaysBefore: 7,
    theme: 'blue',
    fontSize: 'normal',
    darkMode: false,
    checklistItems: [],
    mqtt: { broker: '', user: '', topic: 'egglogu/' },
    owmKey: '',
  },
};

const STORAGE_KEY = 'egglogu_data';

// ── Load / Save ─────────────────────────────────────────

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.DATA = structuredClone(DEFAULT_DATA);
      return window.DATA;
    }
    const parsed = JSON.parse(raw);
    // Deep merge with defaults (ensure new fields exist)
    window.DATA = deepMerge(structuredClone(DEFAULT_DATA), parsed);
    bus.emit(Events.DATA_LOADED, window.DATA);
    return window.DATA;
  } catch (e) {
    console.error('[Data] Failed to load:', e);
    window.DATA = structuredClone(DEFAULT_DATA);
    return window.DATA;
  }
}

export function saveData(data) {
  const target = data || window.DATA;
  if (!target) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(target));
    bus.emit(Events.DATA_SAVED, target);
    return true;
  } catch (e) {
    console.warn('[Data] Save failed:', e.message);
    return false;
  }
}

export function getData() {
  if (!window.DATA) loadData();
  return window.DATA;
}

// ── CRUD Helpers ────────────────────────────────────────

export function addRecord(collection, record) {
  const data = getData();
  if (!record.id) record.id = genId();
  if (!record.createdAt) record.createdAt = new Date().toISOString();

  // Handle nested collections (e.g., 'feed.purchases')
  const parts = collection.split('.');
  let target = data;
  for (const part of parts) {
    target = target[part];
  }

  if (Array.isArray(target)) {
    target.push(record);
    saveData();
    return record;
  }
  return null;
}

export function updateRecord(collection, id, updates) {
  const data = getData();
  const parts = collection.split('.');
  let target = data;
  for (const part of parts) {
    target = target[part];
  }

  if (Array.isArray(target)) {
    const idx = target.findIndex((r) => r.id === id);
    if (idx >= 0) {
      Object.assign(target[idx], updates, { updatedAt: new Date().toISOString() });
      saveData();
      return target[idx];
    }
  }
  return null;
}

export function deleteRecord(collection, id) {
  const data = getData();
  const parts = collection.split('.');
  let target = data;
  for (const part of parts) {
    target = target[part];
  }

  if (Array.isArray(target)) {
    const idx = target.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const removed = target.splice(idx, 1)[0];
      saveData();
      return removed;
    }
  }
  return null;
}

export function getRecords(collection, filter = null) {
  const data = getData();
  const parts = collection.split('.');
  let target = data;
  for (const part of parts) {
    target = target[part];
  }

  if (!Array.isArray(target)) return [];
  if (!filter) return target;
  return target.filter(filter);
}

// ── Data Export / Import ────────────────────────────────

export function exportData() {
  const data = getData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `egglogu-backup-${new Date().toISOString().substring(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(jsonStr) {
  try {
    const imported = JSON.parse(jsonStr);
    window.DATA = deepMerge(structuredClone(DEFAULT_DATA), imported);
    saveData();
    bus.emit(Events.DATA_IMPORTED, window.DATA);
    return true;
  } catch (e) {
    console.error('[Data] Import failed:', e);
    return false;
  }
}

export function resetData() {
  window.DATA = structuredClone(DEFAULT_DATA);
  saveData();
  bus.emit(Events.DATA_RESET);
}

// ── Utility ─────────────────────────────────────────────

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Backward compatibility
window.loadData = loadData;
window.saveData = saveData;
window.DEFAULT_DATA = DEFAULT_DATA;
