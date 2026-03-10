// <egg-inventory> — Egg Inventory Web Component
// Replaces monolith renderInventory(), filterInventory()

import {
  Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate,
  emptyState, flockSelect, paginate
} from '../core/index.js';
import { kpi } from '../core/helpers.js';

const PAGE_SIZE = 50;
const EGG_TYPES = ['S', 'M', 'L', 'XL', 'Jumbo'];

class EggInventory extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._page = 1;
    this._filters = { flockId: '', eggType: '', from: '', to: '' };
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() {}

  // ─────────────── RENDER ───────────────
  render() {
    const D = Store.get();
    let h = this._styles();

    h += `<div class="page-header"><h2>\uD83D\uDCE6 ${t('nav_inventory') || 'Inventario'}</h2></div>`;

    // Compute running balances
    const sorted = [...D.inventory].sort((a, b) => a.date.localeCompare(b.date));
    const totIn = sorted.reduce((s, r) => s + (r.qtyIn || 0), 0);
    const totOut = sorted.reduce((s, r) => s + (r.qtyOut || 0), 0);
    const balance = totIn - totOut;

    // Per egg-type balances
    const byType = {};
    sorted.forEach(r => {
      const tp = r.eggType || 'M';
      if (!byType[tp]) byType[tp] = { in: 0, out: 0 };
      byType[tp].in += (r.qtyIn || 0);
      byType[tp].out += (r.qtyOut || 0);
    });

    // KPI cards
    h += '<div class="kpi-grid">';
    h += kpi(t('inv_total_in') || 'Total In', fmtNum(totIn), '', '', t('info_inv_in'));
    h += kpi(t('inv_total_out') || 'Total Out', fmtNum(totOut), '', '', t('info_inv_out'));
    h += kpi(
      t('inv_balance') || 'Balance',
      fmtNum(balance), '',
      balance < 0 ? 'danger' : balance < 100 ? 'warning' : '',
      t('info_inv_balance')
    );
    h += kpi(t('inv_records') || 'Records', fmtNum(sorted.length), '', '', t('info_inv_records'));
    h += '</div>';

    // Per-type breakdown table
    if (Object.keys(byType).length) {
      h += '<div class="card"><h3>' + (t('inv_by_type') || 'By Egg Type') + '</h3><div class="table-wrap"><table><thead><tr>';
      h += `<th>${t('fin_egg_type') || 'Type'}</th><th>${t('inv_total_in') || 'In'}</th><th>${t('inv_total_out') || 'Out'}</th><th>${t('inv_balance') || 'Balance'}</th>`;
      h += '</tr></thead><tbody>';
      EGG_TYPES.forEach(tp => {
        if (!byType[tp]) return;
        const b = byType[tp];
        const bal = b.in - b.out;
        h += `<tr><td><strong>${tp}</strong></td><td>${fmtNum(b.in)}</td><td>${fmtNum(b.out)}</td>
        <td style="font-weight:700;color:${bal < 0 ? 'var(--danger)' : 'var(--success)'}">${fmtNum(bal)}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // Filter bar
    h += `<div class="filter-bar">
      <select data-filter="flockId">
        <option value="">${t('all') || 'All'}</option>
        ${D.flocks.map(f => '<option value="' + escapeAttr(f.id) + '"' + (this._filters.flockId === f.id ? ' selected' : '') + '>' + sanitizeHTML(f.name) + '</option>').join('')}
      </select>
      <select data-filter="eggType">
        <option value="">${t('all') || 'All'}</option>
        ${EGG_TYPES.map(tp => '<option value="' + tp + '"' + (this._filters.eggType === tp ? ' selected' : '') + '>' + tp + '</option>').join('')}
      </select>
      <input type="date" data-filter="from" value="${escapeAttr(this._filters.from)}">
      <input type="date" data-filter="to" value="${escapeAttr(this._filters.to)}">
    </div>`;

    // Filtered table
    h += '<div id="inv-table">';
    h += this._renderTable(D);
    h += '</div>';

    this.shadowRoot.innerHTML = h;
  }

  // ─────────────── FILTERED TABLE ───────────────
  _renderTable(D) {
    let recs = [...D.inventory].sort((a, b) => b.date.localeCompare(a.date));
    const f = this._filters;
    if (f.flockId) recs = recs.filter(r => r.flockId === f.flockId);
    if (f.eggType) recs = recs.filter(r => r.eggType === f.eggType);
    if (f.from) recs = recs.filter(r => r.date >= f.from);
    if (f.to) recs = recs.filter(r => r.date <= f.to);

    const pg = paginate(recs, this._page, PAGE_SIZE);

    let h = '<div class="card"><div class="table-wrap"><table><thead><tr>';
    h += `<th>${t('date')}</th><th>${t('prod_flock') || 'Flock'}</th><th>${t('fin_egg_type') || 'Type'}</th>`;
    h += `<th>${t('inv_total_in') || 'In'}</th><th>${t('inv_total_out') || 'Out'}</th><th>${t('source') || 'Source'}</th>`;
    h += '</tr></thead><tbody>';

    if (!pg.items.length) {
      h += `<tr><td colspan="6" style="text-align:center;color:var(--text-light)">${t('no_data')}</td></tr>`;
    }

    pg.items.forEach(r => {
      const fl = D.flocks.find(x => x.id === r.flockId);
      h += `<tr>
        <td>${fmtDate(r.date)}</td>
        <td>${fl ? sanitizeHTML(fl.name) : '-'}</td>
        <td>${r.eggType || '-'}</td>
        <td style="color:var(--success)">${r.qtyIn ? '+' + fmtNum(r.qtyIn) : '-'}</td>
        <td style="color:var(--danger)">${r.qtyOut ? '-' + fmtNum(r.qtyOut) : '-'}</td>
        <td>${sanitizeHTML(r.source || '-')}</td>
      </tr>`;
    });

    h += '</tbody></table></div></div>';

    // Pagination
    if (pg.totalPages > 1) {
      h += '<div class="dt-pagination">';
      h += `<span>${t('page') || 'Page'} ${pg.page} / ${pg.totalPages}</span>`;
      h += '<div class="dt-page-buttons">';
      if (pg.page > 1) {
        h += `<button class="btn btn-sm btn-secondary" data-page="${pg.page - 1}">&laquo; ${t('prev') || 'Prev'}</button>`;
      }
      if (pg.page < pg.totalPages) {
        h += `<button class="btn btn-sm btn-secondary" data-page="${pg.page + 1}">${t('next') || 'Next'} &raquo;</button>`;
      }
      h += '</div></div>';
    }

    return h;
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
      const btn = e.target.closest('[data-page]');
      if (btn) {
        this._page = parseInt(btn.dataset.page, 10);
        this._refreshTable();
      }
    });
  }

  _refreshTable() {
    const D = Store.get();
    const container = this.shadowRoot.querySelector('#inv-table');
    if (container) {
      container.innerHTML = this._renderTable(D);
    }
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

      /* KPI Grid */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 12px; margin-bottom: 16px;
      }
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
      .btn-primary { background: var(--primary, #4a7c59); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #C62828); color: #fff; border: none; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }

      /* Card */
      .card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }
      .card h3 { margin: 0 0 12px 0; color: var(--primary-dark, #0E2240); font-size: 15px; }

      /* Table */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }

      /* Filter bar */
      .filter-bar {
        display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center;
      }
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

      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
        .filter-bar { flex-direction: column; }
        .filter-bar select, .filter-bar input { width: 100%; }
      }
    </style>`;
  }
}

customElements.define('egg-inventory', EggInventory);
export { EggInventory };
