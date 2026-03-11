// <egg-flocks> — Flocks Management Web Component
// Replaces monolith: renderFlocks, showFlockForm, saveFlock, deleteFlock,
// showFlockRoadmap, breedName, breedInfo, onBreedSelect

import {
  Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate, todayStr, genId,
  validateForm, emptyState, DataTable, COMMERCIAL_BREEDS, VACCINE_SCHEDULE, VENG,
  activeHensByFlock, flockAge, flockLifecycleStage, statusBadge, healthScore,
  healthBadge, flockSelect, supplierSelect, handleSupplierChange, resolveSupplier,
  showFieldError, clearFieldErrors, logAudit, generateVaccineCalendar, catalogSelect
} from '../core/index.js';
import { modalVal, getModalBody, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

// ─── LIFECYCLE constant ───
const LIFECYCLE = [
  { stage: 'pollito', key: 'lc_pollito', weekStart: 0, weekEnd: 4, color: '#FFF9C4', icon: '\uD83D\uDC23', feed: 'lc_feed_starter', temp: '32-35\u00B0C', prod: '-', milestones: 'lc_mile_1' },
  { stage: 'cria', key: 'lc_cria', weekStart: 4, weekEnd: 8, color: '#FFECB3', icon: '\uD83D\uDC24', feed: 'lc_feed_grower', temp: '28-32\u00B0C', prod: '-', milestones: 'lc_mile_2' },
  { stage: 'recria', key: 'lc_recria', weekStart: 8, weekEnd: 18, color: '#C8E6C9', icon: '\uD83D\uDC14', feed: 'lc_feed_developer', temp: '22-28\u00B0C', prod: '-', milestones: 'lc_mile_3' },
  { stage: 'pre_postura', key: 'lc_prepostura', weekStart: 18, weekEnd: 20, color: '#B3E5FC', icon: '\uD83D\uDC14', feed: 'lc_feed_prelay', temp: '20-24\u00B0C', prod: 'lc_prod_first', milestones: 'lc_mile_4' },
  { stage: 'postura_pico', key: 'lc_pico', weekStart: 20, weekEnd: 42, color: '#A5D6A7', icon: '\uD83E\uDD5A', feed: 'lc_feed_layer', temp: '18-24\u00B0C', prod: '90-95%', milestones: 'lc_mile_5' },
  { stage: 'postura_media', key: 'lc_media', weekStart: 42, weekEnd: 62, color: '#FFCC80', icon: '\uD83E\uDD5A', feed: 'lc_feed_layer', temp: '18-24\u00B0C', prod: '80-90%', milestones: 'lc_mile_6' },
  { stage: 'postura_baja', key: 'lc_baja', weekStart: 62, weekEnd: 80, color: '#FFAB91', icon: '\uD83E\uDD5A', feed: 'lc_feed_lowlay', temp: '18-24\u00B0C', prod: '<80%', milestones: 'lc_mile_7' },
  { stage: 'descarte', key: 'lc_descarte', weekStart: 80, weekEnd: 999, color: '#BDBDBD', icon: '\uD83D\uDCE6', feed: '-', temp: '-', prod: '-', milestones: 'lc_mile_8' }
];

/** Resolve lifecycle stage from LIFECYCLE constant using flock age */
function lifecycleStageFromAge(f) {
  const w = flockAge(f).weeks;
  return LIFECYCLE.find(l => w >= l.weekStart && w < l.weekEnd) || LIFECYCLE[LIFECYCLE.length - 1];
}

/** Get breed display name */
function breedName(id) {
  const b = COMMERCIAL_BREEDS.find(x => x.id === id);
  return b ? b.name : (id || '-');
}

/** Get full breed info object */
function breedInfo(id) {
  return COMMERCIAL_BREEDS.find(x => x.id === id) || null;
}

/** Show VENG error/warning panel inside the modal */
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

// ─── Component ───
class EggFlocks extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._vengWarningsShown = false;
  }

  connectedCallback() {
    this.render();
    this._setupBusListeners();
    this._unsubs.push(
      Bus.on('data:changed', () => {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this.render(), 300);
      })
    );
  }

  disconnectedCallback() {
    this.cleanup();
  }

  cleanup() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  _setupBusListeners() {
    // Listen for modal actions (save, roadmap, etc.)
    this._unsubs.push(
      Bus.on('modal:action', (data) => this._onModalAction(data)),
      Bus.on('modal:change', (data) => this._onModalChange(data))
    );
  }

  _onModalAction({ action, id }) {
    switch (action) {
      case 'save-flock':
        this._saveFlock(id || '');
        break;
      case 'view-roadmap':
        if (id) this._showFlockRoadmap(id);
        break;
      case 'edit-flock':
        if (id) this._showFlockForm(id);
        break;
      case 'delete-flock':
        if (id) this._deleteFlock(id);
        break;
    }
  }

  _onModalChange({ change, value }) {
    if (change === 'breed-select') {
      this._onBreedSelect(value);
    }
    if (change === 'supplier-change') {
      const body = getModalBody();
      if (body) {
        const sel = body.querySelector('#f-supplier');
        if (sel) handleSupplierChange(sel);
      }
    }
  }

  // ─── Rendering ───

  render() {
    const D = Store.get();
    let h = this._styles();

    h += `<div class="page-header"><h2>${t('flock_title')}</h2>
      <button class="btn btn-primary" data-action="add-flock">${t('flock_add')}</button></div>`;

    if (!D.flocks.length) {
      h += emptyState('\uD83D\uDC14', t('no_data'), t('flock_add'), '');
    } else {
      const flocksEnriched = D.flocks.map(f => {
        const age = flockAge(f);
        const cur = activeHensByFlock(f.id);
        const hs = healthScore(f.id);
        const lc = lifecycleStageFromAge(f);
        const bi = breedInfo(f.breed || f.targetCurve);
        return { ...f, _age: age, _cur: cur, _hs: hs, _lc: lc, _bi: bi };
      });

      h += DataTable.create({
        id: 'flocks',
        data: flocksEnriched,
        emptyIcon: '\uD83D\uDC14',
        emptyText: t('no_data'),
        columns: [
          {
            key: 'name', label: t('flock_name'), type: 'text', sortable: true, filterable: true,
            render: r => '<strong>' + sanitizeHTML(r.name) + '</strong>'
          },
          {
            key: '_breed', label: t('flock_breed'), type: 'text', sortable: true,
            getValue: r => breedName(r.breed || r.targetCurve),
            render: r => sanitizeHTML(breedName(r.breed || r.targetCurve)) +
              (r._bi && r._bi.eggColor !== '-' ? '<br><small style="color:var(--text-light)">' + sanitizeHTML(r._bi.eggColor) + '</small>' : '')
          },
          {
            key: 'count', label: t('flock_count'), type: 'number', sortable: true,
            render: r => fmtNum(r.count)
          },
          {
            key: '_cur', label: t('flock_current'), type: 'number', sortable: true,
            render: r => fmtNum(r._cur)
          },
          {
            key: '_ageWeeks', label: t('flock_age'), type: 'number', sortable: true,
            getValue: r => r._age.weeks,
            render: r => r._age.weeks + ' ' + t('flock_weeks') + ' (' + r._age.days + ' ' + t('flock_days') + ')'
          },
          {
            key: '_lcStage', label: t('lc_current_stage'), type: 'text', sortable: true,
            getValue: r => r._lc.stage,
            render: r => '<span style="background:' + r._lc.color + ';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">' + r._lc.icon + ' ' + t(r._lc.key) + '</span>'
          },
          {
            key: 'status', label: t('flock_status'), type: 'text', sortable: true, filterable: true,
            filterType: 'select',
            filterOptions: [
              { value: 'cria', label: t('flock_status_cria') },
              { value: 'recria', label: t('flock_status_recria') },
              { value: 'produccion', label: t('flock_status_produccion') },
              { value: 'descarte', label: t('flock_status_descarte') }
            ],
            render: r => statusBadge(r.status)
          },
          {
            key: '_hs', label: t('flock_health'), type: 'number', sortable: true,
            render: r => healthBadge(r._hs)
          }
        ],
        actions: r => `<div class="btn-group" style="flex-wrap:nowrap;gap:4px">
          <button class="btn btn-secondary btn-sm" data-action="edit-flock" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
          <button class="btn btn-sm" style="background:var(--accent,#FF8F00);color:#fff" data-action="view-roadmap" data-id="${escapeAttr(r.id)}">${t('flock_roadmap')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-flock" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
        </div>`,
        bulkActions: [{
          label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
          action: ids => {
            showConfirm(t('confirm_delete')).then(yes => {
              if (!yes) return;
              const D2 = Store.get();
              D2.flocks = D2.flocks.filter(f => !ids.includes(f.id));
              // Cascade delete related data for each flock
              ids.forEach(fid => {
                D2.dailyProduction = D2.dailyProduction.filter(p => p.flockId !== fid);
                D2.vaccines = D2.vaccines.filter(v => v.flockId !== fid);
                D2.medications = D2.medications.filter(m => m.flockId !== fid);
                D2.outbreaks = D2.outbreaks.filter(o => o.flockId !== fid);
                D2.feed.consumption = D2.feed.consumption.filter(c => c.flockId !== fid);
                D2.traceability.batches = D2.traceability.batches.filter(b => b.flockId !== fid);
                D2.productionPlans = (D2.productionPlans || []).filter(p => p.flockId !== fid);
              });
              Store.save(D2);
              this.render();
            });
          }
        }]
      });
    }

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;

    // DataTable interactivity (sort, filter, paginate, bulk, export)
    DataTable.handleEvent(root, () => this.render());

    // Click delegation for local actions
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'add-flock':
          this._showFlockForm(null);
          break;
        case 'edit-flock':
          this._showFlockForm(id);
          break;
        case 'view-roadmap':
          this._showFlockRoadmap(id);
          break;
        case 'delete-flock':
          this._deleteFlock(id);
          break;
      }
    });

    // Empty state button click
    const emptyBtn = root.querySelector('.empty-state .btn');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', () => this._showFlockForm(null));
    }
  }

  // ─── showFlockForm ───

  _showFlockForm(id) {
    const D = Store.get();
    const f = id ? D.flocks.find(x => x.id === id) : null;
    this._vengWarningsShown = false;

    const breedOptions = COMMERCIAL_BREEDS.map(b =>
      `<option value="${escapeAttr(b.id)}"${(f && (f.breed === b.id || f.targetCurve === b.id)) ? ' selected' : ''}>${sanitizeHTML(b.name)}${b.type !== '-' ? ' (' + sanitizeHTML(b.type) + ')' : ''}</option>`
    ).join('');

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('flock_name')}</label><input id="f-name" value="${f ? escapeAttr(f.name) : ''}"></div>
        <div class="form-group"><label>${t('flock_breed')}</label>
          <select id="f-breed" data-change="breed-select">${breedOptions}</select>
        </div>
      </div>
      <div id="breed-info" style="background:var(--card-bg,#f0f4f8);border-radius:8px;padding:8px 12px;margin:-4px 0 8px;font-size:.85em;display:block"></div>
      <div class="form-row">
        <div class="form-group"><label>${t('flock_housing')}</label>
          <select id="f-housing">
            <option value="floor"${f && f.housingType === 'floor' ? ' selected' : ''}>${t('flock_housing_floor')}</option>
            <option value="cage"${f && f.housingType === 'cage' ? ' selected' : ''}>${t('flock_housing_cage')}</option>
            <option value="free"${f && f.housingType === 'free' ? ' selected' : ''}>${t('flock_housing_free')}</option>
          </select>
        </div>
        <div class="form-group"><label>${t('flock_egg_color')}</label>
          <input id="f-egg-color" readonly style="background:var(--card-bg,#f0f4f8);cursor:default">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('flock_count')}</label><input type="number" id="f-count" value="${f ? f.count : ''}" data-autocalc="count"></div>
        <div class="form-group"><label>${t('flock_status')}</label>
          <select id="f-status">
            <option value="cria"${f && f.status === 'cria' ? ' selected' : ''}>${t('flock_status_cria')}</option>
            <option value="recria"${f && f.status === 'recria' ? ' selected' : ''}>${t('flock_status_recria')}</option>
            <option value="produccion"${(!f || f.status === 'produccion') ? ' selected' : ''}>${t('flock_status_produccion')}</option>
            <option value="descarte"${f && f.status === 'descarte' ? ' selected' : ''}>${t('flock_status_descarte')}</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('flock_birthdate')}</label><input type="date" id="f-birth" value="${f ? f.birthDate : ''}"></div>
        <div class="form-group"><label>${t('flock_purchase_date')}</label><input type="date" id="f-purchase" value="${f ? f.purchaseDate : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('flock_supplier')}</label>
          <select id="f-supplier" data-change="supplier-change">${supplierSelect(f ? f.supplier : '')}</select>
        </div>
        <div class="form-group"><label>${t('flock_cost')}</label><input type="number" id="f-cost" value="${f ? f.cost : ''}" data-autocalc="cost"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('flock_purchase_cost')} <small style="color:var(--text-light);font-weight:400">(${t('auto_calculated') || 'auto'})</small></label>
          <input type="number" step="0.01" min="0" id="f-pcost" value="${f && f.purchaseCostPerBird != null ? f.purchaseCostPerBird : ''}" readonly style="background:var(--card-bg,#f0f4f8);cursor:default">
        </div>
        <div class="form-group"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t('flock_curve_adjust') || 'Curve Adjust'} (0.5-1.5)
            <button type="button" class="info-toggle" data-action="toggle-curve-help" title="Info" style="background:none;border:1px solid var(--border,#ccc);border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;margin-left:6px;color:var(--primary,#1565C0);vertical-align:middle;line-height:1;padding:0">\u24D8</button>
          </label>
          <input type="number" id="f-curve" value="${f && f.curveAdjust != null ? f.curveAdjust : 1.0}" min="0.5" max="1.5" step="0.05">
          <small style="color:var(--text-light);display:block;margin-top:4px">${t('flock_curve_tip') || '1.0=standard, 0.85=tropical, 1.1=temperate'}</small>
          <div id="curve-help-panel" style="display:none;background:var(--card-bg,#e8f0fe);border-radius:8px;padding:10px 14px;margin-top:8px;font-size:13px;line-height:1.5;border-left:3px solid var(--primary,#1565C0)">
            <strong>${t('flock_curve_help_title') || 'Curve Adjust'}</strong><br>
            ${t('flock_curve_help') || 'The curve adjust factor modifies the standard production curve of the selected breed. A value of 1.0 means standard production. Values below 1.0 (e.g. 0.85) model reduced production (tropical climates, stress). Values above 1.0 (e.g. 1.1) model higher production (optimal conditions, temperate climates). This affects production projections and planning.'}
          </div>
        </div>
      </div>
      <div class="form-group"><label>${t('flock_notes')}</label><textarea id="f-notes">${f ? escapeAttr(f.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-flock" data-id="${id || ''}">${t('save')}</button>
      </div>`;

    Bus.emit('modal:open', {
      title: f ? t('flock_edit') : t('flock_add'),
      body
    });

    // Trigger initial breed info update + wire auto-calc + info toggle after modal renders
    setTimeout(() => {
      const mb = getModalBody();
      if (mb) {
        const sel = mb.querySelector('#f-breed');
        if (sel) this._onBreedSelect(sel.value);

        // Auto-calculate cost per bird
        const autoCalc = () => {
          const count = parseInt(mb.querySelector('#f-count')?.value) || 0;
          const total = parseFloat(mb.querySelector('#f-cost')?.value) || 0;
          const pcost = mb.querySelector('#f-pcost');
          if (pcost) {
            pcost.value = (count > 0 && total > 0) ? Math.round(total / count * 100) / 100 : '';
          }
        };
        mb.querySelectorAll('[data-autocalc]').forEach(el => el.addEventListener('input', autoCalc));
        autoCalc(); // Run on open for edit mode

        // Curve help toggle
        const helpBtn = mb.querySelector('[data-action="toggle-curve-help"]');
        const helpPanel = mb.querySelector('#curve-help-panel');
        if (helpBtn && helpPanel) {
          helpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
          });
        }
      }
    }, 60);
  }

  // ─── onBreedSelect ───

  _onBreedSelect(breedId) {
    const b = COMMERCIAL_BREEDS.find(x => x.id === breedId);
    let infoHtml = '';
    let eggColor = '';
    if (b && b.type !== '-') {
      infoHtml = `<strong>${sanitizeHTML(b.name)}</strong> \u2014 ${sanitizeHTML(String(b.eggsYear))} huevos/a\u00F1o \u00B7 Peso: ${sanitizeHTML(String(b.eggWeight))} \u00B7 FCR: ${sanitizeHTML(String(b.fcr))}<br><span style="color:var(--text-secondary,#666)">${sanitizeHTML(b.notes)}</span>`;
      eggColor = b.eggColor;
    }

    // Update breed-info div inside modal
    Bus.emit('modal:update-body', { selector: '#breed-info', html: infoHtml });

    // Update egg color input
    const body = getModalBody();
    if (body) {
      const infoEl = body.querySelector('#breed-info');
      if (infoEl) infoEl.style.display = (b && b.type !== '-') ? 'block' : 'none';
      const ecEl = body.querySelector('#f-egg-color');
      if (ecEl) ecEl.value = eggColor;
    }
  }

  // ─── saveFlock ───

  _saveFlock(id) {
    const body = getModalBody();
    if (!body) return;

    clearFieldErrors(body);

    const D = Store.get();
    const breedId = modalVal('f-breed');
    const supplierEl = body.querySelector('#f-supplier');

    const o = {
      name: modalVal('f-name'),
      breed: breedId,
      count: parseInt(modalVal('f-count')) || 0,
      status: modalVal('f-status'),
      housingType: modalVal('f-housing') || 'floor',
      targetCurve: breedId,
      curveAdjust: parseFloat(modalVal('f-curve')) || 1.0,
      birthDate: modalVal('f-birth'),
      purchaseDate: modalVal('f-purchase'),
      supplier: supplierEl ? resolveSupplier(supplierEl) : '',
      cost: parseFloat(modalVal('f-cost')) || 0,
      purchaseCostPerBird: (parseInt(modalVal('f-count')) > 0 && parseFloat(modalVal('f-cost')) > 0) ? Math.round(parseFloat(modalVal('f-cost')) / parseInt(modalVal('f-count')) * 100) / 100 : null,
      notes: modalVal('f-notes')
    };

    // Basic validation
    const v = validateForm({
      'f-name': { value: o.name, rules: { required: true, maxLength: 100 } },
      'f-count': { value: modalVal('f-count'), rules: { required: true, numeric: true, min: 1 } },
      'f-birth': { value: o.birthDate, rules: { required: true, date: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(body, k, e[0]));
      return;
    }

    // VENG validation
    if (!this._vengWarningsShown) {
      const vr = VENG.gate.flock(o, D);
      if (!vr.ok) {
        vr.errors.forEach(e => {
          if (e.field) showFieldError(body, e.field, e.msg);
        });
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

    // Save
    if (id) {
      const i = D.flocks.findIndex(f => f.id === id);
      if (i >= 0) {
        logAudit('update', 'flocks', 'Edit flock: ' + o.name, D.flocks[i], o);
        D.flocks[i] = { ...D.flocks[i], ...o };
      }
    } else {
      o.id = genId();
      D.flocks.push(o);

      // Auto-generate vaccine calendar for new flocks
      if (o.birthDate) generateVaccineCalendar(o);

      // Auto-create expense if cost > 0
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
        logAudit('create', 'expenses', 'Auto expense from flock: ' + o.name, null, exp);
      }

      logAudit('create', 'flocks', 'New flock: ' + o.name, null, o);
    }

    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── deleteFlock (cascade) ───

  async _deleteFlock(id) {
    const confirmed = await showConfirm(t('confirm_delete'));
    if (!confirmed) return;

    const D = Store.get();
    const old = D.flocks.find(f => f.id === id);

    D.flocks = D.flocks.filter(f => f.id !== id);
    D.dailyProduction = D.dailyProduction.filter(p => p.flockId !== id);
    D.vaccines = D.vaccines.filter(v => v.flockId !== id);
    D.medications = D.medications.filter(m => m.flockId !== id);
    D.outbreaks = D.outbreaks.filter(o => o.flockId !== id);
    D.feed.consumption = D.feed.consumption.filter(c => c.flockId !== id);
    D.traceability.batches = D.traceability.batches.filter(b => b.flockId !== id);
    D.productionPlans = (D.productionPlans || []).filter(p => p.flockId !== id);

    logAudit('delete', 'flocks', 'Delete flock: ' + (old ? old.name : id), old, null);
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── showFlockRoadmap ───

  _showFlockRoadmap(fid) {
    const D = Store.get();
    const f = D.flocks.find(x => x.id === fid);
    if (!f) return;

    const age = flockAge(f);
    const currentLC = lifecycleStageFromAge(f);

    let h = `<h3 style="margin-bottom:8px">${sanitizeHTML(f.name)} \u2014 ${t('flock_lifecycle')}</h3>
      <p style="color:var(--text-light);margin-bottom:16px">${t('flock_age')}: ${age.weeks} ${t('flock_weeks')} | ${t('lc_current_stage')}: ${currentLC.icon} ${t(currentLC.key)}</p>`;

    // Lifecycle bar
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

    // Lifecycle detail cards
    h += '<div class="lifecycle-detail">';
    LIFECYCLE.forEach(l => {
      const isCurrent = l.stage === currentLC.stage;
      h += `<div class="lifecycle-card" style="background:${l.color};${isCurrent ? 'box-shadow:0 0 0 3px var(--primary)' : ''}">
        <div class="lc-icon">${l.icon}</div><div class="lc-name">${t(l.key)}</div>
        <div class="lc-weeks">${t('lc_weeks')}: ${l.weekStart}-${l.weekEnd === 999 ? '80+' : l.weekEnd}</div>
        <div class="lc-info"><strong>${t('lc_feed')}:</strong> ${l.feed === '-' ? '-' : t(l.feed)}<br>
        <strong>${t('lc_temp')}:</strong> ${l.temp}<br>
        <strong>${t('lc_prod_label')}:</strong> ${l.prod.startsWith('lc_') ? t(l.prod) : l.prod}<br>
        <strong>${t('lc_milestone')}:</strong> ${t(l.milestones)}</div></div>`;
    });
    h += '</div>';

    // Vaccine timeline for this flock
    const vaccines = D.vaccines.filter(v => v.flockId === fid).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    if (vaccines.length) {
      h += `<h3 style="margin-top:16px">${t('san_vaccines')}</h3>
        <div class="table-wrap" style="margin-top:8px"><table><thead><tr>
          <th>${t('vac_vaccine')}</th><th>${t('vac_scheduled')}</th><th>${t('vac_route')}</th><th>${t('status')}</th>
        </tr></thead><tbody>`;
      vaccines.forEach(v => {
        const vStatus = v.status === 'applied' ? 'applied' : (v.scheduledDate < todayStr() ? 'overdue' : 'pending');
        h += `<tr><td>${sanitizeHTML(v.vaccineName)}</td><td>${fmtDate(v.scheduledDate)}</td><td>${t(v.route)}</td><td>${statusBadge(vStatus)}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }

    Bus.emit('modal:open', {
      title: t('flock_lifecycle') + ' \u2014 ' + sanitizeHTML(f.name),
      body: h
    });
  }

  // ─── Styles ───

  _styles() {
    return `<style>
      :host { display: block; }

      /* Page layout */
      .page-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
      }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }

      /* KPI grid */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 12px; margin-bottom: 16px;
      }

      /* Lifecycle bar */
      .lifecycle-bar {
        display: flex; border-radius: 8px; overflow: hidden;
        height: 36px; margin: 16px 0;
      }
      .lifecycle-stage {
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; transition: all 0.3s; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis; padding: 0 4px;
      }
      .lifecycle-stage.current { font-weight: 800; }

      /* Lifecycle detail cards */
      .lifecycle-detail {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px; margin-top: 12px;
      }
      .lifecycle-card {
        border-radius: 8px; padding: 12px; text-align: center;
      }
      .lifecycle-card .lc-icon { font-size: 24px; margin-bottom: 4px; }
      .lifecycle-card .lc-name { font-weight: 700; margin-bottom: 4px; }
      .lifecycle-card .lc-weeks { font-size: 12px; color: var(--text-secondary, #555); margin-bottom: 6px; }
      .lifecycle-card .lc-info { font-size: 12px; text-align: left; line-height: 1.5; }

      /* Buttons */
      .btn {
        padding: 8px 16px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); background: var(--bg, #fff);
        cursor: pointer; font-size: 14px; font-weight: 600;
        transition: background 0.2s;
      }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-primary:hover { filter: brightness(1.1); }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); color: var(--text, #212121); }
      .btn-secondary:hover { filter: brightness(0.95); }
      .btn-danger { background: var(--danger, #C62828); color: #fff; border: none; }
      .btn-danger:hover { filter: brightness(1.1); }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }
      .btn:hover { opacity: 0.9; }

      /* Badges */
      .badge {
        display: inline-block; padding: 2px 10px; border-radius: 12px;
        font-size: 12px; font-weight: 600;
      }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .badge-warning { background: #fff8e1; color: #e65100; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-danger { background: #ffebee; color: #c62828; }
      .badge-secondary { background: #f5f5f5; color: #757575; }

      /* Health score */
      .health-score { font-weight: 700; padding: 2px 8px; border-radius: 4px; }
      .health-score.good { background: #e8f5e9; color: #2e7d32; }
      .health-score.warn { background: #fff9c4; color: #f57f17; }
      .health-score.bad { background: #ffebee; color: #c62828; }

      /* Card */
      .card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }

      /* Table */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }

      /* Empty state */
      .empty-state {
        text-align: center; padding: 40px; color: var(--text-light, #757575);
      }
      .empty-state .empty-icon { font-size: 48px; margin-bottom: 12px; }
      .empty-state p { margin: 0 0 16px; }

      /* DataTable styles (inherited from global) */
      .dt-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
      .dt-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .dt-search-input {
        padding: 6px 12px; border: 1px solid var(--border, #ddd);
        border-radius: 6px; font-size: 14px; min-width: 200px;
        background: var(--bg, #fff); color: var(--text, #212121);
      }
      .dt-search-input:focus { outline: none; border-color: var(--primary, #1A3C6E); }
      .dt-btn { font-size: 12px; }
      .dt-page-size {
        padding: 4px 8px; border: 1px solid var(--border, #ddd);
        border-radius: 6px; font-size: 12px; background: var(--bg, #fff);
      }
      .dt-col-picker-wrap { position: relative; }
      .dt-column-picker {
        position: absolute; right: 0; top: 100%; background: var(--bg, #fff);
        border: 1px solid var(--border, #ddd); border-radius: 8px; padding: 8px;
        z-index: 100; box-shadow: 0 4px 16px rgba(0,0,0,.15); min-width: 180px;
      }
      .dt-col-option { display: block; padding: 4px 0; font-size: 13px; cursor: pointer; }
      .dt-col-option input { margin-right: 6px; }
      .dt-card-wrap { padding: 0; }
      .dt-table-desktop { overflow-x: auto; }
      .dt-table { width: 100%; }
      .dt-th { white-space: nowrap; }
      .dt-sortable { cursor: pointer; user-select: none; }
      .dt-sortable:hover { background: var(--primary-fill, #e8edf3); }
      .dt-sorted { background: var(--primary-fill, #e8edf3); }
      .dt-th-check { width: 40px; }
      .dt-td-check { width: 40px; }
      .dt-row-selected { background: var(--primary-fill, #e8edf3); }
      .dt-filter-row td { padding: 4px 6px; }
      .dt-filter-select, .dt-filter-input, .dt-filter-date, .dt-filter-num {
        width: 100%; padding: 4px 6px; border: 1px solid var(--border, #ddd);
        border-radius: 4px; font-size: 12px; box-sizing: border-box;
        background: var(--bg, #fff); color: var(--text, #212121);
      }
      .dt-bulk-bar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 12px; background: var(--primary-fill, #e8edf3);
        border-radius: 6px; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;
      }
      .dt-bulk-count { font-weight: 600; font-size: 13px; }
      .dt-bulk-actions { display: flex; gap: 6px; }
      .dt-pagination {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: 12px; flex-wrap: wrap; gap: 8px;
      }
      .dt-page-info { font-size: 13px; color: var(--text-light, #888); }
      .dt-page-buttons { display: flex; gap: 4px; }
      .dt-footer-info { font-size: 13px; color: var(--text-light, #888); margin-top: 8px; }

      /* Mobile cards */
      .dt-mobile-cards { display: none; }
      .dt-card {
        background: var(--bg, #fff); border-radius: 8px; padding: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 8px;
      }
      .dt-card-selected { background: var(--primary-fill, #e8edf3); }
      .dt-card-check { margin-bottom: 8px; }
      .dt-card-title { font-weight: 700; font-size: 15px; margin-bottom: 8px; }
      .dt-card-field { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
      .dt-card-label { color: var(--text-light, #888); }
      .dt-card-actions { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }

      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 768px) {
        .dt-table-desktop { display: none; }
        .dt-mobile-cards { display: block; }
        .lifecycle-detail { grid-template-columns: repeat(2, 1fr); }
        .lifecycle-stage { font-size: 9px; }
      }
      @media (max-width: 480px) {
        .lifecycle-detail { grid-template-columns: 1fr; }
        .kpi-grid { grid-template-columns: 1fr; }
      }
    </style>`;
  }
}

customElements.define('egg-flocks', EggFlocks);
