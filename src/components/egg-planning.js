// <egg-planning> — Production Planning Web Component
// Replaces monolith renderPlanning(), estimateProduction(), estimateTotalProduction(), showPlanForm(), savePlan(), deletePlan()

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate, todayStr, genId, validateForm, emptyState, BREED_CURVES, activeHensByFlock, flockSelect, clientSelect, showFieldError, clearFieldErrors, logAudit } from '../core/index.js';
import { modalVal, getModalBody, modalQuery, modalQueryAll } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

// ─── Estimate production for a single flock between two dates ───
function estimateProduction(D, flockId, fromDate, toDate) {
  const f = D.flocks.find(x => x.id === flockId);
  if (!f || !f.birthdate) return 0;

  const bkey = f.breed && BREED_CURVES[f.breed]
    ? f.breed
    : (f.targetCurve && BREED_CURVES[f.targetCurve] ? f.targetCurve : 'generic');
  const curve = BREED_CURVES[bkey] || BREED_CURVES.generic;

  const birth = new Date(f.birthdate + 'T12:00:00');
  const from = new Date(fromDate + 'T12:00:00');
  const to = new Date(toDate + 'T12:00:00');

  let total = 0;
  const hens = activeHensByFlock(flockId);

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const ageWeeks = Math.floor((d - birth) / (7 * 24 * 3600000));
    const weekIdx = ageWeeks - 18;
    if (weekIdx < 0) continue;
    const henDay = weekIdx < curve.length ? curve[weekIdx] : curve[curve.length - 1];
    const adj = f.curveAdjust != null ? f.curveAdjust : 1.0;
    total += hens * (henDay / 100) * adj;
  }

  return Math.round(total);
}

// ─── Estimate total production for a plan (all allocated flocks or all active) ───
function estimateTotalProduction(D, plan) {
  if (!plan.flockAllocations || !plan.flockAllocations.length) {
    let total = 0;
    D.flocks.filter(f => f.status !== 'descarte').forEach(f => {
      total += estimateProduction(D, f.id, todayStr(), plan.targetDate);
    });
    return total;
  }
  return plan.flockAllocations.reduce((s, a) => {
    return s + (a.expectedEggs || estimateProduction(D, a.flockId, todayStr(), plan.targetDate));
  }, 0);
}

class EggPlanning extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._editId = null;
  }

  connectedCallback() {
    this.render();

    // Listen for modal save action
    this._unsubs.push(
      Bus.on('modal:action', (ev) => {
        if (ev.action === 'save-plan') {
          this._savePlan(this._editId);
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
    const plans = D.productionPlans || [];

    let h = this._styles();
    h += `<div class="page-header"><h2>${t('plan_title')}</h2>
      <button class="btn btn-primary" data-action="add-plan">${t('plan_add')}</button></div>`;

    if (!plans.length) {
      h += emptyState('\uD83D\uDCC5', t('no_data'));
      this.shadowRoot.innerHTML = h;
      this._bindActions();
      return;
    }

    h += '<div class="plan-grid">';
    plans.forEach(p => {
      const totalExpected = estimateTotalProduction(D, p);
      const gap = totalExpected - p.eggsNeeded;
      const pct = p.eggsNeeded > 0 ? (totalExpected / p.eggsNeeded * 100) : 0;
      const statusColor = pct >= 100
        ? 'var(--success, #2e7d32)'
        : pct >= 80
          ? 'var(--warning, #e65100)'
          : 'var(--danger, #c62828)';
      const statusText = pct >= 100 ? t('plan_on_track') : t('plan_behind');
      const c = D.clients ? D.clients.find(x => x.id === p.clientId) : null;

      h += `<div class="card" style="border-top:3px solid ${statusColor}">
        <div class="card-head">
          <h3>${sanitizeHTML(p.name)}</h3>
          <span class="pct" style="color:${statusColor}">${fmtNum(pct, 0)}%</span>
        </div>
        <p class="card-meta">${t('plan_target_date')}: ${fmtDate(p.targetDate)}${c ? ' | ' + sanitizeHTML(c.name) : ''}</p>
        <div class="stat-row"><span class="stat-label">${t('plan_eggs_needed')}</span><span class="stat-value">${fmtNum(p.eggsNeeded)}</span></div>
        <div class="stat-row"><span class="stat-label">${t('plan_expected')}</span><span class="stat-value">${fmtNum(totalExpected)}</span></div>
        <div class="stat-row"><span class="stat-label">${t('plan_gap')}</span><span class="stat-value" style="color:${statusColor}">${gap > 0 ? '+' : ''}${fmtNum(gap)} (${statusText})</span></div>`;

      if (p.flockAllocations && p.flockAllocations.length) {
        h += '<div class="alloc-list">';
        p.flockAllocations.forEach(a => {
          const fl = D.flocks.find(x => x.id === a.flockId);
          h += `<div class="stat-row"><span class="stat-label">${fl ? sanitizeHTML(fl.name) : '?'}</span><span class="stat-value">${fmtNum(a.expectedEggs)} ${t('eggs_unit')}</span></div>`;
        });
        h += '</div>';
      }

      h += `<div class="btn-group" style="margin-top:12px">
        <button class="btn btn-secondary btn-sm" data-action="edit-plan" data-id="${escapeAttr(p.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-plan" data-id="${escapeAttr(p.id)}">${t('delete')}</button>
      </div></div>`;
    });
    h += '</div>';

    this.shadowRoot.innerHTML = h;
    this._bindActions();
  }

  // ─────────────── STYLES ───────────────
  _styles() {
    return `<style>
      :host { display: block; }
      .empty-state { text-align: center; padding: 40px; color: var(--text-light, #757575); }
      .empty-state .empty-icon { font-size: 48px; margin-bottom: 12px; }
      .empty-state p { margin: 0 0 16px; }
      .page-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
      }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }

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

      /* Plan grid */
      .plan-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
      }

      /* Card */
      .card {
        background: var(--card, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08);
      }
      .card-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 4px;
      }
      .card-head h3 { margin: 0; font-size: 16px; color: var(--text, #212121); }
      .pct { font-weight: 700; font-size: 18px; }
      .card-meta { font-size: 13px; color: var(--text-light, #757575); margin: 0 0 12px; }

      /* Stat rows */
      .stat-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 4px 0; font-size: 13px;
      }
      .stat-label { color: var(--text-light, #757575); }
      .stat-value { font-weight: 600; color: var(--text, #212121); }

      /* Allocation list */
      .alloc-list {
        margin-top: 8px; font-size: 12px;
        border-top: 1px solid var(--border, #eee); padding-top: 8px;
      }

      @media (max-width: 900px) {
        .plan-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 768px) {
        .plan-grid { grid-template-columns: 1fr; }
      }
    </style>`;
  }

  // ─────────────── ACTION BINDING ───────────────
  _bindActions() {
    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'add-plan':
          this._showPlanForm(null);
          break;
        case 'edit-plan':
          this._showPlanForm(btn.dataset.id);
          break;
        case 'delete-plan':
          this._deletePlan(btn.dataset.id);
          break;
      }
    });
  }

  // ─────────────── SHOW PLAN FORM ───────────────
  _showPlanForm(id) {
    this._editId = id || '';
    const D = Store.get();
    const p = id ? (D.productionPlans || []).find(x => x.id === id) : null;

    const defaultTargetDate = p
      ? p.targetDate
      : new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10);

    // Build flock checkboxes with estimated production
    let flockChecks = '';
    D.flocks.filter(f => f.status !== 'descarte').forEach(f => {
      const alloc = p ? (p.flockAllocations || []).find(a => a.flockId === f.id) : null;
      const est = estimateProduction(D, f.id, todayStr(), defaultTargetDate);
      flockChecks += `<div class="check-row">
        <label><input type="checkbox" class="plan-flock" value="${escapeAttr(f.id)}"${alloc ? ' checked' : ''}> ${sanitizeHTML(f.name)}</label>
        <span class="check-est">${t('plan_estimate')}: ~${fmtNum(est)}</span>
      </div>`;
    });

    const body = `
<div class="form-row">
  <div class="form-group">
    <label>${t('plan_name')}</label>
    <input id="pl-name" value="${p ? escapeAttr(p.name) : ''}">
  </div>
  <div class="form-group">
    <label>${t('plan_target_date')}</label>
    <input type="date" id="pl-date" value="${defaultTargetDate}">
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>${t('plan_eggs_needed')}</label>
    <input type="number" id="pl-eggs" value="${p ? p.eggsNeeded : ''}" min="0">
  </div>
  <div class="form-group">
    <label>${t('fin_client')}</label>
    <select id="pl-client">${clientSelect(p ? p.clientId : '')}</select>
  </div>
</div>
<div class="form-group">
  <label>${t('plan_allocations')}</label>
  <div id="pl-flocks">${flockChecks}</div>
</div>
<div class="form-group">
  <label>${t('notes')}</label>
  <textarea id="pl-notes">${p ? escapeAttr(p.notes || '') : ''}</textarea>
</div>
<div class="modal-footer">
  <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
  <button class="btn btn-primary" data-action="save-plan">${t('save')}</button>
</div>`;

    Bus.emit('modal:open', {
      title: p ? t('edit') : t('plan_add'),
      body
    });
  }

  // ─────────────── SAVE PLAN ───────────────
  _savePlan(id) {
    clearFieldErrors();

    const D = Store.get();
    const targetDate = modalVal('pl-date');

    // Gather checked flock allocations
    const checks = modalQueryAll('.plan-flock:checked');
    const allocs = Array.from(checks).map(c => ({
      flockId: c.value,
      expectedEggs: estimateProduction(D, c.value, todayStr(), targetDate)
    }));

    const o = {
      name: modalVal('pl-name'),
      targetDate,
      eggsNeeded: parseInt(modalVal('pl-eggs')) || 0,
      clientId: modalVal('pl-client'),
      notes: modalVal('pl-notes'),
      flockAllocations: allocs
    };

    // Validation
    const v = validateForm({
      'pl-name': { value: o.name, rules: { required: true, maxLength: 100 } },
      'pl-date': { value: o.targetDate, rules: { required: true, date: true } },
      'pl-eggs': { value: modalVal('pl-eggs'), rules: { numeric: true, min: 0 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    // Save: update or create
    if (!D.productionPlans) D.productionPlans = [];

    if (id) {
      const i = D.productionPlans.findIndex(p => p.id === id);
      if (i >= 0) {
        logAudit('update', 'planning', 'Edit plan', D.productionPlans[i], o);
        D.productionPlans[i] = { ...D.productionPlans[i], ...o };
      }
    } else {
      o.id = genId();
      D.productionPlans.push(o);
      logAudit('create', 'planning', 'New plan: ' + o.name, null, o);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─────────────── DELETE PLAN ───────────────
  async _deletePlan(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    if (!D.productionPlans) return;
    logAudit('delete', 'planning', 'Delete plan ' + id, D.productionPlans.find(p => p.id === id), null);
    D.productionPlans = D.productionPlans.filter(p => p.id !== id);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }
}

customElements.define('egg-planning', EggPlanning);
export { EggPlanning, estimateProduction, estimateTotalProduction };
