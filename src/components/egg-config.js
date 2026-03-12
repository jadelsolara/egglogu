// EGGlogU — Config Module Web Component
// Replaces renderConfig(), saveConfig(), saveAlertConfig(), addChecklistItem(),
// removeChecklistItem(), saveTaxConfig(), savePlanConfig(), renderProfileCard(),
// saveProfile(), showChangePinModal(), executeChangePin(), renderBillingCard(),
// showUserForm(), toggleEmailField(), saveUser(), requestUserActivation(),
// verifyOwnerForActivation(), activateWorkerDirect(), sendActivationConfirmation(),
// confirmUserActivation(), getNextBillingDate(), deactivateUser(), executeDeactivation(),
// checkBillingCycleDeactivations(), resendActivation(), reactivateUser(), removeUser(),
// loadBackupList(), doRestore(), toggleRolePerm(), resetPermsToDefault(),
// applyCustomPermissions(), renderAuditLog(), exportData(), importData(), resetData(),
// saveWeatherConfig(), saveMqttConfig(), testWeatherApi(), showGeoModal(), useGPS(),
// saveGeoLocation(), showReassignForm(), verifyReassignment(), executeReassignment()

import { Bus } from '../core/bus.js';
import { Store } from '../core/store.js';
import {
  sanitizeHTML, escapeAttr, genId, todayStr
} from '../core/utils.js';
import { t, getLang } from '../core/i18n.js';
import { apiService } from '../core/api.js';
import {
  hashPin, verifyPinHash, migratePinIfNeeded,
  isPinLocked, recordPinFailure, resetPinAttempts
} from '../core/security.js';
import {
  ROLE_PERMISSIONS, MODULE_GROUPS, getCurrentUser
} from '../core/permissions.js';
import {
  logAudit, listBackups, restoreBackup, getStorageUsage
} from '../core/helpers.js';
import { DataTable } from '../core/datatable.js';
import { showConfirm } from './egg-confirm.js';

/* ================================================================
   THEMES
   ================================================================ */
const THEMES = {
  blue:   { primary: '#1A3C6E', 'primary-light': '#4A7AB5', 'primary-dark': '#0E2240', 'sidebar-bg': '#0E2240', rgb: '26,60,110' },
  green:  { primary: '#2E7D32', 'primary-light': '#4CAF50', 'primary-dark': '#1B5E20', 'sidebar-bg': '#1B5E20', rgb: '46,125,50' },
  purple: { primary: '#6A1B9A', 'primary-light': '#AB47BC', 'primary-dark': '#4A148C', 'sidebar-bg': '#4A148C', rgb: '106,27,154' },
  black:  { primary: '#37474F', 'primary-light': '#607D8B', 'primary-dark': '#263238', 'sidebar-bg': '#263238', rgb: '55,71,79' },
  dark:   { primary: '#90CAF9', 'primary-light': '#42A5F5', 'primary-dark': '#1E1E1E', 'sidebar-bg': '#121212', rgb: '144,202,249' }
};

/* ================================================================
   ROLE_MAX_MODULES + DEFAULT_ROLE_PERMS (inline, not from core)
   ================================================================ */
const ROLE_MAX_MODULES = {
  superadmin: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','admin','config','soporte','superadmin'],
  owner: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','admin','config','soporte'],
  manager: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','soporte'],
  worker: ['dashboard','produccion','lotes','alimento','ambiente','operaciones','soporte'],
  vet: ['dashboard','sanidad','bioseguridad','lotes','ambiente','trazabilidad','planificacion','carencias','soporte']
};
const DEFAULT_ROLE_PERMS = JSON.parse(JSON.stringify(ROLE_PERMISSIONS));

/* ================================================================
   REASSIGNMENT HIERARCHY
   ================================================================ */
const REASSIGN_HIERARCHY = { owner: ['manager','vet','worker','viewer'], manager: ['vet','worker','viewer'] };
function canReassign(myRole, targetRole) {
  return REASSIGN_HIERARCHY[myRole] && REASSIGN_HIERARCHY[myRole].includes(targetRole);
}

/* ================================================================
   HELPERS
   ================================================================ */
function _safeSetItem(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* quota */ } }

function _applyTheme(name) {
  const th = THEMES[name] || THEMES.blue;
  const s = document.documentElement.style;
  s.setProperty('--primary', th.primary);
  s.setProperty('--primary-light', th['primary-light']);
  s.setProperty('--primary-dark', th['primary-dark']);
  s.setProperty('--sidebar-bg', th['sidebar-bg']);
  s.setProperty('--primary-hover', 'rgba(' + th.rgb + ',.04)');
  s.setProperty('--primary-ring', 'rgba(' + th.rgb + ',.15)');
  s.setProperty('--primary-fill', 'rgba(' + th.rgb + ',.1)');
  _safeSetItem('egglogu_theme', name);
}

function _applyFontScale(scale) {
  document.body.classList.remove('font-small', 'font-normal', 'font-large', 'font-xlarge');
  document.body.classList.add('font-' + scale);
}

function _applyDarkMode(on) {
  document.body.classList.toggle('dark-mode', on);
  if (on) {
    if (localStorage.getItem('egglogu_theme') !== 'dark') {
      _safeSetItem('egglogu_theme_prev', localStorage.getItem('egglogu_theme') || 'blue');
    }
    _applyTheme('dark');
  } else {
    const prev = localStorage.getItem('egglogu_theme_prev') || 'blue';
    _applyTheme(prev);
  }
}

function _nextBillingDate(cycle) {
  const d = new Date();
  if (cycle === 'monthly') { d.setMonth(d.getMonth() + 1); d.setDate(1); }
  else if (cycle === 'quarterly') { d.setMonth(d.getMonth() + 3); d.setDate(1); }
  else { d.setFullYear(d.getFullYear() + 1); d.setMonth(0); d.setDate(1); }
  return d.toISOString().split('T')[0];
}

function _showPinLockCountdown(errEl) {
  if (!errEl) return;
  const update = () => {
    const rem = Math.ceil(pinLockRemaining() / 1000);
    if (rem <= 0) { errEl.textContent = ''; errEl.style.display = 'none'; clearInterval(iv); return; }
    errEl.textContent = 'Too many attempts. Wait ' + rem + 's';
    errEl.style.display = 'block';
  };
  update();
  const iv = setInterval(update, 1000);
}

/* ================================================================
   COMPONENT
   ================================================================ */
class EggConfig extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._geoMap = null;
    this._geoMarker = null;
    this._pendingActivation = null;
    this._reassignTmp = null;
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('lang:changed', () => this.render())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  // ── Shortcut: query shadow DOM ──────────────────────────────
  _q(id) { return this.shadowRoot.querySelector('#' + id); }

  // ── Toast / Modal / Nav via Bus ─────────────────────────────
  _toast(msg, err) { Bus.emit('toast', { msg, type: err ? 'error' : 'success' }); }
  _openModal(title, body) { Bus.emit('modal:open', { title, body }); }
  _closeModal() { Bus.emit('modal:close'); }
  _nav(section) { Bus.emit('nav:request', { section }); }

  // ── Data helpers (Store) ────────────────────────────────────
  _load() { return Store.get(); }
  _save(D) { Store.set(D); }

  /* ================================================================
     STYLES
     ================================================================ */
  _baseStyle() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; font-weight: 500; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #dc3545); color: #fff; border: none; }
      .btn:hover { opacity: 0.85; }
      .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .badge-primary { background: #e3f2fd; color: #1565c0; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-warning { background: #fff8e1; color: #e65100; }
      .badge-danger { background: #ffebee; color: #c62828; }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .badge-secondary { background: #f5f5f5; color: #666; }
      .badge-default { background: #f5f5f5; color: #666; }
      .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      .form-group { margin-bottom: 12px; }
      .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--text-light, #888); }
      input, select { padding: 8px; border: 1px solid var(--border, #ddd); border-radius: var(--radius, 8px); font-size: 14px; width: 100%; box-sizing: border-box; }
      input:focus, select:focus { outline: none; border-color: var(--primary, #1A3C6E); }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
      .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; }
      .checklist-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border, #eee); }
      .stat-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border, #eee); }
      .stat-label { color: var(--text-light, #888); font-size: 13px; }
      .stat-value { font-weight: 600; font-size: 13px; }
      .modal-footer { display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end; }
      @media (max-width: 768px) {
        .form-row, .form-row-3 { grid-template-columns: 1fr; }
      }
      /* DataTable extras */
      .dt-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .dt-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .dt-search-input { padding: 6px 12px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); font-size: 13px; min-width: 180px; background: var(--bg, #fff); color: var(--text, #212121); }
      .dt-filter-select, .dt-filter-input, .dt-filter-date, .dt-filter-num { width: 100%; padding: 4px 6px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; box-sizing: border-box; background: var(--bg, #fff); color: var(--text, #212121); }
      .dt-filter-row td { padding: 4px 6px; }
      .dt-card-wrap { position: relative; }
      .dt-table-desktop { display: block; }
      .dt-mobile-cards { display: none; }
      .dt-row-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-bulk-bar { display: flex; align-items: center; justify-content: space-between; background: var(--primary-fill, rgba(74,124,89,.08)); padding: 8px 12px; border-radius: var(--radius, 8px); margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
      .dt-bulk-count { font-weight: 600; font-size: 13px; }
      .dt-bulk-actions { display: flex; gap: 6px; }
      .dt-pagination { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; flex-wrap: wrap; gap: 8px; font-size: 13px; }
      .dt-page-buttons { display: flex; gap: 4px; }
      .dt-page-size { padding: 4px 8px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; background: var(--bg, #fff); }
      .dt-footer-info { font-size: 13px; color: var(--text-light, #757575); padding: 8px 0; }
      .dt-sortable { cursor: pointer; user-select: none; }
      .dt-sorted { color: var(--primary, #4a7c59); }
      .dt-col-picker-wrap { position: relative; }
      .dt-column-picker { position: absolute; right: 0; top: 100%; background: var(--bg, #fff); border: 1px solid var(--border, #e0e0e0); border-radius: 8px; padding: 8px; z-index: 100; min-width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
      .dt-col-option { display: block; padding: 4px 8px; font-size: 13px; cursor: pointer; }
      .dt-card { background: var(--bg, #fff); border-radius: 8px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .dt-card-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-card-title { font-weight: 700; margin-bottom: 6px; }
      .dt-card-field { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
      .dt-card-label { color: var(--text-light, #757575); }
      .dt-card-actions { margin-top: 8px; display: flex; gap: 6px; }
      .dt-card-check { margin-bottom: 6px; }
      .dt-th-check, .dt-td-check { width: 36px; text-align: center; }
      @media (max-width: 768px) {
        .dt-table-desktop { display: none; }
        .dt-mobile-cards { display: block; }
      }
    </style>`;
  }

  /* ================================================================
     MAIN RENDER
     ================================================================ */
  render() {
    const D = this._load();
    const user = getCurrentUser();
    let h = this._baseStyle();

    h += `<div class="page-header"><h2>${t('cfg_title')}</h2></div>`;

    // Profile card
    h += this._renderProfileCard(D, user);

    // Billing card
    h += this._renderBillingCard(D, user);

    // Theme picker
    h += this._renderThemePicker();

    // Accessibility
    h += this._renderAccessibility(D);

    // Farm info
    h += this._renderFarmInfo(D);

    // Geolocation
    h += this._renderGeoCard(D);

    // Weather API
    h += this._renderWeatherCard(D);

    // MQTT / IoT
    h += this._renderMqttCard(D);

    // Alert thresholds
    h += this._renderAlertCard(D);

    // Default checklist
    h += this._renderChecklistCard(D);

    // Tax & Depreciation
    h += this._renderTaxCard(D);

    // User Management
    h += this._renderUserManagement(D, user);

    // Role Permissions
    if (user && user.role === 'owner') {
      h += this._renderRolePerms(D);
    }

    // Auto-Backup
    h += this._renderBackupCard();

    // Storage Usage
    h += this._renderStorageCard();

    // Data management
    h += this._renderDataCard();

    // Audit log
    h += this._renderAuditCard();

    this.shadowRoot.innerHTML = h;

    // Async loads
    this._loadBackupList();
    this._renderAuditLog();

    // Bind events
    this._bindEvents();
  }

  /* ================================================================
     PROFILE CARD
     ================================================================ */
  _renderProfileCard(D, user) {
    if (!user) return '';
    const me = D.users.find(u => u.id === user.id);
    if (!me) return '';
    const roleBadge = { owner: 'primary', manager: 'secondary', vet: 'info', worker: 'warning', viewer: 'default' };
    const badge = roleBadge[me.role] || 'default';
    const memberSince = me.created ? new Date(me.created).toLocaleDateString() : (me.activatedAt ? new Date(me.activatedAt).toLocaleDateString() : '--');
    return `<div class="card">
<h3>${t('perfil_title')}</h3>
<p style="color:var(--text-secondary);margin-bottom:1rem">${t('perfil_subtitle')}</p>
<div class="form-row">
<div class="form-group"><label>${t('perfil_name')}</label>
<input id="profile-name" value="${escapeAttr(me.name || '')}" maxlength="200"></div>
<div class="form-group"><label>${t('email')}</label>
<input value="${escapeAttr(me.email || '')}" disabled style="opacity:.6;cursor:not-allowed"></div>
</div>
<div class="form-row">
<div class="form-group"><label>${t('cfg_role')}</label>
<span class="badge badge-${badge}" style="font-size:.85rem;padding:.3rem .8rem">${me.role.toUpperCase()}</span></div>
<div class="form-group"><label>${t('perfil_member_since')}</label>
<span style="font-size:.95rem">${memberSince}</span></div>
</div>
<div style="display:flex;gap:10px;margin-top:1rem;flex-wrap:wrap">
<button class="btn btn-primary btn-sm" data-action="save-profile">${t('save')}</button>
<button class="btn btn-secondary btn-sm" data-action="change-pin">${t('perfil_change_pin')}</button>
</div></div>`;
  }

  /* ================================================================
     BILLING CARD
     ================================================================ */
  _renderBillingCard(D, user) {
    if (!user || !['owner','manager','superadmin'].includes(user.role)) return '';
    const plan = D.settings.plan || {};
    const tier = (plan.tier || 'free').toUpperCase();
    const status = plan.status || 'inactive';
    const interval = plan.interval || 'month';
    const periodEnd = plan.current_period_end ? new Date(plan.current_period_end).toLocaleDateString() : '--';
    const isEs = getLang().startsWith('es');
    const isOwner = user.role === 'owner' || user.role === 'superadmin';
    const statusColor = status === 'active' ? '#16a34a' : status === 'trialing' ? '#2563eb' : status === 'cancelled' ? '#dc2626' : '#6b7280';
    const statusLabel = status === 'active' ? (isEs ? 'Activo' : 'Active') : status === 'trialing' ? (isEs ? 'Prueba' : 'Trial') : status === 'cancelled' ? (isEs ? 'Cancelado' : 'Cancelled') : (isEs ? 'Inactivo' : 'Inactive');
    let h = `<div class="card">
<h3>${t('billing_current_plan')}</h3>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
<span style="font-size:1.4em;font-weight:700">${tier}</span>
<span style="background:${statusColor};color:#fff;padding:2px 10px;border-radius:12px;font-size:.8em;font-weight:600">${statusLabel}</span>
<span style="color:var(--text-muted);font-size:.85em">${interval === 'year' ? (isEs ? 'Anual' : 'Annual') : (isEs ? 'Mensual' : 'Monthly')}</span>
</div>`;
    if (plan.current_period_end) {
      h += `<p style="color:var(--text-secondary);font-size:.9em;margin-bottom:16px">${isEs ? 'Proximo cobro' : 'Next charge'}: <strong>${periodEnd}</strong></p>`;
    }
    h += `<div style="display:flex;gap:10px;flex-wrap:wrap">
<button class="btn btn-primary btn-sm" data-action="upgrade">${t('billing_change_plan')}</button>
<button class="btn btn-secondary btn-sm" data-action="billing-portal">${t('billing_manage_payments')}</button>`;
    if (status === 'active' || status === 'trialing') {
      h += `<button class="btn btn-sm" style="background:#dc2626;color:#fff" data-action="cancel-sub">${t('billing_cancel_sub')}</button>`;
    }
    if (isOwner) {
      h += `<button class="btn btn-sm" style="background:#7f1d1d;color:#fff" data-action="delete-account">${t('billing_delete_account')}</button>`;
    }
    h += '</div></div>';
    return h;
  }

  /* ================================================================
     THEME PICKER
     ================================================================ */
  _renderThemePicker() {
    const curTheme = localStorage.getItem('egglogu_theme') || 'blue';
    let h = '<div class="card"><h3>' + t('cfg_theme') + '</h3><div style="display:flex;gap:12px;flex-wrap:wrap">';
    Object.keys(THEMES).forEach(name => {
      const th = THEMES[name];
      const active = curTheme === name;
      h += `<button data-action="theme" data-theme="${name}" style="width:90px;height:64px;border-radius:var(--radius);border:${active ? '3px solid var(--secondary)' : '2px solid var(--border)'};background:${th['sidebar-bg']};color:#fff;cursor:pointer;font-weight:${active ? '700' : '400'};font-size:13px;transition:all .2s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px"><span style="width:24px;height:24px;border-radius:50%;background:${th.primary};border:2px solid rgba(255,255,255,.5)"></span>${t('cfg_theme_' + name)}</button>`;
    });
    h += '</div></div>';
    return h;
  }

  /* ================================================================
     ACCESSIBILITY
     ================================================================ */
  _renderAccessibility(D) {
    const curScale = D.settings.fontScale || 'normal';
    let h = `<div class="card"><h3>${t('cfg_accessibility')}</h3>
<div class="form-group"><label>${t('cfg_font_size')}</label>
<div style="display:flex;gap:8px;flex-wrap:wrap">`;
    ['small','normal','large','xlarge'].forEach(s => {
      h += `<button class="btn btn-sm${curScale === s ? ' btn-primary' : ' btn-secondary'}" data-action="font-scale" data-scale="${s}">${t('cfg_font_' + s)}</button>`;
    });
    h += `</div></div>
<div class="form-group" style="margin-top:12px"><label>${t('cfg_dark_mode')}</label>
<button class="btn btn-sm${D.settings.darkMode ? ' btn-primary' : ' btn-secondary'}" data-action="dark-mode">${D.settings.darkMode ? 'ON' : 'OFF'}</button>
</div></div>`;
    return h;
  }

  /* ================================================================
     FARM INFO
     ================================================================ */
  _renderFarmInfo(D) {
    return `<div class="card"><h3>${t('cfg_farm')}</h3>
<div class="form-row"><div class="form-group"><label>${t('cfg_farm_name')}</label><input id="cfg-name" value="${escapeAttr(D.farm.name || '')}"></div>
<div class="form-group"><label>${t('cfg_location')}</label><input id="cfg-loc" value="${escapeAttr(D.farm.location || '')}"></div></div>
<div class="form-row"><div class="form-group"><label>${t('cfg_capacity')}</label><input type="number" id="cfg-cap" value="${D.farm.capacity || ''}" min="0"></div>
<div class="form-group"><label>${t('cfg_currency')}</label><input id="cfg-cur" value="${escapeAttr(D.farm.currency || '$')}" maxlength="5"></div></div>
<button class="btn btn-primary" data-action="save-farm">${t('save')}</button></div>`;
  }

  /* ================================================================
     GEOLOCATION
     ================================================================ */
  _renderGeoCard(D) {
    return `<div class="card"><h3>${t('geo_set_location')}</h3>
<p style="color:var(--text-light);margin-bottom:8px">${D.farm.lat ? t('geo_lat') + ': ' + D.farm.lat + ' | ' + t('geo_lng') + ': ' + D.farm.lng : t('geo_click_map')}</p>
<button class="btn btn-secondary" data-action="geo-modal">${t('geo_set_location')}</button></div>`;
  }

  /* ================================================================
     WEATHER API
     ================================================================ */
  _renderWeatherCard(D) {
    return `<div class="card"><h3>${t('weather_title')} -- OpenWeatherMap (${t('optional') || 'Optional'})</h3>
<p style="color:var(--text-light);margin-bottom:8px;font-size:13px">Open-Meteo provides weather data by default. Add an OpenWeatherMap key below only if you prefer OWM.</p>
<div class="form-row"><div class="form-group"><label>API Key (OWM)</label><input id="cfg-owm" value="${escapeAttr(D.farm.owmApiKey || '')}" placeholder="Optional"></div>
<div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-secondary" data-action="test-weather">${t('weather_test')}</button></div></div>
<button class="btn btn-primary" data-action="save-weather">${t('save')}</button></div>`;
  }

  /* ================================================================
     MQTT / IoT
     ================================================================ */
  _renderMqttCard(D) {
    return `<div class="card"><h3>${t('iot_title')} (MQTT)</h3>
<div class="form-group"><label>${t('iot_broker')} (wss://)</label><input id="cfg-mqtt-broker" value="${escapeAttr(D.farm.mqttBroker || '')}" placeholder="wss://broker.example.com:8084/mqtt"></div>
<div class="form-row"><div class="form-group"><label>${t('cfg_farm_name')} (user)</label><input id="cfg-mqtt-user" value="${escapeAttr(D.farm.mqttUser || '')}"></div>
<div class="form-group"><label>Password</label><input type="password" id="cfg-mqtt-pass" value="${escapeAttr(D.farm.mqttPass || '')}"></div></div>
<div class="form-group"><label>Topic Prefix</label><input id="cfg-mqtt-prefix" value="${escapeAttr(D.farm.mqttTopicPrefix || 'egglogu/')}"></div>
<button class="btn btn-primary" data-action="save-mqtt">${t('save')}</button></div>`;
  }

  /* ================================================================
     ALERT THRESHOLDS
     ================================================================ */
  _renderAlertCard(D) {
    return `<div class="card"><h3>${t('cfg_alerts')}</h3>
<div class="form-row-3"><div class="form-group"><label>${t('cfg_min_feed')}</label><input type="number" id="cfg-minfeed" value="${D.settings.minFeedStock || 50}" min="0"></div>
<div class="form-group"><label>${t('cfg_max_mortality')}</label><input type="number" id="cfg-maxmort" value="${D.settings.maxMortality || 5}" min="0" step="0.5"></div>
<div class="form-group"><label>${t('cfg_alert_days')}</label><input type="number" id="cfg-alertdays" value="${D.settings.alertDaysBefore || 3}" min="1"></div></div>
<button class="btn btn-primary" data-action="save-alerts">${t('save')}</button></div>`;
  }

  /* ================================================================
     DEFAULT CHECKLIST
     ================================================================ */
  _renderChecklistCard(D) {
    let h = `<div class="card"><h3>${t('cfg_checklist')}</h3><p style="color:var(--text-light);font-size:13px;margin-bottom:12px">${t('cfg_checklist_items')}</p>`;
    (D.settings.defaultChecklist || []).forEach((task, i) => {
      h += `<div class="checklist-item"><span>${t(task)}</span><button class="btn btn-danger btn-sm" style="margin-left:auto" data-action="remove-checklist" data-idx="${i}">X</button></div>`;
    });
    h += `<div style="margin-top:12px;display:flex;gap:8px"><input id="cfg-newtask" placeholder="${t('ops_task')}" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius)">
<button class="btn btn-primary btn-sm" data-action="add-checklist">${t('add')}</button></div></div>`;
    return h;
  }

  /* ================================================================
     TAX & DEPRECIATION
     ================================================================ */
  _renderTaxCard(D) {
    return `<div class="card"><h3>${t('cfg_tax') || 'Tax & Depreciation'}</h3>
<div class="form-row-3"><div class="form-group"><label>${t('cfg_tax_rate') || 'Tax Rate (%)'}</label><input type="number" id="cfg-taxrate" value="${D.settings.taxRate || 0}" min="0" max="100" step="0.5"></div>
<div class="form-group"><label>${t('cfg_dep_years') || 'Depreciation (years)'}</label><input type="number" id="cfg-depyears" value="${D.settings.depreciationYears || 5}" min="1" max="50"></div>
<div class="form-group"><label>${t('cfg_asset_value') || 'Total Asset Value'}</label><input type="number" id="cfg-assetval" value="${D.settings.assetValue || 0}" min="0"></div></div>
<button class="btn btn-primary" data-action="save-tax">${t('save')}</button></div>`;
  }

  /* ================================================================
     USER MANAGEMENT (4-Layer Security)
     ================================================================ */
  _renderUserManagement(D, user) {
    const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
    const activeUsers = D.users.filter(u => u.status === 'active').length;
    const pendingUsers = D.users.filter(u => u.status === 'pending').length;
    const extraCount = Math.max(0, activeUsers - plan.includedUsers);

    let h = `<div class="card"><h3>${t('cfg_users') || 'User Management'}</h3>`;

    // Owner email & plan settings
    h += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:12px">
<div class="form-row"><div class="form-group"><label>Email del Dueno (para confirmaciones)</label>
<input type="email" id="cfg-owner-email" value="${escapeAttr(D.settings.ownerEmail || '')}" placeholder="dueno@correo.com" style="font-size:13px">
<span style="font-size:10px;color:var(--text-light)">Las activaciones se confirman desde este correo</span></div>
<div class="form-group"><label>Usuarios incluidos en plan</label>
<input type="number" id="cfg-plan-users" value="${(D.settings.plan?.includedUsers) || 3}" min="1" max="50" style="font-size:13px"></div>
<div class="form-group"><label>Costo por usuario extra (${(D.settings.plan?.currency) || 'USD'})</label>
<input type="number" id="cfg-plan-extra-cost" value="${(D.settings.plan?.extraUserCost) || 5}" min="0" step="0.5" style="font-size:13px"></div></div>
<div class="form-row"><div class="form-group"><label>Ciclo de facturacion</label>
<select id="cfg-plan-cycle" style="font-size:13px">
<option value="monthly"${(D.settings.plan?.billingCycle || 'monthly') === 'monthly' ? ' selected' : ''}>Mensual</option>
<option value="quarterly"${D.settings.plan?.billingCycle === 'quarterly' ? ' selected' : ''}>Trimestral</option>
<option value="yearly"${D.settings.plan?.billingCycle === 'yearly' ? ' selected' : ''}>Anual</option></select></div>
<div class="form-group"><label>Moneda</label>
<select id="cfg-plan-currency" style="font-size:13px">
<option value="USD"${(D.settings.plan?.currency || 'USD') === 'USD' ? ' selected' : ''}>USD</option>
<option value="CLP"${D.settings.plan?.currency === 'CLP' ? ' selected' : ''}>CLP</option>
<option value="EUR"${D.settings.plan?.currency === 'EUR' ? ' selected' : ''}>EUR</option>
<option value="MXN"${D.settings.plan?.currency === 'MXN' ? ' selected' : ''}>MXN</option></select></div></div>
<button class="btn btn-primary btn-sm" data-action="save-plan">Guardar Config Plan</button></div>`;

    // Add user button + counts
    h += `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
<button class="btn btn-primary btn-sm" data-action="add-user">${t('cfg_add_user') || '+ Agregar Usuario'}</button>
<div style="font-size:13px"><strong>Activos:</strong> ${activeUsers}/${plan.includedUsers}${pendingUsers ? ' | <span style="color:var(--warning)">' + pendingUsers + ' pendientes</span>' : ''}${extraCount > 0 ? ' | <span style="color:var(--warning)">+' + extraCount + ' extras (' + plan.currency + ' ' + ((extraCount * plan.extraUserCost).toFixed(2)) + '/' + plan.billingCycle + ')</span>' : ''}</div>
</div>`;

    // Security notice
    h += `<div style="background:rgba(33,150,243,.08);border:1px solid rgba(33,150,243,.2);border-radius:var(--radius);padding:10px;margin-bottom:12px;font-size:11px;color:var(--text-light)">
<strong>4 Capas de Seguridad:</strong> Re-autenticacion PIN | Confirmacion por email | Cobro proporcional | Auto-desactivacion al fin del ciclo</div>`;

    // Users table
    if (D.users.length) {
      h += '<div class="table-wrap"><table><thead><tr><th>' + t('name') + '</th><th>Email / ID</th><th>' + (t('cfg_role') || 'Role') + '</th><th>Estado</th><th>' + t('actions') + '</th></tr></thead><tbody>';
      D.users.forEach(u => {
        const sb = u.status === 'active' ? '<span class="badge badge-success">Activo</span>' : u.status === 'pending' ? '<span class="badge badge-warning">Pendiente</span>' : u.status === 'expired' ? '<span class="badge badge-danger">Expirado</span>' : '<span class="badge badge-secondary">Inactivo</span>';
        const billingInfo = u.isExtra && u.nextBillingDate ? '<br><span style="font-size:10px;color:var(--text-light)">Prox. ciclo: ' + u.nextBillingDate + '</span>' : '';
        const chargeInfo = u.firstCharge ? '<br><span style="font-size:10px;color:var(--warning)">Cargo: ' + (D.settings.plan?.currency || 'USD') + ' ' + u.firstCharge.toFixed(2) + '</span>' : '';
        const deactInfo = u.deactivatedAt ? '<br><span style="font-size:10px;color:var(--text-light)">Desact: ' + u.deactivatedAt + '</span>' : '';
        h += `<tr><td><strong>${sanitizeHTML(u.name)}</strong>${u.isExtra ? '<br><span style="font-size:10px;color:var(--warning)">Usuario adicional</span>' : ''}</td>
<td style="font-size:12px">${u.role === 'worker' ? (u.workerId ? '<code>' + sanitizeHTML(u.workerId) + '</code>' : '--') : sanitizeHTML(u.email || '--')}</td>
<td><span class="badge badge-${u.role === 'owner' ? 'success' : u.role === 'manager' ? 'info' : u.role === 'vet' ? 'warning' : 'secondary'}">${u.role}</span></td>
<td>${sb}${u.activatedAt ? '<br><span style="font-size:10px;color:var(--text-light)">' + u.activatedAt + '</span>' : ''}${billingInfo}${chargeInfo}${deactInfo}</td>
<td><div class="btn-group">${u.status === 'active' || u.status === 'pending' ? '<button class="btn btn-secondary btn-sm" data-action="edit-user" data-id="' + escapeAttr(u.id) + '">' + t('edit') + '</button>' : ''}
${u.status === 'active' ? '<button class="btn btn-danger btn-sm" data-action="deactivate-user" data-id="' + escapeAttr(u.id) + '">Desactivar</button>' : ''}
${u.status === 'active' && u.id !== user.id && canReassign(user.role, u.role) ? '<button class="btn btn-sm" style="background:#607d8b;font-size:0.72rem;padding:3px 8px" data-action="reassign-user" data-id="' + escapeAttr(u.id) + '">' + t('reassign_btn') + '</button>' : ''}
${u.status === 'pending' && u.activationToken ? '<button class="btn btn-primary btn-sm" data-action="resend-activation" data-id="' + escapeAttr(u.id) + '">Reenviar</button>' : ''}
${u.status === 'inactive' || u.status === 'expired' ? '<button class="btn btn-primary btn-sm" data-action="reactivate-user" data-id="' + escapeAttr(u.id) + '">Reactivar</button><button class="btn btn-danger btn-sm" data-action="remove-user" data-id="' + escapeAttr(u.id) + '">Eliminar</button>' : ''}</div></td></tr>`;
      });
      h += '</tbody></table></div>';
    } else {
      h += `<p style="color:var(--text-light)">${t('cfg_no_users') || 'No users configured. App runs without authentication.'}</p>`;
    }
    h += '</div>';
    return h;
  }

  /* ================================================================
     ROLE PERMISSIONS
     ================================================================ */
  _renderRolePerms(D) {
    const groupNames = { production: 'Produccion', health: 'Salud', commercial: 'Comercial', management: 'Gestion', system: 'Sistema' };
    const allMods = ['produccion','lotes','alimento','ambiente','sanidad','bioseguridad','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','reportes','automatizacion','config'];
    const modGroup = {};
    Object.entries(MODULE_GROUPS).forEach(([g, ms]) => ms.forEach(m => modGroup[m] = g));
    const customPerms = D.settings.customPermissions || {};
    const navKeyMap = { produccion: 'production', lotes: 'flocks', alimento: 'feed', ambiente: 'environment', sanidad: 'health', bioseguridad: 'biosecurity', clientes: 'clients', inventario: 'inventory', finanzas: 'finances', analisis: 'analysis', operaciones: 'operations', trazabilidad: 'traceability', planificacion: 'planning', reportes: 'reports', automatizacion: 'automation', config: 'config' };

    let h = `<div class="card"><h3>Permisos por Rol</h3><p style="color:var(--text-light);font-size:13px;margin-bottom:12px">Personaliza que modulos ve cada rol. Dashboard siempre visible.</p>`;
    h += '<div class="table-wrap"><table id="perms-table"><thead><tr><th>Modulo</th><th>Grupo</th><th>Manager</th><th>Worker</th><th>Vet</th></tr></thead><tbody>';
    allMods.forEach(m => {
      const grp = modGroup[m] || '?';
      const label = t('nav_' + (navKeyMap[m] || m)) || m;
      h += `<tr><td>${label}</td><td><span class="badge badge-secondary" style="font-size:10px">${groupNames[grp] || grp}</span></td>`;
      ['manager','worker','vet'].forEach(role => {
        const base = ROLE_PERMISSIONS[role] || [];
        const custom = customPerms[role];
        const has = custom ? custom.includes(m) : base.includes(m);
        const allowed = (ROLE_MAX_MODULES[role] || []).includes(m);
        h += `<td style="text-align:center">${allowed ? `<input type="checkbox" data-action="toggle-perm" data-role="${role}" data-mod="${m}" ${has ? 'checked' : ''}>` : '<span style="color:var(--text-light);font-size:11px">--</span>'}</td>`;
      });
      h += '</tr>';
    });
    h += `</tbody></table></div><div style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-action="reset-perms">Restaurar Defaults</button></div></div>`;
    return h;
  }

  /* ================================================================
     BACKUP CARD
     ================================================================ */
  _renderBackupCard() {
    return `<div class="card"><h3>${t('cfg_backups') || 'Auto-Backup'}</h3>
<div id="backup-list"><p style="color:var(--text-light)">${t('cfg_loading') || 'Loading...'}</p></div></div>`;
  }

  /* ================================================================
     STORAGE USAGE
     ================================================================ */
  _renderStorageCard() {
    const storageUsed = getStorageUsage();
    const storageMax = 5 * 1024 * 1024;
    const storagePct = Math.min(100, (storageUsed / storageMax) * 100);
    return `<div class="card"><h3>${t('cfg_storage') || 'Storage Usage'}</h3>
<div style="background:var(--border);border-radius:8px;height:24px;overflow:hidden;margin-bottom:8px">
<div style="background:${storagePct > 80 ? 'var(--danger)' : storagePct > 60 ? 'var(--warning)' : 'var(--success)'};height:100%;width:${storagePct}%;border-radius:8px;transition:width .3s"></div></div>
<p style="color:var(--text-light);font-size:13px">${(storageUsed / 1024).toFixed(1)} KB / ${(storageMax / 1024).toFixed(0)} KB (${storagePct.toFixed(1)}%)</p></div>`;
  }

  /* ================================================================
     DATA MANAGEMENT
     ================================================================ */
  _renderDataCard() {
    const D = this._load();
    const totalRecords = (D.flocks||[]).length + (D.dailyProduction||[]).length + (D.vaccines||[]).length
      + (D.medications||[]).length + (D.outbreaks||[]).length + (D.feed?.purchases||[]).length
      + (D.feed?.consumption||[]).length + (D.clients||[]).length + (D.finances?.income||[]).length
      + (D.finances?.expenses||[]).length + (D.inventory||[]).length + (D.environment||[]).length
      + (D.checklist||[]).length + (D.logbook||[]).length + (D.personnel||[]).length
      + (D.biosecurity?.visitors||[]).length + (D.traceability?.batches||[]).length
      + (D.productionPlans||[]).length + (D.auditLog||[]).length;
    return `<div class="card"><h3>${t('cfg_data')}</h3>
<p style="color:var(--text-light);font-size:13px;margin-bottom:12px">${t('cfg_data_desc') || 'Export all records to a file or import from a previous backup. Use this to migrate data between accounts or devices.'}</p>
<p style="font-size:13px;margin-bottom:12px"><strong>${t('cfg_total_records') || 'Total records'}:</strong> ${totalRecords.toLocaleString()}</p>
<div class="btn-group" style="flex-wrap:wrap;gap:8px">
<button class="btn btn-secondary" data-action="export-data">⬇ ${t('cfg_export')}</button>
<button class="btn btn-secondary" data-action="import-trigger">⬆ ${t('cfg_import')}</button>
<input type="file" id="cfg-import-file" accept=".json" style="display:none">
<button class="btn btn-danger" data-action="reset-data">${t('cfg_reset')}</button>
</div>
<div style="margin-top:12px"><button class="btn btn-primary" data-action="smart-import" style="width:100%;padding:10px">📥 ${t('imp_trigger_btn')}</button></div>
<div id="import-preview" style="display:none;margin-top:16px;padding:12px;background:var(--bg-alt,#f8f9fa);border-radius:var(--radius);border:1px solid var(--border)"></div></div>`;
  }

  /* ================================================================
     AUDIT LOG
     ================================================================ */
  _renderAuditCard() {
    return `<div class="card"><h3>${t('cfg_audit') || 'Audit Log'}</h3>
<div class="filter-bar" style="margin-bottom:12px"><input type="date" id="audit-from"><input type="date" id="audit-to">
<input id="audit-search" placeholder="${t('search') || 'Search...'}" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius)"></div>
<div id="audit-log-table"></div></div>`;
  }

  /* Stats card moved to Reports module (egg-reportes.js) */

  /* ================================================================
     EVENT BINDING
     ================================================================ */
  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      switch (action) {
        case 'save-profile': this._saveProfile(); break;
        case 'change-pin': this._showChangePinModal(); break;
        case 'upgrade': Bus.emit('billing:upgrade'); break;
        case 'billing-portal': Bus.emit('billing:portal'); break;
        case 'cancel-sub': Bus.emit('billing:cancel'); break;
        case 'delete-account': Bus.emit('billing:delete'); break;
        case 'theme': _applyTheme(btn.dataset.theme); this.render(); break;
        case 'font-scale': {
          const s = btn.dataset.scale;
          _applyFontScale(s);
          const D = this._load(); D.settings.fontScale = s; this._save(D);
          this.render(); break;
        }
        case 'dark-mode': {
          const D = this._load(); D.settings.darkMode = !D.settings.darkMode; this._save(D);
          _applyDarkMode(D.settings.darkMode); this.render(); break;
        }
        case 'save-farm': this._saveFarmConfig(); break;
        case 'geo-modal': this._showGeoModal(); break;
        case 'test-weather': this._testWeatherApi(); break;
        case 'save-weather': this._saveWeatherConfig(); break;
        case 'save-mqtt': this._saveMqttConfig(); break;
        case 'save-alerts': this._saveAlertConfig(); break;
        case 'add-checklist': this._addChecklistItem(); break;
        case 'remove-checklist': this._removeChecklistItem(parseInt(btn.dataset.idx)); break;
        case 'save-tax': this._saveTaxConfig(); break;
        case 'save-plan': this._savePlanConfig(); break;
        case 'add-user': this._showUserForm(); break;
        case 'edit-user': this._showUserForm(btn.dataset.id); break;
        case 'deactivate-user': this._deactivateUser(btn.dataset.id); break;
        case 'reassign-user': this._showReassignForm(btn.dataset.id); break;
        case 'resend-activation': this._resendActivation(btn.dataset.id); break;
        case 'reactivate-user': this._reactivateUser(btn.dataset.id); break;
        case 'remove-user': this._removeUser(btn.dataset.id); break;
        case 'toggle-perm': this._toggleRolePerm(btn); break;
        case 'reset-perms': this._resetPermsToDefault(); break;
        case 'export-data': this._exportData(); break;
        case 'smart-import': Bus.emit('show:data-import'); break;
        case 'full-backup': this._fullBackup(); break;
        case 'import-trigger': { const f = this._q('cfg-import-file'); if (f) f.click(); break; }
        case 'reset-data': this._resetData(); break;
      }
    });

    // Change events for audit filters
    root.addEventListener('input', (e) => {
      if (e.target.id === 'audit-from' || e.target.id === 'audit-to' || e.target.id === 'audit-search') {
        this._renderAuditLog();
      }
    });

    // File import handler
    const fileInput = this._q('cfg-import-file');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this._importData(e));
    }
  }

  /* ================================================================
     ACTION: Save Profile
     ================================================================ */
  async _saveProfile() {
    const nameInput = this._q('profile-name');
    if (!nameInput) return;
    const newName = nameInput.value.trim();
    if (!newName) { this._toast(t('required'), true); return; }
    const D = this._load();
    const user = getCurrentUser();
    const me = D.users.find(u => u.id === user.id);
    if (!me) return;
    const oldName = me.name;
    me.name = newName;
    user.name = newName;
    this._save(D);
    logAudit('profile_update', 'config', 'Name updated', { name: oldName }, { name: newName });
    if (apiService.isLoggedIn()) {
      try { await apiService.updateProfile({ full_name: newName }); } catch (e) { console.warn('Profile sync failed:', e); }
    }
    this._toast(t('perfil_profile_updated'));
  }

  /* ================================================================
     ACTION: Change PIN
     ================================================================ */
  _showChangePinModal() {
    if (isPinLocked()) { this._toast(t('pin_invalid'), true); return; }
    this._openModal(t('perfil_change_pin'), `
<div class="form-group"><label>${t('perfil_current_pin')}</label>
<input type="password" id="pin-current" maxlength="8" inputmode="numeric" autocomplete="off"></div>
<div class="form-group"><label>${t('perfil_new_pin')}</label>
<input type="password" id="pin-new" maxlength="8" inputmode="numeric" autocomplete="off"></div>
<div class="form-group"><label>${t('perfil_confirm_pin')}</label>
<input type="password" id="pin-confirm" maxlength="8" inputmode="numeric" autocomplete="off"></div>
<div id="pin-change-err" style="color:var(--red);font-size:.85rem;min-height:1.2rem;margin-top:.5rem"></div>
<div style="display:flex;gap:10px;margin-top:1rem">
<button class="btn btn-primary" data-action="exec-change-pin">${t('save')}</button>
<button class="btn btn-secondary" data-action="close-modal">${t('cancel')}</button></div>`);
    // Listen for modal actions
    const unsub = Bus.on('modal:action', (e) => {
      if (e === 'exec-change-pin') { this._executeChangePin(); unsub(); }
      if (e === 'close-modal') { this._closeModal(); unsub(); }
    });
  }

  async _executeChangePin() {
    const current = document.getElementById('pin-current')?.value || '';
    const newPin = document.getElementById('pin-new')?.value || '';
    const confirm = document.getElementById('pin-confirm')?.value || '';
    const errEl = document.getElementById('pin-change-err');
    if (!current || !newPin || !confirm) { if (errEl) errEl.textContent = t('required'); return; }
    if (newPin !== confirm) { if (errEl) errEl.textContent = t('perfil_pin_mismatch'); return; }
    if (newPin.length < 4) { if (errEl) errEl.textContent = t('min_length') + ': 4'; return; }
    const D = this._load();
    const user = getCurrentUser();
    const me = D.users.find(u => u.id === user.id);
    if (!me) { if (errEl) errEl.textContent = t('error_unexpected'); return; }
    const valid = await verifyPinHash(current, me.pinHash, me.pinSalt);
    if (!valid) { recordPinFailure(); if (isPinLocked()) { _showPinLockCountdown(errEl); } else { if (errEl) errEl.textContent = t('perfil_wrong_pin'); } return; }
    resetPinAttempts();
    const { hash, salt } = await hashPin(newPin);
    me.pinHash = hash; me.pinSalt = salt;
    delete me.pin;
    this._save(D);
    logAudit('pin_change', 'config', 'PIN changed for ' + me.name, null, null);
    this._closeModal();
    this._toast(t('perfil_pin_changed'));
  }

  /* ================================================================
     ACTION: Save Farm Config
     ================================================================ */
  _saveFarmConfig() {
    const D = this._load();
    D.farm.name = (this._q('cfg-name')?.value || '');
    D.farm.location = (this._q('cfg-loc')?.value || '');
    D.farm.capacity = parseInt(this._q('cfg-cap')?.value) || 0;
    D.farm.currency = (this._q('cfg-cur')?.value || '$');
    this._save(D);
    this._toast(t('cfg_saved'));
  }

  /* ================================================================
     ACTION: Save Alert Config
     ================================================================ */
  _saveAlertConfig() {
    const D = this._load();
    D.settings.minFeedStock = parseFloat(this._q('cfg-minfeed')?.value) || 50;
    D.settings.maxMortality = parseFloat(this._q('cfg-maxmort')?.value) || 5;
    D.settings.alertDaysBefore = parseInt(this._q('cfg-alertdays')?.value) || 3;
    this._save(D);
    this._toast(t('cfg_saved'));
  }

  /* ================================================================
     ACTION: Checklist
     ================================================================ */
  _addChecklistItem() {
    const v = this._q('cfg-newtask')?.value;
    if (!v) return;
    const D = this._load();
    if (!D.settings.defaultChecklist) D.settings.defaultChecklist = [];
    D.settings.defaultChecklist.push(v);
    this._save(D);
    this.render();
  }

  _removeChecklistItem(i) {
    const D = this._load();
    D.settings.defaultChecklist.splice(i, 1);
    this._save(D);
    this.render();
  }

  /* ================================================================
     ACTION: Save Tax Config
     ================================================================ */
  _saveTaxConfig() {
    const D = this._load();
    D.settings.taxRate = parseFloat(this._q('cfg-taxrate')?.value) || 0;
    D.settings.depreciationYears = parseInt(this._q('cfg-depyears')?.value) || 5;
    D.settings.assetValue = parseFloat(this._q('cfg-assetval')?.value) || 0;
    logAudit('update', 'config', 'Tax/Depreciation settings updated', null, { taxRate: D.settings.taxRate, depreciationYears: D.settings.depreciationYears, assetValue: D.settings.assetValue });
    this._save(D);
    this._toast(t('cfg_saved'));
  }

  /* ================================================================
     ACTION: Save Plan Config
     ================================================================ */
  _savePlanConfig() {
    const D = this._load();
    const before = JSON.parse(JSON.stringify(D.settings.plan || {}));
    if (!D.settings.plan) D.settings.plan = {};
    D.settings.ownerEmail = (this._q('cfg-owner-email')?.value || '').trim();
    D.settings.plan.includedUsers = parseInt(this._q('cfg-plan-users')?.value) || 3;
    D.settings.plan.extraUserCost = parseFloat(this._q('cfg-plan-extra-cost')?.value) || 5;
    D.settings.plan.billingCycle = this._q('cfg-plan-cycle')?.value || 'monthly';
    D.settings.plan.currency = this._q('cfg-plan-currency')?.value || 'USD';
    logAudit('update', 'config', 'Plan settings updated', before, D.settings.plan);
    this._save(D);
    this._toast(t('cfg_saved'));
    this.render();
  }

  /* ================================================================
     ACTION: Save Weather Config
     ================================================================ */
  _saveWeatherConfig() {
    const D = this._load();
    D.farm.owmApiKey = this._q('cfg-owm')?.value || '';
    this._save(D);
    this._toast(t('cfg_saved'));
  }

  /* ================================================================
     ACTION: Test Weather API
     ================================================================ */
  async _testWeatherApi() {
    const key = this._q('cfg-owm')?.value;
    const D = this._load();
    const lat = D.farm.lat || 0;
    const lng = D.farm.lng || 0;
    try {
      if (key) {
        const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&appid=${encodeURIComponent(key)}&units=metric`);
        const d = await r.json();
        if (d.cod === 200) this._toast('OWM OK: ' + d.main.temp + '\u00B0C');
        else this._toast('Error: ' + sanitizeHTML(d.message || 'unknown'), true);
      } else {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m&timezone=auto`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        this._toast('Open-Meteo OK: ' + d.current.temperature_2m + '\u00B0C');
      }
    } catch (e) { this._toast(t('error_network') + ': ' + sanitizeHTML(e.message), true); }
  }

  /* ================================================================
     ACTION: Save MQTT Config
     ================================================================ */
  _saveMqttConfig() {
    const D = this._load();
    D.farm.mqttBroker = this._q('cfg-mqtt-broker')?.value || '';
    D.farm.mqttUser = this._q('cfg-mqtt-user')?.value || '';
    D.farm.mqttPass = this._q('cfg-mqtt-pass')?.value || '';
    D.farm.mqttTopicPrefix = this._q('cfg-mqtt-prefix')?.value || 'egglogu/';
    this._save(D);
    this._toast(t('cfg_saved'));
  }

  /* ================================================================
     ACTION: Geolocation Modal
     ================================================================ */
  _showGeoModal() {
    const D = this._load();
    this._openModal(t('geo_set_location'), `
<div style="margin-bottom:8px"><button class="btn btn-secondary btn-sm" id="geo-use-gps">${t('geo_use_gps')}</button>
<span style="margin-left:8px;color:var(--text-light)">${t('geo_click_map')}</span></div>
<div id="geo-map" class="leaflet-container" style="height:400px;border-radius:var(--radius, 8px)"></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('geo_lat')}</label><input id="geo-lat" type="number" step="any" value="${D.farm.lat || ''}" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('geo_lng')}</label><input id="geo-lng" type="number" step="any" value="${D.farm.lng || ''}" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div></div>
<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
<button class="btn btn-secondary" id="geo-cancel">${t('cancel')}</button>
<button class="btn btn-primary" id="geo-save">${t('save')}</button></div>`);

    setTimeout(() => {
      const lat = D.farm.lat || 0;
      const lng = D.farm.lng || 0;
      const el = document.getElementById('geo-map');
      if (!el) return;
      if (this._geoMap) { this._geoMap.remove(); this._geoMap = null; }
      /* global L */
      this._geoMap = L.map(el).setView([lat || 20, lng || -70], lat ? 10 : 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(this._geoMap);
      if (lat && lng) { this._geoMarker = L.marker([lat, lng]).addTo(this._geoMap); }
      this._geoMap.on('click', (e) => {
        if (this._geoMarker) this._geoMap.removeLayer(this._geoMarker);
        this._geoMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(this._geoMap);
        const latEl = document.getElementById('geo-lat');
        const lngEl = document.getElementById('geo-lng');
        if (latEl) latEl.value = e.latlng.lat.toFixed(6);
        if (lngEl) lngEl.value = e.latlng.lng.toFixed(6);
      });
      setTimeout(() => { this._geoMap.invalidateSize(); }, 300);

      // Bind GPS button
      const gpsBtn = document.getElementById('geo-use-gps');
      if (gpsBtn) gpsBtn.addEventListener('click', () => this._useGPS());
      const saveBtn = document.getElementById('geo-save');
      if (saveBtn) saveBtn.addEventListener('click', () => this._saveGeoLocation());
      const cancelBtn = document.getElementById('geo-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeModal());
    }, 300);
  }

  _useGPS() {
    if (!navigator.geolocation) { this._toast('GPS ' + t('not_available'), true); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const latEl = document.getElementById('geo-lat');
      const lngEl = document.getElementById('geo-lng');
      if (latEl) latEl.value = lat.toFixed(6);
      if (lngEl) lngEl.value = lng.toFixed(6);
      if (this._geoMap) {
        this._geoMap.setView([lat, lng], 12);
        if (this._geoMarker) this._geoMap.removeLayer(this._geoMarker);
        this._geoMarker = L.marker([lat, lng]).addTo(this._geoMap);
      }
    }, err => this._toast('GPS Error: ' + err.message, true));
  }

  _saveGeoLocation() {
    const D = this._load();
    D.farm.lat = parseFloat(document.getElementById('geo-lat')?.value) || null;
    D.farm.lng = parseFloat(document.getElementById('geo-lng')?.value) || null;
    this._save(D);
    this._closeModal();
    this._toast(t('cfg_saved'));
    this.render();
  }

  /* ================================================================
     USER MANAGEMENT: Show Form
     ================================================================ */
  _showUserForm(id) {
    const D = this._load();
    const u = id ? D.users.find(x => x.id === id) : null;
    const isEs = getLang().startsWith('es');
    const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
    const activeCount = D.users.filter(x => x.status === 'active').length;
    const isExtraUser = !id && activeCount >= plan.includedUsers;
    const billingNotice = isExtraUser ? `<div style="background:rgba(255,152,0,.1);border:1px solid var(--warning);border-radius:var(--radius);padding:10px;margin-bottom:12px;font-size:12px">
<strong>Usuario adicional</strong> -- Se cobrara ${plan.currency} ${plan.extraUserCost.toFixed(2)} proporcional desde la fecha de activacion hasta fin del ciclo (${plan.billingCycle}).</div>` : '';
    const editRole = u ? u.role : 'worker';

    this._openModal(u ? t('edit') : (t('cfg_add_user') || 'Add User'), `${billingNotice}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px"><div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('name')}</label><input id="usr-name" value="${u ? escapeAttr(u.name) : ''}" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('cfg_role') || 'Role'}</label><select id="usr-role" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box">
<option value="owner"${editRole === 'owner' ? ' selected' : ''}>Owner</option>
<option value="manager"${editRole === 'manager' ? ' selected' : ''}>Manager</option>
<option value="worker"${editRole === 'worker' ? ' selected' : ''}>Worker</option>
<option value="vet"${editRole === 'vet' ? ' selected' : ''}>Vet</option></select></div></div>
<div id="email-row" style="${editRole === 'worker' ? 'display:none;' : ''}margin-bottom:12px">
<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Email ${editRole === 'worker' ? '(opcional)' : '*'}</label><input type="email" id="usr-email" value="${u ? escapeAttr(u.email || '') : ''}" placeholder="usuario@correo.com" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div id="worker-id-row" style="${editRole === 'worker' ? '' : 'display:none;'}margin-bottom:12px">
<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Worker ID</label><input id="usr-worker-id" value="${u ? escapeAttr(u.workerId || '') : ''}" placeholder="Ej: OP-001" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div style="margin-bottom:12px"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">PIN (4 ${t('cfg_digits') || 'digits'})${u && u.pinHash ? ' -- ' + (isEs ? 'dejar vacio para mantener actual' : 'leave empty to keep current') : ''}</label><input type="password" id="usr-pin" maxlength="4" pattern="[0-9]{4}" value="" placeholder="${u && u.pinHash ? '****' : '0000'}" inputmode="numeric" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-secondary" id="user-form-cancel">${t('cancel')}</button>
<button class="btn btn-primary" id="user-form-save">${t('save')}</button></div>`);

    setTimeout(() => {
      const roleSelect = document.getElementById('usr-role');
      if (roleSelect) {
        roleSelect.addEventListener('change', () => {
          const role = roleSelect.value;
          const emailRow = document.getElementById('email-row');
          const workerRow = document.getElementById('worker-id-row');
          if (role === 'worker') { if (emailRow) emailRow.style.display = 'none'; if (workerRow) workerRow.style.display = ''; }
          else { if (emailRow) emailRow.style.display = ''; if (workerRow) workerRow.style.display = 'none'; }
        });
      }
      const saveBtn = document.getElementById('user-form-save');
      if (saveBtn) saveBtn.addEventListener('click', () => this._saveUser(id || ''));
      const cancelBtn = document.getElementById('user-form-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeModal());
    }, 100);
  }

  async _saveUser(id) {
    const D = this._load();
    const rawPin = document.getElementById('usr-pin')?.value || '';
    const o = {
      name: (document.getElementById('usr-name')?.value || '').trim(),
      role: document.getElementById('usr-role')?.value || 'worker',
      email: (document.getElementById('usr-email')?.value || '').trim()
    };
    if (o.role === 'worker') { o.workerId = (document.getElementById('usr-worker-id')?.value || '').trim(); o.email = o.email || ''; }
    if (!o.name) { this._toast(t('required') || 'Required', true); return; }
    if (o.role !== 'worker' && (!o.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email))) { this._toast('Email valido requerido para ' + o.role, true); return; }
    if (o.role === 'worker' && !o.workerId) { this._toast('Worker ID requerido', true); return; }
    if (rawPin && (rawPin.length !== 4 || !/^\d{4}$/.test(rawPin))) { this._toast('PIN debe ser 4 digitos numericos', true); return; }
    if (rawPin) {
      const { hash, salt } = await hashPin(rawPin);
      o.pinHash = hash; o.pinSalt = salt;
    }
    if (id) {
      const i = D.users.findIndex(u => u.id === id);
      if (i >= 0) { logAudit('update', 'users', 'Edit user: ' + o.name, D.users[i], { ...o, pinHash: '[hashed]' }); D.users[i] = { ...D.users[i], ...o }; if (o.pinHash) delete D.users[i].pin; }
      this._save(D);
      this._closeModal();
      this._toast(t('cfg_saved'));
      this.render();
    } else {
      this._closeModal();
      this._requestUserActivation(o, D);
    }
  }

  /* ================================================================
     LAYER 1: Owner PIN re-authentication
     ================================================================ */
  _requestUserActivation(newUser, D) {
    const user = getCurrentUser();
    if (user.role !== 'owner') { this._toast('Solo el dueno puede agregar usuarios', true); return; }
    this._pendingActivation = newUser;
    this._openModal('Verificacion de Seguridad', `
<p style="color:var(--text-light);font-size:13px;margin-bottom:16px">Para agregar un nuevo usuario se requiere verificacion del dueno. Ingrese su PIN para continuar.</p>
<div style="text-align:center;margin-bottom:16px">
<div style="font-size:13px;margin-bottom:8px"><strong>${sanitizeHTML(newUser.name)}</strong> (${newUser.role})</div>
<div style="font-size:12px;color:var(--text-light)">${sanitizeHTML(newUser.email || '')}</div></div>
<div style="max-width:200px;margin:0 auto"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">PIN del Dueno</label>
<input type="password" id="auth-owner-pin" maxlength="4" pattern="[0-9]{4}" placeholder="****" inputmode="numeric" style="text-align:center;font-size:20px;letter-spacing:8px;padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box">
<p id="auth-pin-error" style="color:var(--danger);font-size:11px;margin-top:4px;display:none"></p></div>
<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end"><button class="btn btn-secondary" id="activation-cancel">${t('cancel')}</button>
<button class="btn btn-primary" id="activation-verify">Verificar y Enviar Confirmacion</button></div>`);

    setTimeout(() => {
      const el = document.getElementById('auth-owner-pin');
      if (el) el.focus();
      const verifyBtn = document.getElementById('activation-verify');
      if (verifyBtn) verifyBtn.addEventListener('click', () => this._verifyOwnerForActivation());
      const cancelBtn = document.getElementById('activation-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => { this._closeModal(); this._pendingActivation = null; });
    }, 100);
  }

  async _verifyOwnerForActivation() {
    const errEl = document.getElementById('auth-pin-error');
    if (isPinLocked()) { _showPinLockCountdown(errEl); return; }
    const D = this._load();
    const pin = document.getElementById('auth-owner-pin')?.value || '';
    const user = getCurrentUser();
    const owner = D.users.find(u => u.id === user.id);
    if (!owner) { this._toast('Usuario dueno no encontrado', true); return; }
    let migrated = await migratePinIfNeeded(owner);
    if (migrated) this._save(D);
    if (owner.pinHash) {
      const match = await verifyPinHash(pin, owner.pinHash, owner.pinSalt);
      if (!match) {
        recordPinFailure();
        if (isPinLocked()) { _showPinLockCountdown(errEl); }
        else { if (errEl) { errEl.textContent = 'PIN incorrecto'; errEl.style.display = 'block'; } }
        const pinEl = document.getElementById('auth-owner-pin');
        if (pinEl) { pinEl.value = ''; pinEl.focus(); }
        logAudit('auth_fail', 'users', 'Owner PIN verification failed for new user activation', null, { attemptedFor: this._pendingActivation?.name });
        return;
      }
    }
    resetPinAttempts();
    logAudit('auth_success', 'users', 'Owner PIN verified for activation: ' + this._pendingActivation?.name, null, { owner: user.name });
    this._closeModal();
    const pending = this._pendingActivation;
    if (pending.role === 'worker') {
      this._activateWorkerDirect(pending);
    } else {
      this._sendActivationConfirmation(pending, D);
    }
  }

  /* ================================================================
     Direct worker activation (no email layer)
     ================================================================ */
  _activateWorkerDirect(newUser) {
    const D = this._load();
    const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
    const activeCount = D.users.filter(x => x.status === 'active').length;
    const isExtra = activeCount >= plan.includedUsers;
    const now = new Date();
    const user = getCurrentUser();
    let userObj;
    if (newUser._reactivateId) {
      userObj = D.users.find(u => u.id === newUser._reactivateId);
      if (!userObj) { this._toast('Usuario no encontrado', true); return; }
    } else {
      userObj = { id: genId(), name: newUser.name, role: 'worker', pinHash: newUser.pinHash, pinSalt: newUser.pinSalt, workerId: newUser.workerId, email: newUser.email || '', created: todayStr() };
      D.users.push(userObj);
    }
    userObj.status = 'active'; userObj.activatedAt = now.toISOString().split('T')[0];
    userObj.billingStart = now.toISOString(); userObj.isExtra = isExtra;
    userObj.confirmedBy = user.name; userObj.confirmedAt = now.toISOString();
    if (isExtra) {
      const daysInCycle = plan.billingCycle === 'monthly' ? 30 : plan.billingCycle === 'quarterly' ? 90 : 365;
      const remainingDays = daysInCycle - now.getDate() + 1;
      userObj.firstCharge = Math.round((plan.extraUserCost / daysInCycle) * remainingDays * 100) / 100;
      userObj.nextBillingDate = _nextBillingDate(plan.billingCycle);
    }
    logAudit('activation_direct', 'users', 'Worker activated directly: ' + userObj.name + ' (' + userObj.workerId + ')', null, { user: userObj.name, workerId: userObj.workerId, isExtra, confirmedBy: user.name });
    this._save(D);
    this._toast(userObj.name + ' (' + userObj.workerId + ') activado');
    this._pendingActivation = null;
    this.render();
  }

  /* ================================================================
     LAYER 2: Email confirmation
     ================================================================ */
  _sendActivationConfirmation(newUser, D) {
    if (!D) D = this._load();
    const token = genId() + '-' + Date.now().toString(36);
    const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
    const activeCount = D.users.filter(x => x.status === 'active').length;
    const isExtra = activeCount >= plan.includedUsers;
    const user = getCurrentUser();
    let userObj;
    if (newUser._reactivateId) {
      userObj = D.users.find(u => u.id === newUser._reactivateId);
      if (userObj) { userObj.status = 'pending'; userObj.activationToken = token; userObj.requestedBy = user.name; userObj.requestedAt = new Date().toISOString(); userObj.isExtra = isExtra; userObj.billingStart = null; }
      else { this._toast('Usuario no encontrado', true); return; }
    } else {
      userObj = {
        id: genId(), name: newUser.name, email: newUser.email, role: newUser.role,
        pinHash: newUser.pinHash, pinSalt: newUser.pinSalt,
        status: 'pending', created: todayStr(), activationToken: token,
        requestedBy: user.name, requestedAt: new Date().toISOString(),
        isExtra, billingStart: null, activatedAt: null
      };
      D.users.push(userObj);
    }
    if (!D.pendingActivations) D.pendingActivations = [];
    D.pendingActivations.push({ token, userId: userObj.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    logAudit('create', 'users', 'User created (pending): ' + newUser.name + ' -- awaiting email confirmation', null, { user: userObj.name, role: userObj.role, email: userObj.email, isExtra });
    this._save(D);

    const ownerEmail = D.settings.ownerEmail || user.email || 'dueno@correo.com';
    const costLine = isExtra ? '<br><span style="color:var(--warning)">Costo adicional: ' + plan.currency + ' ' + plan.extraUserCost.toFixed(2) + '/' + plan.billingCycle + ' (proporcional)</span>' : '<br><span style="color:var(--success)">Incluido en el plan (sin costo adicional)</span>';

    this._openModal('Confirmacion Enviada', `
<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px">
<div style="font-size:11px;color:var(--text-light);margin-bottom:8px">EMAIL DE CONFIRMACION</div>
<div style="font-size:13px"><strong>Para:</strong> ${sanitizeHTML(ownerEmail)}</div>
<div style="font-size:13px"><strong>Asunto:</strong> EGGlogU -- Confirmar activacion de usuario</div>
<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">
<p style="font-size:13px">Se ha solicitado la activacion del siguiente usuario:</p>
<div style="background:var(--card);border-radius:var(--radius);padding:12px;margin:8px 0">
<div><strong>${sanitizeHTML(newUser.name)}</strong> -- ${newUser.role}</div>
<div style="font-size:12px;color:var(--text-light)">${sanitizeHTML(newUser.email || '')}</div>
${costLine}</div>
<p style="font-size:12px;color:var(--text-light)">Solicitado por: ${sanitizeHTML(user.name)} el ${new Date().toLocaleString()}</p>
<p style="font-size:12px;color:var(--text-light)">Token: <code style="font-size:11px">${token.substring(0, 8)}...</code></p></div>
<p style="font-size:13px;text-align:center;margin-bottom:8px">Para activar, haga clic en el boton de abajo (simula confirmacion por email):</p>
<div style="text-align:center;margin-bottom:12px">
<button class="btn btn-primary" id="confirm-activation-btn" style="padding:10px 24px">Confirmar Activacion</button></div>
<p style="font-size:11px;color:var(--text-light);text-align:center">Este enlace expira en 24 horas.</p>
<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-secondary" id="close-activation-btn">Cerrar (confirmar despues)</button></div>`);

    setTimeout(() => {
      const confirmBtn = document.getElementById('confirm-activation-btn');
      if (confirmBtn) confirmBtn.addEventListener('click', () => this._confirmUserActivation(token));
      const closeBtn = document.getElementById('close-activation-btn');
      if (closeBtn) closeBtn.addEventListener('click', () => { this._closeModal(); this.render(); });
    }, 100);
    this._pendingActivation = null;
  }

  /* ================================================================
     LAYER 2b: Confirm activation
     ================================================================ */
  _confirmUserActivation(token) {
    const D = this._load();
    const pending = D.pendingActivations?.find(p => p.token === token);
    if (!pending) { this._toast('Token de activacion invalido o expirado', true); return; }
    if (new Date(pending.expiresAt) < new Date()) {
      this._toast('Token expirado. Solicite una nueva activacion.', true);
      logAudit('activation_expired', 'users', 'Activation token expired', null, { token: token.substring(0, 8) });
      return;
    }
    const userObj = D.users.find(u => u.id === pending.userId);
    if (!userObj) { this._toast('Usuario no encontrado', true); return; }
    const now = new Date();
    const user = getCurrentUser();
    userObj.status = 'active';
    userObj.activatedAt = now.toISOString().split('T')[0];
    userObj.billingStart = now.toISOString();
    userObj.activationToken = null;
    userObj.confirmedBy = user.name;
    userObj.confirmedAt = now.toISOString();
    if (userObj.isExtra) {
      const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
      const daysInCycle = plan.billingCycle === 'monthly' ? 30 : plan.billingCycle === 'quarterly' ? 90 : 365;
      const dayOfCycle = now.getDate();
      const remainingDays = daysInCycle - dayOfCycle + 1;
      userObj.firstCharge = Math.round((plan.extraUserCost / daysInCycle) * remainingDays * 100) / 100;
      userObj.nextBillingDate = _nextBillingDate(plan.billingCycle);
      logAudit('billing', 'users', 'Extra user activated -- proportional charge: ' + plan.currency + ' ' + userObj.firstCharge.toFixed(2), null, { user: userObj.name, charge: userObj.firstCharge, currency: plan.currency, remainingDays, nextBilling: userObj.nextBillingDate });
    }
    D.pendingActivations = D.pendingActivations.filter(p => p.token !== token);
    logAudit('activation_confirmed', 'users', 'User activated: ' + userObj.name + ' -- confirmed by owner via email', { status: 'pending' }, { status: 'active', activatedAt: userObj.activatedAt, confirmedBy: userObj.confirmedBy });
    this._save(D);
    this._closeModal();
    this._toast(userObj.name + ' activado correctamente');
    this.render();
  }

  /* ================================================================
     LAYER 4: Deactivate user
     ================================================================ */
  async _deactivateUser(id) {
    const D = this._load();
    const u = D.users.find(x => x.id === id);
    if (!u) { this._toast('Usuario no encontrado', true); return; }
    if (u.role === 'owner' && D.users.filter(x => x.role === 'owner' && x.status === 'active').length <= 1) {
      this._toast('No se puede desactivar el ultimo dueno activo', true); return;
    }
    if (!await showConfirm('Desactivar a ' + u.name + '? El usuario perdera acceso al sistema. ' + (u.isExtra ? 'Se dejara de cobrar en el siguiente ciclo.' : ''))) return;

    this._openModal('Confirmar Desactivacion', `
<p style="font-size:13px;margin-bottom:12px">Ingrese su PIN para confirmar la desactivacion de <strong>${sanitizeHTML(u.name)}</strong>.</p>
<div style="max-width:200px;margin:0 auto"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">PIN del Dueno</label>
<input type="password" id="deact-pin" maxlength="4" inputmode="numeric" style="text-align:center;font-size:20px;letter-spacing:8px;padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end"><button class="btn btn-secondary" id="deact-cancel">${t('cancel')}</button>
<button class="btn btn-danger" id="deact-confirm">Desactivar</button></div>`);

    setTimeout(() => {
      const el = document.getElementById('deact-pin');
      if (el) el.focus();
      const confirmBtn = document.getElementById('deact-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', () => this._executeDeactivation(id));
      const cancelBtn = document.getElementById('deact-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeModal());
    }, 100);
  }

  async _executeDeactivation(id) {
    if (isPinLocked()) { this._toast('Demasiados intentos. Espera unos minutos.', true); return; }
    const D = this._load();
    const pin = document.getElementById('deact-pin')?.value || '';
    const user = getCurrentUser();
    const owner = D.users.find(u => u.id === user.id);
    let migrated = await migratePinIfNeeded(owner);
    if (migrated) this._save(D);
    if (owner?.pinHash) {
      const match = await verifyPinHash(pin, owner.pinHash, owner.pinSalt);
      if (!match) { recordPinFailure(); this._toast('PIN incorrecto', true); const el = document.getElementById('deact-pin'); if (el) el.value = ''; return; }
      resetPinAttempts();
    }
    const u = D.users.find(x => x.id === id); if (!u) return;
    const before = { status: u.status, activatedAt: u.activatedAt };
    u.status = 'inactive'; u.deactivatedAt = new Date().toISOString().split('T')[0]; u.deactivatedBy = user.name;
    logAudit('deactivation', 'users', 'User deactivated: ' + u.name + ' by ' + user.name, before, { status: 'inactive', deactivatedAt: u.deactivatedAt });
    this._save(D);
    this._closeModal();
    this._toast(u.name + ' desactivado');
    this.render();
  }

  /* ================================================================
     Billing cycle auto-deactivation check
     ================================================================ */
  checkBillingCycleDeactivations() {
    const D = this._load();
    const today = todayStr();
    let changed = false;
    D.users.forEach(u => {
      if (u.status === 'active' && u.isExtra && u.nextBillingDate && u.nextBillingDate <= today) {
        u.status = 'inactive'; u.deactivatedAt = today; u.deactivatedBy = 'system_billing';
        logAudit('auto_deactivation', 'users', 'Auto-deactivated at billing cycle end: ' + u.name, { status: 'active' }, { status: 'inactive', reason: 'billing_cycle_end' });
        changed = true;
      }
    });
    if (D.pendingActivations) {
      const before = D.pendingActivations.length;
      D.pendingActivations = D.pendingActivations.filter(p => new Date(p.expiresAt) > new Date());
      if (D.pendingActivations.length < before) {
        D.users.forEach(u => {
          if (u.status === 'pending' && u.activationToken) {
            const still = D.pendingActivations.find(p => p.userId === u.id);
            if (!still) { u.status = 'expired'; logAudit('activation_expired', 'users', 'Pending activation expired: ' + u.name, null, null); changed = true; }
          }
        });
      }
    }
    if (changed) this._save(D);
  }

  /* ================================================================
     Resend activation
     ================================================================ */
  _resendActivation(id) {
    const D = this._load();
    const u = D.users.find(x => x.id === id);
    if (!u || u.status !== 'pending') { this._toast('Usuario no esta pendiente', true); return; }
    if (D.pendingActivations) D.pendingActivations = D.pendingActivations.filter(p => p.userId !== id);
    const token = genId() + '-' + Date.now().toString(36);
    u.activationToken = token;
    if (!D.pendingActivations) D.pendingActivations = [];
    D.pendingActivations.push({ token, userId: id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    logAudit('resend_activation', 'users', 'Resent activation for: ' + u.name, null, { newToken: token.substring(0, 8) });
    this._save(D);
    this._sendActivationConfirmation({ name: u.name, email: u.email, role: u.role }, D);
  }

  /* ================================================================
     Reactivate user
     ================================================================ */
  _reactivateUser(id) {
    const D = this._load();
    const u = D.users.find(x => x.id === id);
    if (!u) { this._toast('Usuario no encontrado', true); return; }
    const user = getCurrentUser();
    if (user.role !== 'owner') { this._toast('Solo el dueno puede reactivar usuarios', true); return; }
    this._requestUserActivation({ name: u.name, email: u.email, role: u.role, pinHash: u.pinHash, pinSalt: u.pinSalt, _reactivateId: id }, D);
  }

  /* ================================================================
     Remove user permanently
     ================================================================ */
  async _removeUser(id) {
    const D = this._load();
    const u = D.users.find(x => x.id === id);
    if (!u) return;
    if (u.status === 'active') { this._toast('Desactive el usuario antes de eliminarlo', true); return; }
    if (!await showConfirm('Eliminar permanentemente a ' + u.name + '? Esta accion no se puede deshacer.')) return;
    logAudit('delete', 'users', 'Permanently removed user: ' + u.name, u, null);
    D.users = D.users.filter(x => x.id !== id);
    if (D.pendingActivations) D.pendingActivations = D.pendingActivations.filter(p => p.userId !== id);
    this._save(D);
    this._toast(u.name + ' eliminado');
    this.render();
  }

  /* ================================================================
     REASSIGNMENT
     ================================================================ */
  _showReassignForm(userId) {
    const D = this._load();
    const target = D.users.find(u => u.id === userId);
    const user = getCurrentUser();
    if (!target || target.status !== 'active') return;
    if (target.id === user.id) { this._toast(t('reassign_no_self'), true); return; }
    if (!canReassign(user.role, target.role)) { this._toast(t('error_unexpected'), true); return; }
    if (target.role === 'owner') {
      const activeOwners = D.users.filter(u => u.role === 'owner' && u.status === 'active');
      if (activeOwners.length <= 1) { this._toast(t('reassign_last_owner'), true); return; }
    }
    this._openModal(t('reassign_title'), `
<p style="margin-bottom:1rem;color:var(--text-secondary)">${t('reassign_notify')}</p>
<div style="margin-bottom:12px"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('reassign_new_name')}</label>
<input id="reassign-name" maxlength="200" autocomplete="off" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div style="margin-bottom:12px"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('reassign_new_email')}</label>
<input type="email" id="reassign-email" autocomplete="off" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div style="margin-bottom:12px"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('reassign_new_pin')}</label>
<input type="password" id="reassign-pin" maxlength="8" inputmode="numeric" autocomplete="off" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div id="reassign-err" style="color:var(--red);font-size:.85rem;min-height:1.2rem;margin-top:.5rem"></div>
<div style="display:flex;gap:10px;margin-top:1rem;justify-content:flex-end">
<button class="btn btn-secondary" id="reassign-cancel">${t('cancel')}</button>
<button class="btn btn-primary" id="reassign-submit">${t('reassign_confirm')}</button></div>`);

    setTimeout(() => {
      const submitBtn = document.getElementById('reassign-submit');
      if (submitBtn) submitBtn.addEventListener('click', () => this._verifyReassignment(userId));
      const cancelBtn = document.getElementById('reassign-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => this._closeModal());
    }, 100);
  }

  _verifyReassignment(userId) {
    const name = (document.getElementById('reassign-name')?.value || '').trim();
    const email = (document.getElementById('reassign-email')?.value || '').trim();
    const pin = document.getElementById('reassign-pin')?.value || '';
    const errEl = document.getElementById('reassign-err');
    if (!name || !pin) { if (errEl) errEl.textContent = t('required'); return; }
    if (pin.length < 4) { if (errEl) errEl.textContent = t('min_length') + ': 4'; return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (errEl) errEl.textContent = t('invalid_email'); return; }
    this._reassignTmp = { userId, name, email, pin };
    this._closeModal();
    if (isPinLocked()) { this._toast(t('pin_invalid'), true); return; }

    this._openModal(t('reassign_verify'), `
<p style="margin-bottom:1rem">${t('reassign_verify')}</p>
<div style="margin-bottom:12px"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${t('perfil_current_pin')}</label>
<input type="password" id="reauth-pin" maxlength="8" inputmode="numeric" autocomplete="off" style="padding:8px;border:1px solid var(--border,#ddd);border-radius:var(--radius,8px);width:100%;box-sizing:border-box"></div>
<div id="reauth-err" style="color:var(--red);font-size:.85rem;min-height:1.2rem;margin-top:.5rem"></div>
<div style="display:flex;gap:10px;margin-top:1rem;justify-content:flex-end">
<button class="btn btn-secondary" id="reauth-cancel">${t('cancel')}</button>
<button class="btn btn-primary" id="reauth-confirm">${t('reassign_confirm')}</button></div>`);

    setTimeout(() => {
      const confirmBtn = document.getElementById('reauth-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', () => this._executeReassignment());
      const cancelBtn = document.getElementById('reauth-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => { this._closeModal(); this._reassignTmp = null; });
    }, 100);
  }

  async _executeReassignment() {
    const reauthPin = document.getElementById('reauth-pin')?.value || '';
    const errEl = document.getElementById('reauth-err');
    if (!reauthPin) { if (errEl) errEl.textContent = t('required'); return; }
    const D = this._load();
    const user = getCurrentUser();
    const me = D.users.find(u => u.id === user.id);
    if (!me) { if (errEl) errEl.textContent = t('error_unexpected'); return; }
    const valid = await verifyPinHash(reauthPin, me.pinHash, me.pinSalt);
    if (!valid) { recordPinFailure(); if (isPinLocked()) { _showPinLockCountdown(errEl); } else { if (errEl) errEl.textContent = t('perfil_wrong_pin'); } return; }
    resetPinAttempts();
    const tmp = this._reassignTmp;
    if (!tmp) { this._closeModal(); return; }
    const target = D.users.find(u => u.id === tmp.userId);
    if (!target) { this._closeModal(); this._toast(t('error_unexpected'), true); return; }
    const beforeState = { name: target.name, email: target.email, id: target.id };
    const newId = genId();
    target.reassignedFrom = { name: target.name, email: target.email, oldId: target.id, reassignedAt: new Date().toISOString(), reassignedBy: user.name };
    target.name = tmp.name;
    target.email = tmp.email || '';
    target.id = newId;
    const { hash, salt } = await hashPin(tmp.pin);
    target.pinHash = hash; target.pinSalt = salt; delete target.pin;
    this._save(D);
    logAudit('account_reassign', 'config', 'Account reassigned: ' + beforeState.name + ' -> ' + tmp.name, beforeState, { name: tmp.name, email: tmp.email, id: newId });
    if (tmp.email && apiService.isLoggedIn()) {
      try { await apiService.notifyReassignment({ new_email: tmp.email, new_name: tmp.name, role: target.role }); } catch (e) { console.warn('Reassignment notification failed:', e); }
    }
    this._reassignTmp = null;
    this._closeModal();
    this._toast(t('reassign_success'));
    this.render();
  }

  /* ================================================================
     ROLE PERMISSIONS
     ================================================================ */
  _toggleRolePerm(el) {
    const role = el.dataset.role;
    const mod = el.dataset.mod;
    const D = this._load();
    if (!D.settings.customPermissions) D.settings.customPermissions = {};
    if (!D.settings.customPermissions[role]) D.settings.customPermissions[role] = [...(ROLE_PERMISSIONS[role] || [])];
    const perms = D.settings.customPermissions[role];
    const maxAllowed = ROLE_MAX_MODULES[role] || [];
    if (el.checked && !perms.includes(mod)) {
      if (!maxAllowed.includes(mod)) { el.checked = false; this._toast('Modulo no aplica a este perfil', true); return; }
      perms.push(mod);
    }
    if (!el.checked) { const i = perms.indexOf(mod); if (i >= 0) perms.splice(i, 1); }
    if (!perms.includes('dashboard')) perms.unshift('dashboard');
    ROLE_PERMISSIONS[role] = perms;
    logAudit('update', 'config', 'Role permissions changed: ' + role + ' -> ' + mod + ' ' + (el.checked ? 'ON' : 'OFF'), null, { role, mod, enabled: el.checked });
    this._save(D);
    this._toast('Permisos actualizados');
  }

  _resetPermsToDefault() {
    const D = this._load();
    delete D.settings.customPermissions;
    Object.keys(DEFAULT_ROLE_PERMS).forEach(r => { ROLE_PERMISSIONS[r] = [...DEFAULT_ROLE_PERMS[r]]; });
    logAudit('update', 'config', 'Role permissions reset to defaults');
    this._save(D);
    this.render();
    this._toast('Permisos restaurados');
  }

  applyCustomPermissions() {
    const D = this._load();
    if (!D.settings.customPermissions) return;
    Object.entries(D.settings.customPermissions).forEach(([role, perms]) => {
      ROLE_PERMISSIONS[role] = perms;
    });
  }

  /* ================================================================
     BACKUP
     ================================================================ */
  async _loadBackupList() {
    const el = this._q('backup-list');
    if (!el) return;
    try {
      const backups = await listBackups();
      if (!backups.length) { el.innerHTML = `<p style="color:var(--text-light)">${t('cfg_no_backups') || 'No auto-backups yet. Backups are created automatically after each save.'}</p>`; return; }
      let h = '<div class="table-wrap"><table><thead><tr><th>' + t('date') + '</th><th>' + (t('cfg_size') || 'Size') + '</th><th>' + t('actions') + '</th></tr></thead><tbody>';
      backups.forEach(b => {
        h += `<tr><td>${b.date}</td><td>${(b.size / 1024).toFixed(1)} KB</td>
<td><button class="btn btn-secondary btn-sm" data-action="restore-backup" data-url="${escapeAttr(b.url)}">${t('cfg_restore') || 'Restore'}</button></td></tr>`;
      });
      h += '</tbody></table></div>';
      el.innerHTML = h;
      // Bind restore buttons
      el.querySelectorAll('[data-action="restore-backup"]').forEach(btn => {
        btn.addEventListener('click', () => this._doRestore(btn.dataset.url));
      });
    } catch (e) {
      el.innerHTML = `<p style="color:var(--text-light)">${t('cfg_backup_na') || 'Cache API not available in this browser.'}</p>`;
    }
  }

  async _doRestore(url) {
    if (!await showConfirm(t('cfg_restore_confirm') || 'Restore from this backup? Current data will be replaced.')) return;
    try { await restoreBackup(url); this._toast(t('cfg_restored') || 'Backup restored'); this._nav('dashboard'); }
    catch (e) { this._toast(t('error_unexpected') + ': ' + e.message, true); }
  }

  /* ================================================================
     AUDIT LOG
     ================================================================ */
  _renderAuditLog() {
    const D = this._load();
    const el = this._q('audit-log-table');
    if (!el) return;
    el.innerHTML = DataTable.create({
      id: 'auditLog', data: D.auditLog, emptyIcon: '', emptyText: t('no_data'),
      columns: [
        { key: 'ts', label: t('cfg_timestamp') || 'Time', type: 'date', sortable: true, filterable: true, filterType: 'date-range', getValue: r => (r.ts || '').substring(0, 10), render: r => '<span style="font-size:12px;white-space:nowrap">' + (r.ts || '').replace('T', ' ').substring(0, 19) + '</span>' },
        { key: 'user', label: t('cfg_user') || 'User', type: 'text', sortable: true, filterable: true, render: r => sanitizeHTML(r.user || '-') },
        { key: 'action', label: t('cfg_action') || 'Action', type: 'text', sortable: true, filterable: true, filterType: 'select', filterOptions: [{ value: 'create', label: 'create' }, { value: 'update', label: 'update' }, { value: 'delete', label: 'delete' }], render: r => '<span class="badge badge-' + (r.action === 'create' ? 'success' : r.action === 'delete' ? 'danger' : 'info') + '">' + r.action + '</span>' },
        { key: 'module', label: t('cfg_module') || 'Module', type: 'text', sortable: true, filterable: true, render: r => sanitizeHTML(r.module || '-') },
        { key: 'detail', label: t('cfg_detail') || 'Detail', type: 'text', render: r => '<span style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;display:inline-block">' + sanitizeHTML(r.detail || '-') + '</span>' }
      ]
    });
  }

  /* ================================================================
     DATA MANAGEMENT
     ================================================================ */
  _exportData() {
    const D = this._load();
    const exportPayload = {
      _meta: {
        app: 'EGGlogU',
        version: '2.0',
        exportDate: new Date().toISOString(),
        farmName: D.farm?.name || '',
        records: {
          flocks: (D.flocks||[]).length,
          production: (D.dailyProduction||[]).length,
          vaccines: (D.vaccines||[]).length,
          medications: (D.medications||[]).length,
          outbreaks: (D.outbreaks||[]).length,
          feedPurchases: (D.feed?.purchases||[]).length,
          feedConsumption: (D.feed?.consumption||[]).length,
          clients: (D.clients||[]).length,
          income: (D.finances?.income||[]).length,
          expenses: (D.finances?.expenses||[]).length,
          inventory: (D.inventory||[]).length,
          environment: (D.environment||[]).length,
          logbook: (D.logbook||[]).length,
          personnel: (D.personnel||[]).length,
          biosecurityVisitors: (D.biosecurity?.visitors||[]).length,
          batches: (D.traceability?.batches||[]).length,
          plans: (D.productionPlans||[]).length,
          auditLog: (D.auditLog||[]).length
        }
      },
      data: D
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'egglogu_backup_' + todayStr() + '.json';
    a.click();
    logAudit('export', 'data', null, 'Full data export');
    this._toast(t('cfg_exported'));
  }

  _fullBackup() {
    const D = this._load();
    // Count internal vs external records per module
    const countBySource = (arr) => {
      const ext = (arr||[]).filter(r => r._imported).length;
      return { total: (arr||[]).length, internal: (arr||[]).length - ext, external: ext };
    };
    const stats = {
      flocks: countBySource(D.flocks),
      production: countBySource(D.dailyProduction),
      vaccines: countBySource(D.vaccines),
      medications: countBySource(D.medications),
      clients: countBySource(D.clients),
      feedPurchases: countBySource(D.feed?.purchases),
      feedConsumption: countBySource(D.feed?.consumption),
      income: countBySource(D.finances?.income),
      expenses: countBySource(D.finances?.expenses),
      orders: countBySource(D.orders),
      inventory: countBySource(D.inventory),
      environment: countBySource(D.environment),
      logbook: countBySource(D.logbook),
      personnel: countBySource(D.personnel),
    };
    const payload = {
      _meta: {
        app: 'EGGlogU',
        version: '2.0',
        backupType: 'full',
        exportDate: new Date().toISOString(),
        farmName: D.farm?.name || '',
        stats
      },
      data: D
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'egglogu_FULL_BACKUP_' + todayStr() + '.json';
    a.click();
    logAudit('export', 'data', null, 'Full system backup (internal + external)');
    this._toast(t('imp_backup_done'));
  }

  _importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        // Support both new format (with _meta) and legacy (plain data)
        const importedData = raw._meta ? raw.data : raw;
        const meta = raw._meta || null;
        this._showImportPreview(importedData, meta, file.name);
      } catch (err) { this._toast((t('error_unexpected') || 'Error') + ': ' + sanitizeHTML(err.message), true); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  _showImportPreview(importedData, meta, fileName) {
    const preview = this._q('import-preview');
    if (!preview) return;
    const D = this._load();
    // Count records in imported data
    const arrKeys = ['flocks','dailyProduction','vaccines','medications','outbreaks','clients','inventory',
      'environment','checklist','logbook','personnel','productionPlans','auditLog','kpiSnapshots',
      'weatherCache','stressEvents','iotReadings','predictions','clientClaims','orders',
      'storageLocations','reservations'];
    const nestedKeys = {feed:['purchases','consumption'], finances:['income','expenses','receivables'],
      biosecurity:['visitors','zones','pestSightings','protocols'], traceability:['batches']};

    let importCount = 0, currentCount = 0;
    arrKeys.forEach(k => { importCount += (importedData[k]||[]).length; currentCount += (D[k]||[]).length; });
    Object.entries(nestedKeys).forEach(([parent, children]) => {
      children.forEach(c => {
        importCount += (importedData[parent]?.[c]||[]).length;
        currentCount += (D[parent]?.[c]||[]).length;
      });
    });

    const farmName = meta?.farmName || importedData.farm?.name || '?';
    const exportDate = meta?.exportDate ? new Date(meta.exportDate).toLocaleDateString() : '?';

    let h = `<h4 style="margin:0 0 8px">${t('cfg_import_preview') || 'Import Preview'}</h4>`;
    h += `<p style="font-size:13px;margin:4px 0"><strong>${t('cfg_file') || 'File'}:</strong> ${sanitizeHTML(fileName)}</p>`;
    h += `<p style="font-size:13px;margin:4px 0"><strong>${t('cfg_farm') || 'Farm'}:</strong> ${sanitizeHTML(farmName)}</p>`;
    h += `<p style="font-size:13px;margin:4px 0"><strong>${t('cfg_export_date') || 'Export date'}:</strong> ${exportDate}</p>`;
    h += `<p style="font-size:13px;margin:4px 0"><strong>${t('cfg_import_records') || 'Records in file'}:</strong> ${importCount.toLocaleString()}</p>`;
    h += `<p style="font-size:13px;margin:4px 0"><strong>${t('cfg_current_records') || 'Current records'}:</strong> ${currentCount.toLocaleString()}</p>`;
    h += `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">`;
    h += `<button class="btn btn-primary" data-action="import-merge">${t('cfg_import_merge') || 'Merge (keep both)'}</button>`;
    h += `<button class="btn btn-secondary" data-action="import-replace">${t('cfg_import_replace') || 'Replace all'}</button>`;
    h += `<button class="btn btn-secondary" data-action="import-cancel">${t('cancel') || 'Cancel'}</button>`;
    h += `</div>`;
    h += `<p style="font-size:11px;color:var(--text-light);margin-top:8px">${t('cfg_merge_hint') || 'Merge adds imported records to your current data without duplicates. Replace overwrites everything.'}</p>`;

    preview.innerHTML = h;
    preview.style.display = 'block';

    // Store imported data for the action buttons
    this._pendingImport = importedData;

    preview.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'import-merge') this._doImportMerge();
        else if (action === 'import-replace') this._doImportReplace();
        else if (action === 'import-cancel') { preview.style.display = 'none'; this._pendingImport = null; }
      });
    });
  }

  _doImportReplace() {
    if (!this._pendingImport) return;
    this._save(this._pendingImport);
    logAudit('import', 'data', null, 'Full data replace');
    this._toast(t('cfg_imported'));
    this._pendingImport = null;
    this.render();
  }

  async _doImportMerge() {
    if (!this._pendingImport) return;
    const imp = this._pendingImport;
    const D = this._load();

    // Merge farm config — keep current, but fill missing fields from import
    if (imp.farm) {
      for (const [k, v] of Object.entries(imp.farm)) {
        if (!D.farm[k] && v) D.farm[k] = v;
      }
    }

    // Merge array collections — deduplicate by id
    const arrKeys = ['flocks','dailyProduction','vaccines','medications','outbreaks','clients','inventory',
      'environment','checklist','logbook','personnel','productionPlans','auditLog','kpiSnapshots',
      'clientClaims','users','pendingActivations'];
    arrKeys.forEach(k => {
      if (!Array.isArray(imp[k]) || !imp[k].length) return;
      if (!Array.isArray(D[k])) D[k] = [];
      const existingIds = new Set(D[k].map(r => r.id).filter(Boolean));
      imp[k].forEach(r => {
        if (r.id && existingIds.has(r.id)) return; // skip duplicate
        D[k].push(r);
      });
    });

    // Merge nested objects (feed, finances, biosecurity, traceability)
    const nestedKeys = {
      feed: ['purchases', 'consumption'],
      finances: ['income', 'expenses', 'receivables'],
      biosecurity: ['visitors', 'zones', 'pestSightings', 'protocols'],
      traceability: ['batches']
    };
    Object.entries(nestedKeys).forEach(([parent, children]) => {
      if (!imp[parent]) return;
      if (!D[parent]) D[parent] = {};
      children.forEach(c => {
        if (!Array.isArray(imp[parent][c]) || !imp[parent][c].length) return;
        if (!Array.isArray(D[parent][c])) D[parent][c] = [];
        const existingIds = new Set(D[parent][c].map(r => r.id).filter(Boolean));
        imp[parent][c].forEach(r => {
          if (r.id && existingIds.has(r.id)) return;
          D[parent][c].push(r);
        });
      });
    });

    // Keep current settings (don't overwrite plan, preferences, etc.)

    this._save(D);
    logAudit('import', 'data', null, 'Merged data import');
    this._toast(t('cfg_import_merged') || 'Data merged successfully');
    this._pendingImport = null;
    this.render();
  }

  async _resetData() {
    if (!await showConfirm(t('cfg_reset_confirm'))) return;
    if (!await showConfirm(t('final_warning'))) return;
    localStorage.removeItem('egglogu_data');
    this._toast(t('cfg_reset_done'));
    this._nav('dashboard');
  }
}

/* ================================================================
   REGISTER
   ================================================================ */
customElements.define('egg-config', EggConfig);
export { EggConfig };
