// <egg-confirm> — Modal confirm dialog Web Component
// Replaces the custom confirm dialog from the monolith

import { Bus } from '../core/bus.js';
import { t } from '../core/i18n.js';

let _resolvePromise = null;

class EggConfirm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5); display: flex; align-items: center;
          justify-content: center; z-index: 9999;
          opacity: 0; pointer-events: none; transition: opacity .2s;
        }
        .overlay.open { opacity: 1; pointer-events: auto; }
        .box {
          background: var(--card, #fff); border-radius: 8px; padding: 24px;
          max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,.2);
          text-align: center;
        }
        h4 { margin: 0 0 8px; font-size: 18px; color: var(--text, #212121); }
        p { margin: 0 0 20px; color: var(--text-light, #757575); font-size: 14px; }
        .btns { display: flex; gap: 10px; justify-content: center; }
        .btns button {
          padding: 8px 24px; border-radius: 8px; border: none;
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .btn-yes { background: var(--danger, #C62828); color: #fff; }
        .btn-no { background: var(--border, #E0E0E0); color: var(--text, #212121); }
        :host-context(body.dark-mode) .box { background: #2D2D2D; color: #E0E0E0; }
        :host-context(body.dark-mode) h4 { color: #E0E0E0; }
        :host-context(body.dark-mode) p { color: #BDBDBD; }
      </style>
      <div class="overlay" role="alertdialog" aria-modal="true">
        <div class="box">
          <h4 class="title"></h4>
          <p class="msg"></p>
          <div class="btns">
            <button class="btn-yes"></button>
            <button class="btn-no"></button>
          </div>
        </div>
      </div>
    `;

    this._unsubs.push(
      Bus.on('confirm:show', ({ title, msg, yesLabel, noLabel }) => this._show(title, msg, yesLabel, noLabel))
    );

    this.shadowRoot.querySelector('.btn-yes').addEventListener('click', () => this._resolve(true));
    this.shadowRoot.querySelector('.btn-no').addEventListener('click', () => this._resolve(false));
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  _show(title, msg, yesLabel, noLabel) {
    this.shadowRoot.querySelector('.title').textContent = title || t('confirm_delete') || 'Confirm';
    this.shadowRoot.querySelector('.msg').textContent = msg || '';
    this.shadowRoot.querySelector('.btn-yes').textContent = yesLabel || t('delete') || 'Yes';
    this.shadowRoot.querySelector('.btn-no').textContent = noLabel || t('cancel') || 'Cancel';
    this.shadowRoot.querySelector('.overlay').classList.add('open');
  }

  _resolve(value) {
    this.shadowRoot.querySelector('.overlay').classList.remove('open');
    if (_resolvePromise) {
      _resolvePromise(value);
      _resolvePromise = null;
    }
    Bus.emit('confirm:result', { value });
  }
}

/**
 * Show a confirm dialog. Returns a Promise<boolean>.
 */
export function showConfirm(msg, title) {
  return new Promise(resolve => {
    _resolvePromise = resolve;
    Bus.emit('confirm:show', { title, msg });
  });
}

customElements.define('egg-confirm', EggConfirm);
