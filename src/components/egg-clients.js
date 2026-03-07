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
    const totalClaims = claims.length;
    const openCl = claims.filter(c => c.status !== 'resolved').length;
    const resolved = claims.filter(c => c.status === 'resolved').length;
    const resRate = totalClaims ? Math.round(resolved / totalClaims * 100) : 0;
    const sats = claims.filter(c => c.satisfaction).map(c => c.satisfaction);
    const avgSat = sats.length ? (sats.reduce((a, b) => a + b, 0) / sats.length).toFixed(1) : '--';

    let h = this._baseStyle();

    // Header
    h += `<div class="page-header"><h2>${t('cli_title')}</h2></div>`;

    // KPI Grid
    h += '<div class="kpi-grid">';
    h += kpi(t('cli_total'), fmtNum(D.clients.length), '', '', t('info_cli_total'));
    h += kpi(t('clm_title'), fmtNum(totalClaims), t('total'), '', t('info_clm_total'));
    h += kpi(t('clm_status_open'), fmtNum(openCl), '', openCl > 0 ? 'warning' : '');
    h += kpi(t('clm_resolution_rate'), resRate + '%', '', totalClaims && resRate < 80 ? 'warning' : '');
    h += kpi(t('clm_avg_sat'), avgSat !== '--' ? avgSat + ' \u2B50' : '--', '', '', t('info_clm_sat'));
    h += '</div>';

    // Tabs
    h += `<div class="tabs">
      <div class="tab${this._currentTab === 'list' ? ' active' : ''}" data-action="tab-list">\uD83D\uDC65 ${t('clm_tab_list')}</div>
      <div class="tab${this._currentTab === 'claims' ? ' active' : ''}" data-action="tab-claims">\uD83D\uDCCB ${t('clm_tab_claims')}</div>
    </div>`;

    // Content
    if (this._currentTab === 'list') {
      h += this._renderClientList(D);
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
      .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
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
      .btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
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
      @media (max-width: 768px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
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
