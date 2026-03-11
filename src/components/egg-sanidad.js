// <egg-sanidad> — Health/Sanidad module Web Component
// Tabs: Vaccines, Medications, Outbreaks, Stress Events
// Replaces renderSanidad() and all related functions from the monolith

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate, todayStr, genId, validateForm, emptyState, DataTable, CATALOGS, VACCINE_SCHEDULE, flockSelect, catalogSelect, statusBadge, showFieldError, clearFieldErrors, logAudit, generateVaccineCalendar } from '../core/index.js';
import { modalVal, getModalBody, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

class EggSanidad extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'vaccines';
    this._unsubs = [];
    this._dtBound = false;
  }

  connectedCallback() {
    this.render();
    this._bindEvents();

    this._unsubs.push(
      Bus.on('modal:action', (e) => this._onModalAction(e)),
      Bus.on('modal:change', (e) => this._onModalChange(e)),
      Bus.on('data:changed', () => this.render())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() {
    // No charts or long-lived resources to destroy
  }

  // ─── RENDER ───────────────────────────────────────────────

  render() {
    const D = Store.get();
    let h = this._css();

    h += `<div class="page-header"><h2>${t('san_title')}</h2></div>`;
    h += `<div class="tabs">
      <div class="tab${this._currentTab === 'vaccines' ? ' active' : ''}" data-tab="vaccines">\uD83D\uDC89 ${t('san_vaccines')}</div>
      <div class="tab${this._currentTab === 'medications' ? ' active' : ''}" data-tab="medications">\uD83D\uDC8A ${t('san_medications')}</div>
      <div class="tab${this._currentTab === 'outbreaks' ? ' active' : ''}" data-tab="outbreaks">\uD83E\uDDA0 ${t('san_outbreaks')}</div>
      <div class="tab${this._currentTab === 'stress' ? ' active' : ''}" data-tab="stress">\u26A1 ${t('stress_title')}</div>
    </div>`;

    if (this._currentTab === 'vaccines') h += this._renderVaccinesTab(D);
    else if (this._currentTab === 'medications') h += this._renderMedicationsTab(D);
    else if (this._currentTab === 'outbreaks') h += this._renderOutbreaksTab(D);
    else h += this._renderStressEventsTab(D);

    h += '<div id="san-content-end"></div>';
    this.shadowRoot.innerHTML = h;
    this._bindTabEvents();

    // Bind DataTable event delegation to shadow root
    if (!this._dtBound) {
      DataTable.handleEvent(this.shadowRoot, () => this.render());
      this._dtBound = true;
    }
  }

  // ─── EVENTS ───────────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.action;

      switch (action) {
        case 'show-gen-vaccines': this._showGenVaccines(); break;
        case 'show-vaccine-form': this._showVaccineForm(btn.dataset.id || ''); break;
        case 'mark-vaccine-applied-inline': this._markVaccineApplied(btn.dataset.id); break;
        case 'delete-vaccine-inline': this._deleteVaccine(btn.dataset.id); break;
        case 'show-med-form': this._showMedForm(btn.dataset.id || ''); break;
        case 'delete-med-inline': this._deleteMed(btn.dataset.id); break;
        case 'show-outbreak-form': this._showOutbreakForm(btn.dataset.id || ''); break;
        case 'delete-outbreak-inline': this._deleteOutbreak(btn.dataset.id); break;
        case 'show-stress-form': this._showStressForm(btn.dataset.id || ''); break;
        case 'delete-stress-inline': this._deleteStress(btn.dataset.id); break;
      }
    });
  }

  _bindTabEvents() {
    this.shadowRoot.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._currentTab = tab.dataset.tab;
        this.render();
      });
    });
  }

  _onModalAction(e) {
    switch (e.action) {
      case 'save-vaccine': this._saveVaccine(e.editId || ''); break;
      case 'save-medication': this._saveMed(e.editId || ''); break;
      case 'save-outbreak': this._saveOutbreak(e.editId || ''); break;
      case 'save-stress': this._saveStress(e.editId || ''); break;
      case 'mark-vaccine-applied': this._markVaccineApplied(e.vacId); break;
      case 'do-gen-vaccines': this._doGenVaccines(); break;
    }
  }

  _onModalChange(e) {
    if (e.change === 'med-select') {
      this._onMedSelect();
    }
  }

  // ─── TAB 1: VACCINES ─────────────────────────────────────

  _renderVaccinesTab(D) {
    const today = todayStr();
    const vacs = (D.vaccines || []).map(v => {
      const eff = v.status === 'applied' ? 'applied' : v.scheduledDate < today ? 'overdue' : 'pending';
      return { ...v, effectiveStatus: eff };
    });

    return DataTable.create({
      id: 'vaccines',
      data: vacs,
      onRefresh: () => this.render(),
      emptyIcon: '\uD83D\uDC89',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px">
        <h3>${t('vac_title')}</h3>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" data-action="show-gen-vaccines">${t('vac_generate')}</button>
          <button class="btn btn-primary btn-sm" data-action="show-vaccine-form">${t('vac_add')}</button>
        </div>
      </div>`,
      columns: [
        {
          key: 'flockId', label: t('prod_flock'), type: 'text', sortable: true, filterable: true,
          filterType: 'select', filterOptions: D.flocks.map(f => ({ value: f.id, label: f.name })),
          render: r => { const f = D.flocks.find(x => x.id === r.flockId); return f ? sanitizeHTML(f.name) : '-'; }
        },
        { key: 'vaccineName', label: t('vac_vaccine'), type: 'text', sortable: true },
        { key: 'route', label: t('vac_route'), type: 'text', render: r => r.route ? t(r.route) : '-' },
        { key: 'scheduledDate', label: t('vac_scheduled'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        { key: 'appliedDate', label: t('vac_applied'), type: 'date', sortable: true, render: r => r.appliedDate ? fmtDate(r.appliedDate) : '-' },
        { key: 'batchNumber', label: t('vac_batch'), type: 'text' },
        {
          key: 'effectiveStatus', label: t('status'), type: 'text', sortable: true, filterable: true,
          filterType: 'select',
          filterOptions: [
            { value: 'pending', label: t('vac_pending') },
            { value: 'overdue', label: t('vac_overdue') },
            { value: 'applied', label: t('vac_applied_status') }
          ],
          render: r => statusBadge(r.effectiveStatus)
        }
      ],
      actions: r => `<div class="btn-group">
        ${r.effectiveStatus !== 'applied' ? `<button class="btn btn-primary btn-sm" data-action="mark-vaccine-applied-inline" data-id="${escapeAttr(r.id)}">${t('vac_mark_applied')}</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-action="show-vaccine-form" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-vaccine-inline" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
        action: ids => {
          showConfirm(t('confirm_delete')).then(ok => {
            if (!ok) return;
            const D2 = Store.get();
            ids.forEach(id => { D2.vaccines = D2.vaccines.filter(v => v.id !== id); });
            Store.save(D2, 'bulk-delete-vaccines');
            this.render();
          });
        }
      }]
    });
  }

  _showGenVaccines() {
    const D = Store.get();
    const flocks = D.flocks.filter(f => f.birthDate && f.status !== 'descarte');
    if (!flocks.length) {
      Bus.emit('toast', { msg: t('no_flocks_birthdate'), type: 'error' });
      return;
    }
    let body = `<p>${t('vac_select_flocks')}</p>`;
    flocks.forEach(f => {
      body += `<div class="checklist-item"><input type="checkbox" id="gv-${escapeAttr(f.id)}" checked><span>${sanitizeHTML(f.name)} (${fmtDate(f.birthDate)})</span></div>`;
    });
    body += `<div class="modal-footer">
      <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
      <button class="btn btn-primary" data-action="do-gen-vaccines">${t('vac_generate')}</button>
    </div>`;
    Bus.emit('modal:open', { title: t('vac_generate'), body });
  }

  _doGenVaccines() {
    const D = Store.get();
    const modalBody = getModalBody();
    D.flocks.filter(f => f.birthDate && f.status !== 'descarte').forEach(f => {
      const cb = modalBody ? modalBody.querySelector('#gv-' + f.id) : null;
      if (cb && cb.checked) generateVaccineCalendar(f);
    });
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  _showVaccineForm(id) {
    const D = Store.get();
    const v = id ? D.vaccines.find(x => x.id === id) : null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('prod_flock')}</label><select id="v-flock">${flockSelect(v ? v.flockId : '')}</select></div>
        <div class="form-group"><label>${t('vac_vaccine')}</label><select id="v-name">${catalogSelect(VACCINE_SCHEDULE.map(vs => vs.name), v ? v.vaccineName : '')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('vac_route')}</label><select id="v-route">
          <option value="">--</option>
          <option value="vac_route_injection"${v && v.route === 'vac_route_injection' ? ' selected' : ''}>${t('vac_route_injection')}</option>
          <option value="vac_route_ocular"${v && v.route === 'vac_route_ocular' ? ' selected' : ''}>${t('vac_route_ocular')}</option>
          <option value="vac_route_water"${v && v.route === 'vac_route_water' ? ' selected' : ''}>${t('vac_route_water')}</option>
          <option value="vac_route_wing"${v && v.route === 'vac_route_wing' ? ' selected' : ''}>${t('vac_route_wing')}</option>
        </select></div>
        <div class="form-group"><label>${t('vac_batch')}</label><input id="v-batch" value="${v ? escapeAttr(v.batchNumber) : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('vac_scheduled')}</label><input type="date" id="v-sched" value="${v ? v.scheduledDate : ''}"></div>
        <div class="form-group"><label>${t('vac_applied')}</label><input type="date" id="v-applied" value="${v ? v.appliedDate : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('health_cost')} (${t('cancel').charAt(0) === 'C' ? 'optional' : 'opcional'})</label><input type="number" step="0.01" min="0" id="v-cost" value="${v && v.cost != null ? v.cost : ''}"></div>
        <div class="form-group"></div>
      </div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="v-notes">${v ? escapeAttr(v.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-vaccine" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: v ? t('edit') : t('vac_add'), body });
  }

  _saveVaccine(id) {
    clearFieldErrors();
    const D = Store.get();
    const flock = modalVal('v-flock');
    const vaccineName = modalVal('v-name');
    const route = modalVal('v-route');
    const batchNumber = modalVal('v-batch');
    const scheduledDate = modalVal('v-sched');
    const appliedDate = modalVal('v-applied');
    const costStr = modalVal('v-cost');
    const notes = modalVal('v-notes');

    const o = {
      flockId: flock, vaccineName, route, batchNumber,
      scheduledDate, appliedDate,
      cost: costStr ? parseFloat(costStr) : null,
      notes,
      status: appliedDate ? 'applied' : 'pending'
    };

    const v = validateForm({
      'v-flock': { value: o.flockId, rules: { required: true } },
      'v-name': { value: o.vaccineName, rules: { required: true } },
      'v-sched': { value: o.scheduledDate, rules: { required: true, date: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (id) {
      const i = D.vaccines.findIndex(x => x.id === id);
      if (i >= 0) D.vaccines[i] = { ...D.vaccines[i], ...o };
    } else {
      o.id = genId();
      D.vaccines.push(o);
    }
    Store.save(D, 'save-vaccine');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  _markVaccineApplied(id) {
    const D = Store.get();
    const v = D.vaccines.find(x => x.id === id);
    if (!v) return;
    v.appliedDate = todayStr();
    v.status = 'applied';
    Store.save(D, 'mark-vaccine-applied');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteVaccine(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.vaccines = D.vaccines.filter(v => v.id !== id);
    Store.save(D, 'delete-vaccine');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── TAB 2: MEDICATIONS ──────────────────────────────────

  _renderMedicationsTab(D) {
    const today = todayStr();
    const meds = (D.medications || []).map(m => {
      const inWD = m.withdrawalEnd && m.withdrawalEnd >= today;
      return { ...m, wdStatus: inWD ? 'withdrawal' : 'ok' };
    });

    return DataTable.create({
      id: 'medications',
      data: meds,
      onRefresh: () => this.render(),
      emptyIcon: '\uD83D\uDC8A',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px">
        <h3>${t('med_title')}</h3>
        <button class="btn btn-primary btn-sm" data-action="show-med-form">${t('med_add')}</button>
      </div>`,
      columns: [
        {
          key: 'flockId', label: t('prod_flock'), type: 'text', sortable: true, filterable: true,
          filterType: 'select', filterOptions: D.flocks.map(f => ({ value: f.id, label: f.name })),
          render: r => { const f = D.flocks.find(x => x.id === r.flockId); return f ? sanitizeHTML(f.name) : '-'; }
        },
        { key: 'name', label: t('med_name'), type: 'text', sortable: true, filterable: true, render: r => sanitizeHTML(r.name) },
        { key: 'reason', label: t('med_reason'), type: 'text', sortable: true, render: r => sanitizeHTML(r.reason || '-') },
        { key: 'dosage', label: t('med_dosage'), type: 'text', render: r => sanitizeHTML(r.dosage || '-') },
        { key: 'startDate', label: t('med_start'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        { key: 'endDate', label: t('med_end'), type: 'date', sortable: true },
        { key: 'withdrawalDays', label: t('med_withdrawal'), type: 'number', sortable: true, render: r => r.withdrawalDays || '-' },
        { key: 'withdrawalEnd', label: t('med_withdrawal_end'), type: 'date', sortable: true },
        {
          key: 'wdStatus', label: t('status'), type: 'text', sortable: true, filterable: true,
          filterType: 'select',
          filterOptions: [
            { value: 'withdrawal', label: t('med_in_withdrawal') },
            { value: 'ok', label: 'OK' }
          ],
          render: r => r.wdStatus === 'withdrawal'
            ? '<span class="badge badge-warning">' + t('med_in_withdrawal') + '</span>'
            : '<span class="badge badge-success">OK</span>'
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="show-med-form" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-med-inline" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
        action: ids => {
          showConfirm(t('confirm_delete')).then(ok => {
            if (!ok) return;
            const D2 = Store.get();
            D2.medications = D2.medications.filter(m => !ids.includes(m.id));
            Store.save(D2, 'bulk-delete-medications');
            this.render();
          });
        }
      }]
    });
  }

  _showMedForm(id) {
    const D = Store.get();
    const m = id ? D.medications.find(x => x.id === id) : null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('prod_flock')}</label><select id="m-flock">${flockSelect(m ? m.flockId : '')}</select></div>
        <div class="form-group"><label>${t('med_name')}</label><select id="m-name" data-change="med-select">${catalogSelect(CATALOGS.medications, m ? m.name : '')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('med_reason')}</label><select id="m-reason">${catalogSelect(CATALOGS.diseases, m ? m.reason || '' : '')}</select></div>
        <div class="form-group"><label>${t('med_dosage')}</label><input id="m-dosage" value="${m ? escapeAttr(m.dosage || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('med_start')}</label><input type="date" id="m-start" value="${m ? m.startDate : ''}"></div>
        <div class="form-group"><label>${t('med_end')}</label><input type="date" id="m-end" value="${m ? m.endDate : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('med_withdrawal')}</label><input type="number" id="m-wd" value="${m ? m.withdrawalDays || '' : ''}" min="0"></div>
        <div class="form-group"><label>${t('health_cost')} (${t('cancel').charAt(0) === 'C' ? 'optional' : 'opcional'})</label><input type="number" step="0.01" min="0" id="m-cost" value="${m && m.cost != null ? m.cost : ''}"></div>
      </div>
      <div class="form-group"><label>${t('notes')}</label><input id="m-notes" value="${m ? escapeAttr(m.notes || '') : ''}"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-medication" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: m ? t('edit') : t('med_add'), body });
  }

  _onMedSelect() {
    const sel = modalQuery('#m-name');
    if (!sel) return;
    const med = CATALOGS.medications.find(m => m.name === sel.value);
    const wd = modalQuery('#m-wd');
    if (med && wd && !wd.value) wd.value = med.withdrawal;
  }

  _saveMed(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      flockId: modalVal('m-flock'),
      name: modalVal('m-name'),
      reason: modalVal('m-reason'),
      dosage: modalVal('m-dosage'),
      startDate: modalVal('m-start'),
      endDate: modalVal('m-end'),
      withdrawalDays: parseInt(modalVal('m-wd')) || 0,
      cost: modalVal('m-cost') ? parseFloat(modalVal('m-cost')) : null,
      notes: modalVal('m-notes')
    };

    const v = validateForm({
      'm-flock': { value: o.flockId, rules: { required: true } },
      'm-name': { value: o.name, rules: { required: true } },
      'm-start': { value: o.startDate, rules: { required: true, date: true } },
      'm-dosage': { value: o.dosage, rules: { required: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    // Auto-calculate withdrawalEnd
    if (o.endDate && o.withdrawalDays) {
      const d = new Date(o.endDate + 'T12:00:00');
      d.setDate(d.getDate() + o.withdrawalDays);
      o.withdrawalEnd = d.toISOString().substring(0, 10);
    } else {
      o.withdrawalEnd = '';
    }

    if (id) {
      const i = D.medications.findIndex(m => m.id === id);
      if (i >= 0) D.medications[i] = { ...D.medications[i], ...o };
    } else {
      o.id = genId();
      D.medications.push(o);
    }
    Store.save(D, 'save-medication');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteMed(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.medications = D.medications.filter(m => m.id !== id);
    Store.save(D, 'delete-medication');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── TAB 3: OUTBREAKS ────────────────────────────────────

  _renderOutbreaksTab(D) {
    return DataTable.create({
      id: 'outbreaks',
      data: D.outbreaks || [],
      onRefresh: () => this.render(),
      emptyIcon: '\uD83E\uDDA0',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header" style="margin-bottom:12px">
        <h3>${t('out_title')}</h3>
        <button class="btn btn-primary btn-sm" data-action="show-outbreak-form">${t('out_add')}</button>
      </div>`,
      columns: [
        {
          key: 'flockId', label: t('prod_flock'), type: 'text', sortable: true, filterable: true,
          filterType: 'select', filterOptions: D.flocks.map(f => ({ value: f.id, label: f.name })),
          render: r => { const f = D.flocks.find(x => x.id === r.flockId); return f ? sanitizeHTML(f.name) : '-'; }
        },
        { key: 'disease', label: t('out_disease'), type: 'text', sortable: true, filterable: true, render: r => sanitizeHTML(r.disease) },
        { key: 'startDate', label: t('out_start'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        { key: 'endDate', label: t('out_end'), type: 'date', sortable: true },
        { key: 'affected', label: t('out_affected'), type: 'number', sortable: true, render: r => fmtNum(r.affected || 0) },
        {
          key: 'deaths', label: t('out_deaths'), type: 'number', sortable: true,
          render: r => r.deaths ? '<span style="color:var(--danger)">' + r.deaths + '</span>' : '-'
        },
        {
          key: 'economicLoss', label: t('out_loss'), type: 'number', sortable: true,
          render: r => fmtNum(r.economicLoss || 0)
        },
        {
          key: 'status', label: t('status'), type: 'text', sortable: true, filterable: true,
          filterType: 'select',
          filterOptions: [
            { value: 'active', label: t('out_active') },
            { value: 'controlled', label: t('out_controlled') },
            { value: 'resolved', label: t('out_resolved') }
          ],
          render: r => statusBadge(r.status)
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="show-outbreak-form" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-outbreak-inline" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), icon: '\uD83D\uDDD1\uFE0F', danger: true,
        action: ids => {
          showConfirm(t('confirm_delete')).then(ok => {
            if (!ok) return;
            const D2 = Store.get();
            D2.outbreaks = D2.outbreaks.filter(o => !ids.includes(o.id));
            Store.save(D2, 'bulk-delete-outbreaks');
            this.render();
          });
        }
      }]
    });
  }

  _showOutbreakForm(id) {
    const D = Store.get();
    const o = id ? D.outbreaks.find(x => x.id === id) : null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('prod_flock')}</label><select id="o-flock">${flockSelect(o ? o.flockId : '')}</select></div>
        <div class="form-group"><label>${t('out_disease')}</label><select id="o-disease">${catalogSelect(CATALOGS.diseases, o ? o.disease : '')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('out_start')}</label><input type="date" id="o-start" value="${o ? o.startDate : todayStr()}"></div>
        <div class="form-group"><label>${t('out_end')}</label><input type="date" id="o-end" value="${o ? o.endDate || '' : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('out_affected')}</label><input type="number" id="o-affected" value="${o ? o.affected || '' : ''}" min="0"></div>
        <div class="form-group"><label>${t('out_deaths')}</label><input type="number" id="o-deaths" value="${o ? o.deaths || '' : ''}" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('out_loss')}</label><input type="number" id="o-loss" value="${o ? o.economicLoss || '' : ''}" min="0"></div>
        <div class="form-group"><label>${t('status')}</label><select id="o-status">
          <option value="active"${o && o.status === 'active' ? ' selected' : ''}>${t('out_active')}</option>
          <option value="controlled"${o && o.status === 'controlled' ? ' selected' : ''}>${t('out_controlled')}</option>
          <option value="resolved"${o && o.status === 'resolved' ? ' selected' : ''}>${t('out_resolved')}</option>
        </select></div>
      </div>
      <div class="form-group"><label>${t('out_symptoms')}</label><textarea id="o-symptoms">${o ? escapeAttr(o.symptoms || '') : ''}</textarea></div>
      <div class="form-group"><label>${t('out_treatment')}</label><textarea id="o-treatment">${o ? escapeAttr(o.treatment || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-outbreak" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: o ? t('edit') : t('out_add'), body });
  }

  _saveOutbreak(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      flockId: modalVal('o-flock'),
      disease: modalVal('o-disease'),
      startDate: modalVal('o-start'),
      endDate: modalVal('o-end'),
      affected: parseInt(modalVal('o-affected')) || 0,
      deaths: parseInt(modalVal('o-deaths')) || 0,
      economicLoss: parseFloat(modalVal('o-loss')) || 0,
      status: modalVal('o-status'),
      symptoms: modalVal('o-symptoms'),
      treatment: modalVal('o-treatment')
    };

    const v = validateForm({
      'o-flock': { value: o.flockId, rules: { required: true } },
      'o-disease': { value: o.disease, rules: { required: true } },
      'o-start': { value: o.startDate, rules: { required: true, date: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (id) {
      const i = D.outbreaks.findIndex(x => x.id === id);
      if (i >= 0) D.outbreaks[i] = { ...D.outbreaks[i], ...o };
    } else {
      o.id = genId();
      D.outbreaks.push(o);
    }
    Store.save(D, 'save-outbreak');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteOutbreak(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.outbreaks = D.outbreaks.filter(o => o.id !== id);
    Store.save(D, 'delete-outbreak');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── TAB 4: STRESS EVENTS (Timeline) ─────────────────────

  _renderStressEventsTab(D) {
    let h = `<div class="page-header" style="margin-bottom:12px">
      <h3>${t('stress_title')}</h3>
      <button class="btn btn-primary btn-sm" data-action="show-stress-form">${t('add')}</button>
    </div>`;

    if (!(D.stressEvents || []).length) {
      return h + emptyState('\u26A1', t('no_data'));
    }

    h += '<div class="card"><div class="stress-timeline">';
    const events = [...D.stressEvents].sort((a, b) => b.date.localeCompare(a.date));

    events.forEach(ev => {
      const sColor = ['', '#4CAF50', '#FFC107', '#FF9800', '#F44336', '#9C27B0'][ev.severity] || '#999';
      const f = D.flocks.find(x => x.id === ev.flockId);

      // Production impact: compare 3 days before vs 3 days after
      const evDate = new Date(ev.date + 'T12:00:00');
      const after3 = new Date(evDate);
      after3.setDate(after3.getDate() + 3);
      const before = D.dailyProduction.filter(p => p.date < ev.date).slice(-3);
      const afterP = D.dailyProduction.filter(p => p.date > ev.date && p.date <= after3.toISOString().substring(0, 10));
      const avgBefore = before.length > 0 ? before.reduce((s, p) => s + (p.eggsCollected || 0), 0) / before.length : 0;
      const avgAfter = afterP.length > 0 ? afterP.reduce((s, p) => s + (p.eggsCollected || 0), 0) / afterP.length : 0;
      const impact = avgBefore > 0 ? ((avgAfter - avgBefore) / avgBefore * 100) : 0;

      h += `<div class="stress-event" style="border-left:4px solid ${sColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
          <strong>${fmtDate(ev.date)}</strong>
          <span class="badge badge-${ev.severity >= 4 ? 'danger' : ev.severity >= 3 ? 'warning' : 'info'}">${t('stress_' + ev.type) || ev.type} (${ev.severity}/5)</span>
        </div>
        <p style="margin:4px 0">${sanitizeHTML(ev.description)}</p>
        <div style="font-size:12px;color:var(--text-light)">${f ? sanitizeHTML(f.name) : t('all')} | ${t('prod_title')}: <span style="color:${impact < 0 ? 'var(--danger)' : 'var(--success)'}">${impact > 0 ? '+' : ''}${fmtNum(impact, 1)}%</span></div>
        <div class="btn-group" style="margin-top:4px">
          <button class="btn btn-secondary btn-sm" data-action="show-stress-form" data-id="${escapeAttr(ev.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-stress-inline" data-id="${escapeAttr(ev.id)}">${t('delete')}</button>
        </div>
      </div>`;
    });

    h += '</div></div>';
    return h;
  }

  _showStressForm(id) {
    const D = Store.get();
    const ev = id ? D.stressEvents.find(x => x.id === id) : null;
    const types = ['heat', 'disease', 'feed_change', 'power', 'predator', 'other'];

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="st-date" value="${ev ? ev.date : todayStr()}"></div>
        <div class="form-group"><label>${t('stress_type')}</label><select id="st-type">${types.map(ty => `<option value="${ty}"${ev && ev.type === ty ? ' selected' : ''}>${t('stress_' + ty) || ty}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('stress_severity')} (1-5)</label><input type="number" id="st-sev" value="${ev ? ev.severity : 3}" min="1" max="5"></div>
        <div class="form-group"><label>${t('prod_flock')}</label><select id="st-flock">${flockSelect(ev ? ev.flockId : '', true)}</select></div>
      </div>
      <div class="form-group"><label>${t('fin_description')}</label><textarea id="st-desc">${ev ? escapeAttr(ev.description || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-stress" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: ev ? t('edit') : t('stress_title'), body });
  }

  _saveStress(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      date: modalVal('st-date'),
      type: modalVal('st-type'),
      severity: parseInt(modalVal('st-sev')) || 3,
      flockId: modalVal('st-flock'),
      description: modalVal('st-desc')
    };

    const v = validateForm({
      'st-date': { value: o.date, rules: { required: true, date: true } },
      'st-type': { value: o.type, rules: { required: true } },
      'st-sev': { value: modalVal('st-sev'), rules: { required: true, numeric: true, min: 1, max: 5 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (id) {
      const i = D.stressEvents.findIndex(e => e.id === id);
      if (i >= 0) D.stressEvents[i] = { ...D.stressEvents[i], ...o };
    } else {
      o.id = genId();
      D.stressEvents.push(o);
    }
    Store.save(D, 'save-stress');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteStress(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.stressEvents = D.stressEvents.filter(e => e.id !== id);
    Store.save(D, 'delete-stress');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── CSS ──────────────────────────────────────────────────

  _css() {
    return `<style>
      :host { display: block; }

      .page-header {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 12px; margin-bottom: 16px;
      }
      .page-header h2, .page-header h3 { margin: 0; color: var(--text, #212121); }

      /* ── Tabs ── */
      .tabs {
        display: flex; gap: 0; border-bottom: 2px solid var(--border, #E0E0E0);
        margin-bottom: 16px; overflow-x: auto;
      }
      .tab {
        padding: 10px 16px; cursor: pointer; font-weight: 600; font-size: 14px;
        color: var(--text-light, #757575); border-bottom: 2px solid transparent;
        margin-bottom: -2px; white-space: nowrap; user-select: none;
      }
      .tab.active { color: var(--primary, #4a7c59); border-bottom-color: var(--primary, #4a7c59); }
      .tab:hover { color: var(--text, #212121); }

      /* ── Buttons ── */
      .btn {
        padding: 8px 16px; border-radius: 8px; border: none; font-size: 13px;
        font-weight: 600; cursor: pointer; transition: background .2s; display: inline-flex;
        align-items: center; gap: 6px; text-decoration: none;
      }
      .btn-primary { background: var(--primary, #4a7c59); color: #fff; }
      .btn-primary:hover { filter: brightness(1.1); }
      .btn-secondary { background: var(--border, #E0E0E0); color: var(--text, #212121); }
      .btn-secondary:hover { filter: brightness(.95); }
      .btn-danger { background: var(--danger, #C62828); color: #fff; }
      .btn-danger:hover { filter: brightness(1.1); }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }

      /* ── Badges ── */
      .badge {
        display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px;
        font-weight: 600; white-space: nowrap;
      }
      .badge-success { background: #E8F5E9; color: #2E7D32; }
      .badge-warning { background: #FFF8E1; color: #F57F17; }
      .badge-danger { background: #FFEBEE; color: #C62828; }
      .badge-info { background: #E3F2FD; color: #1565C0; }
      .badge-pending { background: #FFF8E1; color: #F57F17; }
      .badge-overdue { background: #FFEBEE; color: #C62828; }
      .badge-applied { background: #E8F5E9; color: #2E7D32; }
      .badge-active { background: #FFEBEE; color: #C62828; }
      .badge-controlled { background: #FFF8E1; color: #F57F17; }
      .badge-resolved { background: #E8F5E9; color: #2E7D32; }
      .badge-withdrawal { background: #FFF8E1; color: #F57F17; }
      .badge-ok { background: #E8F5E9; color: #2E7D32; }

      /* ── Card ── */
      .card {
        background: var(--card, #fff); border-radius: 12px; padding: 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }

      /* ── Table ── */
      .table-wrap { overflow-x: auto; }
      table {
        width: 100%; border-collapse: collapse; font-size: 13px;
      }
      table th {
        text-align: left; padding: 10px 8px; font-weight: 600; font-size: 12px;
        color: var(--text-light, #757575); border-bottom: 2px solid var(--border, #E0E0E0);
        white-space: nowrap;
      }
      table td {
        padding: 10px 8px; border-bottom: 1px solid var(--border, #E0E0E0);
        color: var(--text, #212121); vertical-align: middle;
      }
      table tr:hover { background: var(--hover, #F5F5F5); }

      /* ── DataTable controls (inside shadow) ── */
      .dt-toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; align-items: center; }
      .dt-toolbar input, .dt-toolbar select {
        padding: 6px 10px; border: 1px solid var(--border, #E0E0E0); border-radius: 8px;
        font-size: 13px; background: var(--card, #fff); color: var(--text, #212121);
      }
      .dt-toolbar input:focus, .dt-toolbar select:focus {
        outline: none; border-color: var(--primary, #4a7c59);
        box-shadow: 0 0 0 2px rgba(74,124,89,.15);
      }
      .dt-search { min-width: 180px; }
      .dt-bulk-bar {
        display: flex; gap: 8px; align-items: center; padding: 8px 12px;
        background: var(--primary-fill, #E8F5E9); border-radius: 8px; margin-bottom: 8px;
      }
      .dt-pagination { display: flex; gap: 4px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
      .dt-pagination button {
        padding: 4px 10px; border: 1px solid var(--border, #E0E0E0); border-radius: 6px;
        background: var(--card, #fff); cursor: pointer; font-size: 12px; color: var(--text, #212121);
      }
      .dt-pagination button.active { background: var(--primary, #4a7c59); color: #fff; border-color: var(--primary, #4a7c59); }
      .dt-pagination button:disabled { opacity: .4; cursor: default; }
      .dt-empty { text-align: center; padding: 40px 20px; color: var(--text-light, #757575); }
      .dt-empty-icon { font-size: 48px; margin-bottom: 12px; }
      .dt-mobile-card {
        background: var(--card, #fff); border-radius: 8px; padding: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 8px;
        border-left: 3px solid var(--primary, #4a7c59);
      }
      .dt-mobile-field { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
      .dt-mobile-label { font-weight: 600; color: var(--text-light, #757575); }
      .dt-filter-row th { padding: 4px; }
      .dt-filter-row input, .dt-filter-row select {
        width: 100%; padding: 4px 6px; border: 1px solid var(--border, #E0E0E0);
        border-radius: 6px; font-size: 12px; box-sizing: border-box;
        background: var(--card, #fff); color: var(--text, #212121);
      }
      .dt-colpick {
        position: absolute; background: var(--card, #fff); border: 1px solid var(--border, #E0E0E0);
        border-radius: 8px; padding: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.15);
        z-index: 100; max-height: 300px; overflow-y: auto;
      }
      .dt-colpick label { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 13px; cursor: pointer; }
      .dt-export-btns { display: flex; gap: 4px; }
      .dt-export-btns button {
        padding: 4px 8px; border: 1px solid var(--border, #E0E0E0); border-radius: 6px;
        background: var(--card, #fff); cursor: pointer; font-size: 11px; color: var(--text, #212121);
      }

      /* ── Stress Timeline ── */
      .stress-timeline {
        padding-left: 0;
      }
      .stress-event {
        padding: 12px 16px; margin-bottom: 12px; border-radius: 8px;
        background: var(--card, #fff); box-shadow: 0 1px 3px rgba(0,0,0,.06);
        border-left-width: 4px; border-left-style: solid;
      }
      .stress-event p { margin: 4px 0; }

      /* ── Empty state ── */
      .empty-state {
        text-align: center; padding: 48px 20px; color: var(--text-light, #757575);
      }
      .empty-state .icon { font-size: 48px; margin-bottom: 12px; }
      .empty-state p { margin: 8px 0; }

      /* ── Checklist item (for gen vaccines) ── */
      .checklist-item {
        display: flex; align-items: center; gap: 8px; padding: 4px 0;
      }

      /* ── Dark mode ── */
      :host-context(body.dark-mode) .card { background: #2D2D2D; }
      :host-context(body.dark-mode) table th { color: #BDBDBD; border-color: #424242; }
      :host-context(body.dark-mode) table td { color: #E0E0E0; border-color: #424242; }
      :host-context(body.dark-mode) table tr:hover { background: #383838; }
      :host-context(body.dark-mode) .stress-event { background: #2D2D2D; }
      :host-context(body.dark-mode) .badge-success { background: #1B5E20; color: #A5D6A7; }
      :host-context(body.dark-mode) .badge-warning { background: #4E342E; color: #FFE082; }
      :host-context(body.dark-mode) .badge-danger { background: #4E0000; color: #EF9A9A; }
      :host-context(body.dark-mode) .badge-info { background: #0D47A1; color: #90CAF9; }
      :host-context(body.dark-mode) .dt-toolbar input,
      :host-context(body.dark-mode) .dt-toolbar select,
      :host-context(body.dark-mode) .dt-filter-row input,
      :host-context(body.dark-mode) .dt-filter-row select { background: #383838; color: #E0E0E0; border-color: #555; }
      :host-context(body.dark-mode) .dt-pagination button { background: #383838; color: #E0E0E0; border-color: #555; }
      :host-context(body.dark-mode) .dt-pagination button.active { background: var(--primary, #4a7c59); color: #fff; }
      :host-context(body.dark-mode) .dt-colpick { background: #2D2D2D; border-color: #555; }
      :host-context(body.dark-mode) .dt-bulk-bar { background: #1B5E20; }
      :host-context(body.dark-mode) .dt-export-btns button { background: #383838; color: #E0E0E0; border-color: #555; }

      /* ── Responsive ── */
      @media (max-width: 768px) {
        .page-header { flex-direction: column; align-items: flex-start; }
        .tabs { gap: 0; }
        .tab { padding: 8px 12px; font-size: 13px; }
      }
      /* DataTable extras */
      .dt-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .dt-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .dt-search-input { padding: 6px 12px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); font-size: 13px; min-width: 180px; background: var(--bg, #fff); color: var(--text, #212121); }
      .dt-filter-select, .dt-filter-input, .dt-filter-date, .dt-filter-num { width: 100%; padding: 4px 6px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; box-sizing: border-box; background: var(--bg, #fff); color: var(--text, #212121); }
      .dt-filter-row td { padding: 4px 6px; }
      .dt-card-wrap { position: relative; }
      .dt-table-desktop { display: block; }
      .dt-mobile-cards { display: none; }
      .dt-row-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-bulk-bar { display: flex; align-items: center; justify-content: space-between; background: var(--primary-fill, rgba(74,124,89,.08)); padding: 8px 12px; border-radius: var(--radius, 8px); margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
      .dt-bulk-count { font-weight: 600; font-size: 13px; }
      .dt-bulk-actions { display: flex; gap: 6px; }
      .dt-pagination { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; flex-wrap: wrap; gap: 8px; font-size: 13px; }
      .dt-page-buttons { display: flex; gap: 4px; }
      .dt-page-size { padding: 4px 8px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; background: var(--bg, #fff); }
      .dt-footer-info { font-size: 13px; color: var(--text-light, #757575); padding: 8px 0; }
      .dt-sortable { cursor: pointer; user-select: none; }
      .dt-sorted { color: var(--primary, #4a7c59); }
      .dt-col-picker-wrap { position: relative; }
      .dt-column-picker { position: absolute; right: 0; top: 100%; background: var(--bg, #fff); border: 1px solid var(--border, #e0e0e0); border-radius: 8px; padding: 8px; z-index: 100; min-width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
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
      }
    </style>`;
  }
}

customElements.define('egg-sanidad', EggSanidad);
