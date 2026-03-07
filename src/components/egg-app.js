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
  bioseguridad: 'egg-biosecurity',
  trazabilidad: 'egg-traceability',
  planificacion: 'egg-planning',
  reportes: 'egg-reportes',
  automatizacion: 'egg-automatizacion',
  soporte: 'egg-soporte',
  admin: 'egg-admin',
  config: 'egg-config',
  superadmin: 'egg-superadmin'
};

const HEAVY = new Set(['dashboard', 'analisis', 'finanzas', 'bioseguridad', 'trazabilidad', 'carencias', 'reportes', 'automatizacion', 'soporte', 'admin', 'superadmin']);

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
        .main-content { flex: 1; padding: 20px 30px; overflow-y: auto; background: var(--bg, #f5f7fa); margin-left: var(--sidebar-width, 240px); min-height: 100vh; }
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
        @media (max-width: 768px) {
          .main-content { margin-left: 0; padding: 60px 15px 20px; }
        }
      </style>
      <div class="app-layout">
        <egg-sidebar></egg-sidebar>
        <main class="main-content" id="content-area"></main>
      </div>
      <egg-toast></egg-toast>
      <egg-confirm></egg-confirm>
      <egg-modal></egg-modal>
    `;

    this._contentArea = this.shadowRoot.getElementById('content-area');

    // Listen for navigation events
    Bus.on('nav:request', (data) => this.navigate(data?.section || data));
    Bus.on('store:changed', () => scheduleAutoBackup());
    Bus.on('lang:changed', () => this._refreshCurrent());

    // Initialize
    this._init();
  }

  _init() {
    // RTL support
    if (isRTL()) document.documentElement.dir = 'rtl';

    // Navigate to dashboard (auth already handled by bootAuth in main.js)
    this.navigate('dashboard');

    // Keyboard handlers
    this._setupKeyboard();
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
