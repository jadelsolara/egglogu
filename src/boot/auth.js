// EGGlogU Auth Boot Module
// Extracted from monolith: login, signup, PIN, OAuth, password reset, email verification
// All DOM manipulation targets the existing egglogu.html elements

import { Store } from '../core/store.js';
import { Bus } from '../core/bus.js';
import { apiService } from '../core/api.js';
import { t, switchLang } from '../core/i18n.js';
import { sanitizeHTML, escapeAttr, genId, todayStr } from '../core/utils.js';
import { hashPassword, hashPin, verifyPinHash, migratePinIfNeeded, isFirstRun, isAuthenticated, AUTH_KEY, AUTH_SESSION, isPinLocked, pinLockRemaining, recordPinFailure, resetPinAttempts, getLoginAttempts, recordLoginFailure, resetLoginAttempts, isLoginLocked } from '../core/security.js';
import { setCurrentUser, getCurrentUser, hasPermission, ROLE_PERMISSIONS, isSuperuserEmail } from '../core/permissions.js';
import { flockSelect, logAudit, scheduleAutoBackup, safeSetItem } from '../core/helpers.js';

const $ = id => document.getElementById(id);

let _GOOGLE_CLIENT_ID = localStorage.getItem('egglogu_google_client_id') || '';
let _MICROSOFT_CLIENT_ID = localStorage.getItem('egglogu_microsoft_client_id') || '';
let _MICROSOFT_TENANT_ID = localStorage.getItem('egglogu_microsoft_tenant_id') || 'common';
let _msalInstance = null;
window._GOOGLE_CLIENT_ID = _GOOGLE_CLIENT_ID;

let _pinLockCountdownTimer = null;

// ─── Sync state ───
let _lastSyncTime = localStorage.getItem('egglogu_last_sync') || null;
let _isSyncing = false;

const ENTITY_MAP = {
  farms: D => ([D.farm]),
  flocks: D => (D.flocks || []),
  production: D => (D.dailyProduction || []),
  vaccines: D => (D.vaccines || []),
  medications: D => (D.medications || []),
  outbreaks: D => (D.outbreaks || []),
  stress_events: D => (D.stressEvents || []),
  feed_purchases: D => ((D.feed && D.feed.purchases) || []),
  feed_consumption: D => ((D.feed && D.feed.consumption) || []),
  clients: D => (D.clients || []),
  incomes: D => ((D.finances && D.finances.income) || []),
  expenses: D => ((D.finances && D.finances.expenses) || []),
  receivables: D => ((D.finances && D.finances.receivables) || []),
  environment_readings: D => (D.environment || []),
  checklist_items: D => (D.checklist || []),
  logbook_entries: D => (D.logbook || []),
  personnel: D => (D.personnel || []),
};

// ─── Themes ───
const THEMES = {
  blue: { primary: '#1A3C6E', 'primary-light': '#4A7AB5', 'primary-dark': '#0E2240', 'sidebar-bg': '#0E2240', rgb: '26,60,110' },
  green: { primary: '#2E7D32', 'primary-light': '#4CAF50', 'primary-dark': '#1B5E20', 'sidebar-bg': '#1B5E20', rgb: '46,125,50' },
  purple: { primary: '#6A1B9A', 'primary-light': '#AB47BC', 'primary-dark': '#4A148C', 'sidebar-bg': '#4A148C', rgb: '106,27,154' },
  black: { primary: '#37474F', 'primary-light': '#607D8B', 'primary-dark': '#263238', 'sidebar-bg': '#263238', rgb: '55,71,79' },
  dark: { primary: '#90CAF9', 'primary-light': '#42A5F5', 'primary-dark': '#1E1E1E', 'sidebar-bg': '#121212', rgb: '144,202,249' }
};

function applyTheme(name) {
  const th = THEMES[name] || THEMES.blue;
  const s = document.documentElement.style;
  s.setProperty('--primary', th.primary);
  s.setProperty('--primary-light', th['primary-light']);
  s.setProperty('--primary-dark', th['primary-dark']);
  s.setProperty('--sidebar-bg', th['sidebar-bg']);
  s.setProperty('--primary-hover', 'rgba(' + th.rgb + ',.04)');
  s.setProperty('--primary-ring', 'rgba(' + th.rgb + ',.15)');
  s.setProperty('--primary-fill', 'rgba(' + th.rgb + ',.1)');
  safeSetItem('egglogu_theme', name);
}

function applyFontScale(scale) {
  document.body.classList.remove('font-small', 'font-normal', 'font-large', 'font-xlarge');
  document.body.classList.add('font-' + scale);
}

function applyDarkMode(on) {
  document.body.classList.toggle('dark-mode', on);
  if (on) {
    if (localStorage.getItem('egglogu_theme') !== 'dark') {
      safeSetItem('egglogu_theme_prev', localStorage.getItem('egglogu_theme') || 'blue');
    }
    applyTheme('dark');
    safeSetItem('egglogu_theme', 'dark');
  } else {
    const prev = localStorage.getItem('egglogu_theme_prev') || 'blue';
    applyTheme(prev);
    safeSetItem('egglogu_theme', prev);
  }
  const tb = document.getElementById('dark-toggle-btn');
  if (tb) tb.textContent = on ? '\u263E ' + t('cfg_theme_dark') : '\u2600 ' + t('cfg_font_normal');
}

function applyCampoMode(D) {
  document.body.classList.toggle('campo-mode', D.settings.campoMode);
  document.body.classList.toggle('vet-mode', D.settings.vetMode);
  $('btn-campo')?.classList.toggle('active', D.settings.campoMode);
  $('btn-vet')?.classList.toggle('active', D.settings.vetMode);
  document.querySelectorAll('#main-nav a').forEach(a => {
    const s = a.dataset.section;
    if (D.settings.campoMode && !['dashboard', 'produccion', 'lotes', 'alimento', 'ambiente'].includes(s)) { a.classList.add('campo-hide'); }
    else if (D.settings.vetMode && !['dashboard', 'lotes', 'ambiente', 'sanidad', 'bioseguridad', 'trazabilidad'].includes(s)) { a.classList.add('campo-hide'); }
    else { a.classList.remove('campo-hide'); }
  });
  document.querySelectorAll('.nav-group-label').forEach(lbl => {
    const grp = lbl.nextElementSibling;
    if (!grp || !grp.classList.contains('nav-group-links')) return;
    const allHidden = Array.from(grp.querySelectorAll('a[data-section]')).every(a => a.classList.contains('campo-hide'));
    lbl.classList.toggle('campo-hide', allHidden);
    grp.classList.toggle('campo-hide', allHidden);
  });
}

function applyRoleNav() {
  const user = getCurrentUser();
  if (!user || !user.role) return;
  document.querySelectorAll('#main-nav a[data-section]').forEach(a => {
    const section = a.getAttribute('data-section');
    if (!hasPermission(section)) { a.style.display = 'none'; } else { a.style.display = ''; }
  });
  document.querySelectorAll('.nav-group-label').forEach(lbl => {
    const grp = lbl.nextElementSibling;
    if (!grp || !grp.classList.contains('nav-group-links')) return;
    const allHidden = Array.from(grp.querySelectorAll('a[data-section]')).every(a => a.style.display === 'none');
    lbl.style.display = allHidden ? 'none' : '';
    grp.style.display = allHidden ? 'none' : '';
  });
  const saGroup = document.getElementById('nav-superadmin-group');
  if (saGroup) saGroup.style.display = (user.role === 'superadmin') ? '' : 'none';
  if (user.role === 'superadmin') {
    document.querySelectorAll('.nav-group-label').forEach(lbl => {
      const grp = lbl.nextElementSibling;
      if (!grp || !grp.classList.contains('nav-group-links')) return;
      if (grp.dataset.grp === 'superadmin') return;
      lbl.classList.remove('grp-open');
      grp.classList.remove('grp-open');
    });
  }
}

function applyCustomPermissions() {
  const D = Store.get();
  if (!D.settings.customPermissions) return;
  Object.entries(D.settings.customPermissions).forEach(([role, perms]) => {
    ROLE_PERMISSIONS[role] = perms;
  });
}

function checkBillingCycleDeactivations() {
  const D = Store.get();
  const today = todayStr();
  let changed = false;
  D.users.forEach(u => {
    if (u.status === 'active' && u.isExtra && u.nextBillingDate && u.nextBillingDate <= today) {
      u.status = 'inactive';
      u.deactivatedAt = today;
      u.deactivatedBy = 'system_billing';
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
          if (!still) {
            u.status = 'expired';
            logAudit('activation_expired', 'users', 'Pending activation expired: ' + u.name, null, null);
            changed = true;
          }
        }
      });
    }
  }
  if (changed) Store.save(D);
}

// ─── Sync functions ───
function _saveSyncSnapshot(D) {
  const snap = {};
  for (const [key, fn] of Object.entries(ENTITY_MAP)) {
    const records = fn(D);
    const m = {};
    for (const r of records) {
      const rid = r.id || r.date || JSON.stringify(r).substring(0, 64);
      m[rid] = JSON.stringify(r);
    }
    snap[key] = m;
  }
  try { safeSetItem('egglogu_sync_snapshot', JSON.stringify(snap)); } catch (e) { console.warn('[Sync] Snapshot save failed:', e.message); }
}

function _mergeServerChanges(D, changes) {
  const REVERSE_MAP = {
    farms: { target: () => D, merge: (t, r) => Object.assign(t.farm, r) },
    flocks: { target: () => D.flocks, isArray: true },
    production: { target: () => D.dailyProduction, isArray: true },
    vaccines: { target: () => D.vaccines, isArray: true },
    medications: { target: () => D.medications, isArray: true },
    outbreaks: { target: () => D.outbreaks, isArray: true },
    stress_events: { target: () => D.stressEvents, isArray: true },
    feed_purchases: { target: () => { if (!D.feed) D.feed = { purchases: [], consumption: [] }; return D.feed.purchases; }, isArray: true },
    feed_consumption: { target: () => { if (!D.feed) D.feed = { purchases: [], consumption: [] }; return D.feed.consumption; }, isArray: true },
    clients: { target: () => D.clients, isArray: true },
    incomes: { target: () => { if (!D.finances) D.finances = { income: [], expenses: [], receivables: [] }; return D.finances.income; }, isArray: true },
    expenses: { target: () => { if (!D.finances) D.finances = { income: [], expenses: [], receivables: [] }; return D.finances.expenses; }, isArray: true },
    receivables: { target: () => { if (!D.finances) D.finances = { income: [], expenses: [], receivables: [] }; return D.finances.receivables; }, isArray: true },
    environment_readings: { target: () => D.environment, isArray: true },
    checklist_items: { target: () => D.checklist, isArray: true },
    logbook_entries: { target: () => D.logbook, isArray: true },
    personnel: { target: () => D.personnel, isArray: true },
  };
  for (const [key, records] of Object.entries(changes)) {
    if (!records || !records.length) continue;
    const mapping = REVERSE_MAP[key];
    if (!mapping) continue;
    if (mapping.merge) { for (const r of records) { mapping.merge(mapping.target(), r); } continue; }
    if (mapping.isArray) {
      const arr = mapping.target();
      for (const r of records) {
        const idx = arr.findIndex(x => x.id && x.id === r.id);
        if (idx >= 0) Object.assign(arr[idx], r);
        else arr.push(r);
      }
    }
  }
}

async function loadFromServer() {
  if (!apiService.isLoggedIn() || !navigator.onLine) return;
  try {
    const [syncResp, billing] = await Promise.all([
      apiService.syncToServer({ last_synced_at: _lastSyncTime, data: {} }).catch(() => null),
      apiService.getBillingStatus().catch(() => null),
    ]);
    const D = Store.get();
    if (syncResp && syncResp.server_changes) _mergeServerChanges(D, syncResp.server_changes);
    if (syncResp && syncResp.server_now) {
      _lastSyncTime = syncResp.server_now;
      safeSetItem('egglogu_last_sync', _lastSyncTime);
    }
    if (billing) {
      D.settings.plan = D.settings.plan || {};
      D.settings.plan.tier = billing.plan || 'enterprise';
      D.settings.plan.modules = billing.modules || [];
      D.settings.plan.status = billing.status || 'active';
      D.settings.plan.is_trial = billing.is_trial || false;
      D.settings.plan.trial_end = billing.trial_end || null;
      D.settings.plan.trial_days_left = billing.trial_days_left;
      D.settings.plan.discount_phase = billing.discount_phase || 0;
      D.settings.plan.months_subscribed = billing.months_subscribed || 0;
      D.settings.plan.current_price = billing.current_price || 0;
      D.settings.plan.base_price = billing.base_price || 0;
      D.settings.plan.next_price = billing.next_price || null;
      D.settings.plan.discount_pct = billing.discount_pct || 0;
      D.settings.plan.discount_label = billing.discount_label || '';
      D.settings.plan.billing_interval = billing.billing_interval || 'month';
      if (billing.current_period_end) D.settings.plan.nextBilling = billing.current_period_end;
    }
    Store.save(D);
    scheduleAutoBackup();
    _saveSyncSnapshot(D);
  } catch (e) {
    console.warn('[Server] Load failed, using local data:', e.message);
  }
}

async function syncToServer() {
  if (!apiService.isLoggedIn() || !navigator.onLine || _isSyncing) return;
  _isSyncing = true;
  try {
    const D = Store.get();
    let delta = {};
    let deltaCount = 0;
    if (!_lastSyncTime) {
      for (const [key, fn] of Object.entries(ENTITY_MAP)) { delta[key] = fn(D); }
      deltaCount = Object.values(delta).reduce((s, a) => s + a.length, 0);
    } else {
      let snap = {};
      try { snap = JSON.parse(localStorage.getItem('egglogu_sync_snapshot') || '{}'); } catch (e) { snap = {}; }
      for (const [key, fn] of Object.entries(ENTITY_MAP)) {
        const records = fn(D);
        const snapEntity = snap[key] || {};
        const changed = [];
        for (const r of records) {
          const rid = r.id || r.date || JSON.stringify(r).substring(0, 64);
          if (snapEntity[rid] !== JSON.stringify(r)) changed.push(r);
        }
        if (changed.length) delta[key] = changed;
        deltaCount += changed.length;
      }
    }
    if (deltaCount === 0) { _isSyncing = false; return; }
    const resp = await apiService.syncToServer({ last_synced_at: _lastSyncTime, data: delta });
    if (resp && resp.conflicts && resp.conflicts.length) {
      const n = resp.conflict_count || resp.conflicts.length;
      Bus.emit('toast', { msg: t('sync_conflicts').replace('{n}', n), type: 'error' });
    }
    if (resp && resp.server_changes) _mergeServerChanges(D, resp.server_changes);
    _lastSyncTime = resp && resp.server_now ? resp.server_now : new Date().toISOString();
    safeSetItem('egglogu_last_sync', _lastSyncTime);
    _saveSyncSnapshot(D);
    Store.save(D);
  } catch (e) {
    console.warn('[Sync] Failed, will retry:', e.message);
  } finally { _isSyncing = false; }
}

// ─── PIN lock countdown ───
function showPinLockCountdown(errEl) {
  if (!errEl) return;
  if (_pinLockCountdownTimer) clearInterval(_pinLockCountdownTimer);
  function update() {
    const rem = pinLockRemaining();
    if (rem <= 0) { errEl.style.display = 'none'; resetPinAttempts(); return; }
    const mins = Math.floor(rem / 60000);
    const secs = Math.floor((rem % 60000) / 1000);
    const isEs = (document.documentElement.lang || 'es').startsWith('es');
    errEl.textContent = isEs
      ? `Demasiados intentos. Intenta en ${mins}:${secs.toString().padStart(2, '0')}`
      : `Too many attempts. Try again in ${mins}:${secs.toString().padStart(2, '0')}`;
    errEl.style.display = 'block';
  }
  update();
  _pinLockCountdownTimer = setInterval(update, 1000);
}

// ─── Google Sign-In ───
async function signInWithGoogle() {
  // If no client ID cached, try fetching from backend on-demand
  if (!_GOOGLE_CLIENT_ID) {
    try {
      const cfg = await apiService.getAuthConfig();
      if (cfg.google_client_id) {
        _GOOGLE_CLIENT_ID = cfg.google_client_id;
        window._GOOGLE_CLIENT_ID = _GOOGLE_CLIENT_ID;
        localStorage.setItem('egglogu_google_client_id', _GOOGLE_CLIENT_ID);
      }
    } catch (e) { /* backend unreachable */ }
  }
  if (!_GOOGLE_CLIENT_ID) {
    alert('Google Sign-In no configurado. Verifica la conexión al servidor.');
    return;
  }
  if (typeof google === 'undefined' || !google.accounts) {
    alert('Google Sign-In cargando... intenta de nuevo en unos segundos.');
    setTimeout(signInWithGoogle, 500);
    return;
  }
  // Use popup token flow — works on localhost and all domains
  const client = google.accounts.oauth2.initTokenClient({
    client_id: _GOOGLE_CLIENT_ID,
    scope: 'openid email profile',
    callback: async (tokenResponse) => {
      if (!tokenResponse || tokenResponse.error) {
        Bus.emit('toast', { msg: 'Google Sign-In cancelled', type: 'warning' });
        return;
      }
      // Exchange Google access token for user info, then get ID token via backend
      try {
        const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + tokenResponse.access_token }
        }).then(r => r.json());
        // Send to backend — we pass the access_token, backend verifies via Google
        await handleGoogleAccessToken(tokenResponse.access_token, userInfo);
      } catch (e) {
        Bus.emit('toast', { msg: e.message || 'Google Sign-In error', type: 'error' });
      }
    }
  });
  client.requestAccessToken({ prompt: 'select_account' });
}

async function handleGoogleAccessToken(accessToken) {
  try {
    const isEs = (document.documentElement.lang || 'es').startsWith('es');
    const resp = await apiService.request('POST', '/auth/google', { access_token: accessToken });
    apiService.setTokens(resp.access_token, resp.refresh_token);
    const me = await apiService.getMe();
    setCurrentUser({ name: me.full_name, role: me.role, id: me.id, email: me.email });
    sessionStorage.setItem(AUTH_SESSION, 'true');
    await createLocalOAuthUser(me);
    $('login-screen')?.classList.add('hidden');
    const pinOverlay = $('pin-login-overlay');
    if (pinOverlay) pinOverlay.remove();
    const appEl = document.querySelector('.app');
    if (appEl) appEl.style.display = '';
    resetLoginAttempts();
    await initApp();
    await loadFromServer();
    Bus.emit('auth:ready');
    Bus.emit('toast', { msg: (isEs ? 'Bienvenido, ' : 'Welcome, ') + me.full_name + '!' });
  } catch (e) {
    const errEl = $('login-error') || $('signup-error') || $('pin-error');
    if (errEl) { errEl.textContent = e.message || 'Google Sign-In error'; errEl.style.display = 'block'; }
    else { Bus.emit('toast', { msg: e.message || 'Google Sign-In error', type: 'error' }); }
  }
}

async function handleGoogleCallback(response) {
  if (!response || !response.credential) { Bus.emit('toast', { msg: 'Google Sign-In failed', type: 'error' }); return; }
  try {
    const isEs = (document.documentElement.lang || 'es').startsWith('es');
    await apiService.googleAuth(response.credential);
    const me = await apiService.getMe();
    setCurrentUser({ name: me.full_name, role: me.role, id: me.id, email: me.email });
    sessionStorage.setItem(AUTH_SESSION, 'true');
    await createLocalOAuthUser(me);
    $('login-screen')?.classList.add('hidden');
    const pinOverlay = $('pin-login-overlay');
    if (pinOverlay) pinOverlay.remove();
    const appEl = document.querySelector('.app');
    if (appEl) appEl.style.display = '';
    resetLoginAttempts();
    await initApp();
    await loadFromServer();
    Bus.emit('auth:ready');
    Bus.emit('toast', { msg: (isEs ? 'Bienvenido, ' : 'Welcome, ') + me.full_name + '!' });
  } catch (e) {
    const errEl = $('login-error') || $('signup-error') || $('pin-error');
    if (errEl) { errEl.textContent = e.message || 'Google Sign-In error'; errEl.style.display = 'block'; }
    else { Bus.emit('toast', { msg: e.message || 'Google Sign-In error', type: 'error' }); }
  }
}

async function createLocalOAuthUser(me, provider = 'google') {
  const D = Store.get();
  const exists = D.users.some(u => u.email && u.email.toLowerCase() === me.email.toLowerCase());
  if (!exists) {
    const { hash: pinHash, salt: pinSalt } = await hashPin('0000');
    D.users.push({ id: me.id || genId(), name: me.full_name, email: me.email, role: me.role || 'owner', pinHash, pinSalt, oauth: provider, status: 'active', activatedAt: todayStr(), created: todayStr() });
    if (!D.settings.ownerEmail) D.settings.ownerEmail = me.email;
    Store.save(D);
  }
}

function signInWithApple() {
  Bus.emit('toast', { msg: 'Apple Sign-In estara disponible pronto', type: 'info' });
}

function _loadMsalScript() {
  return new Promise((resolve, reject) => {
    if (typeof msal !== 'undefined' && msal.PublicClientApplication) { resolve(); return; }
    if (document.querySelector('script[src*="msal-browser"]')) {
      const check = setInterval(() => {
        if (typeof msal !== 'undefined' && msal.PublicClientApplication) { clearInterval(check); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error('MSAL load timeout')); }, 10000);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js';
    s.onload = () => {
      const check = setInterval(() => {
        if (typeof msal !== 'undefined' && msal.PublicClientApplication) { clearInterval(check); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(check); reject(new Error('MSAL init timeout')); }, 5000);
    };
    s.onerror = () => reject(new Error('Failed to load MSAL'));
    document.head.appendChild(s);
  });
}

async function signInWithMicrosoft() {
  if (!_MICROSOFT_CLIENT_ID) {
    Bus.emit('toast', { msg: 'Microsoft Sign-In not configured', type: 'error' });
    return;
  }

  try {
    await _loadMsalScript();
  } catch (e) {
    Bus.emit('toast', { msg: 'Could not load Microsoft Sign-In library', type: 'error' });
    return;
  }

  try {
    if (!_msalInstance) {
      _msalInstance = new msal.PublicClientApplication({
        auth: {
          clientId: _MICROSOFT_CLIENT_ID,
          authority: 'https://login.microsoftonline.com/' + _MICROSOFT_TENANT_ID,
          redirectUri: window.location.origin + '/egglogu.html'
        },
        cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
      });
      await _msalInstance.initialize();
    }

    const loginResponse = await _msalInstance.loginPopup({
      scopes: ['User.Read', 'openid', 'profile', 'email'],
      prompt: 'select_account'
    });

    if (!loginResponse || !loginResponse.accessToken) {
      Bus.emit('toast', { msg: 'Microsoft Sign-In cancelled', type: 'warning' });
      return;
    }

    await handleMicrosoftCallback(loginResponse.accessToken);
  } catch (e) {
    if (e.errorCode === 'user_cancelled' || e.name === 'BrowserAuthError') {
      return;
    }
    const errEl = $('login-error') || $('signup-error') || $('pin-error');
    if (errEl) { errEl.textContent = e.message || 'Microsoft Sign-In error'; errEl.style.display = 'block'; }
    else { Bus.emit('toast', { msg: e.message || 'Microsoft Sign-In error', type: 'error' }); }
  }
}

async function handleMicrosoftCallback(accessToken) {
  try {
    const isEs = (document.documentElement.lang || 'es').startsWith('es');
    await apiService.microsoftAuth(accessToken);
    const me = await apiService.getMe();
    setCurrentUser({ name: me.full_name, role: me.role, id: me.id, email: me.email });
    sessionStorage.setItem(AUTH_SESSION, 'true');
    await createLocalOAuthUser(me, 'microsoft');
    $('login-screen')?.classList.add('hidden');
    const pinOverlay = $('pin-login-overlay');
    if (pinOverlay) pinOverlay.remove();
    const appEl = document.querySelector('.app');
    if (appEl) appEl.style.display = '';
    resetLoginAttempts();
    await initApp();
    await loadFromServer();
    Bus.emit('auth:ready');
    Bus.emit('toast', { msg: (isEs ? 'Bienvenido, ' : 'Welcome, ') + me.full_name + '!' });
  } catch (e) {
    const errEl = $('login-error') || $('signup-error') || $('pin-error');
    if (errEl) { errEl.textContent = e.message || 'Microsoft Sign-In error'; errEl.style.display = 'block'; }
    else { Bus.emit('toast', { msg: e.message || 'Microsoft Sign-In error', type: 'error' }); }
  }
}

// ─── Login ───
async function doLogin() {
  const user = $('login-user')?.value?.trim();
  const pass = $('login-pass')?.value;
  const errEl = $('login-error');
  const attempts = getLoginAttempts();

  if (isLoginLocked()) {
    const mins = Math.ceil((attempts.lockUntil - Date.now()) / 60000);
    errEl.textContent = t('login_locked') || `Account locked. Try again in ${mins} minute(s).`;
    return;
  }
  if (!user || !pass) { errEl.textContent = t('required') || 'Required'; return; }

  // Try server auth first
  if (navigator.onLine && user.includes('@')) {
    try {
      errEl.textContent = '';
      await apiService.login(user, pass);
      const me = await apiService.getMe();
      setCurrentUser({ name: me.full_name, role: me.role, id: me.id, email: me.email });
      sessionStorage.setItem(AUTH_SESSION, 'true');
      $('login-screen').classList.add('hidden');
      resetLoginAttempts();
      await initApp();
      await loadFromServer();
      Bus.emit('auth:ready');
      Bus.emit('toast', { msg: t('auth_welcome') || 'Bienvenido, ' + me.full_name + '!' });
      return;
    } catch (e) {
      if (e.message === 'offline') { /* fall through */ }
      else {
        const isNotVerified = e.message && e.message.toLowerCase().includes('not verified');
        if (isNotVerified) {
          const isEs = (document.documentElement.lang || 'es').startsWith('es');
          errEl.innerHTML = sanitizeHTML(isEs ? 'Email no verificado. Revisa tu bandeja de entrada.' : 'Email not verified. Check your inbox.')
            + '<br><a href="javascript:void(0)" onclick="window._authResendVerification(\'' + escapeAttr(user) + '\')" style="color:var(--primary,#1a73e8);font-size:13px">'
            + (isEs ? 'Reenviar correo de verificacion' : 'Resend verification email') + '</a>'
            + '<span id="resend-msg" style="display:block;font-size:12px;margin-top:4px"></span>';
        } else {
          errEl.textContent = e.message || t('auth_error') || 'Credenciales incorrectas';
        }
        $('login-pass').value = '';
        recordLoginFailure();
        return;
      }
    }
  }

  // Local auth fallback
  if (isFirstRun(apiService)) {
    const { hash, salt } = await hashPassword(pass);
    safeSetItem(AUTH_KEY, JSON.stringify({ user, hash, salt }));
    sessionStorage.setItem(AUTH_SESSION, 'true');
    $('login-screen').classList.add('hidden');
    await initApp();
    Bus.emit('auth:ready');
    Bus.emit('toast', { msg: t('auth_welcome') || 'Cuenta creada. Bienvenido!' });
    resetLoginAttempts();
    return;
  }

  const stored = JSON.parse(localStorage.getItem(AUTH_KEY));
  let match = false;
  if (stored.salt) {
    const { hash } = await hashPassword(pass, stored.salt);
    match = (stored.user === user && stored.hash === hash);
  } else {
    const enc = new TextEncoder().encode(pass);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const legacyHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (stored.user === user && stored.hash === legacyHash) {
      const { hash: newHash, salt: newSalt } = await hashPassword(pass);
      safeSetItem(AUTH_KEY, JSON.stringify({ user, hash: newHash, salt: newSalt }));
      match = true;
    }
  }

  if (match) {
    sessionStorage.setItem(AUTH_SESSION, 'true');
    $('login-screen').classList.add('hidden');
    resetLoginAttempts();
    await initApp();
    Bus.emit('auth:ready');
  } else {
    errEl.textContent = t('auth_error') || 'Credenciales incorrectas';
    $('login-pass').value = '';
    recordLoginFailure();
  }
}

function doLogout() {
  apiService.clearTokens();
  sessionStorage.removeItem(AUTH_SESSION);
  localStorage.removeItem('egglogu_current_user');
  location.reload();
}

function checkAuth() {
  if (isAuthenticated(apiService)) {
    $('login-screen').classList.add('hidden');
    return true;
  }
  $('login-screen').classList.remove('hidden');
  if (isFirstRun(apiService)) {
    const msg = $('login-setup-msg');
    if (msg) msg.textContent = t('auth_first_run') || 'Primera vez: ingrese usuario y contrasena para crear su cuenta.';
  }
  $('login-user')?.focus();
  return false;
}

// ─── PIN Login ───
function showPinLogin() {
  const D = Store.get();
  if (!D.users.length) return false;
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const appEl = document.querySelector('.app');
  if (appEl) appEl.style.display = 'none';
  const overlay = document.createElement('div');
  overlay.id = 'pin-login-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--sidebar-bg,#1a237e);display:flex;align-items:center;justify-content:center;z-index:25000;';
  let h = '<div style="max-width:360px;width:90%;">';
  h += '<a href="index.html" style="display:inline-block;margin-bottom:16px;color:#fff;text-decoration:none;font-size:14px;opacity:0.85;transition:opacity .2s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">';
  h += '&#8592; ' + (isEs ? 'Volver' : 'Back') + '</a>';
  h += '<div style="background:var(--card-bg,#fff);padding:32px;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">';
  h += '<h2 style="margin-bottom:4px">🥚 EGGlogU</h2><p style="color:var(--text-light);margin-bottom:20px">' + (t('pin_select_user') || 'Select user') + '</p>';
  h += '<div class="form-group"><select id="pin-user" style="width:100%;padding:10px;font-size:16px;border-radius:var(--radius);border:1px solid var(--border)">';
  D.users.forEach(u => { h += `<option value="${escapeAttr(u.id)}">${sanitizeHTML(u.name)} (${u.role})</option>`; });
  h += '</select></div>';
  h += '<div class="form-group" style="margin-top:12px"><input type="password" id="pin-code" maxlength="4" placeholder="PIN (4 digits)" style="width:100%;padding:10px;font-size:20px;text-align:center;letter-spacing:8px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<button onclick="window._authVerifyPin()" style="width:100%;padding:12px;background:var(--primary,#1a73e8);color:#fff;border:none;border-radius:var(--radius);font-size:16px;cursor:pointer;margin-top:8px">' + (t('pin_login') || 'Login') + '</button>';
  h += '<button onclick="window._authShowSignUp()" style="width:100%;padding:12px;background:transparent;color:var(--primary,#1a73e8);border:2px solid var(--primary,#1a73e8);border-radius:var(--radius);font-size:16px;cursor:pointer;margin-top:10px">' + (isEs ? 'Crear Cuenta' : 'Sign Up') + '</button>';
  h += '<div class="login-divider" style="margin:14px 0"><hr class="dm-divider" style="flex:1;border:none;border-top:1px solid #E0E0E0"><span style="color:#9E9E9E;font-size:13px;padding:0 12px">' + (isEs ? 'o conecta con' : 'or connect with') + '</span><hr class="dm-divider" style="flex:1;border:none;border-top:1px solid #E0E0E0"></div>';
  h += '<div style="display:flex;flex-direction:column;gap:8px">';
  h += '<button class="social-btn google social-btn-google" onclick="window._authSignInWithGoogle()" style="width:100%;padding:10px 16px;background:#fff;color:#444;border:1px solid #dadce0;border-radius:8px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Google</button>';
  h += '<button class="social-btn apple social-btn-apple" onclick="window._authSignInWithApple()" style="width:100%;padding:10px 16px;background:#000;color:#fff;border:1px solid #000;border-radius:8px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>Apple</button>';
  h += '<button class="social-btn microsoft social-btn-ms" onclick="window._authSignInWithMicrosoft()" style="width:100%;padding:10px 16px;background:#fff;color:#5E5E5E;border:1px solid #8C8C8C;border-radius:8px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="18" height="18" viewBox="0 0 23 23"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="12" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="12" width="10" height="10" fill="#00A4EF"/><rect x="12" y="12" width="10" height="10" fill="#FFB900"/></svg>Outlook</button>';
  h += '</div>';
  h += '<div style="margin-top:12px"><a href="javascript:void(0)" onclick="window._authShowForgotPin()" style="color:var(--text-light,#666);font-size:13px;text-decoration:underline;cursor:pointer">' + (isEs ? 'Restablecer PIN' : 'Reset PIN') + '</a>';
  h += ' &nbsp;|&nbsp; <a href="javascript:void(0)" onclick="window._authShowForgotPasswordFromPin()" style="color:var(--text-light,#666);font-size:13px;text-decoration:underline;cursor:pointer">' + (isEs ? '¿Olvidaste tu contraseña?' : 'Forgot password?') + '</a></div>';
  h += '<p id="pin-error" style="color:var(--danger,red);margin-top:8px;display:none"></p>';
  h += '</div></div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
  $('pin-code')?.focus();
  $('pin-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyPin(); });
  return true;
}

function showPinLoginRefresh() {
  const overlay = $('pin-login-overlay');
  if (overlay) overlay.remove();
  const appEl = document.querySelector('.app');
  if (appEl) appEl.style.display = 'none';
  showPinLogin();
}

async function verifyPin() {
  const errEl = $('pin-error');
  if (isPinLocked()) { showPinLockCountdown(errEl); return; }
  const D = Store.get();
  const uid = $('pin-user')?.value;
  const pin = $('pin-code')?.value || '';
  const user = D.users.find(u => u.id === uid);
  if (!user) { errEl.textContent = 'User not found'; errEl.style.display = 'block'; return; }

  let migrated = await migratePinIfNeeded(user);
  if (migrated) Store.save(D);

  if (user.pinHash) {
    const match = await verifyPinHash(pin, user.pinHash, user.pinSalt);
    if (!match) {
      recordPinFailure();
      if (isPinLocked()) { showPinLockCountdown(errEl); }
      else { errEl.textContent = (t('pin_invalid') || 'Invalid PIN') + ' (' + (5 - getLoginAttempts().count) + ' left)'; errEl.style.display = 'block'; }
      $('pin-code').value = '';
      $('pin-code')?.focus();
      logAudit('pin_fail', 'auth', 'Failed PIN attempt for: ' + user.name, null, {});
      return;
    }
  }

  resetPinAttempts();
  const userEmail = user.email || D.settings.ownerEmail || '';
  setCurrentUser({ name: user.name, role: user.role, id: user.id, email: userEmail });
  logAudit('login', 'auth', 'User login: ' + user.name + ' (' + getCurrentUser().role + ')', null, { user: user.name, role: getCurrentUser().role });
  const overlay = $('pin-login-overlay');
  if (overlay) overlay.remove();
  const appEl = document.querySelector('.app');
  if (appEl) appEl.style.display = '';
  applyRoleNav();
  Bus.emit('auth:ready');
}

// ─── Sign Up ───
function showSignUpFromLogin() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const overlay = document.createElement('div');
  overlay.id = 'pin-login-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--sidebar-bg,#1a237e);display:flex;align-items:center;justify-content:center;z-index:20001;';
  let h = '<div style="max-width:360px;width:90%;">';
  h += '<a href="javascript:void(0)" onclick="document.getElementById(\'pin-login-overlay\').remove()" style="display:inline-block;margin-bottom:16px;color:#fff;text-decoration:none;font-size:14px;opacity:0.85;transition:opacity .2s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">';
  h += '&#8592; ' + (isEs ? 'Volver al Login' : 'Back to Login') + '</a>';
  h += _signUpFormHTML(isEs);
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
  $('signup-name')?.focus();
}

function showSignUp() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const overlay = $('pin-login-overlay');
  if (!overlay) return;
  let h = '<div style="max-width:360px;width:90%;">';
  h += '<a href="javascript:void(0)" onclick="window._authShowPinLoginRefresh()" style="display:inline-block;margin-bottom:16px;color:#fff;text-decoration:none;font-size:14px;opacity:0.85;transition:opacity .2s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">';
  h += '&#8592; ' + (isEs ? 'Volver al Login' : 'Back to Login') + '</a>';
  h += _signUpFormHTML(isEs);
  overlay.innerHTML = h;
  $('signup-name')?.focus();
}

function _signUpFormHTML(isEs) {
  let h = '<div style="background:var(--card-bg,#fff);padding:32px;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">';
  h += '<h2 style="margin-bottom:4px">🥚 EGGlogU</h2><p style="color:var(--text-light);margin-bottom:20px">' + (isEs ? 'Crear nueva cuenta' : 'Create new account') + '</p>';
  h += '<div class="form-group" style="margin-bottom:10px"><input type="text" id="signup-name" placeholder="' + (isEs ? 'Nombre completo' : 'Full name') + '" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<div class="form-group" style="margin-bottom:10px"><input type="email" id="signup-email" placeholder="Email" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<div class="form-group" style="margin-bottom:10px"><input type="text" id="signup-org" placeholder="' + (isEs ? 'Nombre de la granja' : 'Farm/Organization name') + '" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<div class="form-group" style="margin-bottom:10px"><input type="password" id="signup-password" placeholder="' + (isEs ? 'Contrasena' : 'Password') + '" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<div class="form-group" style="margin-bottom:10px"><input type="password" id="signup-confirm" placeholder="' + (isEs ? 'Confirmar contrasena' : 'Confirm password') + '" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<div class="form-group" style="margin-bottom:10px"><input type="password" id="signup-pin" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="' + (isEs ? 'PIN offline (4 digitos)' : 'Offline PIN (4 digits)') + '" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border);text-align:center;letter-spacing:6px"></div>';
  h += '<p style="color:var(--text-light,#888);font-size:11px;margin:-6px 0 10px;text-align:center">' + (isEs ? 'Este PIN te permite acceder sin conexion' : 'This PIN lets you access the app offline') + '</p>';
  h += '<button onclick="window._authProcessSignUp()" style="width:100%;padding:12px;background:var(--primary,#1a73e8);color:#fff;border:none;border-radius:var(--radius);font-size:16px;cursor:pointer;margin-top:8px">' + (isEs ? 'Crear Cuenta' : 'Create Account') + '</button>';
  h += '<p id="signup-error" style="color:var(--danger,red);margin-top:8px;display:none"></p>';
  h += '<div class="login-divider" style="display:flex;align-items:center;gap:12px;margin:14px 0"><hr class="dm-divider" style="flex:1;border:none;border-top:1px solid #E0E0E0"><span style="color:#9E9E9E;font-size:13px">' + (isEs ? 'o registrate con' : 'or sign up with') + '</span><hr class="dm-divider" style="flex:1;border:none;border-top:1px solid #E0E0E0"></div>';
  h += '<div style="display:flex;gap:8px">';
  h += '<button class="social-btn-google" onclick="window._authSignInWithGoogle()" style="flex:1;padding:10px;background:#fff;color:#444;border:1px solid #dadce0;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 1px 3px rgba(0,0,0,.08)"><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Google</button>';
  h += '<button class="social-btn-apple" onclick="window._authSignInWithApple()" style="flex:1;padding:10px;background:#000;color:#fff;border:1px solid #000;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>Apple</button>';
  h += '<button class="social-btn-ms" onclick="window._authSignInWithMicrosoft()" style="flex:1;padding:10px;background:#fff;color:#5E5E5E;border:1px solid #8C8C8C;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px"><svg width="16" height="16" viewBox="0 0 23 23"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="12" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="12" width="10" height="10" fill="#00A4EF"/><rect x="12" y="12" width="10" height="10" fill="#FFB900"/></svg>Outlook</button>';
  h += '</div>';
  h += '</div></div>';
  return h;
}

async function processSignUp() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const name = ($('signup-name')?.value || '').trim();
  const email = ($('signup-email')?.value || '').trim();
  const password = ($('signup-password')?.value || '').trim();
  const confirm = ($('signup-confirm')?.value || '').trim();
  const pin = ($('signup-pin')?.value || '').trim();
  const orgNameEl = $('signup-org');
  const orgName = orgNameEl ? (orgNameEl.value || '').trim() : name;
  const errEl = $('signup-error');
  if (!errEl) return;
  errEl.style.display = 'none';

  if (!name) { errEl.textContent = isEs ? 'El nombre es obligatorio' : 'Name is required'; errEl.style.display = 'block'; return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = isEs ? 'Email invalido' : 'Invalid email'; errEl.style.display = 'block'; return; }
  if (password.length < 4) { errEl.textContent = isEs ? 'La contrasena debe tener al menos 4 caracteres' : 'Password must be at least 4 characters'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = isEs ? 'Las contrasenas no coinciden' : 'Passwords do not match'; errEl.style.display = 'block'; return; }
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) { errEl.textContent = isEs ? 'El PIN debe ser exactamente 4 digitos numericos' : 'PIN must be exactly 4 numeric digits'; errEl.style.display = 'block'; return; }

  const _utmData = {};
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach(k => { const v = localStorage.getItem(k); if (v) _utmData[k] = v; });

  if (navigator.onLine) {
    try {
      await apiService.register(email, password, name, orgName || name, Object.keys(_utmData).length ? _utmData : null);
      const D = Store.get();
      const { hash: _pinH, salt: _pinS } = await hashPin(pin);
      D.users.push({ id: genId(), name, email, role: 'owner', pinHash: _pinH, pinSalt: _pinS, status: 'pending_verification', created: todayStr() });
      if (!D.settings.ownerEmail) D.settings.ownerEmail = email;
      Store.save(D);
      logAudit('signup', 'auth', 'New user signup (server, pending verification): ' + name, null, { user: name, email });
      showVerificationPending(email, isEs);
      return;
    } catch (e) {
      if (e.message !== 'offline') {
        errEl.textContent = e.message === 'validation_error' ? (isEs ? 'Error de validacion' : 'Validation error') : e.message;
        errEl.style.display = 'block';
        return;
      }
    }
  }

  // Local-only signup
  const D = Store.get();
  if (D.users.some(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
    errEl.textContent = isEs ? 'Este email ya esta registrado' : 'This email is already registered';
    errEl.style.display = 'block';
    return;
  }
  const { hash: _localPinH, salt: _localPinS } = await hashPin(pin);
  const newUser = { id: genId(), name, email, role: 'owner', pinHash: _localPinH, pinSalt: _localPinS, status: 'active', activatedAt: todayStr(), created: todayStr() };
  D.users.push(newUser);
  if (!D.settings.ownerEmail) D.settings.ownerEmail = email;
  Store.save(D);
  logAudit('signup', 'auth', 'New user signup (local): ' + name + ' (owner)', null, { user: name, role: 'owner', email });
  setCurrentUser({ name: newUser.name, role: newUser.role, id: newUser.id, email: newUser.email });
  const overlay = $('pin-login-overlay');
  if (overlay) overlay.remove();
  const appEl = document.querySelector('.app');
  if (appEl) appEl.style.display = '';
  applyRoleNav();
  Bus.emit('auth:ready');
  Bus.emit('toast', { msg: isEs ? 'Cuenta creada localmente' : 'Account created locally' });
}

function showVerificationPending(email, isEs) {
  const overlay = $('pin-login-overlay') || document.createElement('div');
  overlay.id = 'pin-login-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--sidebar-bg,#1a237e);display:flex;align-items:center;justify-content:center;z-index:25000;';
  let h = '<div style="max-width:400px;width:90%;">';
  h += '<div style="background:var(--card-bg,#fff);padding:32px;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">';
  h += '<div style="font-size:3em;margin-bottom:8px">📧</div>';
  h += '<h2 style="margin-bottom:8px;color:var(--primary,#1a73e8)">' + (isEs ? 'Revisa tu correo' : 'Check your email') + '</h2>';
  h += '<p style="color:var(--text-light);margin-bottom:6px;font-size:14px">' + (isEs ? 'Enviamos un enlace de verificacion a:' : 'We sent a verification link to:') + '</p>';
  h += '<p style="font-weight:600;margin-bottom:20px;word-break:break-all">' + sanitizeHTML(email) + '</p>';
  h += '<p style="color:var(--text-light);font-size:13px;margin-bottom:20px">' + (isEs ? 'Haz clic en el enlace del correo para activar tu cuenta. Luego vuelve aqui para iniciar sesion.' : 'Click the link in the email to activate your account. Then come back here to log in.') + '</p>';
  h += '<button id="resend-verify-btn" onclick="window._authResendVerification(\'' + escapeAttr(email) + '\')" style="width:100%;padding:12px;background:transparent;color:var(--primary,#1a73e8);border:2px solid var(--primary,#1a73e8);border-radius:var(--radius);font-size:14px;cursor:pointer;margin-bottom:10px">' + (isEs ? 'Reenviar correo de verificacion' : 'Resend verification email') + '</button>';
  h += '<button onclick="window._authShowPinLoginRefresh()" style="width:100%;padding:12px;background:var(--primary,#1a73e8);color:#fff;border:none;border-radius:var(--radius);font-size:16px;cursor:pointer">' + (isEs ? 'Ir al Login' : 'Go to Login') + '</button>';
  h += '<p id="resend-msg" style="color:var(--success,#4caf50);margin-top:10px;font-size:13px;display:none"></p>';
  h += '</div></div>';
  overlay.innerHTML = h;
  if (!overlay.parentNode) document.body.appendChild(overlay);
}

async function resendVerificationEmail(email) {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const btn = $('resend-verify-btn');
  const msg = $('resend-msg');
  if (btn) { btn.disabled = true; btn.textContent = isEs ? 'Enviando...' : 'Sending...'; }
  try {
    await apiService.resendVerification(email);
    if (msg) { msg.textContent = isEs ? 'Correo reenviado. Revisa tu bandeja de entrada.' : 'Email resent. Check your inbox.'; msg.style.color = 'var(--success,#4caf50)'; msg.style.display = 'block'; }
  } catch (e) {
    if (msg) { msg.textContent = e.message.includes('Too many') ? (isEs ? 'Espera 2 minutos antes de reenviar' : 'Wait 2 minutes before resending') : e.message; msg.style.color = 'var(--danger,red)'; msg.style.display = 'block'; }
  }
  if (btn) { btn.disabled = false; btn.textContent = isEs ? 'Reenviar correo de verificacion' : 'Resend verification email'; }
}

async function handleEmailVerification() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('verify');
  if (!token) return false;
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  window.history.replaceState({}, '', window.location.pathname);
  try {
    const resp = await apiService.verifyEmail(token);
    if (resp.access_token) {
      const me = await apiService.getMe();
      setCurrentUser({ name: me.full_name, role: me.role, id: me.id, email: me.email });
      sessionStorage.setItem(AUTH_SESSION, 'true');
      const D = Store.get();
      const localUser = D.users.find(u => u.email && u.email.toLowerCase() === me.email.toLowerCase());
      if (localUser) { localUser.status = 'active'; localUser.activatedAt = todayStr(); localUser.id = me.id; Store.save(D); }
      Bus.emit('toast', { msg: isEs ? 'Email verificado. Bienvenido a EGGlogU!' : 'Email verified. Welcome to EGGlogU!' });
      return true;
    }
  } catch (e) {
    Bus.emit('toast', { msg: isEs ? 'Token de verificacion invalido o expirado' : 'Invalid or expired verification token', type: 'error' });
  }
  return false;
}

// ─── Forgot PIN ───
function showForgotPin() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const overlay = $('pin-login-overlay');
  if (!overlay) return;
  let h = '<div style="max-width:360px;width:90%;">';
  h += '<a href="javascript:void(0)" onclick="window._authShowPinLoginRefresh()" style="display:inline-block;margin-bottom:16px;color:#fff;text-decoration:none;font-size:14px;opacity:0.85;transition:opacity .2s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">';
  h += '&#8592; ' + (isEs ? 'Volver al Login' : 'Back to Login') + '</a>';
  h += '<div style="background:var(--card-bg,#fff);padding:32px;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">';
  h += '<h2 style="margin-bottom:4px">' + (isEs ? 'Restablecer PIN' : 'Reset PIN') + '</h2>';
  h += '<p style="color:var(--text-light);margin-bottom:20px">' + (isEs ? 'Ingresa tu email y un nuevo PIN' : 'Enter your email and a new PIN') + '</p>';
  h += '<div class="form-group" style="margin-bottom:12px"><input type="email" id="forgot-email" placeholder="Email" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<div class="form-group" style="margin-bottom:12px"><input type="password" id="forgot-new-pin" maxlength="4" inputmode="numeric" placeholder="' + (isEs ? 'Nuevo PIN (4 digitos)' : 'New PIN (4 digits)') + '" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border);text-align:center;letter-spacing:6px"></div>';
  h += '<div class="form-group" style="margin-bottom:12px"><input type="password" id="forgot-confirm-pin" maxlength="4" inputmode="numeric" placeholder="' + (isEs ? 'Confirmar PIN' : 'Confirm PIN') + '" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border);text-align:center;letter-spacing:6px"></div>';
  h += '<button onclick="window._authProcessForgotPin()" style="width:100%;padding:12px;background:var(--primary,#1a73e8);color:#fff;border:none;border-radius:var(--radius);font-size:16px;cursor:pointer">' + (isEs ? 'Restablecer PIN' : 'Reset PIN') + '</button>';
  h += '<p id="forgot-error" style="color:var(--danger,red);margin-top:8px;display:none"></p>';
  h += '<div id="forgot-result" style="display:none;margin-top:16px;padding:16px;background:var(--bg,#f5f5f5);border-radius:var(--radius);color:var(--success,#2e7d32);font-weight:500"></div>';
  h += '</div></div>';
  overlay.innerHTML = h;
  $('forgot-email')?.focus();
  $('forgot-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') processForgotPin(); });
}

async function processForgotPin() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const email = ($('forgot-email')?.value || '').trim().toLowerCase();
  const newPin = ($('forgot-new-pin')?.value || '').trim();
  const confirmPin = ($('forgot-confirm-pin')?.value || '').trim();
  const errEl = $('forgot-error');
  const resEl = $('forgot-result');
  if (!errEl || !resEl) return;
  errEl.style.display = 'none';
  resEl.style.display = 'none';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = isEs ? 'Ingresa un email valido' : 'Enter a valid email'; errEl.style.display = 'block'; return; }
  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { errEl.textContent = isEs ? 'El PIN debe ser exactamente 4 digitos' : 'PIN must be exactly 4 digits'; errEl.style.display = 'block'; return; }
  if (newPin !== confirmPin) { errEl.textContent = isEs ? 'Los PINs no coinciden' : 'PINs do not match'; errEl.style.display = 'block'; return; }
  const D = Store.get();
  const matched = D.users.find(u => (u.email || '').toLowerCase() === email);
  const ownerMatch = !matched && D.settings.ownerEmail && D.settings.ownerEmail.toLowerCase() === email ? D.users.find(u => u.role === 'owner') : null;
  const user = matched || ownerMatch;
  if (!user) { errEl.textContent = isEs ? 'No se encontro ninguna cuenta con ese email' : 'No account found with that email'; errEl.style.display = 'block'; return; }
  const { hash, salt } = await hashPin(newPin);
  user.pinHash = hash;
  user.pinSalt = salt;
  delete user.pin;
  Store.save(D);
  resEl.textContent = isEs ? 'PIN actualizado exitosamente. Puedes iniciar sesion ahora.' : 'PIN updated successfully. You can log in now.';
  resEl.style.display = 'block';
  logAudit('pin_reset', 'auth', 'PIN reset for: ' + user.name, null, { email });
  setTimeout(() => showPinLoginRefresh(), 2000);
}

// ─── Forgot Password ───
function showForgotPasswordFromPin() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const overlay = $('pin-login-overlay');
  if (!overlay) return;
  let h = '<div style="max-width:360px;width:90%;">';
  h += '<a href="javascript:void(0)" onclick="window._authShowPinLoginRefresh()" style="display:inline-block;margin-bottom:16px;color:#fff;text-decoration:none;font-size:14px;opacity:0.85;transition:opacity .2s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">';
  h += '&#8592; ' + (isEs ? 'Volver al Login' : 'Back to Login') + '</a>';
  h += '<div style="background:var(--card-bg,#fff);padding:32px;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">';
  h += '<h2 style="margin-bottom:4px">🔒 ' + (isEs ? 'Restablecer Contrasena' : 'Reset Password') + '</h2>';
  h += '<p style="color:var(--text-light);margin-bottom:20px">' + (isEs ? 'Ingresa tu email y te enviaremos un enlace para restablecer tu contrasena.' : "Enter your email and we'll send a password reset link.") + '</p>';
  h += '<div class="form-group" style="margin-bottom:12px"><input type="email" id="forgot-pw-email" placeholder="Email" style="width:100%;padding:10px;font-size:15px;border-radius:var(--radius);border:1px solid var(--border)"></div>';
  h += '<button onclick="window._authProcessForgotPassword()" style="width:100%;padding:12px;background:var(--primary,#1a73e8);color:#fff;border:none;border-radius:var(--radius);font-size:16px;cursor:pointer">' + (isEs ? 'Enviar Enlace' : 'Send Reset Link') + '</button>';
  h += '<p id="forgot-pw-msg" style="font-size:13px;margin-top:12px;display:none"></p>';
  h += '</div></div>';
  overlay.innerHTML = h;
  $('forgot-pw-email')?.focus();
  $('forgot-pw-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') processForgotPassword(); });
}

function showForgotPassword() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const loginScreen = $('login-screen');
  if (loginScreen) {
    const card = loginScreen.querySelector('.login-card');
    if (card) {
      card.innerHTML = '<h2 style="color:var(--primary);margin-bottom:4px">🔒 ' + (isEs ? 'Restablecer Contrasena' : 'Reset Password') + '</h2>'
        + '<p class="dm-text-muted" style="color:#757575;font-size:13px;margin-bottom:24px">' + (isEs ? 'Ingresa tu email y te enviaremos un enlace para restablecer tu contrasena.' : "Enter your email and we'll send you a password reset link.") + '</p>'
        + '<input type="email" id="forgot-pw-email" class="dm-input" placeholder="Email" style="width:100%;padding:12px 16px;border:1px solid #E0E0E0;border-radius:var(--radius);font-size:15px;margin-bottom:12px">'
        + '<button onclick="window._authProcessForgotPassword()" class="login-btn" style="width:100%;padding:12px;background:var(--primary,#1a73e8);color:#fff;border:none;border-radius:var(--radius);font-size:16px;cursor:pointer;margin-top:8px">' + (isEs ? 'Enviar Enlace' : 'Send Reset Link') + '</button>'
        + '<p id="forgot-pw-msg" style="font-size:13px;margin-top:12px;display:none"></p>'
        + '<div style="margin-top:16px"><a href="javascript:void(0)" onclick="location.reload()" class="dm-text-muted" style="color:#757575;font-size:13px;text-decoration:underline;cursor:pointer">&#8592; ' + (isEs ? 'Volver al Login' : 'Back to Login') + '</a></div>';
      $('forgot-pw-email')?.focus();
      $('forgot-pw-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') processForgotPassword(); });
    }
  }
}

async function processForgotPassword() {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const email = ($('forgot-pw-email')?.value || '').trim().toLowerCase();
  const msgEl = $('forgot-pw-msg');
  if (!msgEl) return;
  msgEl.style.display = 'none';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msgEl.textContent = isEs ? 'Ingresa un email valido' : 'Enter a valid email';
    msgEl.style.color = 'var(--danger,red)';
    msgEl.style.display = 'block';
    return;
  }
  try {
    await apiService.forgotPassword(email);
    msgEl.innerHTML = '<span style="color:var(--success,#4caf50)">' + (isEs ? 'Si el email existe, recibiras un enlace para restablecer tu contrasena. Revisa tu bandeja de entrada.' : "If the email exists, you'll receive a password reset link. Check your inbox.") + '</span>';
    msgEl.style.display = 'block';
  } catch (e) {
    msgEl.textContent = e.message;
    msgEl.style.color = 'var(--danger,red)';
    msgEl.style.display = 'block';
  }
}

async function handlePasswordReset() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reset');
  if (!token) return false;
  window.history.replaceState({}, '', window.location.pathname);
  showResetPasswordForm(token);
  return true;
}

function showResetPasswordForm(token) {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const loginScreen = $('login-screen');
  if (loginScreen) {
    loginScreen.classList.remove('hidden');
    const card = loginScreen.querySelector('.login-card');
    if (card) {
      card.innerHTML = '<h2 style="color:var(--primary);margin-bottom:4px">🔑 ' + (isEs ? 'Nueva Contrasena' : 'New Password') + '</h2>'
        + '<p class="dm-text-muted" style="color:#757575;font-size:13px;margin-bottom:24px">' + (isEs ? 'Ingresa tu nueva contrasena.' : 'Enter your new password.') + '</p>'
        + '<input type="password" id="reset-pw-new" class="dm-input" placeholder="' + (isEs ? 'Nueva contrasena' : 'New password') + '" autocomplete="new-password" style="width:100%;padding:12px 16px;border:1px solid #E0E0E0;border-radius:var(--radius);font-size:15px;margin-bottom:12px">'
        + '<input type="password" id="reset-pw-confirm" class="dm-input" placeholder="' + (isEs ? 'Confirmar contrasena' : 'Confirm password') + '" autocomplete="new-password" style="width:100%;padding:12px 16px;border:1px solid #E0E0E0;border-radius:var(--radius);font-size:15px;margin-bottom:12px">'
        + '<button onclick="window._authProcessResetPassword(\'' + escapeAttr(token) + '\')" class="login-btn" style="width:100%;padding:12px;background:var(--primary,#1a73e8);color:#fff;border:none;border-radius:var(--radius);font-size:16px;cursor:pointer;margin-top:8px">' + (isEs ? 'Cambiar Contrasena' : 'Change Password') + '</button>'
        + '<p id="reset-pw-msg" style="font-size:13px;margin-top:12px;display:none"></p>';
      $('reset-pw-new')?.focus();
      $('reset-pw-confirm')?.addEventListener('keydown', e => { if (e.key === 'Enter') processResetPassword(token); });
    }
  }
}

async function processResetPassword(token) {
  const isEs = (document.documentElement.lang || 'es').startsWith('es');
  const newPw = ($('reset-pw-new')?.value || '').trim();
  const confirmPw = ($('reset-pw-confirm')?.value || '').trim();
  const msgEl = $('reset-pw-msg');
  if (!msgEl) return;
  msgEl.style.display = 'none';
  if (newPw.length < 4) { msgEl.textContent = isEs ? 'La contrasena debe tener al menos 4 caracteres' : 'Password must be at least 4 characters'; msgEl.style.color = 'var(--danger,red)'; msgEl.style.display = 'block'; return; }
  if (newPw !== confirmPw) { msgEl.textContent = isEs ? 'Las contrasenas no coinciden' : 'Passwords do not match'; msgEl.style.color = 'var(--danger,red)'; msgEl.style.display = 'block'; return; }
  try {
    await apiService.resetPassword(token, newPw);
    msgEl.innerHTML = '<span style="color:var(--success,#4caf50)">' + (isEs ? 'Contrasena actualizada. Redirigiendo al login...' : 'Password updated. Redirecting to login...') + '</span>';
    msgEl.style.display = 'block';
    logAudit('password_reset', 'auth', 'Password reset via email token');
    setTimeout(() => location.reload(), 2000);
  } catch (e) {
    msgEl.textContent = e.message || 'Invalid or expired token';
    msgEl.style.color = 'var(--danger,red)';
    msgEl.style.display = 'block';
  }
}

// ─── Master init ───
let _initDone = false;

async function initApp() {
  if (_initDone) return;

  const D = Store.get();

  // Migrate PINs
  if (D.users && D.users.length) {
    let migrated = false;
    for (const u of D.users) {
      if (u.pin && !u.pinHash) { const m = await migratePinIfNeeded(u); if (m) migrated = true; }
    }
    D.users.forEach(u => { if (u.password) { delete u.password; migrated = true; } });
    if (migrated) Store.save(D);
  }

  // Apply settings
  if (D.settings.fontScale && D.settings.fontScale !== 'normal') applyFontScale(D.settings.fontScale);
  if (D.settings.darkMode) {
    document.body.classList.add('dark-mode');
    const _dtb = document.getElementById('dark-toggle-btn');
    if (_dtb) _dtb.textContent = '\u263E ' + t('cfg_theme_dark');
  }
  applyCampoMode(D);
  applyCustomPermissions();
  checkBillingCycleDeactivations();

  _initDone = true;
}

async function bootAuth() {
  // DEV BYPASS — force superadmin, skip login (local only)
  const _devBypass = location.hostname === 'localhost' || location.protocol === 'file:';
  if (_devBypass) {
    console.log('[Auth] DEV BYPASS — forcing superadmin');
    setCurrentUser({ name: 'Jose Antonio', role: 'superadmin', id: 1, email: 'jadelsolara@pm.me' });
    try { document.getElementById('login-screen').classList.add('hidden'); } catch(_){}
    try { await initApp(); } catch(e) { console.warn('[Auth] initApp error:', e); }
    applyRoleNav();
    return true;
  }

  // Fetch OAuth client IDs from backend
  if (navigator.onLine) {
    try {
      const cfg = await apiService.getAuthConfig();
      if (cfg.google_client_id) {
        _GOOGLE_CLIENT_ID = cfg.google_client_id;
        window._GOOGLE_CLIENT_ID = _GOOGLE_CLIENT_ID;
        localStorage.setItem('egglogu_google_client_id', _GOOGLE_CLIENT_ID);
      }
      if (cfg.microsoft_client_id) {
        _MICROSOFT_CLIENT_ID = cfg.microsoft_client_id;
        localStorage.setItem('egglogu_microsoft_client_id', _MICROSOFT_CLIENT_ID);
      }
      if (cfg.microsoft_tenant_id) {
        _MICROSOFT_TENANT_ID = cfg.microsoft_tenant_id;
        localStorage.setItem('egglogu_microsoft_tenant_id', _MICROSOFT_TENANT_ID);
      }
    } catch (e) { /* offline or backend unavailable — use cached values */ }
  }

  // Handle password reset from URL
  if (await handlePasswordReset()) return;

  // Handle email verification from URL
  if (navigator.onLine) {
    const verified = await handleEmailVerification();
    if (verified) { /* tokens set — continue */ }
  }

  // Try token refresh
  if (apiService.getRefreshToken() && navigator.onLine) {
    const refreshed = await apiService.refresh();
    if (refreshed) {
      try {
        const me = await apiService.getMe();
        setCurrentUser({ name: me.full_name, role: me.role, id: me.id, email: me.email });
        sessionStorage.setItem(AUTH_SESSION, 'true');
      } catch (e) { /* proceed */ }
    }
  }

  // Auth gate
  if (!checkAuth()) return false;

  // Apply theme
  const savedTheme = localStorage.getItem('egglogu_theme');
  if (savedTheme && THEMES[savedTheme]) applyTheme(savedTheme);

  await initApp();

  const D = Store.get();
  const user = getCurrentUser();

  // JWT user — skip PIN
  if (apiService.isLoggedIn()) {
    // Ensure current user is set (may not be if token was still valid without refresh)
    if (!user.email) {
      let resolved = false;
      // Try API first
      try {
        const me = await apiService.getMe();
        if (me && me.email) {
          setCurrentUser({ name: me.full_name, role: me.role, id: me.id, email: me.email });
          resolved = true;
        }
      } catch (e) { console.warn('[Auth] getMe failed, trying JWT decode:', e.message); }
      // Fallback: decode JWT payload for email
      if (!resolved) {
        try {
          const token = apiService.getToken();
          if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.email || payload.sub) {
              setCurrentUser({ name: payload.full_name || payload.name || user.name, role: payload.role || user.role, id: payload.sub || user.id, email: payload.email || '' });
            }
          }
        } catch (e) { console.warn('[Auth] JWT decode fallback failed:', e.message); }
      }
    }
    applyRoleNav();
    loadFromServer();
    return true;
  }

  // PIN login if users exist
  if (D.users.length > 0) {
    showPinLogin();
    return 'pin';
  }

  return true;
}

// ─── Expose globals for inline onclick in PIN/signup overlays ───
window._authVerifyPin = verifyPin;
window._authShowSignUp = showSignUp;
window._authSignInWithGoogle = signInWithGoogle;
window._authSignInWithApple = signInWithApple;
window._authSignInWithMicrosoft = signInWithMicrosoft;
window._authShowForgotPin = showForgotPin;
window._authShowForgotPasswordFromPin = showForgotPasswordFromPin;
window._authShowPinLoginRefresh = showPinLoginRefresh;
window._authProcessSignUp = processSignUp;
window._authProcessForgotPin = processForgotPin;
window._authProcessForgotPassword = processForgotPassword;
window._authProcessResetPassword = processResetPassword;
window._authResendVerification = resendVerificationEmail;

// Expose for data-action handlers in HTML
window.doLogin = doLogin;
window.doLogout = doLogout;
window.signInWithGoogle = signInWithGoogle;
window.signInWithApple = signInWithApple;
window.signInWithMicrosoft = signInWithMicrosoft;
window.showSignUpFromLogin = showSignUpFromLogin;
window.showForgotPassword = showForgotPassword;

export {
  bootAuth,
  initApp,
  loadFromServer,
  syncToServer,
  doLogin,
  doLogout,
  checkAuth,
  applyTheme,
  applyFontScale,
  applyDarkMode,
  applyCampoMode,
  applyRoleNav,
  applyCustomPermissions,
  checkBillingCycleDeactivations,
  THEMES
};
