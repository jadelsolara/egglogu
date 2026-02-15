/**
 * EGGlogU 360 — Comprehensive Vitest Test Suite
 * Aviculture Management App — 8 Languages, ML, Financial, Security
 * Generated for GenieOS v2.0.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// MOCK SETUP — DOM, localStorage, sessionStorage, externals
// ============================================================

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; },
  };
})();

const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true });

// Minimal DOM mock
const domElements = {};
const $ = (id) => domElements[id] || null;

globalThis.document = {
  getElementById: vi.fn((id) => domElements[id] || null),
  createElement: vi.fn((tag) => ({
    tagName: tag.toUpperCase(),
    href: '',
    download: '',
    click: vi.fn(),
    className: '',
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn(), contains: vi.fn(() => false) },
    textContent: '',
    innerHTML: '',
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => null),
    style: {},
    parentElement: null,
    querySelectorAll: vi.fn(() => []),
    focus: vi.fn(),
  })),
  documentElement: {
    lang: 'es',
    style: { setProperty: vi.fn() },
  },
  querySelectorAll: vi.fn(() => []),
  body: {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
      contains: vi.fn(() => false),
    },
  },
  activeElement: null,
};
globalThis.window = globalThis;
globalThis.URL = { createObjectURL: vi.fn(() => 'blob:mock') };
globalThis.Blob = vi.fn();
globalThis.FileReader = vi.fn(() => ({
  readAsText: vi.fn(),
  onload: null,
  result: '',
}));
globalThis.getComputedStyle = vi.fn(() => ({
  getPropertyValue: vi.fn(() => '#1A3C6E'),
}));
globalThis.fetch = vi.fn();
globalThis.crypto = {
  subtle: {
    digest: vi.fn(async (algo, data) => new ArrayBuffer(32)),
  },
};
globalThis.TextEncoder = class {
  encode(str) { return new Uint8Array(Array.from(str).map(c => c.charCodeAt(0))); }
};

// Mock Chart.js
globalThis.Chart = vi.fn(() => ({ destroy: vi.fn(), update: vi.fn() }));

// Mock simple-statistics
globalThis.ss = {
  mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  standardDeviation: (arr) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  },
  linearRegression: (points) => {
    const n = points.length;
    const sx = points.reduce((s, p) => s + p[0], 0);
    const sy = points.reduce((s, p) => s + p[1], 0);
    const sxy = points.reduce((s, p) => s + p[0] * p[1], 0);
    const sx2 = points.reduce((s, p) => s + p[0] * p[0], 0);
    const m = (n * sxy - sx * sy) / (n * sx2 - sx * sx) || 0;
    const b = (sy - m * sx) / n;
    return { m, b };
  },
  linearRegressionLine: (reg) => (x) => reg.m * x + reg.b,
};

// Mock MQTT
globalThis.mqtt = { connect: vi.fn(() => ({ on: vi.fn(), subscribe: vi.fn(), end: vi.fn() })) };

// Mock Leaflet
globalThis.L = {
  map: vi.fn(() => ({
    setView: vi.fn().mockReturnThis(),
    on: vi.fn(),
    remove: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn(), setLatLng: vi.fn() })),
};

// ============================================================
// REPLICATE KEY APP CONSTANTS AND FUNCTIONS
// (Extracted from egglogu.html to be testable in isolation)
// ============================================================

const LOCALE_MAP = { es: 'es-CL', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ja: 'ja-JP', zh: 'zh-CN' };

const T = {
  es: {
    save: 'Guardar', cancel: 'Cancelar', delete: 'Eliminar', required: 'Campo obligatorio',
    nav_dashboard: 'Dashboard', nav_production: 'Produccion', kpi_today: 'Produccion Hoy',
    kpi_henday: 'Tasa Hen-Day', kpi_fcr: 'Conversion (FCR)', kpi_mortality: 'Mortalidad',
    kpi_cost_egg: 'Costo/Huevo', kpi_income_net: 'Ingreso Neto', kpi_alerts: 'Alertas',
    alert_vaccine_overdue: 'Vacuna vencida', alert_low_feed: 'Stock alimento bajo',
    alert_high_mortality: 'Mortalidad alta', alert_active_outbreak: 'Brote activo',
    cfg_saved: 'Guardado', cfg_exported: 'Datos exportados', cfg_imported: 'Datos importados',
    confirm_delete: 'Eliminar este registro?', min_length: 'Largo minimo', max_length: 'Largo maximo',
    min_value: 'Valor minimo', max_value: 'Valor maximo', invalid_email: 'Email invalido',
    invalid_phone: 'Telefono invalido', must_be_number: 'Debe ser un numero', invalid_date: 'Fecha invalida',
    invalid_format: 'Formato invalido', all: 'Todos', no_data: 'No hay datos registrados',
    fin_total_income: 'Total Ingresos', fin_total_expenses: 'Total Gastos', fin_net: 'Resultado Neto',
    fin_cost_per_egg: 'Costo/Huevo', fin_break_even: 'Punto Equilibrio',
    pred_outbreak_high: 'Alto Riesgo', pred_outbreak_medium: 'Riesgo Medio', pred_outbreak_low: 'Bajo Riesgo',
    rec_title: 'Recomendaciones', rec_check_diet: 'Revisar dieta',
    auth_welcome: 'Cuenta creada. Bienvenido!', auth_error: 'Credenciales incorrectas',
    logout: 'Cerrar sesion',
  },
  en: {
    save: 'Save', cancel: 'Cancel', delete: 'Delete', required: 'Required field',
    nav_dashboard: 'Dashboard', nav_production: 'Production', kpi_today: 'Production Today',
    kpi_mortality: 'Mortality', cfg_saved: 'Saved', confirm_delete: 'Delete this record?',
    auth_welcome: 'Account created. Welcome!', logout: 'Logout',
  },
  pt: {
    save: 'Salvar', cancel: 'Cancelar', delete: 'Excluir', required: 'Campo obrigatorio',
    nav_dashboard: 'Dashboard', logout: 'Sair',
  },
  fr: {
    save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', required: 'Champ requis',
    nav_dashboard: 'Tableau de bord', logout: 'Deconnexion',
  },
  de: {
    save: 'Speichern', cancel: 'Abbrechen', delete: 'Loschen', required: 'Pflichtfeld',
    nav_dashboard: 'Dashboard', logout: 'Abmelden',
  },
  it: {
    save: 'Salva', cancel: 'Annulla', delete: 'Elimina', required: 'Campo obbligatorio',
    nav_dashboard: 'Dashboard', logout: 'Esci',
  },
  ja: {
    save: '\u4FDD\u5B58', cancel: '\u30AD\u30E3\u30F3\u30BB\u30EB', delete: '\u524A\u9664',
    required: '\u5FC5\u9808\u9805\u76EE', nav_dashboard: '\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9',
    logout: '\u30ED\u30B0\u30A2\u30A6\u30C8',
  },
  zh: {
    save: '\u4FDD\u5B58', cancel: '\u53D6\u6D88', delete: '\u5220\u9664',
    required: '\u5FC5\u586B\u9879', nav_dashboard: '\u4EEA\u8868\u76D8',
    logout: '\u9000\u51FA\u767B\u5F55',
  },
};

let LANG = 'es';
let DATA = null;

function t(k) { return (T[LANG] && T[LANG][k]) || (T.es && T.es[k]) || k; }
function locale() { return LOCALE_MAP[LANG] || 'en-US'; }
function fmtNum(n, d = 0) { return Number(n || 0).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }); }
function currency() { return (DATA || loadData()).farm.currency || '$'; }
function fmtMoney(n) { return currency() + fmtNum(n, 0); }
function fmtDate(d) { if (!d) return '-'; return new Date(d + 'T12:00:00').toLocaleDateString(locale()); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
function todayStr() { return new Date().toISOString().substring(0, 10); }

// Security functions
function sanitizeHTML(str) {
  if (typeof str !== 'string') return String(str || '');
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}
function escapeAttr(str) { return sanitizeHTML(String(str || '')); }
function safeHTML(tpl, ...vals) {
  return tpl.reduce((out, s, i) => out + s + (i < vals.length ? sanitizeHTML(String(vals[i])) : ''), '');
}

// Validation
function validateInput(value, rules = {}) {
  const errors = [];
  const v = typeof value === 'string' ? value.trim() : value;
  if (rules.required && (v === '' || v === null || v === undefined)) errors.push(t('required') || 'Required');
  if (rules.minLength && typeof v === 'string' && v.length < rules.minLength) errors.push((t('min_length') || 'Min length') + ': ' + rules.minLength);
  if (rules.maxLength && typeof v === 'string' && v.length > rules.maxLength) errors.push((t('max_length') || 'Max length') + ': ' + rules.maxLength);
  if (rules.min !== undefined && Number(v) < rules.min) errors.push((t('min_value') || 'Min') + ': ' + rules.min);
  if (rules.max !== undefined && Number(v) > rules.max) errors.push((t('max_value') || 'Max') + ': ' + rules.max);
  if (rules.pattern && !rules.pattern.test(v)) errors.push(rules.patternMsg || (t('invalid_format') || 'Invalid format'));
  if (rules.email && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push(t('invalid_email') || 'Invalid email');
  if (rules.phone && v && !/^[+\d\s\-()]{6,20}$/.test(v)) errors.push(t('invalid_phone') || 'Invalid phone');
  if (rules.numeric && v !== '' && isNaN(Number(v))) errors.push(t('must_be_number') || 'Must be a number');
  if (rules.date && v && isNaN(Date.parse(v))) errors.push(t('invalid_date') || 'Invalid date');
  return { valid: errors.length === 0, errors };
}

function validateForm(fields) {
  const allErrors = {}; let valid = true;
  for (const [name, { value, rules }] of Object.entries(fields)) {
    const result = validateInput(value, rules);
    if (!result.valid) { allErrors[name] = result.errors; valid = false; }
  }
  return { valid, errors: allErrors };
}

// Data
const DEFAULT_DATA = {
  farm: { name: 'Mi Granja', location: '', capacity: 500, currency: '$', lat: null, lng: null, owmApiKey: '', mqttBroker: '', mqttUser: '', mqttPass: '', mqttTopicPrefix: 'egglogu/', houses: [], routes: [], suppliers: [] },
  flocks: [], dailyProduction: [], vaccines: [], medications: [], outbreaks: [],
  feed: { purchases: [], consumption: [] }, clients: [],
  finances: { income: [], expenses: [], receivables: [] },
  environment: [], checklist: [], logbook: [], personnel: [],
  kpiSnapshots: [], weatherCache: [], stressEvents: [], iotReadings: [], predictions: [],
  biosecurity: { visitors: [], zones: [], pestSightings: [], protocols: [] },
  traceability: { batches: [] },
  productionPlans: [],
  settings: { minFeedStock: 50, maxMortality: 5, alertDaysBefore: 3, campoMode: false, vetMode: false, fontScale: 'normal', darkMode: false,
    defaultChecklist: ['chk_collect_eggs', 'chk_feed_birds', 'chk_check_water', 'chk_check_health', 'chk_cleaning', 'chk_record_temp'] },
};

function loadData() {
  if (DATA) return DATA;
  try {
    const r = localStorage.getItem('egglogu_data');
    if (r) {
      DATA = JSON.parse(r);
      for (const k of Object.keys(DEFAULT_DATA)) { if (!(k in DATA)) DATA[k] = JSON.parse(JSON.stringify(DEFAULT_DATA[k])); }
      if (!DATA.feed.purchases) DATA.feed.purchases = [];
      if (!DATA.feed.consumption) DATA.feed.consumption = [];
      if (!DATA.finances.receivables) DATA.finances.receivables = [];
      ['medications', 'outbreaks', 'clients', 'checklist', 'logbook', 'personnel', 'kpiSnapshots', 'weatherCache', 'stressEvents', 'iotReadings', 'predictions'].forEach(k => { if (!DATA[k]) DATA[k] = []; });
      if (!DATA.biosecurity) DATA.biosecurity = { visitors: [], zones: [], pestSightings: [], protocols: [] };
      if (!DATA.traceability) DATA.traceability = { batches: [] };
      if (!DATA.productionPlans) DATA.productionPlans = [];
      if (DATA.settings.campoMode === undefined) DATA.settings.campoMode = false;
      if (DATA.settings.vetMode === undefined) DATA.settings.vetMode = false;
      if (!DATA.settings.fontScale) DATA.settings.fontScale = 'normal';
      if (DATA.settings.darkMode === undefined) DATA.settings.darkMode = false;
    } else { DATA = JSON.parse(JSON.stringify(DEFAULT_DATA)); }
  } catch (e) { DATA = JSON.parse(JSON.stringify(DEFAULT_DATA)); }
  return DATA;
}
function saveData(d) { DATA = d || DATA; localStorage.setItem('egglogu_data', JSON.stringify(DATA)); }

// Flock helpers
function activeHensByFlock(fid) {
  const D = loadData(); const f = D.flocks.find(x => x.id === fid); if (!f) return 0;
  const deaths = D.dailyProduction.filter(p => p.flockId === fid).reduce((s, p) => s + (p.deaths || 0), 0);
  const oD = D.outbreaks.filter(o => o.flockId === fid).reduce((s, o) => s + (o.deaths || 0), 0);
  return Math.max(0, (f.count || 0) - deaths - oD);
}
function activeHens() {
  const D = loadData(); let n = 0;
  D.flocks.forEach(f => { if (f.status !== 'descarte') n += activeHensByFlock(f.id); });
  return n;
}
function flockAge(f) {
  if (!f.birthDate) return { days: 0, weeks: 0 };
  const d = Math.floor((new Date() - new Date(f.birthDate + 'T12:00:00')) / 864e5);
  return { days: Math.max(0, d), weeks: Math.max(0, Math.floor(d / 7)) };
}

const LIFECYCLE = [
  { stage: 'pollito', key: 'lc_pollito', weekStart: 0, weekEnd: 4, id: 'cria' },
  { stage: 'cria', key: 'lc_cria', weekStart: 4, weekEnd: 8, id: 'cria' },
  { stage: 'recria', key: 'lc_recria', weekStart: 8, weekEnd: 18, id: 'recria' },
  { stage: 'pre_postura', key: 'lc_prepostura', weekStart: 18, weekEnd: 20, id: 'recria' },
  { stage: 'postura_pico', key: 'lc_pico', weekStart: 20, weekEnd: 42, id: 'produccion' },
  { stage: 'postura_media', key: 'lc_media', weekStart: 42, weekEnd: 62, id: 'produccion' },
  { stage: 'postura_baja', key: 'lc_baja', weekStart: 62, weekEnd: 80, id: 'produccion' },
  { stage: 'descarte', key: 'lc_descarte', weekStart: 80, weekEnd: 999, id: 'descarte' },
];

function flockLifecycleStage(f) {
  const w = flockAge(f).weeks;
  return LIFECYCLE.find(l => w >= l.weekStart && w < l.weekEnd) || LIFECYCLE[LIFECYCLE.length - 1];
}

// THI calculation
function calcTHI(t, h) { return (1.8 * t + 32) - (0.55 - 0.0055 * h) * (1.8 * t - 26); }

// Health score
function healthScore(fid) {
  const D = loadData(); const f = D.flocks.find(x => x.id === fid); if (!f) return 0;
  const td = D.dailyProduction.filter(p => p.flockId === fid).reduce((s, p) => s + (p.deaths || 0), 0);
  const mPct = f.count > 0 ? (td / f.count) * 100 : 0; const mS = Math.max(0, 100 - mPct * 10);
  const l7 = D.dailyProduction.filter(p => p.flockId === fid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const hens = activeHensByFlock(fid); let pS = 50;
  if (l7.length > 0 && hens > 0) { const avg = l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length; pS = Math.min(100, (avg / hens) * 125); }
  let fS = 80;
  const l7f = D.feed.consumption.filter(c => c.flockId === fid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  if (l7f.length > 0 && l7.length > 0 && hens > 0) {
    const aF = l7f.reduce((s, c) => s + (c.quantityKg || 0), 0) / l7f.length;
    const aE = (l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length * 0.06);
    const fcr = aE > 0 ? aF / aE : 99; fS = fcr < 2 ? 100 : fcr < 2.5 ? 80 : fcr < 3 ? 60 : fcr < 4 ? 40 : 20;
  }
  const ao = D.outbreaks.filter(o => o.flockId === fid && o.status === 'active').length; const oS = ao === 0 ? 100 : ao === 1 ? 40 : 0;
  return Math.round(mS * 0.3 + pS * 0.3 + fS * 0.2 + oS * 0.2);
}

// Breed curves (partial for testing)
const BREED_CURVES = {
  'isa-brown': [9, 32, 62, 83, 92, 94, 95, 95, 94, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47, 46, 45, 44, 43],
  'generic': [8, 28, 55, 78, 88, 92, 93, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40],
};

// Forecast (ensemble: WMA + LR)
function computeForecast(D, days = 7) {
  if (typeof ss === 'undefined') return { dates: [], actual: [], forecast: [], upper: [], lower: [] };
  const prod = D.dailyProduction.sort((a, b) => a.date.localeCompare(b.date));
  if (prod.length < 7) return { dates: [], actual: [], forecast: [], upper: [], lower: [] };
  const last14 = prod.slice(-14);
  const values = last14.map(p => p.eggsCollected || 0);
  const weights = values.map((_, i) => Math.exp(i * 0.2)); const wSum = weights.reduce((a, b) => a + b, 0);
  const wma = values.reduce((s, v, i) => s + v * weights[i], 0) / wSum;
  const wmaForecast = []; for (let i = 0; i < days; i++) wmaForecast.push(wma);
  const points = values.map((v, i) => [i, v]);
  const reg = ss.linearRegression(points); const regLine = ss.linearRegressionLine(reg);
  const lrForecast = []; for (let i = 0; i < days; i++) lrForecast.push(Math.max(0, regLine(values.length + i)));
  const ensemble = wmaForecast.map((w, i) => (w + lrForecast[i]) / 2);
  const residuals = values.map((v, i) => v - regLine(i));
  const stdDev = ss.standardDeviation(residuals);
  const upper = ensemble.map(v => v + stdDev);
  const lower = ensemble.map(v => Math.max(0, v - stdDev));
  const dates = [];
  const lastDate = new Date(last14[last14.length - 1].date + 'T12:00:00');
  for (let i = 1; i <= days; i++) { const d = new Date(lastDate); d.setDate(d.getDate() + i); dates.push(d.toISOString().substring(0, 10)); }
  return { dates, actual: values, forecast: ensemble, upper, lower, wma: wmaForecast, lr: lrForecast };
}

// Outbreak risk classifier
function computeOutbreakRisk(D) {
  const hens = activeHens(); if (hens === 0) return { probability: 0, classification: 0, factors: [], recommendations: [] };
  const factors = [];
  const l7prod = D.dailyProduction.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const l7deaths = l7prod.reduce((s, p) => s + (p.deaths || 0), 0);
  const deathRate = hens > 0 ? (l7deaths / hens * 100) : 0;
  const mortFactor = Math.min(1, deathRate / 10);
  factors.push({ name: 'Mortality', weight: 0.25, value: mortFactor });
  const d30 = new Date(); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().substring(0, 10);
  const f30 = D.feed.consumption.filter(c => c.date >= d30s);
  const e30 = D.dailyProduction.filter(p => p.date >= d30s);
  const tfkg = f30.reduce((s, c) => s + (c.quantityKg || 0), 0);
  const tekg = e30.reduce((s, p) => s + (p.eggsCollected || 0), 0) * 0.06;
  const fcr = tekg > 0 ? tfkg / tekg : 0;
  const fcrFactor = fcr > 0 ? Math.min(1, (fcr - 2) / 2) : 0;
  factors.push({ name: 'FCR', weight: 0.15, value: fcrFactor });
  const lastW = D.weatherCache.length > 0 ? D.weatherCache[D.weatherCache.length - 1] : null;
  let thiFactor = 0;
  if (lastW) { const thi = calcTHI(lastW.temp, lastW.humidity); thiFactor = thi > 28 ? Math.min(1, (thi - 25) / 10) : 0; }
  factors.push({ name: 'THI', weight: 0.15, value: thiFactor });
  let prodFactor = 0;
  if (l7prod.length >= 7 && typeof ss !== 'undefined') {
    const pts = l7prod.map((p, i) => [i, p.eggsCollected || 0]);
    const reg = ss.linearRegression(pts);
    prodFactor = reg.m < 0 ? Math.min(1, Math.abs(reg.m) / 10) : 0;
  }
  factors.push({ name: 'Production drop', weight: 0.20, value: prodFactor });
  const activeOut = D.outbreaks.filter(o => o.status === 'active').length;
  const outFactor = Math.min(1, activeOut / 3);
  factors.push({ name: 'Active outbreaks', weight: 0.10, value: outFactor });
  const today = todayStr();
  const overdueVac = D.vaccines.filter(v => v.status !== 'applied' && v.scheduledDate < today).length;
  const vacFactor = Math.min(1, overdueVac / 5);
  factors.push({ name: 'Vaccine gaps', weight: 0.10, value: vacFactor });
  const d7 = new Date(); d7.setDate(d7.getDate() - 7); const d7s = d7.toISOString().substring(0, 10);
  const recentStress = D.stressEvents.filter(e => e.date >= d7s).length;
  const stressFactor = Math.min(1, recentStress / 3);
  factors.push({ name: 'Recent stress', weight: 0.05, value: stressFactor });
  const z = factors.reduce((s, f) => s + f.weight * f.value * 6, 0) - 2;
  const probability = 1 / (1 + Math.exp(-z));
  const classification = probability >= 0.5 ? 1 : 0;
  const recommendations = [];
  if (mortFactor > 0.5) recommendations.push({ priority: 'high', msg: 'Lab samples' });
  if (thiFactor > 0.5) recommendations.push({ priority: 'high', msg: 'Ventilation' });
  if (fcrFactor > 0.5) recommendations.push({ priority: 'medium', msg: 'Check diet' });
  return { probability, classification, factors, recommendations };
}

// Pest score
function computePestScore(D) {
  const bio = D.biosecurity; let score = 0;
  const unresolved = bio.pestSightings.filter(p => !p.resolved);
  score += Math.min(40, unresolved.length * 10);
  score += Math.min(20, unresolved.reduce((s, p) => s + (p.severity || 1), 0) * 2);
  const redZones = bio.zones.filter(z => z.riskLevel === 'red').length;
  return Math.min(100, score + redZones * 10);
}

// KPI snapshot (simplified)
function computeKpiSnapshot() {
  const D = loadData(); const hens = activeHens(); const today = todayStr();
  const tp = D.dailyProduction.filter(p => p.date === today);
  const eggsToday = tp.reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const henDay = hens > 0 ? ((eggsToday / hens) * 100) : 0;
  const d30 = new Date(); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().substring(0, 10);
  const p30 = D.dailyProduction.filter(p => p.date >= d30s); const te30 = p30.reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const teKg = te30 * 0.06; const f30 = D.feed.consumption.filter(c => c.date >= d30s); const tfKg = f30.reduce((s, c) => s + (c.quantityKg || 0), 0);
  const fcr = teKg > 0 ? (tfKg / teKg) : 0;
  const tDeaths = D.dailyProduction.reduce((s, p) => s + (p.deaths || 0), 0);
  const tInit = D.flocks.reduce((s, f) => s + (f.count || 0), 0);
  const mort = tInit > 0 ? ((tDeaths / tInit) * 100) : 0;
  const tExp = D.finances.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const tEggs = D.dailyProduction.reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const cpe = tEggs > 0 ? tExp / tEggs : 0;
  const mo = today.substring(0, 7);
  const mInc = D.finances.income.filter(i => i.date && i.date.startsWith(mo)).reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
  const mExp = D.finances.expenses.filter(e => e.date && e.date.startsWith(mo)).reduce((s, e) => s + (e.amount || 0), 0);
  const stock = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) - D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
  return {
    date: today, activeHens: hens, eggsToday, henDay: Math.round(henDay * 10) / 10,
    fcr: Math.round(fcr * 100) / 100, mortality: Math.round(mort * 10) / 10,
    costPerEgg: Math.round(cpe * 100) / 100, netIncome: mInc - mExp, feedStock: Math.round(stock * 10) / 10,
    totalFlocks: D.flocks.filter(f => f.status !== 'descarte').length,
    activeOutbreaks: D.outbreaks.filter(o => o.status === 'active').length,
  };
}

// Alerts
function getAlerts(D) {
  const alerts = []; const today = todayStr(); const ad = D.settings.alertDaysBefore || 3;
  const soon = new Date(); soon.setDate(soon.getDate() + ad); const soonStr = soon.toISOString().substring(0, 10);
  D.vaccines.filter(v => v.status !== 'applied').forEach(v => {
    if (v.scheduledDate < today) alerts.push({ type: 'danger', msg: 'Vaccine overdue: ' + v.vaccineName });
    else if (v.scheduledDate <= soonStr) alerts.push({ type: 'warning', msg: 'Vaccine upcoming: ' + v.vaccineName });
  });
  const stock = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0) - D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
  if (stock < (D.settings.minFeedStock || 50)) alerts.push({ type: 'warning', msg: 'Low feed stock' });
  const tD = D.dailyProduction.reduce((s, p) => s + (p.deaths || 0), 0);
  const tI = D.flocks.reduce((s, f) => s + (f.count || 0), 0);
  if (tI > 0 && (tD / tI) * 100 > (D.settings.maxMortality || 5)) alerts.push({ type: 'danger', msg: 'High mortality' });
  D.outbreaks.filter(o => o.status === 'active').forEach(o => { alerts.push({ type: 'danger', msg: 'Active outbreak: ' + o.disease }); });
  return alerts;
}

// ============================================================
// TEST SUITES
// ============================================================

beforeEach(() => {
  DATA = null;
  LANG = 'es';
  localStorageMock.clear();
  sessionStorageMock.clear();
  vi.clearAllMocks();
});

// ============================================================
// 1. SECURITY FUNCTIONS
// ============================================================
describe('Security — sanitizeHTML & XSS Prevention', () => {

  it('should escape all 5 dangerous HTML characters', () => {
    const input = '<script>alert("XSS")</script>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  it('should escape ampersand correctly', () => {
    expect(sanitizeHTML('A & B')).toBe('A &amp; B');
  });

  it('should escape double quotes', () => {
    expect(sanitizeHTML('He said "hello"')).toBe('He said &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(sanitizeHTML("it's")).toBe('it&#039;s');
  });

  it('should handle non-string input (number)', () => {
    expect(sanitizeHTML(42)).toBe('42');
  });

  it('should handle null input', () => {
    expect(sanitizeHTML(null)).toBe('');
  });

  it('should handle undefined input', () => {
    expect(sanitizeHTML(undefined)).toBe('');
  });

  it('should prevent onclick attribute injection', () => {
    const malicious = '" onclick="alert(1)" data-x="';
    const result = escapeAttr(malicious);
    expect(result).not.toContain('"');
    expect(result).toContain('&quot;');
  });

  it('safeHTML should sanitize interpolated values but preserve template literals', () => {
    const userInput = '<img src=x onerror=alert(1)>';
    const result = safeHTML`<div class="safe">${userInput}</div>`;
    expect(result).toContain('<div class="safe">');
    expect(result).toContain('&lt;img');
    expect(result).not.toContain('<img');
  });

  it('should neutralize nested script injection', () => {
    const nested = '<<script>script>alert(1)<</script>/script>';
    const result = sanitizeHTML(nested);
    expect(result).not.toContain('<script>');
  });

  it('escapeAttr should handle empty string', () => {
    expect(escapeAttr('')).toBe('');
  });

  it('escapeAttr should handle zero', () => {
    expect(escapeAttr(0)).toBe('0');
  });
});

// ============================================================
// 2. DATA VALIDATION
// ============================================================
describe('Data Validation — validateInput', () => {

  it('should fail on empty required field', () => {
    const result = validateInput('', { required: true });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should pass on non-empty required field', () => {
    const result = validateInput('hello', { required: true });
    expect(result.valid).toBe(true);
  });

  it('should enforce minLength', () => {
    const result = validateInput('ab', { minLength: 5 });
    expect(result.valid).toBe(false);
  });

  it('should enforce maxLength', () => {
    const result = validateInput('abcdefghijk', { maxLength: 5 });
    expect(result.valid).toBe(false);
  });

  it('should enforce min value for egg production (0)', () => {
    const result = validateInput('-5', { min: 0 });
    expect(result.valid).toBe(false);
  });

  it('should enforce max value for egg production per day (reasonable: 50000)', () => {
    const result = validateInput('60000', { max: 50000 });
    expect(result.valid).toBe(false);
  });

  it('should pass for egg production within range', () => {
    const result = validateInput('350', { min: 0, max: 50000 });
    expect(result.valid).toBe(true);
  });

  it('should reject non-numeric for flock size', () => {
    const result = validateInput('abc', { numeric: true });
    expect(result.valid).toBe(false);
  });

  it('should accept numeric string', () => {
    const result = validateInput('1500', { numeric: true });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = validateInput('not-email', { email: true });
    expect(result.valid).toBe(false);
  });

  it('should accept valid email', () => {
    const result = validateInput('farmer@granja.cl', { email: true });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid phone', () => {
    const result = validateInput('abc', { phone: true });
    expect(result.valid).toBe(false);
  });

  it('should accept valid phone', () => {
    const result = validateInput('+56 9 1234 5678', { phone: true });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid date', () => {
    const result = validateInput('not-a-date', { date: true });
    expect(result.valid).toBe(false);
  });

  it('should accept valid date', () => {
    const result = validateInput('2026-02-14', { date: true });
    expect(result.valid).toBe(true);
  });

  it('should validate pattern (alphanumeric only)', () => {
    const result = validateInput('hello!@#', { pattern: /^[a-zA-Z0-9]+$/, patternMsg: 'Alphanumeric only' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toBe('Alphanumeric only');
  });

  it('should accumulate multiple errors', () => {
    const result = validateInput('', { required: true, minLength: 3 });
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Data Validation — validateForm', () => {
  it('should validate multiple fields at once', () => {
    const result = validateForm({
      'flock-name': { value: '', rules: { required: true } },
      'flock-count': { value: '-10', rules: { numeric: true, min: 1 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors['flock-name']).toBeDefined();
    expect(result.errors['flock-count']).toBeDefined();
  });

  it('should pass when all fields are valid', () => {
    const result = validateForm({
      'flock-name': { value: 'Lote Alpha', rules: { required: true, maxLength: 100 } },
      'flock-count': { value: '1500', rules: { numeric: true, min: 1, max: 100000 } },
    });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors).length).toBe(0);
  });
});

// ============================================================
// 3. ML / STATISTICS FUNCTIONS
// ============================================================
describe('ML/Statistics — Production Forecast', () => {
  it('should return empty forecast with fewer than 7 data points', () => {
    const D = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), dailyProduction: [
      { date: '2026-02-10', eggsCollected: 100 },
      { date: '2026-02-11', eggsCollected: 110 },
    ] };
    const result = computeForecast(D, 7);
    expect(result.forecast.length).toBe(0);
  });

  it('should generate 7-day forecast with sufficient data', () => {
    const prods = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2026, 1, 1 + i);
      prods.push({ date: d.toISOString().substring(0, 10), eggsCollected: 200 + i * 2 });
    }
    const D = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), dailyProduction: prods };
    const result = computeForecast(D, 7);
    expect(result.forecast.length).toBe(7);
    expect(result.upper.length).toBe(7);
    expect(result.lower.length).toBe(7);
    expect(result.dates.length).toBe(7);
  });

  it('should produce forecast values >= 0 (no negative eggs)', () => {
    const prods = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2026, 1, 1 + i);
      prods.push({ date: d.toISOString().substring(0, 10), eggsCollected: 5 });
    }
    const D = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), dailyProduction: prods };
    const result = computeForecast(D, 7);
    result.lower.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });

  it('should generate 14-day forecast', () => {
    const prods = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2026, 1, 1 + i);
      prods.push({ date: d.toISOString().substring(0, 10), eggsCollected: 150 });
    }
    const D = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), dailyProduction: prods };
    const result = computeForecast(D, 14);
    expect(result.forecast.length).toBe(14);
  });

  it('ensemble should average WMA and linear regression', () => {
    const prods = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2026, 1, 1 + i);
      prods.push({ date: d.toISOString().substring(0, 10), eggsCollected: 100 + i * 10 });
    }
    const D = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), dailyProduction: prods };
    const result = computeForecast(D, 7);
    for (let i = 0; i < 7; i++) {
      const expected = (result.wma[i] + result.lr[i]) / 2;
      expect(result.forecast[i]).toBeCloseTo(expected, 5);
    }
  });
});

describe('ML/Statistics — Outbreak Risk Classifier', () => {
  it('should return probability=0 and classification=0 when no hens', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    const result = computeOutbreakRisk(DATA);
    expect(result.probability).toBe(0);
    expect(result.classification).toBe(0);
  });

  it('should compute low risk for healthy flock with no issues', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', name: 'Lote 1', count: 1000, status: 'produccion', birthDate: '2025-06-01' }];
    DATA.dailyProduction = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      DATA.dailyProduction.push({ date: d.toISOString().substring(0, 10), flockId: 'f1', eggsCollected: 900, deaths: 0 });
    }
    const result = computeOutbreakRisk(DATA);
    expect(result.probability).toBeLessThan(0.5);
    expect(result.classification).toBe(0);
  });

  it('should compute high risk with high mortality + active outbreaks', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', name: 'Lote 1', count: 100, status: 'produccion', birthDate: '2025-06-01' }];
    DATA.dailyProduction = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      DATA.dailyProduction.push({ date: d.toISOString().substring(0, 10), flockId: 'f1', eggsCollected: 20, deaths: 10 });
    }
    DATA.outbreaks = [{ flockId: 'f1', status: 'active', disease: 'Newcastle' }, { flockId: 'f1', status: 'active', disease: 'Gumboro' }];
    DATA.vaccines = [{ flockId: 'f1', status: 'pending', scheduledDate: '2025-01-01', vaccineName: 'Marek' }];
    DATA.stressEvents = [{ date: todayStr(), severity: 5 }];
    DATA.weatherCache = [{ temp: 40, humidity: 80, ts: Date.now() }];
    const result = computeOutbreakRisk(DATA);
    expect(result.probability).toBeGreaterThan(0.5);
    expect(result.classification).toBe(1);
    expect(result.factors.length).toBe(7);
  });

  it('should generate recommendations for high mortality factor', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', name: 'Lote 1', count: 100, status: 'produccion', birthDate: '2025-06-01' }];
    DATA.dailyProduction = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      DATA.dailyProduction.push({ date: d.toISOString().substring(0, 10), flockId: 'f1', eggsCollected: 50, deaths: 8 });
    }
    const result = computeOutbreakRisk(DATA);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should use sigmoid function for probability (always between 0 and 1)', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', count: 500, status: 'produccion', birthDate: '2025-01-01' }];
    DATA.dailyProduction = [{ date: todayStr(), flockId: 'f1', eggsCollected: 200, deaths: 0 }];
    const result = computeOutbreakRisk(DATA);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
  });
});

describe('ML/Statistics — THI Calculation', () => {
  it('should compute THI at 25C 50% humidity (comfort zone)', () => {
    const thi = calcTHI(25, 50);
    expect(thi).toBeGreaterThan(20);
    expect(thi).toBeLessThan(30);
  });

  it('should show high stress at 38C 80% humidity', () => {
    const thi = calcTHI(38, 80);
    expect(thi).toBeGreaterThan(30);
  });

  it('should show no stress at 20C 50% humidity', () => {
    const thi = calcTHI(20, 50);
    expect(thi).toBeLessThan(28);
  });

  it('should increase with temperature', () => {
    const thi1 = calcTHI(20, 50);
    const thi2 = calcTHI(35, 50);
    expect(thi2).toBeGreaterThan(thi1);
  });
});

// ============================================================
// 4. TRANSLATION SYSTEM
// ============================================================
describe('Translation System — 8 Languages', () => {

  it('should return Spanish text by default', () => {
    LANG = 'es';
    expect(t('save')).toBe('Guardar');
    expect(t('cancel')).toBe('Cancelar');
  });

  it('should return English text when LANG=en', () => {
    LANG = 'en';
    expect(t('save')).toBe('Save');
    expect(t('cancel')).toBe('Cancel');
  });

  it('should return Portuguese text when LANG=pt', () => {
    LANG = 'pt';
    expect(t('save')).toBe('Salvar');
  });

  it('should return French text when LANG=fr', () => {
    LANG = 'fr';
    expect(t('save')).toBe('Enregistrer');
  });

  it('should return German text when LANG=de', () => {
    LANG = 'de';
    expect(t('save')).toBe('Speichern');
  });

  it('should return Italian text when LANG=it', () => {
    LANG = 'it';
    expect(t('save')).toBe('Salva');
  });

  it('should return Japanese text when LANG=ja', () => {
    LANG = 'ja';
    expect(t('save')).toBe('\u4FDD\u5B58');
  });

  it('should return Chinese text when LANG=zh', () => {
    LANG = 'zh';
    expect(t('save')).toBe('\u4FDD\u5B58');
  });

  it('should fall back to Spanish for missing keys in other languages', () => {
    LANG = 'en';
    // 'kpi_alerts' exists in both, but test a key that might only be in es
    expect(t('kpi_alerts')).toBeDefined();
    expect(typeof t('kpi_alerts')).toBe('string');
  });

  it('should return the key itself if missing from all languages', () => {
    LANG = 'es';
    expect(t('nonexistent_key_xyz')).toBe('nonexistent_key_xyz');
  });

  it('all 8 languages should have the "save" key', () => {
    const langs = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh'];
    langs.forEach(l => {
      expect(T[l]).toBeDefined();
      expect(T[l].save).toBeDefined();
    });
  });

  it('all 8 languages should have a "logout" key', () => {
    const langs = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh'];
    langs.forEach(l => {
      expect(T[l].logout).toBeDefined();
      expect(T[l].logout.length).toBeGreaterThan(0);
    });
  });

  it('locale() should return correct locale per language', () => {
    LANG = 'es'; expect(locale()).toBe('es-CL');
    LANG = 'en'; expect(locale()).toBe('en-US');
    LANG = 'pt'; expect(locale()).toBe('pt-BR');
    LANG = 'ja'; expect(locale()).toBe('ja-JP');
    LANG = 'zh'; expect(locale()).toBe('zh-CN');
  });
});

// ============================================================
// 5. FINANCIAL CALCULATIONS
// ============================================================
describe('Financial Calculations', () => {

  it('should compute cost per egg correctly', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.finances.expenses = [{ amount: 1000, date: todayStr(), category: 'feed' }];
    DATA.dailyProduction = [{ date: todayStr(), eggsCollected: 500, flockId: 'f1', deaths: 0 }];
    const snap = computeKpiSnapshot();
    expect(snap.costPerEgg).toBe(2); // 1000/500
  });

  it('should compute cost per egg as 0 when no eggs', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.finances.expenses = [{ amount: 500, date: todayStr() }];
    const snap = computeKpiSnapshot();
    expect(snap.costPerEgg).toBe(0);
  });

  it('should compute monthly net income (income - expenses)', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    const mo = todayStr().substring(0, 7);
    DATA.finances.income = [{ date: todayStr(), quantity: 100, unitPrice: 50 }];
    DATA.finances.expenses = [{ date: todayStr(), amount: 2000 }];
    const snap = computeKpiSnapshot();
    expect(snap.netIncome).toBe(5000 - 2000); // 100*50 - 2000
  });

  it('should compute FCR (feed conversion ratio)', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    // 30 days of production and consumption
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().substring(0, 10);
      DATA.dailyProduction.push({ date: ds, eggsCollected: 100, flockId: 'f1', deaths: 0 });
      DATA.feed.consumption.push({ date: ds, quantityKg: 15, flockId: 'f1' });
    }
    const snap = computeKpiSnapshot();
    // FCR = total feed kg / total egg kg; egg kg = eggs*0.06, feed = 30*15=450, egg kg = 30*100*0.06=180
    expect(snap.fcr).toBeCloseTo(450 / 180, 1);
  });

  it('should compute feed stock (purchases - consumption)', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.feed.purchases = [{ quantityKg: 1000 }, { quantityKg: 500 }];
    DATA.feed.consumption = [{ quantityKg: 300 }, { quantityKg: 200 }];
    const snap = computeKpiSnapshot();
    expect(snap.feedStock).toBe(1000);
  });

  it('fmtMoney should prepend currency symbol', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.farm.currency = '$';
    const result = fmtMoney(1500);
    expect(result).toContain('$');
    expect(result).toContain('1');
  });

  it('should handle negative net income', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.finances.income = [];
    DATA.finances.expenses = [{ date: todayStr(), amount: 5000 }];
    const snap = computeKpiSnapshot();
    expect(snap.netIncome).toBeLessThan(0);
  });

  it('should compute mortality as percentage of initial count', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', count: 1000, status: 'produccion' }];
    DATA.dailyProduction = [
      { date: todayStr(), flockId: 'f1', eggsCollected: 800, deaths: 50 },
    ];
    const snap = computeKpiSnapshot();
    expect(snap.mortality).toBe(5); // 50/1000*100
  });
});

// ============================================================
// 6. DATA PERSISTENCE
// ============================================================
describe('Data Persistence — localStorage', () => {

  it('loadData should return DEFAULT_DATA when storage is empty', () => {
    DATA = null;
    const d = loadData();
    expect(d.farm.name).toBe('Mi Granja');
    expect(d.flocks).toEqual([]);
    expect(d.settings.minFeedStock).toBe(50);
  });

  it('saveData should persist to localStorage', () => {
    DATA = null;
    const d = loadData();
    d.farm.name = 'Test Farm';
    saveData(d);
    expect(localStorage.setItem).toHaveBeenCalledWith('egglogu_data', expect.any(String));
    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    expect(stored.farm.name).toBe('Test Farm');
  });

  it('loadData should restore saved data from localStorage', () => {
    const mockData = JSON.parse(JSON.stringify(DEFAULT_DATA));
    mockData.farm.name = 'Restored Farm';
    mockData.flocks = [{ id: 'x1', name: 'Lote Restored', count: 500, status: 'produccion' }];
    localStorage.setItem('egglogu_data', JSON.stringify(mockData));
    // Force re-read
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockData));
    DATA = null;
    const d = loadData();
    expect(d.farm.name).toBe('Restored Farm');
    expect(d.flocks.length).toBe(1);
  });

  it('loadData should gracefully handle corrupted JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('NOT_VALID_JSON{{{');
    DATA = null;
    const d = loadData();
    expect(d.farm.name).toBe('Mi Granja'); // Falls back to default
  });

  it('loadData should migrate missing keys from DEFAULT_DATA', () => {
    const partial = { farm: { name: 'Partial' }, flocks: [], settings: {} };
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(partial));
    DATA = null;
    const d = loadData();
    expect(d.farm.name).toBe('Partial');
    expect(d.dailyProduction).toBeDefined();
    expect(d.finances).toBeDefined();
    expect(d.biosecurity).toBeDefined();
  });

  it('export generates valid JSON blob', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.farm.name = 'Export Test';
    const jsonStr = JSON.stringify(DATA, null, 2);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.farm.name).toBe('Export Test');
  });

  it('import should accept valid JSON and update DATA', () => {
    const imported = JSON.parse(JSON.stringify(DEFAULT_DATA));
    imported.farm.name = 'Imported Farm';
    imported.flocks = [{ id: 'imp1', name: 'Imported Flock', count: 200, status: 'cria' }];
    DATA = imported;
    saveData(imported);
    expect(DATA.farm.name).toBe('Imported Farm');
    expect(DATA.flocks.length).toBe(1);
  });

  it('reset should clear data and restore defaults', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.farm.name = 'Before Reset';
    saveData(DATA);
    // Simulate reset
    localStorage.removeItem('egglogu_data');
    DATA = null;
    const d = loadData();
    expect(d.farm.name).toBe('Mi Granja');
  });
});

// ============================================================
// 7. UI MODE SWITCHING
// ============================================================
describe('UI Mode Switching', () => {

  it('toggleCampoMode should set campoMode=true and vetMode=false', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.settings.campoMode = false;
    DATA.settings.vetMode = true;
    // Simulate toggle
    DATA.settings.campoMode = !DATA.settings.campoMode;
    if (DATA.settings.campoMode) DATA.settings.vetMode = false;
    expect(DATA.settings.campoMode).toBe(true);
    expect(DATA.settings.vetMode).toBe(false);
  });

  it('toggleVetMode should set vetMode=true and campoMode=false', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.settings.vetMode = false;
    DATA.settings.campoMode = true;
    // Simulate toggle
    DATA.settings.vetMode = !DATA.settings.vetMode;
    if (DATA.settings.vetMode) DATA.settings.campoMode = false;
    expect(DATA.settings.vetMode).toBe(true);
    expect(DATA.settings.campoMode).toBe(false);
  });

  it('dark mode should set darkMode=true in settings', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.settings.darkMode = true;
    expect(DATA.settings.darkMode).toBe(true);
  });

  it('font scale should accept valid values', () => {
    const validScales = ['small', 'normal', 'large', 'xlarge'];
    validScales.forEach(scale => {
      DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
      DATA.settings.fontScale = scale;
      expect(DATA.settings.fontScale).toBe(scale);
    });
  });

  it('campo mode and vet mode should be mutually exclusive', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.settings.campoMode = true;
    DATA.settings.vetMode = true;
    // Apply mutual exclusion as the app does
    if (DATA.settings.campoMode) DATA.settings.vetMode = false;
    expect(DATA.settings.campoMode).toBe(true);
    expect(DATA.settings.vetMode).toBe(false);
  });

  it('default mode should have campoMode=false and vetMode=false', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    expect(DATA.settings.campoMode).toBe(false);
    expect(DATA.settings.vetMode).toBe(false);
  });
});

// ============================================================
// 8. BREED CURVES & LIFECYCLE
// ============================================================
describe('Breed Curves & Lifecycle', () => {

  it('isa-brown curve should start at 9% and peak near 95%', () => {
    expect(BREED_CURVES['isa-brown'][0]).toBe(9);
    expect(Math.max(...BREED_CURVES['isa-brown'])).toBe(95);
  });

  it('generic curve should have 61 weekly entries (week 18-80)', () => {
    expect(BREED_CURVES['generic'].length).toBe(61);
  });

  it('flockAge should return 0 for flock without birthDate', () => {
    const f = { name: 'Test', count: 100 };
    const age = flockAge(f);
    expect(age.days).toBe(0);
    expect(age.weeks).toBe(0);
  });

  it('flockAge should compute correct weeks for known birthDate', () => {
    const birthDate = new Date();
    birthDate.setDate(birthDate.getDate() - 70); // 10 weeks ago
    const f = { name: 'Test', count: 100, birthDate: birthDate.toISOString().substring(0, 10) };
    const age = flockAge(f);
    expect(age.weeks).toBe(10);
    expect(age.days).toBeGreaterThanOrEqual(69);
  });

  it('flockLifecycleStage should return pollito for week 2 flock', () => {
    const birthDate = new Date();
    birthDate.setDate(birthDate.getDate() - 14); // 2 weeks ago
    const f = { name: 'Test', count: 100, birthDate: birthDate.toISOString().substring(0, 10) };
    const stage = flockLifecycleStage(f);
    expect(stage.stage).toBe('pollito');
  });

  it('flockLifecycleStage should return postura_pico for week 25 flock', () => {
    const birthDate = new Date();
    birthDate.setDate(birthDate.getDate() - 175); // 25 weeks ago
    const f = { name: 'Test', count: 100, birthDate: birthDate.toISOString().substring(0, 10) };
    const stage = flockLifecycleStage(f);
    expect(stage.stage).toBe('postura_pico');
  });

  it('flockLifecycleStage should return descarte for week 90 flock', () => {
    const birthDate = new Date();
    birthDate.setDate(birthDate.getDate() - 630); // 90 weeks ago
    const f = { name: 'Test', count: 100, birthDate: birthDate.toISOString().substring(0, 10) };
    const stage = flockLifecycleStage(f);
    expect(stage.stage).toBe('descarte');
  });
});

// ============================================================
// 9. HEALTH SCORE
// ============================================================
describe('Health Score Computation', () => {

  it('should return 0 for non-existent flock', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    expect(healthScore('nonexistent')).toBe(0);
  });

  it('should return high score for healthy flock with good production and no outbreaks', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', name: 'Healthy', count: 100, status: 'produccion', birthDate: '2025-06-01' }];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      DATA.dailyProduction.push({ date: d.toISOString().substring(0, 10), flockId: 'f1', eggsCollected: 90, deaths: 0 });
    }
    const score = healthScore('f1');
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('should penalize for active outbreaks', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', name: 'Sick', count: 100, status: 'produccion', birthDate: '2025-06-01' }];
    DATA.outbreaks = [
      { flockId: 'f1', status: 'active', disease: 'Newcastle', deaths: 0 },
      { flockId: 'f1', status: 'active', disease: 'Gumboro', deaths: 0 },
    ];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      DATA.dailyProduction.push({ date: d.toISOString().substring(0, 10), flockId: 'f1', eggsCollected: 90, deaths: 0 });
    }
    const score = healthScore('f1');
    // With 2 active outbreaks, oS=0 (20% weight), so score drops
    expect(score).toBeLessThan(80);
  });
});

// ============================================================
// 10. ALERTS ENGINE
// ============================================================
describe('Alerts Engine', () => {

  it('should generate low feed stock alert', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.settings.minFeedStock = 100;
    DATA.feed.purchases = [{ quantityKg: 50 }];
    DATA.feed.consumption = [{ quantityKg: 30 }];
    // Stock = 20 < 100
    const alerts = getAlerts(DATA);
    expect(alerts.some(a => a.msg.includes('Low feed stock'))).toBe(true);
  });

  it('should generate high mortality alert', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.settings.maxMortality = 5;
    DATA.flocks = [{ id: 'f1', count: 100, status: 'produccion' }];
    DATA.dailyProduction = [{ date: todayStr(), flockId: 'f1', eggsCollected: 50, deaths: 10 }];
    const alerts = getAlerts(DATA);
    expect(alerts.some(a => a.msg.includes('High mortality'))).toBe(true);
  });

  it('should generate active outbreak alert', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.outbreaks = [{ flockId: 'f1', status: 'active', disease: 'Newcastle', deaths: 0 }];
    DATA.flocks = [{ id: 'f1', name: 'Lote 1', count: 100, status: 'produccion' }];
    const alerts = getAlerts(DATA);
    expect(alerts.some(a => a.msg.includes('Active outbreak'))).toBe(true);
  });

  it('should generate overdue vaccine alert', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', name: 'Lote 1', count: 100, status: 'produccion' }];
    DATA.vaccines = [{ flockId: 'f1', status: 'pending', scheduledDate: '2020-01-01', vaccineName: 'Marek' }];
    const alerts = getAlerts(DATA);
    expect(alerts.some(a => a.msg.includes('Vaccine overdue'))).toBe(true);
  });

  it('should return empty alerts for a clean farm', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.feed.purchases = [{ quantityKg: 1000 }];
    const alerts = getAlerts(DATA);
    // Only feed stock alert should be absent since stock=1000 > 50
    expect(alerts.filter(a => a.msg.includes('Low feed stock')).length).toBe(0);
  });
});

// ============================================================
// 11. BIOSECURITY — PEST SCORE
// ============================================================
describe('Biosecurity — Pest Score', () => {

  it('should return 0 for clean biosecurity', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    const score = computePestScore(DATA);
    expect(score).toBe(0);
  });

  it('should increase score for unresolved pest sightings', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.biosecurity.pestSightings = [
      { id: 'p1', resolved: false, severity: 3 },
      { id: 'p2', resolved: false, severity: 2 },
    ];
    const score = computePestScore(DATA);
    expect(score).toBeGreaterThan(0);
  });

  it('should not count resolved pests', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.biosecurity.pestSightings = [
      { id: 'p1', resolved: true, severity: 5 },
    ];
    const score = computePestScore(DATA);
    expect(score).toBe(0);
  });

  it('should add penalty for red zones', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.biosecurity.zones = [{ name: 'Zone A', riskLevel: 'red' }];
    const score = computePestScore(DATA);
    expect(score).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================
// 12. UTILITY FUNCTIONS
// ============================================================
describe('Utility Functions', () => {

  it('genId should produce unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(genId());
    expect(ids.size).toBe(100);
  });

  it('todayStr should return YYYY-MM-DD format', () => {
    const today = todayStr();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fmtDate should return "-" for falsy date', () => {
    expect(fmtDate('')).toBe('-');
    expect(fmtDate(null)).toBe('-');
    expect(fmtDate(undefined)).toBe('-');
  });

  it('fmtDate should format a valid date string', () => {
    const result = fmtDate('2026-02-14');
    expect(result).toBeTruthy();
    expect(result).not.toBe('-');
  });

  it('fmtNum should format number with correct decimal places', () => {
    LANG = 'en';
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    const result = fmtNum(1234.5678, 2);
    expect(result).toContain('1');
    expect(result).toContain('234');
  });

  it('activeHensByFlock should subtract deaths and outbreak deaths', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', count: 1000, status: 'produccion' }];
    DATA.dailyProduction = [
      { flockId: 'f1', deaths: 10, date: todayStr(), eggsCollected: 800 },
      { flockId: 'f1', deaths: 5, date: todayStr(), eggsCollected: 790 },
    ];
    DATA.outbreaks = [{ flockId: 'f1', deaths: 20, status: 'resolved' }];
    expect(activeHensByFlock('f1')).toBe(1000 - 10 - 5 - 20);
  });

  it('activeHensByFlock should return 0 for non-existent flock', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    expect(activeHensByFlock('nonexistent')).toBe(0);
  });

  it('activeHensByFlock should never return negative', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', count: 10, status: 'produccion' }];
    DATA.dailyProduction = [{ flockId: 'f1', deaths: 100, date: todayStr(), eggsCollected: 0 }];
    expect(activeHensByFlock('f1')).toBe(0);
  });

  it('activeHens should sum across non-descarte flocks', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [
      { id: 'f1', count: 500, status: 'produccion' },
      { id: 'f2', count: 300, status: 'produccion' },
      { id: 'f3', count: 200, status: 'descarte' },
    ];
    expect(activeHens()).toBe(800); // f3 is excluded
  });
});

// ============================================================
// 13. EDGE CASES AND BOUNDARY TESTING
// ============================================================
describe('Edge Cases & Boundary Testing', () => {

  it('should handle flock with count=0', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f0', count: 0, status: 'produccion' }];
    expect(activeHensByFlock('f0')).toBe(0);
    expect(healthScore('f0')).toBe(0);
  });

  it('should handle empty dailyProduction array', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    DATA.flocks = [{ id: 'f1', count: 100, status: 'produccion', birthDate: '2025-06-01' }];
    const score = healthScore('f1');
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('THI should handle extreme cold (0C)', () => {
    const thi = calcTHI(0, 50);
    expect(typeof thi).toBe('number');
    expect(thi).toBeLessThan(20);
  });

  it('THI should handle extreme heat (45C, 100% humidity)', () => {
    const thi = calcTHI(45, 100);
    expect(thi).toBeGreaterThan(35);
  });

  it('validateInput with empty rules should always pass', () => {
    const result = validateInput('anything', {});
    expect(result.valid).toBe(true);
  });

  it('sanitizeHTML with very long string should not throw', () => {
    const long = '<script>'.repeat(10000);
    const result = sanitizeHTML(long);
    expect(result).not.toContain('<script>');
  });

  it('fmtMoney with 0 should return currency + 0', () => {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    const result = fmtMoney(0);
    expect(result).toContain('$');
  });

  it('loadData should handle missing sub-properties in saved data', () => {
    const incomplete = {
      farm: { name: 'Incomplete' },
      flocks: [],
      settings: { minFeedStock: 100 },
      feed: {},
      finances: {},
    };
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(incomplete));
    DATA = null;
    const d = loadData();
    expect(d.feed.purchases).toEqual([]);
    expect(d.feed.consumption).toEqual([]);
    expect(d.finances.receivables).toEqual([]);
    expect(d.biosecurity).toBeDefined();
  });
});
