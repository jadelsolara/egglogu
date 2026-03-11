// EGGlogU — Shared UI Helpers
// Used by all section components for rendering KPIs, badges, selects, forms, pagination, etc.

import { Store } from './store.js';
import { t, getLang } from './i18n.js';
import { sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, genId } from './utils.js';
import { Bus } from './bus.js';
import { CATALOGS, VACCINE_SCHEDULE, tc } from './catalogs.js';
import { activeHensByFlock, flockAge, flockLifecycleStage } from './veng.js';
import { getCurrentUser } from './permissions.js';

// ============ CURRENCY ============
export function currency() {
  const D = Store.get();
  return (D && D.farm && D.farm.currency) || '$';
}

// ============ KPI CARD ============
export function kpi(label, value, sub, cls = '', info = '') {
  return `<div class="kpi-card ${cls}">${info ? '<button class="kpi-info-btn" data-kpi-info="' + escapeAttr(info) + '">i</button>' : ''}<div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub || ''}</div></div>`;
}

// ============ STATUS / HEALTH BADGES ============
export function statusBadge(st) {
  const m = { cria: 'info', recria: 'warning', produccion: 'success', descarte: 'secondary', active: 'danger', controlled: 'warning', resolved: 'success', pending: 'warning', applied: 'success', overdue: 'danger' };
  const lb = { cria: t('flock_status_cria'), recria: t('flock_status_recria'), produccion: t('flock_status_produccion'), descarte: t('flock_status_descarte'), active: t('out_active'), controlled: t('out_controlled'), resolved: t('out_resolved'), pending: t('vac_pending'), applied: t('vac_applied_status'), overdue: t('vac_overdue') };
  return `<span class="badge badge-${m[st] || 'secondary'}">${lb[st] || st}</span>`;
}

export function healthScore(fid) {
  const D = Store.get();
  const f = D.flocks.find(x => x.id === fid);
  if (!f) return 0;
  const td = D.dailyProduction.filter(p => p.flockId === fid).reduce((s, p) => s + (p.deaths || 0), 0);
  const mPct = f.count > 0 ? (td / f.count) * 100 : 0;
  const mS = Math.max(0, 100 - mPct * 10);
  const l7 = D.dailyProduction.filter(p => p.flockId === fid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const hens = activeHensByFlock(fid);
  let pS = 50;
  if (l7.length > 0 && hens > 0) { const avg = l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length; pS = Math.min(100, (avg / hens) * 125); }
  let fS = 80;
  const l7f = D.feed.consumption.filter(c => c.flockId === fid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  if (l7f.length > 0 && l7.length > 0 && hens > 0) { const aF = l7f.reduce((s, c) => s + (c.quantityKg || 0), 0) / l7f.length; const aE = (l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length * 0.06); const fcr = aE > 0 ? aF / aE : 99; fS = fcr < 2 ? 100 : fcr < 2.5 ? 80 : fcr < 3 ? 60 : fcr < 4 ? 40 : 20; }
  const ao = D.outbreaks.filter(o => o.flockId === fid && o.status === 'active').length;
  const oS = ao === 0 ? 100 : ao === 1 ? 40 : 0;
  return Math.round(mS * 0.3 + pS * 0.3 + fS * 0.2 + oS * 0.2);
}

export function healthBadge(s) {
  return `<span class="health-score ${s >= 70 ? 'good' : s >= 40 ? 'warn' : 'bad'}">${s}</span>`;
}

// ============ SELECT BUILDERS ============
export function flockSelect(sel, all = false) {
  const D = Store.get();
  const active = D.flocks.filter(f => f.status !== 'descarte');
  let h = all ? `<option value="">${t('all')}</option>` : '';
  if (all || active.length !== 1) h += '<option value="">--</option>';
  active.forEach(f => {
    const autoSel = (!sel && active.length === 1) || f.id === sel;
    h += `<option value="${escapeAttr(f.id)}"${autoSel ? ' selected' : ''}>${sanitizeHTML(f.name)}</option>`;
  });
  return h;
}

export function clientSelect(sel) {
  const D = Store.get();
  let h = '<option value="">--</option>';
  D.clients.forEach(c => { h += `<option value="${escapeAttr(c.id)}"${c.id === sel ? ' selected' : ''}>${sanitizeHTML(c.name)}</option>`; });
  return h;
}

export function supplierSelect(sel) {
  const D = Store.get();
  const sups = D.farm.suppliers || [];
  let h = '<option value="">--</option>';
  sups.forEach(s => { h += `<option value="${escapeAttr(s.name)}"${s.name === sel ? ' selected' : ''}>${sanitizeHTML(s.name)}</option>`; });
  h += '<option value="__new__">+ Nuevo proveedor</option>';
  return h;
}

export function handleSupplierChange(selectEl) {
  const wrap = selectEl.parentElement;
  let inp = wrap.querySelector('.sup-new-input');
  if (selectEl.value === '__new__') {
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'sup-new-input';
      inp.placeholder = getLang() === 'en' ? 'Supplier name' : 'Nombre del proveedor';
      inp.style.marginTop = '6px'; wrap.appendChild(inp); inp.focus();
    }
  } else { if (inp) inp.remove(); }
}

export function resolveSupplier(selEl) {
  if (!selEl) return '';
  if (selEl.value === '__new__') {
    const inp = selEl.parentElement.querySelector('.sup-new-input');
    const name = (inp ? inp.value : '').trim();
    if (name) {
      const D = Store.get();
      if (!D.farm.suppliers) D.farm.suppliers = [];
      if (!D.farm.suppliers.find(s => s.name === name)) { D.farm.suppliers.push({ name }); Store.save(D); }
    }
    return name;
  }
  return selEl.value;
}

export function houseSelect(sel) {
  const D = Store.get();
  const houses = D.farm.houses || [];
  let h = '<option value="">--</option>';
  houses.forEach(ho => { h += `<option value="${escapeAttr(ho.name)}"${ho.name === sel ? ' selected' : ''}>${sanitizeHTML(ho.name)}</option>`; });
  return h;
}

export function rackSelect(houseName, sel) {
  const D = Store.get();
  const houses = D.farm.houses || [];
  const house = houses.find(h => h.name === houseName);
  let h = '<option value="">--</option>';
  if (house && house.racks) { house.racks.forEach(r => { h += `<option value="${escapeAttr(r.name)}"${r.name === sel ? ' selected' : ''}>${sanitizeHTML(r.name)}</option>`; }); }
  return h;
}

export function routeSelect(sel) {
  const D = Store.get();
  const routes = D.farm.routes || [];
  let h = '<option value="">--</option>';
  routes.forEach(r => { h += `<option value="${escapeAttr(r.name)}"${r.name === sel ? ' selected' : ''}>${sanitizeHTML(r.name)}</option>`; });
  return h;
}

export function catalogSelect(items, sel, addOther = true) {
  let h = '<option value="">--</option>';
  items.forEach(item => {
    const v = typeof item === 'string' ? item : item.name || item.id;
    const lbl = typeof item === 'string' ? item : item.name;
    h += `<option value="${escapeAttr(v)}"${v === sel ? ' selected' : ''}>${sanitizeHTML(tc(lbl))}</option>`;
  });
  if (addOther) h += '<option value="__other__">Otra...</option>';
  return h;
}

export function feedTypeSelect(sel, flockId) {
  const D = Store.get();
  let suggested = '';
  if (flockId) {
    const f = D.flocks.find(x => x.id === flockId);
    if (f) { const stage = flockLifecycleStage(f); if (stage) suggested = stage.id; }
  }
  let h = '<option value="">--</option>';
  CATALOGS.feedTypes.forEach(ft => {
    const isSuggested = ft.stage === suggested;
    h += `<option value="${ft.id}"${ft.id === sel ? ' selected' : ''}>${tc(ft.name)}${isSuggested ? ' ★' : ''}</option>`;
  });
  h += '<option value="__other__">Otro...</option>';
  return h;
}

// ============ FORM HELPERS ============
export function showFieldError(rootOrId, fieldIdOrMsg, msg) {
  // Support both (root, fieldId, msg) and legacy (fieldId, msg)
  let root, fieldId, message;
  if (msg !== undefined) {
    root = rootOrId; fieldId = fieldIdOrMsg; message = msg;
  } else {
    root = document.querySelector('egg-modal')?.shadowRoot?.querySelector('.modal-body');
    fieldId = rootOrId; message = fieldIdOrMsg;
  }
  if (!root) return;
  const el = root.querySelector('#' + fieldId);
  if (!el) return;
  el.classList.add('field-error');
  let errEl = el.parentElement?.querySelector('.field-error-msg');
  if (!errEl) { errEl = document.createElement('div'); errEl.className = 'field-error-msg'; el.parentElement?.appendChild(errEl); }
  errEl.textContent = message;
}

export function clearFieldErrors(root) {
  if (!root) root = document.querySelector('egg-modal')?.shadowRoot?.querySelector('.modal-body');
  if (!root) return;
  root.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  root.querySelectorAll('.field-error-msg').forEach(el => el.remove());
}

// ============ AUDIT TRAIL ============
export function logAudit(action, module, detail, before, after) {
  const D = Store.get();
  if (!D.auditLog) D.auditLog = [];
  const user = getCurrentUser();
  D.auditLog.push({ ts: new Date().toISOString(), user: user.name, action, module, detail: detail || '', before: before || null, after: after || null });
  if (D.auditLog.length > 10000) D.auditLog = D.auditLog.slice(-10000);
  Store.save(D);
}

// ============ PAGINATION ============
const PAGE_SIZE = 50;

export function paginate(arr, page, size) {
  size = size || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(arr.length / size));
  const p = Math.max(1, Math.min(page || 1, totalPages));
  return { items: arr.slice((p - 1) * size, p * size), totalPages, page: p, total: arr.length };
}

// ============ AUTO-BACKUP (Cache API) ============
let _backupTimer = null;

export function scheduleAutoBackup() {
  if (_backupTimer) clearTimeout(_backupTimer);
  _backupTimer = setTimeout(autoBackup, 5000);
}

export async function autoBackup() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('egglogu-backups');
    const keys = await cache.keys();
    const backupKeys = keys.filter(k => k.url.includes('egglogu-backup-')).sort((a, b) => a.url.localeCompare(b.url));
    while (backupKeys.length >= 5) { await cache.delete(backupKeys.shift()); }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const data = localStorage.getItem('egglogu_data') || '{}';
    await cache.put(new Request('/egglogu-backup-' + ts), new Response(data, { headers: { 'Content-Type': 'application/json', 'X-Backup-Date': new Date().toISOString(), 'X-Backup-Size': String(data.length) } }));
  } catch (e) { console.warn('Auto-backup failed:', e.message); }
}

export async function listBackups() {
  if (!('caches' in window)) return [];
  try {
    const cache = await caches.open('egglogu-backups');
    const keys = await cache.keys();
    const backups = [];
    for (const k of keys) {
      if (!k.url.includes('egglogu-backup-')) continue;
      const r = await cache.match(k);
      const date = r.headers.get('X-Backup-Date') || '';
      const size = parseInt(r.headers.get('X-Backup-Size')) || 0;
      backups.push({ url: k.url, date, size, key: k });
    }
    return backups.sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) { return []; }
}

export async function restoreBackup(url) {
  try {
    const cache = await caches.open('egglogu-backups');
    const r = await cache.match(new Request(url));
    if (!r) { Bus.emit('toast', { msg: 'Backup not found', type: 'error' }); return; }
    const data = await r.json();
    Store.save(data);
    Bus.emit('toast', { msg: t('cfg_imported') || 'Restored' });
    Bus.emit('nav:request', { section: 'config' });
  } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
}

// ============ VACCINE CALENDAR GENERATOR ============
export function generateVaccineCalendar(flock) {
  if (!flock.birthDate) return;
  const D = Store.get();
  VACCINE_SCHEDULE.forEach(vs => {
    const exists = D.vaccines.some(v => v.flockId === flock.id && v.vaccineName === vs.name);
    if (exists) return;
    const d = new Date(flock.birthDate + 'T12:00:00');
    d.setDate(d.getDate() + vs.weekMin * 7);
    D.vaccines.push({
      id: genId(), flockId: flock.id, vaccineName: vs.name, route: vs.route || '',
      batchNumber: '', scheduledDate: d.toISOString().substring(0, 10),
      appliedDate: '', cost: null, notes: vs.notes || '', status: 'pending'
    });
  });
  Store.save(D);
}

// ============ STORAGE HELPERS ============
const _STORAGE_QUOTA = 5 * 1024 * 1024;
const _STORAGE_EVICTION_ORDER = ['egglogu_sync_snapshot', 'egglogu_bugs', 'egglogu_suggestions', 'egglogu_offline_tickets'];

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k); total += (k.length + v.length) * 2; }
    if (total > _STORAGE_QUOTA * 0.8) Bus.emit('toast', { msg: t('storage_warning'), type: 'error' });
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      for (const evictKey of _STORAGE_EVICTION_ORDER) {
        if (localStorage.getItem(evictKey)) {
          localStorage.removeItem(evictKey);
          try { localStorage.setItem(key, value); return true; } catch (_) {}
        }
      }
      Bus.emit('toast', { msg: t('storage_full'), type: 'error' });
      return false;
    }
    throw e;
  }
}

export function getStorageUsage() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k); total += (k.length + v.length) * 2; }
  return total;
}
