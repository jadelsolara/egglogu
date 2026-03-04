/**
 * EGGlogU — Operations Module
 * Checklist, logbook, personnel management.
 * Extracted from egglogu.js lines ~4290-4417.
 *
 * Month 2: Added render() + UI for Strangler Fig migration.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, fmtNum, fmtDate, fmtMoney, $ } from '@core/utils.js';
import { sanitizeHTML, escapeAttr } from '@core/security.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';
import { registerRoute } from '@core/route-bridge.js';
import { createDataTable } from '@core/datatable-bridge.js';
import { kpi, emptyState, openModal, closeModal, toast, validateForm, clearFieldErrors, showFieldError, showConfirm, catalogSelect } from '@core/render-utils.js';

// ── State ───────────────────────────────────────────────

let currentTab = 'checklist';

// ── Render Entry Point ──────────────────────────────────

export function render() {
  const D = window.loadData();
  let h = `<div class="page-header"><h2>${t('ops_title')}</h2></div>`;
  h += `<div class="tabs">
    <div class="tab${currentTab === 'checklist' ? ' active' : ''}" onclick="window.EGGlogU.Operations.setTab('checklist')">✅ ${t('ops_checklist')}</div>
    <div class="tab${currentTab === 'logbook' ? ' active' : ''}" onclick="window.EGGlogU.Operations.setTab('logbook')">📓 ${t('ops_logbook')}</div>
    <div class="tab${currentTab === 'personnel' ? ' active' : ''}" onclick="window.EGGlogU.Operations.setTab('personnel')">👷 ${t('ops_personnel')}</div>
  </div>`;

  if (currentTab === 'checklist') h += renderChecklist(D);
  else if (currentTab === 'logbook') h += renderLogbook(D);
  else h += renderPersonnel(D);

  $('sec-operaciones').innerHTML = h;
}

export function setTab(tab) {
  currentTab = tab;
  render();
}

// ── Checklist ───────────────────────────────────────────

function renderChecklist(D) {
  const today = todayStr();
  let todayItems = D.checklist.filter(c => c.date === today);

  if (!todayItems.length && D.settings.defaultChecklist) {
    D.settings.defaultChecklist.forEach(task => {
      D.checklist.push({ id: genId(), date: today, task, done: false });
    });
    todayItems = D.checklist.filter(c => c.date === today);
    saveData(D);
  }

  const done = todayItems.filter(c => c.done).length;
  const total = todayItems.length;

  let h = `<div class="kpi-grid">${kpi(t('ops_done'), done + '/' + total, total > 0 ? fmtNum(done / total * 100, 0) + '%' : '', done === total && total > 0 ? '' : 'warning')}</div>`;
  h += `<div class="card"><h3>${t('ops_checklist')} — ${fmtDate(today)}</h3>`;

  todayItems.forEach(c => {
    h += `<div class="checklist-item${c.done ? ' done' : ''}">
      <input type="checkbox" ${c.done ? 'checked' : ''} onchange="window.EGGlogU.Operations.toggleCheck('${escapeAttr(c.id)}',this.checked)">
      <span>${t(c.task) || sanitizeHTML(c.task)}</span>
      <button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="window.EGGlogU.Operations.deleteCheck('${escapeAttr(c.id)}')">✕</button>
    </div>`;
  });

  h += `<div style="margin-top:12px;display:flex;gap:8px">
    <input id="new-task" placeholder="${t('ops_task')}" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius)">
    <button class="btn btn-primary btn-sm" onclick="window.EGGlogU.Operations.addCheckTask()">${t('add')}</button>
  </div></div>`;

  // History
  const dates = [...new Set(D.checklist.map(c => c.date))].sort().reverse().filter(d => d !== today).slice(0, 7);
  if (dates.length) {
    h += '<div class="card"><h3>' + t('history') + '</h3>';
    dates.forEach(d => {
      const items = D.checklist.filter(c => c.date === d);
      const dn = items.filter(c => c.done).length;
      h += `<div class="stat-row"><span class="stat-label">${fmtDate(d)}</span><span class="stat-value">${dn}/${items.length} (${items.length > 0 ? fmtNum(dn / items.length * 100, 0) : 0}%)</span></div>`;
    });
    h += '</div>';
  }

  return h;
}

export function toggleCheck(id, done) {
  const D = window.loadData();
  const c = D.checklist.find(x => x.id === id);
  if (c) { c.done = done; saveData(D); render(); }
}

export function deleteCheck(id) {
  const D = window.loadData();
  D.checklist = D.checklist.filter(c => c.id !== id);
  saveData(D);
  render();
}

export function addCheckTask() {
  const v = $('new-task')?.value;
  if (!v) return;
  const D = window.loadData();
  D.checklist.push({ id: genId(), date: todayStr(), task: v, done: false });
  saveData(D);
  render();
}

// ── Logbook ─────────────────────────────────────────────

function renderLogbook(D) {
  let h = `<div class="page-header" style="margin-bottom:12px"><h3>${t('ops_logbook')}</h3>
    <button class="btn btn-primary btn-sm" onclick="window.EGGlogU.Operations.showLogForm()">${t('ops_log_add')}</button></div>`;

  if (!D.logbook.length) return h + emptyState('📓', t('no_data'));

  const cats = ['general', 'health', 'production', 'maintenance', 'observation'];
  h += `<div class="filter-bar"><select id="lf-cat" onchange="window.EGGlogU.Operations.render()"><option value="">${t('all')}</option>${cats.map(c => `<option value="${c}">${t('ops_log_cat_' + c)}</option>`).join('')}</select></div>`;

  const selCat = document.getElementById('lf-cat')?.value || '';
  let logs = D.logbook.sort((a, b) => b.date.localeCompare(a.date));
  if (selCat) logs = logs.filter(l => l.category === selCat);

  h += '<div class="card">';
  logs.forEach(l => {
    h += `<div class="alert-card alert-info" style="flex-wrap:wrap"><div style="flex:1"><strong>${fmtDate(l.date)}</strong> — <span class="badge badge-info">${t('ops_log_cat_' + l.category) || sanitizeHTML(l.category)}</span>
      <p style="margin-top:4px">${sanitizeHTML(l.entry)}</p></div>
      <div class="btn-group"><button class="btn btn-secondary btn-sm" onclick="window.EGGlogU.Operations.showLogForm('${escapeAttr(l.id)}')">${t('edit')}</button>
      <button class="btn btn-danger btn-sm" onclick="window.EGGlogU.Operations.deleteLog('${escapeAttr(l.id)}')">${t('delete')}</button></div></div>`;
  });
  h += '</div>';
  return h;
}

export function showLogForm(id) {
  const D = window.loadData();
  const l = id ? D.logbook.find(x => x.id === id) : null;
  const cats = ['general', 'health', 'production', 'maintenance', 'observation'];

  openModal(l ? t('edit') : t('ops_log_add'), `
    <div class="form-row"><div class="form-group"><label>${t('date')}</label><input type="date" id="lg-date" value="${l ? l.date : todayStr()}"></div>
    <div class="form-group"><label>${t('ops_log_category')}</label><select id="lg-cat">${cats.map(c => `<option value="${c}"${l && l.category === c ? ' selected' : ''}>${t('ops_log_cat_' + c)}</option>`).join('')}</select></div></div>
    <div class="form-group"><label>${t('ops_log_entry')}</label><textarea id="lg-entry" rows="4">${l ? escapeAttr(l.entry || '') : ''}</textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel')}</button>
    <button class="btn btn-primary" onclick="window.EGGlogU.Operations.saveLog('${id || ''}')">${t('save')}</button></div>`);
}

export function saveLog(id) {
  clearFieldErrors();
  const D = window.loadData();
  const o = { date: $('lg-date').value, category: $('lg-cat').value, entry: $('lg-entry').value };
  const v = validateForm({
    'lg-date': { value: o.date, rules: { required: true, date: true } },
    'lg-cat': { value: o.category, rules: { required: true } },
    'lg-entry': { value: o.entry, rules: { required: true, maxLength: 2000 } }
  });
  if (!v.valid) { Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0])); return; }

  if (id) {
    const i = D.logbook.findIndex(l => l.id === id);
    if (i >= 0) D.logbook[i] = { ...D.logbook[i], ...o };
  } else {
    o.id = genId();
    D.logbook.push(o);
  }
  saveData(D);
  closeModal();
  toast(t('cfg_saved'));
  render();
}

export async function deleteLog(id) {
  if (!await showConfirm(t('confirm_delete'))) return;
  const D = window.loadData();
  D.logbook = D.logbook.filter(l => l.id !== id);
  saveData(D);
  toast(t('cfg_saved'));
  render();
}

// ── Personnel ───────────────────────────────────────────

function renderPersonnel(D) {
  if (!D.personnel.length) {
    let h = `<div class="page-header" style="margin-bottom:12px"><h3>${t('ops_personnel')}</h3><button class="btn btn-primary btn-sm" onclick="window.EGGlogU.Operations.showPersonnelForm()">${t('ops_per_add')}</button></div>`;
    return h + emptyState('👷', t('no_data'));
  }

  const totalSalary = D.personnel.filter(p => p.active).reduce((s, p) => s + (p.salary || 0), 0);
  const activeCount = D.personnel.filter(p => p.active).length;

  return createDataTable({
    id: 'personnel',
    data: D.personnel,
    onRefresh: 'window.EGGlogU.Operations.render',
    emptyIcon: '👷',
    emptyText: t('no_data'),
    headerHtml: `<div class="page-header" style="margin-bottom:12px"><h3>${t('ops_personnel')}</h3><button class="btn btn-primary btn-sm" onclick="window.EGGlogU.Operations.showPersonnelForm()">${t('ops_per_add')}</button></div>`,
    kpiHtml: `<div class="kpi-grid">${kpi(t('total_salaries'), fmtMoney(totalSalary), activeCount + ' ' + t('active').toLowerCase())}</div>`,
    columns: [
      { key: 'name', label: t('ops_per_name'), type: 'text', sortable: true, filterable: true, render: r => '<strong>' + sanitizeHTML(r.name) + '</strong>' },
      { key: 'role', label: t('ops_per_role'), type: 'text', sortable: true, filterable: true, filterType: 'select', filterOptions: [...new Set(D.personnel.map(p => p.role).filter(Boolean))].map(v => ({ value: v, label: v })), render: r => sanitizeHTML(r.role || '-') },
      { key: 'salary', label: t('ops_per_salary'), type: 'number', sortable: true, render: r => fmtMoney(r.salary || 0) },
      { key: 'startDate', label: t('ops_per_start'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
      { key: 'active', label: t('ops_per_active'), type: 'text', sortable: true, filterable: true, filterType: 'select', filterOptions: [{ value: 'true', label: t('active') }, { value: 'false', label: t('inactive') }], getValue: r => String(!!r.active), render: r => r.active ? '<span class="badge badge-success">' + t('active') + '</span>' : '<span class="badge badge-secondary">' + t('inactive') + '</span>' }
    ],
    actions: r => `<div class="btn-group"><button class="btn btn-secondary btn-sm" onclick="window.EGGlogU.Operations.showPersonnelForm('${escapeAttr(r.id)}')">${t('edit')}</button><button class="btn btn-danger btn-sm" onclick="window.EGGlogU.Operations.deletePersonnel('${escapeAttr(r.id)}')">${t('delete')}</button></div>`,
    bulkActions: [{
      label: t('delete'), icon: '🗑️', danger: true,
      action: ids => {
        if (!confirm(t('confirm_delete'))) return;
        const D = window.loadData();
        D.personnel = D.personnel.filter(p => !ids.includes(p.id));
        saveData(D);
        render();
      }
    }]
  });
}

export function showPersonnelForm(id) {
  const D = window.loadData();
  const p = id ? D.personnel.find(x => x.id === id) : null;
  const roles = window.CATALOGS?.personnelRoles || ['Administrador', 'Técnico Avícola', 'Galponero', 'Recolector', 'Veterinario', 'Chofer/Repartidor', 'Limpieza', 'Mantenimiento'];

  openModal(p ? t('edit') : t('ops_per_add'), `
    <div class="form-row"><div class="form-group"><label>${t('ops_per_name')}</label><input id="pe-name" value="${p ? escapeAttr(p.name) : ''}"></div>
    <div class="form-group"><label>${t('ops_per_role')}</label><select id="pe-role">${catalogSelect(roles, p ? p.role || '' : '')}</select></div></div>
    <div class="form-row"><div class="form-group"><label>${t('ops_per_salary')}</label><input type="number" id="pe-salary" value="${p ? p.salary || '' : ''}" min="0"></div>
    <div class="form-group"><label>${t('ops_per_start')}</label><input type="date" id="pe-start" value="${p ? p.startDate || '' : ''}"></div></div>
    <div class="form-group"><label>${t('ops_per_active')}</label><select id="pe-active">
    <option value="1"${!p || p.active ? ' selected' : ''}>${t('active')}</option>
    <option value="0"${p && !p.active ? ' selected' : ''}>${t('inactive')}</option></select></div>
    <div class="form-group"><label>${t('notes')}</label><textarea id="pe-notes">${p ? escapeAttr(p.notes || '') : ''}</textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">${t('cancel')}</button>
    <button class="btn btn-primary" onclick="window.EGGlogU.Operations.savePersonnel('${id || ''}')">${t('save')}</button></div>`);
}

export function savePersonnel(id) {
  clearFieldErrors();
  const D = window.loadData();
  const o = {
    name: $('pe-name').value,
    role: $('pe-role').value,
    salary: parseFloat($('pe-salary').value) || 0,
    startDate: $('pe-start').value,
    active: $('pe-active').value === '1',
    notes: $('pe-notes').value
  };
  const v = validateForm({
    'pe-name': { value: o.name, rules: { required: true, maxLength: 100 } },
    'pe-role': { value: o.role, rules: { required: true } },
    'pe-salary': { value: $('pe-salary').value, rules: { numeric: true, min: 0 } },
    'pe-start': { value: o.startDate, rules: { required: true, date: true } }
  });
  if (!v.valid) { Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0])); return; }

  if (id) {
    const i = D.personnel.findIndex(p => p.id === id);
    if (i >= 0) D.personnel[i] = { ...D.personnel[i], ...o };
  } else {
    o.id = genId();
    D.personnel.push(o);
  }
  saveData(D);
  closeModal();
  toast(t('cfg_saved'));
  render();
}

export async function deletePersonnel(id) {
  if (!await showConfirm(t('confirm_delete'))) return;
  const D = window.loadData();
  D.personnel = D.personnel.filter(p => p.id !== id);
  saveData(D);
  toast(t('cfg_saved'));
  render();
}

// ── Data-only exports (backward compat) ─────────────────

export function getTodayChecklist() {
  const data = getData();
  const today = todayStr();
  let items = data.checklist.filter(c => c.date === today);
  if (!items.length && data.settings.defaultChecklist) {
    data.settings.defaultChecklist.forEach(task => {
      data.checklist.push({ id: genId(), date: today, task, done: false });
    });
    items = data.checklist.filter(c => c.date === today);
    saveData();
  }
  return items;
}

export function toggleChecklistItem(id, done) {
  const data = getData();
  const item = data.checklist.find(c => c.id === id);
  if (item) { item.done = !!done; saveData(); }
  return item;
}

export function deleteChecklistItem(id) {
  const data = getData();
  data.checklist = data.checklist.filter(c => c.id !== id);
  saveData();
}

export function addChecklistTask(task) {
  const data = getData();
  const entry = { id: genId(), date: todayStr(), task, done: false };
  data.checklist.push(entry);
  saveData();
  return entry;
}

export function getChecklistHistory(days = 7) {
  const data = getData();
  const today = todayStr();
  const dates = [...new Set(data.checklist.map(c => c.date))].sort().reverse().filter(d => d !== today).slice(0, days);
  return dates.map(date => {
    const items = data.checklist.filter(c => c.date === date);
    const done = items.filter(c => c.done).length;
    return { date, total: items.length, done, completion: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
  });
}

export function addLogEntry(entry) {
  const data = getData();
  const record = { id: genId(), date: entry.date || todayStr(), category: entry.category || 'general', entry: entry.entry || '', createdAt: new Date().toISOString() };
  data.logbook.push(record);
  saveData();
  return record;
}

export function updateLogEntry(id, changes) {
  const data = getData();
  const idx = data.logbook.findIndex(l => l.id === id);
  if (idx < 0) return null;
  data.logbook[idx] = { ...data.logbook[idx], ...changes };
  saveData();
  return data.logbook[idx];
}

export function deleteLogEntry(id) {
  const data = getData();
  data.logbook = data.logbook.filter(l => l.id !== id);
  saveData();
}

export function getLogEntries(category) {
  const data = getData();
  let logs = data.logbook.sort((a, b) => b.date.localeCompare(a.date));
  if (category) logs = logs.filter(l => l.category === category);
  return logs;
}

export function addPersonnelRecord(person) {
  const data = getData();
  const entry = { id: genId(), name: person.name, role: person.role || '', salary: parseFloat(person.salary) || 0, startDate: person.startDate || '', active: person.active !== false, notes: person.notes || '', createdAt: new Date().toISOString() };
  data.personnel.push(entry);
  saveData();
  return entry;
}

export function updatePersonnelRecord(id, changes) {
  const data = getData();
  const idx = data.personnel.findIndex(p => p.id === id);
  if (idx < 0) return null;
  data.personnel[idx] = { ...data.personnel[idx], ...changes };
  saveData();
  return data.personnel[idx];
}

export function deletePersonnelRecord(id) {
  const data = getData();
  data.personnel = data.personnel.filter(p => p.id !== id);
  saveData();
}

export function getPersonnelStats() {
  const data = getData();
  const active = data.personnel.filter(p => p.active);
  return { total: data.personnel.length, active: active.length, totalSalary: active.reduce((s, p) => s + (p.salary || 0), 0) };
}

// ── Backward compatibility ──────────────────────────────

window.toggleCheck = toggleCheck;
window.addCheckTask = addCheckTask;
window.addLogEntry = addLogEntry;
window.addPersonnel = addPersonnelRecord;
window.deletePersonnel = deletePersonnel;

// ── Register Route ──────────────────────────────────────

registerRoute('operaciones', render);
