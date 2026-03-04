/**
 * EGGlogU — Production Module
 * Daily egg production recording and management.
 * Ported from egglogu.js lines ~3176-3261.
 *
 * Month 2: Added render(), showProdForm(), saveProd(),
 *          deleteProdUI() for full UI.
 */

import { bus, Events } from '@core/event-bus.js';
import { $, fmtNum, fmtDate, todayStr, genId, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { sanitizeHTML, escapeAttr } from '@core/security.js';
import { getData, saveData, addRecord, deleteRecord } from '@core/data.js';
import { registerRoute } from '@core/route-bridge.js';
import { createDataTable } from '@core/datatable-bridge.js';
import {
  emptyState, openModal, closeModal, toast,
  validateForm, clearFieldErrors, showFieldError, showConfirm,
  catalogSelect, flockSelect
} from '@core/render-utils.js';

// ── Render Entry Point ──────────────────────────────────

export function render() {
  const D = window.loadData();
  let h = `<div class="page-header"><h2>${t('prod_title')}</h2><button class="btn btn-primary" onclick="window.EGGlogU.Production.showProdForm()">${t('prod_add')}</button></div>`;

  if (!D.dailyProduction.length) {
    h += emptyState('🥚', t('no_data'), t('prod_add'), 'window.EGGlogU.Production.showProdForm()');
    $('sec-produccion').innerHTML = h;
    return;
  }

  h += createDataTable({
    id: 'production',
    data: D.dailyProduction,
    onRefresh: 'window.EGGlogU.Production.render',
    emptyIcon: '🥚',
    emptyText: t('no_data'),
    columns: [
      { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
      { key: 'flockId', label: t('prod_flock'), type: 'text', sortable: true, filterable: true, filterType: 'select',
        filterOptions: D.flocks.map(f => ({ value: f.id, label: f.name })),
        render: r => { const f = D.flocks.find(x => x.id === r.flockId); return f ? sanitizeHTML(f.name) : '-'; } },
      { key: 'eggsCollected', label: t('prod_eggs'), type: 'number', sortable: true,
        render: r => '<strong>' + fmtNum(r.eggsCollected) + '</strong>' },
      { key: '_sizes', label: 'S/M/L/XL/J', type: 'text',
        getValue: r => [r.eggsS || 0, r.eggsM || 0, r.eggsL || 0, r.eggsXL || 0, r.eggsJumbo || 0].join('/') },
      { key: 'eggType', label: t('prod_egg_type'), type: 'text', sortable: true, filterable: true, filterType: 'select',
        filterOptions: [
          { value: 'conventional', label: t('prod_type_conventional') },
          { value: 'free_range', label: t('prod_type_free_range') },
          { value: 'organic', label: t('prod_type_organic') },
          { value: 'pasture_raised', label: t('prod_type_pasture') },
          { value: 'decorative', label: t('prod_type_decorative') }
        ],
        render: r => r.eggType ? t('prod_type_' + r.eggType) : '-' },
      { key: 'marketChannel', label: t('prod_market'), type: 'text', sortable: true, filterable: true, filterType: 'select',
        filterOptions: [
          { value: 'wholesale', label: t('prod_market_wholesale') },
          { value: 'supermarket', label: t('prod_market_supermarket') },
          { value: 'restaurant', label: t('prod_market_restaurant') },
          { value: 'direct', label: t('prod_market_direct') },
          { value: 'export', label: t('prod_market_export') },
          { value: 'pasteurized', label: t('prod_market_pasteurized') }
        ],
        render: r => r.marketChannel ? t('prod_market_' + r.marketChannel) : '-' },
      { key: 'eggsBroken', label: t('prod_broken'), type: 'number', sortable: true,
        render: r => fmtNum(r.eggsBroken || 0) },
      { key: 'deaths', label: t('prod_deaths'), type: 'number', sortable: true,
        render: r => r.deaths ? '<span style="color:var(--danger)">' + r.deaths + '</span>' : '-' }
    ],
    actions: r => `<div class="btn-group"><button class="btn btn-secondary btn-sm" onclick="window.EGGlogU.Production.showProdForm('${escapeAttr(r.id)}')">${t('edit')}</button><button class="btn btn-danger btn-sm" onclick="window.EGGlogU.Production.deleteProdUI('${escapeAttr(r.id)}')">${t('delete')}</button></div>`,
    bulkActions: [{
      label: t('delete'), icon: '🗑️', danger: true,
      action: ids => {
        if (!confirm(t('confirm_delete'))) return;
        const D2 = window.loadData();
        ids.forEach(id => {
          const old = D2.dailyProduction.find(p => p.id === id);
          if (old && typeof window.logAudit === 'function') window.logAudit('delete', 'production', 'Bulk delete', old, null);
          D2.dailyProduction = D2.dailyProduction.filter(p => p.id !== id);
        });
        window.saveData(D2);
        render();
      }
    }]
  });

  $('sec-produccion').innerHTML = h;
}

// ── Production Form ─────────────────────────────────────

export function showProdForm(id) {
  const D = window.loadData();
  const p = id ? D.dailyProduction.find(x => x.id === id) : null;
  const CATALOGS = window.CATALOGS || {};

  openModal(p ? t('edit') : t('prod_add'), `
<div class="form-row"><div class="form-group"><label>${t('prod_date')}</label><input type="date" id="p-date" value="${p ? p.date : todayStr()}"></div>
<div class="form-group"><label>${t('prod_flock')}</label><select id="p-flock" onchange="if(typeof onProdFlockChange==='function')onProdFlockChange()">${flockSelect(p ? p.flockId : '')}</select></div></div>
<div class="form-row"><div class="form-group"><label>${t('prod_eggs')}</label><input type="number" id="p-eggs" value="${p ? p.eggsCollected : ''}" min="0"></div>
<div class="form-group"><label>${t('prod_broken')}</label><input type="number" id="p-broken" value="${p ? p.eggsBroken || '' : ''}" min="0"></div></div>
<div class="form-row-3"><div class="form-group"><label>${t('prod_size_s')}</label><input type="number" id="p-s" value="${p ? p.eggsS || '' : ''}" min="0"></div>
<div class="form-group"><label>${t('prod_size_m')}</label><input type="number" id="p-m" value="${p ? p.eggsM || '' : ''}" min="0"></div>
<div class="form-group"><label>${t('prod_size_l')}</label><input type="number" id="p-l" value="${p ? p.eggsL || '' : ''}" min="0"></div></div>
<div class="form-row-3"><div class="form-group"><label>${t('prod_size_xl')}</label><input type="number" id="p-xl" value="${p ? p.eggsXL || '' : ''}" min="0"></div>
<div class="form-group"><label>${t('prod_size_jumbo')}</label><input type="number" id="p-jumbo" value="${p ? p.eggsJumbo || '' : ''}" min="0"></div>
<div class="form-group"><label>${t('prod_yolk')}</label><input type="number" id="p-yolk" value="${p ? p.yolkScore || '' : ''}" min="1" max="10"></div></div>
<div class="form-row"><div class="form-group"><label>${t('prod_shell')}</label><select id="p-shell">
<option value="">--</option><option value="blanco"${p && p.shellColor === 'blanco' ? ' selected' : ''}>${t('prod_shell_white')}</option>
<option value="marron"${p && p.shellColor === 'marron' ? ' selected' : ''}>${t('prod_shell_brown')}</option>
<option value="crema"${p && p.shellColor === 'crema' ? ' selected' : ''}>${t('prod_shell_cream')}</option></select></div>
<div class="form-group"><label>${t('prod_deaths')}</label><input type="number" id="p-deaths" value="${p ? p.deaths || '' : ''}" min="0"></div></div>
<div class="form-row"><div class="form-group"><label>${t('prod_egg_type')}</label><select id="p-etype">
<option value="conventional"${p && p.eggType === 'conventional' ? ' selected' : ''}>${t('prod_type_conventional')}</option>
<option value="free_range"${p && p.eggType === 'free_range' ? ' selected' : ''}>${t('prod_type_free_range')}</option>
<option value="organic"${p && p.eggType === 'organic' ? ' selected' : ''}>${t('prod_type_organic')}</option>
<option value="pasture_raised"${p && p.eggType === 'pasture_raised' ? ' selected' : ''}>${t('prod_type_pasture')}</option>
<option value="decorative"${p && p.eggType === 'decorative' ? ' selected' : ''}>${t('prod_type_decorative')}</option></select></div>
<div class="form-group"><label>${t('prod_market')}</label><select id="p-market">
<option value="wholesale"${p && p.marketChannel === 'wholesale' ? ' selected' : ''}>${t('prod_market_wholesale')}</option>
<option value="supermarket"${p && p.marketChannel === 'supermarket' ? ' selected' : ''}>${t('prod_market_supermarket')}</option>
<option value="restaurant"${p && p.marketChannel === 'restaurant' ? ' selected' : ''}>${t('prod_market_restaurant')}</option>
<option value="direct"${p && p.marketChannel === 'direct' ? ' selected' : ''}>${t('prod_market_direct')}</option>
<option value="export"${p && p.marketChannel === 'export' ? ' selected' : ''}>${t('prod_market_export')}</option>
<option value="pasteurized"${p && p.marketChannel === 'pasteurized' ? ' selected' : ''}>${t('prod_market_pasteurized')}</option></select></div></div>
<div class="form-group"><label>${t('prod_death_cause')}</label><select id="p-cause">${catalogSelect(CATALOGS.deathCauses, p ? p.deathCause || '' : '')}</select></div>
<div class="form-group"><label>${t('notes')}</label><textarea id="p-notes">${p ? escapeAttr(p.notes || '') : ''}</textarea></div>
<div class="modal-footer"><button class="btn btn-secondary" onclick="window.EGGlogU.Production._closeModal()">${t('cancel')}</button>
<button class="btn btn-primary" onclick="window.EGGlogU.Production.saveProd('${id || ''}')">${t('save')}</button></div>`);

  if (!p && typeof window.onProdFlockChange === 'function') setTimeout(window.onProdFlockChange, 50);
}

// ── Save Production ─────────────────────────────────────

let _vengWarningsShown = false;

export function saveProd(id) {
  clearFieldErrors();
  const D = window.loadData();

  const o = {
    date: $('p-date').value,
    flockId: $('p-flock').value,
    eggsCollected: parseInt($('p-eggs').value) || 0,
    eggsBroken: parseInt($('p-broken').value) || 0,
    eggsS: parseInt($('p-s').value) || 0,
    eggsM: parseInt($('p-m').value) || 0,
    eggsL: parseInt($('p-l').value) || 0,
    eggsXL: parseInt($('p-xl').value) || 0,
    eggsJumbo: parseInt($('p-jumbo').value) || 0,
    shellColor: $('p-shell').value,
    yolkScore: parseInt($('p-yolk').value) || 0,
    deaths: parseInt($('p-deaths').value) || 0,
    deathCause: $('p-cause').value,
    eggType: $('p-etype')?.value || 'conventional',
    marketChannel: $('p-market')?.value || 'wholesale',
    notes: $('p-notes').value
  };

  const v = validateForm({
    'p-date': { value: o.date, rules: { required: true, date: true } },
    'p-flock': { value: o.flockId, rules: { required: true } },
    'p-eggs': { value: $('p-eggs').value, rules: { required: true, numeric: true, min: 0 } }
  });
  if (!v.valid) {
    Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
    return;
  }

  // Real-time validations: eggs vs flock size, deaths vs remaining
  const flock = D.flocks.find(f => f.id === o.flockId);
  if (flock && flock.currentCount) {
    if (o.eggsCollected > flock.currentCount * 1.1) {
      showFieldError('p-eggs', t('prod_eggs') + ' > ' + Math.round(flock.currentCount * 1.1) + ' (110% ' + t('prod_flock') + ')');
      return;
    }
    if (o.deaths > flock.currentCount) {
      showFieldError('p-deaths', t('prod_deaths') + ' > ' + flock.currentCount + ' (' + t('prod_flock') + ')');
      return;
    }
  }

  // VENG gate
  if (!_vengWarningsShown && typeof window.VENG?.gate?.production === 'function') {
    const vr = window.VENG.gate.production(o, D);
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
    const i = D.dailyProduction.findIndex(p => p.id === id);
    if (i >= 0) {
      if (typeof window.logAudit === 'function') window.logAudit('update', 'production', 'Edit production', D.dailyProduction[i], o);
      D.dailyProduction[i] = { ...D.dailyProduction[i], ...o };
    }
  } else {
    o.id = genId();
    D.dailyProduction.push(o);
    if (typeof window.logAudit === 'function') window.logAudit('create', 'production', 'New production: ' + o.eggsCollected + ' eggs', null, o);

    // Auto-push to inventory by egg size
    if (o.eggsCollected > 0) {
      const sizes = [
        { k: 'eggsS', t: 'S' },
        { k: 'eggsM', t: 'M' },
        { k: 'eggsL', t: 'L' },
        { k: 'eggsXL', t: 'XL' },
        { k: 'eggsJumbo', t: 'Jumbo' }
      ];
      let distributed = false;
      sizes.forEach(s => {
        if (o[s.k] > 0) {
          if (!D.inventory) D.inventory = [];
          D.inventory.push({
            id: genId(),
            date: o.date,
            flockId: o.flockId,
            eggType: s.t,
            qtyIn: o[s.k],
            qtyOut: 0,
            source: 'production',
            ref: o.id
          });
          distributed = true;
        }
      });
      if (!distributed) {
        if (!D.inventory) D.inventory = [];
        D.inventory.push({
          id: genId(),
          date: o.date,
          flockId: o.flockId,
          eggType: 'M',
          qtyIn: o.eggsCollected,
          qtyOut: 0,
          source: 'production',
          ref: o.id
        });
      }
    }
  }

  // Auto-subtract mortality from flock current count
  if (o.deaths > 0) {
    const fi = D.flocks.findIndex(f => f.id === o.flockId);
    if (fi >= 0 && D.flocks[fi].currentCount) {
      D.flocks[fi].currentCount = Math.max(0, D.flocks[fi].currentCount - o.deaths);
    }
  }

  window.saveData(D);
  closeModal();
  toast(t('cfg_saved'));
  render();
}

// ── Delete Production UI ────────────────────────────────

export async function deleteProdUI(id) {
  if (!await showConfirm(t('confirm_delete'))) return;
  const D = window.loadData();
  const old = D.dailyProduction.find(p => p.id === id);
  if (typeof window.logAudit === 'function') window.logAudit('delete', 'production', 'Delete production', old, null);
  D.dailyProduction = D.dailyProduction.filter(p => p.id !== id);
  window.saveData(D);
  toast(t('cfg_saved'));
  render();
}

// ── Close Modal wrapper ─────────────────────────────────

export function _closeModal() {
  closeModal();
}

// ── Data Layer (preserved from original) ────────────────

export function addProductionRecord(record) {
  const data = getData();
  const entry = {
    id: genId(),
    flockId: record.flockId,
    date: record.date || todayStr(),
    eggs: Number(record.eggs) || 0,
    eggsCollected: Number(record.eggs) || 0,
    broken: Number(record.broken) || 0,
    brokenEggs: Number(record.broken) || 0,
    deaths: Number(record.deaths) || 0,
    deathCause: record.deathCause || '',
    sizeS: Number(record.sizeS) || 0,
    sizeM: Number(record.sizeM) || 0,
    sizeL: Number(record.sizeL) || 0,
    sizeXL: Number(record.sizeXL) || 0,
    sizeJumbo: Number(record.sizeJumbo) || 0,
    shellColor: record.shellColor || '',
    yolkQuality: Number(record.yolkQuality) || 0,
    eggType: record.eggType || 'conventional',
    market: record.market || 'wholesale',
    notes: record.notes || '',
    createdAt: new Date().toISOString(),
  };
  data.dailyProduction.push(entry);
  saveData();
  bus.emit(Events.PRODUCTION_SAVED, entry);
  showToast(t('qe_saved'));
  return entry;
}

export function deleteProductionRecord(id) {
  const removed = deleteRecord('dailyProduction', id);
  if (removed) bus.emit(Events.PRODUCTION_DELETED, removed);
  return removed;
}

export function getProductionStats(days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  const records = (data.dailyProduction || []).filter(p => p.date >= cutoffStr);
  const totalEggs = records.reduce((s, p) => s + (p.eggs || p.eggsCollected || 0), 0);
  const totalBroken = records.reduce((s, p) => s + (p.broken || p.brokenEggs || 0), 0);
  const totalDeaths = records.reduce((s, p) => s + (p.deaths || 0), 0);
  const uniqueDays = new Set(records.map(r => r.date)).size;
  return { totalEggs, totalBroken, totalDeaths, avgEggsPerDay: uniqueDays > 0 ? totalEggs / uniqueDays : 0, breakRate: totalEggs > 0 ? (totalBroken / totalEggs) * 100 : 0, records, days: uniqueDays };
}

export function getProductionByFlock(flockId, days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  return (data.dailyProduction || []).filter(p => p.flockId === flockId && p.date >= cutoffStr);
}

export function getProductionTrend(days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  const records = (data.dailyProduction || []).filter(p => p.date >= cutoffStr);
  const byDate = {};
  records.forEach(p => {
    if (!byDate[p.date]) byDate[p.date] = { eggs: 0, broken: 0, deaths: 0 };
    byDate[p.date].eggs += p.eggs || p.eggsCollected || 0;
    byDate[p.date].broken += p.broken || p.brokenEggs || 0;
    byDate[p.date].deaths += p.deaths || 0;
  });
  const dates = Object.keys(byDate).sort();
  return { labels: dates, eggs: dates.map(d => byDate[d].eggs), broken: dates.map(d => byDate[d].broken), deaths: dates.map(d => byDate[d].deaths) };
}

// ── Backward compatibility ──────────────────────────────

window.addProductionRecord = addProductionRecord;
window.getProductionStats = getProductionStats;
window.getProductionTrend = getProductionTrend;

// ── Register Route ──────────────────────────────────────

registerRoute('produccion', render);
