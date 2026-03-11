// <egg-inv-reservations> — Reservations Sub-Component
// Extracted from egg-inventory.js: reservations tab render + CRUD

import {
  Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate
} from '../core/index.js';
import { kpi, showFieldError, clearFieldErrors, logAudit } from '../core/helpers.js';
import { todayStr, genId, validateForm } from '../core/utils.js';
import { modalVal } from './egg-modal.js';

const EGG_TYPES = ['S', 'M', 'L', 'XL', 'Jumbo'];

class EggInvReservations extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('modal:action', (ev) => this._onModalAction(ev)),
      Bus.on('data:changed', () => {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this.render(), 300);
      }),
      Bus.on('nav:inv-reservation-add', () => this._showReservationForm())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() {}

  _onModalAction(ev) {
    switch (ev.action) {
      case 'save-reservation': this._saveReservation(); break;
    }
  }

  render() {
    const D = Store.get();
    this.shadowRoot.innerHTML = this._styles() + this._renderReservationsTab(D);
    this._bindEvents();
  }

  // ═══════════════ RESERVATIONS TAB RENDER ═══════════════
  _renderReservationsTab(D) {
    const reservations = D.reservations || [];
    const active = reservations.filter(r => r.status === 'active');
    const fulfilled = reservations.filter(r => r.status === 'fulfilled');
    const cancelled = reservations.filter(r => r.status === 'cancelled');

    let h = '';

    // KPIs
    const totalReserved = active.reduce((s, r) => s + (r.qty || 0), 0);
    h += '<div class="kpi-grid kpi-grid-4">';
    h += kpi(t('inv_active_reservations') || 'Reservas Activas', fmtNum(active.length), '', active.length > 0 ? 'warning' : '');
    h += kpi(t('inv_reserved_units') || 'Unidades Reservadas', fmtNum(totalReserved), '', totalReserved > 0 ? 'warning' : '');
    h += kpi(t('inv_fulfilled') || 'Cumplidas', fmtNum(fulfilled.length));
    h += kpi(t('inv_cancelled') || 'Canceladas', fmtNum(cancelled.length));
    h += '</div>';

    // Active reservations
    h += `<div class="card"><div class="card-header-row">
      <h3>\uD83D\uDD12 ${t('inv_active_reservations') || 'Reservas Activas'}</h3>
      <button class="btn btn-primary btn-sm" data-action="add-reservation">\u2795 ${t('inv_reserve') || 'Reservar'}</button>
    </div>`;

    if (!active.length) {
      h += `<div class="empty-state"><p>${t('inv_no_reservations') || 'No hay reservas activas.'}</p></div>`;
    } else {
      h += '<div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('date')}</th><th>${t('cli_name') || 'Cliente'}</th><th>${t('fin_egg_type') || 'Tipo'}</th>`;
      h += `<th>${t('qty') || 'Cantidad'}</th><th>${t('inv_location') || 'Ubicación'}</th><th>${t('inv_due_date') || 'Fecha Entrega'}</th><th>${t('actions') || 'Acciones'}</th>`;
      h += '</tr></thead><tbody>';
      active.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).forEach(r => {
        const client = D.clients.find(c => c.id === r.clientId);
        const loc = (D.storageLocations || []).find(l => l.id === r.locationId);
        const isOverdue = r.dueDate && r.dueDate < todayStr();
        h += `<tr${isOverdue ? ' style="background:rgba(198,40,40,.06)"' : ''}>
          <td>${fmtDate(r.date)}</td>
          <td><strong>${client ? sanitizeHTML(client.name) : '-'}</strong></td>
          <td>${r.eggType || '-'}</td>
          <td style="font-weight:700">${fmtNum(r.qty)}</td>
          <td>${loc ? sanitizeHTML(loc.name) : '-'}</td>
          <td${isOverdue ? ' style="color:var(--danger);font-weight:700"' : ''}>${r.dueDate ? fmtDate(r.dueDate) : '-'}${isOverdue ? ' \u26A0\uFE0F' : ''}</td>
          <td>
            <button class="btn btn-sm btn-primary" data-action="fulfill-reservation" data-id="${escapeAttr(r.id)}">\u2705 ${t('inv_fulfill') || 'Cumplir'}</button>
            <button class="btn btn-sm btn-danger" data-action="cancel-reservation" data-id="${escapeAttr(r.id)}">\u274C</button>
          </td>
        </tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    // History (fulfilled + cancelled)
    const history = [...fulfilled, ...cancelled].sort((a, b) => (b.resolvedDate || b.date).localeCompare(a.resolvedDate || a.date));
    if (history.length) {
      h += `<div class="card"><h3>\uD83D\uDCCB ${t('history') || 'Historial'}</h3>`;
      h += '<div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('date')}</th><th>${t('cli_name') || 'Cliente'}</th><th>${t('fin_egg_type') || 'Tipo'}</th>`;
      h += `<th>${t('qty') || 'Cantidad'}</th><th>${t('status') || 'Estado'}</th><th>${t('inv_resolved') || 'Resuelta'}</th>`;
      h += '</tr></thead><tbody>';
      history.slice(0, 50).forEach(r => {
        const client = D.clients.find(c => c.id === r.clientId);
        const sFulfilled = r.status === 'fulfilled';
        h += `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${client ? sanitizeHTML(client.name) : '-'}</td>
          <td>${r.eggType || '-'}</td>
          <td>${fmtNum(r.qty)}</td>
          <td><span class="source-badge ${r.status}">${sFulfilled ? '\u2705 ' + (t('inv_fulfilled') || 'Cumplida') : '\u274C ' + (t('inv_cancelled') || 'Cancelada')}</span></td>
          <td>${r.resolvedDate ? fmtDate(r.resolvedDate) : '-'}</td>
        </tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    return h;
  }

  // ─────────────── RESERVATION FORM ───────────────
  _showReservationForm() {
    const D = Store.get();
    const locs = D.storageLocations || [];
    const title = '\uD83D\uDD12 ' + (t('inv_reserve') || 'Reservar Stock');
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>${t('cli_name') || 'Cliente'} *</label>
          <select id="res-client">
            <option value="">-- ${t('select') || 'Seleccionar'} --</option>
            ${D.clients.map(c => '<option value="' + escapeAttr(c.id) + '">' + sanitizeHTML(c.name) + '</option>').join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${t('date')}</label>
          <input type="date" id="res-date" value="${todayStr()}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t('fin_egg_type') || 'Tipo de Huevo'}</label>
          <select id="res-type">
            <option value="">-- ${t('all') || 'Cualquiera'} --</option>
            ${EGG_TYPES.map(tp => '<option value="' + tp + '">' + tp + '</option>').join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${t('qty') || 'Cantidad'} *</label>
          <input type="number" id="res-qty" min="1" step="1" placeholder="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t('inv_location') || 'Ubicación'}</label>
          <select id="res-location">
            <option value="">-- ${t('inv_any_location') || 'Cualquier ubicación'} --</option>
            ${locs.map(l => '<option value="' + escapeAttr(l.id) + '">' + sanitizeHTML(l.name) + '</option>').join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${t('inv_due_date') || 'Fecha Entrega'}</label>
          <input type="date" id="res-due">
        </div>
      </div>
      <div class="form-group">
        <label>${t('inv_adjust_notes') || 'Notas'}</label>
        <textarea id="res-notes" rows="2" placeholder="${t('optional') || 'Opcional'}"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-reservation">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title, body });
  }

  _saveReservation() {
    clearFieldErrors();
    const clientId = modalVal('res-client');
    const date = modalVal('res-date') || todayStr();
    const eggType = modalVal('res-type') || '';
    const qty = parseInt(modalVal('res-qty'), 10) || 0;
    const locationId = modalVal('res-location') || '';
    const dueDate = modalVal('res-due') || '';
    const notes = (modalVal('res-notes') || '').trim();

    const v = validateForm({
      'res-client': { value: clientId, rules: { required: true } },
      'res-qty': { value: modalVal('res-qty'), rules: { required: true, numeric: true, min: 1 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    const D = Store.get();
    if (!D.reservations) D.reservations = [];

    const reservation = {
      id: genId(), date, clientId, eggType, qty,
      locationId, dueDate, notes, status: 'active',
      resolvedDate: ''
    };
    D.reservations.push(reservation);
    logAudit('create', 'reservation', `Reserved ${qty} eggs for client ${clientId}`, reservation.id, reservation);
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('inv_reserved_saved') || 'Reserva creada' });
    this.render();
  }

  _fulfillReservation(resId) {
    const D = Store.get();
    const res = (D.reservations || []).find(r => r.id === resId);
    if (!res) return;
    res.status = 'fulfilled';
    res.resolvedDate = todayStr();

    // Create outgoing inventory record for the fulfilled reservation
    D.inventory.push({
      id: genId(), date: todayStr(), flockId: '', eggType: res.eggType || '',
      qtyIn: 0, qtyOut: res.qty, source: 'reservation',
      locationId: res.locationId || '', notes: 'Reservation fulfilled: ' + (res.notes || resId)
    });

    logAudit('fulfill', 'reservation', `Fulfilled reservation of ${res.qty} eggs`, resId);
    Store.save(D);
    Bus.emit('toast', { msg: t('inv_fulfilled') || 'Reserva cumplida' });
    this.render();
  }

  _cancelReservation(resId) {
    const D = Store.get();
    const res = (D.reservations || []).find(r => r.id === resId);
    if (!res) return;
    res.status = 'cancelled';
    res.resolvedDate = todayStr();
    logAudit('cancel', 'reservation', `Cancelled reservation of ${res.qty} eggs`, resId);
    Store.save(D);
    Bus.emit('toast', { msg: t('inv_cancelled') || 'Reserva cancelada' });
    this.render();
  }

  // ─────────────── EVENT BINDING ───────────────
  _bindEvents() {
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'add-reservation': this._showReservationForm(); return;
        case 'fulfill-reservation': this._fulfillReservation(btn.dataset.id); return;
        case 'cancel-reservation': this._cancelReservation(btn.dataset.id); return;
      }
    });
  }

  // ─────────────── STYLES ───────────────
  _styles() {
    return `<style>
      :host { display: block; }

      /* KPI Grid */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 12px; margin-bottom: 16px;
      }
      .kpi-grid-4 { grid-template-columns: repeat(4, 1fr); }
      .kpi-card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08);
      }
      .kpi-label { font-size: 12px; color: var(--text-light, #757575); margin-bottom: 4px; }
      .kpi-value { font-size: 22px; font-weight: 700; color: var(--text, #212121); }
      .kpi-sub { font-size: 12px; color: var(--text-light, #757575); margin-top: 2px; }
      .kpi-card.danger .kpi-value { color: var(--danger, #C62828); }
      .kpi-card.warning .kpi-value { color: var(--warning, #e65100); }

      /* Buttons */
      .btn {
        padding: 8px 16px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); background: var(--bg, #fff);
        cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity .2s;
      }
      .btn:hover { opacity: 0.85; }
      .btn-primary { background: var(--primary, #1565C0); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #C62828); color: #fff; border: none; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }

      /* Card */
      .card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }
      .card h3 { margin: 0 0 12px 0; color: var(--primary-dark, #0E2240); font-size: 15px; }
      .card-header-row {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px; flex-wrap: wrap; gap: 8px;
      }
      .card-header-row h3 { margin: 0; }

      /* Source badge */
      .source-badge {
        display: inline-block; padding: 2px 8px; border-radius: 12px;
        font-size: 11px; font-weight: 600; white-space: nowrap;
      }
      .source-badge.fulfilled { background: rgba(46,125,50,.1); color: #2E7D32; }
      .source-badge.cancelled { background: rgba(198,40,40,.1); color: #C62828; }

      /* Empty state */
      .empty-state { text-align: center; padding: 24px; color: var(--text-light); }

      /* Table */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }

      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
        .kpi-grid-4 { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .kpi-grid { grid-template-columns: 1fr; }
      }
    </style>`;
  }
}

customElements.define('egg-inv-reservations', EggInvReservations);
export { EggInvReservations };
