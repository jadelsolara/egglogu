// <egg-traceability> — Batch Traceability Web Component
// Replaces monolith renderTraceability(), showBatchForm(), saveBatch(),
// showBatchTrace(), filterBatches(), exportBatchCSV(), deleteBatch()

import {
  Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate, todayStr, genId,
  validateForm, emptyState, DataTable, flockSelect, clientSelect, houseSelect,
  rackSelect, showFieldError, clearFieldErrors, healthScore, logAudit
} from '../core/index.js';
import { modalVal, getModalBody, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

class EggTraceability extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._editId = null;
  }

  connectedCallback() {
    this.render();
    DataTable.handleEvent(this.shadowRoot, () => this.render());

    // Listen for modal save actions
    this._unsubs.push(
      Bus.on('modal:action', (ev) => {
        if (ev.action === 'save-batch') {
          this._saveBatch(this._editId);
        }
      })
    );

    // Listen for house change inside modal to update rack options
    this._unsubs.push(
      Bus.on('modal:change', (ev) => {
        if (ev.change === 'trace-house-change') {
          this._onHouseChange(ev.value);
        }
      })
    );

    // Reset edit state when modal closes
    this._unsubs.push(
      Bus.on('modal:closed', () => {
        this._editId = null;
      })
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() {
    // No charts to destroy; just unsub
  }

  // ─────────────── RENDER ───────────────
  render() {
    const D = Store.get();
    const batches = D.traceability.batches;

    let h = this._styles();
    h += `<div class="page-header"><h2>${t('trace_title')}</h2>
      <div class="btn-group">
        <button class="btn btn-primary" data-action="add-batch">${t('trace_add')}</button>
        <button class="btn btn-secondary" data-action="export-csv">${t('export_csv')}</button>
      </div>
    </div>`;

    // Search
    h += `<div class="card"><div class="form-row"><div class="form-group" style="flex:1">
      <input class="dt-search-input" id="trace-search" placeholder="${t('trace_search')}" data-action="filter-batches">
    </div></div></div>`;

    if (!batches.length) {
      h += emptyState('\uD83D\uDCE6', t('no_data'));
      this.shadowRoot.innerHTML = h;
      this._bindActions();
      return;
    }

    h += `<div id="batch-list">`;
    h += this._renderBatchList(batches, D);
    h += `</div>`;

    this.shadowRoot.innerHTML = h;
    this._bindActions();
  }

  // ─────────────── BATCH LIST (DataTable) ───────────────
  _renderBatchList(batches, D) {
    if (!batches.length) return '';
    return DataTable.create({
      id: 'batches',
      data: batches,
      emptyIcon: '\uD83D\uDCE6',
      emptyText: t('no_data'),
      columns: [
        {
          key: 'id', label: t('trace_batch_id'), type: 'text', sortable: true,
          render: r => '<code>' + sanitizeHTML(r.id.substring(0, 8)) + '</code>'
        },
        {
          key: 'date', label: t('date'), type: 'date', sortable: true,
          filterable: true, filterType: 'date-range'
        },
        {
          key: 'flockId', label: t('prod_flock'), type: 'text', sortable: true,
          filterable: true, filterType: 'select',
          filterOptions: D.flocks.map(f => ({ value: f.id, label: f.name })),
          render: r => {
            const f = D.flocks.find(x => x.id === r.flockId);
            return f ? sanitizeHTML(f.name) : '-';
          }
        },
        {
          key: 'house', label: t('trace_house'), type: 'text', sortable: true,
          render: r => sanitizeHTML(r.house || '-')
        },
        {
          key: 'rackNumber', label: t('trace_rack'), type: 'text', sortable: true,
          render: r => sanitizeHTML(r.rackNumber || '-')
        },
        {
          key: 'boxCount', label: t('trace_box_count'), type: 'number', sortable: true,
          render: r => fmtNum(r.boxCount)
        },
        {
          key: 'eggsPerBox', label: t('trace_eggs_per_box'), type: 'number', sortable: true,
          render: r => fmtNum(r.eggsPerBox)
        },
        {
          key: 'eggType', label: t('prod_egg_type'), type: 'text', sortable: true,
          filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'conventional', label: t('prod_type_conventional') },
            { value: 'free_range', label: t('prod_type_free_range') },
            { value: 'organic', label: t('prod_type_organic') },
            { value: 'pasture_raised', label: t('prod_type_pasture') },
            { value: 'decorative', label: t('prod_type_decorative') }
          ],
          render: r => r.eggType ? t('prod_type_' + r.eggType) || sanitizeHTML(r.eggType) : '-'
        },
        {
          key: 'clientId', label: t('fin_client'), type: 'text', sortable: true,
          filterable: true, filterType: 'select',
          filterOptions: D.clients.map(c => ({ value: c.id, label: c.name })),
          render: r => {
            const c = D.clients.find(x => x.id === r.clientId);
            return c ? sanitizeHTML(c.name) : '-';
          }
        },
        {
          key: 'deliveryDate', label: t('trace_delivery'), type: 'date', sortable: true,
          render: r => r.deliveryDate ? fmtDate(r.deliveryDate) : '-'
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="trace-batch" data-id="${escapeAttr(r.id)}" title="${t('trace_origin')}">&#x1F50D;</button>
        <button class="btn btn-secondary btn-sm" data-action="edit-batch" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-batch" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [
        {
          label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
          action: ids => this._bulkDelete(ids)
        }
      ]
    });
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

      /* Buttons */
      .btn {
        padding: 8px 16px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); background: var(--bg, #fff);
        cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity .2s;
      }
      .btn:hover { opacity: 0.85; }
      .btn-primary { background: var(--primary, #4a7c59); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #C62828); color: #fff; border: none; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-group { display: flex; gap: 6px; }

      /* Card */
      .card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }
      .form-row { display: flex; gap: 12px; flex-wrap: wrap; }
      .form-group { flex: 1; min-width: 140px; }

      /* Stat rows for trace modal */
      .stat-row {
        display: flex; justify-content: space-between; padding: 6px 0;
        border-bottom: 1px solid var(--border, #eee);
      }
      .stat-label { color: var(--text-light, #757575); font-size: 13px; }
      .stat-value { font-weight: 600; font-size: 13px; }
      .qr-display {
        margin-top: 12px; padding: 12px; background: var(--bg-secondary, #f5f5f5);
        border-radius: 8px; font-family: monospace; font-size: 12px;
        word-break: break-all; text-align: center;
      }

      /* Table */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }

      /* DataTable extras */
      .dt-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .dt-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .dt-search-input {
        padding: 6px 12px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); font-size: 13px; min-width: 180px;
        background: var(--bg, #fff); color: var(--text, #212121);
      }
      .dt-filter-select, .dt-filter-input, .dt-filter-date, .dt-filter-num {
        width: 100%; padding: 4px 6px; border: 1px solid var(--border, #e0e0e0);
        border-radius: 6px; font-size: 12px; box-sizing: border-box;
        background: var(--bg, #fff); color: var(--text, #212121);
      }
      .dt-filter-row td { padding: 4px 6px; }
      .dt-card-wrap { position: relative; }
      .dt-table-desktop { display: block; }
      .dt-mobile-cards { display: none; }
      .dt-row-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-bulk-bar {
        display: flex; align-items: center; justify-content: space-between;
        background: var(--primary-fill, rgba(74,124,89,.08)); padding: 8px 12px;
        border-radius: var(--radius, 8px); margin-bottom: 8px; flex-wrap: wrap; gap: 8px;
      }
      .dt-bulk-count { font-weight: 600; font-size: 13px; }
      .dt-bulk-actions { display: flex; gap: 6px; }
      .dt-pagination {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 0; flex-wrap: wrap; gap: 8px; font-size: 13px;
      }
      .dt-page-buttons { display: flex; gap: 4px; }
      .dt-page-size { padding: 4px 8px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; background: var(--bg, #fff); }
      .dt-footer-info { font-size: 13px; color: var(--text-light, #757575); padding: 8px 0; }
      .dt-sortable { cursor: pointer; user-select: none; }
      .dt-sorted { color: var(--primary, #4a7c59); }
      .dt-col-picker-wrap { position: relative; }
      .dt-column-picker {
        position: absolute; right: 0; top: 100%; background: var(--bg, #fff);
        border: 1px solid var(--border, #e0e0e0); border-radius: 8px;
        padding: 8px; z-index: 100; min-width: 180px;
        box-shadow: 0 4px 12px rgba(0,0,0,.15);
      }
      .dt-col-option { display: block; padding: 4px 8px; font-size: 13px; cursor: pointer; }
      .dt-card { background: var(--bg, #fff); border-radius: 8px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .dt-card-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-card-title { font-weight: 700; margin-bottom: 6px; }
      .dt-card-field { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
      .dt-card-label { color: var(--text-light, #757575); }
      .dt-card-actions { margin-top: 8px; display: flex; gap: 6px; }
      .dt-card-check { margin-bottom: 6px; }
      .dt-th-check, .dt-td-check { width: 36px; text-align: center; }

      @media (max-width: 768px) {
        .dt-table-desktop { display: none; }
        .dt-mobile-cards { display: block; }
      }
    </style>`;
  }

  // ─────────────── ACTION BINDING (event delegation) ───────────────
  _bindActions() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'add-batch':
          this._showBatchForm(null);
          break;
        case 'edit-batch':
          this._showBatchForm(btn.dataset.id);
          break;
        case 'delete-batch':
          this._deleteBatch(btn.dataset.id);
          break;
        case 'trace-batch':
          this._showBatchTrace(btn.dataset.id);
          break;
        case 'export-csv':
          this._exportBatchCSV();
          break;
      }
    });

    // Search/filter input
    const searchInput = root.querySelector('#trace-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this._filterBatches());
    }
  }

  // ─────────────── SHOW BATCH FORM ───────────────
  _showBatchForm(id) {
    this._editId = id || '';
    const D = Store.get();
    const b = id ? D.traceability.batches.find(x => x.id === id) : null;

    const eggTypeSel = (val) => {
      const types = [
        { v: 'conventional', l: t('prod_type_conventional') },
        { v: 'free_range', l: t('prod_type_free_range') },
        { v: 'organic', l: t('prod_type_organic') },
        { v: 'pasture_raised', l: t('prod_type_pasture') },
        { v: 'decorative', l: t('prod_type_decorative') }
      ];
      return types.map(o =>
        `<option value="${escapeAttr(o.v)}"${val === o.v ? ' selected' : ''}>${sanitizeHTML(o.l)}</option>`
      ).join('');
    };

    const body = `
<div class="form-row">
  <div class="form-group">
    <label>${t('date')}</label>
    <input type="date" id="tb-date" value="${b ? b.date : todayStr()}">
  </div>
  <div class="form-group">
    <label>${t('prod_flock')}</label>
    <select id="tb-flock">${flockSelect(b ? b.flockId : '')}</select>
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('trace_house')}</label>
    <select id="tb-house" data-change="trace-house-change">${houseSelect(b ? b.house || '' : '')}</select>
  </div>
  <div class="form-group">
    <label>${t('trace_rack')}</label>
    <select id="tb-rack">${rackSelect(b ? b.house || '' : '', b ? b.rackNumber || '' : '')}</select>
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('trace_box_count')}</label>
    <input type="number" id="tb-boxes" value="${b ? b.boxCount || '' : ''}" min="1">
  </div>
  <div class="form-group">
    <label>${t('trace_eggs_per_box')}</label>
    <input type="number" id="tb-epb" value="${b ? b.eggsPerBox || 30 : 30}" min="1">
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('prod_egg_type')}</label>
    <select id="tb-type">${eggTypeSel(b ? b.eggType || 'conventional' : 'conventional')}</select>
  </div>
  <div class="form-group">
    <label>${t('fin_client')}</label>
    <select id="tb-client">${clientSelect(b ? b.clientId : '')}</select>
  </div>
</div>
<div class="form-group">
  <label>${t('trace_delivery')}</label>
  <input type="date" id="tb-delivery" value="${b ? b.deliveryDate || '' : ''}">
</div>
<div class="form-group">
  <label>${t('notes')}</label>
  <textarea id="tb-notes">${b ? escapeAttr(b.notes || '') : ''}</textarea>
</div>
<div class="modal-footer">
  <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
  <button class="btn btn-primary" data-action="save-batch">${t('save')}</button>
</div>`;

    Bus.emit('modal:open', {
      title: b ? t('edit') : t('trace_add'),
      body
    });
  }

  // ─────────────── HOUSE CHANGE → UPDATE RACKS ───────────────
  _onHouseChange(houseName) {
    const rackEl = modalQuery('#tb-rack');
    if (!rackEl) return;
    rackEl.innerHTML = rackSelect(houseName, '');
  }

  // ─────────────── SAVE BATCH ───────────────
  _saveBatch(id) {
    clearFieldErrors();
    const D = Store.get();

    const o = {
      date: modalVal('tb-date'),
      flockId: modalVal('tb-flock'),
      house: modalVal('tb-house'),
      rackNumber: modalVal('tb-rack'),
      boxCount: parseInt(modalVal('tb-boxes')) || 0,
      eggsPerBox: parseInt(modalVal('tb-epb')) || 30,
      eggType: modalVal('tb-type'),
      clientId: modalVal('tb-client'),
      deliveryDate: modalVal('tb-delivery'),
      notes: modalVal('tb-notes')
    };

    // Validation
    const v = validateForm({
      'tb-date': { value: o.date, rules: { required: true, date: true } },
      'tb-flock': { value: o.flockId, rules: { required: true } },
      'tb-boxes': { value: modalVal('tb-boxes'), rules: { required: true, numeric: true, min: 1 } },
      'tb-epb': { value: modalVal('tb-epb'), rules: { required: true, numeric: true, min: 1 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    // Available eggs check
    const batchEggs = o.boxCount * o.eggsPerBox;
    const prodEggs = D.dailyProduction
      .filter(p => p.flockId === o.flockId)
      .reduce((s, p) => s + (p.eggsCollected || 0), 0);
    const batchedEggs = D.traceability.batches
      .filter(b => b.flockId === o.flockId && b.id !== (id || ''))
      .reduce((s, b) => s + (b.boxCount || 0) * (b.eggsPerBox || 0), 0);
    const availableEggs = prodEggs - batchedEggs;

    if (batchEggs > availableEggs && availableEggs >= 0) {
      Bus.emit('toast', {
        msg: `Batch (${fmtNum(batchEggs)}) exceeds available production (${fmtNum(availableEggs)} eggs). Check data.`,
        type: 'warning'
      });
    }

    // QR code string
    const qrCode = `EGGLOGU|BATCH:${id || o.id || genId()}|FLOCK:${o.flockId}|DATE:${o.date}|HOUSE:${o.house}|TYPE:${o.eggType}`;

    if (id) {
      o.qrCode = qrCode.replace(/BATCH:[^|]+/, 'BATCH:' + id);
      const i = D.traceability.batches.findIndex(b => b.id === id);
      if (i >= 0) {
        logAudit('update', 'traceability', 'Edit batch', D.traceability.batches[i], o);
        D.traceability.batches[i] = { ...D.traceability.batches[i], ...o };
      }
    } else {
      o.id = genId();
      o.qrCode = `EGGLOGU|BATCH:${o.id}|FLOCK:${o.flockId}|DATE:${o.date}|HOUSE:${o.house}|TYPE:${o.eggType}`;
      D.traceability.batches.push(o);
      logAudit('create', 'traceability', 'New batch: ' + o.id.substring(0, 8), null, o);
    }

    Store.set(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─────────────── DELETE BATCH ───────────────
  async _deleteBatch(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    const old = D.traceability.batches.find(b => b.id === id);
    D.traceability.batches = D.traceability.batches.filter(b => b.id !== id);
    logAudit('delete', 'traceability', 'Delete batch: ' + (id || '').substring(0, 8), old, null);
    Store.set(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─────────────── BULK DELETE ───────────────
  async _bulkDelete(ids) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.traceability.batches = D.traceability.batches.filter(b => !ids.includes(b.id));
    Store.set(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─────────────── SHOW BATCH TRACE (origin detail modal) ───────────────
  _showBatchTrace(id) {
    const D = Store.get();
    const b = D.traceability.batches.find(x => x.id === id);
    if (!b) return;

    const f = D.flocks.find(x => x.id === b.flockId);
    const c = D.clients.find(x => x.id === b.clientId);
    const breed = f ? f.breed || 'generic' : 'generic';
    const hs = f ? healthScore(f.id) : 'N/A';

    const body = `
<div class="card" style="margin:0">
  <h4>${t('trace_batch_id')}: ${sanitizeHTML(b.id.substring(0, 8))}</h4>
  <div class="stat-row">
    <span class="stat-label">${t('trace_house')}</span>
    <span class="stat-value">${sanitizeHTML(b.house || '-')}</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">${t('prod_flock')}</span>
    <span class="stat-value">${f ? sanitizeHTML(f.name) + ' (' + sanitizeHTML(breed) + ')' : '-'}</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">${t('date')}</span>
    <span class="stat-value">${fmtDate(b.date)}</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">${t('flock_health')}</span>
    <span class="stat-value">${hs}</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">${t('trace_box_count')}</span>
    <span class="stat-value">${fmtNum(b.boxCount)} x ${fmtNum(b.eggsPerBox)} = ${fmtNum(b.boxCount * b.eggsPerBox)} eggs</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">${t('prod_egg_type')}</span>
    <span class="stat-value">${t('prod_type_' + b.eggType) || sanitizeHTML(b.eggType)}</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">${t('fin_client')}</span>
    <span class="stat-value">${c ? sanitizeHTML(c.name) : '-'}</span>
  </div>
  <div class="stat-row">
    <span class="stat-label">${t('trace_delivery')}</span>
    <span class="stat-value">${b.deliveryDate ? fmtDate(b.deliveryDate) : '-'}</span>
  </div>
  <hr>
  <div class="qr-display">${sanitizeHTML(b.qrCode || 'N/A')}</div>
</div>
<div class="modal-footer">
  <button class="btn btn-secondary" data-action="cancel">${t('close')}</button>
</div>`;

    Bus.emit('modal:open', {
      title: '\uD83D\uDD0D ' + t('trace_origin'),
      body
    });
  }

  // ─────────────── FILTER BATCHES ───────────────
  _filterBatches() {
    const searchEl = this.shadowRoot.querySelector('#trace-search');
    const q = (searchEl ? searchEl.value : '').toLowerCase();
    const D = Store.get();

    const filtered = q
      ? D.traceability.batches.filter(b => {
          const flock = D.flocks.find(f => f.id === b.flockId);
          const client = D.clients.find(c => c.id === b.clientId);
          return b.id.toLowerCase().includes(q)
            || (b.qrCode || '').toLowerCase().includes(q)
            || (b.house || '').toLowerCase().includes(q)
            || (flock ? flock.name.toLowerCase().includes(q) : false)
            || (client ? client.name.toLowerCase().includes(q) : false)
            || (b.eggType || '').toLowerCase().includes(q)
            || (b.date || '').includes(q);
        })
      : D.traceability.batches;

    const el = this.shadowRoot.querySelector('#batch-list');
    if (el) el.innerHTML = this._renderBatchList(filtered, D);
  }

  // ─────────────── EXPORT CSV ───────────────
  _exportBatchCSV() {
    const D = Store.get();
    const batches = D.traceability.batches;
    if (!batches.length) {
      Bus.emit('toast', { msg: t('no_data'), type: 'warning' });
      return;
    }

    const esc = s => String(s || '').replace(/"/g, '""');
    let csv = 'Batch ID,Date,Flock,House,Rack,Boxes,Eggs/Box,Type,Client,Delivery,QR\n';

    batches.forEach(b => {
      const f = D.flocks.find(x => x.id === b.flockId);
      const c = D.clients.find(x => x.id === b.clientId);
      csv += `"${esc(b.id)}","${b.date}","${esc(f ? f.name : '')}","${esc(b.house)}","${esc(b.rackNumber)}",${b.boxCount},${b.eggsPerBox},"${esc(b.eggType)}","${esc(c ? c.name : '')}","${b.deliveryDate || ''}","${esc(b.qrCode)}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'egglogu_batches.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

customElements.define('egg-traceability', EggTraceability);
export { EggTraceability };
