// <egg-sidebar> — Navigation sidebar Web Component
// Shadow DOM encapsulated, emits section navigation events via Bus

import { Bus } from '../core/bus.js';
import { t, getLang, switchLang, LANG_NAMES } from '../core/i18n.js';
import { Store } from '../core/store.js';
import { getCurrentUser, isSuperuserEmail, SUPERUSER_EMAIL } from '../core/permissions.js';
import { apiService } from '../core/api.js';

const NAV_STRUCTURE = [
  { type: 'link', section: 'dashboard', icon: '\uD83D\uDCCA', key: 'nav_dashboard' },
  { type: 'group', key: 'grp_production', grp: 'production', links: [
    { section: 'lotes', icon: '\uD83D\uDC14', key: 'nav_flocks' },
    { section: 'produccion', icon: '\uD83E\uDD5A', key: 'nav_production' },
    { section: 'alimento', icon: '\uD83C\uDF3E', key: 'nav_feed' },
    { section: 'ambiente', icon: '\uD83C\uDF21\uFE0F', key: 'nav_environment' },
  ]},
  { type: 'group', key: 'grp_health', grp: 'health', links: [
    { section: 'sanidad', icon: '\uD83D\uDC89', key: 'nav_health' },
    { section: 'bioseguridad', icon: '\uD83D\uDEE1\uFE0F', key: 'nav_biosecurity' },
    { section: 'bienestar', icon: '\uD83D\uDC3E', key: 'nav_welfare' },
  ]},
  { type: 'group', key: 'grp_commercial', grp: 'commercial', links: [
    { section: 'clientes', icon: '\uD83D\uDC65', key: 'nav_clients' },
    { section: 'inventario', icon: '\uD83D\uDCE6', key: 'nav_inventory' },
    { section: 'finanzas', icon: '\uD83D\uDCB0', key: 'nav_finances' },
  ]},
  { type: 'group', key: 'grp_management', grp: 'management', links: [
    { section: 'analisis', icon: '\uD83D\uDCC8', key: 'nav_analysis' },
    { section: 'operaciones', icon: '\uD83D\uDCCB', key: 'nav_operations' },
    { section: 'trazabilidad', icon: '\uD83D\uDD17', key: 'nav_traceability' },
    { section: 'planificacion', icon: '\uD83D\uDCC5', key: 'nav_planning' },
    { section: 'carencias', icon: '\uD83D\uDD0D', key: 'nav_census' },
    { section: 'reportes', icon: '\uD83D\uDCCA', key: 'nav_reports' },
    { section: 'automatizacion', icon: '\u26A1', key: 'nav_automation' },
  ]},
  { type: 'group', key: 'grp_system', grp: 'system', links: [
    { section: 'comunidad', icon: '\uD83D\uDCAC', key: 'nav_community' },
    { section: 'soporte', icon: '\uD83C\uDFA7', key: 'nav_support' },
    { section: 'admin', icon: '\uD83D\uDC51', key: 'nav_admin' },
    { section: 'config', icon: '\u2699\uFE0F', key: 'nav_config' },
  ]},
  { type: 'group', key: 'grp_superadmin', grp: 'superadmin', hidden: true, links: [
    { section: 'superadmin', icon: '\uD83D\uDD11', key: 'nav_superadmin' },
  ]},
];

const LANG_FLAGS = {
  es: '\uD83C\uDDE8\uD83C\uDDF1', en: '\uD83C\uDDFA\uD83C\uDDF8', pt: '\uD83C\uDDE7\uD83C\uDDF7', fr: '\uD83C\uDDEB\uD83C\uDDF7',
  de: '\uD83C\uDDE9\uD83C\uDDEA', it: '\uD83C\uDDEE\uD83C\uDDF9', ja: '\uD83C\uDDEF\uD83C\uDDF5', zh: '\uD83C\uDDE8\uD83C\uDDF3',
  ru: '\uD83C\uDDF7\uD83C\uDDFA', id: '\uD83C\uDDEE\uD83C\uDDE9', ar: '\uD83C\uDDF8\uD83C\uDDE6', ko: '\uD83C\uDDF0\uD83C\uDDF7',
  th: '\uD83C\uDDF9\uD83C\uDDED', vi: '\uD83C\uDDFB\uD83C\uDDF3'
};

class EggSidebar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentSection = 'dashboard';
    this._unsubs = [];
  }

  connectedCallback() {
    this._render();
    this._bindEvents();
    this._unsubs.push(
      Bus.on('nav:changed', ({ section }) => this._setActive(section)),
      Bus.on('lang:changed', () => this._render()),
      Bus.on('auth:ready', () => this._render())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  _render() {
    const lang = getLang();
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <aside class="sidebar" role="navigation" aria-label="Main Navigation">
        <div class="sidebar-logo" aria-label="EGGlogU 360">
          <slot name="logo"></slot>
          <div class="logo-text">
            <span class="logo-title">EGGlogU <span>360</span></span>
            <span class="logo-sub">${t('sidebar_subtitle')}</span>
          </div>
        </div>
        <nav role="menubar" aria-label="Modules">
          ${this._renderNav()}
        </nav>
        <div class="mode-toggles">
          <button class="mode-btn" data-action="campo">
            \uD83C\uDF3E <span>${t('nav_campo_mode')}</span>
          </button>
          <button class="mode-btn" data-action="vet">
            \uD83E\uDE7A <span>${t('nav_vet_mode')}</span>
          </button>
        </div>
        <div class="lang-collapse">
          <button class="lang-collapse-btn" data-action="toggleLang">
            \uD83C\uDF10 <span class="lang-current">${LANG_NAMES[lang] || lang}</span>
          </button>
          <div class="lang-grid">
            <div class="lang-grid-inner">
              ${Object.entries(LANG_FLAGS).map(([code, flag]) =>
                `<button data-lang="${code}" class="${code === lang ? 'active' : ''}">${flag} ${code.toUpperCase()}</button>`
              ).join('')}
            </div>
          </div>
        </div>
        <div style="padding:8px 12px;margin-top:auto">
          <button class="mode-btn logout-btn" data-action="logout" style="width:100%;background:rgba(198,40,40,.3);border-color:rgba(198,40,40,.4)">
            \uD83D\uDEAA <span>${t('logout')}</span>
          </button>
        </div>
      </aside>
    `;
    this._setActive(this._currentSection);
  }

  _renderNav() {
    let html = '';
    const user = getCurrentUser();
    const D = Store.get();
    let isSuperadmin = (user && user.role === 'superadmin') ||
      isSuperuserEmail(user && user.email) ||
      isSuperuserEmail(D.settings.ownerEmail) ||
      isSuperuserEmail(D.settings.email) ||
      (D.users || []).some(u => isSuperuserEmail(u.email));
    // Direct localStorage fallback — bypasses module timing issues
    if (!isSuperadmin) {
      try {
        const saved = JSON.parse(localStorage.getItem('egglogu_current_user'));
        if (saved && saved.email && saved.email.toLowerCase() === SUPERUSER_EMAIL) isSuperadmin = true;
      } catch (_) { /* ignore */ }
    }
    // JWT token fallback — reads directly from localStorage
    if (!isSuperadmin) {
      try {
        const tokens = JSON.parse(localStorage.getItem('egglogu_tokens'));
        if (tokens && tokens.access) {
          const p = JSON.parse(atob(tokens.access.split('.')[1]));
          if (p.email && p.email.toLowerCase() === SUPERUSER_EMAIL) isSuperadmin = true;
        }
      } catch (_) { /* ignore */ }
    }
    console.debug('[Sidebar] user:', JSON.stringify(user), 'isSuperadmin:', isSuperadmin);
    for (const item of NAV_STRUCTURE) {
      if (item.type === 'link') {
        html += `<a data-section="${item.section}" class="${item.section === this._currentSection ? 'active' : ''}" role="menuitem">
          <i>${item.icon}</i><span>${t(item.key)}</span></a>`;
      } else {
        if (item.hidden && !isSuperadmin) continue;
        const autoOpen = item.grp === 'superadmin' ? ' grp-open' : '';
        html += `<div class="nav-group-label${autoOpen}">${t(item.key)}</div>`;
        html += `<div class="nav-group-links${autoOpen}" data-grp="${item.grp}">`;
        for (const link of item.links) {
          html += `<a data-section="${link.section}" class="${link.section === this._currentSection ? 'active' : ''}" role="menuitem">
            <i>${link.icon}</i><span>${t(link.key)}</span></a>`;
        }
        html += '</div>';
      }
    }
    return html;
  }

  _setActive(section) {
    this._currentSection = section;
    const nav = this.shadowRoot.querySelector('nav');
    if (!nav) return;
    nav.querySelectorAll('a').forEach(a => {
      a.classList.toggle('active', a.dataset.section === section);
    });
  }

  _bindEvents() {
    const shadow = this.shadowRoot;

    // Nav link clicks
    shadow.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-section]');
      if (link) {
        const section = link.dataset.section;
        this._setActive(section);
        Bus.emit('nav:request', { section });
        // Close mobile sidebar
        shadow.querySelector('.sidebar')?.classList.remove('open');
        return;
      }

      // Language buttons
      const langBtn = e.target.closest('button[data-lang]');
      if (langBtn) {
        switchLang(langBtn.dataset.lang);
        return;
      }

      // Action buttons
      const actionBtn = e.target.closest('button[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'toggleLang') {
          shadow.querySelector('.lang-collapse')?.classList.toggle('open');
        } else if (action === 'campo') {
          Bus.emit('mode:campo');
        } else if (action === 'vet') {
          Bus.emit('mode:vet');
        } else if (action === 'logout') {
          Bus.emit('auth:logout');
        }
      }

      // Group label toggle
      const grpLabel = e.target.closest('.nav-group-label');
      if (grpLabel) {
        grpLabel.classList.toggle('grp-open');
        const next = grpLabel.nextElementSibling;
        if (next?.classList.contains('nav-group-links')) {
          next.classList.toggle('grp-open');
        }
      }
    });
  }

  /** Toggle open/close (for mobile hamburger) */
  toggle() {
    this.shadowRoot.querySelector('.sidebar')?.classList.toggle('open');
  }

  close() {
    this.shadowRoot.querySelector('.sidebar')?.classList.remove('open');
  }

  _styles() {
    return `
:host { display: block; }
.sidebar {
  width: 240px; background: var(--sidebar-bg, #0E2240); background-image: linear-gradient(180deg, transparent 0%, rgba(255,255,255,.04) 60%, rgba(255,255,255,.08) 100%); color: #fff;
  display: flex; flex-direction: column;
  position: fixed; height: 100vh; z-index: 100;
  transition: transform .3s;
}
.sidebar-logo {
  padding: 18px 16px; display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,.12);
}
.logo-text { display: flex; flex-direction: column; line-height: 1.1; }
.logo-title { font-size: 18px; font-weight: 700; letter-spacing: 1.5px; }
.logo-title span { color: #FF8F00; }
.logo-sub { font-size: 10px; font-weight: 400; opacity: .6; letter-spacing: .5px; margin-top: 2px; }
nav {
  flex: 1; padding: 10px 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.2) transparent;
}
nav::-webkit-scrollbar { width: 4px; }
nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 4px; }
nav a {
  display: flex; align-items: center; gap: 10px; padding: 9px 16px 9px 20px;
  color: rgba(255,255,255,.75); text-decoration: none; transition: all .2s ease;
  cursor: pointer; font-size: 13px; border-radius: 0 20px 20px 0; margin-right: 12px;
  font-weight: 400; letter-spacing: .2px;
}
nav a:hover { background: rgba(255,255,255,.08); color: #fff; }
nav a.active {
  background: linear-gradient(90deg, rgba(255,143,0,.18) 0%, rgba(255,143,0,.06) 100%);
  color: #fff; font-weight: 600; border-left: 3px solid #FF8F00;
  margin-left: -1px;
}
nav a i { font-style: normal; font-size: 17px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 8px; background: rgba(255,255,255,.06); transition: background .2s; }
nav a:hover i { background: rgba(255,255,255,.1); }
nav a.active i { background: rgba(255,143,0,.2); }
.nav-group-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px;
  color: rgba(255,255,255,.35); padding: 18px 20px 8px; cursor: pointer;
  user-select: none; transition: color .2s; display: flex; align-items: center; gap: 8px;
}
.nav-group-label::after {
  content: ''; flex: 1; height: 1px; background: rgba(255,255,255,.08); margin-left: 4px;
}
.nav-group-label:hover { color: rgba(255,255,255,.6); }
.nav-group-label::before {
  content: ''; width: 6px; height: 6px; border-right: 1.5px solid rgba(255,255,255,.5);
  border-bottom: 1.5px solid rgba(255,255,255,.5); display: inline-block;
  transition: transform .25s ease; transform: rotate(-45deg); flex-shrink: 0;
}
.nav-group-label.grp-open::before { transform: rotate(45deg); }
.nav-group-links { max-height: 0; overflow: hidden; transition: max-height .3s ease; }
.nav-group-links.grp-open { max-height: 600px; }
.mode-toggles { padding: 8px 12px; display: flex; gap: 6px; }
.mode-btn {
  background: rgba(255,255,255,.1); color: #fff;
  border: 1px solid rgba(255,255,255,.2); border-radius: 8px;
  padding: 6px 10px; font-size: 12px; cursor: pointer;
  flex: 1; text-align: center; transition: .2s;
}
.mode-btn:hover { background: rgba(255,255,255,.2); }
.mode-btn.active { background: #FF8F00; border-color: #FF8F00; font-weight: 600; }
.campo-hide { display: none !important; }
.lang-collapse { border-top: 1px solid rgba(255,255,255,.15); padding: 0 16px; }
.lang-collapse-btn {
  width: 100%; padding: 10px 0; background: none; border: none;
  color: rgba(255,255,255,.7); cursor: pointer; font-size: 12px;
  display: flex; align-items: center; justify-content: space-between;
}
.lang-collapse-btn:hover { color: #fff; }
.lang-collapse-btn::after { content: '\\25BE'; transition: transform .2s; }
.lang-collapse.open .lang-collapse-btn::after { transform: rotate(180deg); }
.lang-grid { max-height: 0; overflow: hidden; transition: max-height .3s ease; }
.lang-collapse.open .lang-grid { max-height: 280px; }
.lang-grid-inner {
  display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; padding: 8px 0 12px;
}
.lang-grid-inner button {
  padding: 4px 10px; border: 1px solid rgba(255,255,255,.4);
  background: transparent; color: #fff; border-radius: 4px;
  cursor: pointer; font-size: 11px; font-weight: 500;
  transition: all .2s; display: flex; align-items: center; gap: 4px;
}
.lang-grid-inner button:hover { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.7); }
.lang-grid-inner button.active { background: #fff; color: #0E2240; font-weight: 700; border-color: #fff; }
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
}
    `;
  }
}

customElements.define('egg-sidebar', EggSidebar);
