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

// ── Void Dialog — ERP-grade annulment with mandatory reason ──

let _voidResolve = null;

class EggVoidDialog extends HTMLElement {
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
          max-width: 440px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,.2);
        }
        h4 { margin: 0 0 4px; font-size: 18px; color: var(--danger, #C62828); }
        .subtitle { margin: 0 0 16px; color: var(--text-light, #757575); font-size: 13px; }
        .msg { margin: 0 0 12px; color: var(--text, #212121); font-size: 14px; }
        label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: var(--text, #212121); }
        select, textarea {
          width: 100%; padding: 8px; border: 1px solid var(--border, #ddd);
          border-radius: 6px; font-size: 13px; box-sizing: border-box;
          background: var(--bg-card, #fff); color: var(--text, #212121);
        }
        textarea { resize: vertical; min-height: 60px; margin-top: 8px; }
        .error { color: var(--danger, #C62828); font-size: 12px; margin-top: 4px; display: none; }
        .error.show { display: block; }
        .btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
        .btns button {
          padding: 8px 20px; border-radius: 8px; border: none;
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .btn-void { background: var(--danger, #C62828); color: #fff; }
        .btn-void:disabled { opacity: .5; cursor: not-allowed; }
        .btn-cancel { background: var(--border, #E0E0E0); color: var(--text, #212121); }
        .warning-box {
          background: #FFF3E0; border: 1px solid #FFB74D; border-radius: 6px;
          padding: 10px 12px; margin-bottom: 14px; font-size: 12px; color: #E65100;
        }
        :host-context(body.dark-mode) .box { background: #2D2D2D; }
        :host-context(body.dark-mode) h4 { color: #EF5350; }
        :host-context(body.dark-mode) .msg, :host-context(body.dark-mode) label { color: #E0E0E0; }
        :host-context(body.dark-mode) .subtitle { color: #BDBDBD; }
        :host-context(body.dark-mode) .warning-box { background: #3E2723; border-color: #795548; color: #FFAB91; }
        :host-context(body.dark-mode) select, :host-context(body.dark-mode) textarea { background: #424242; color: #E0E0E0; border-color: #555; }
      </style>
      <div class="overlay" role="alertdialog" aria-modal="true">
        <div class="box">
          <h4 class="title"></h4>
          <p class="subtitle"></p>
          <div class="warning-box"></div>
          <p class="msg"></p>
          <label class="reason-label"></label>
          <select class="reason-select">
            <option value="">--</option>
          </select>
          <textarea class="reason-detail" placeholder=""></textarea>
          <div class="error"></div>
          <div class="btns">
            <button class="btn-cancel"></button>
            <button class="btn-void"></button>
          </div>
        </div>
      </div>
    `;

    this._unsubs.push(
      Bus.on('void:show', (opts) => this._show(opts))
    );

    const root = this.shadowRoot;
    root.querySelector('.btn-void').addEventListener('click', () => this._submit());
    root.querySelector('.btn-cancel').addEventListener('click', () => this._resolve(null));
    root.querySelector('.reason-select').addEventListener('change', () => this._validate());
    root.querySelector('.reason-detail').addEventListener('input', () => this._validate());
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  _show(opts) {
    const root = this.shadowRoot;
    const lang = (document.documentElement.lang || 'es').substring(0, 2);
    const isEs = lang === 'es' || lang === 'pt';

    root.querySelector('.title').textContent = opts.title || (isEs ? 'Anular Registro' : 'Void Record');
    root.querySelector('.subtitle').textContent = isEs
      ? 'Esta accion es irreversible. El registro quedara marcado como anulado.'
      : 'This action is irreversible. The record will be marked as voided.';
    root.querySelector('.warning-box').textContent = isEs
      ? 'Los registros anulados no se eliminan. Permanecen en el sistema para auditoria y trazabilidad, como en SAP/Oracle/Dynamics.'
      : 'Voided records are not deleted. They remain in the system for audit and traceability, as in SAP/Oracle/Dynamics.';
    root.querySelector('.msg').textContent = opts.msg || '';
    root.querySelector('.reason-label').textContent = isEs ? 'Motivo de anulacion *' : 'Void reason *';

    // Build reason options
    const reasons = opts.reasons || [
      { value: 'data_entry_error', label: isEs ? 'Error de ingreso de datos' : 'Data entry error' },
      { value: 'duplicate_entry', label: isEs ? 'Registro duplicado' : 'Duplicate entry' },
      { value: 'incorrect_amount', label: isEs ? 'Monto incorrecto' : 'Incorrect amount' },
      { value: 'wrong_date', label: isEs ? 'Fecha incorrecta' : 'Wrong date' },
      { value: 'wrong_category', label: isEs ? 'Categoria incorrecta' : 'Wrong category' },
      { value: 'cancelled_operation', label: isEs ? 'Operacion cancelada' : 'Cancelled operation' },
      { value: 'customer_request', label: isEs ? 'Solicitud del cliente' : 'Customer request' },
      { value: 'regulatory_requirement', label: isEs ? 'Requerimiento regulatorio' : 'Regulatory requirement' },
      { value: 'other', label: isEs ? 'Otro (especificar abajo)' : 'Other (specify below)' }
    ];
    const sel = root.querySelector('.reason-select');
    sel.innerHTML = `<option value="">-- ${isEs ? 'Seleccionar motivo' : 'Select reason'} --</option>` +
      reasons.map(r => `<option value="${r.value}">${r.label}</option>`).join('');

    root.querySelector('.reason-detail').value = '';
    root.querySelector('.reason-detail').placeholder = isEs ? 'Detalle adicional (obligatorio si selecciona "Otro")' : 'Additional detail (required if "Other" selected)';
    root.querySelector('.error').classList.remove('show');
    root.querySelector('.btn-void').textContent = opts.voidLabel || (isEs ? 'Anular' : 'Void');
    root.querySelector('.btn-void').disabled = true;
    root.querySelector('.btn-cancel').textContent = t('cancel') || (isEs ? 'Cancelar' : 'Cancel');
    root.querySelector('.overlay').classList.add('open');
    this._opts = opts;
  }

  _validate() {
    const root = this.shadowRoot;
    const reason = root.querySelector('.reason-select').value;
    const detail = root.querySelector('.reason-detail').value.trim();
    const valid = reason && (reason !== 'other' || detail.length >= 3);
    root.querySelector('.btn-void').disabled = !valid;
    root.querySelector('.error').classList.remove('show');
    return valid;
  }

  _submit() {
    if (!this._validate()) {
      const root = this.shadowRoot;
      const isEs = (document.documentElement.lang || 'es').startsWith('es');
      root.querySelector('.error').textContent = isEs ? 'Debe seleccionar un motivo' : 'Must select a reason';
      root.querySelector('.error').classList.add('show');
      return;
    }
    const root = this.shadowRoot;
    const reason = root.querySelector('.reason-select').value;
    const detail = root.querySelector('.reason-detail').value.trim();
    const fullReason = detail ? `${reason}: ${detail}` : reason;
    this._resolve(fullReason);
  }

  _resolve(reason) {
    this.shadowRoot.querySelector('.overlay').classList.remove('open');
    if (_voidResolve) {
      _voidResolve(reason);
      _voidResolve = null;
    }
  }
}

/**
 * Show void dialog. Returns Promise<string|null>.
 * string = void reason (confirmed), null = cancelled.
 */
export function showVoidDialog(msg, opts = {}) {
  return new Promise(resolve => {
    _voidResolve = resolve;
    Bus.emit('void:show', { msg, ...opts });
  });
}

customElements.define('egg-void-dialog', EggVoidDialog);
