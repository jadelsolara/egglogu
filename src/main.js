// EGGlogU Modular Entry Point
// Replaces the monolith (egglogu.js) with modular web components

// 1. Register translations
import T from './i18n/translations.js';
import { registerTranslations, switchLang } from './core/i18n.js';
registerTranslations(T);

// 2. Import core modules (side-effect: registers exports)
import './core/index.js';

// 3. Import all web components (side-effect: registers custom elements)
import './components/egg-app.js';
import './components/egg-sidebar.js';
import './components/egg-modal.js';
import './components/egg-toast.js';
import './components/egg-confirm.js';
import './components/egg-dashboard.js';
import './components/egg-flocks.js';
import './components/egg-production.js';
import './components/egg-feed.js';
import './components/egg-clients.js';
import './components/egg-sanidad.js';
import './components/egg-inventory.js';
import './components/egg-inv-locations.js';
import './components/egg-inv-reservations.js';
import './components/egg-carencias.js';
import './components/egg-operations.js';
import './components/egg-traceability.js';
import './components/egg-biosecurity.js';
import './components/egg-welfare.js';
import './components/egg-finances.js';
import './components/egg-analysis.js';
import './components/egg-automatizacion.js';
import './components/egg-reportes.js';
import './components/egg-soporte.js';
import './components/egg-community.js';
import './components/egg-environment.js';
import './components/egg-planning.js';
import './components/egg-superadmin.js';
import './components/egg-admin.js';
import './components/egg-config.js';

// 4. Import auth boot module
import { bootAuth, syncToServer, applyDarkMode } from './boot/auth.js';
import { Bus } from './core/bus.js';
import { Store } from './core/store.js';
import { apiService } from './core/api.js';
import { scheduleAutoBackup } from './core/helpers.js';

// 4b. Mode event handlers (emitted by egg-sidebar shadow DOM)
Bus.on('mode:campo', () => {
  const D = Store.get();
  D.settings.campoMode = !D.settings.campoMode;
  if (D.settings.campoMode) D.settings.vetMode = false;
  Store.save(D);
  Bus.emit('nav:request', { section: 'dashboard' });
});
Bus.on('mode:vet', () => {
  const D = Store.get();
  D.settings.vetMode = !D.settings.vetMode;
  if (D.settings.vetMode) D.settings.campoMode = false;
  Store.save(D);
  Bus.emit('nav:request', { section: 'dashboard' });
});
Bus.on('mode:dark', () => {
  const D = Store.get();
  D.settings.darkMode = !D.settings.darkMode;
  Store.save(D);
  applyDarkMode(D.settings.darkMode);
});
Bus.on('auth:logout', () => {
  if (window.doLogout) window.doLogout();
});

// 5. Global error handler
window.onerror = function(msg, src, line, col, err) {
  console.error('[EGGlogU Error]', msg, src, line, col, err);
};
window.addEventListener('unhandledrejection', function(e) {
  console.error('[EGGlogU Unhandled Promise]', e.reason);
});

// 6. Data-action delegation for login screen (light DOM only)
// Sidebar/nav/lang/mode actions are handled inside Shadow DOM by egg-sidebar.js
document.addEventListener('click', function(e) {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const fn = actionEl.dataset.action;
    const actions = {
      doLogin: window.doLogin,
      signInWithGoogle: window.signInWithGoogle,
      signInWithApple: window.signInWithApple,
      signInWithMicrosoft: window.signInWithMicrosoft,
      showSignUpFromLogin: window.showSignUpFromLogin,
      showForgotPassword: window.showForgotPassword,
      doLogout: window.doLogout,
      toggleSidebar: function() { Bus.emit('sidebar:toggle'); },
      closeModal: function() { Bus.emit('modal:close'); },
      confirmNo: function() { Bus.emit('confirm:result', { value: false }); },
      confirmYes: function() { Bus.emit('confirm:result', { value: true }); },
    };
    if (actions[fn]) actions[fn]();
    return;
  }
});

// Enter on password field
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.id === 'login-pass') { window.doLogin && window.doLogin(); }
});

// 7. Boot
window.addEventListener('DOMContentLoaded', async () => {
  // Apply saved language
  const savedLang = localStorage.getItem('egglogu_lang');
  if (savedLang) switchLang(savedLang);

  // Listen for auth:ready from any login path (PIN, email, OAuth, signup)
  Bus.on('auth:ready', () => mountApp());

  // Run auth flow (handles login screen, PIN, token refresh)
  const authResult = await bootAuth();

  if (authResult === true) {
    // Fully authenticated — mount app directly
    mountApp();
  }
  // authResult === 'pin' or false: app mounts when auth:ready fires

  // Schedule sync on data changes
  Bus.on('data:sync-needed', () => {
    scheduleAutoBackup();
    syncToServer();
  });
});

let _appMounted = false;
function mountApp() {
  if (_appMounted) return;
  _appMounted = true;

  const contentArea = document.querySelector('.app');
  if (contentArea) {
    // Replace monolith content with modular app shell
    contentArea.innerHTML = '<egg-app></egg-app>';
  }

  // Fetch geo-targeted outbreak alerts and store in transient data
  fetchOutbreakAlerts();

  // Request geolocation for biosecurity, outbreak radius, and weather
  requestGeolocation();
}

async function fetchOutbreakAlerts() {
  try {
    if (!apiService.isLoggedIn()) return;
    const alerts = await apiService.getOutbreakAlerts();
    const D = Store.get();
    D._outbreakAlerts = alerts || [];
    Bus.emit('data:changed', { source: 'outbreak-alerts' });
  } catch (e) {
    // Offline or no farms with coords — silent fail, alerts just won't show
    console.debug('[OutbreakAlerts] Could not fetch:', e.message);
  }
}

function requestGeolocation() {
  if (!navigator.geolocation) return;
  const D = Store.get();
  // Only request if farm has no coordinates yet
  if (D.farm.lat && D.farm.lng) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const D = Store.get();
      if (!D.farm.lat && !D.farm.lng) {
        D.farm.lat = pos.coords.latitude;
        D.farm.lng = pos.coords.longitude;
        Store.save(D, 'geolocation');
        // Re-fetch outbreak alerts now that we have coordinates
        fetchOutbreakAlerts();
      }
    },
    (err) => {
      console.debug('[Geolocation] Denied or unavailable:', err.message);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

// Refresh outbreak alerts periodically (every 30 min)
setInterval(fetchOutbreakAlerts, 30 * 60 * 1000);

// 8. Web Vitals tracking
if ('PerformanceObserver' in window) {
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.debug('[Perf]', entry.name, Math.round(entry.startTime) + 'ms');
      }
    });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
    po.observe({ type: 'first-input', buffered: true });
    po.observe({ type: 'layout-shift', buffered: true });
  } catch (e) { /* not supported */ }
}
