/**
 * EGGlogU — Flocks Module
 * Flock management, lifecycle, breed info, health scoring.
 * Ported from egglogu.js lines ~3052-3174.
 *
 * Month 2: Added render(), showFlockForm(), saveFlock(),
 *          showFlockRoadmap(), deleteFlockUI() for full UI.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, fmtNum, fmtDate, showToast, $ } from '@core/utils.js';
import { t } from '@core/translations.js';
import { sanitizeHTML, escapeAttr } from '@core/security.js';
import { getData, saveData, addRecord, updateRecord, deleteRecord } from '@core/data.js';
import { registerRoute } from '@core/route-bridge.js';
import { createDataTable } from '@core/datatable-bridge.js';
import {
  kpi, emptyState, openModal, closeModal, toast,
  validateForm, clearFieldErrors, showFieldError, showConfirm,
  flockSelect
} from '@core/render-utils.js';

// ── Render Entry Point ──────────────────────────────────

export function render() {
  const D = window.loadData();
  let h = `<div class="page-header"><h2>${t('flock_title')}</h2><button class="btn btn-primary" onclick="window.EGGlogU.Flocks.showFlockForm()">${t('flock_add')}</button></div>`;

  if (!D.flocks.length) {
    h += emptyState('🐔', t('no_data'), t('flock_add'), 'window.EGGlogU.Flocks.showFlockForm()');
  } else {
    const flocksEnriched = D.flocks.map(f => {
      const age = flockAge(f);
      const cur = activeHensByFlock(f.id);
      const hs = typeof window.healthScore === 'function' ? window.healthScore(f.id) : 0;
      const lc = typeof window.flockLifecycleStage === 'function' ? window.flockLifecycleStage(f) : { stage: '-', color: '#ccc', icon: '?', key: 'unknown' };
      const bi = typeof window.breedInfo === 'function' ? window.breedInfo(f.breed || f.targetCurve) : null;
      return { ...f, _age: age, _cur: cur, _hs: hs, _lc: lc, _bi: bi };
    });

    h += createDataTable({
      id: 'flocks',
      data: flocksEnriched,
      onRefresh: 'window.EGGlogU.Flocks.render',
      emptyIcon: '🐔',
      emptyText: t('no_data'),
      columns: [
        { key: 'name', label: t('flock_name'), type: 'text', sortable: true, filterable: true,
          render: r => '<strong>' + sanitizeHTML(r.name) + '</strong>' },
        { key: '_breed', label: t('flock_breed'), type: 'text', sortable: true,
          getValue: r => _breedName(r.breed || r.targetCurve),
          render: r => sanitizeHTML(_breedName(r.breed || r.targetCurve)) + (r._bi && r._bi.eggColor !== '-' ? '<br><small style="color:var(--text-light)">' + sanitizeHTML(r._bi.eggColor) + '</small>' : '') },
        { key: 'count', label: t('flock_count'), type: 'number', sortable: true,
          render: r => fmtNum(r.count) },
        { key: '_cur', label: t('flock_current'), type: 'number', sortable: true,
          render: r => fmtNum(r._cur) },
        { key: '_ageWeeks', label: t('flock_age'), type: 'number', sortable: true,
          getValue: r => r._age.weeks,
          render: r => r._age.weeks + ' ' + t('flock_weeks') + ' (' + r._age.days + ' ' + t('flock_days') + ')' },
        { key: '_lcStage', label: t('lc_current_stage'), type: 'text', sortable: true,
          getValue: r => r._lc.stage,
          render: r => '<span style="background:' + r._lc.color + ';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">' + r._lc.icon + ' ' + t(r._lc.key) + '</span>' },
        { key: 'status', label: t('flock_status'), type: 'text', sortable: true, filterable: true, filterType: 'select',
          filterOptions: [
            { value: 'cria', label: t('flock_status_cria') },
            { value: 'recria', label: t('flock_status_recria') },
            { value: 'produccion', label: t('flock_status_produccion') },
            { value: 'descarte', label: t('flock_status_descarte') }
          ],
          render: r => typeof window.statusBadge === 'function' ? window.statusBadge(r.status) : r.status },
        { key: '_hs', label: t('flock_health'), type: 'number', sortable: true,
          render: r => typeof window.healthBadge === 'function' ? window.healthBadge(r._hs) : String(r._hs) }
      ],
      actions: r => `<div class="btn-group"><button class="btn btn-secondary btn-sm" onclick="window.EGGlogU.Flocks.showFlockForm('${escapeAttr(r.id)}')">${t('edit')}</button><button class="btn btn-sm" style="background:var(--accent);color:#fff" onclick="window.EGGlogU.Flocks.showFlockRoadmap('${escapeAttr(r.id)}')">${t('flock_roadmap')}</button><button class="btn btn-danger btn-sm" onclick="window.EGGlogU.Flocks.deleteFlockUI('${escapeAttr(r.id)}')">${t('delete')}</button></div>`,
      bulkActions: [{
        label: t('delete'), icon: '🗑️', danger: true,
        action: ids => {
          if (!confirm(t('confirm_delete'))) return;
          const D2 = window.loadData();
          D2.flocks = D2.flocks.filter(f => !ids.includes(f.id));
          window.saveData(D2);
          render();
        }
      }]
    });
  }

  $('sec-lotes').innerHTML = h;
}

// ── Flock Roadmap ───────────────────────────────────────

export function showFlockRoadmap(fid) {
  const D = window.loadData();
  const f = D.flocks.find(x => x.id === fid);
  if (!f) return;

  const age = flockAge(f);
  const currentLC = typeof window.flockLifecycleStage === 'function' ? window.flockLifecycleStage(f) : { stage: '-', color: '#ccc', icon: '?', key: 'unknown' };
  const LIFECYCLE = window.LIFECYCLE || [];

  let h = `<h3 style="margin-bottom:8px">${sanitizeHTML(f.name)} — ${t('flock_lifecycle')}</h3>
<p style="color:var(--text-light);margin-bottom:16px">${t('flock_age')}: ${age.weeks} ${t('flock_weeks')} | ${t('lc_current_stage')}: ${currentLC.icon} ${t(currentLC.key)}</p>`;

  h += '<div class="lifecycle-bar">';
  const totalWeeks = 80;
  LIFECYCLE.forEach(l => {
    const w = Math.min(l.weekEnd, totalWeeks) - l.weekStart;
    const pct = (w / totalWeeks * 100);
    if (pct <= 0) return;
    const isCurrent = l.stage === currentLC.stage;
    h += `<div class="lifecycle-stage${isCurrent ? ' current' : ''}" style="width:${pct}%;background:${l.color};${isCurrent ? 'font-weight:800' : ''}" title="${t(l.key)}: ${l.weekStart}-${l.weekEnd} ${t('flock_weeks')}">${l.icon} ${t(l.key)}</div>`;
  });
  h += '</div>';

  h += '<div class="lifecycle-detail">';
  LIFECYCLE.forEach(l => {
    const isCurrent = l.stage === currentLC.stage;
    h += `<div class="lifecycle-card" style="background:${l.color};${isCurrent ? 'box-shadow:0 0 0 3px var(--primary)' : ''}">
<div class="lc-icon">${l.icon}</div><div class="lc-name">${t(l.key)}</div>
<div class="lc-weeks">${t('lc_weeks')}: ${l.weekStart}-${l.weekEnd === 999 ? '80+' : l.weekEnd}</div>
<div class="lc-info"><strong>${t('lc_feed')}:</strong> ${l.feed === '-' ? '-' : t(l.feed)}<br><strong>${t('lc_temp')}:</strong> ${l.temp}<br>
<strong>${t('lc_prod_label')}:</strong> ${l.prod.startsWith('lc_') ? t(l.prod) : l.prod}<br><strong>${t('lc_milestone')}:</strong> ${t(l.milestones)}</div></div>`;
  });
  h += '</div>';

  // Vaccine timeline
  const vaccines = (D.vaccines || []).filter(v => v.flockId === fid).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  if (vaccines.length) {
    h += `<h3 style="margin-top:16px">${t('san_vaccines')}</h3><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>${t('vac_vaccine')}</th><th>${t('vac_scheduled')}</th><th>${t('vac_route')}</th><th>${t('status')}</th></tr></thead><tbody>`;
    vaccines.forEach(v => {
      const status = v.status === 'applied' ? 'applied' : v.scheduledDate < todayStr() ? 'overdue' : 'pending';
      h += `<tr><td>${sanitizeHTML(v.vaccineName)}</td><td>${fmtDate(v.scheduledDate)}</td><td>${t(v.route)}</td><td>${typeof window.statusBadge === 'function' ? window.statusBadge(status) : status}</td></tr>`;
    });
    h += '</tbody></table></div>';
  }

  openModal(t('flock_lifecycle') + ' — ' + sanitizeHTML(f.name), h);
}

// ── Flock Form ──────────────────────────────────────────

export function showFlockForm(id) {
  const D = window.loadData();
  const f = id ? D.flocks.find(x => x.id === id) : null;
  const COMMERCIAL_BREEDS = window.COMMERCIAL_BREEDS || [];
  const _supplierSelect = typeof window.supplierSelect === 'function' ? window.supplierSelect(f ? f.supplier : '') : '<option value="">--</option>';

  openModal(f ? t('flock_edit') : t('flock_add'), `
<div class="form-row"><div class="form-group"><label>${t('flock_name')}</label><input id="f-name" value="${f ? escapeAttr(f.name) : ''}"></div>
<div class="form-group"><label>${t('flock_breed')}</label><select id="f-breed" onchange="window.EGGlogU.Flocks._onBreedSelect()">
${COMMERCIAL_BREEDS.map(b => `<option value="${b.id}"${(f && (f.breed === b.id || f.targetCurve === b.id)) ? ' selected' : ''}>${b.name}${b.type !== '-' ? ' (' + b.type + ')' : ''}</option>`).join('')}
</select></div></div>
<div id="breed-info" style="background:var(--card-bg,#f0f4f8);border-radius:8px;padding:8px 12px;margin:-4px 0 8px;font-size:.85em;display:block"></div>
<div class="form-row"><div class="form-group"><label>${t('flock_housing')}</label><select id="f-housing">
<option value="floor"${f && f.housingType === 'floor' ? ' selected' : ''}>${t('flock_housing_floor')}</option>
<option value="cage"${f && f.housingType === 'cage' ? ' selected' : ''}>${t('flock_housing_cage')}</option>
<option value="free"${f && f.housingType === 'free' ? ' selected' : ''}>${t('flock_housing_free')}</option></select></div>
<div class="form-group"><label>${t('flock_egg_color')}</label><input id="f-egg-color" readonly style="background:var(--card-bg,#f0f4f8);cursor:default"></div></div>
<div class="form-row"><div class="form-group"><label>${t('flock_count')}</label><input type="number" id="f-count" value="${f ? f.count : ''}"></div>
<div class="form-group"><label>${t('flock_status')}</label><select id="f-status">
<option value="cria"${f && f.status === 'cria' ? ' selected' : ''}>${t('flock_status_cria')}</option>
<option value="recria"${f && f.status === 'recria' ? ' selected' : ''}>${t('flock_status_recria')}</option>
<option value="produccion"${(!f || f.status === 'produccion') ? ' selected' : ''}>${t('flock_status_produccion')}</option>
<option value="descarte"${f && f.status === 'descarte' ? ' selected' : ''}>${t('flock_status_descarte')}</option></select></div></div>
<div class="form-row"><div class="form-group"><label>${t('flock_birthdate')}</label><input type="date" id="f-birth" value="${f ? f.birthDate : ''}"></div>
<div class="form-group"><label>${t('flock_purchase_date')}</label><input type="date" id="f-purchase" value="${f ? f.purchaseDate : ''}"></div></div>
<div class="form-row"><div class="form-group"><label>${t('flock_supplier')}</label><select id="f-supplier" onchange="if(typeof handleSupplierChange==='function')handleSupplierChange(this)">${_supplierSelect}</select></div>
<div class="form-group"><label>${t('flock_cost')}</label><input type="number" id="f-cost" value="${f ? f.cost : ''}"></div></div>
<div class="form-row"><div class="form-group"><label>${t('flock_purchase_cost')}</label><input type="number" step="0.01" min="0" id="f-pcost" value="${f && f.purchaseCostPerBird != null ? f.purchaseCostPerBird : ''}"></div>
<div class="form-group"></div></div>
<div class="form-row"><div class="form-group"><label>${t('flock_curve_adjust') || 'Curve Adjust'} (0.5-1.5)</label><input type="number" id="f-curve" value="${f && f.curveAdjust != null ? f.curveAdjust : 1.0}" min="0.5" max="1.5" step="0.05">
<small style="color:var(--text-light);display:block;margin-top:4px">${t('flock_curve_tip') || '1.0=standard, 0.85=tropical, 1.1=temperate'}</small></div></div>
<div class="form-group"><label>${t('flock_notes')}</label><textarea id="f-notes">${f ? escapeAttr(f.notes || '') : ''}</textarea></div>
<div class="modal-footer"><button class="btn btn-secondary" onclick="window.EGGlogU.Flocks._closeModal()">${t('cancel')}</button>
<button class="btn btn-primary" onclick="window.EGGlogU.Flocks.saveFlock('${id || ''}')">${t('save')}</button></div>`);

  setTimeout(_onBreedSelect, 50);
}

// ── Breed helpers ───────────────────────────────────────

function _breedName(id) {
  if (typeof window.breedName === 'function') return window.breedName(id);
  const BREEDS = window.COMMERCIAL_BREEDS || [];
  const b = BREEDS.find(x => x.id === id);
  return b ? b.name : (id || '-');
}

export function _onBreedSelect() {
  const sel = $('f-breed');
  if (!sel) return;
  const bid = sel.value;
  const BREEDS = window.COMMERCIAL_BREEDS || [];
  const b = BREEDS.find(x => x.id === bid);
  const info = $('breed-info');
  const ec = $('f-egg-color');
  if (b && b.type !== '-') {
    info.innerHTML = `<strong>${sanitizeHTML(b.name)}</strong> — ${sanitizeHTML(String(b.eggsYear))} huevos/año · Peso: ${sanitizeHTML(String(b.eggWeight))} · FCR: ${sanitizeHTML(String(b.fcr))}<br><span style="color:var(--text-secondary,#666)">${sanitizeHTML(b.notes)}</span>`;
    info.style.display = 'block';
    if (ec) ec.value = b.eggColor;
  } else {
    info.innerHTML = '';
    info.style.display = 'none';
    if (ec) ec.value = '';
  }
}

// ── Save Flock ──────────────────────────────────────────

let _vengWarningsShown = false;

export function saveFlock(id) {
  clearFieldErrors();
  const D = window.loadData();
  const breedId = $('f-breed').value;
  const _resolveSupplier = typeof window.resolveSupplier === 'function' ? window.resolveSupplier : (fid) => $(fid)?.value || '';

  const o = {
    name: $('f-name').value,
    breed: breedId,
    count: parseInt($('f-count').value) || 0,
    status: $('f-status').value,
    housingType: $('f-housing')?.value || 'floor',
    targetCurve: breedId,
    curveAdjust: parseFloat($('f-curve')?.value) || 1.0,
    birthDate: $('f-birth').value,
    purchaseDate: $('f-purchase').value,
    supplier: _resolveSupplier('f-supplier'),
    cost: parseFloat($('f-cost').value) || 0,
    purchaseCostPerBird: $('f-pcost').value ? parseFloat($('f-pcost').value) : null,
    notes: $('f-notes').value
  };

  const v = validateForm({
    'f-name': { value: o.name, rules: { required: true, maxLength: 100 } },
    'f-count': { value: $('f-count').value, rules: { required: true, numeric: true, min: 1 } },
    'f-birth': { value: o.birthDate, rules: { required: true, date: true } }
  });
  if (!v.valid) {
    Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
    return;
  }

  // VENG gate
  if (!_vengWarningsShown && typeof window.VENG?.gate?.flock === 'function') {
    const vr = window.VENG.gate.flock(o, D);
    if (!vr.ok) {
      vr.errors.forEach(e => { if (e.field) showFieldError(e.field, e.msg); });
      if (typeof window.showVengPanel === 'function') window.showVengPanel(vr.errors, vr.warnings);
      return;
    }
    if (vr.warnings.length) {
      if (typeof window.showVengPanel === 'function') window.showVengPanel([], vr.warnings);
      _vengWarningsShown = true;
      return;
    }
  }
  _vengWarningsShown = false;

  if (id) {
    const i = D.flocks.findIndex(f => f.id === id);
    if (i >= 0) {
      if (typeof window.logAudit === 'function') window.logAudit('update', 'flocks', 'Edit flock: ' + o.name, D.flocks[i], o);
      D.flocks[i] = { ...D.flocks[i], ...o };
    }
  } else {
    o.id = genId();
    D.flocks.push(o);
    if (o.birthDate && typeof window.generateVaccineCalendar === 'function') {
      window.generateVaccineCalendar(o);
    }
    if (o.cost > 0) {
      const exp = {
        id: genId(),
        date: o.purchaseDate || todayStr(),
        category: 'bird_purchase',
        description: t('flock_name') + ': ' + o.name + ' (' + o.count + ' ' + t('flock_count') + ')',
        amount: o.cost,
        notes: ''
      };
      D.finances.expenses.push(exp);
      if (typeof window.logAudit === 'function') window.logAudit('create', 'expenses', 'Auto expense from flock: ' + o.name, null, exp);
    }
    if (typeof window.logAudit === 'function') window.logAudit('create', 'flocks', 'New flock: ' + o.name, null, o);
  }

  window.saveData(D);
  closeModal();
  toast(t('cfg_saved'));
  render();
}

// ── Delete Flock UI ─────────────────────────────────────

export async function deleteFlockUI(id) {
  if (!await showConfirm(t('confirm_delete'))) return;
  const D = window.loadData();
  const old = D.flocks.find(f => f.id === id);

  D.flocks = D.flocks.filter(f => f.id !== id);
  D.dailyProduction = D.dailyProduction.filter(p => p.flockId !== id);
  D.vaccines = D.vaccines.filter(v => v.flockId !== id);
  D.medications = D.medications.filter(m => m.flockId !== id);
  D.outbreaks = D.outbreaks.filter(o => o.flockId !== id);
  D.feed.consumption = D.feed.consumption.filter(c => c.flockId !== id);
  D.traceability.batches = D.traceability.batches.filter(b => b.flockId !== id);
  D.productionPlans = (D.productionPlans || []).filter(p => p.flockId !== id);

  if (typeof window.logAudit === 'function') window.logAudit('delete', 'flocks', 'Delete flock: ' + (old ? old.name : id), old, null);
  window.saveData(D);
  toast(t('cfg_saved'));
  render();
}

// ── Close Modal wrapper ─────────────────────────────────

export function _closeModal() {
  closeModal();
}

// ── Flock CRUD (data layer — preserved) ─────────────────

export function addFlock(flock) {
  const entry = {
    id: genId(),
    name: flock.name,
    breed: flock.breed || '',
    count: Number(flock.count) || 0,
    initialCount: Number(flock.count) || 0,
    status: flock.status || 'produccion',
    housingType: flock.housingType || 'floor',
    targetCurve: flock.breed || flock.targetCurve || '',
    curveAdjust: parseFloat(flock.curveAdjust) || 1.0,
    birthDate: flock.birthDate || '',
    purchaseDate: flock.purchaseDate || '',
    supplier: flock.supplier || '',
    cost: Number(flock.cost) || 0,
    purchaseCostPerBird: flock.purchaseCostPerBird != null ? Number(flock.purchaseCostPerBird) : null,
    notes: flock.notes || '',
    createdAt: new Date().toISOString(),
  };
  addRecord('flocks', entry);
  bus.emit(Events.FLOCK_UPDATED, entry);
  return entry;
}

export function updateFlock(id, changes) {
  const updated = updateRecord('flocks', id, changes);
  if (updated) bus.emit(Events.FLOCK_UPDATED, updated);
  return updated;
}

export function deleteFlock(id) {
  const data = getData();
  const flock = data.flocks.find(f => f.id === id);
  if (!flock) return null;
  data.flocks = data.flocks.filter(f => f.id !== id);
  data.dailyProduction = data.dailyProduction.filter(p => p.flockId !== id);
  data.vaccines = data.vaccines.filter(v => v.flockId !== id);
  data.medications = data.medications.filter(m => m.flockId !== id);
  data.outbreaks = data.outbreaks.filter(o => o.flockId !== id);
  data.feed.consumption = data.feed.consumption.filter(c => c.flockId !== id);
  data.traceability.batches = data.traceability.batches.filter(b => b.flockId !== id);
  saveData();
  bus.emit(Events.FLOCK_UPDATED, { id, deleted: true });
  return flock;
}

// ── Flock Calculations ──────────────────────────────────

export function activeHens() {
  const data = getData();
  return data.flocks
    .filter(f => f.status !== 'descarte')
    .reduce((s, f) => {
      const deaths = data.dailyProduction
        .filter(p => p.flockId === f.id)
        .reduce((d, p) => d + (p.deaths || 0), 0);
      return s + ((f.initialCount || f.count || 0) - deaths);
    }, 0);
}

export function activeHensByFlock(flockId) {
  const data = getData();
  const flock = data.flocks.find(f => f.id === flockId);
  if (!flock) return 0;
  const deaths = data.dailyProduction
    .filter(p => p.flockId === flockId)
    .reduce((d, p) => d + (p.deaths || 0), 0);
  return (flock.initialCount || flock.count || 0) - deaths;
}

export function flockAge(flock) {
  if (!flock.birthDate) return { weeks: 0, days: 0 };
  const birth = new Date(flock.birthDate);
  const now = new Date();
  const diffMs = now - birth;
  const diffDays = Math.floor(diffMs / 86400000);
  return { weeks: Math.floor(diffDays / 7), days: diffDays };
}

export function getFlocksByStatus(status) {
  const data = getData();
  return data.flocks.filter(f => f.status === status);
}

export function getActiveFlocks() {
  const data = getData();
  return data.flocks.filter(f => f.status !== 'descarte');
}

// ── Flock Statistics ────────────────────────────────────

export function getFlockStats(flockId) {
  const data = getData();
  const flock = data.flocks.find(f => f.id === flockId);
  if (!flock) return null;
  const production = data.dailyProduction.filter(p => p.flockId === flockId);
  const totalEggs = production.reduce((s, p) => s + (p.eggsCollected || p.eggs || 0), 0);
  const totalDeaths = production.reduce((s, p) => s + (p.deaths || 0), 0);
  const currentHens = (flock.initialCount || flock.count || 0) - totalDeaths;
  const mortality = flock.count > 0 ? (totalDeaths / flock.count) * 100 : 0;
  const last7 = production.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const avgEggs = last7.length > 0 ? last7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / last7.length : 0;
  const henDay = currentHens > 0 ? (avgEggs / currentHens) * 100 : 0;
  return { flock, totalEggs, totalDeaths, currentHens, mortality, henDay, avgEggsPerDay: avgEggs, age: flockAge(flock) };
}

// ── Backward compatibility ──────────────────────────────

window.addFlock = addFlock;
window.updateFlock = updateFlock;
window.deleteFlock = deleteFlock;
window.activeHens = activeHens;
window.activeHensByFlock = activeHensByFlock;
window.flockAge = flockAge;

// ── Register Route ──────────────────────────────────────

registerRoute('lotes', render);
