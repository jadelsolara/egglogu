// <egg-operations> — Operations Web Component
// Replaces monolith renderOperations(), renderOpsChecklist(), renderOpsLogbook(),
// renderOpsPersonnel(), toggleCheck(), deleteCheck(), addCheckTask(),
// showLogForm(), saveLog(), deleteLog(), showPersonnelForm(), savePersonnel(), deletePersonnel()

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, genId, validateForm, emptyState, DataTable, CATALOGS, kpi, catalogSelect, showFieldError, clearFieldErrors, logAudit } from '../core/index.js';
import { modalVal, getModalBody, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

const LOG_CATEGORIES = ['general', 'health', 'production', 'maintenance', 'observation'];

class EggOperations extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._currentTab = 'checklist';
    this._editId = null;
    this._logFilterCat = '';
  }

  connectedCallback() {
    this.render();
    DataTable.handleEvent(this.shadowRoot, () => this.render());

    // Listen for modal save actions
    this._unsubs.push(
      Bus.on('modal:action', (ev) => {
        if (ev.action === 'save-log') {
          this._saveLog(this._editId);
        } else if (ev.action === 'save-personnel') {
          this._savePersonnel(this._editId);
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
    let h = this._styles();

    h += `<div class="page-header"><h2>${t('ops_title')}</h2></div>`;
    h += `<div class="tabs">
      <div class="tab${this._currentTab === 'checklist' ? ' active' : ''}" data-tab="checklist">${sanitizeHTML('\u2705')} ${t('ops_checklist')}</div>
      <div class="tab${this._currentTab === 'logbook' ? ' active' : ''}" data-tab="logbook">${sanitizeHTML('\uD83D\uDCD3')} ${t('ops_logbook')}</div>
      <div class="tab${this._currentTab === 'personnel' ? ' active' : ''}" data-tab="personnel">${sanitizeHTML('\uD83D\uDC77')} ${t('ops_personnel')}</div>
    </div>`;

    if (this._currentTab === 'checklist') h += this._renderChecklist(D);
    else if (this._currentTab === 'logbook') h += this._renderLogbook(D);
    else h += this._renderPersonnel(D);

    this.shadowRoot.innerHTML = h;
    this._bindActions();
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

      /* Tabs */
      .tabs {
        display: flex; gap: 0; margin-bottom: 16px;
        border-bottom: 2px solid var(--border, #e0e0e0);
      }
      .tab {
        padding: 10px 20px; cursor: pointer; font-weight: 600; font-size: 14px;
        border-bottom: 2px solid transparent; margin-bottom: -2px;
        color: var(--text-light, #757575); transition: color .2s, border-color .2s;
      }
      .tab:hover { color: var(--primary, #4a7c59); }
      .tab.active {
        color: var(--primary, #4a7c59);
        border-bottom-color: var(--primary, #4a7c59);
      }

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
      .card h3 { margin: 0 0 12px 0; color: var(--primary-dark, #0E2240); }

      /* KPI grid */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px; margin-bottom: 16px;
      }

      /* Checklist */
      .checklist-item {
        display: flex; align-items: center; gap: 10px; padding: 8px 12px;
        border-bottom: 1px solid var(--border, #eee); font-size: 14px;
      }
      .checklist-item.done span { text-decoration: line-through; color: var(--text-light, #999); }
      .checklist-item input[type="checkbox"] {
        width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary, #4a7c59);
      }
      .checklist-item span { flex: 1; }

      /* Stat row */
      .stat-row {
        display: flex; justify-content: space-between; padding: 6px 0;
        border-bottom: 1px solid var(--border, #f0f0f0); font-size: 13px;
      }
      .stat-label { color: var(--text-light, #757575); }
      .stat-value { font-weight: 600; }

      /* Add task bar */
      .add-task-bar {
        margin-top: 12px; display: flex; gap: 8px;
      }
      .add-task-bar input {
        flex: 1; padding: 8px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); font-size: 14px;
        background: var(--bg, #fff); color: var(--text, #212121);
      }

      /* Alert card (logbook entries) */
      .alert-card {
        display: flex; align-items: flex-start; gap: 12px; padding: 12px;
        border-radius: var(--radius, 8px); margin-bottom: 8px;
      }
      .alert-card.alert-info {
        background: var(--bg-secondary, #f5f7fa);
        border: 1px solid var(--border, #e0e0e0);
      }

      /* Filter bar */
      .filter-bar {
        margin-bottom: 12px;
      }
      .filter-bar select {
        padding: 6px 12px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); font-size: 13px;
        background: var(--bg, #fff); color: var(--text, #212121);
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
        .tab { padding: 8px 12px; font-size: 13px; }
      }
    </style>`;
  }

  // ─────────────── ACTION BINDING (event delegation) ───────────────
  _bindActions() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      // Tab switching
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this._currentTab = tab.dataset.tab;
        this.render();
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id || '';

      switch (action) {
        // Checklist
        case 'delete-check':
          this._deleteCheck(id);
          break;
        case 'add-check-task':
          this._addCheckTask();
          break;
        // Logbook
        case 'add-log':
          this._showLogForm(null);
          break;
        case 'edit-log':
          this._showLogForm(id);
          break;
        case 'delete-log':
          this._deleteLog(id);
          break;
        // Personnel
        case 'add-personnel':
          this._showPersonnelForm(null);
          break;
        case 'edit-personnel':
          this._showPersonnelForm(id);
          break;
        case 'delete-personnel':
          this._deletePersonnel(id);
          break;
      }
    });

    // Checkbox change for checklist items
    root.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-check-id]');
      if (cb) {
        this._toggleCheck(cb.dataset.checkId, cb.checked);
        return;
      }

      // Logbook category filter
      const filter = e.target.closest('[data-filter="log-cat"]');
      if (filter) {
        this._logFilterCat = filter.value;
        this.render();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CHECKLIST TAB
  // ═══════════════════════════════════════════════════════════════
  _renderChecklist(D) {
    const today = todayStr();
    let todayItems = D.checklist.filter(c => c.date === today);

    // Seed from default checklist if empty for today
    if (!todayItems.length && D.settings.defaultChecklist) {
      D.settings.defaultChecklist.forEach(task => {
        D.checklist.push({ id: genId(), date: today, task, done: false });
      });
      todayItems = D.checklist.filter(c => c.date === today);
      Store.save(D);
    }

    const done = todayItems.filter(c => c.done).length;
    const total = todayItems.length;

    let h = `<div class="kpi-grid">${kpi(
      t('ops_done'),
      done + '/' + total,
      total > 0 ? fmtNum(done / total * 100, 0) + '%' : '',
      done === total && total > 0 ? '' : 'warning'
    )}</div>`;

    h += `<div class="card"><h3>${t('ops_checklist')} \u2014 ${fmtDate(today)}</h3>`;
    todayItems.forEach(c => {
      h += `<div class="checklist-item${c.done ? ' done' : ''}">
        <input type="checkbox" ${c.done ? 'checked' : ''} data-check-id="${escapeAttr(c.id)}">
        <span>${t(c.task) || sanitizeHTML(c.task)}</span>
        <button class="btn btn-danger btn-sm" style="margin-left:auto" data-action="delete-check" data-id="${escapeAttr(c.id)}">\u2715</button>
      </div>`;
    });

    h += `<div class="add-task-bar">
      <input id="new-task" placeholder="${escapeAttr(t('ops_task'))}">
      <button class="btn btn-primary btn-sm" data-action="add-check-task">${t('add')}</button>
    </div></div>`;

    // History (last 7 days)
    const dates = [...new Set(D.checklist.map(c => c.date))].sort().reverse()
      .filter(d => d !== today).slice(0, 7);
    if (dates.length) {
      h += '<div class="card"><h3>' + t('history') + '</h3>';
      dates.forEach(d => {
        const items = D.checklist.filter(c => c.date === d);
        const dn = items.filter(c => c.done).length;
        h += `<div class="stat-row">
          <span class="stat-label">${fmtDate(d)}</span>
          <span class="stat-value">${dn}/${items.length} (${items.length > 0 ? fmtNum(dn / items.length * 100, 0) : 0}%)</span>
        </div>`;
      });
      h += '</div>';
    }

    return h;
  }

  _toggleCheck(id, done) {
    const D = Store.get();
    const c = D.checklist.find(x => x.id === id);
    if (c) {
      c.done = done;
      logAudit('update', 'operations', 'Toggle checklist: ' + (c.task || id), null, { id, done });
      Store.save(D);
      this.render();
    }
  }

  _deleteCheck(id) {
    const D = Store.get();
    D.checklist = D.checklist.filter(c => c.id !== id);
    logAudit('delete', 'operations', 'Delete checklist item', { id }, null);
    Store.save(D);
    this.render();
  }

  _addCheckTask() {
    const input = this.shadowRoot.querySelector('#new-task');
    const v = input ? input.value.trim() : '';
    if (!v) return;
    const D = Store.get();
    D.checklist.push({ id: genId(), date: todayStr(), task: v, done: false });
    logAudit('create', 'operations', 'Add checklist task: ' + v, null, { task: v });
    Store.save(D);
    this.render();
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOGBOOK TAB
  // ═══════════════════════════════════════════════════════════════
  _renderLogbook(D) {
    let h = `<div class="page-header" style="margin-bottom:12px">
      <h3>${t('ops_logbook')}</h3>
      <button class="btn btn-primary btn-sm" data-action="add-log">${t('ops_log_add')}</button>
    </div>`;

    if (!D.logbook.length) return h + emptyState('\uD83D\uDCD3', t('no_data'));

    h += `<div class="filter-bar">
      <select data-filter="log-cat">
        <option value="">${t('all')}</option>
        ${LOG_CATEGORIES.map(c => `<option value="${escapeAttr(c)}"${this._logFilterCat === c ? ' selected' : ''}>${t('ops_log_cat_' + c)}</option>`).join('')}
      </select>
    </div>`;

    let logs = [...D.logbook].sort((a, b) => b.date.localeCompare(a.date));
    if (this._logFilterCat) logs = logs.filter(l => l.category === this._logFilterCat);

    h += '<div class="card">';
    logs.forEach(l => {
      h += `<div class="alert-card alert-info" style="flex-wrap:wrap">
        <div style="flex:1">
          <strong>${fmtDate(l.date)}</strong> \u2014
          <span class="badge badge-info">${t('ops_log_cat_' + l.category) || sanitizeHTML(l.category)}</span>
          <p style="margin-top:4px">${sanitizeHTML(l.entry)}</p>
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" data-action="edit-log" data-id="${escapeAttr(l.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-log" data-id="${escapeAttr(l.id)}">${t('delete')}</button>
        </div>
      </div>`;
    });
    h += '</div>';
    return h;
  }

  _showLogForm(id) {
    this._editId = id || '';
    const D = Store.get();
    const l = id ? D.logbook.find(x => x.id === id) : null;

    const body = `
<div class="form-row">
  <div class="form-group">
    <label>${t('date')}</label>
    <input type="date" id="lg-date" value="${l ? l.date : todayStr()}">
  </div>
  <div class="form-group">
    <label>${t('ops_log_category')}</label>
    <select id="lg-cat">${LOG_CATEGORIES.map(c =>
      `<option value="${escapeAttr(c)}"${l && l.category === c ? ' selected' : ''}>${t('ops_log_cat_' + c)}</option>`
    ).join('')}</select>
  </div>
</div>
<div class="form-group">
  <label>${t('ops_log_entry')}</label>
  <textarea id="lg-entry" rows="4">${l ? escapeAttr(l.entry || '') : ''}</textarea>
</div>
<div class="modal-footer">
  <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
  <button class="btn btn-primary" data-action="save-log">${t('save')}</button>
</div>`;

    Bus.emit('modal:open', {
      title: l ? t('edit') : t('ops_log_add'),
      body
    });
  }

  _saveLog(id) {
    clearFieldErrors();
    const o = {
      date: modalVal('lg-date'),
      category: modalVal('lg-cat'),
      entry: modalVal('lg-entry')
    };

    const v = validateForm({
      'lg-date': { value: o.date, rules: { required: true, date: true } },
      'lg-cat': { value: o.category, rules: { required: true } },
      'lg-entry': { value: o.entry, rules: { required: true, maxLength: 2000 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    const D = Store.get();
    if (id) {
      const i = D.logbook.findIndex(l => l.id === id);
      if (i >= 0) {
        logAudit('update', 'operations', 'Edit logbook entry', D.logbook[i], o);
        D.logbook[i] = { ...D.logbook[i], ...o };
      }
    } else {
      o.id = genId();
      D.logbook.push(o);
      logAudit('create', 'operations', 'New logbook entry', null, o);
    }
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteLog(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    const old = D.logbook.find(l => l.id === id);
    logAudit('delete', 'operations', 'Delete logbook entry', old, null);
    D.logbook = D.logbook.filter(l => l.id !== id);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PERSONNEL TAB
  // ═══════════════════════════════════════════════════════════════
  _renderPersonnel(D) {
    if (!D.personnel.length) {
      let h = `<div class="page-header" style="margin-bottom:12px">
        <h3>${t('ops_personnel')}</h3>
        <button class="btn btn-primary btn-sm" data-action="add-personnel">${t('ops_per_add')}</button>
      </div>`;
      return h + emptyState('\uD83D\uDC77', t('no_data'));
    }

    const totalSalary = D.personnel.filter(p => p.active).reduce((s, p) => s + (p.salary || 0), 0);
    const activeCount = D.personnel.filter(p => p.active).length;

    return DataTable.create({
      id: 'personnel',
      data: D.personnel,
      emptyIcon: '\uD83D\uDC77',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px">
        <h3>${t('ops_personnel')}</h3>
        <button class="btn btn-primary btn-sm" data-action="add-personnel">${t('ops_per_add')}</button>
      </div>`,
      kpiHtml: `<div class="kpi-grid">${kpi(t('total_salaries'), fmtMoney(totalSalary), activeCount + ' ' + t('active').toLowerCase())}</div>`,
      columns: [
        {
          key: 'name', label: t('ops_per_name'), type: 'text', sortable: true, filterable: true,
          render: r => '<strong>' + sanitizeHTML(r.name) + '</strong>'
        },
        {
          key: 'role', label: t('ops_per_role'), type: 'text', sortable: true, filterable: true,
          filterType: 'select',
          filterOptions: [...new Set(D.personnel.map(p => p.role).filter(Boolean))].map(v => ({ value: v, label: v })),
          render: r => sanitizeHTML(r.role || '-')
        },
        {
          key: 'salary', label: t('ops_per_salary'), type: 'number', sortable: true,
          render: r => fmtMoney(r.salary || 0)
        },
        {
          key: 'startDate', label: t('ops_per_start'), type: 'date', sortable: true,
          filterable: true, filterType: 'date-range'
        },
        {
          key: 'active', label: t('ops_per_active'), type: 'text', sortable: true,
          filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'true', label: t('active') },
            { value: 'false', label: t('inactive') }
          ],
          getValue: r => String(!!r.active),
          render: r => r.active
            ? '<span class="badge badge-success">' + t('active') + '</span>'
            : '<span class="badge badge-secondary">' + t('inactive') + '</span>'
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="edit-personnel" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-personnel" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [
        {
          label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
          action: ids => this._bulkDeletePersonnel(ids)
        }
      ]
    });
  }

  _showPersonnelForm(id) {
    this._editId = id || '';
    const D = Store.get();
    const p = id ? D.personnel.find(x => x.id === id) : null;

    const body = `
<div class="form-row">
  <div class="form-group">
    <label>${t('ops_per_name')}</label>
    <input id="pe-name" value="${p ? escapeAttr(p.name) : ''}">
  </div>
  <div class="form-group">
    <label>${t('ops_per_role')}</label>
    <select id="pe-role">${catalogSelect(CATALOGS.personnelRoles, p ? p.role || '' : '')}</select>
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('ops_per_salary')}</label>
    <input type="number" id="pe-salary" value="${p ? p.salary || '' : ''}" min="0">
  </div>
  <div class="form-group">
    <label>${t('ops_per_start')}</label>
    <input type="date" id="pe-start" value="${p ? p.startDate || '' : ''}">
  </div>
</div>
<div class="form-group">
  <label>${t('ops_per_active')}</label>
  <select id="pe-active">
    <option value="1"${!p || p.active ? ' selected' : ''}>${t('active')}</option>
    <option value="0"${p && !p.active ? ' selected' : ''}>${t('inactive')}</option>
  </select>
</div>
<div class="form-group">
  <label>${t('notes')}</label>
  <textarea id="pe-notes">${p ? escapeAttr(p.notes || '') : ''}</textarea>
</div>
<div class="modal-footer">
  <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
  <button class="btn btn-primary" data-action="save-personnel">${t('save')}</button>
</div>`;

    Bus.emit('modal:open', {
      title: p ? t('edit') : t('ops_per_add'),
      body
    });
  }

  _savePersonnel(id) {
    clearFieldErrors();
    const o = {
      name: modalVal('pe-name'),
      role: modalVal('pe-role'),
      salary: parseFloat(modalVal('pe-salary')) || 0,
      startDate: modalVal('pe-start'),
      active: modalVal('pe-active') === '1',
      notes: modalVal('pe-notes')
    };

    const v = validateForm({
      'pe-name': { value: o.name, rules: { required: true, maxLength: 100 } },
      'pe-role': { value: o.role, rules: { required: true } },
      'pe-salary': { value: modalVal('pe-salary'), rules: { numeric: true, min: 0 } },
      'pe-start': { value: o.startDate, rules: { required: true, date: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    const D = Store.get();
    if (id) {
      const i = D.personnel.findIndex(p => p.id === id);
      if (i >= 0) {
        logAudit('update', 'operations', 'Edit personnel', D.personnel[i], o);
        D.personnel[i] = { ...D.personnel[i], ...o };
      }
    } else {
      o.id = genId();
      D.personnel.push(o);
      logAudit('create', 'operations', 'New personnel: ' + o.name, null, o);
    }
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deletePersonnel(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    const old = D.personnel.find(p => p.id === id);
    logAudit('delete', 'operations', 'Delete personnel', old, null);
    D.personnel = D.personnel.filter(p => p.id !== id);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _bulkDeletePersonnel(ids) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    ids.forEach(id => {
      const old = D.personnel.find(p => p.id === id);
      if (old) logAudit('delete', 'operations', 'Bulk delete personnel', old, null);
    });
    D.personnel = D.personnel.filter(p => !ids.includes(p.id));
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    DataTable.reset('personnel');
    this.render();
  }
}

customElements.define('egg-operations', EggOperations);
export { EggOperations };
