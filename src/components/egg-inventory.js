// <egg-inventory> — Egg Inventory Web Component
// Enhanced: adjustment modal, stock charts, flock analysis,
// storage locations (warehouse/rack), reservations for clients

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
      case 'save-location': this._saveLocation(); break;
      case 'save-reservation': this._saveReservation(); break;
      case 'save-move-stock': this._saveMoveStock(); break;
    }
  }

  // ─────────────── RENDER ───────────────
  render() {
    const D = Store.get();
    let h = this._styles();

    // Header with action buttons
    h += `<div class="page-header">
      <h2>\uD83D\uDCE6 ${t('nav_inventory') || 'Inventario'}</h2>
      <div class="header-actions">
        <button class="btn btn-secondary" data-action="add-location">\uD83D\uDCCD ${t('inv_add_location') || 'Nueva Ubicación'}</button>
        <button class="btn btn-secondary" data-action="add-reservation">\uD83D\uDD12 ${t('inv_reserve') || 'Reservar'}</button>
        <button class="btn btn-primary" data-action="add-adjustment">\u2696\uFE0F ${t('inv_adjustment') || 'Ajuste'}</button>
      </div>
    </div>`;

    // Tabs
    h += `<div class="tabs">
      <div class="tab${this._tab === 'stock' ? ' active' : ''}" data-tab="stock">\uD83D\uDCE6 ${t('inv_stock') || 'Stock'}</div>
      <div class="tab${this._tab === 'locations' ? ' active' : ''}" data-tab="locations">\uD83C\uDFED ${t('inv_locations') || 'Ubicaciones'}</div>
      <div class="tab${this._tab === 'reservations' ? ' active' : ''}" data-tab="reservations">\uD83D\uDD12 ${t('inv_reservations') || 'Reservas'}</div>
    </div>`;

    if (this._tab === 'stock') h += this._renderStockTab(D);
    else if (this._tab === 'locations') h += this._renderLocationsTab(D);
    else if (this._tab === 'reservations') h += this._renderReservationsTab(D);

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  // ═══════════════ STOCK TAB ═══════════════
  _renderStockTab(D) {
    let h = '';
    const sorted = [...D.inventory].sort((a, b) => a.date.localeCompare(b.date));
    const totIn = sorted.reduce((s, r) => s + (r.qtyIn || 0), 0);
    const totOut = sorted.reduce((s, r) => s + (r.qtyOut || 0), 0);
    const balance = totIn - totOut;
    const adjustments = sorted.filter(r => r.source === 'adjustment');
    const totAdj = adjustments.reduce((s, r) => s + (r.qtyIn || 0) - (r.qtyOut || 0), 0);

    // Reserved qty
    const reservedQty = (D.reservations || [])
      .filter(r => r.status === 'active')
      .reduce((s, r) => s + (r.qty || 0), 0);
    const available = balance - reservedQty;

    // Per egg-type balances
    const byType = {};
    sorted.forEach(r => {
      const tp = r.eggType || 'M';
      if (!byType[tp]) byType[tp] = { in: 0, out: 0, adj: 0 };
      byType[tp].in += (r.qtyIn || 0);
      byType[tp].out += (r.qtyOut || 0);
      if (r.source === 'adjustment') byType[tp].adj += (r.qtyIn || 0) - (r.qtyOut || 0);
    });

    // Per flock balances
    const byFlock = {};
    sorted.forEach(r => {
      const fid = r.flockId || '_none';
      if (!byFlock[fid]) byFlock[fid] = { in: 0, out: 0 };
      byFlock[fid].in += (r.qtyIn || 0);
      byFlock[fid].out += (r.qtyOut || 0);
    });

    // Per-location balances
    const byLoc = {};
    sorted.forEach(r => {
      const lid = r.locationId || '_none';
      if (!byLoc[lid]) byLoc[lid] = { in: 0, out: 0 };
      byLoc[lid].in += (r.qtyIn || 0);
      byLoc[lid].out += (r.qtyOut || 0);
    });

    // KPI cards (6: in, out, adjustments, balance, reserved, available)
    h += '<div class="kpi-grid">';
    h += kpi(t('inv_total_in') || 'Total In', fmtNum(totIn), '', '', t('info_inv_in'));
    h += kpi(t('inv_total_out') || 'Total Out', fmtNum(totOut), '', '', t('info_inv_out'));
    h += kpi(
      t('inv_adjustment') || 'Ajustes',
      (totAdj >= 0 ? '+' : '') + fmtNum(totAdj), '',
      totAdj < 0 ? 'danger' : ''
    );
    h += kpi(
      t('inv_balance') || 'Balance', fmtNum(balance), '',
      balance < 0 ? 'danger' : balance < 100 ? 'warning' : ''
    );
    h += kpi(
      t('inv_reserved') || 'Reservado', fmtNum(reservedQty), '',
      reservedQty > 0 ? 'warning' : ''
    );
    h += kpi(
      t('inv_available') || 'Disponible', fmtNum(available), '',
      available < 0 ? 'danger' : available < 50 ? 'warning' : ''
    );
    h += '</div>';

    // Stock level chart by egg type
    const typeKeys = EGG_TYPES.filter(tp => byType[tp]);
    if (typeKeys.length) {
      const maxBal = Math.max(...typeKeys.map(tp => Math.abs((byType[tp].in || 0) - (byType[tp].out || 0))), 1);
      h += '<div class="card"><h3>\uD83D\uDCCA ' + (t('inv_stock_levels') || 'Niveles de Stock') + '</h3>';
      h += '<div class="stock-chart">';
      typeKeys.forEach(tp => {
        const b = byType[tp];
        const bal = b.in - b.out;
        const pct = Math.min(Math.abs(bal) / maxBal * 100, 100);
        const color = bal < 0 ? 'var(--danger, #C62828)' : bal < 50 ? 'var(--warning, #e65100)' : 'var(--success, #2E7D32)';
        h += `<div class="stock-row">
          <span class="stock-label">${tp}</span>
          <div class="stock-bar-bg"><div class="stock-bar" style="width:${pct}%;background:${color}"></div></div>
          <span class="stock-val" style="color:${color}">${fmtNum(bal)}</span>
        </div>`;
      });
      h += '</div></div>';
    }

    // Stock by location card
    const locs = D.storageLocations || [];
    const locEntries = Object.entries(byLoc).filter(([k]) => k !== '_none');
    if (locs.length && locEntries.length) {
      const maxLocBal = Math.max(...locEntries.map(([, b]) => Math.abs(b.in - b.out)), 1);
      h += '<div class="card"><h3>\uD83C\uDFED ' + (t('inv_stock_by_location') || 'Stock por Ubicación') + '</h3>';
      h += '<div class="stock-chart">';
      locEntries.forEach(([lid, b]) => {
        const loc = locs.find(l => l.id === lid);
        const bal = b.in - b.out;
        const pct = Math.min(Math.abs(bal) / maxLocBal * 100, 100);
        const cap = loc?.capacity || 0;
        const pctCap = cap > 0 ? (bal / cap * 100).toFixed(0) : '';
        const color = cap > 0 && bal >= cap ? 'var(--danger)' : bal < 0 ? 'var(--danger)' : 'var(--primary, #1565C0)';
        h += `<div class="stock-row">
          <span class="stock-label">${loc ? sanitizeHTML(loc.name) : lid}</span>
          <div class="stock-bar-bg"><div class="stock-bar" style="width:${pct}%;background:${color}"></div></div>
          <span class="stock-val" style="color:${color}">${fmtNum(bal)}${pctCap ? ' (' + pctCap + '%)' : ''}</span>
        </div>`;
      });
      h += '</div></div>';
    }

    // Charts row: By Type + By Flock
    h += '<div class="charts-row">';
    if (typeKeys.length) {
      h += '<div class="card chart-half"><h3>' + (t('inv_by_type') || 'Por Tipo de Huevo') + '</h3><div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('fin_egg_type') || 'Type'}</th><th>${t('inv_total_in') || 'In'}</th><th>${t('inv_total_out') || 'Out'}</th><th>${t('inv_adjustment') || 'Adj.'}</th><th>${t('inv_balance') || 'Balance'}</th>`;
      h += '</tr></thead><tbody>';
      EGG_TYPES.forEach(tp => {
        if (!byType[tp]) return;
        const b = byType[tp];
        const bal = b.in - b.out;
        h += `<tr><td><strong>${tp}</strong></td><td style="color:var(--success)">${fmtNum(b.in)}</td><td style="color:var(--danger)">${fmtNum(b.out)}</td>
        <td>${b.adj !== 0 ? ((b.adj > 0 ? '+' : '') + fmtNum(b.adj)) : '-'}</td>
        <td style="font-weight:700;color:${bal < 0 ? 'var(--danger)' : 'var(--success)'}">${fmtNum(bal)}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }
    const flockEntries = Object.entries(byFlock).filter(([k]) => k !== '_none');
    if (flockEntries.length) {
      flockEntries.sort((a, b) => b[1].out - a[1].out);
      h += '<div class="card chart-half"><h3>\uD83D\uDC14 ' + (t('inv_by_flock') || 'Por Lote') + '</h3><div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('prod_flock') || 'Lote'}</th><th>${t('inv_total_in') || 'Entrada'}</th><th>${t('inv_total_out') || 'Salida'}</th><th>${t('inv_balance') || 'Balance'}</th>`;
      h += '</tr></thead><tbody>';
      flockEntries.forEach(([fid, b]) => {
        const fl = D.flocks.find(x => x.id === fid);
        const bal = b.in - b.out;
        h += `<tr><td><strong>${fl ? sanitizeHTML(fl.name) : fid}</strong></td>
        <td style="color:var(--success)">${fmtNum(b.in)}</td>
        <td style="color:var(--danger)">${fmtNum(b.out)}</td>
        <td style="font-weight:700;color:${bal < 0 ? 'var(--danger)' : 'var(--success)'}">${fmtNum(bal)}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }
    h += '</div>';

    // Top sold flocks bar chart
    if (flockEntries.length > 1) {
      const maxOut = Math.max(...flockEntries.map(([, b]) => b.out), 1);
      h += '<div class="card"><h3>\uD83C\uDFC6 ' + (t('inv_top_sold') || 'Lotes con Mayor Salida') + '</h3><div class="stock-chart">';
      flockEntries.slice(0, 10).forEach(([fid, b]) => {
        const fl = D.flocks.find(x => x.id === fid);
        const pct = Math.min(b.out / maxOut * 100, 100);
        h += `<div class="stock-row">
          <span class="stock-label">${fl ? sanitizeHTML(fl.name) : fid}</span>
          <div class="stock-bar-bg"><div class="stock-bar" style="width:${pct}%;background:var(--primary, #1565C0)"></div></div>
          <span class="stock-val">${fmtNum(b.out)}</span>
        </div>`;
      });
      h += '</div></div>';
    }

    // Most sold egg types bar chart
    const typesSorted = EGG_TYPES.filter(tp => byType[tp] && byType[tp].out > 0)
      .sort((a, b) => byType[b].out - byType[a].out);
    if (typesSorted.length > 1) {
      const maxTypeOut = Math.max(...typesSorted.map(tp => byType[tp].out), 1);
      h += '<div class="card"><h3>\uD83E\uDD5A ' + (t('inv_top_types') || 'Tipos Más Vendidos') + '</h3><div class="stock-chart">';
      typesSorted.forEach(tp => {
        const b = byType[tp];
        const pct = Math.min(b.out / maxTypeOut * 100, 100);
        h += `<div class="stock-row">
          <span class="stock-label">${tp}</span>
          <div class="stock-bar-bg"><div class="stock-bar" style="width:${pct}%;background:var(--accent, #FF8F00)"></div></div>
          <span class="stock-val">${fmtNum(b.out)}</span>
        </div>`;
      });
      h += '</div></div>';
    }

    // Filter bar
    h += `<div class="filter-bar">
      <select data-filter="flockId">
        <option value="">${t('all') || 'All'} — ${t('prod_flock') || 'Lote'}</option>
        ${D.flocks.map(f => '<option value="' + escapeAttr(f.id) + '"' + (this._filters.flockId === f.id ? ' selected' : '') + '>' + sanitizeHTML(f.name) + '</option>').join('')}
      </select>
      <select data-filter="eggType">
        <option value="">${t('all') || 'All'} — ${t('fin_egg_type') || 'Tipo'}</option>
        ${EGG_TYPES.map(tp => '<option value="' + tp + '"' + (this._filters.eggType === tp ? ' selected' : '') + '>' + tp + '</option>').join('')}
      </select>
      <select data-filter="source">
        <option value="">${t('all') || 'All'} — ${t('source') || 'Origen'}</option>
        <option value="production"${this._filters.source === 'production' ? ' selected' : ''}>${t('production') || 'Producción'}</option>
        <option value="adjustment"${this._filters.source === 'adjustment' ? ' selected' : ''}>${t('inv_adjustment') || 'Ajuste'}</option>
        <option value="sale"${this._filters.source === 'sale' ? ' selected' : ''}>${t('fin_sales') || 'Venta'}</option>
      </select>
      <select data-filter="locationId">
        <option value="">${t('all') || 'All'} — ${t('inv_location') || 'Ubicación'}</option>
        ${(D.storageLocations || []).map(l => '<option value="' + escapeAttr(l.id) + '"' + (this._filters.locationId === l.id ? ' selected' : '') + '>' + sanitizeHTML(l.name) + '</option>').join('')}
      </select>
      <input type="date" data-filter="from" value="${escapeAttr(this._filters.from)}">
      <input type="date" data-filter="to" value="${escapeAttr(this._filters.to)}">
    </div>`;

    // Filtered table
    h += '<div id="inv-table">' + this._renderTable(D) + '</div>';
    return h;
  }

  // ═══════════════ LOCATIONS TAB ═══════════════
  _renderLocationsTab(D) {
    const locs = D.storageLocations || [];
    let h = '';

    h += `<div class="card"><div class="card-header-row">
      <h3>\uD83C\uDFED ${t('inv_locations') || 'Ubicaciones de Almacenamiento'}</h3>
      <button class="btn btn-primary btn-sm" data-action="add-location">\u2795 ${t('inv_add_location') || 'Nueva Ubicación'}</button>
    </div>`;

    if (!locs.length) {
      h += `<div class="empty-state"><p>${t('inv_no_locations') || 'No hay ubicaciones configuradas. Agrega galpones, racks o bodegas para organizar tu inventario.'}</p></div>`;
    } else {
      // Compute stock per location
      const sorted = [...D.inventory].sort((a, b) => a.date.localeCompare(b.date));
      const locStock = {};
      sorted.forEach(r => {
        const lid = r.locationId || '';
        if (!lid) return;
        if (!locStock[lid]) locStock[lid] = { total: 0, byType: {} };
        locStock[lid].total += (r.qtyIn || 0) - (r.qtyOut || 0);
        const tp = r.eggType || 'M';
        if (!locStock[lid].byType[tp]) locStock[lid].byType[tp] = 0;
        locStock[lid].byType[tp] += (r.qtyIn || 0) - (r.qtyOut || 0);
      });

      // Reserved per location
      const locReserved = {};
      (D.reservations || []).filter(r => r.status === 'active' && r.locationId)
        .forEach(r => { locReserved[r.locationId] = (locReserved[r.locationId] || 0) + (r.qty || 0); });

      h += '<div class="loc-grid">';
      locs.forEach(loc => {
        const stock = locStock[loc.id]?.total || 0;
        const reserved = locReserved[loc.id] || 0;
        const avail = stock - reserved;
        const cap = loc.capacity || 0;
        const pctUsed = cap > 0 ? Math.min(stock / cap * 100, 100) : 0;
        const barColor = pctUsed > 90 ? 'var(--danger)' : pctUsed > 70 ? 'var(--warning)' : 'var(--success)';
        const typeBreakdown = locStock[loc.id]?.byType || {};
        const typeStr = Object.entries(typeBreakdown).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${fmtNum(v)}`).join(' · ');

        h += `<div class="loc-card">
          <div class="loc-header">
            <div>
              <span class="loc-zone-badge">${sanitizeHTML(loc.zone || '')}</span>
              <strong>${sanitizeHTML(loc.name)}</strong>
            </div>
            <div class="loc-actions">
              <button class="btn btn-sm btn-secondary" data-action="move-stock" data-loc="${escapeAttr(loc.id)}">\u21C4 ${t('inv_move') || 'Mover'}</button>
              <button class="btn btn-sm btn-secondary" data-action="edit-location" data-loc="${escapeAttr(loc.id)}">\u270F\uFE0F</button>
              <button class="btn btn-sm btn-danger" data-action="delete-location" data-loc="${escapeAttr(loc.id)}">\uD83D\uDDD1\uFE0F</button>
            </div>
          </div>
          ${loc.description ? `<p class="loc-desc">${sanitizeHTML(loc.description)}</p>` : ''}
          <div class="loc-stats">
            <div class="loc-stat"><span class="loc-stat-label">${t('inv_stock') || 'Stock'}</span><span class="loc-stat-val">${fmtNum(stock)}</span></div>
            <div class="loc-stat"><span class="loc-stat-label">${t('inv_reserved') || 'Reservado'}</span><span class="loc-stat-val" style="color:var(--warning)">${fmtNum(reserved)}</span></div>
            <div class="loc-stat"><span class="loc-stat-label">${t('inv_available') || 'Disponible'}</span><span class="loc-stat-val" style="color:${avail < 0 ? 'var(--danger)' : 'var(--success)'}">${fmtNum(avail)}</span></div>
            ${cap > 0 ? `<div class="loc-stat"><span class="loc-stat-label">${t('cfg_capacity') || 'Capacidad'}</span><span class="loc-stat-val">${fmtNum(cap)}</span></div>` : ''}
          </div>
          ${cap > 0 ? `<div class="loc-bar-bg"><div class="loc-bar" style="width:${pctUsed}%;background:${barColor}"></div></div><span class="loc-pct">${pctUsed.toFixed(0)}% ${t('inv_used') || 'usado'}</span>` : ''}
          ${typeStr ? `<p class="loc-types">${typeStr}</p>` : ''}
        </div>`;
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  // ═══════════════ RESERVATIONS TAB ═══════════════
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

  // ─────────────── FILTERED TABLE ───────────────
  _renderTable(D) {
    let recs = [...D.inventory].sort((a, b) => b.date.localeCompare(a.date));
    const f = this._filters;
    if (f.flockId) recs = recs.filter(r => r.flockId === f.flockId);
    if (f.eggType) recs = recs.filter(r => r.eggType === f.eggType);
    if (f.source) recs = recs.filter(r => r.source === f.source);
    if (f.locationId) recs = recs.filter(r => r.locationId === f.locationId);
    if (f.from) recs = recs.filter(r => r.date >= f.from);
    if (f.to) recs = recs.filter(r => r.date <= f.to);

    const pg = paginate(recs, this._page, PAGE_SIZE);
    const locs = D.storageLocations || [];

    let h = '<div class="card"><h3>\uD83D\uDCCB ' + (t('inv_records') || 'Registros') + ' (' + fmtNum(recs.length) + ')</h3><div class="table-wrap"><table><thead><tr>';
    h += `<th>${t('date')}</th><th>${t('prod_flock') || 'Flock'}</th><th>${t('fin_egg_type') || 'Type'}</th>`;
    h += `<th>${t('inv_total_in') || 'In'}</th><th>${t('inv_total_out') || 'Out'}</th><th>${t('inv_location') || 'Ubicación'}</th><th>${t('source') || 'Source'}</th><th>${t('inv_adjust_notes') || 'Notes'}</th>`;
    h += '</tr></thead><tbody>';

    if (!pg.items.length) {
      h += `<tr><td colspan="8" style="text-align:center;color:var(--text-light)">${t('no_data')}</td></tr>`;
    }

    pg.items.forEach(r => {
      const fl = D.flocks.find(x => x.id === r.flockId);
      const loc = locs.find(l => l.id === r.locationId);
      const isAdj = r.source === 'adjustment';
      const srcLabel = isAdj ? '\u2696\uFE0F ' + (t('inv_adjustment') || 'Ajuste')
        : r.source === 'sale' ? '\uD83D\uDCB0 ' + (t('fin_sales') || 'Venta')
        : '\uD83E\uDD5A ' + (t('production') || 'Producción');
      const reason = r.reason ? (' — ' + this._reasonLabel(r.reason)) : '';
      const notes = r.notes ? sanitizeHTML(r.notes) : '';
      h += `<tr${isAdj ? ' style="background:rgba(255,152,0,.06)"' : ''}>
        <td>${fmtDate(r.date)}</td>
        <td>${fl ? sanitizeHTML(fl.name) : '-'}</td>
        <td>${r.eggType || '-'}</td>
        <td style="color:var(--success)">${r.qtyIn ? '+' + fmtNum(r.qtyIn) : '-'}</td>
        <td style="color:var(--danger)">${r.qtyOut ? '-' + fmtNum(r.qtyOut) : '-'}</td>
        <td>${loc ? sanitizeHTML(loc.name) : '-'}</td>
        <td><span class="source-badge ${r.source || 'production'}">${srcLabel}</span></td>
        <td style="font-size:12px;color:var(--text-light)">${reason}${reason && notes ? ' ' : ''}${notes}</td>
      </tr>`;
    });

    h += '</tbody></table></div></div>';

    if (pg.totalPages > 1) {
      h += '<div class="dt-pagination">';
      h += `<span>${t('page') || 'Page'} ${pg.page} / ${pg.totalPages}</span>`;
      h += '<div class="dt-page-buttons">';
      if (pg.page > 1) h += `<button class="btn btn-sm btn-secondary" data-page="${pg.page - 1}">&laquo; ${t('prev') || 'Prev'}</button>`;
      if (pg.page < pg.totalPages) h += `<button class="btn btn-sm btn-secondary" data-page="${pg.page + 1}">${t('next') || 'Next'} &raquo;</button>`;
      h += '</div></div>';
    }

    return h;
  }

  _reasonLabel(reason) {
    const map = {
      breakage: t('inv_adjust_reason_breakage') || 'Rotura',
      count: t('inv_adjust_reason_count') || 'Error de conteo',
      expired: t('inv_adjust_reason_expired') || 'Vencidos',
      other: t('inv_adjust_reason_other') || 'Otro'
    };
    return map[reason] || reason;
  }

  // ─────────────── LOCATION FORM ───────────────
  _showLocationForm(locId) {
    const D = Store.get();
    const loc = locId ? (D.storageLocations || []).find(l => l.id === locId) : null;
    const title = '\uD83C\uDFED ' + (loc ? (t('inv_edit_location') || 'Editar Ubicación') : (t('inv_add_location') || 'Nueva Ubicación'));
    const body = `
      <input type="hidden" id="loc-id" value="${loc ? escapeAttr(loc.id) : ''}">
      <div class="form-row">
        <div class="form-group">
          <label>${t('inv_loc_name') || 'Nombre'} *</label>
          <input type="text" id="loc-name" value="${loc ? escapeAttr(loc.name) : ''}" placeholder="${t('inv_loc_name_ph') || 'Ej: Galpón A - Rack 3'}">
        </div>
        <div class="form-group">
          <label>${t('inv_loc_zone') || 'Zona'}</label>
          <select id="loc-zone">
            <option value="warehouse"${loc?.zone === 'warehouse' ? ' selected' : ''}>${t('inv_zone_warehouse') || 'Bodega'}</option>
            <option value="house"${loc?.zone === 'house' ? ' selected' : ''}>${t('inv_zone_house') || 'Galpón'}</option>
            <option value="rack"${loc?.zone === 'rack' ? ' selected' : ''}>${t('inv_zone_rack') || 'Rack'}</option>
            <option value="cooler"${loc?.zone === 'cooler' ? ' selected' : ''}>${t('inv_zone_cooler') || 'Cámara Fría'}</option>
            <option value="dispatch"${loc?.zone === 'dispatch' ? ' selected' : ''}>${t('inv_zone_dispatch') || 'Despacho'}</option>
            <option value="other"${loc?.zone === 'other' ? ' selected' : ''}>${t('inv_adjust_reason_other') || 'Otro'}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t('inv_loc_capacity') || 'Capacidad (unidades)'}</label>
          <input type="number" id="loc-capacity" min="0" step="1" value="${loc?.capacity || ''}" placeholder="0 = ${t('inv_unlimited') || 'sin límite'}">
        </div>
        <div class="form-group">
          <label>${t('inv_loc_code') || 'Código'}</label>
          <input type="text" id="loc-code" value="${loc?.code || ''}" placeholder="${t('inv_loc_code_ph') || 'Ej: GA-R3'}">
        </div>
      </div>
      <div class="form-group">
        <label>${t('description') || 'Descripción'}</label>
        <textarea id="loc-desc" rows="2" placeholder="${t('optional') || 'Opcional'}">${loc?.description || ''}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-location">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title, body });
  }

  _saveLocation() {
    clearFieldErrors();
    const id = modalVal('loc-id');
    const name = (modalVal('loc-name') || '').trim();
    const zone = modalVal('loc-zone') || 'warehouse';
    const capacity = parseInt(modalVal('loc-capacity'), 10) || 0;
    const code = (modalVal('loc-code') || '').trim();
    const description = (modalVal('loc-desc') || '').trim();

    const v = validateForm({
      'loc-name': { value: name, rules: { required: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    const D = Store.get();
    if (!D.storageLocations) D.storageLocations = [];

    if (id) {
      const loc = D.storageLocations.find(l => l.id === id);
      if (loc) {
        Object.assign(loc, { name, zone, capacity, code, description });
        logAudit('update', 'storageLocation', `Updated location: ${name}`, id, loc);
      }
    } else {
      const loc = { id: genId(), name, zone, capacity, code, description, createdDate: todayStr() };
      D.storageLocations.push(loc);
      logAudit('create', 'storageLocation', `Created location: ${name}`, loc.id, loc);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') || 'Guardado' });
    this.render();
  }

  _deleteLocation(locId) {
    const D = Store.get();
    const idx = (D.storageLocations || []).findIndex(l => l.id === locId);
    if (idx < 0) return;
    const loc = D.storageLocations[idx];
    // Check if location has stock
    const stock = D.inventory.filter(r => r.locationId === locId).reduce((s, r) => s + (r.qtyIn || 0) - (r.qtyOut || 0), 0);
    if (stock > 0) {
      Bus.emit('toast', { msg: (t('inv_loc_has_stock') || 'No se puede eliminar: la ubicación tiene stock.'), error: true });
      return;
    }
    D.storageLocations.splice(idx, 1);
    logAudit('delete', 'storageLocation', `Deleted location: ${loc.name}`, locId);
    Store.save(D);
    Bus.emit('toast', { msg: t('deleted') || 'Eliminado' });
    this.render();
  }

  // ─────────────── MOVE STOCK FORM ───────────────
  _showMoveStockForm(fromLocId) {
    const D = Store.get();
    const locs = D.storageLocations || [];
    const fromLoc = locs.find(l => l.id === fromLocId);
    const otherLocs = locs.filter(l => l.id !== fromLocId);
    if (!otherLocs.length) {
      Bus.emit('toast', { msg: t('inv_need_more_locations') || 'Necesitas al menos 2 ubicaciones para mover stock.', error: true });
      return;
    }
    const title = '\u21C4 ' + (t('inv_move_stock') || 'Mover Stock');
    const body = `
      <p style="color:var(--text-light);font-size:13px;margin-bottom:12px">${t('inv_move_from') || 'Desde'}: <strong>${fromLoc ? sanitizeHTML(fromLoc.name) : '-'}</strong></p>
      <input type="hidden" id="move-from" value="${escapeAttr(fromLocId)}">
      <div class="form-row">
        <div class="form-group">
          <label>${t('inv_move_to') || 'Hacia'} *</label>
          <select id="move-to">
            ${otherLocs.map(l => '<option value="' + escapeAttr(l.id) + '">' + sanitizeHTML(l.name) + '</option>').join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${t('fin_egg_type') || 'Tipo de Huevo'}</label>
          <select id="move-type">
            ${EGG_TYPES.map(tp => '<option value="' + tp + '">' + tp + '</option>').join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>${t('qty') || 'Cantidad'} *</label>
        <input type="number" id="move-qty" min="1" step="1" placeholder="0">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-move-stock">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title, body });
  }

  _saveMoveStock() {
    clearFieldErrors();
    const fromId = modalVal('move-from');
    const toId = modalVal('move-to');
    const eggType = modalVal('move-type');
    const qty = parseInt(modalVal('move-qty'), 10) || 0;

    const v = validateForm({
      'move-to': { value: toId, rules: { required: true } },
      'move-qty': { value: modalVal('move-qty'), rules: { required: true, numeric: true, min: 1 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    const D = Store.get();
    const date = todayStr();

    // Out from source location
    D.inventory.push({
      id: genId(), date, flockId: '', eggType, qtyIn: 0, qtyOut: qty,
      source: 'transfer', locationId: fromId, notes: 'Transfer out → ' + toId
    });
    // In to target location
    D.inventory.push({
      id: genId(), date, flockId: '', eggType, qtyIn: qty, qtyOut: 0,
      source: 'transfer', locationId: toId, notes: 'Transfer in ← ' + fromId
    });

    logAudit('transfer', 'inventory', `Moved ${qty} ${eggType} from ${fromId} to ${toId}`);
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('inv_moved') || 'Stock movido' });
    this.render();
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

  // ─────────────── ADJUSTMENT FORM ───────────────
  _showAdjustmentForm() {
    const D = Store.get();
    const locs = D.storageLocations || [];
    const title = '\u2696\uFE0F ' + (t('inv_adjustment') || 'Ajuste de Inventario');
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
          case 'add-location': this._showLocationForm(); return;
          case 'edit-location': this._showLocationForm(btn.dataset.loc); return;
          case 'delete-location': this._deleteLocation(btn.dataset.loc); return;
          case 'move-stock': this._showMoveStockForm(btn.dataset.loc); return;
          case 'add-reservation': this._showReservationForm(); return;
          case 'fulfill-reservation': this._fulfillReservation(btn.dataset.id); return;
          case 'cancel-reservation': this._cancelReservation(btn.dataset.id); return;
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
      .source-badge.fulfilled { background: rgba(46,125,50,.1); color: #2E7D32; }
      .source-badge.cancelled { background: rgba(198,40,40,.1); color: #C62828; }

      /* Location grid */
      .loc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
      .loc-card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.1);
        border-left: 4px solid var(--primary, #1565C0);
      }
      .loc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; }
      .loc-header strong { font-size: 15px; color: var(--text, #212121); }
      .loc-actions { display: flex; gap: 4px; flex-shrink: 0; }
      .loc-zone-badge {
        display: inline-block; padding: 1px 6px; border-radius: 4px;
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        background: var(--primary-fill, rgba(21,101,192,.1)); color: var(--primary, #1565C0);
        margin-right: 6px; vertical-align: middle;
      }
      .loc-desc { font-size: 12px; color: var(--text-light); margin: 0 0 8px; }
      .loc-stats { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
      .loc-stat { display: flex; flex-direction: column; }
      .loc-stat-label { font-size: 11px; color: var(--text-light); }
      .loc-stat-val { font-size: 18px; font-weight: 700; color: var(--text); }
      .loc-bar-bg { height: 8px; background: var(--bg-secondary, #eee); border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
      .loc-bar { height: 100%; border-radius: 4px; transition: width .3s; }
      .loc-pct { font-size: 11px; color: var(--text-light); }
      .loc-types { font-size: 12px; color: var(--text-light); margin: 6px 0 0; }

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
        .loc-grid { grid-template-columns: 1fr; }
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
