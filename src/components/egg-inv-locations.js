// <egg-inv-locations> — Storage Locations Sub-Component
// Extracted from egg-inventory.js: locations tab render + CRUD + move stock

import {
  Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate
} from '../core/index.js';
import { kpi, showFieldError, clearFieldErrors, logAudit } from '../core/helpers.js';
import { todayStr, genId, validateForm } from '../core/utils.js';
import { modalVal } from './egg-modal.js';

const EGG_TYPES = ['S', 'M', 'L', 'XL', 'Jumbo'];

class EggInvLocations extends HTMLElement {
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
      Bus.on('nav:inv-location-add', () => this._showLocationForm())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() {}

  _onModalAction(ev) {
    switch (ev.action) {
      case 'save-location': this._saveLocation(); break;
      case 'save-move-stock': this._saveMoveStock(); break;
    }
  }

  render() {
    const D = Store.get();
    this.shadowRoot.innerHTML = this._styles() + this._renderLocationsTab(D);
    this._bindEvents();
  }

  // ═══════════════ LOCATIONS TAB RENDER ═══════════════
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
        const typeStr = Object.entries(typeBreakdown).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${fmtNum(v)}`).join(' \u00B7 ');

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
      source: 'transfer', locationId: fromId, notes: 'Transfer out \u2192 ' + toId
    });
    // In to target location
    D.inventory.push({
      id: genId(), date, flockId: '', eggType, qtyIn: qty, qtyOut: 0,
      source: 'transfer', locationId: toId, notes: 'Transfer in \u2190 ' + fromId
    });

    logAudit('transfer', 'inventory', `Moved ${qty} ${eggType} from ${fromId} to ${toId}`);
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('inv_moved') || 'Stock movido' });
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
        case 'add-location': this._showLocationForm(); return;
        case 'edit-location': this._showLocationForm(btn.dataset.loc); return;
        case 'delete-location': this._deleteLocation(btn.dataset.loc); return;
        case 'move-stock': this._showMoveStockForm(btn.dataset.loc); return;
      }
    });
  }

  // ─────────────── STYLES ───────────────
  _styles() {
    return `<style>
      :host { display: block; }

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

      @media (max-width: 900px) {
        .loc-grid { grid-template-columns: 1fr; }
      }
    </style>`;
  }
}

customElements.define('egg-inv-locations', EggInvLocations);
export { EggInvLocations };
