// EGGlogU — Clients & Claims Web Component
// Replaces renderClients(), renderClientList(), renderClaimsList(),
// showClaimForm(), saveClaim(), showResolveClaimForm(), resolveClaim(),
// progressClaim(), deleteClaim(), showClientForm(), saveClient(), deleteClient()

import { Store } from '../core/store.js';
import { Bus } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, genId, validateForm, emptyState } from '../core/utils.js';
import { DataTable } from '../core/datatable.js';
import { kpi, statusBadge, clientSelect, routeSelect, flockSelect, showFieldError, clearFieldErrors, logAudit, currency } from '../core/helpers.js';
import { modalVal, getModalBody, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

const CAT_ICONS = { quality: '\uD83D\uDD0D', delivery: '\uD83D\uDE9A', quantity: '\uD83D\uDCE6', price: '\uD83D\uDCB0', packaging: '\uD83D\uDCE6', other: '\u2753' };
const CLAIM_CATS = ['quality', 'delivery', 'quantity', 'price', 'packaging', 'other'];
const SEV_COLORS = ['', '#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'];
const ORDER_STATUSES = ['draft', 'confirmed', 'preparing', 'dispatched', 'delivered', 'cancelled'];
const ORDER_STATUS_ICONS = { draft: '\uD83D\uDCDD', confirmed: '\u2705', preparing: '\uD83D\uDCE6', dispatched: '\uD83D\uDE9A', delivered: '\u2714\uFE0F', cancelled: '\u274C' };
const ORDER_STATUS_BADGES = { draft: 'secondary', confirmed: 'info', preparing: 'warning', dispatched: 'info', delivered: 'success', cancelled: 'danger' };
const EGG_TYPES = ['S', 'M', 'L', 'XL', 'Jumbo'];

class EggClients extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'list';
    this._editId = null;
    this._unsubs = [];
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('modal:action', (e) => this._onModalAction(e)),
      Bus.on('modal:change', (e) => this._onModalChange(e))
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  render() {
    const D = Store.get();
    const claims = D.clientClaims || [];
    const orders = D.orders || [];
    const totalClaims = claims.length;
    const openCl = claims.filter(c => c.status !== 'resolved').length;
    const resolved = claims.filter(c => c.status === 'resolved').length;
    const resRate = totalClaims ? Math.round(resolved / totalClaims * 100) : 0;
    const sats = claims.filter(c => c.satisfaction).map(c => c.satisfaction);
    const avgSat = sats.length ? (sats.reduce((a, b) => a + b, 0) / sats.length).toFixed(1) : '--';
    const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length;
    const totalOrderValue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0);

    let h = this._baseStyle();

    // Header
    h += `<div class="page-header"><h2>${t('cli_title')}</h2></div>`;

    // KPI Grid
    h += '<div class="kpi-grid">';
    h += kpi(t('cli_total'), fmtNum(D.clients.length), '', '', t('info_cli_total'));
    h += kpi(t('clm_title'), fmtNum(totalClaims), t('total'), '', t('info_clm_total'));
    h += kpi(t('clm_status_open'), fmtNum(openCl), '', openCl > 0 ? 'warning' : '');
    h += kpi(t('ord_active'), fmtNum(activeOrders), '', activeOrders > 0 ? 'accent' : '');
    h += kpi(t('ord_total_value'), fmtMoney(totalOrderValue), '', '');
    h += kpi(t('clm_avg_sat'), avgSat !== '--' ? avgSat + ' \u2B50' : '--', '', '', t('info_clm_sat'));
    h += '</div>';

    // Tabs
    h += `<div class="tabs">
      <div class="tab${this._currentTab === 'list' ? ' active' : ''}" data-action="tab-list">\uD83D\uDC65 ${t('clm_tab_list')}</div>
      <div class="tab${this._currentTab === 'orders' ? ' active' : ''}" data-action="tab-orders">\uD83D\uDCC4 ${t('ord_tab')}</div>
      <div class="tab${this._currentTab === 'claims' ? ' active' : ''}" data-action="tab-claims">\uD83D\uDCCB ${t('clm_tab_claims')}</div>
    </div>`;

    // Content
    if (this._currentTab === 'list') {
      h += this._renderClientList(D);
    } else if (this._currentTab === 'orders') {
      h += this._renderOrdersList(D);
    } else {
      h += this._renderClaimsList(D);
    }

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  // ── Styles ──────────────────────────────────────────────────

  _baseStyle() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
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
      .tab { padding: 10px 20px; cursor: pointer; font-weight: 600; color: var(--text-light, #888); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; user-select: none; }
      .tab:hover { color: var(--primary, #1A3C6E); }
      .tab.active { color: var(--primary, #1A3C6E); border-bottom-color: var(--primary, #1A3C6E); }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; font-weight: 500; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #dc3545); color: #fff; border: none; }
      .btn:hover { opacity: 0.85; }
      .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-warning { background: #fff8e1; color: #e65100; }
      .badge-danger { background: #ffebee; color: #c62828; }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .badge-secondary { background: #f5f5f5; color: #666; }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
      .empty-state { text-align: center; padding: 40px 20px; color: var(--text-light, #888); }
      .empty-icon { font-size: 48px; margin-bottom: 8px; }
      /* Stress timeline reused for claims */
      .stress-timeline { position: relative; }
      .stress-timeline::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--border, #e0e0e0); }
      .stress-event { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 14px 16px; margin-bottom: 12px; margin-left: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative; }
      .stress-event::before { content: ''; position: absolute; left: -22px; top: 18px; width: 10px; height: 10px; border-radius: 50%; background: var(--primary, #1A3C6E); border: 2px solid var(--bg, #fff); }
      /* DataTable overrides */
      .dt-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap; }
      .dt-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .dt-search-input { padding: 6px 12px; border: 1px solid var(--border, #ddd); border-radius: 6px; font-size: 13px; min-width: 180px; }
      .dt-filter-row td { padding: 4px; }
      .dt-filter-input, .dt-filter-select, .dt-filter-date, .dt-filter-num { width: 100%; padding: 4px 6px; border: 1px solid var(--border, #ddd); border-radius: 4px; font-size: 12px; box-sizing: border-box; }
      .dt-page-size { padding: 4px 8px; border: 1px solid var(--border, #ddd); border-radius: 4px; font-size: 12px; }
      .dt-pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; flex-wrap: wrap; gap: 8px; }
      .dt-page-info { font-size: 12px; color: var(--text-light, #888); }
      .dt-page-buttons { display: flex; gap: 4px; }
      .dt-footer-info { font-size: 12px; color: var(--text-light, #888); margin-top: 8px; }
      .dt-bulk-bar { display: flex; justify-content: space-between; align-items: center; background: var(--primary-fill, #e8eef6); padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
      .dt-bulk-count { font-weight: 600; font-size: 13px; }
      .dt-bulk-actions { display: flex; gap: 6px; }
      .dt-row-selected { background: var(--primary-fill, #e8eef6); }
      .dt-card-wrap { padding: 0; }
      .dt-table-desktop { overflow-x: auto; }
      .dt-th { white-space: nowrap; }
      .dt-sortable { cursor: pointer; user-select: none; }
      .dt-sortable:hover { background: var(--border, #eee); }
      .dt-sorted { background: var(--primary-fill, #e8eef6); }
      .dt-th-check, .dt-td-check { width: 36px; text-align: center; }
      .dt-col-picker-wrap { position: relative; }
      .dt-column-picker { position: absolute; top: 100%; right: 0; background: var(--bg, #fff); border: 1px solid var(--border, #ddd); border-radius: 6px; padding: 8px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,.1); min-width: 180px; }
      .dt-col-option { display: block; padding: 4px 0; font-size: 13px; cursor: pointer; white-space: nowrap; }
      .dt-mobile-cards { display: none; }
      .dt-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .dt-card-selected { background: var(--primary-fill, #e8eef6); }
      .dt-card-title { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
      .dt-card-field { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
      .dt-card-label { color: var(--text-light, #888); }
      .dt-card-actions { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
      .dt-card-check { margin-bottom: 6px; }
      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 768px) {
        .dt-table-desktop { display: none; }
        .dt-mobile-cards { display: block; }
      }
      @media (max-width: 480px) {
        .kpi-grid { grid-template-columns: 1fr; }
        .tabs { overflow-x: auto; }
      }
    </style>`;
  }

  // ── Client List Tab ─────────────────────────────────────────

  _renderClientList(D) {
    const routes = [...new Set(D.clients.map(c => c.route).filter(Boolean))];
    return DataTable.create({
      id: 'clients',
      data: D.clients,
      emptyIcon: '\uD83D\uDC65',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="justify-content:flex-end"><button class="btn btn-primary" data-action="add-client">${t('cli_add')}</button></div>`,
      columns: [
        { key: 'name', label: t('name'), type: 'text', sortable: true, filterable: true, render: r => '<strong>' + sanitizeHTML(r.name) + '</strong>' },
        { key: 'phone', label: t('phone'), type: 'text', sortable: true, render: r => sanitizeHTML(r.phone || '-') },
        { key: 'email', label: t('email'), type: 'text', sortable: true, render: r => sanitizeHTML(r.email || '-') },
        {
          key: 'route', label: t('cli_route'), type: 'text', sortable: true, filterable: true,
          filterType: 'select',
          filterOptions: routes.map(v => ({ value: v, label: v })),
          render: r => sanitizeHTML(r.route || '-')
        },
        {
          key: '_prices', label: t('cli_price') + ' (S/M/L/XL/J)', type: 'text',
          getValue: r => [r.priceS || '-', r.priceM || '-', r.priceL || '-', r.priceXL || '-', r.priceJumbo || '-'].join(' / ')
        },
        { key: 'notes', label: t('notes'), type: 'text', render: r => sanitizeHTML(r.notes || '-') }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="edit-client" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-client" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
        action: ids => this._bulkDeleteClients(ids)
      }]
    });
  }

  // ── Claims Tab ──────────────────────────────────────────────

  _renderClaimsList(D) {
    const claims = D.clientClaims || [];
    let h = `<div class="page-header" style="justify-content:flex-end"><button class="btn btn-primary" data-action="add-claim">${t('clm_new')}</button></div>`;

    if (!claims.length) {
      return h + `<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><p>${sanitizeHTML(t('clm_no_claims'))}</p><button class="btn btn-primary" data-action="add-claim">${sanitizeHTML(t('clm_new'))}</button></div>`;
    }

    h += '<div class="stress-timeline" style="padding-left:20px">';
    [...claims].sort((a, b) => b.date.localeCompare(a.date)).forEach(cl => {
      const sColor = SEV_COLORS[cl.severity] || '#999';
      const catIcon = CAT_ICONS[cl.category] || '\u2753';
      const client = D.clients.find(c => c.id === cl.clientId);
      const stLabel = t('clm_status_' + cl.status);
      const stIcon = cl.status === 'resolved' ? '\u2705' : cl.status === 'in_progress' ? '\u23F3' : '\u274C';

      h += `<div class="stress-event" style="border-left:4px solid ${sColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
          <strong>${fmtDate(cl.date)} ${catIcon} ${sanitizeHTML(t('clm_cat_' + cl.category) || cl.category)}</strong>
          <span>${stIcon} ${sanitizeHTML(stLabel)}</span>
        </div>
        <p style="margin:4px 0">${t('clm_client')}: <strong>${client ? sanitizeHTML(client.name) : '-'}</strong> | ${t('clm_severity')}: ${'\u2B50'.repeat(cl.severity || 1)}${cl.batchId ? ' | ' + t('clm_batch') + ': ' + sanitizeHTML(cl.batchId) : ''}</p>
        <p style="margin:4px 0;font-size:13px">${sanitizeHTML(cl.description)}</p>
        ${cl.resolution ? '<p style="font-size:12px;color:var(--text-light)">' + t('clm_resolution') + ': ' + sanitizeHTML(cl.resolution) + '</p>' : ''}
        ${cl.satisfaction ? '<p style="font-size:12px">' + t('clm_satisfaction') + ': ' + '\u2B50'.repeat(cl.satisfaction) + '</p>' : ''}
        <div class="btn-group" style="margin-top:4px">
          ${cl.status === 'open' ? '<button class="btn btn-secondary btn-sm" data-action="progress-claim" data-id="' + escapeAttr(cl.id) + '">\u23F3 ' + t('clm_progress') + '</button>' : ''}
          ${cl.status !== 'resolved' ? '<button class="btn btn-primary btn-sm" data-action="resolve-claim" data-id="' + escapeAttr(cl.id) + '">\u2705 ' + t('clm_resolve') + '</button>' : ''}
          <button class="btn btn-secondary btn-sm" data-action="edit-claim" data-id="${escapeAttr(cl.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-claim" data-id="${escapeAttr(cl.id)}">${t('clm_delete')}</button>
        </div>
      </div>`;
    });
    h += '</div>';
    return h;
  }

  // ── Event Binding ───────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    // DataTable events
    DataTable.handleEvent(root, () => this.render());

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) {
        // KPI tooltip toggle
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
        if (!e.target.closest('.kpi-info-btn') && !e.target.closest('.kpi-tooltip')) {
          root.querySelectorAll('.kpi-tooltip').forEach(el => el.remove());
        }
        return;
      }

      const action = btn.dataset.action;
      const id = btn.dataset.id || '';

      switch (action) {
        case 'tab-list':
          this._currentTab = 'list';
          this.render();
          break;
        case 'tab-orders':
          this._currentTab = 'orders';
          this.render();
          break;
        case 'tab-claims':
          this._currentTab = 'claims';
          this.render();
          break;
        case 'add-client':
          this._showClientForm();
          break;
        case 'edit-client':
          this._showClientForm(id);
          break;
        case 'delete-client':
          this._deleteClient(id);
          break;
        case 'add-order':
          this._showOrderForm();
          break;
        case 'edit-order':
          this._showOrderForm(id);
          break;
        case 'view-order':
          this._viewOrder(id);
          break;
        case 'advance-order':
          this._advanceOrder(id);
          break;
        case 'cancel-order':
          this._cancelOrder(id);
          break;
        case 'reserve-order':
          this._reserveOrder(id);
          break;
        case 'print-order':
          this._printOrder(id);
          break;
        case 'delete-order':
          this._deleteOrder(id);
          break;
        case 'add-claim':
          this._showClaimForm();
          break;
        case 'edit-claim':
          this._showClaimForm(id);
          break;
        case 'delete-claim':
          this._deleteClaim(id);
          break;
        case 'progress-claim':
          this._progressClaim(id);
          break;
        case 'resolve-claim':
          this._showResolveClaimForm(id);
          break;
      }
    });
  }

  // ── Modal Actions (from Bus) ────────────────────────────────

  _onModalAction(e) {
    switch (e.action) {
      case 'save-client':
        this._saveClient();
        break;
      case 'save-order':
        this._saveOrder();
        break;
      case 'add-order-item':
        this._addOrderItem();
        break;
      case 'reserve-order-modal':
        Bus.emit('modal:close');
        this._reserveOrder(e.id || e.value);
        break;
      case 'print-order-modal':
        this._printOrder(e.id || e.value);
        break;
      case 'save-claim':
        this._saveClaim();
        break;
      case 'resolve-claim':
        this._resolveClaim();
        break;
      case 'set-sat':
        this._setSatisfaction(parseInt(e.value) || 0);
        break;
    }
  }

  _onModalChange(/* e */) {
    // Reserved for future dynamic form updates
  }

  // ── Client Form ─────────────────────────────────────────────

  _showClientForm(id) {
    const D = Store.get();
    const c = id ? D.clients.find(x => x.id === id) : null;
    this._editId = id || null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('name')}</label><input id="cl-name" value="${c ? escapeAttr(c.name) : ''}"></div>
        <div class="form-group"><label>${t('phone')}</label><input id="cl-phone" value="${c ? escapeAttr(c.phone || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('email')}</label><input id="cl-email" value="${c ? escapeAttr(c.email || '') : ''}"></div>
        <div class="form-group"><label>${t('cli_route')}</label><select id="cl-route">${routeSelect(c ? c.route || '' : '')}</select></div>
      </div>
      <div class="form-group"><label>${t('address')}</label><input id="cl-addr" value="${c ? escapeAttr(c.address || '') : ''}"></div>
      <p style="font-weight:600;margin:12px 0 8px">${t('cli_price')} (${currency()}/huevo)</p>
      <div class="form-row-3">
        <div class="form-group"><label>S</label><input type="number" id="cl-ps" value="${c ? c.priceS || '' : ''}" step="1" min="0"></div>
        <div class="form-group"><label>M</label><input type="number" id="cl-pm" value="${c ? c.priceM || '' : ''}" step="1" min="0"></div>
        <div class="form-group"><label>L</label><input type="number" id="cl-pl" value="${c ? c.priceL || '' : ''}" step="1" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>XL</label><input type="number" id="cl-pxl" value="${c ? c.priceXL || '' : ''}" step="1" min="0"></div>
        <div class="form-group"><label>Jumbo</label><input type="number" id="cl-pj" value="${c ? c.priceJumbo || '' : ''}" step="1" min="0"></div>
      </div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="cl-notes">${c ? escapeAttr(c.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-client">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: c ? t('edit') : t('cli_add'), body });
  }

  _saveClient() {
    const body = getModalBody();
    if (!body) return;
    clearFieldErrors(body);

    const D = Store.get();
    const o = {
      name: modalVal('cl-name'),
      phone: modalVal('cl-phone'),
      email: modalVal('cl-email'),
      route: modalVal('cl-route'),
      address: modalVal('cl-addr'),
      priceS: parseFloat(modalVal('cl-ps')) || 0,
      priceM: parseFloat(modalVal('cl-pm')) || 0,
      priceL: parseFloat(modalVal('cl-pl')) || 0,
      priceXL: parseFloat(modalVal('cl-pxl')) || 0,
      priceJumbo: parseFloat(modalVal('cl-pj')) || 0,
      notes: modalVal('cl-notes')
    };

    const v = validateForm({
      'cl-name': { value: o.name, rules: { required: true, maxLength: 100 } },
      'cl-email': { value: o.email, rules: { email: true } },
      'cl-phone': { value: o.phone, rules: { phone: true } }
    });

    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }

    if (this._editId) {
      const i = D.clients.findIndex(c => c.id === this._editId);
      if (i >= 0) {
        logAudit('update', 'clients', 'Edit client: ' + o.name, D.clients[i], o);
        D.clients[i] = { ...D.clients[i], ...o };
      }
    } else {
      o.id = genId();
      o.createdAt = new Date().toISOString();
      D.clients.push(o);
      logAudit('create', 'clients', 'New client: ' + o.name, null, o);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this._editId = null;
    this.render();
  }

  async _deleteClient(id) {
    if (!await showConfirm(t('confirm_delete'))) return;

    const D = Store.get();
    const hasRecords = D.finances.income.some(i => i.clientId === id) ||
      D.finances.receivables.some(r => r.clientId === id) ||
      (D.traceability.batches || []).some(b => b.clientId === id);

    if (hasRecords) {
      if (!await showConfirm(t('confirm_delete_cascade') || 'This client has associated financial records and/or batches. Deleting will remove those references. Continue?')) return;
    }

    D.clients = D.clients.filter(c => c.id !== id);
    D.finances.income.filter(i => i.clientId === id).forEach(i => { i.clientId = ''; });
    D.finances.receivables.filter(r => r.clientId === id).forEach(r => { r.clientId = ''; });
    (D.traceability.batches || []).filter(b => b.clientId === id).forEach(b => { b.clientId = ''; });

    logAudit('delete', 'clients', 'Deleted client', { id }, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _bulkDeleteClients(ids) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    ids.forEach(id => {
      D.finances.income.filter(i => i.clientId === id).forEach(i => { i.clientId = ''; });
      D.finances.receivables.filter(r => r.clientId === id).forEach(r => { r.clientId = ''; });
      (D.traceability.batches || []).filter(b => b.clientId === id).forEach(b => { b.clientId = ''; });
    });
    D.clients = D.clients.filter(c => !ids.includes(c.id));
    logAudit('delete', 'clients', 'Bulk deleted ' + ids.length + ' clients', { ids }, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    DataTable.reset('clients');
    this.render();
  }

  // ── Orders Tab ─────────────────────────────────────────────

  _renderOrdersList(D) {
    const orders = D.orders || [];
    let h = `<div class="page-header" style="justify-content:flex-end"><button class="btn btn-primary" data-action="add-order">${t('ord_new')}</button></div>`;

    if (!orders.length) {
      return h + `<div class="empty-state"><div class="empty-icon">\uD83D\uDCC4</div><p>${sanitizeHTML(t('ord_no_orders'))}</p><button class="btn btn-primary" data-action="add-order">${sanitizeHTML(t('ord_new'))}</button></div>`;
    }

    // Filter active vs history
    const active = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    const history = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

    if (active.length) {
      h += `<div class="card"><h3>${t('ord_active')}</h3><div class="table-wrap"><table>
        <tr><th>${t('date')}</th><th>${t('ord_number')}</th><th>${t('clm_client')}</th><th>${t('ord_items')}</th><th>${t('total')}</th><th>${t('ord_due')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr>`;
      [...active].sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date)).forEach(o => {
        const client = D.clients.find(c => c.id === o.clientId);
        const itemCount = (o.items || []).reduce((s, it) => s + (it.qty || 0), 0);
        const nextStatus = this._nextOrderStatus(o.status);
        h += `<tr>
          <td>${fmtDate(o.date)}</td>
          <td><strong>${sanitizeHTML(o.orderNumber || o.id.substring(0, 8))}</strong></td>
          <td>${client ? sanitizeHTML(client.name) : '-'}</td>
          <td>${fmtNum(itemCount)} ${t('prod_eggs')}</td>
          <td>${fmtMoney(o.total || 0)}</td>
          <td>${o.dueDate ? fmtDate(o.dueDate) : '-'}</td>
          <td><span class="badge badge-${ORDER_STATUS_BADGES[o.status] || 'secondary'}">${ORDER_STATUS_ICONS[o.status] || ''} ${t('ord_st_' + o.status)}</span></td>
          <td><div class="btn-group">
            <button class="btn btn-secondary btn-sm" data-action="view-order" data-id="${escapeAttr(o.id)}">${t('ord_view')}</button>
            ${nextStatus ? `<button class="btn btn-primary btn-sm" data-action="advance-order" data-id="${escapeAttr(o.id)}">${ORDER_STATUS_ICONS[nextStatus] || ''} ${t('ord_st_' + nextStatus)}</button>` : ''}
            ${['confirmed', 'preparing'].includes(o.status) ? `<button class="btn btn-warning btn-sm" data-action="reserve-order" data-id="${escapeAttr(o.id)}">📋 ${t('ord_reserve')}</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-action="print-order" data-id="${escapeAttr(o.id)}">🖨️ ${t('ord_print')}</button>
            ${o.status === 'draft' ? `<button class="btn btn-secondary btn-sm" data-action="edit-order" data-id="${escapeAttr(o.id)}">${t('edit')}</button>` : ''}
            ${o.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" data-action="cancel-order" data-id="${escapeAttr(o.id)}">${t('cancel')}</button>` : ''}
          </div></td>
        </tr>`;
      });
      h += '</table></div></div>';
    }

    if (history.length) {
      h += `<div class="card"><h3>${t('ord_history')}</h3><div class="table-wrap"><table>
        <tr><th>${t('date')}</th><th>${t('ord_number')}</th><th>${t('clm_client')}</th><th>${t('total')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr>`;
      [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50).forEach(o => {
        const client = D.clients.find(c => c.id === o.clientId);
        h += `<tr>
          <td>${fmtDate(o.date)}</td>
          <td>${sanitizeHTML(o.orderNumber || o.id.substring(0, 8))}</td>
          <td>${client ? sanitizeHTML(client.name) : '-'}</td>
          <td>${fmtMoney(o.total || 0)}</td>
          <td><span class="badge badge-${ORDER_STATUS_BADGES[o.status] || 'secondary'}">${ORDER_STATUS_ICONS[o.status] || ''} ${t('ord_st_' + o.status)}</span></td>
          <td><div class="btn-group">
            <button class="btn btn-secondary btn-sm" data-action="view-order" data-id="${escapeAttr(o.id)}">${t('ord_view')}</button>
            <button class="btn btn-secondary btn-sm" data-action="print-order" data-id="${escapeAttr(o.id)}">🖨️</button>
            <button class="btn btn-danger btn-sm" data-action="delete-order" data-id="${escapeAttr(o.id)}">${t('delete')}</button>
          </div></td>
        </tr>`;
      });
      h += '</table></div></div>';
    }

    return h;
  }

  _nextOrderStatus(current) {
    const flow = { draft: 'confirmed', confirmed: 'preparing', preparing: 'dispatched', dispatched: 'delivered' };
    return flow[current] || null;
  }

  // ── Order Form ────────────────────────────────────────────

  _showOrderForm(id) {
    const D = Store.get();
    const order = id ? (D.orders || []).find(o => o.id === id) : null;
    this._editId = id || null;

    const cliOpts = '<option value="">--</option>' + D.clients.map(c =>
      `<option value="${escapeAttr(c.id)}"${order && order.clientId === c.id ? ' selected' : ''}>${sanitizeHTML(c.name)}</option>`
    ).join('');

    const locOpts = '<option value="">' + t('inv_any_location') + '</option>' + (D.storageLocations || []).map(l =>
      `<option value="${escapeAttr(l.id)}">${sanitizeHTML(l.name)}</option>`
    ).join('');

    const flockOpts = '<option value="">--</option>' + D.flocks.filter(f => f.status !== 'retired').map(f =>
      `<option value="${escapeAttr(f.id)}">${sanitizeHTML(f.name || f.breed || f.id.substring(0, 8))}</option>`
    ).join('');

    let itemsHtml = '';
    if (order && order.items && order.items.length) {
      order.items.forEach((it, idx) => {
        itemsHtml += this._orderItemRow(it, idx, D);
      });
    }

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('clm_client')}</label><select id="ord-client">${cliOpts}</select></div>
        <div class="form-group"><label>${t('date')}</label><input type="date" id="ord-date" value="${order ? order.date : todayStr()}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('ord_due')}</label><input type="date" id="ord-due" value="${order ? order.dueDate || '' : ''}"></div>
        <div class="form-group"><label>${t('ord_number')}</label><input id="ord-number" value="${order ? escapeAttr(order.orderNumber || '') : ''}" placeholder="${t('ord_number_ph')}"></div>
      </div>
      <h4 style="margin:12px 0 8px">${t('ord_items')}</h4>
      <div id="ord-items-wrap">${itemsHtml}</div>
      <div class="form-row" style="margin-top:8px">
        <div class="form-group" style="flex:1"><select id="ord-new-type">${EGG_TYPES.map(et => `<option value="${et}">${et}</option>`).join('')}</select></div>
        <div class="form-group" style="flex:1"><input type="number" id="ord-new-qty" placeholder="${t('ord_qty')}" min="1"></div>
        <div class="form-group" style="flex:1"><input type="number" id="ord-new-price" placeholder="${t('cli_price')}" min="0" step="0.01"></div>
        <div class="form-group" style="flex:1"><select id="ord-new-flock">${flockOpts}</select></div>
        <div class="form-group" style="flex:1"><select id="ord-new-loc">${locOpts}</select></div>
        <div class="form-group"><button class="btn btn-secondary btn-sm" data-action="add-order-item">+</button></div>
      </div>
      <div id="ord-total-display" style="text-align:right;font-weight:700;font-size:16px;margin:8px 0"></div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="ord-notes">${order ? escapeAttr(order.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-order">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: order ? t('edit') + ' ' + t('ord_tab') : t('ord_new'), body, wide: true });

    // Store items temporarily
    this._orderItems = order ? [...(order.items || [])] : [];
    this._updateOrderTotal();
  }

  _orderItemRow(it, idx, D) {
    const flock = it.flockId ? D.flocks.find(f => f.id === it.flockId) : null;
    const loc = it.locationId ? (D.storageLocations || []).find(l => l.id === it.locationId) : null;
    return `<div class="ord-item" style="display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border,#eee)">
      <span style="flex:1"><strong>${sanitizeHTML(it.eggType)}</strong></span>
      <span style="flex:1">${fmtNum(it.qty)}</span>
      <span style="flex:1">${fmtMoney(it.unitPrice || 0)}/u</span>
      <span style="flex:1">${flock ? sanitizeHTML(flock.name || flock.breed || '') : '-'}</span>
      <span style="flex:1">${loc ? sanitizeHTML(loc.name) : '-'}</span>
      <span style="flex:0.5;font-weight:600">${fmtMoney((it.qty || 0) * (it.unitPrice || 0))}</span>
      <button class="btn btn-danger btn-sm" onclick="this.closest('egg-clients')._removeOrderItem(${idx})">\u2716</button>
    </div>`;
  }

  _addOrderItem() {
    const body = getModalBody();
    if (!body) return;
    const eggType = modalVal('ord-new-type');
    const qty = parseInt(modalVal('ord-new-qty')) || 0;
    const unitPrice = parseFloat(modalVal('ord-new-price')) || 0;
    const flockId = modalVal('ord-new-flock');
    const locationId = modalVal('ord-new-loc');

    if (!qty || qty <= 0) { Bus.emit('toast', { msg: t('ord_qty') + ' > 0', type: 'error' }); return; }

    // Stock validation
    const D = Store.get();
    const stockAvail = this._getAvailableStock(D, eggType, locationId);
    // Sum qty already added for same type+location in this order
    const alreadyInOrder = (this._orderItems || [])
      .filter(it => it.eggType === eggType && (it.locationId || '') === (locationId || ''))
      .reduce((s, it) => s + (it.qty || 0), 0);
    if (qty + alreadyInOrder > stockAvail) {
      Bus.emit('toast', { msg: t('ord_stock_insufficient') + ` (${eggType}: ${fmtNum(stockAvail)} ${t('ord_stock_available')})`, type: 'error' });
      return;
    }

    if (!this._orderItems) this._orderItems = [];
    this._orderItems.push({ eggType, qty, unitPrice, flockId, locationId });

    const wrap = body.querySelector('#ord-items-wrap');
    if (wrap) {
      wrap.innerHTML = this._orderItems.map((it, i) => this._orderItemRow(it, i, D)).join('');
    }
    this._updateOrderTotal();

    // Clear inputs
    const qtyEl = body.querySelector('#ord-new-qty');
    if (qtyEl) qtyEl.value = '';
    const priceEl = body.querySelector('#ord-new-price');
    if (priceEl) priceEl.value = '';
  }

  _removeOrderItem(idx) {
    if (!this._orderItems) return;
    this._orderItems.splice(idx, 1);
    const body = getModalBody();
    if (!body) return;
    const D = Store.get();
    const wrap = body.querySelector('#ord-items-wrap');
    if (wrap) {
      wrap.innerHTML = this._orderItems.map((it, i) => this._orderItemRow(it, i, D)).join('');
    }
    this._updateOrderTotal();
  }

  _updateOrderTotal() {
    const body = getModalBody();
    if (!body) return;
    const total = (this._orderItems || []).reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0);
    const el = body.querySelector('#ord-total-display');
    if (el) el.textContent = t('total') + ': ' + fmtMoney(total);
  }

  _saveOrder() {
    const body = getModalBody();
    if (!body) return;
    clearFieldErrors(body);

    const D = Store.get();
    if (!D.orders) D.orders = [];

    const clientId = modalVal('ord-client');
    const date = modalVal('ord-date');
    const dueDate = modalVal('ord-due');
    const orderNumber = modalVal('ord-number');
    const notes = modalVal('ord-notes');
    const items = this._orderItems || [];

    const v = validateForm({
      'ord-client': { value: clientId, rules: { required: true } },
      'ord-date': { value: date, rules: { required: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }
    if (!items.length) {
      Bus.emit('toast', { msg: t('ord_need_items'), type: 'error' });
      return;
    }

    // Final stock validation per item
    const stockByKey = {};
    for (const it of items) {
      const key = (it.eggType || 'M') + '|' + (it.locationId || '');
      stockByKey[key] = (stockByKey[key] || 0) + (it.qty || 0);
    }
    for (const [key, needed] of Object.entries(stockByKey)) {
      const [eggType, locationId] = key.split('|');
      const avail = this._getAvailableStock(D, eggType, locationId);
      if (needed > avail) {
        Bus.emit('toast', { msg: t('ord_stock_insufficient') + ` (${eggType}: ${fmtNum(avail)} ${t('ord_stock_available')})`, type: 'error' });
        return;
      }
    }

    const total = items.reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0);

    if (this._editId) {
      const i = D.orders.findIndex(o => o.id === this._editId);
      if (i >= 0) {
        const old = D.orders[i];
        D.orders[i] = { ...old, clientId, date, dueDate, orderNumber, items, total, notes };
        logAudit('update', 'orders', 'Edit order: ' + orderNumber, old, D.orders[i]);
      }
    } else {
      const order = {
        id: genId(), date, clientId, dueDate, orderNumber,
        items, total, notes,
        status: 'draft',
        statusHistory: [{ status: 'draft', date: new Date().toISOString(), note: t('ord_created') }],
        createdAt: new Date().toISOString()
      };
      D.orders.push(order);
      logAudit('create', 'orders', 'New order: ' + orderNumber, null, order);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this._editId = null;
    this._orderItems = [];
    this.render();
  }

  // ── Order Lifecycle ───────────────────────────────────────

  _viewOrder(id) {
    const D = Store.get();
    const o = (D.orders || []).find(x => x.id === id);
    if (!o) return;
    const client = D.clients.find(c => c.id === o.clientId);

    let itemsHtml = '<table style="width:100%;font-size:13px"><tr><th>' + t('ord_type') + '</th><th>' + t('ord_qty') + '</th><th>' + t('cli_price') + '</th><th>' + t('nav_flocks') + '</th><th>' + t('inv_location') + '</th><th>' + t('total') + '</th></tr>';
    (o.items || []).forEach(it => {
      const flock = it.flockId ? D.flocks.find(f => f.id === it.flockId) : null;
      const loc = it.locationId ? (D.storageLocations || []).find(l => l.id === it.locationId) : null;
      itemsHtml += `<tr><td>${sanitizeHTML(it.eggType)}</td><td>${fmtNum(it.qty)}</td><td>${fmtMoney(it.unitPrice || 0)}</td><td>${flock ? sanitizeHTML(flock.name || flock.breed || '') : '-'}</td><td>${loc ? sanitizeHTML(loc.name) : '-'}</td><td>${fmtMoney((it.qty || 0) * (it.unitPrice || 0))}</td></tr>`;
    });
    itemsHtml += '</table>';

    let historyHtml = '<div style="margin-top:12px"><strong>' + t('ord_timeline') + '</strong>';
    (o.statusHistory || []).forEach(sh => {
      historyHtml += `<div style="padding:4px 0;font-size:12px;border-bottom:1px solid var(--border,#eee)">${ORDER_STATUS_ICONS[sh.status] || ''} <strong>${t('ord_st_' + sh.status)}</strong> — ${fmtDate(sh.date.substring(0, 10))} ${sh.note ? '(' + sanitizeHTML(sh.note) + ')' : ''}</div>`;
    });
    historyHtml += '</div>';

    const body = `
      <div style="margin-bottom:12px">
        <p><strong>${t('ord_number')}:</strong> ${sanitizeHTML(o.orderNumber || o.id.substring(0, 8))}</p>
        <p><strong>${t('clm_client')}:</strong> ${client ? sanitizeHTML(client.name) : '-'}</p>
        <p><strong>${t('date')}:</strong> ${fmtDate(o.date)} ${o.dueDate ? '| <strong>' + t('ord_due') + ':</strong> ' + fmtDate(o.dueDate) : ''}</p>
        <p><strong>${t('status')}:</strong> <span class="badge badge-${ORDER_STATUS_BADGES[o.status] || 'secondary'}">${ORDER_STATUS_ICONS[o.status] || ''} ${t('ord_st_' + o.status)}</span></p>
        <p><strong>${t('total')}:</strong> ${fmtMoney(o.total || 0)}</p>
        ${o.notes ? '<p><strong>' + t('notes') + ':</strong> ' + sanitizeHTML(o.notes) + '</p>' : ''}
      </div>
      ${itemsHtml}
      ${historyHtml}
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('close')}</button>
        ${['confirmed', 'preparing'].includes(o.status) ? `<button class="btn btn-warning" data-action="reserve-order-modal" data-id="${escapeAttr(o.id)}">📋 ${t('ord_reserve')}</button>` : ''}
        <button class="btn btn-primary" data-action="print-order-modal" data-id="${escapeAttr(o.id)}">🖨️ ${t('ord_print')}</button>
      </div>`;

    Bus.emit('modal:open', { title: t('ord_view') + ' — ' + sanitizeHTML(o.orderNumber || o.id.substring(0, 8)), body });
  }

  async _advanceOrder(id) {
    const D = Store.get();
    const o = (D.orders || []).find(x => x.id === id);
    if (!o) return;
    const next = this._nextOrderStatus(o.status);
    if (!next) return;

    // When advancing to "preparing", create reservations for each item
    if (next === 'preparing') {
      (o.items || []).forEach(it => {
        if (!D.reservations) D.reservations = [];
        D.reservations.push({
          id: genId(), date: todayStr(), clientId: o.clientId,
          eggType: it.eggType, qty: it.qty, locationId: it.locationId || '',
          dueDate: o.dueDate || '', notes: t('ord_auto_reserve') + ' ' + (o.orderNumber || o.id.substring(0, 8)),
          status: 'active', orderId: o.id
        });
      });
    }

    // When advancing to "delivered", fulfill reservations and create income record
    if (next === 'delivered') {
      // Fulfill associated reservations
      (D.reservations || []).filter(r => r.orderId === o.id && r.status === 'active').forEach(r => {
        r.status = 'fulfilled';
        r.resolvedDate = todayStr();
      });
      // Create income record
      D.finances.income.push({
        id: genId(), date: todayStr(), clientId: o.clientId,
        description: t('ord_income_desc') + ' ' + (o.orderNumber || o.id.substring(0, 8)),
        amount: o.total || 0, quantity: (o.items || []).reduce((s, it) => s + (it.qty || 0), 0),
        unitPrice: 0, orderId: o.id
      });
    }

    o.status = next;
    o.statusHistory = o.statusHistory || [];
    o.statusHistory.push({ status: next, date: new Date().toISOString(), note: '' });

    logAudit('update', 'orders', 'Order ' + (o.orderNumber || o.id.substring(0, 8)) + ' → ' + next, null, { id, status: next });
    Store.save(D);
    Bus.emit('toast', { msg: t('ord_st_' + next) });
    this.render();
  }

  async _cancelOrder(id) {
    if (!await showConfirm(t('ord_confirm_cancel'))) return;
    const D = Store.get();
    const o = (D.orders || []).find(x => x.id === id);
    if (!o) return;

    // Cancel associated reservations
    (D.reservations || []).filter(r => r.orderId === o.id && r.status === 'active').forEach(r => {
      r.status = 'cancelled';
      r.resolvedDate = todayStr();
    });

    o.status = 'cancelled';
    o.statusHistory = o.statusHistory || [];
    o.statusHistory.push({ status: 'cancelled', date: new Date().toISOString(), note: '' });

    logAudit('update', 'orders', 'Order cancelled: ' + (o.orderNumber || o.id.substring(0, 8)), null, { id });
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteOrder(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.orders = (D.orders || []).filter(o => o.id !== id);
    logAudit('delete', 'orders', 'Deleted order', { id }, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ── Stock Helpers ───────────────────────────────────────────

  _getAvailableStock(D, eggType, locationId) {
    const inv = D.inventory || [];
    const filtered = locationId
      ? inv.filter(i => i.eggType === eggType && i.locationId === locationId)
      : inv.filter(i => i.eggType === eggType);
    const balance = filtered.reduce((s, i) => s + (i.qtyIn || 0) - (i.qtyOut || 0), 0);
    const reserved = (D.reservations || [])
      .filter(r => r.status === 'active' && r.eggType === eggType && (!locationId || r.locationId === locationId))
      .reduce((s, r) => s + (r.qty || 0), 0);
    return Math.max(0, balance - reserved);
  }

  // ── Reserve & Print ─────────────────────────────────────────

  _reserveOrder(id) {
    const D = Store.get();
    const o = (D.orders || []).find(x => x.id === id);
    if (!o) return;
    if (!D.reservations) D.reservations = [];

    // Check if already reserved
    const existing = D.reservations.filter(r => r.orderId === o.id && r.status === 'active');
    if (existing.length) {
      Bus.emit('toast', { msg: t('ord_already_reserved'), type: 'warning' });
      return;
    }

    (o.items || []).forEach(it => {
      D.reservations.push({
        id: genId(), date: todayStr(), clientId: o.clientId,
        eggType: it.eggType, qty: it.qty, locationId: it.locationId || '',
        dueDate: o.dueDate || '', notes: t('ord_auto_reserve') + ' ' + (o.orderNumber || o.id.substring(0, 8)),
        status: 'active', orderId: o.id
      });
    });

    logAudit('create', 'reservations', 'Manual reserve for order ' + (o.orderNumber || o.id.substring(0, 8)), null, { orderId: o.id });
    Store.save(D);
    Bus.emit('toast', { msg: t('ord_reserved_ok') });
    this.render();
  }

  _printOrder(id) {
    const D = Store.get();
    const o = (D.orders || []).find(x => x.id === id);
    if (!o) return;
    const client = D.clients.find(c => c.id === o.clientId);
    const farm = D.farm || {};
    const cur = Store.currency();

    let itemsRows = '';
    (o.items || []).forEach(it => {
      const flock = it.flockId ? D.flocks.find(f => f.id === it.flockId) : null;
      const subtotal = (it.qty || 0) * (it.unitPrice || 0);
      itemsRows += `<tr>
        <td>${it.eggType || '-'}</td>
        <td style="text-align:right">${it.qty || 0}</td>
        <td style="text-align:right">${cur}${(it.unitPrice || 0).toFixed(2)}</td>
        <td>${flock ? (flock.name || flock.breed || '') : '-'}</td>
        <td style="text-align:right">${cur}${subtotal.toFixed(2)}</td>
      </tr>`;
    });

    const statusText = t('ord_st_' + o.status) || o.status;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${t('ord_print_title')} ${o.orderNumber || o.id.substring(0, 8)}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;padding:20px;max-width:800px;margin:0 auto}
        .header{display:flex;justify-content:space-between;border-bottom:2px solid #0E2240;padding-bottom:12px;margin-bottom:16px}
        .header h1{font-size:18px;color:#0E2240}
        .header .farm-info{text-align:right;font-size:11px;color:#666}
        .meta{display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px}
        .meta-block{flex:1}
        .meta-block p{margin:2px 0}
        .meta-block strong{display:inline-block;min-width:90px}
        table{width:100%;border-collapse:collapse;margin:12px 0}
        th{background:#0E2240;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
        td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:12px}
        .total-row{font-weight:700;font-size:14px;border-top:2px solid #0E2240}
        .status{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#e3f2fd;color:#1565C0}
        .footer{margin-top:32px;padding-top:12px;border-top:1px solid #ccc;font-size:10px;color:#999;text-align:center}
        .signatures{display:flex;justify-content:space-between;margin-top:48px}
        .sig-line{width:200px;border-top:1px solid #333;padding-top:4px;font-size:11px;text-align:center}
        @media print{body{padding:10px}button{display:none!important}}
      </style>
    </head><body>
      <div class="header">
        <div>
          <h1>${t('ord_print_title')}</h1>
          <p style="font-size:14px;color:#666">${o.orderNumber || o.id.substring(0, 8)}</p>
        </div>
        <div class="farm-info">
          <strong style="font-size:14px">${farm.name || 'EGGlogU'}</strong><br>
          ${farm.location ? farm.location + '<br>' : ''}
          ${t('date')}: ${new Date().toLocaleDateString()}
        </div>
      </div>

      <div class="meta">
        <div class="meta-block">
          <p><strong>${t('clm_client')}:</strong> ${client ? client.name : '-'}</p>
          ${client && client.phone ? '<p><strong>' + t('phone') + ':</strong> ' + client.phone + '</p>' : ''}
          ${client && client.email ? '<p><strong>' + t('email') + ':</strong> ' + client.email + '</p>' : ''}
          ${client && client.address ? '<p><strong>' + t('address') + ':</strong> ' + client.address + '</p>' : ''}
        </div>
        <div class="meta-block" style="text-align:right">
          <p><strong>${t('date')}:</strong> ${o.date}</p>
          ${o.dueDate ? '<p><strong>' + t('ord_due') + ':</strong> ' + o.dueDate + '</p>' : ''}
          <p><strong>${t('status')}:</strong> <span class="status">${statusText}</span></p>
        </div>
      </div>

      <table>
        <thead><tr><th>${t('ord_type')}</th><th style="text-align:right">${t('ord_qty')}</th><th style="text-align:right">${t('cli_price')}</th><th>${t('nav_flocks')}</th><th style="text-align:right">${t('total')}</th></tr></thead>
        <tbody>${itemsRows}
          <tr class="total-row"><td colspan="4" style="text-align:right">${t('total')}</td><td style="text-align:right">${cur}${(o.total || 0).toFixed(2)}</td></tr>
        </tbody>
      </table>

      ${o.notes ? '<p style="margin:12px 0;font-size:12px"><strong>' + t('notes') + ':</strong> ' + o.notes + '</p>' : ''}

      <div class="signatures">
        <div class="sig-line">${t('ord_sig_seller')}</div>
        <div class="sig-line">${t('ord_sig_buyer')}</div>
      </div>

      <div class="footer">
        ${farm.name || 'EGGlogU'} — ${t('ord_print_footer')} — ${new Date().toLocaleDateString()}
      </div>

      <div style="text-align:center;margin-top:16px">
        <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#0E2240;color:#fff;border:none;border-radius:6px">🖨️ ${t('ord_print')}</button>
      </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=850,height=700');
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      Bus.emit('toast', { msg: 'Popup blocker — allow popups', type: 'error' });
    }
  }

  // ── Claim Form ──────────────────────────────────────────────

  _showClaimForm(id) {
    const D = Store.get();
    const cl = id ? (D.clientClaims || []).find(x => x.id === id) : null;
    this._editId = id || null;

    const catOpts = CLAIM_CATS.map(c =>
      `<option value="${c}"${cl && cl.category === c ? ' selected' : ''}>${t('clm_cat_' + c)}</option>`
    ).join('');

    let cliOpts = '<option value="">--</option>' + D.clients.map(c =>
      `<option value="${escapeAttr(c.id)}"${cl && cl.clientId === c.id ? ' selected' : ''}>${sanitizeHTML(c.name)}</option>`
    ).join('');

    const batches = (D.traceability && D.traceability.batches) || [];
    let batchOpts = '<option value="">--</option>' + batches.map(b =>
      `<option value="${escapeAttr(b.id)}"${cl && cl.batchId === b.id ? ' selected' : ''}>${sanitizeHTML(b.id.substring(0, 8))} ${sanitizeHTML(b.origin || '')}</option>`
    ).join('');

    let sevRadios = '';
    for (let i = 1; i <= 5; i++) {
      sevRadios += `<label style="cursor:pointer;margin-right:8px"><input type="radio" name="clm-sev" value="${i}"${(cl ? cl.severity : 3) === i ? ' checked' : ''}> ${'\u2B50'.repeat(i)}</label>`;
    }

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('clm_date')}</label><input type="date" id="clm-date" value="${cl ? cl.date : todayStr()}"></div>
        <div class="form-group"><label>${t('clm_client')}</label><select id="clm-client">${cliOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('clm_category')}</label><select id="clm-cat">${catOpts}</select></div>
        <div class="form-group"><label>${t('clm_batch')}</label><select id="clm-batch">${batchOpts}</select></div>
      </div>
      <div class="form-group"><label>${t('clm_severity')}</label><div id="clm-sev-wrap">${sevRadios}</div></div>
      <div class="form-group"><label>${t('clm_description')}</label><textarea id="clm-desc">${cl ? escapeAttr(cl.description || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-claim">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: cl ? t('edit') : t('clm_new'), body });
  }

  _saveClaim() {
    const body = getModalBody();
    if (!body) return;
    clearFieldErrors(body);

    const D = Store.get();
    const sevEl = body.querySelector('input[name="clm-sev"]:checked');
    const o = {
      date: modalVal('clm-date'),
      clientId: modalVal('clm-client'),
      batchId: modalVal('clm-batch'),
      category: modalVal('clm-cat'),
      description: modalVal('clm-desc'),
      severity: sevEl ? parseInt(sevEl.value) : 3
    };

    const v = validateForm({
      'clm-date': { value: o.date, rules: { required: true } },
      'clm-client': { value: o.clientId, rules: { required: true } },
      'clm-desc': { value: o.description, rules: { required: true, maxLength: 500 } }
    });

    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }

    if (!D.clientClaims) D.clientClaims = [];

    if (this._editId) {
      const i = D.clientClaims.findIndex(c => c.id === this._editId);
      if (i >= 0) {
        const old = D.clientClaims[i];
        D.clientClaims[i] = { ...old, ...o };
        logAudit('update', 'clientClaims', 'Edit claim', old, o);
      }
    } else {
      o.id = genId();
      o.status = 'open';
      o.resolution = '';
      o.satisfaction = null;
      o.resolvedDate = '';
      o.createdAt = new Date().toISOString();
      D.clientClaims.push(o);
      logAudit('create', 'clientClaims', 'New claim: ' + o.category, null, o);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this._editId = null;
    this.render();
  }

  // ── Resolve Claim ───────────────────────────────────────────

  _showResolveClaimForm(id) {
    const D = Store.get();
    const cl = (D.clientClaims || []).find(x => x.id === id);
    if (!cl) return;
    this._editId = id;

    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += `<span style="cursor:pointer;font-size:24px;opacity:${(cl.satisfaction || 0) >= i ? 1 : 0.3}" data-action="set-sat" data-value="${i}">\u2B50</span>`;
    }

    const body = `
      <div class="form-group"><label>${t('clm_resolution')}</label><textarea id="clm-res-text">${escapeAttr(cl.resolution || '')}</textarea></div>
      <div class="form-group"><label>${t('clm_satisfaction')}</label><div id="clm-stars">${stars}</div><input type="hidden" id="clm-sat-val" value="${cl.satisfaction || 0}"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="resolve-claim">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: t('clm_resolve'), body });
  }

  _setSatisfaction(n) {
    const body = getModalBody();
    if (!body) return;
    const hidden = body.querySelector('#clm-sat-val');
    if (hidden) hidden.value = n;
    const starsWrap = body.querySelector('#clm-stars');
    if (starsWrap) {
      starsWrap.querySelectorAll('span').forEach((s, j) => {
        s.style.opacity = (j + 1) <= n ? 1 : 0.3;
      });
    }
  }

  _resolveClaim() {
    const body = getModalBody();
    if (!body) return;
    clearFieldErrors(body);

    const D = Store.get();
    const cl = (D.clientClaims || []).find(x => x.id === this._editId);
    if (!cl) return;

    const res = modalVal('clm-res-text');
    const sat = parseInt(modalVal('clm-sat-val')) || 0;

    const v = validateForm({
      'clm-res-text': { value: res, rules: { required: true, maxLength: 500 } }
    });

    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }

    if (sat < 1 || sat > 5) {
      Bus.emit('toast', { msg: 'Satisfaction 1-5', type: 'error' });
      return;
    }

    cl.status = 'resolved';
    cl.resolution = res;
    cl.satisfaction = sat;
    cl.resolvedDate = todayStr();

    logAudit('update', 'clientClaims', 'Resolved claim', null, { id: this._editId, resolution: res, satisfaction: sat });
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this._editId = null;
    this.render();
  }

  // ── Progress / Delete Claim ─────────────────────────────────

  _progressClaim(id) {
    const D = Store.get();
    const cl = (D.clientClaims || []).find(x => x.id === id);
    if (!cl) return;
    cl.status = 'in_progress';
    logAudit('update', 'clientClaims', 'Claim in progress', null, { id });
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteClaim(id) {
    if (!await showConfirm(t('clm_confirm_delete'))) return;
    const D = Store.get();
    D.clientClaims = (D.clientClaims || []).filter(c => c.id !== id);
    logAudit('delete', 'clientClaims', 'Deleted claim', { id }, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }
}

customElements.define('egg-clients', EggClients);
export { EggClients };
