// EGGlogU DataTable Engine v2.0 — ES Module
// Config-driven data tables: sort, filter, paginate, bulk actions, export, column toggle, mobile cards.

import { t } from './i18n.js';
import { sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr } from './utils.js';
import { Store } from './store.js';
import { Bus } from './bus.js';

const _state = {};

function _newState() {
  return { pageSize: 50, page: 1, sortCol: null, sortDir: 'asc', filters: {}, selectedIds: new Set(), visibleCols: null, search: '' };
}

function _getState(id) { if (!_state[id]) _state[id] = _newState(); return _state[id]; }
function _resetState(id) { _state[id] = _newState(); }

function _getCellValue(row, col) {
  if (col.getValue) return col.getValue(row);
  const keys = col.key.split('.');
  let v = row;
  for (const k of keys) { if (v == null) return null; v = v[k]; }
  return v;
}

function _formatCell(row, col) {
  if (col.render) return col.render(row);
  const v = _getCellValue(row, col);
  if (v == null || v === '') return '-';
  switch (col.type) {
    case 'date': return fmtDate(v);
    case 'number': return fmtNum(v);
    case 'money': return '<strong>' + fmtMoney(v) + '</strong>';
    case 'badge': return col.badgeRender ? col.badgeRender(v, row) : `<span class="badge">${sanitizeHTML(String(v))}</span>`;
    default: return sanitizeHTML(String(v));
  }
}

function _applyFilters(data, cols, filters) {
  Object.keys(filters).forEach(key => {
    const val = filters[key];
    if (val === '' || val == null) return;
    const col = cols.find(c => c.key === key);
    if (!col) return;
    const fType = col.filterType || (col.type === 'date' ? 'date-range' : col.type === 'number' || col.type === 'money' ? 'number-range' : 'text');
    if (fType === 'select') {
      data = data.filter(r => String(_getCellValue(r, col)) === String(val));
    } else if (fType === 'date-range') {
      if (val.from) data = data.filter(r => { const cv = _getCellValue(r, col); return cv && cv >= val.from; });
      if (val.to) data = data.filter(r => { const cv = _getCellValue(r, col); return cv && cv <= val.to; });
    } else if (fType === 'number-range') {
      if (val.min != null && val.min !== '') data = data.filter(r => (parseFloat(_getCellValue(r, col)) || 0) >= parseFloat(val.min));
      if (val.max != null && val.max !== '') data = data.filter(r => (parseFloat(_getCellValue(r, col)) || 0) <= parseFloat(val.max));
    } else {
      const q = String(val).toLowerCase();
      data = data.filter(r => { const cv = _getCellValue(r, col); return cv != null && String(cv).toLowerCase().includes(q); });
    }
  });
  return data;
}

// Store last config for export/bulk operations
const _lastConfigs = {};

function create(config) {
  _lastConfigs[config.id] = config;
  const id = config.id;
  const st = _getState(id);

  // Load saved column preferences
  const saved = _loadColPrefs(id);
  if (saved && !st._colsLoaded) { st.visibleCols = saved; st._colsLoaded = true; }

  if (config.pageSize && !st._pageSizeSet) { st.pageSize = config.pageSize; st._pageSizeSet = true; }
  const rowId = config.rowId || 'id';
  const showSearch = config.showSearch !== false;
  const showExport = config.showExport !== false;
  const showColPicker = config.showColumnPicker !== false;
  const showPagination = config.showPagination !== false;
  const showBulk = config.showBulk !== undefined ? config.showBulk : !!(config.bulkActions && config.bulkActions.length);
  const cols = config.columns.filter(c => !c.hidden);
  if (!st.visibleCols) st.visibleCols = cols.map(c => c.key);

  const visCols = cols.filter(c => st.visibleCols.includes(c.key));
  let data = config.data ? [...config.data] : [];

  if (config.preFilter) data = config.preFilter(data);

  // Search
  if (st.search && st.search.trim()) {
    const q = st.search.trim().toLowerCase();
    data = data.filter(row => visCols.some(c => { const v = _getCellValue(row, c); return v !== null && v !== undefined && String(v).toLowerCase().includes(q); }));
  }

  data = _applyFilters(data, visCols, st.filters);

  // Sort
  if (st.sortCol) {
    const col = visCols.find(c => c.key === st.sortCol);
    if (col) {
      const dir = st.sortDir === 'desc' ? -1 : 1;
      data.sort((a, b) => {
        let va = _getCellValue(a, col), vb = _getCellValue(b, col);
        if (va == null) va = ''; if (vb == null) vb = '';
        if (col.type === 'number' || col.type === 'money') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
        else if (col.type === 'date') { va = String(va); vb = String(vb); }
        else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }
  }

  const totalFiltered = data.length;

  let totalPages = 1, pageItems = data;
  if (showPagination) {
    totalPages = Math.max(1, Math.ceil(data.length / st.pageSize));
    st.page = Math.max(1, Math.min(st.page, totalPages));
    pageItems = data.slice((st.page - 1) * st.pageSize, st.page * st.pageSize);
  }

  let h = '';
  if (config.headerHtml) h += config.headerHtml;
  if (config.kpiHtml) h += config.kpiHtml;
  h += _buildToolbar(id, config, st, showSearch, showExport, showColPicker, cols, visCols, totalFiltered);
  if (showBulk && st.selectedIds.size > 0) h += _buildBulkBar(id, config, st);

  if (!pageItems.length) {
    if (totalFiltered === 0 && (config.data || []).length > 0) {
      h += `<div class="card" style="text-align:center;padding:40px;color:var(--text-light)"><div style="font-size:32px;margin-bottom:8px">🔍</div>${t('dt_no_results') || 'No results match your filters'}</div>`;
    } else {
      h += `<div class="card" style="text-align:center;padding:40px;color:var(--text-light)"><div style="font-size:32px;margin-bottom:8px">${config.emptyIcon || '📋'}</div>${sanitizeHTML(config.emptyText || t('no_data'))}</div>`;
    }
    return h;
  }

  h += `<div class="card dt-card-wrap"><div class="table-wrap dt-table-desktop"><table class="dt-table" data-dt-id="${escapeAttr(id)}"><thead><tr>`;
  if (showBulk) {
    const allChecked = pageItems.every(r => st.selectedIds.has(r[rowId]));
    h += `<th class="dt-th-check"><input type="checkbox" class="dt-checkbox" data-dt-action="toggleAll" data-dt-id="${escapeAttr(id)}" ${allChecked ? 'checked' : ''}></th>`;
  }

  visCols.forEach(c => {
    const sortable = c.sortable !== false;
    const isSorted = st.sortCol === c.key;
    const arrow = isSorted ? (st.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const cls = 'dt-th' + (sortable ? ' dt-sortable' : '') + (isSorted ? ' dt-sorted' : '');
    const wStyle = c.width ? `style="width:${c.width}"` : '';
    if (sortable) {
      h += `<th class="${cls}" ${wStyle} data-dt-action="sort" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}" role="columnheader" aria-sort="${isSorted ? st.sortDir : 'none'}">${sanitizeHTML(c.label)}${arrow}</th>`;
    } else {
      h += `<th class="${cls}" ${wStyle}>${sanitizeHTML(c.label)}</th>`;
    }
  });
  if (config.actions) h += `<th class="dt-th">${t('actions')}</th>`;
  h += '</tr>';

  // Filter row
  const hasFilters = visCols.some(c => c.filterable !== false);
  if (hasFilters) {
    h += '<tr class="dt-filter-row">';
    if (showBulk) h += '<td></td>';
    visCols.forEach(c => {
      h += '<td>';
      if (c.filterable === false) { h += '</td>'; return; }
      const fType = c.filterType || (c.type === 'date' ? 'date-range' : c.type === 'number' || c.type === 'money' ? 'number-range' : 'text');
      const fVal = st.filters[c.key];
      if (fType === 'select') {
        const opts = c.filterOptions || [];
        h += `<select class="dt-filter-select" data-dt-action="filter" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}">`;
        h += `<option value="">${t('all')}</option>`;
        opts.forEach(o => {
          const val = typeof o === 'object' ? o.value : o;
          const lbl = typeof o === 'object' ? o.label : o;
          h += `<option value="${escapeAttr(val)}"${fVal === val ? ' selected' : ''}>${sanitizeHTML(lbl)}</option>`;
        });
        h += '</select>';
      } else if (fType === 'date-range') {
        const fr = fVal && fVal.from ? fVal.from : '';
        const to = fVal && fVal.to ? fVal.to : '';
        h += `<input type="date" class="dt-filter-date" value="${fr}" data-dt-action="filterRange" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}" data-dt-bound="from">`;
        h += `<input type="date" class="dt-filter-date" value="${to}" data-dt-action="filterRange" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}" data-dt-bound="to">`;
      } else if (fType === 'number-range') {
        const mn = fVal && fVal.min != null ? fVal.min : '';
        const mx = fVal && fVal.max != null ? fVal.max : '';
        h += `<input type="number" class="dt-filter-num" placeholder="Min" value="${mn}" data-dt-action="filterRange" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}" data-dt-bound="min">`;
        h += `<input type="number" class="dt-filter-num" placeholder="Max" value="${mx}" data-dt-action="filterRange" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}" data-dt-bound="max">`;
      } else {
        h += `<input type="text" class="dt-filter-input" placeholder="${t('search')}..." value="${escapeAttr(fVal || '')}" data-dt-action="filterText" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}">`;
      }
      h += '</td>';
    });
    if (config.actions) h += '<td></td>';
    h += '</tr>';
  }

  h += '</thead><tbody>';
  pageItems.forEach(row => {
    const rid = row[rowId];
    const selected = showBulk && st.selectedIds.has(rid);
    h += `<tr class="${selected ? 'dt-row-selected' : ''}">`;
    if (showBulk) {
      h += `<td class="dt-td-check"><input type="checkbox" class="dt-checkbox" data-dt-action="toggleRow" data-dt-id="${escapeAttr(id)}" data-dt-row="${escapeAttr(rid)}" ${selected ? 'checked' : ''}></td>`;
    }
    visCols.forEach(c => { h += '<td>' + _formatCell(row, c) + '</td>'; });
    if (config.actions) h += '<td>' + config.actions(row) + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  h += _buildMobileCards(pageItems, visCols, config, st, showBulk, rowId);
  h += '</div>';

  if (showPagination && totalPages > 1) h += _buildPagination(id, st, totalPages, totalFiltered);
  else if (showPagination) h += `<div class="dt-footer-info">${t('dt_showing') || 'Showing'} ${totalFiltered} ${t('dt_records') || 'records'}</div>`;

  return h;
}

function _buildToolbar(id, config, st, showSearch, showExport, showColPicker, cols, visCols, totalFiltered) {
  let h = '<div class="dt-toolbar">';
  if (showSearch) {
    h += `<div class="dt-search"><input type="text" class="dt-search-input" placeholder="${t('search')}..." value="${escapeAttr(st.search || '')}" data-dt-action="search" data-dt-id="${escapeAttr(id)}"></div>`;
  }
  h += '<div class="dt-toolbar-right">';
  const activeFilters = Object.keys(st.filters).filter(k => { const v = st.filters[k]; if (typeof v === 'object') return (v.from || v.to || v.min != null || v.max != null); return v !== '' && v != null; }).length;
  if (activeFilters > 0 || st.search) {
    h += `<button class="btn btn-sm btn-secondary dt-btn" data-dt-action="clearFilters" data-dt-id="${escapeAttr(id)}" title="${t('dt_clear_filters') || 'Clear filters'}">✕ ${activeFilters > 0 ? activeFilters + ' ' + (t('dt_filters') || 'filters') : ''}${st.search ? (activeFilters > 0 ? ' + ' : '') + (t('search') || 'search') : ''}</button>`;
  }
  h += `<select class="dt-page-size" data-dt-action="pageSize" data-dt-id="${escapeAttr(id)}" title="${t('dt_per_page') || 'Per page'}">`;
  [25, 50, 100, 200].forEach(n => { h += `<option value="${n}"${st.pageSize === n ? ' selected' : ''}>${n}</option>`; });
  h += '</select>';
  if (showColPicker && cols.length > 3) {
    h += `<div class="dt-col-picker-wrap"><button class="btn btn-sm btn-secondary dt-btn" data-dt-action="toggleColPicker" data-dt-id="${escapeAttr(id)}" title="${t('dt_columns') || 'Columns'}">☰ ${t('dt_columns') || 'Columns'}</button>`;
    h += `<div class="dt-column-picker" id="dt-colpick-${escapeAttr(id)}" style="display:none">`;
    cols.forEach(c => {
      const checked = st.visibleCols.includes(c.key);
      h += `<label class="dt-col-option"><input type="checkbox" ${checked ? 'checked' : ''} data-dt-action="toggleCol" data-dt-id="${escapeAttr(id)}" data-dt-col="${escapeAttr(c.key)}"> ${sanitizeHTML(c.label)}</label>`;
    });
    h += '</div></div>';
  }
  if (showExport) {
    h += `<button class="btn btn-sm btn-secondary dt-btn" data-dt-action="exportCSV" data-dt-id="${escapeAttr(id)}" title="${t('dt_export_csv') || 'Export CSV'}">📄 CSV</button>`;
    h += `<button class="btn btn-sm btn-secondary dt-btn" data-dt-action="exportExcel" data-dt-id="${escapeAttr(id)}" title="${t('dt_export_excel') || 'Export Excel'}">📊 Excel</button>`;
  }
  h += '</div></div>';
  return h;
}

function _buildBulkBar(id, config, st) {
  const count = st.selectedIds.size;
  let h = `<div class="dt-bulk-bar"><span class="dt-bulk-count">${count} ${t('dt_selected') || 'selected'}</span><div class="dt-bulk-actions">`;
  if (config.bulkActions) {
    config.bulkActions.forEach((ba, i) => {
      const cls = ba.danger ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-secondary';
      h += `<button class="${cls}" data-dt-action="bulk" data-dt-id="${escapeAttr(id)}" data-dt-idx="${i}">${ba.icon || ''}${ba.icon ? ' ' : ''}${sanitizeHTML(ba.label)}</button>`;
    });
  }
  h += `<button class="btn btn-sm btn-secondary" data-dt-action="clearSelection" data-dt-id="${escapeAttr(id)}">${t('dt_deselect') || 'Deselect all'}</button>`;
  h += '</div></div>';
  return h;
}

function _buildMobileCards(items, visCols, config, st, showBulk, rowId) {
  if (!items.length) return '';
  let h = '<div class="dt-mobile-cards">';
  items.forEach(row => {
    const rid = row[rowId];
    const selected = showBulk && st.selectedIds.has(rid);
    if (config.cardRender) {
      h += config.cardRender(row, visCols);
    } else {
      h += `<div class="dt-card${selected ? ' dt-card-selected' : ''}">`;
      if (showBulk) {
        h += `<div class="dt-card-check"><input type="checkbox" class="dt-checkbox" ${selected ? 'checked' : ''} data-dt-action="toggleRow" data-dt-id="${escapeAttr(config.id)}" data-dt-row="${escapeAttr(rid)}"></div>`;
      }
      h += '<div class="dt-card-body">';
      visCols.forEach((c, i) => {
        const val = _formatCell(row, c);
        if (i === 0) h += `<div class="dt-card-title">${val}</div>`;
        else h += `<div class="dt-card-field"><span class="dt-card-label">${sanitizeHTML(c.label)}</span><span class="dt-card-value">${val}</span></div>`;
      });
      if (config.actions) h += `<div class="dt-card-actions">${config.actions(row)}</div>`;
      h += '</div></div>';
    }
  });
  h += '</div>';
  return h;
}

function _buildPagination(id, st, totalPages, totalFiltered) {
  let h = `<div class="dt-pagination"><span class="dt-page-info">${t('dt_showing') || 'Showing'} ${((st.page - 1) * st.pageSize) + 1}-${Math.min(st.page * st.pageSize, totalFiltered)} ${t('dt_of') || 'of'} ${totalFiltered}</span>`;
  h += '<div class="dt-page-buttons">';
  h += `<button class="btn btn-sm btn-secondary" data-dt-action="goPage" data-dt-id="${escapeAttr(id)}" data-dt-page="1" ${st.page <= 1 ? 'disabled' : ''}>&laquo;</button>`;
  h += `<button class="btn btn-sm btn-secondary" data-dt-action="goPage" data-dt-id="${escapeAttr(id)}" data-dt-page="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>◀</button>`;
  const start = Math.max(1, st.page - 2);
  const end = Math.min(totalPages, st.page + 2);
  for (let i = start; i <= end; i++) {
    h += `<button class="btn btn-sm ${i === st.page ? 'btn-primary' : 'btn-secondary'}" data-dt-action="goPage" data-dt-id="${escapeAttr(id)}" data-dt-page="${i}">${i}</button>`;
  }
  h += `<button class="btn btn-sm btn-secondary" data-dt-action="goPage" data-dt-id="${escapeAttr(id)}" data-dt-page="${st.page + 1}" ${st.page >= totalPages ? 'disabled' : ''}>▶</button>`;
  h += `<button class="btn btn-sm btn-secondary" data-dt-action="goPage" data-dt-id="${escapeAttr(id)}" data-dt-page="${totalPages}" ${st.page >= totalPages ? 'disabled' : ''}>&raquo;</button>`;
  h += '</div></div>';
  return h;
}

function _saveColPrefs(id, cols) {
  try {
    const D = Store.get();
    if (D && D.settings) {
      if (!D.settings.tablePrefs) D.settings.tablePrefs = {};
      D.settings.tablePrefs[id] = cols;
      Store.save(D);
    }
  } catch (e) {}
}

function _loadColPrefs(id) {
  try {
    const D = Store.get();
    if (D && D.settings && D.settings.tablePrefs && D.settings.tablePrefs[id]) return D.settings.tablePrefs[id];
  } catch (e) {}
  return null;
}

// ─── Event delegation handler — attach to root container ───
const _debounceTimers = {};

function handleEvent(root, refreshFn) {
  root.addEventListener('change', e => {
    const el = e.target;
    const action = el.dataset.dtAction;
    const id = el.dataset.dtId;
    if (!action || !id) return;
    const st = _getState(id);

    if (action === 'toggleAll') {
      const table = root.querySelector(`table[data-dt-id="${id}"]`);
      if (table) {
        table.querySelectorAll('tbody [data-dt-action="toggleRow"]').forEach(cb => {
          const rid = cb.dataset.dtRow;
          if (el.checked) st.selectedIds.add(rid); else st.selectedIds.delete(rid);
        });
      }
      refreshFn();
    } else if (action === 'toggleRow') {
      if (el.checked) st.selectedIds.add(el.dataset.dtRow); else st.selectedIds.delete(el.dataset.dtRow);
      refreshFn();
    } else if (action === 'toggleCol') {
      const colKey = el.dataset.dtCol;
      if (el.checked) { if (!st.visibleCols.includes(colKey)) st.visibleCols.push(colKey); }
      else { st.visibleCols = st.visibleCols.filter(k => k !== colKey); }
      _saveColPrefs(id, st.visibleCols);
      refreshFn();
    } else if (action === 'filter') {
      st.filters[el.dataset.dtCol] = el.value;
      st.page = 1;
      refreshFn();
    } else if (action === 'filterRange') {
      const col = el.dataset.dtCol;
      const bound = el.dataset.dtBound;
      if (!st.filters[col] || typeof st.filters[col] !== 'object') st.filters[col] = {};
      if (el.value === '' || el.value == null) { delete st.filters[col][bound]; if (!Object.keys(st.filters[col]).length) delete st.filters[col]; }
      else st.filters[col][bound] = el.value;
      st.page = 1;
      refreshFn();
    } else if (action === 'pageSize') {
      st.pageSize = parseInt(el.value) || 50;
      st.page = 1;
      refreshFn();
    }
  });

  root.addEventListener('input', e => {
    const el = e.target;
    const action = el.dataset.dtAction;
    const id = el.dataset.dtId;
    if (!action || !id) return;
    const st = _getState(id);

    if (action === 'search') {
      st.search = el.value;
      st.page = 1;
      clearTimeout(_debounceTimers[id]);
      _debounceTimers[id] = setTimeout(refreshFn, 250);
    } else if (action === 'filterText') {
      st.filters[el.dataset.dtCol] = el.value;
      st.page = 1;
      clearTimeout(_debounceTimers[id + '_f']);
      _debounceTimers[id + '_f'] = setTimeout(refreshFn, 250);
    }
  });

  root.addEventListener('click', e => {
    const el = e.target.closest('[data-dt-action]');
    if (!el) return;
    const action = el.dataset.dtAction;
    const id = el.dataset.dtId;
    if (!action || !id) return;
    const st = _getState(id);

    if (action === 'sort') {
      const colKey = el.dataset.dtCol;
      if (st.sortCol === colKey) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
      else { st.sortCol = colKey; st.sortDir = 'asc'; }
      st.page = 1;
      refreshFn();
    } else if (action === 'clearFilters') {
      st.filters = {};
      st.search = '';
      st.page = 1;
      refreshFn();
    } else if (action === 'goPage') {
      st.page = Math.max(1, parseInt(el.dataset.dtPage));
      refreshFn();
    } else if (action === 'clearSelection') {
      st.selectedIds.clear();
      refreshFn();
    } else if (action === 'toggleColPicker') {
      const picker = root.querySelector('#dt-colpick-' + id);
      if (picker) picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    } else if (action === 'bulk') {
      const idx = parseInt(el.dataset.dtIdx);
      const cfg = _lastConfigs[id];
      if (cfg && cfg.bulkActions && cfg.bulkActions[idx]) {
        cfg.bulkActions[idx].action(Array.from(st.selectedIds));
      }
    } else if (action === 'exportCSV') {
      _exportCSV(id);
    } else if (action === 'exportExcel') {
      _exportExcel(id);
    }
  });
}

function _exportCSV(id) {
  const cfg = _lastConfigs[id];
  if (!cfg) return;
  const st = _getState(id);
  const cols = cfg.columns.filter(c => !c.hidden && st.visibleCols.includes(c.key));
  let data = cfg.data ? [...cfg.data] : [];
  if (cfg.preFilter) data = cfg.preFilter(data);
  data = _applyFilters(data, cols, st.filters);
  if (st.search) { const q = st.search.toLowerCase(); data = data.filter(r => cols.some(c => { const v = _getCellValue(r, c); return v != null && String(v).toLowerCase().includes(q); })); }
  if (st.sortCol) { const col = cols.find(c => c.key === st.sortCol); if (col) { const dir = st.sortDir === 'desc' ? -1 : 1; data.sort((a, b) => { let va = _getCellValue(a, col) || '', vb = _getCellValue(b, col) || ''; if (col.type === 'number' || col.type === 'money') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; } else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); } return va < vb ? -dir : va > vb ? dir : 0; }); } }
  const esc = s => { s = String(s == null ? '' : s); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
  let csv = cols.map(c => esc(c.label)).join(',') + '\n';
  data.forEach(row => { csv += cols.map(c => { const v = _getCellValue(row, c); if (c.type === 'money' || c.type === 'number') return v != null ? v : ''; return esc(v != null ? v : ''); }).join(',') + '\n'; });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'egglogu_' + id + '_' + todayStr() + '.csv'; a.click();
  Bus.emit('toast', { msg: t('cfg_exported') || 'Exported' });
}

function _exportExcel(id) {
  const cfg = _lastConfigs[id];
  if (!cfg) return;
  Bus.emit('toast', { msg: 'Excel export requires SheetJS', type: 'error' });
}

function reset(id) { _resetState(id); delete _lastConfigs[id]; }
function getSelected(id) { return Array.from(_getState(id).selectedIds); }
function getState(id) { return _getState(id); }

export const DataTable = { create, reset, getSelected, getState, handleEvent };
