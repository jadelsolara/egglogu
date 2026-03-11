// <egg-inventory> — Egg Inventory Web Component
// Enhanced: adjustment modal, stock charts, flock analysis,
// storage locations (warehouse/rack), reservations for clients
// Sub-components: <egg-inv-locations>, <egg-inv-reservations>

import {
  Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate,
  emptyState, flockSelect, paginate
} from '../core/index.js';
import { kpi, showFieldError, clearFieldErrors, logAudit } from '../core/helpers.js';
import { todayStr, genId, validateForm } from '../core/utils.js';
import { modalVal, getModalBody } from './egg-modal.js';

const PAGE_SIZE = 50;
const EGG_TYPES = ['S', 'M', 'L', 'XL', 'Jumbo'];

class EggInventory extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._page = 1;
    this._tab = 'stock'; // stock | locations | reservations
    this._filters = { flockId: '', eggType: '', from: '', to: '', source: '', locationId: '' };
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('modal:action', (ev) => this._onModalAction(ev)),
      Bus.on('data:changed', () => {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this.render(), 300);
      })
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() {}

  // ─────────────── MODAL ACTIONS ───────────────
  _onModalAction(ev) {
    switch (ev.action) {
      case 'save-inv-adjustment': this._saveAdjustment(); break;
    }
  }

  // ─────────────── RENDER ───────────────
  render() {
    const D = Store.get();
    let h = this._styles();

    // Header with action buttons
    h += `<div class="page-header">
      <h2>${t('nav_inventory') || 'Inventario'}</h2>
      <div class="header-actions">
        <button class="btn btn-secondary" data-action="add-location">${t('inv_add_location') || 'Nueva Ubicación'}</button>
        <button class="btn btn-secondary" data-action="add-reservation">${t('inv_reserve') || 'Reservar'}</button>
        <button class="btn btn-primary" data-action="add-adjustment">${t('inv_adjustment') || 'Ajuste'}</button>
      </div>
    </div>`;

    // Tabs
    h += `<div class="tabs">
      <div class="tab${this._tab === 'stock' ? ' active' : ''}" data-tab="stock">${t('inv_stock') || 'Stock'}</div>
      <div class="tab${this._tab === 'locations' ? ' active' : ''}" data-tab="locations">${t('inv_locations') || 'Ubicaciones'}</div>
      <div class="tab${this._tab === 'reservations' ? ' active' : ''}" data-tab="reservations">${t('inv_reservations') || 'Reservas'}</div>
    </div>`;

    if (this._tab === 'stock') h += this._renderStockTab(D);
    else if (this._tab === 'locations') h += '<egg-inv-locations></egg-inv-locations>';
    else if (this._tab === 'reservations') h += '<egg-inv-reservations></egg-inv-reservations>';

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  // ═══════════════ STOCK TAB ═══════════════
  _renderStockTab(D) {
    let h = '';

    // Compute inventory totals
    const sorted = [...D.inventory].sort((a, b) => a.date.localeCompare(b.date));
    let totalIn = 0, totalOut = 0;
    const byType = {};
    const byFlock = {};
    const bySource = {};
    sorted.forEach(r => {
      totalIn += r.qtyIn || 0;
      totalOut += r.qtyOut || 0;
      const tp = r.eggType || 'M';
      if (!byType[tp]) byType[tp] = { in: 0, out: 0 };
      byType[tp].in += r.qtyIn || 0;
      byType[tp].out += r.qtyOut || 0;
      const fk = r.flockId || '';
      if (fk) {
        if (!byFlock[fk]) byFlock[fk] = { in: 0, out: 0 };
        byFlock[fk].in += r.qtyIn || 0;
        byFlock[fk].out += r.qtyOut || 0;
      }
      const src = r.source || 'production';
      if (!bySource[src]) bySource[src] = { in: 0, out: 0 };
      bySource[src].in += r.qtyIn || 0;
      bySource[src].out += r.qtyOut || 0;
    });

    const totalStock = totalIn - totalOut;
    const totalReserved = (D.reservations || []).filter(r => r.status === 'active').reduce((s, r) => s + (r.qty || 0), 0);
    const totalAvailable = totalStock - totalReserved;
    const locs = D.storageLocations || [];
    const locCount = locs.length;
    const totalCapacity = locs.reduce((s, l) => s + (l.capacity || 0), 0);
    const pctCapacity = totalCapacity > 0 ? (totalStock / totalCapacity * 100).toFixed(0) : '--';

    // KPIs
    h += '<div class="kpi-grid">';
    h += kpi(t('inv_total_stock') || 'Stock Total', fmtNum(totalStock), '', totalStock < 0 ? 'danger' : '');
    h += kpi(t('inv_total_in') || 'Entradas', fmtNum(totalIn));
    h += kpi(t('inv_total_out') || 'Salidas', fmtNum(totalOut));
    h += kpi(t('inv_reserved') || 'Reservado', fmtNum(totalReserved), '', totalReserved > 0 ? 'warning' : '');
    h += kpi(t('inv_available') || 'Disponible', fmtNum(totalAvailable), '', totalAvailable < 0 ? 'danger' : '');
    h += kpi(t('inv_capacity_used') || 'Capacidad', pctCapacity + '%', locCount + ' ' + (t('inv_locations') || 'ubicaciones'));
    h += '</div>';

    // Charts row: stock by type + stock by flock
    h += '<div class="charts-row">';

    // By type
    h += '<div class="card chart-half"><h3>' + (t('inv_by_type') || 'Stock por Tipo') + '</h3>';
    const maxType = Math.max(1, ...Object.values(byType).map(v => v.in - v.out));
    h += '<div class="stock-chart">';
    EGG_TYPES.forEach(tp => {
      const net = (byType[tp]?.in || 0) - (byType[tp]?.out || 0);
      const pct = Math.max(0, net / maxType * 100);
      const color = net < 0 ? 'var(--danger)' : 'var(--primary)';
      h += `<div class="stock-row">
        <span class="stock-label">${tp}</span>
        <div class="stock-bar-bg"><div class="stock-bar" style="width:${pct}%;background:${color}"></div></div>
        <span class="stock-val">${fmtNum(net)}</span>
      </div>`;
    });
    h += '</div></div>';

    // By flock
    h += '<div class="card chart-half"><h3>' + (t('inv_by_flock') || 'Stock por Lote') + '</h3>';
    const flockEntries = Object.entries(byFlock).map(([fId, v]) => {
      const flock = D.flocks.find(f => f.id === fId);
      return { name: flock ? flock.name : fId, net: v.in - v.out };
    }).sort((a, b) => b.net - a.net);
    const maxFlock = Math.max(1, ...flockEntries.map(e => Math.abs(e.net)));
    if (flockEntries.length) {
      h += '<div class="stock-chart">';
      flockEntries.forEach(e => {
        const pct = Math.max(0, Math.abs(e.net) / maxFlock * 100);
        const color = e.net < 0 ? 'var(--danger)' : 'var(--success)';
        h += `<div class="stock-row">
          <span class="stock-label" title="${sanitizeHTML(e.name)}">${sanitizeHTML(e.name)}</span>
          <div class="stock-bar-bg"><div class="stock-bar" style="width:${pct}%;background:${color}"></div></div>
          <span class="stock-val">${fmtNum(e.net)}</span>
        </div>`;
      });
      h += '</div>';
    } else {
      h += `<div class="empty-state"><p>${t('inv_no_flock_data') || 'Sin datos por lote'}</p></div>`;
    }
    h += '</div></div>';

    // Filtered table
    h += '<div id="inv-table">' + this._renderTable(D) + '</div>';
    return h;
  }

  // ─────────────── FILTERED TABLE ───────────────
  _renderTable(D) {
    let recs = [...D.inventory].sort((a, b) => b.date.localeCompare(a.date));
    const f = this._filters;
    if (f.flockId) recs = recs.filter(r => r.flockId === f.flockId);
    if (f.eggType) recs = recs.filter(r => r.eggType === f.eggType);
    if (f.from) recs = recs.filter(r => r.date >= f.from);
    if (f.to) recs = recs.filter(r => r.date <= f.to);
    if (f.source) recs = recs.filter(r => r.source === f.source);
    if (f.locationId) recs = recs.filter(r => r.locationId === f.locationId);

    const locs = D.storageLocations || [];
    const { items, totalPages, page } = paginate(recs, this._page, PAGE_SIZE);

    let h = '';
    // Filter bar
    h += `<div class="filter-bar">
      <select data-filter="flockId">
        <option value="">${t('all_flocks') || 'Todos los lotes'}</option>
        ${D.flocks.map(fk => '<option value="' + escapeAttr(fk.id) + '"' + (f.flockId === fk.id ? ' selected' : '') + '>' + sanitizeHTML(fk.name) + '</option>').join('')}
      </select>
      <select data-filter="eggType">
        <option value="">${t('all') || 'Todos'}</option>
        ${EGG_TYPES.map(tp => '<option value="' + tp + '"' + (f.eggType === tp ? ' selected' : '') + '>' + tp + '</option>').join('')}
      </select>
      <select data-filter="source">
        <option value="">${t('all_sources') || 'Todas'}</option>
        <option value="production"${f.source === 'production' ? ' selected' : ''}>${t('inv_source_production') || 'Producción'}</option>
        <option value="sale"${f.source === 'sale' ? ' selected' : ''}>${t('inv_source_sale') || 'Venta'}</option>
        <option value="adjustment"${f.source === 'adjustment' ? ' selected' : ''}>${t('inv_source_adjustment') || 'Ajuste'}</option>
        <option value="transfer"${f.source === 'transfer' ? ' selected' : ''}>${t('inv_source_transfer') || 'Transferencia'}</option>
        <option value="reservation"${f.source === 'reservation' ? ' selected' : ''}>${t('inv_source_reservation') || 'Reserva'}</option>
      </select>
      ${locs.length ? `<select data-filter="locationId">
        <option value="">${t('all_locations') || 'Todas las ubicaciones'}</option>
        ${locs.map(l => '<option value="' + escapeAttr(l.id) + '"' + (f.locationId === l.id ? ' selected' : '') + '>' + sanitizeHTML(l.name) + '</option>').join('')}
      </select>` : ''}
      <input type="date" data-filter="from" value="${escapeAttr(f.from)}" title="${t('from') || 'Desde'}">
      <input type="date" data-filter="to" value="${escapeAttr(f.to)}" title="${t('to') || 'Hasta'}">
    </div>`;

    if (!items.length) {
      h += `<div class="empty-state"><p>${t('inv_no_records') || 'No hay registros de inventario.'}</p></div>`;
      return h;
    }

    h += '<div class="table-wrap"><table><thead><tr>';
    h += `<th>${t('date')}</th><th>${t('prod_flock') || 'Lote'}</th><th>${t('fin_egg_type') || 'Tipo'}</th>`;
    h += `<th>${t('inv_in') || 'Entrada'}</th><th>${t('inv_out') || 'Salida'}</th>`;
    h += `<th>${t('inv_source') || 'Origen'}</th>`;
    if (locs.length) h += `<th>${t('inv_location') || 'Ubicación'}</th>`;
    h += `<th>${t('inv_adjust_notes') || 'Notas'}</th></tr></thead><tbody>`;

    items.forEach(r => {
      const flock = D.flocks.find(f => f.id === r.flockId);
      const loc = locs.find(l => l.id === r.locationId);
      h += `<tr>
        <td>${fmtDate(r.date)}</td>
        <td>${flock ? sanitizeHTML(flock.name) : '-'}</td>
        <td>${r.eggType || '-'}</td>
        <td style="color:var(--success);font-weight:${r.qtyIn ? '700' : '400'}">${r.qtyIn ? '+' + fmtNum(r.qtyIn) : '-'}</td>
        <td style="color:var(--danger);font-weight:${r.qtyOut ? '700' : '400'}">${r.qtyOut ? '-' + fmtNum(r.qtyOut) : '-'}</td>
        <td><span class="source-badge ${r.source || 'production'}">${this._reasonLabel(r.source || 'production')}</span></td>
        ${locs.length ? `<td>${loc ? sanitizeHTML(loc.name) : '-'}</td>` : ''}
        <td>${r.notes ? sanitizeHTML(r.notes) : ''}</td>
      </tr>`;
    });
    h += '</tbody></table></div>';

    // Pagination
    if (totalPages > 1) {
      h += '<div class="dt-pagination">';
      h += `<span>${t('page') || 'Página'} ${page} / ${totalPages}</span>`;
      h += '<div class="dt-page-buttons">';
      if (page > 1) h += `<button class="btn btn-sm" data-page="${page - 1}">\u25C0</button>`;
      if (page < totalPages) h += `<button class="btn btn-sm" data-page="${page + 1}">\u25B6</button>`;
      h += '</div></div>';
    }

    return h;
  }

  _reasonLabel(reason) {
    const map = {
      production: t('inv_source_production') || 'Producción',
      sale: t('inv_source_sale') || 'Venta',
      adjustment: t('inv_source_adjustment') || 'Ajuste',
      transfer: t('inv_source_transfer') || 'Transferencia',
      reservation: t('inv_source_reservation') || 'Reserva',
      breakage: t('inv_adjust_reason_breakage') || 'Rotura',
      count: t('inv_adjust_reason_count') || 'Error de conteo',
      expired: t('inv_adjust_reason_expired') || 'Vencidos',
      other: t('inv_adjust_reason_other') || 'Otro'
    };
    return map[reason] || reason;
  }

  // ─────────────── ADJUSTMENT FORM ───────────────
  _showAdjustmentForm() {
    const D = Store.get();
    const locs = D.storageLocations || [];
    const title = (t('inv_adjustment') || 'Ajuste de Inventario');
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>${t('inv_adjust_direction') || 'Dirección'}</label>
          <select id="adj-dir">
            <option value="positive">${t('inv_adjust_positive') || 'Ajuste Positivo (+)'}</option>
            <option value="negative">${t('inv_adjust_negative') || 'Ajuste Negativo (−)'}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${t('date')}</label>
          <input type="date" id="adj-date" value="${todayStr()}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t('prod_flock') || 'Lote'}</label>
          <select id="adj-flock">
            <option value="">${t('all') || 'General'}</option>
            ${D.flocks.map(f => '<option value="' + escapeAttr(f.id) + '">' + sanitizeHTML(f.name) + '</option>').join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${t('fin_egg_type') || 'Tipo de Huevo'}</label>
          <select id="adj-type">
            ${EGG_TYPES.map(tp => '<option value="' + tp + '">' + tp + '</option>').join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t('inv_adjust_qty') || 'Cantidad'}</label>
          <input type="number" id="adj-qty" min="1" step="1" placeholder="0">
        </div>
        <div class="form-group">
          <label>${t('inv_adjust_reason') || 'Motivo'}</label>
          <select id="adj-reason">
            <option value="breakage">${t('inv_adjust_reason_breakage') || 'Rotura de huevos'}</option>
            <option value="count">${t('inv_adjust_reason_count') || 'Error de conteo'}</option>
            <option value="expired">${t('inv_adjust_reason_expired') || 'Huevos vencidos'}</option>
            <option value="other">${t('inv_adjust_reason_other') || 'Otro'}</option>
          </select>
        </div>
      </div>
      ${locs.length ? `<div class="form-group">
        <label>${t('inv_location') || 'Ubicación'}</label>
        <select id="adj-location">
          <option value="">-- ${t('inv_no_location') || 'Sin ubicación'} --</option>
          ${locs.map(l => '<option value="' + escapeAttr(l.id) + '">' + sanitizeHTML(l.name) + '</option>').join('')}
        </select>
      </div>` : '<input type="hidden" id="adj-location" value="">'}
      <div class="form-group">
        <label>${t('inv_adjust_notes') || 'Notas'}</label>
        <textarea id="adj-notes" rows="2" placeholder="${t('optional') || 'Opcional'}"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-inv-adjustment">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title, body });
  }

  _saveAdjustment() {
    clearFieldErrors();
    const dir = modalVal('adj-dir');
    const date = modalVal('adj-date');
    const flockId = modalVal('adj-flock');
    const eggType = modalVal('adj-type');
    const qty = parseInt(modalVal('adj-qty'), 10) || 0;
    const reason = modalVal('adj-reason');
    const notes = (modalVal('adj-notes') || '').trim();
    const locationId = modalVal('adj-location') || '';

    const v = validateForm({
      'adj-date': { value: date, rules: { required: true, date: true } },
      'adj-type': { value: eggType, rules: { required: true } },
      'adj-qty': { value: modalVal('adj-qty'), rules: { required: true, numeric: true, min: 1 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    const D = Store.get();
    const record = {
      id: genId(), date, flockId: flockId || '', eggType,
      qtyIn: dir === 'positive' ? qty : 0,
      qtyOut: dir === 'negative' ? qty : 0,
      source: 'adjustment', reason, notes, locationId
    };
    D.inventory.push(record);
    logAudit('create', 'inventory', `Adjustment ${dir}: ${qty} ${eggType} (${reason})`, record.id, record);
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('inv_adjust_saved') || 'Ajuste guardado' });
    this.render();
  }

  // ─────────────── EVENT BINDING ───────────────
  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('change', (e) => {
      const el = e.target;
      const filterKey = el.dataset.filter;
      if (filterKey) {
        this._filters[filterKey] = el.value;
        this._page = 1;
        this._refreshTable();
      }
    });

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        switch (action) {
          case 'add-adjustment': this._showAdjustmentForm(); return;
          case 'add-location': Bus.emit('nav:inv-location-add'); return;
          case 'add-reservation': Bus.emit('nav:inv-reservation-add'); return;
        }
      }
      // Tabs
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this._tab = tab.dataset.tab;
        this.render();
        return;
      }
      // Pagination
      const pg = e.target.closest('[data-page]');
      if (pg) {
        this._page = parseInt(pg.dataset.page, 10);
        this._refreshTable();
      }
    });
  }

  _refreshTable() {
    const D = Store.get();
    const container = this.shadowRoot.querySelector('#inv-table');
    if (container) container.innerHTML = this._renderTable(D);
  }

  // ─────────────── STYLES ───────────────
  _styles() {
    return `<style>
      :host { display: block; }
      .page-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
      }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
      .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }

      /* Tabs */
      .tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid var(--border, #e0e0e0); }
      .tab {
        padding: 10px 20px; cursor: pointer; font-weight: 600;
        color: var(--text-light, #888); border-bottom: 2px solid transparent;
        margin-bottom: -2px; transition: all .2s; user-select: none;
      }
      .tab:hover { color: var(--text, #333); }
      .tab.active { color: var(--primary, #1A3C6E); border-bottom-color: var(--primary, #1A3C6E); }

      /* KPI Grid */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(6, 1fr);
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
      .kpi-info {
        display: inline-block; width: 16px; height: 16px; border-radius: 50%;
        background: var(--bg-secondary, #f5f5f5); color: var(--text-light, #757575);
        font-size: 11px; text-align: center; line-height: 16px; cursor: help;
        margin-left: 4px; vertical-align: middle;
      }

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

      /* Charts row */
      .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 0; }
      .chart-half { margin-bottom: 16px; }

      /* Stock bar chart */
      .stock-chart { display: flex; flex-direction: column; gap: 8px; }
      .stock-row { display: flex; align-items: center; gap: 8px; }
      .stock-label { width: 80px; font-size: 13px; font-weight: 600; text-align: right; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .stock-bar-bg { flex: 1; height: 22px; background: var(--bg-secondary, #f0f0f0); border-radius: 4px; overflow: hidden; }
      .stock-bar { height: 100%; border-radius: 4px; transition: width .3s ease; }
      .stock-val { width: 80px; font-size: 13px; font-weight: 700; text-align: left; flex-shrink: 0; }

      /* Source badge */
      .source-badge {
        display: inline-block; padding: 2px 8px; border-radius: 12px;
        font-size: 11px; font-weight: 600; white-space: nowrap;
      }
      .source-badge.adjustment { background: rgba(255,152,0,.12); color: #e65100; }
      .source-badge.production { background: rgba(46,125,50,.1); color: #2E7D32; }
      .source-badge.sale { background: rgba(21,101,192,.1); color: #1565C0; }
      .source-badge.transfer { background: rgba(156,39,176,.1); color: #7B1FA2; }
      .source-badge.reservation { background: rgba(255,87,34,.1); color: #D84315; }

      /* Empty state */
      .empty-state { text-align: center; padding: 24px; color: var(--text-light); }

      /* Table */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }

      /* Filter bar */
      .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
      .filter-bar select, .filter-bar input {
        padding: 6px 10px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); font-size: 13px;
        background: var(--bg, #fff); color: var(--text, #212121);
      }

      /* Pagination */
      .dt-pagination {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 0; flex-wrap: wrap; gap: 8px; font-size: 13px;
      }
      .dt-page-buttons { display: flex; gap: 4px; }

      @media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
        .kpi-grid-4 { grid-template-columns: repeat(2, 1fr); }
        .charts-row { grid-template-columns: 1fr; }
        .filter-bar { flex-direction: column; }
        .filter-bar select, .filter-bar input { width: 100%; }
        .tabs { overflow-x: auto; }
      }
      @media (max-width: 600px) {
        .kpi-grid { grid-template-columns: 1fr; }
        .stock-label { width: 55px; font-size: 12px; }
        .stock-val { width: 60px; font-size: 12px; }
        .header-actions { width: 100%; }
        .header-actions .btn { flex: 1; font-size: 12px; padding: 6px 8px; }
      }
    </style>`;
  }
}

customElements.define('egg-inventory', EggInventory);
export { EggInventory };
