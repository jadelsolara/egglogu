// EGGlogU — App Shell Web Component
// Orchestrates routing, auth gate, init flow, theme, campo/vet mode, layout.

import { Bus } from '../core/bus.js';
import { Store } from '../core/store.js';
import { t, isRTL } from '../core/i18n.js';
import { hasPermission } from '../core/permissions.js';
import { scheduleAutoBackup } from '../core/helpers.js';

const SECTION_TAGS = {
  dashboard: 'egg-dashboard',
  lotes: 'egg-flocks',
  produccion: 'egg-production',
  sanidad: 'egg-sanidad',
  alimento: 'egg-feed',
  clientes: 'egg-clients',
  inventario: 'egg-inventory',
  finanzas: 'egg-finances',
  analisis: 'egg-analysis',
  operaciones: 'egg-operations',
  ambiente: 'egg-environment',
  carencias: 'egg-carencias',
  bienestar: 'egg-welfare',
  bioseguridad: 'egg-biosecurity',
  trazabilidad: 'egg-traceability',
  planificacion: 'egg-planning',
  reportes: 'egg-reportes',
  automatizacion: 'egg-automatizacion',
  soporte: 'egg-soporte',
  comunidad: 'egg-community',
  admin: 'egg-admin',
  config: 'egg-config',
  superadmin: 'egg-superadmin'
};

const HEAVY = new Set(['dashboard', 'analisis', 'finanzas', 'bioseguridad', 'trazabilidad', 'carencias', 'reportes', 'automatizacion', 'soporte', 'comunidad', 'admin', 'superadmin']);

class EggApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentSection = null;
    this._currentComponent = null;
    this._charts = {};
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; min-height: 100vh; font-family: var(--font, 'Inter', system-ui, sans-serif); }
        .app-layout { display: flex; width: 100%; min-height: 100vh; }
        .main-content { padding: 20px 30px; overflow-y: auto; background: var(--bg, #f5f7fa); margin-left: var(--sidebar-width, 240px); min-height: 100vh; width: calc(100vw - var(--sidebar-width, 240px)); max-width: calc(100vw - var(--sidebar-width, 240px)); box-sizing: border-box; overflow-x: hidden; }
        .section { display: none; }
        .section.active { display: block; }
        .loading-spinner {
          display: flex; align-items: center; justify-content: center; min-height: 200px;
        }
        .loading-spinner::after {
          content: ''; width: 40px; height: 40px; border: 4px solid var(--border, #e0e0e0);
          border-top-color: var(--primary, #4a7c59); border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .hamburger {
          display: none; position: fixed; top: 10px; left: 10px; z-index: 101;
          background: rgba(14,34,64,.92); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
          width: 44px; height: 44px; cursor: pointer;
          align-items: center; justify-content: center;
          box-shadow: 0 2px 12px rgba(0,0,0,.3);
        }
        .hamburger span {
          display: block; width: 22px; height: 2px; background: #fff;
          margin: 4px auto; border-radius: 2px; transition: .3s;
        }
        @media (max-width: 1024px) {
          .main-content { padding: 20px 20px; }
        }
        @media (max-width: 768px) {
          .hamburger { display: flex; }
          .main-content { margin-left: 0; width: 100vw; max-width: 100vw; padding: 60px 12px 20px; }
        }
        @media (max-width: 480px) {
          .main-content { padding: 56px 8px 16px; }
          .hamburger { top: 8px; left: 8px; width: 40px; height: 40px; }
        }
      </style>
      <div class="app-layout">
        <button class="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
        <egg-sidebar><img slot="logo" src="icons/icon-192.png" alt="EGGlogU" width="40" height="48" style="border-radius:50%;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,.25)"></egg-sidebar>
        <main class="main-content" id="content-area"></main>
      </div>
      <egg-toast></egg-toast>
      <egg-confirm></egg-confirm>
      <egg-void-dialog></egg-void-dialog>
      <egg-modal></egg-modal>
      <egg-data-import></egg-data-import>
    `;

    this._contentArea = this.shadowRoot.getElementById('content-area');

    // Listen for navigation events
    Bus.on('nav:request', (data) => this.navigate(data?.section || data));
    Bus.on('data:sync-needed', () => scheduleAutoBackup());
    Bus.on('lang:changed', () => this._refreshCurrent());

    // Initialize
    this._init();
  }

  _init() {
    // RTL support
    if (isRTL()) document.documentElement.dir = 'rtl';

    // Navigate to dashboard (auth already handled by bootAuth in main.js)
    this.navigate('dashboard');

    // Re-emit auth:ready so sidebar renders with correct user role
    // (original auth:ready fires before sidebar exists in DOM)
    setTimeout(() => Bus.emit('auth:ready'), 100);

    // Hamburger button
    const hamburger = this.shadowRoot.querySelector('.hamburger');
    if (hamburger) {
      hamburger.addEventListener('click', () => Bus.emit('sidebar:toggle'));
    }

    // Keyboard handlers
    this._setupKeyboard();

    // Swipe from left edge to open sidebar on mobile
    let _edgeX = 0;
    this._contentArea.addEventListener('touchstart', (e) => {
      _edgeX = e.touches[0].clientX;
    }, { passive: true });
    this._contentArea.addEventListener('touchend', (e) => {
      if (_edgeX < 30 && e.changedTouches[0].clientX - _edgeX > 80) {
        Bus.emit('sidebar:toggle');
      }
    }, { passive: true });

    // Auto-close sidebar when window resizes to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) Bus.emit('sidebar:close');
    });
  }

  navigate(section) {
    if (!section) section = 'dashboard';

    // Suspension gate
    const D = Store.get();
    const plan = D.settings.plan || {};
    if (plan.status === 'suspended' && section !== 'dashboard' && section !== 'config') {
      section = 'dashboard';
      Bus.emit('toast', { msg: t('trial_ended_title') || 'Trial ended', type: 'error' });
    }

    // Permission check
    if (!hasPermission(section)) {
      Bus.emit('toast', { msg: t('no_permission') || 'No permission', type: 'error' });
      return;
    }

    // Cleanup previous
    this._cleanup();

    this._currentSection = section;

    // Get or create component
    const tag = SECTION_TAGS[section];
    if (!tag) return;

    // Clear content area
    this._contentArea.innerHTML = '';

    if (HEAVY.has(section)) {
      // Show spinner, then render on next frame
      this._contentArea.innerHTML = '<div class="loading-spinner" aria-label="Loading"></div>';
      requestAnimationFrame(() => {
        this._contentArea.innerHTML = '';
        this._mountSection(tag);
      });
    } else {
      this._mountSection(tag);
    }

    // Emit for sidebar highlighting
    Bus.emit('nav:changed', { section });
  }

  _mountSection(tag) {
    const el = document.createElement(tag);
    this._currentComponent = el;
    this._contentArea.appendChild(el);
  }

  _cleanup() {
    // Destroy any Chart.js instances
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch (e) {} });
    this._charts = {};

    // Remove previous component
    if (this._currentComponent) {
      if (typeof this._currentComponent.cleanup === 'function') {
        this._currentComponent.cleanup();
      }
      this._currentComponent.remove();
      this._currentComponent = null;
    }
  }

  _refreshCurrent() {
    if (this._currentSection) {
      this.navigate(this._currentSection);
    }
  }

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        Bus.emit('modal:close');
        Bus.emit('confirm:close');
      }
    });
  }

  registerChart(id, chart) {
    this._charts[id] = chart;
  }
}

customElements.define('egg-app', EggApp);
export { EggApp };
