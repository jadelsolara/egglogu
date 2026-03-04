/**
 * EGGlogU — Inventory Module
 * Egg inventory tracking: in/out movements, per-type balances, filters.
 * Ported from egglogu.js lines 3720-3769.
 *
 * NEW module — did not exist in frontend/src/modules/ before Month 2.
 */

import { genId, todayStr, fmtNum, fmtDate, $ } from '@core/utils.js';
import { sanitizeHTML, escapeAttr } from '@core/security.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';
import { registerRoute } from '@core/route-bridge.js';
import { kpi, emptyState, paginate, paginationControls, flockSelect } from '@core/render-utils.js';

// ── Page State ──────────────────────────────────────────

if (!window.__pageState) window.__pageState = {};

// ── Render Entry Point ──────────────────────────────────

export function render() {
  const D = window.loadData();
  let h = `<div class="page-header"><h2>📦 ${t('nav_inventory') || 'Inventario'}</h2></div>`;

  // Compute running balances
  const sorted = [...(D.inventory || [])].sort((a, b) => a.date.localeCompare(b.date));
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

  // KPIs
  h += '<div class="kpi-grid">';
  h += kpi(t('inv_total_in') || 'Total In', fmtNum(totIn), '', '', t('info_inv_in'));
  h += kpi(t('inv_total_out') || 'Total Out', fmtNum(totOut), '', '', t('info_inv_out'));
  h += kpi(t('inv_balance') || 'Balance', fmtNum(balance), '', balance < 0 ? 'danger' : balance < 100 ? 'warning' : '', t('info_inv_balance'));
  h += kpi(t('inv_records') || 'Records', fmtNum(sorted.length), '', '', t('info_inv_records'));
  h += '</div>';

  // Per-type breakdown table
  if (Object.keys(byType).length) {
    h += '<div class="card"><h3>' + (t('inv_by_type') || 'By Egg Type') + '</h3><div class="table-wrap"><table><thead><tr>';
    h += `<th>${t('fin_egg_type') || 'Type'}</th><th>${t('inv_total_in') || 'In'}</th><th>${t('inv_total_out') || 'Out'}</th><th>${t('inv_balance') || 'Balance'}</th>`;
    h += '</tr></thead><tbody>';
    ['S', 'M', 'L', 'XL', 'Jumbo'].forEach(tp => {
      if (!byType[tp]) return;
      const b = byType[tp];
      h += `<tr><td><strong>${tp}</strong></td><td>${fmtNum(b.in)}</td><td>${fmtNum(b.out)}</td><td style="font-weight:700;color:${(b.in - b.out) < 0 ? 'var(--danger)' : 'var(--success)'}">${fmtNum(b.in - b.out)}</td></tr>`;
    });
    h += '</tbody></table></div></div>';
  }

  // Filters
  h += `<div class="filter-bar">
    <select onchange="window.EGGlogU.Inventory.filterTable()" id="inv-flock">
      <option value="">${t('all') || 'All'}</option>${D.flocks.map(f => '<option value="' + escapeAttr(f.id) + '">' + sanitizeHTML(f.name) + '</option>').join('')}
    </select>
    <select onchange="window.EGGlogU.Inventory.filterTable()" id="inv-type">
      <option value="">${t('all') || 'All'}</option><option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option><option value="Jumbo">Jumbo</option>
    </select>
    <input type="date" id="inv-from" onchange="window.EGGlogU.Inventory.filterTable()">
    <input type="date" id="inv-to" onchange="window.EGGlogU.Inventory.filterTable()">
  </div>`;

  h += '<div id="inv-table"></div>';
  $('sec-inventario').innerHTML = h;
  filterTable();
}

// ── Filtered Table ──────────────────────────────────────

export function filterTable() {
  const D = window.loadData();
  const fid = $('inv-flock')?.value || '';
  const tp = $('inv-type')?.value || '';
  const fr = $('inv-from')?.value || '';
  const to = $('inv-to')?.value || '';

  let recs = [...(D.inventory || [])].sort((a, b) => b.date.localeCompare(a.date));
  if (fid) recs = recs.filter(r => r.flockId === fid);
  if (tp) recs = recs.filter(r => r.eggType === tp);
  if (fr) recs = recs.filter(r => r.date >= fr);
  if (to) recs = recs.filter(r => r.date <= to);

  const pg = paginate(recs, window.__pageState.inventory || 1);

  let h = '<div class="card"><div class="table-wrap"><table><thead><tr>';
  h += `<th>${t('date')}</th><th>${t('prod_flock') || 'Flock'}</th><th>${t('fin_egg_type') || 'Type'}</th><th>${t('inv_total_in') || 'In'}</th><th>${t('inv_total_out') || 'Out'}</th><th>${t('source') || 'Source'}</th></tr></thead><tbody>`;

  if (!pg.items.length) {
    h += `<tr><td colspan="6" style="text-align:center;color:var(--text-light)">${t('no_data')}</td></tr>`;
  }

  pg.items.forEach(r => {
    const f = D.flocks.find(x => x.id === r.flockId);
    h += `<tr><td>${fmtDate(r.date)}</td><td>${f ? sanitizeHTML(f.name) : '-'}</td><td>${r.eggType || '-'}</td>
      <td style="color:var(--success)">${r.qtyIn ? '+' + fmtNum(r.qtyIn) : '-'}</td>
      <td style="color:var(--danger)">${r.qtyOut ? '-' + fmtNum(r.qtyOut) : '-'}</td>
      <td>${sanitizeHTML(r.source || '-')}</td></tr>`;
  });

  h += '</tbody></table></div></div>';
  h += paginationControls('inventory', pg.page, pg.totalPages, 'window.EGGlogU.Inventory.filterTable');

  const w = $('inv-table');
  if (w) w.innerHTML = h;
}

// ── Data Helpers ────────────────────────────────────────

export function getBalances() {
  const data = getData();
  const inv = data.inventory || [];
  const totIn = inv.reduce((s, r) => s + (r.qtyIn || 0), 0);
  const totOut = inv.reduce((s, r) => s + (r.qtyOut || 0), 0);
  return { totalIn: totIn, totalOut: totOut, balance: totIn - totOut };
}

export function getBalancesByType() {
  const data = getData();
  const byType = {};
  (data.inventory || []).forEach(r => {
    const tp = r.eggType || 'M';
    if (!byType[tp]) byType[tp] = { in: 0, out: 0 };
    byType[tp].in += (r.qtyIn || 0);
    byType[tp].out += (r.qtyOut || 0);
  });
  return byType;
}

export function addMovement(movement) {
  const data = getData();
  if (!data.inventory) data.inventory = [];
  const record = {
    id: genId(),
    date: movement.date || todayStr(),
    flockId: movement.flockId || '',
    eggType: movement.eggType || 'M',
    qtyIn: parseFloat(movement.qtyIn) || 0,
    qtyOut: parseFloat(movement.qtyOut) || 0,
    source: movement.source || '',
    createdAt: new Date().toISOString()
  };
  data.inventory.push(record);
  saveData();
  return record;
}

// ── Backward compatibility ──────────────────────────────

window.filterInventory = filterTable;

// ── Register Route ──────────────────────────────────────

registerRoute('inventario', render);
