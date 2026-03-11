// EGGlogU — Finances Web Component
// Replaces renderFinances(), renderFinIncome(), renderFinExpenses(), renderFinReceivables(),
// renderFinSummary(), showIncomeForm(), saveIncome(), deleteIncome(), showExpenseForm(),
// saveExpense(), deleteExpense(), showReceivableForm(), saveReceivable(), deleteReceivable(),
// toggleReceivablePaid(), onExpenseCatChange(), exportFinCSV()

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, genId, validateForm, emptyState, DataTable, CATALOGS, VENG, currency, kpi, clientSelect, flockSelect, catalogSelect, showFieldError, clearFieldErrors, logAudit } from '../core/index.js';
import { voidRecord, voidRecords, activeOnly, createReversalEntry } from '../core/utils.js';
import { getModalBody, modalVal, modalQuery } from './egg-modal.js';
import { showVoidDialog } from './egg-confirm.js';
import { renderCashFlow, renderBudget, renderAging } from './egg-fin-analysis.js';
import { renderPnL, renderBalanceSheet, renderEERR } from './egg-fin-statements.js';

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

class EggFinances extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'income';
    this._editId = null;
    this._unsubs = [];
    this._vengWarningsShown = false;
    this._pnlPeriod = 'thisMonth';
    this._balancePeriod = 'ytd';
    this._eerrPeriod = 'thisMonth';
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('modal:action', (e) => this._onModalAction(e)),
      Bus.on('modal:change', (e) => this._onModalChange(e)),
      Bus.on('modal:closed', () => {
        this._vengWarningsShown = false;
        this._editId = null;
      }),
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

  // ─────────────── RENDER ───────────────
  render() {
    const D = Store.get();
    let h = this._baseStyle();

    // Header
    h += `<div class="page-header"><h2>${t('fin_title')}</h2></div>`;

    // Tabs
    h += `<div class="tabs">
      <div class="tab${this._currentTab === 'income' ? ' active' : ''}" data-action="tab-income">${t('fin_income')}</div>
      <div class="tab${this._currentTab === 'expenses' ? ' active' : ''}" data-action="tab-expenses">${t('fin_expenses')}</div>
      <div class="tab${this._currentTab === 'payables' ? ' active' : ''}" data-action="tab-payables">${t('fin_payables')}</div>
      <div class="tab${this._currentTab === 'receivables' ? ' active' : ''}" data-action="tab-receivables">${t('fin_receivables')}</div>
      <div class="tab-divider"></div>
      <div class="tab${this._currentTab === 'cashflow' ? ' active' : ''}" data-action="tab-cashflow">${t('fin_cashflow') || 'Cash Flow'}</div>
      <div class="tab${this._currentTab === 'budget' ? ' active' : ''}" data-action="tab-budget">${t('fin_budget') || 'Budget'}</div>
      <div class="tab${this._currentTab === 'aging' ? ' active' : ''}" data-action="tab-aging">${t('fin_aging') || 'Aging'}</div>
      <div class="tab-divider"></div>
      <div class="tab${this._currentTab === 'pnl' ? ' active' : ''}" data-action="tab-pnl">${t('fin_pnl') || 'P&L'}</div>
      <div class="tab${this._currentTab === 'balance' ? ' active' : ''}" data-action="tab-balance">${t('bal_title') || 'Balance'}</div>
      <div class="tab${this._currentTab === 'eerr' ? ' active' : ''}" data-action="tab-eerr">${t('eerr_title') || 'EERR'}</div>
      <div class="tab-divider"></div>
      <div class="tab${this._currentTab === 'summary' ? ' active' : ''}" data-action="tab-summary">${t('fin_summary')}</div>
    </div>`;

    // Content
    if (this._currentTab === 'income') h += this._renderIncome(D);
    else if (this._currentTab === 'expenses') h += this._renderExpenses(D);
    else if (this._currentTab === 'payables') h += this._renderPayables(D);
    else if (this._currentTab === 'receivables') h += this._renderReceivables(D);
    else if (this._currentTab === 'cashflow') h += renderCashFlow(D);
    else if (this._currentTab === 'budget') h += renderBudget(D);
    else if (this._currentTab === 'aging') h += renderAging(D);
    else if (this._currentTab === 'pnl') h += renderPnL(D, this._pnlPeriod);
    else if (this._currentTab === 'balance') h += renderBalanceSheet(D, this._balancePeriod);
    else if (this._currentTab === 'eerr') h += renderEERR(D, this._eerrPeriod);
    else h += this._renderSummary(D);

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  // ── Styles ──────────────────────────────────────────────────
  _baseStyle() {
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
      .tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid var(--border, #e0e0e0); overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
      .tab { padding: 8px 14px; cursor: pointer; font-weight: 600; font-size: 13px; color: var(--text-light, #888); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; user-select: none; white-space: nowrap; }
      .tab:hover { color: var(--primary, #1A3C6E); }
      .tab.active { color: var(--primary, #1A3C6E); border-bottom-color: var(--primary, #1A3C6E); }
      .tab-divider { width: 1px; background: var(--border, #e0e0e0); margin: 6px 4px; flex-shrink: 0; }
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
      .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border, #eee); }
      .stat-label { color: var(--text, #333); font-weight: 500; }
      .stat-value { font-weight: 600; }
      .empty-state { text-align: center; padding: 40px 20px; color: var(--text-light, #888); }
      .empty-icon { font-size: 48px; margin-bottom: 8px; }
      .dm-badge-success { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 13px; background: #e8f5e9; color: #2e7d32; }
      .dm-badge-critical { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 13px; background: #fce4ec; color: #c62828; }
      .dm-warn-box { margin: 4px 0; padding: 6px; background: #fff3e0; border-radius: 4px; font-size: 12px; }
      .progress-bar { height: 8px; background: var(--border, #e0e0e0); border-radius: 4px; overflow: hidden; margin-top: 4px; }
      .progress-fill { height: 100%; border-radius: 4px; transition: width .3s; }
      .section-divider { border: none; border-top: 2px solid var(--border, #e0e0e0); margin: 16px 0; }
      .fin-statement .stat-row { padding: 6px 12px; }
      .fin-statement .stat-row.total { font-weight: 700; font-size: 15px; border-top: 2px solid var(--text, #333); border-bottom: 2px solid var(--text, #333); margin: 4px 0; }
      .fin-statement .stat-row.subtotal { font-weight: 600; border-top: 1px solid var(--border, #ccc); }
      .fin-statement .stat-row.indent { padding-left: 32px; }
      .period-selector { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
      .period-btn { padding: 6px 14px; border: 1px solid var(--border, #ddd); border-radius: 6px; cursor: pointer; font-size: 13px; background: var(--bg, #fff); }
      .period-btn.active { background: var(--primary, #1A3C6E); color: #fff; border-color: var(--primary, #1A3C6E); }
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

  // ── Income Tab ──────────────────────────────────────────────
  _renderIncome(D) {
    const incomeActive = activeOnly(D.finances.income);
    const tot = incomeActive.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    return DataTable.create({
      id: 'fin-income',
      data: incomeActive,
      emptyIcon: '\u{1F4C8}',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px"><h3>${t('fin_income')}</h3><button class="btn btn-primary btn-sm" data-action="add-income">${t('fin_add_income')}</button></div>`,
      kpiHtml: incomeActive.length ? `<div class="kpi-grid">${kpi(t('fin_total_income'), fmtMoney(tot))}</div>` : '',
      columns: [
        { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        {
          key: 'type', label: t('fin_type'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'eggs', label: t('fin_type_eggs') },
            { value: 'birds', label: t('fin_type_birds') },
            { value: 'manure', label: t('fin_type_manure') },
            { value: 'processed', label: t('fin_type_processed') || 'Processed' },
            { value: 'byproducts', label: t('fin_type_byproducts') || 'Byproducts' },
            { value: 'services', label: t('fin_type_services') || 'Services' },
            { value: 'other', label: t('fin_type_other') }
          ],
          render: r => t('fin_type_' + r.type) || sanitizeHTML(r.type || '-')
        },
        { key: 'quantity', label: t('fin_qty'), type: 'number', sortable: true },
        { key: 'unitPrice', label: t('fin_unit_price'), type: 'money', sortable: true },
        { key: '_total', label: t('total'), type: 'money', sortable: true, getValue: r => (r.quantity || 0) * (r.unitPrice || 0) || (r.amount || 0) },
        {
          key: 'clientId', label: t('fin_client'), type: 'text',
          render: r => { const cl = D.clients.find(c => c.id === r.clientId); return cl ? sanitizeHTML(cl.name) : sanitizeHTML(r.clientName || '-'); }
        },
        { key: 'docNo', label: t('fin_doc_number') || 'Doc #', type: 'text', sortable: true, hidden: true },
        {
          key: 'paymentMethod', label: t('fin_payment_method') || 'Payment', type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'cash', label: t('fin_pay_cash') || 'Cash' },
            { value: 'transfer', label: t('fin_pay_transfer') || 'Transfer' },
            { value: 'check', label: t('fin_pay_check') || 'Check' },
            { value: 'card', label: t('fin_pay_card') || 'Card' },
            { value: 'credit', label: t('fin_pay_credit') || 'Credit' }
          ],
          render: r => r.paymentMethod ? (t('fin_pay_' + r.paymentMethod) || r.paymentMethod) : '-'
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="edit-income" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-income" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), icon: '\u{1F5D1}\uFE0F', danger: true,
        action: ids => this._bulkDeleteIncome(ids)
      }]
    });
  }

  // ── Expenses Tab ────────────────────────────────────────────
  _renderExpenses(D) {
    const expensesActive = activeOnly(D.finances.expenses);
    const tot = expensesActive.reduce((s, e) => s + (e.amount || 0), 0);
    return DataTable.create({
      id: 'fin-expenses',
      data: expensesActive,
      emptyIcon: '\u{1F4C9}',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px"><h3>${t('fin_expenses')}</h3><button class="btn btn-primary btn-sm" data-action="add-expense">${t('fin_add_expense')}</button></div>`,
      kpiHtml: expensesActive.length ? `<div class="kpi-grid">${kpi(t('fin_total_expenses'), fmtMoney(tot), '', 'danger')}</div>` : '',
      columns: [
        { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        {
          key: 'category', label: t('fin_category'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'feed', label: t('fin_cat_feed') },
            { value: 'vaccines', label: t('fin_cat_vaccines') },
            { value: 'transport', label: t('fin_cat_transport') },
            { value: 'labor', label: t('fin_cat_labor') },
            { value: 'infrastructure', label: t('fin_cat_infrastructure') },
            { value: 'bird_purchase', label: t('fin_cat_bird_purchase') },
            { value: 'utilities', label: t('fin_cat_utilities') || 'Utilities' },
            { value: 'packaging', label: t('fin_cat_packaging') || 'Packaging' },
            { value: 'insurance', label: t('fin_cat_insurance') || 'Insurance' },
            { value: 'marketing', label: t('fin_cat_marketing') || 'Marketing' },
            { value: 'equipment', label: t('fin_cat_equipment') || 'Equipment' },
            { value: 'other', label: t('fin_cat_other') }
          ],
          render: r => t('fin_cat_' + r.category) || sanitizeHTML(r.category || '-')
        },
        { key: 'description', label: t('fin_description'), type: 'text', sortable: true },
        { key: 'amount', label: t('fin_amount'), type: 'money', sortable: true },
        {
          key: 'paymentMethod', label: t('fin_payment_method') || 'Payment', type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'cash', label: t('fin_pay_cash') || 'Cash' },
            { value: 'transfer', label: t('fin_pay_transfer') || 'Transfer' },
            { value: 'check', label: t('fin_pay_check') || 'Check' },
            { value: 'card', label: t('fin_pay_card') || 'Card' }
          ],
          render: r => r.paymentMethod ? (t('fin_pay_' + r.paymentMethod) || r.paymentMethod) : '-'
        },
        { key: 'docNo', label: t('fin_doc_number') || 'Doc #', type: 'text', sortable: true, hidden: true }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="edit-expense" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-expense" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), icon: '\u{1F5D1}\uFE0F', danger: true,
        action: ids => this._bulkDeleteExpenses(ids)
      }]
    });
  }

  // ── Receivables Tab ─────────────────────────────────────────
  _renderReceivables(D) {
    const receivablesActive = activeOnly(D.finances.receivables);
    if (!receivablesActive.length) {
      let h = `<div class="page-header" style="margin-bottom:12px"><h3>${t('fin_receivables')}</h3><button class="btn btn-primary btn-sm" data-action="add-receivable">${t('fin_add_receivable')}</button></div>`;
      return h + emptyState('\u{1F4CB}', t('no_data'));
    }
    const pending = receivablesActive.filter(r => !r.paid);
    const tot = pending.reduce((s, r) => s + (r.amount || 0), 0);
    return DataTable.create({
      id: 'receivables',
      data: receivablesActive,
      emptyIcon: '\u{1F4CB}',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px"><h3>${t('fin_receivables')}</h3><button class="btn btn-primary btn-sm" data-action="add-receivable">${t('fin_add_receivable')}</button></div>`,
      kpiHtml: `<div class="kpi-grid">${kpi(t('fin_receivables'), fmtMoney(tot), pending.length + ' ' + (t('vac_pending') || 'pending').toLowerCase(), 'warning')}</div>`,
      columns: [
        { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        {
          key: 'clientId', label: t('fin_client'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: D.clients.map(c => ({ value: c.id, label: c.name })),
          render: r => { const cl = D.clients.find(c => c.id === r.clientId); return cl ? sanitizeHTML(cl.name) : sanitizeHTML(r.clientName || '-'); }
        },
        { key: 'description', label: t('fin_description'), type: 'text', sortable: true, render: r => sanitizeHTML(r.description || '-') },
        { key: 'amount', label: t('fin_amount'), type: 'number', sortable: true, render: r => '<strong>' + fmtMoney(r.amount) + '</strong>' },
        { key: 'dueDate', label: t('fin_due_date'), type: 'date', sortable: true },
        {
          key: 'paid', label: t('fin_paid'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [{ value: 'true', label: t('yes') || 'Yes' }, { value: 'false', label: t('no') || 'No' }],
          getValue: r => String(!!r.paid),
          render: r => `<input type="checkbox" ${r.paid ? 'checked' : ''} data-action="toggle-paid" data-id="${escapeAttr(r.id)}">`
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="edit-receivable" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-receivable" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), icon: '\u{1F5D1}\uFE0F', danger: true,
        action: ids => this._bulkDeleteReceivables(ids)
      }]
    });
  }

  // ── Payables Tab (Gastos por Pagar / Nómina) ───────────────
  _renderPayables(D) {
    if (!D.finances.payables) D.finances.payables = [];
    const payablesActive = activeOnly(D.finances.payables);
    const pending = payablesActive.filter(p => !p.paid);
    const tot = pending.reduce((s, p) => s + (p.amount || 0), 0);
    const curMonth = todayStr().substring(0, 7);

    let h = `<div class="page-header" style="margin-bottom:12px">
      <h3>${t('fin_payables')}</h3>
      <button class="btn btn-primary btn-sm" data-action="generate-payroll">${t('fin_payable_generate')}</button>
    </div>`;

    if (payablesActive.length) {
      h += `<div class="kpi-grid">
        ${kpi(t('fin_payable_total'), fmtMoney(tot), pending.length + ' ' + (t('fin_payable_pending') || 'pending').toLowerCase(), 'warning')}
      </div>`;
    }

    if (!payablesActive.length) {
      return h + emptyState('\u{1F4CB}', t('no_data'));
    }

    h += '<div class="table-wrap"><table><thead><tr>';
    h += `<th>${t('fin_payable_month')}</th><th>${t('fin_payable_employee')}</th><th>${t('ops_per_role') || 'Role'}</th><th>${t('fin_amount')}</th><th>${t('fin_payable_status')}</th><th>${t('actions') || 'Actions'}</th>`;
    h += '</tr></thead><tbody>';
    payablesActive.sort((a, b) => (b.month || '').localeCompare(a.month || '')).forEach(p => {
      const isPaid = !!p.paid;
      const statusBadge = isPaid
        ? `<span class="badge badge-success">${t('fin_payable_paid_status')}</span>`
        : `<span class="badge badge-warning">${t('fin_payable_pending')}</span>`;
      h += `<tr${isPaid ? ' style="opacity:.6"' : ''}>
        <td>${sanitizeHTML(p.month || '-')}</td>
        <td><strong>${sanitizeHTML(p.employeeName || '-')}</strong></td>
        <td>${sanitizeHTML(p.role || '-')}</td>
        <td>${fmtMoney(p.amount)}</td>
        <td>${statusBadge}</td>
        <td><div class="btn-group">
          ${!isPaid ? `<button class="btn btn-primary btn-sm" data-action="pay-payable" data-id="${escapeAttr(p.id)}">${t('fin_payable_pay')}</button>` : ''}
          <button class="btn btn-danger btn-sm" data-action="delete-payable" data-id="${escapeAttr(p.id)}">${t('delete')}</button>
        </div></td>
      </tr>`;
    });
    h += '</tbody></table></div>';
    return h;
  }

  _generatePayroll() {
    const D = Store.get();
    if (!D.finances.payables) D.finances.payables = [];
    const curMonth = todayStr().substring(0, 7);

    // Check if already generated for this month
    const existing = activeOnly(D.finances.payables).filter(p => p.month === curMonth);
    if (existing.length > 0) {
      Bus.emit('toast', { msg: t('fin_payable_already'), type: 'warning' });
      return;
    }

    // Get active personnel with salary > 0
    const activePersonnel = activeOnly(D.personnel || []).filter(p => p.active && p.salary > 0);
    if (!activePersonnel.length) {
      Bus.emit('toast', { msg: t('no_data'), type: 'warning' });
      return;
    }

    activePersonnel.forEach(emp => {
      D.finances.payables.push({
        id: genId(),
        month: curMonth,
        employeeId: emp.id,
        employeeName: emp.name,
        role: emp.role,
        amount: emp.salary,
        paid: false,
        createdAt: new Date().toISOString()
      });
    });

    logAudit('create', 'finances', 'Generate payroll ' + curMonth + ': ' + activePersonnel.length + ' employees', null, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('fin_payable_generated') + ': ' + activePersonnel.length });
    this.render();
  }

  _payPayable(id) {
    const D = Store.get();
    if (!D.finances.payables) return;
    const p = D.finances.payables.find(x => x.id === id);
    if (!p || p.paid) return;

    // Mark as paid
    p.paid = true;
    p.paidDate = todayStr();

    // Create expense entry
    if (!D.finances.expenses) D.finances.expenses = [];
    D.finances.expenses.push({
      id: genId(),
      date: todayStr(),
      category: 'labor',
      description: (t('fin_cat_payroll') || 'Payroll') + ': ' + (p.employeeName || '') + ' (' + (p.month || '') + ')',
      amount: p.amount || 0,
      notes: p.role || '',
      payableId: id
    });

    logAudit('update', 'finances', 'Pay payable: ' + p.employeeName + ' ' + p.month, id, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('fin_payable_paid_ok') });
    this.render();
  }

  async _deletePayable(id) {
    const reason = await showVoidDialog(t('confirm_delete'));
    if (!reason) return;
    const D = Store.get();
    if (!D.finances.payables) return;
    voidRecord(D.finances.payables, id, reason);
    logAudit('void', 'finances', 'Void payable: ' + reason, id, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ── Summary Tab ─────────────────────────────────────────────
  _renderSummary(D) {
    const mo = todayStr().substring(0, 7);
    const mInc = activeOnly(D.finances.income).filter(i => i.date && i.date.startsWith(mo)).reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    const mExp = activeOnly(D.finances.expenses).filter(e => e.date && e.date.startsWith(mo)).reduce((s, e) => s + (e.amount || 0), 0);
    const grossProfit = mInc - mExp;

    // Tax & Depreciation
    const taxRate = (D.settings.taxRate || 0) / 100;
    const depYears = D.settings.depreciationYears || 5;
    const assetVal = D.settings.assetValue || 0;
    const monthlyDep = assetVal > 0 ? assetVal / (depYears * 12) : 0;
    const operatingProfit = grossProfit - monthlyDep;
    const taxAmt = operatingProfit > 0 ? operatingProfit * taxRate : 0;
    const netProfit = operatingProfit - taxAmt;
    const tEggs = D.dailyProduction.reduce((s, p) => s + (p.eggsCollected || 0), 0);
    const tExp = D.finances.expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const cpe = tEggs > 0 ? tExp / tEggs : 0;
    const totalIncAmt = D.finances.income.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    const totalIncQty = D.finances.income.reduce((s, i) => s + (i.quantity || 0), 0);
    const avgPrice = totalIncQty > 0 ? totalIncAmt / totalIncQty : 0;
    const breakEven = avgPrice > 0 ? Math.ceil(tExp / avgPrice) : 0;

    let h = '<div class="kpi-grid">';
    h += kpi(t('fin_total_income') + ' (' + mo + ')', fmtMoney(mInc), '', 'secondary', t('info_fin_income'));
    h += kpi(t('fin_total_expenses') + ' (' + mo + ')', fmtMoney(mExp), '', 'danger', t('info_fin_expenses'));
    h += kpi(t('fin_gross_profit') || 'Gross Profit', fmtMoney(grossProfit), '', grossProfit < 0 ? 'danger' : '', t('info_fin_gross'));
    if (monthlyDep > 0) h += kpi(t('fin_depreciation') || 'Depreciation/mo', fmtMoney(monthlyDep), '', 'accent', t('info_fin_dep'));
    if (taxRate > 0) h += kpi(t('fin_tax') || 'Tax (' + D.settings.taxRate + '%)', fmtMoney(taxAmt), '', 'warning', t('info_fin_tax'));
    h += kpi(t('fin_net_profit') || 'Net Profit (' + mo + ')', fmtMoney(netProfit), '', netProfit < 0 ? 'danger' : '', t('info_fin_net'));
    h += kpi(t('fin_cost_per_egg'), fmtMoney(cpe), 'global', 'accent', t('info_fin_cpe'));
    h += kpi(t('fin_break_even'), fmtNum(breakEven) + ' ' + t('eggs_unit'), 'global', 'warning', t('info_fin_be'));
    h += '</div>';

    // Per-channel revenue breakdown
    const channels = {};
    D.finances.income.forEach(i => {
      const ch = i.marketChannel || 'other';
      const amt = (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
      const qty = i.quantity || 0;
      if (!channels[ch]) channels[ch] = { revenue: 0, qty: 0 };
      channels[ch].revenue += amt;
      channels[ch].qty += qty;
    });
    if (Object.keys(channels).length > 1 || Object.keys(channels).some(k => k !== 'other')) {
      h += '<div class="card"><h3>' + (t('fin_channel_breakdown') || 'Revenue by Channel') + '</h3><div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('fin_channel') || 'Channel'}</th><th>${t('fin_qty')}</th><th>${t('fin_income')}</th><th>${t('fin_avg_price') || 'Avg Price'}</th><th>%</th></tr></thead><tbody>`;
      Object.entries(channels).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([ch, v]) => {
        const avg = v.qty > 0 ? v.revenue / v.qty : 0;
        const pct = totalIncAmt > 0 ? (v.revenue / totalIncAmt * 100) : 0;
        h += `<tr><td><strong>${t('ch_' + ch) || ch}</strong></td><td>${fmtNum(v.qty)}</td><td style="color:var(--success)">${fmtMoney(v.revenue)}</td><td>${fmtMoney(avg)}</td><td>${fmtNum(pct, 1)}%</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // Monthly breakdown
    const months = {};
    D.finances.income.forEach(i => {
      const m = i.date?.substring(0, 7);
      if (!m) return;
      if (!months[m]) months[m] = { income: 0, expenses: 0 };
      months[m].income += (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
    });
    D.finances.expenses.forEach(e => {
      const m = e.date?.substring(0, 7);
      if (!m) return;
      if (!months[m]) months[m] = { income: 0, expenses: 0 };
      months[m].expenses += (e.amount || 0);
    });
    const mKeys = Object.keys(months).sort().reverse();
    if (mKeys.length) {
      h += '<div class="card"><h3>' + t('fin_summary') + ' ' + t('fin_month') + '</h3><div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('fin_month')}</th><th>${t('fin_income')}</th><th>${t('fin_expenses')}</th><th>${t('fin_net')}</th></tr></thead><tbody>`;
      mKeys.forEach(m => {
        const d = months[m];
        const n = d.income - d.expenses;
        h += `<tr><td>${m}</td><td style="color:var(--success)">${fmtMoney(d.income)}</td><td style="color:var(--danger)">${fmtMoney(d.expenses)}</td>
        <td style="font-weight:700;color:${n < 0 ? 'var(--danger)' : 'var(--success)'}">${fmtMoney(n)}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // Expense by category
    const cats = {};
    D.finances.expenses.forEach(e => { const c = e.category || 'other'; cats[c] = (cats[c] || 0) + (e.amount || 0); });
    if (Object.keys(cats).length) {
      h += '<div class="card"><h3>' + t('fin_expenses') + ' / ' + t('fin_category') + '</h3>';
      Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => {
        const pct = tExp > 0 ? (v / tExp * 100) : 0;
        h += `<div class="stat-row"><span class="stat-label">${t('fin_cat_' + c) || c}</span><span class="stat-value">${fmtMoney(v)} (${fmtNum(pct, 1)}%)</span></div>`;
      });
      h += '</div>';
    }

    // MATHV: Math Verification
    const mv = VENG.mathv(D);
    h += '<div class="card" style="border-left:4px solid ' + (mv.pct === 100 ? 'var(--success)' : 'var(--danger)') + '">';
    h += '<h3>\u{1F512} Math Verification \u2014 ' + (mv.pct === 100 ? '\u2713 All Passed' : '\u2717 ' + mv.checks.filter(c => !c.ok).length + ' Failed') + '</h3>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">';
    mv.checks.forEach(c => {
      h += '<div class="' + (c.ok ? 'dm-badge-success' : 'dm-badge-critical') + '">' + (c.ok ? '\u2713' : '\u2717') + ' ' + sanitizeHTML(c.name) + '</div>';
    });
    h += '</div>';
    if (mv.checks.some(c => !c.ok)) {
      h += '<details><summary style="cursor:pointer;color:var(--danger);font-weight:600">View failures</summary>';
      mv.checks.filter(c => !c.ok).forEach(c => {
        h += '<div class="dm-warn-box">' + sanitizeHTML(c.name) + ': ' + sanitizeHTML(c.detail) + '</div>';
      });
      h += '</details>';
    }
    h += '</div>';

    // CSV export button
    h += `<div class="card"><button class="btn btn-secondary" data-action="export-csv">${t('export_csv')}</button></div>`;
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
        // Tabs
        case 'tab-income':
          this._currentTab = 'income'; this.render(); break;
        case 'tab-expenses':
          this._currentTab = 'expenses'; this.render(); break;
        case 'tab-payables':
          this._currentTab = 'payables'; this.render(); break;
        case 'tab-receivables':
          this._currentTab = 'receivables'; this.render(); break;
        case 'tab-cashflow':
          this._currentTab = 'cashflow'; this.render(); break;
        case 'tab-budget':
          this._currentTab = 'budget'; this.render(); break;
        case 'tab-aging':
          this._currentTab = 'aging'; this.render(); break;
        case 'tab-pnl':
          this._currentTab = 'pnl'; this.render(); break;
        case 'tab-balance':
          this._currentTab = 'balance'; this.render(); break;
        case 'tab-eerr':
          this._currentTab = 'eerr'; this.render(); break;
        case 'tab-summary':
          this._currentTab = 'summary'; this.render(); break;

        // P&L period selector
        case 'pnl-period':
          this._pnlPeriod = btn.dataset.period || 'thisMonth'; this.render(); break;
        case 'balance-period':
          this._balancePeriod = btn.dataset.period || 'ytd'; this.render(); break;
        case 'eerr-period':
          this._eerrPeriod = btn.dataset.period || 'thisMonth'; this.render(); break;

        // Budget actions
        case 'set-budget':
          this._showBudgetForm(); break;
        case 'save-budget':
          // handled by modal action
          break;

        // Payables
        case 'generate-payroll':
          this._generatePayroll(); break;
        case 'pay-payable':
          this._payPayable(id); break;
        case 'delete-payable':
          this._deletePayable(id); break;

        // Income
        case 'add-income':
          this._showIncomeForm(); break;
        case 'edit-income':
          this._showIncomeForm(id); break;
        case 'delete-income':
          this._deleteIncome(id); break;

        // Expenses
        case 'add-expense':
          this._showExpenseForm(); break;
        case 'edit-expense':
          this._showExpenseForm(id); break;
        case 'delete-expense':
          this._deleteExpense(id); break;

        // Receivables
        case 'add-receivable':
          this._showReceivableForm(); break;
        case 'edit-receivable':
          this._showReceivableForm(id); break;
        case 'delete-receivable':
          this._deleteReceivable(id); break;

        // Summary
        case 'export-csv':
          this._exportFinCSV(); break;
      }
    });

    // Handle receivable paid checkbox toggle via change event
    root.addEventListener('change', (e) => {
      const el = e.target.closest('[data-action="toggle-paid"]');
      if (el) {
        this._toggleReceivablePaid(el.dataset.id, el.checked);
      }
    });
  }

  // ── Modal Actions (from Bus) ────────────────────────────────
  _onModalAction(e) {
    switch (e.action) {
      case 'save-income':
        this._saveIncome(); break;
      case 'save-expense':
        this._saveExpense(); break;
      case 'save-receivable':
        this._saveReceivable(); break;
      case 'save-budget':
        this._saveBudget(); break;
    }
  }

  _onModalChange(e) {
    if (e.change === 'expense-cat-change') {
      this._onExpenseCatChange(e.value);
    }
  }

  // ── Income Form & CRUD ──────────────────────────────────────
  _showIncomeForm(id) {
    const D = Store.get();
    const i = id ? D.finances.income.find(x => x.id === id) : null;
    this._editId = id || null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="fi-date" value="${i ? i.date : todayStr()}"></div>
        <div class="form-group"><label>${t('fin_type')}</label><select id="fi-type">
          <option value="eggs"${i && i.type === 'eggs' ? ' selected' : ''}>${t('fin_type_eggs')}</option>
          <option value="birds"${i && i.type === 'birds' ? ' selected' : ''}>${t('fin_type_birds')}</option>
          <option value="manure"${i && i.type === 'manure' ? ' selected' : ''}>${t('fin_type_manure')}</option>
          <option value="processed"${i && i.type === 'processed' ? ' selected' : ''}>${t('fin_type_processed') || 'Processed Products'}</option>
          <option value="byproducts"${i && i.type === 'byproducts' ? ' selected' : ''}>${t('fin_type_byproducts') || 'Byproducts'}</option>
          <option value="services"${i && i.type === 'services' ? ' selected' : ''}>${t('fin_type_services') || 'Services'}</option>
          <option value="other"${i && i.type === 'other' ? ' selected' : ''}>${t('fin_type_other')}</option>
        </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('fin_qty')}</label><input type="number" id="fi-qty" value="${i ? i.quantity || '' : ''}" min="0"></div>
        <div class="form-group"><label>${t('fin_unit_price')}</label><input type="number" id="fi-price" value="${i ? i.unitPrice || '' : ''}" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('fin_egg_type') || 'Egg Type'}</label><select id="fi-eggtype">
          <option value=""${i && !i.eggType ? ' selected' : ''}>--</option>
          <option value="S"${i && i.eggType === 'S' ? ' selected' : ''}>S</option>
          <option value="M"${i && i.eggType === 'M' ? ' selected' : ''}>M</option>
          <option value="L"${i && i.eggType === 'L' ? ' selected' : ''}>L</option>
          <option value="XL"${i && i.eggType === 'XL' ? ' selected' : ''}>XL</option>
          <option value="Jumbo"${i && i.eggType === 'Jumbo' ? ' selected' : ''}>Jumbo</option>
        </select></div>
        <div class="form-group"><label>${t('fin_channel') || 'Channel'}</label><select id="fi-channel">
          <option value=""${i && !i.marketChannel ? ' selected' : ''}>--</option>
          <option value="wholesale"${i && i.marketChannel === 'wholesale' ? ' selected' : ''}>${t('ch_wholesale') || 'Wholesale'}</option>
          <option value="retail"${i && i.marketChannel === 'retail' ? ' selected' : ''}>${t('ch_retail') || 'Retail'}</option>
          <option value="direct"${i && i.marketChannel === 'direct' ? ' selected' : ''}>${t('ch_direct') || 'Direct'}</option>
          <option value="organic"${i && i.marketChannel === 'organic' ? ' selected' : ''}>${t('ch_organic') || 'Organic'}</option>
          <option value="export"${i && i.marketChannel === 'export' ? ' selected' : ''}>${t('ch_export') || 'Export'}</option>
        </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('fin_client')}</label><select id="fi-client">${clientSelect(i ? i.clientId : '')}</select></div>
        <div class="form-group"><label>${t('fin_invoice_number') || 'Invoice #'}</label><input id="fi-docno" value="${i ? escapeAttr(i.docNo || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('fin_payment_method') || 'Payment Method'}</label><select id="fi-paymethod">
          <option value=""${!i || !i.paymentMethod ? ' selected' : ''}>--</option>
          <option value="cash"${i && i.paymentMethod === 'cash' ? ' selected' : ''}>${t('fin_pay_cash') || 'Cash'}</option>
          <option value="transfer"${i && i.paymentMethod === 'transfer' ? ' selected' : ''}>${t('fin_pay_transfer') || 'Transfer'}</option>
          <option value="check"${i && i.paymentMethod === 'check' ? ' selected' : ''}>${t('fin_pay_check') || 'Check'}</option>
          <option value="card"${i && i.paymentMethod === 'card' ? ' selected' : ''}>${t('fin_pay_card') || 'Card'}</option>
          <option value="credit"${i && i.paymentMethod === 'credit' ? ' selected' : ''}>${t('fin_pay_credit') || 'Credit'}</option>
        </select></div>
        <div class="form-group"><label>${t('fin_due_date')}</label><input type="date" id="fi-due" value="${i ? i.dueDate || '' : ''}"></div>
      </div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="fi-notes">${i ? escapeAttr(i.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-income">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: i ? t('edit') : t('fin_add_income'), body });
  }

  _saveIncome() {
    const body = getModalBody();
    if (!body) return;
    clearFieldErrors(body);

    const D = Store.get();
    const o = {
      date: modalVal('fi-date'),
      type: modalVal('fi-type'),
      quantity: parseFloat(modalVal('fi-qty')) || 0,
      unitPrice: parseFloat(modalVal('fi-price')) || 0,
      eggType: modalVal('fi-eggtype') || '',
      marketChannel: modalVal('fi-channel') || '',
      clientId: modalVal('fi-client'),
      docNo: modalVal('fi-docno') || '',
      paymentMethod: modalVal('fi-paymethod') || '',
      dueDate: modalVal('fi-due') || '',
      notes: modalVal('fi-notes')
    };

    const v = validateForm({
      'fi-date': { value: o.date, rules: { required: true, date: true } },
      'fi-qty': { value: modalVal('fi-qty'), rules: { required: true, numeric: true, min: 1 } },
      'fi-price': { value: modalVal('fi-price'), rules: { required: true, numeric: true, min: 0.01 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }

    // VENG gate
    if (!this._vengWarningsShown) {
      const vr = VENG.gate.income(o, D);
      if (!vr.ok) {
        vr.errors.forEach(e => { if (e.field) showFieldError(body, e.field, e.msg); });
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

    if (this._editId) {
      const i = D.finances.income.findIndex(x => x.id === this._editId);
      if (i >= 0) {
        logAudit('update', 'income', 'Edit income', D.finances.income[i], o);
        D.finances.income[i] = { ...D.finances.income[i], ...o };
      }
    } else {
      o.id = genId();
      D.finances.income.push(o);
      logAudit('create', 'income', 'New income: ' + o.type + ' qty=' + o.quantity, null, o);
      // Auto inventory deduction for egg sales
      if (o.type === 'eggs' && o.quantity > 0) {
        D.inventory.push({
          id: genId(), date: o.date, flockId: '', eggType: o.eggType || 'M',
          qtyIn: 0, qtyOut: o.quantity, source: 'sale', ref: o.id
        });
      }
      // Auto-create receivable for credit sales
      if (o.paymentMethod === 'credit' && o.clientId) {
        const totalAmt = (o.quantity || 0) * (o.unitPrice || 0) || 0;
        if (totalAmt > 0) {
          if (!D.finances.receivables) D.finances.receivables = [];
          D.finances.receivables.push({
            id: genId(), date: o.date, clientId: o.clientId,
            amount: totalAmt, dueDate: o.dueDate || '',
            description: (t('fin_type_' + o.type) || o.type) + ' - ' + (o.docNo || o.id),
            paid: false, incomeId: o.id
          });
        }
      }
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this._editId = null;
    this.render();
  }

  async _deleteIncome(id) {
    const reason = await showVoidDialog(t('confirm_delete'));
    if (!reason) return;
    const D = Store.get();
    createReversalEntry(D.finances.income, id, reason);
    voidRecord(D.finances.income, id, reason);
    logAudit('void', 'income', 'Void income: ' + reason, id, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _bulkDeleteIncome(ids) {
    const reason = await showVoidDialog(t('confirm_delete'));
    if (!reason) return;
    const D = Store.get();
    ids.forEach(id => createReversalEntry(D.finances.income, id, reason));
    voidRecords(D.finances.income, ids, reason);
    logAudit('void', 'income', 'Bulk void income: ' + reason, ids, null);
    Store.save(D);
    this.render();
  }

  // ── Expense Form & CRUD ─────────────────────────────────────
  _showExpenseForm(id) {
    const D = Store.get();
    const e = id ? D.finances.expenses.find(x => x.id === id) : null;
    this._editId = id || null;

    const cats = ['feed', 'bird_purchase', 'vaccines', 'transport', 'labor', 'infrastructure', 'utilities', 'packaging', 'insurance', 'marketing', 'equipment', 'other'];
    const catOptions = cats.map(c => `<option value="${c}"${e && e.category === c ? ' selected' : ''}>${t('fin_cat_' + c)}</option>`).join('');
    const descItems = CATALOGS.expenseDescriptions[e ? e.category : 'feed'] || CATALOGS.expenseDescriptions.feed;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="fe-date" value="${e ? e.date : todayStr()}"></div>
        <div class="form-group"><label>${t('fin_category')}</label><select id="fe-cat" data-action="expense-cat-change">${catOptions}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('fin_description')}</label><select id="fe-desc">${catalogSelect(descItems, e ? e.description || '' : '')}</select></div>
        <div class="form-group"><label>${t('fin_amount')}</label><input type="number" id="fe-amt" value="${e ? e.amount : ''}" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('exp_flock')}</label><select id="fe-flock"><option value="">${t('all')}</option>${D.flocks.filter(f => f.status !== 'descarte').map(f => `<option value="${f.id}"${e && e.flockId === f.id ? ' selected' : ''}>${sanitizeHTML(f.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label>${t('fin_doc_number') || 'Doc #'}</label><input id="fe-docno" value="${e ? escapeAttr(e.docNo || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('fin_payment_method') || 'Payment Method'}</label><select id="fe-paymethod">
          <option value=""${!e || !e.paymentMethod ? ' selected' : ''}>--</option>
          <option value="cash"${e && e.paymentMethod === 'cash' ? ' selected' : ''}>${t('fin_pay_cash') || 'Cash'}</option>
          <option value="transfer"${e && e.paymentMethod === 'transfer' ? ' selected' : ''}>${t('fin_pay_transfer') || 'Transfer'}</option>
          <option value="check"${e && e.paymentMethod === 'check' ? ' selected' : ''}>${t('fin_pay_check') || 'Check'}</option>
          <option value="card"${e && e.paymentMethod === 'card' ? ' selected' : ''}>${t('fin_pay_card') || 'Card'}</option>
        </select></div>
        <div class="form-group"></div>
      </div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="fe-notes">${e ? escapeAttr(e.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-expense">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: e ? t('edit') : t('fin_add_expense'), body });
  }

  _onExpenseCatChange(catVal) {
    const body = getModalBody();
    if (!body) return;
    const cat = catVal || modalVal('fe-cat');
    const descEl = body.querySelector('#fe-desc');
    if (!descEl || !cat) return;
    const opts = CATALOGS.expenseDescriptions[cat] || [];
    descEl.innerHTML = catalogSelect(opts, descEl.value, true);
  }

  _saveExpense() {
    const body = getModalBody();
    if (!body) return;
    clearFieldErrors(body);

    const D = Store.get();
    const o = {
      date: modalVal('fe-date'),
      category: modalVal('fe-cat'),
      description: modalVal('fe-desc'),
      amount: parseFloat(modalVal('fe-amt')) || 0,
      flockId: modalVal('fe-flock') || null,
      docNo: modalVal('fe-docno') || '',
      paymentMethod: modalVal('fe-paymethod') || '',
      notes: modalVal('fe-notes')
    };

    const v = validateForm({
      'fe-date': { value: o.date, rules: { required: true, date: true } },
      'fe-cat': { value: o.category, rules: { required: true } },
      'fe-amt': { value: modalVal('fe-amt'), rules: { required: true, numeric: true, min: 0.01 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }

    // VENG gate
    if (!this._vengWarningsShown) {
      const vr = VENG.gate.expense(o, D);
      if (!vr.ok) {
        vr.errors.forEach(e => { if (e.field) showFieldError(body, e.field, e.msg); });
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

    if (this._editId) {
      const i = D.finances.expenses.findIndex(e => e.id === this._editId);
      if (i >= 0) {
        logAudit('update', 'expenses', 'Edit expense', D.finances.expenses[i], o);
        D.finances.expenses[i] = { ...D.finances.expenses[i], ...o };
      }
    } else {
      o.id = genId();
      D.finances.expenses.push(o);
      logAudit('create', 'expenses', 'New expense: ' + o.category + ' $' + o.amount, null, o);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this._editId = null;
    this.render();
  }

  async _deleteExpense(id) {
    const reason = await showVoidDialog(t('confirm_delete'));
    if (!reason) return;
    const D = Store.get();
    createReversalEntry(D.finances.expenses, id, reason);
    voidRecord(D.finances.expenses, id, reason);
    logAudit('void', 'expenses', 'Void expense: ' + reason, id, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _bulkDeleteExpenses(ids) {
    const reason = await showVoidDialog(t('confirm_delete'));
    if (!reason) return;
    const D = Store.get();
    ids.forEach(id => createReversalEntry(D.finances.expenses, id, reason));
    voidRecords(D.finances.expenses, ids, reason);
    logAudit('void', 'expenses', 'Bulk void expenses: ' + reason, ids, null);
    Store.save(D);
    this.render();
  }

  // ── Receivable Form & CRUD ──────────────────────────────────
  _showReceivableForm(id) {
    const D = Store.get();
    const r = id ? D.finances.receivables.find(x => x.id === id) : null;
    this._editId = id || null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="fr-date" value="${r ? r.date : todayStr()}"></div>
        <div class="form-group"><label>${t('fin_due_date')}</label><input type="date" id="fr-due" value="${r ? r.dueDate || '' : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('fin_client')}</label><select id="fr-client">${clientSelect(r ? r.clientId : '')}</select></div>
        <div class="form-group"><label>${t('fin_amount')}</label><input type="number" id="fr-amt" value="${r ? r.amount : ''}" min="0"></div>
      </div>
      <div class="form-group"><label>${t('fin_description')}</label><input id="fr-desc" value="${r ? escapeAttr(r.description || '') : ''}"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-receivable">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: r ? t('edit') : t('fin_add_receivable'), body });
  }

  _saveReceivable() {
    const body = getModalBody();
    if (!body) return;
    clearFieldErrors(body);

    const D = Store.get();
    const o = {
      date: modalVal('fr-date'),
      dueDate: modalVal('fr-due'),
      clientId: modalVal('fr-client'),
      amount: parseFloat(modalVal('fr-amt')) || 0,
      description: modalVal('fr-desc'),
      paid: false
    };

    const v = validateForm({
      'fr-date': { value: o.date, rules: { required: true, date: true } },
      'fr-client': { value: o.clientId, rules: { required: true } },
      'fr-amt': { value: modalVal('fr-amt'), rules: { required: true, numeric: true, min: 0.01 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }

    if (this._editId) {
      const i = D.finances.receivables.findIndex(r => r.id === this._editId);
      if (i >= 0) {
        o.paid = D.finances.receivables[i].paid;
        D.finances.receivables[i] = { ...D.finances.receivables[i], ...o };
      }
    } else {
      o.id = genId();
      D.finances.receivables.push(o);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this._editId = null;
    this.render();
  }

  _toggleReceivablePaid(id, paid) {
    const D = Store.get();
    const r = D.finances.receivables.find(x => x.id === id);
    if (r) {
      r.paid = paid;
      Store.save(D);
      this.render();
    }
  }

  async _deleteReceivable(id) {
    const reason = await showVoidDialog(t('confirm_delete'));
    if (!reason) return;
    const D = Store.get();
    voidRecord(D.finances.receivables, id, reason);
    logAudit('void', 'receivables', 'Void receivable: ' + reason, id, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _bulkDeleteReceivables(ids) {
    const reason = await showVoidDialog(t('confirm_delete'));
    if (!reason) return;
    const D = Store.get();
    voidRecords(D.finances.receivables, ids, reason);
    logAudit('void', 'receivables', 'Bulk void receivables: ' + reason, ids, null);
    Store.save(D);
    this.render();
  }

  // ── Budget Form & CRUD ─────────────────────────────────
  _showBudgetForm() {
    const D = Store.get();
    const curMonth = todayStr().substring(0, 7);
    const cats = ['feed', 'bird_purchase', 'vaccines', 'transport', 'labor', 'infrastructure', 'utilities', 'packaging', 'insurance', 'marketing', 'equipment', 'other'];
    if (!D.finances.budgets) D.finances.budgets = [];
    const existing = D.finances.budgets.filter(b => b.month === curMonth);

    let rows = '';
    cats.forEach(c => {
      const b = existing.find(x => x.category === c);
      rows += `<div class="form-row">
        <div class="form-group" style="flex:2"><label>${t('fin_cat_' + c)}</label></div>
        <div class="form-group" style="flex:1"><input type="number" min="0" step="0.01" id="fb-${c}" value="${b ? b.amount : ''}"></div>
      </div>`;
    });

    const body = `
      <div class="form-group"><label>${t('fin_month')}</label><input type="month" id="fb-month" value="${curMonth}"></div>
      <hr style="margin:12px 0;border:none;border-top:1px solid var(--border,#eee)">
      <p style="font-size:13px;color:var(--text-light,#888);margin:0 0 12px">${t('fin_budget_amount') || 'Budget Amount'} ${t('fin_per_category') || 'per category'}:</p>
      ${rows}
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-budget">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', { title: t('fin_set_budget') || 'Set Budget', body });
  }

  _saveBudget() {
    const body = getModalBody();
    if (!body) return;
    const D = Store.get();
    if (!D.finances.budgets) D.finances.budgets = [];
    const month = modalVal('fb-month');
    if (!month) return;

    const cats = ['feed', 'bird_purchase', 'vaccines', 'transport', 'labor', 'infrastructure', 'utilities', 'packaging', 'insurance', 'marketing', 'equipment', 'other'];
    cats.forEach(c => {
      const val = parseFloat(modalVal('fb-' + c)) || 0;
      const existing = D.finances.budgets.find(b => b.month === month && b.category === c);
      if (existing) {
        existing.amount = val;
      } else if (val > 0) {
        D.finances.budgets.push({ id: genId(), month, category: c, amount: val });
      }
    });

    logAudit('update', 'finances', 'Set budget for ' + month, null, null);
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ── CSV Export ──────────────────────────────────────────────
  _exportFinCSV() {
    const D = Store.get();
    const esc = s => String(s || '').replace(/"/g, '""');
    let csv = t('fin_type') + ',' + t('date') + ',' + t('fin_category') + ',' + t('fin_description') + ',' + t('fin_qty') + ',' + t('fin_unit_price') + ',' + t('fin_amount') + '\n';
    activeOnly(D.finances.income).forEach(i => {
      const a = (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
      csv += `"${esc(t('csv_income'))}","${i.date}","${esc(i.type)}","${esc(i.notes)}",${i.quantity || 0},${i.unitPrice || 0},${a}\n`;
    });
    activeOnly(D.finances.expenses).forEach(e => {
      csv += `"${esc(t('csv_expense'))}","${e.date}","${esc(e.category)}","${esc(e.description)}",,,${e.amount || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'egglogu_finanzas_' + todayStr() + '.csv';
    a.click();
    Bus.emit('toast', { msg: t('cfg_exported') });
  }
}

customElements.define('egg-finances', EggFinances);
export { EggFinances };
