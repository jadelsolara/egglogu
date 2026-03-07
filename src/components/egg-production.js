// <egg-production> — Daily Egg Production Web Component
// Replaces monolith renderProduction(), showProdForm(), saveProd(), deleteProd()

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate, todayStr, genId, validateForm, emptyState, DataTable, CATALOGS, VENG, flockSelect, catalogSelect, statusBadge, showFieldError, clearFieldErrors, logAudit } from '../core/index.js';
import { COMMERCIAL_BREEDS } from '../core/catalogs.js';
import { modalVal, getModalBody, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

// ─── Local helper: VENG validation panel inside modal ───
function showVengPanel(errors, warnings) {
  const body = getModalBody();
  if (!body) return;
  let h = '';
  if (errors.length) {
    h += '<div class="veng-panel"><div class="dm-error-box"><strong style="color:#c00">VENG Errors</strong><ul style="margin:4px 0;padding-left:20px;color:#900">';
    errors.forEach(e => { h += '<li>' + sanitizeHTML(e.msg) + '</li>'; });
    h += '</ul></div></div>';
  }
  if (warnings.length) {
    h += '<div class="veng-panel"><div class="dm-warn-box"><strong style="color:#e65100">VENG Warnings</strong> <span style="font-size:12px;color:#795548">(save again to override)</span><ul style="margin:4px 0;padding-left:20px;color:#6d4c00">';
    warnings.forEach(w => { h += '<li>' + sanitizeHTML(w.msg) + '</li>'; });
    h += '</ul></div></div>';
  }
  let panel = body.querySelector('#veng-panel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'veng-panel'; body.prepend(panel); }
  panel.innerHTML = h;
}

class EggProduction extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._vengWarningsShown = false;
    this._editId = null;
  }

  connectedCallback() {
    this.render();
    DataTable.handleEvent(this.shadowRoot, () => this.render());

    // Listen for modal save actions
    this._unsubs.push(
      Bus.on('modal:action', (ev) => {
        if (ev.action === 'save-prod') {
          this._saveProd(this._editId);
        }
      })
    );

    // Listen for flock change inside modal
    this._unsubs.push(
      Bus.on('modal:change', (ev) => {
        if (ev.change === 'prod-flock-change') {
          this._onProdFlockChange(ev.value);
        }
      })
    );

    // Reset VENG warnings when modal closes
    this._unsubs.push(
      Bus.on('modal:closed', () => {
        this._vengWarningsShown = false;
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

    let h = this._styles();
    h += `<div class="page-header"><h2>${t('prod_title')}</h2><button class="btn btn-primary" data-action="add-prod">${t('prod_add')}</button></div>`;

    if (!D.dailyProduction.length) {
      h += emptyState('\uD83E\uDD5A', t('no_data'), t('prod_add'));
      this.shadowRoot.innerHTML = h;
      this._bindHeaderActions();
      return;
    }

    h += DataTable.create({
      id: 'production',
      data: D.dailyProduction,
      emptyIcon: '\uD83E\uDD5A',
      emptyText: t('no_data'),
      columns: [
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
          key: 'eggsCollected', label: t('prod_eggs'), type: 'number', sortable: true,
          render: r => '<strong>' + fmtNum(r.eggsCollected) + '</strong>'
        },
        {
          key: '_sizes', label: 'S/M/L/XL/J', type: 'text',
          getValue: r => [r.eggsS || 0, r.eggsM || 0, r.eggsL || 0, r.eggsXL || 0, r.eggsJumbo || 0].join('/')
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
          render: r => r.eggType ? t('prod_type_' + r.eggType) : '-'
        },
        {
          key: 'marketChannel', label: t('prod_market'), type: 'text', sortable: true,
          filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'wholesale', label: t('prod_market_wholesale') },
            { value: 'supermarket', label: t('prod_market_supermarket') },
            { value: 'restaurant', label: t('prod_market_restaurant') },
            { value: 'direct', label: t('prod_market_direct') },
            { value: 'export', label: t('prod_market_export') },
            { value: 'pasteurized', label: t('prod_market_pasteurized') }
          ],
          render: r => r.marketChannel ? t('prod_market_' + r.marketChannel) : '-'
        },
        {
          key: 'eggsBroken', label: t('prod_broken'), type: 'number', sortable: true,
          render: r => fmtNum(r.eggsBroken || 0)
        },
        {
          key: 'deaths', label: t('prod_deaths'), type: 'number', sortable: true,
          render: r => r.deaths
            ? '<span style="color:var(--danger)">' + r.deaths + '</span>'
            : '-'
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="edit-prod" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-prod" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [
        {
          label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
          action: ids => this._bulkDelete(ids)
        }
      ]
    });

    this.shadowRoot.innerHTML = h;
    this._bindHeaderActions();
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

      /* Badges */
      .badge {
        display: inline-block; padding: 2px 10px; border-radius: 12px;
        font-size: 12px; font-weight: 600;
      }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .badge-warning { background: #fff8e1; color: #e65100; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-secondary { background: #f5f5f5; color: #757575; }
      .badge-danger { background: #ffebee; color: #c62828; }

      /* Card */
      .card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
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

  // ─────────────── ACTION BINDING ───────────────
  _bindHeaderActions() {
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'add-prod':
          this._showProdForm(null);
          break;
        case 'edit-prod':
          this._showProdForm(btn.dataset.id);
          break;
        case 'delete-prod':
          this._deleteProd(btn.dataset.id);
          break;
      }
    });
  }

  // ─────────────── SHOW FORM ───────────────
  _showProdForm(id) {
    this._editId = id || '';
    this._vengWarningsShown = false;
    const D = Store.get();
    const p = id ? D.dailyProduction.find(x => x.id === id) : null;

    const shellSel = (val) => {
      const opts = [
        { v: '', l: '--' },
        { v: 'blanco', l: t('prod_shell_white') },
        { v: 'marron', l: t('prod_shell_brown') },
        { v: 'crema', l: t('prod_shell_cream') }
      ];
      return opts.map(o =>
        `<option value="${escapeAttr(o.v)}"${val === o.v ? ' selected' : ''}>${sanitizeHTML(o.l)}</option>`
      ).join('');
    };

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

    const marketSel = (val) => {
      const channels = [
        { v: 'wholesale', l: t('prod_market_wholesale') },
        { v: 'supermarket', l: t('prod_market_supermarket') },
        { v: 'restaurant', l: t('prod_market_restaurant') },
        { v: 'direct', l: t('prod_market_direct') },
        { v: 'export', l: t('prod_market_export') },
        { v: 'pasteurized', l: t('prod_market_pasteurized') }
      ];
      return channels.map(o =>
        `<option value="${escapeAttr(o.v)}"${val === o.v ? ' selected' : ''}>${sanitizeHTML(o.l)}</option>`
      ).join('');
    };

    const body = `
<div class="form-row">
  <div class="form-group">
    <label>${t('prod_date')}</label>
    <input type="date" id="p-date" value="${p ? p.date : todayStr()}">
  </div>
  <div class="form-group">
    <label>${t('prod_flock')}</label>
    <select id="p-flock" data-change="prod-flock-change">${flockSelect(p ? p.flockId : '')}</select>
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('prod_eggs')}</label>
    <input type="number" id="p-eggs" value="${p ? p.eggsCollected : ''}" min="0">
  </div>
  <div class="form-group">
    <label>${t('prod_broken')}</label>
    <input type="number" id="p-broken" value="${p ? p.eggsBroken || '' : ''}" min="0">
  </div>
</div>
<div class="form-row-3">
  <div class="form-group">
    <label>${t('prod_size_s')}</label>
    <input type="number" id="p-s" value="${p ? p.eggsS || '' : ''}" min="0">
  </div>
  <div class="form-group">
    <label>${t('prod_size_m')}</label>
    <input type="number" id="p-m" value="${p ? p.eggsM || '' : ''}" min="0">
  </div>
  <div class="form-group">
    <label>${t('prod_size_l')}</label>
    <input type="number" id="p-l" value="${p ? p.eggsL || '' : ''}" min="0">
  </div>
</div>
<div class="form-row-3">
  <div class="form-group">
    <label>${t('prod_size_xl')}</label>
    <input type="number" id="p-xl" value="${p ? p.eggsXL || '' : ''}" min="0">
  </div>
  <div class="form-group">
    <label>${t('prod_size_jumbo')}</label>
    <input type="number" id="p-jumbo" value="${p ? p.eggsJumbo || '' : ''}" min="0">
  </div>
  <div class="form-group">
    <label>${t('prod_yolk')}</label>
    <input type="number" id="p-yolk" value="${p ? p.yolkScore || '' : ''}" min="1" max="10">
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('prod_shell')}</label>
    <select id="p-shell">${shellSel(p ? p.shellColor || '' : '')}</select>
  </div>
  <div class="form-group">
    <label>${t('prod_deaths')}</label>
    <input type="number" id="p-deaths" value="${p ? p.deaths || '' : ''}" min="0">
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('prod_egg_type')}</label>
    <select id="p-etype">${eggTypeSel(p ? p.eggType || 'conventional' : 'conventional')}</select>
  </div>
  <div class="form-group">
    <label>${t('prod_market')}</label>
    <select id="p-market">${marketSel(p ? p.marketChannel || 'wholesale' : 'wholesale')}</select>
  </div>
</div>
<div class="form-group">
  <label>${t('prod_death_cause')}</label>
  <select id="p-cause">${catalogSelect(CATALOGS.deathCauses, p ? p.deathCause || '' : '')}</select>
</div>
<div class="form-group">
  <label>${t('notes')}</label>
  <textarea id="p-notes">${p ? escapeAttr(p.notes || '') : ''}</textarea>
</div>
<div class="modal-footer">
  <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
  <button class="btn btn-primary" data-action="save-prod">${t('save')}</button>
</div>`;

    Bus.emit('modal:open', {
      title: p ? t('edit') : t('prod_add'),
      body
    });

    // If new record, auto-set shell color from breed after modal renders
    if (!p) {
      setTimeout(() => {
        const fid = modalVal('p-flock');
        if (fid) this._onProdFlockChange(fid);
      }, 80);
    }
  }

  // ─────────────── FLOCK CHANGE → AUTO SHELL COLOR ───────────────
  _onProdFlockChange(fid) {
    const shellEl = modalQuery('#p-shell');
    if (!fid || !shellEl) return;
    const D = Store.get();
    const f = D.flocks.find(x => x.id === fid);
    if (f) {
      const b = COMMERCIAL_BREEDS.find(x => x.id === f.breed);
      if (b && b.eggColor) {
        const colorMap = {
          'Blanco': 'blanco',
          'Marr\u00F3n': 'marron',
          'Marr\u00F3n oscuro': 'marron',
          'Crema': 'crema',
          'Azul/Verde': 'crema',
          'Verde oliva': 'crema'
        };
        shellEl.value = colorMap[b.eggColor] || '';
      }
    }
  }

  // ─────────────── SAVE ───────────────
  _saveProd(id) {
    clearFieldErrors();

    const o = {
      date: modalVal('p-date'),
      flockId: modalVal('p-flock'),
      eggsCollected: parseInt(modalVal('p-eggs')) || 0,
      eggsBroken: parseInt(modalVal('p-broken')) || 0,
      eggsS: parseInt(modalVal('p-s')) || 0,
      eggsM: parseInt(modalVal('p-m')) || 0,
      eggsL: parseInt(modalVal('p-l')) || 0,
      eggsXL: parseInt(modalVal('p-xl')) || 0,
      eggsJumbo: parseInt(modalVal('p-jumbo')) || 0,
      shellColor: modalVal('p-shell'),
      yolkScore: parseInt(modalVal('p-yolk')) || 0,
      deaths: parseInt(modalVal('p-deaths')) || 0,
      deathCause: modalVal('p-cause'),
      eggType: modalVal('p-etype') || 'conventional',
      marketChannel: modalVal('p-market') || 'wholesale',
      notes: modalVal('p-notes')
    };

    // Basic validation
    const v = validateForm({
      'p-date': { value: o.date, rules: { required: true, date: true } },
      'p-flock': { value: o.flockId, rules: { required: true } },
      'p-eggs': { value: modalVal('p-eggs'), rules: { required: true, numeric: true, min: 0 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    const D = Store.get();

    // Extra validations: eggs vs flock size 110%, deaths vs remaining
    const flock = D.flocks.find(f => f.id === o.flockId);
    if (flock && flock.currentCount) {
      if (o.eggsCollected > flock.currentCount * 1.1) {
        showFieldError('p-eggs', t('prod_eggs') + ' > ' + Math.round(flock.currentCount * 1.1) + ' (110% ' + t('prod_flock') + ')');
        return;
      }
      if (o.deaths > flock.currentCount) {
        showFieldError('p-deaths', t('prod_deaths') + ' > ' + flock.currentCount + ' (' + t('prod_flock') + ')');
        return;
      }
    }

    // VENG gate
    if (!this._vengWarningsShown) {
      const vr = VENG.gate.production(o, D);
      if (!vr.ok) {
        vr.errors.forEach(e => { if (e.field) showFieldError(e.field, e.msg); });
        showVengPanel(vr.errors, vr.warnings);
        return;
      }
      if (vr.warnings.length) {
        showVengPanel([], vr.warnings);
        this._vengWarningsShown = true;
        return;
      }
    }
    this._vengWarningsShown = false;

    // Save: update or create
    if (id) {
      const i = D.dailyProduction.findIndex(p => p.id === id);
      if (i >= 0) {
        logAudit('update', 'production', 'Edit production', D.dailyProduction[i], o);
        D.dailyProduction[i] = { ...D.dailyProduction[i], ...o };
      }
    } else {
      o.id = genId();
      D.dailyProduction.push(o);
      logAudit('create', 'production', 'New production: ' + o.eggsCollected + ' eggs', null, o);

      // Auto-inventory push by size
      if (o.eggsCollected > 0) {
        const sizes = [
          { k: 'eggsS', t: 'S' },
          { k: 'eggsM', t: 'M' },
          { k: 'eggsL', t: 'L' },
          { k: 'eggsXL', t: 'XL' },
          { k: 'eggsJumbo', t: 'Jumbo' }
        ];
        let distributed = false;
        sizes.forEach(s => {
          if (o[s.k] > 0) {
            D.inventory.push({
              id: genId(), date: o.date, flockId: o.flockId,
              eggType: s.t, qtyIn: o[s.k], qtyOut: 0,
              source: 'production', ref: o.id
            });
            distributed = true;
          }
        });
        if (!distributed) {
          D.inventory.push({
            id: genId(), date: o.date, flockId: o.flockId,
            eggType: 'M', qtyIn: o.eggsCollected, qtyOut: 0,
            source: 'production', ref: o.id
          });
        }
      }
    }

    // Auto-subtract mortality from flock current count
    if (o.deaths > 0) {
      const fi = D.flocks.findIndex(f => f.id === o.flockId);
      if (fi >= 0 && D.flocks[fi].currentCount) {
        D.flocks[fi].currentCount = Math.max(0, D.flocks[fi].currentCount - o.deaths);
      }
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─────────────── DELETE ───────────────
  async _deleteProd(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    const old = D.dailyProduction.find(p => p.id === id);
    logAudit('delete', 'production', 'Delete production', old, null);
    D.dailyProduction = D.dailyProduction.filter(p => p.id !== id);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─────────────── BULK DELETE ───────────────
  async _bulkDelete(ids) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    ids.forEach(id => {
      const old = D.dailyProduction.find(p => p.id === id);
      if (old) logAudit('delete', 'production', 'Bulk delete', old, null);
      D.dailyProduction = D.dailyProduction.filter(p => p.id !== id);
    });
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    DataTable.reset('production');
    this.render();
  }
}

customElements.define('egg-production', EggProduction);
export { EggProduction };
