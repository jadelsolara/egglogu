// EGGlogU — Feed Web Component
// Purchases, Consumption, Stock tracking, FCR calculation.
// Replaces monolith: renderFeed, renderFeedPurchases, showFeedPurchaseForm,
// saveFeedPurchase, deleteFeedPurchase, renderFeedConsumption, showFeedConsForm,
// saveFeedCons, deleteFeedCons.

import { Store } from '../core/store.js';
import { Bus } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, genId, validateForm, emptyState } from '../core/utils.js';
import { DataTable } from '../core/datatable.js';
import { VENG } from '../core/veng.js';
import { kpi, flockSelect, supplierSelect, handleSupplierChange, resolveSupplier, feedTypeSelect, showFieldError, clearFieldErrors, logAudit } from '../core/helpers.js';
import { modalVal, getModalBody } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

/* ── showVengPanel helper ─────────────────────────────── */
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

/* ── Component ────────────────────────────────────────── */
class EggFeed extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'purchases';
    this._vengWarningsShown = false;
    this._unsubs = [];
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('modal:action', (ev) => this._onModalAction(ev)),
      Bus.on('modal:change', (ev) => this._onModalChange(ev))
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  /* ── Render ──────────────────────────────────────────── */
  render() {
    const D = Store.get();
    const totalPurchased = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0);
    const totalConsumed = D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
    const totalCost = D.feed.purchases.reduce((s, p) => s + (p.cost || 0), 0);
    const stock = totalPurchased - totalConsumed;
    const isLow = stock < (D.settings.minFeedStock || 50);

    // FCR 30-day
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const d30s = d30.toISOString().substring(0, 10);
    const tF30 = D.feed.consumption.filter(c => c.date >= d30s).reduce((s, c) => s + (c.quantityKg || 0), 0);
    const tE30 = D.dailyProduction.filter(p => p.date >= d30s).reduce((s, p) => s + (p.eggsCollected || 0), 0) * 0.06;
    const fcr = tE30 > 0 ? (tF30 / tE30) : 0;

    let h = this._css();

    // Header
    h += `<div class="page-header"><h2>${t('feed_title')}</h2></div>`;

    // KPI Grid
    h += '<div class="kpi-grid">';
    h += kpi(t('feed_stock'), fmtNum(stock, 1) + ' kg', '', isLow ? 'danger' : '', t('info_feed_stock'));
    h += kpi(t('feed_purchases'), fmtNum(totalPurchased, 1) + ' kg', fmtMoney(totalCost) + ' ' + t('total'), '', t('info_feed_purchases'));
    h += kpi(t('feed_consumption'), fmtNum(totalConsumed, 1) + ' kg', '', '', t('info_feed_consumption'));
    h += kpi(t('kpi_fcr'), fcr > 0 ? fmtNum(fcr, 2) : '-', '30d', fcr > 3 ? 'danger' : fcr > 2.5 ? 'warning' : '', t('kpi_info_fcr'));
    h += '</div>';

    // Tabs
    h += '<div class="tabs">';
    h += `<div class="tab${this._currentTab === 'purchases' ? ' active' : ''}" data-tab="purchases">\uD83D\uDCE6 ${t('feed_purchases')}</div>`;
    h += `<div class="tab${this._currentTab === 'consumption' ? ' active' : ''}" data-tab="consumption">\uD83C\uDF7D\uFE0F ${t('feed_consumption')}</div>`;
    h += '</div>';

    // Tab content
    if (this._currentTab === 'purchases') {
      h += this._renderPurchases(D);
    } else {
      h += this._renderConsumption(D);
    }

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  /* ── Purchases DataTable ─────────────────────────────── */
  _renderPurchases(D) {
    return DataTable.create({
      id: 'feedPurchases',
      data: D.feed.purchases,
      onRefresh: () => this.render(),
      emptyIcon: '\uD83D\uDCE6',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px"><h3>${t('feed_purchases')}</h3><button class="btn btn-primary btn-sm" data-action="add-purchase">${t('feed_add_purchase')}</button></div>`,
      columns: [
        { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        { key: 'type', label: t('feed_type'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [...new Set(D.feed.purchases.map(p => p.type).filter(Boolean))].map(v => ({ value: v, label: v })),
          render: r => sanitizeHTML(r.type || '-') },
        { key: 'quantityKg', label: t('feed_qty'), type: 'number', sortable: true, render: r => fmtNum(r.quantityKg, 1) },
        { key: 'cost', label: t('feed_cost'), type: 'number', sortable: true, render: r => fmtMoney(r.cost) },
        { key: '_ppkg', label: '$/kg', type: 'number', sortable: true,
          getValue: r => r.quantityKg > 0 ? (r.cost / r.quantityKg) : 0,
          render: r => fmtMoney(r.quantityKg > 0 ? (r.cost / r.quantityKg) : 0) },
        { key: 'supplier', label: t('feed_supplier'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [...new Set(D.feed.purchases.map(p => p.supplier).filter(Boolean))].map(v => ({ value: v, label: v })),
          render: r => sanitizeHTML(r.supplier || '-') }
      ],
      actions: r => `<div class="btn-group"><button class="btn btn-secondary btn-sm" data-action="edit-purchase" data-id="${escapeAttr(r.id)}">${t('edit')}</button><button class="btn btn-danger btn-sm" data-action="delete-purchase" data-id="${escapeAttr(r.id)}">${t('delete')}</button></div>`,
      bulkActions: [{
        label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
        action: async (ids) => {
          if (!await showConfirm(t('confirm_delete'))) return;
          const D = Store.get();
          D.feed.purchases = D.feed.purchases.filter(p => !ids.includes(p.id));
          Store.save(D);
          this.render();
        }
      }]
    });
  }

  /* ── Consumption DataTable ───────────────────────────── */
  _renderConsumption(D) {
    return DataTable.create({
      id: 'feedConsumption',
      data: D.feed.consumption,
      onRefresh: () => this.render(),
      emptyIcon: '\uD83C\uDF7D\uFE0F',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px"><h3>${t('feed_consumption')}</h3><button class="btn btn-primary btn-sm" data-action="add-consumption">${t('feed_add_consumption')}</button></div>`,
      columns: [
        { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        { key: 'flockId', label: t('feed_flock'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: D.flocks.map(f => ({ value: f.id, label: f.name })),
          render: r => { const f = D.flocks.find(x => x.id === r.flockId); return f ? sanitizeHTML(f.name) : '-'; } },
        { key: 'quantityKg', label: t('feed_qty'), type: 'number', sortable: true, render: r => fmtNum(r.quantityKg, 1) + ' kg' },
        { key: 'type', label: t('feed_type'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [...new Set(D.feed.consumption.map(c => c.type).filter(Boolean))].map(v => ({ value: v, label: v })),
          render: r => sanitizeHTML(r.type || '-') }
      ],
      actions: r => `<div class="btn-group"><button class="btn btn-secondary btn-sm" data-action="edit-consumption" data-id="${escapeAttr(r.id)}">${t('edit')}</button><button class="btn btn-danger btn-sm" data-action="delete-consumption" data-id="${escapeAttr(r.id)}">${t('delete')}</button></div>`,
      bulkActions: [{
        label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
        action: async (ids) => {
          if (!await showConfirm(t('confirm_delete'))) return;
          const D = Store.get();
          D.feed.consumption = D.feed.consumption.filter(c => !ids.includes(c.id));
          Store.save(D);
          this.render();
        }
      }]
    });
  }

  /* ── Event Binding ───────────────────────────────────── */
  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      // Tab switching
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this._currentTab = tab.dataset.tab;
        this.render();
        return;
      }

      // KPI tooltip
      if (e.target.classList.contains('kpi-info-btn')) {
        const card = e.target.closest('.kpi-card');
        const existing = card.querySelector('.kpi-tooltip');
        if (existing) { existing.remove(); return; }
        root.querySelectorAll('.kpi-tooltip').forEach(el => el.remove());
        const info = e.target.dataset.kpiInfo;
        if (info) {
          const tip = document.createElement('div');
          tip.className = 'kpi-tooltip';
          tip.textContent = info;
          card.appendChild(tip);
        }
        return;
      }

      // Close tooltips
      if (!e.target.closest('.kpi-info-btn') && !e.target.closest('.kpi-tooltip')) {
        root.querySelectorAll('.kpi-tooltip').forEach(el => el.remove());
      }

      // Data-action buttons
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id || '';

      switch (action) {
        case 'add-purchase': this._showFeedPurchaseForm(); break;
        case 'edit-purchase': this._showFeedPurchaseForm(id); break;
        case 'delete-purchase': this._deleteFeedPurchase(id); break;
        case 'add-consumption': this._showFeedConsForm(); break;
        case 'edit-consumption': this._showFeedConsForm(id); break;
        case 'delete-consumption': this._deleteFeedCons(id); break;
      }
    });
  }

  /* ── Modal Actions (from Bus) ────────────────────────── */
  _onModalAction(ev) {
    switch (ev.action) {
      case 'save-feed-purchase':
        this._saveFeedPurchase(ev.editId || '');
        break;
      case 'save-feed-cons':
        this._saveFeedCons(ev.editId || '');
        break;
    }
  }

  _onModalChange(ev) {
    if (ev.change === 'feed-supplier') {
      handleSupplierChange(ev.target);
    }
  }

  /* ── Purchase Form ───────────────────────────────────── */
  _showFeedPurchaseForm(id) {
    const D = Store.get();
    const p = id ? D.feed.purchases.find(x => x.id === id) : null;
    const title = p ? t('edit') : t('feed_add_purchase');
    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="fp-date" value="${p ? escapeAttr(p.date) : todayStr()}"></div>
        <div class="form-group"><label>${t('feed_type')}</label><select id="fp-type">${feedTypeSelect(p ? p.type || '' : '')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('feed_qty')}</label><input type="number" id="fp-qty" value="${p ? p.quantityKg : ''}" step="0.1" min="0"></div>
        <div class="form-group"><label>${t('feed_cost')}</label><input type="number" id="fp-cost" value="${p ? p.cost : ''}" min="0"></div>
      </div>
      <div class="form-group"><label>${t('feed_supplier')}</label><select id="fp-sup" data-change="feed-supplier">${supplierSelect(p ? p.supplier || '' : '')}</select></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-feed-purchase" data-edit-id="${escapeAttr(id || '')}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title, body });
    this._vengWarningsShown = false;
  }

  /* ── Save Purchase ───────────────────────────────────── */
  _saveFeedPurchase(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      date: modalVal('fp-date'),
      type: modalVal('fp-type'),
      quantityKg: parseFloat(modalVal('fp-qty')) || 0,
      cost: parseFloat(modalVal('fp-cost')) || 0,
      supplier: resolveSupplier('fp-sup')
    };

    const v = validateForm({
      'fp-date': { value: o.date, rules: { required: true, date: true } },
      'fp-type': { value: o.type, rules: { required: true } },
      'fp-qty': { value: modalVal('fp-qty'), rules: { required: true, numeric: true, min: 0.1 } },
      'fp-cost': { value: modalVal('fp-cost'), rules: { required: true, numeric: true, min: 0 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (id) {
      const i = D.feed.purchases.findIndex(p => p.id === id);
      if (i >= 0) D.feed.purchases[i] = { ...D.feed.purchases[i], ...o };
    } else {
      o.id = genId();
      D.feed.purchases.push(o);
    }
    logAudit(id ? 'update' : 'create', 'feed', (id ? 'Edit' : 'New') + ' purchase: ' + o.quantityKg + 'kg', id || o.id, o);
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  /* ── Delete Purchase ─────────────────────────────────── */
  async _deleteFeedPurchase(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.feed.purchases = D.feed.purchases.filter(p => p.id !== id);
    logAudit('delete', 'feed', 'Delete purchase', id, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  /* ── Consumption Form ────────────────────────────────── */
  _showFeedConsForm(id) {
    const D = Store.get();
    const c = id ? D.feed.consumption.find(x => x.id === id) : null;
    const title = c ? t('edit') : t('feed_add_consumption');
    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="fc-date" value="${c ? escapeAttr(c.date) : todayStr()}"></div>
        <div class="form-group"><label>${t('feed_flock')}</label><select id="fc-flock">${flockSelect(c ? c.flockId : '')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('feed_qty')}</label><input type="number" id="fc-qty" value="${c ? c.quantityKg : ''}" step="0.1" min="0"></div>
        <div class="form-group"><label>${t('feed_type')}</label><select id="fc-type">${feedTypeSelect(c ? c.type || '' : '', c ? c.flockId : '')}</select></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-feed-cons" data-edit-id="${escapeAttr(id || '')}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title, body });
    this._vengWarningsShown = false;
  }

  /* ── Save Consumption ────────────────────────────────── */
  _saveFeedCons(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      date: modalVal('fc-date'),
      flockId: modalVal('fc-flock'),
      quantityKg: parseFloat(modalVal('fc-qty')) || 0,
      type: modalVal('fc-type')
    };

    const v = validateForm({
      'fc-date': { value: o.date, rules: { required: true, date: true } },
      'fc-flock': { value: o.flockId, rules: { required: true } },
      'fc-qty': { value: modalVal('fc-qty'), rules: { required: true, numeric: true, min: 0.1 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    // VENG gate validation
    if (!this._vengWarningsShown) {
      const vr = VENG.gate.feedCons(o, D);
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

    if (id) {
      const i = D.feed.consumption.findIndex(c => c.id === id);
      if (i >= 0) D.feed.consumption[i] = { ...D.feed.consumption[i], ...o };
    } else {
      o.id = genId();
      D.feed.consumption.push(o);
    }
    logAudit(id ? 'update' : 'create', 'feed', (id ? 'Edit' : 'New') + ' consumption: ' + o.quantityKg + 'kg', id || o.id, o);
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  /* ── Delete Consumption ──────────────────────────────── */
  async _deleteFeedCons(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.feed.consumption = D.feed.consumption.filter(c => c.id !== id);
    logAudit('delete', 'feed', 'Delete consumption', id, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  /* ── CSS ─────────────────────────────────────────────── */
  _css() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
      .page-header h3 { margin: 0; color: var(--primary-dark, #0E2240); }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
      .kpi-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative; }
      .kpi-card.danger { border-left: 4px solid var(--danger, #dc3545); }
      .kpi-card.warning { border-left: 4px solid var(--warning, #ffc107); }
      .kpi-card.accent { border-left: 4px solid var(--accent, #FF8F00); }
      .kpi-card.secondary { border-left: 4px solid var(--secondary, #6c757d); }
      .kpi-label { font-size: 12px; color: var(--text-light, #888); text-transform: uppercase; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #333); }
      .kpi-sub { font-size: 12px; color: var(--text-light, #888); margin-top: 4px; }
      .kpi-info-btn { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border, #ccc); background: var(--bg, #fff); font-size: 11px; cursor: pointer; color: var(--text-light, #888); }
      .kpi-tooltip { position: absolute; top: 36px; right: 8px; background: var(--text, #333); color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px; z-index: 10; max-width: 250px; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
      .tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid var(--border, #e0e0e0); }
      .tab { padding: 10px 20px; cursor: pointer; font-weight: 600; font-size: 14px; color: var(--text-light, #888); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color .2s, border-color .2s; user-select: none; }
      .tab:hover { color: var(--primary, #1A3C6E); }
      .tab.active { color: var(--primary, #1A3C6E); border-bottom-color: var(--primary, #1A3C6E); }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity .2s; }
      .btn:hover { opacity: 0.85; }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #dc3545); color: #fff; border: none; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-group { display: flex; gap: 6px; }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .tabs { overflow-x: auto; }
      }
    </style>`;
  }
}

customElements.define('egg-feed', EggFeed);
export { EggFeed };
