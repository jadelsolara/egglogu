// <egg-toast> — Toast notification Web Component
// Listens to Bus events, auto-shows and auto-hides

import { Bus } from '../core/bus.js';

class EggToast extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._timeout = null;
    this._unsubs = [];
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 30000; pointer-events: none; }
        .toast {
          padding: 12px 24px; border-radius: 8px;
          background: #323232; color: #fff; font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,.3);
          opacity: 0; transform: translateY(20px);
          transition: opacity .3s, transform .3s;
          pointer-events: auto; max-width: 90vw; text-align: center;
        }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast.error { background: #C62828; }
        .toast.warning { background: #F57F17; color: #000; }
        .toast.success { background: #2E7D32; }
        .toast.info { background: #1565C0; }
      </style>
      <div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
    `;
    this._unsubs.push(
      Bus.on('toast', ({ msg, type }) => this.show(msg, type))
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  show(msg, type = '') {
    const el = this.shadowRoot.querySelector('.toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => { el.className = 'toast'; }, 3000);
  }
}

customElements.define('egg-toast', EggToast);
