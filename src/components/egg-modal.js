// <egg-modal> — Generic modal dialog Web Component
// Replaces openModal/closeModal from the monolith
// Supports data-action event delegation for cross-component form handling

import { Bus } from '../core/bus.js';

let _modalBodyRef = null;

export function getModalBody() { return _modalBodyRef; }

export function modalQuery(selector) {
  return _modalBodyRef ? _modalBodyRef.querySelector(selector) : null;
}

export function modalQueryAll(selector) {
  return _modalBodyRef ? _modalBodyRef.querySelectorAll(selector) : [];
}

export function modalVal(id) {
  const el = _modalBodyRef?.querySelector('#' + id);
  return el ? el.value : '';
}

class EggModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._triggerEl = null;
    this._unsubs = [];
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,.5); display: flex; align-items: flex-start;
          justify-content: center; padding-top: 2vh; z-index: 5000;
          opacity: 0; pointer-events: none; transition: opacity .2s;
          overflow-y: auto;
        }
        .overlay.open { opacity: 1; pointer-events: auto; }
        .modal {
          background: var(--card, #fff); border-radius: 12px;
          max-width: 800px; width: 95%; max-height: 96vh;
          box-shadow: 0 20px 60px rgba(0,0,0,.3);
          display: flex; flex-direction: column;
          margin-bottom: 2vh;
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px; border-bottom: 1px solid var(--border, #E0E0E0);
        }
        .modal-title { font-size: 17px; font-weight: 700; color: var(--text, #212121); margin: 0; }
        .close-btn {
          background: none; border: none; font-size: 24px; cursor: pointer;
          color: var(--text-light, #757575); padding: 4px 8px; line-height: 1;
        }
        .close-btn:hover { color: var(--text, #212121); }
        .modal-body {
          padding: 16px 20px; overflow-y: auto; flex: 1;
        }
        .modal-body .form-row { display: flex; gap: 12px; margin-bottom: 8px; }
        .modal-body .form-row > .form-group { flex: 1; }
        .modal-body .form-row-3 { display: flex; gap: 12px; margin-bottom: 8px; }
        .modal-body .form-row-3 > .form-group { flex: 1; }
        .modal-body .form-group { margin-bottom: 8px; }
        .modal-body .form-group label { display: block; font-weight: 600; margin-bottom: 2px; font-size: 13px; color: var(--text, #212121); }
        .modal-body input, .modal-body select, .modal-body textarea {
          width: 100%; padding: 6px 10px; border: 1px solid var(--border, #E0E0E0);
          border-radius: 8px; font-size: 14px; background: var(--card, #fff);
          color: var(--text, #212121); box-sizing: border-box;
        }
        .modal-body textarea { min-height: 44px; resize: vertical; }
        .modal-body input:focus, .modal-body select:focus, .modal-body textarea:focus {
          outline: none; border-color: var(--primary, #4a7c59); box-shadow: 0 0 0 2px rgba(74,124,89,.2);
        }
        .modal-body .modal-footer {
          display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; padding-top: 10px;
          border-top: 1px solid var(--border, #E0E0E0);
        }
        .modal-body .btn {
          padding: 8px 20px; border-radius: 8px; border: none; font-size: 14px;
          font-weight: 600; cursor: pointer; transition: background .2s;
        }
        .modal-body .btn-primary { background: var(--primary, #4a7c59); color: #fff; }
        .modal-body .btn-primary:hover { filter: brightness(1.1); }
        .modal-body .btn-secondary { background: var(--border, #E0E0E0); color: var(--text, #212121); }
        .modal-body .btn-secondary:hover { filter: brightness(.95); }
        .modal-body .btn-danger { background: var(--danger, #C62828); color: #fff; }
        .modal-body .field-error { color: var(--danger, #C62828); font-size: 12px; margin-top: 2px; }
        .modal-body .checklist-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
        .modal-body .veng-panel .dm-error-box { background: #fee; border: 1px solid #f88; border-radius: 8px; padding: 10px; margin: 8px 0; }
        .modal-body .veng-panel .dm-warn-box { background: #fff8e1; border: 1px solid #ffc107; border-radius: 8px; padding: 10px; margin: 8px 0; }
        @media (max-width: 600px) {
          .modal-body .form-row, .modal-body .form-row-3 { flex-direction: column; }
        }
        :host-context(body.dark-mode) .modal { background: #2D2D2D; }
        :host-context(body.dark-mode) .modal-header { border-color: #424242; }
        :host-context(body.dark-mode) .modal-title { color: #E0E0E0; }
        :host-context(body.dark-mode) .modal-body input,
        :host-context(body.dark-mode) .modal-body select,
        :host-context(body.dark-mode) .modal-body textarea { background: #383838; color: #E0E0E0; border-color: #555; }
        :host-context(body.dark-mode) .modal-body .form-group label { color: #E0E0E0; }
      </style>
      <div class="overlay" role="dialog" aria-modal="true">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title"></h3>
            <button class="close-btn" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body"></div>
        </div>
      </div>
    `;

    const body = this.shadowRoot.querySelector('.modal-body');

    this.shadowRoot.querySelector('.close-btn').addEventListener('click', () => this.close());
    this.shadowRoot.querySelector('.overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    // Event delegation for data-action buttons inside modal body
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.action;
      if (action === 'cancel' || action === 'close') {
        this.close();
        return;
      }
      Bus.emit('modal:action', { action, ...btn.dataset });
    });

    // Event delegation for select onchange with data-change
    body.addEventListener('change', (e) => {
      const el = e.target.closest('[data-change]');
      if (!el) return;
      Bus.emit('modal:change', { change: el.dataset.change, value: el.value, target: el });
    });

    this._unsubs.push(
      Bus.on('modal:open', ({ title, body: bodyHTML }) => this.open(title, bodyHTML)),
      Bus.on('modal:close', () => this.close()),
      Bus.on('modal:update-body', ({ selector, html }) => {
        const el = body.querySelector(selector);
        if (el) el.innerHTML = html;
      })
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    _modalBodyRef = null;
  }

  open(title, bodyHTML) {
    this._triggerEl = document.activeElement;
    const body = this.shadowRoot.querySelector('.modal-body');
    this.shadowRoot.querySelector('.modal-title').textContent = title;
    body.innerHTML = bodyHTML;
    _modalBodyRef = body;
    this.shadowRoot.querySelector('.overlay').classList.add('open');
    setTimeout(() => {
      const first = body.querySelector('input, select, textarea');
      if (first) first.focus();
    }, 50);
    Bus.emit('modal:opened', { title });
  }

  close() {
    this.shadowRoot.querySelector('.overlay').classList.remove('open');
    _modalBodyRef = null;
    if (this._triggerEl && this._triggerEl.focus) this._triggerEl.focus();
    this._triggerEl = null;
    Bus.emit('modal:closed');
  }

  get isOpen() {
    return this.shadowRoot.querySelector('.overlay')?.classList.contains('open') || false;
  }
}

customElements.define('egg-modal', EggModal);
