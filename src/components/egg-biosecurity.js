// <egg-biosecurity> — Biosecurity module Web Component
// Tabs: Visitors, Zones, Pests, Protocols
// Replaces renderBiosecurity() and all related functions from the monolith

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtDate, todayStr, genId, validateForm, emptyState, DataTable, CATALOGS, catalogSelect, kpi, statusBadge, showFieldError, clearFieldErrors, logAudit } from '../core/index.js';
import { modalVal, getModalBody, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

class EggBiosecurity extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'visitors';
    this._unsubs = [];
    this._dtBound = false;
  }

  connectedCallback() {
    this.render();
    this._bindEvents();

    this._unsubs.push(
      Bus.on('modal:action', (e) => this._onModalAction(e)),
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
    const bio = D.biosecurity || { visitors: [], zones: [], pestSightings: [], protocols: [] };
    let h = this._css();

    h += `<div class="page-header"><h2>${t('bio_title')}</h2></div>`;

    // KPI grid
    const ps = this._computePestScore(D);
    h += `<div class="kpi-grid" style="margin-bottom:16px">`;
    h += kpi(t('bio_pest_score'), ps.toString() + '/100', '', ps > 60 ? 'danger' : ps > 30 ? 'warning' : '', t('info_bio_pest'));
    h += kpi(t('bio_unresolved_pests'), bio.pestSightings.filter(p => !p.resolved).length.toString(), '', '');
    h += kpi(t('bio_visitors'), bio.visitors.length.toString(), t('total'), '', t('info_bio_visitors'));
    h += kpi(t('bio_zones'), bio.zones.length.toString(), '', '', t('info_bio_zones'));
    h += `</div>`;

    // Tabs
    h += `<div class="tabs">
      <div class="tab${this._currentTab === 'visitors' ? ' active' : ''}" data-tab="visitors">${t('bio_visitors')}</div>
      <div class="tab${this._currentTab === 'zones' ? ' active' : ''}" data-tab="zones">${t('bio_zones')}</div>
      <div class="tab${this._currentTab === 'pests' ? ' active' : ''}" data-tab="pests">${t('bio_pests')}</div>
      <div class="tab${this._currentTab === 'protocols' ? ' active' : ''}" data-tab="protocols">${t('bio_protocols')}</div>
    </div>`;

    if (this._currentTab === 'visitors') h += this._renderVisitorsTab(D);
    else if (this._currentTab === 'zones') h += this._renderZonesTab(D);
    else if (this._currentTab === 'pests') h += this._renderPestsTab(D);
    else h += this._renderProtocolsTab(D);

    h += '<div id="bio-content-end"></div>';
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
        // Visitors
        case 'show-visitor-form': this._showVisitorForm(btn.dataset.id || ''); break;
        case 'delete-visitor': this._deleteVisitor(btn.dataset.id); break;
        // Zones
        case 'show-zone-form': this._showZoneForm(btn.dataset.id || ''); break;
        case 'delete-zone': this._deleteZone(btn.dataset.id); break;
        // Pests
        case 'show-pest-form': this._showPestForm(btn.dataset.id || ''); break;
        case 'resolve-pest': this._resolvePest(btn.dataset.id); break;
        case 'delete-pest': this._deletePest(btn.dataset.id); break;
        // Protocols
        case 'show-protocol-form': this._showProtocolForm(btn.dataset.id || ''); break;
        case 'complete-protocol': this._completeProtocol(btn.dataset.id); break;
        case 'delete-protocol': this._deleteProtocol(btn.dataset.id); break;
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
      case 'save-visitor': this._saveVisitor(e.editId || ''); break;
      case 'save-zone': this._saveZone(e.editId || ''); break;
      case 'save-pest': this._savePest(e.editId || ''); break;
      case 'save-protocol': this._saveProtocol(e.editId || ''); break;
    }
  }

  // ─── PEST SCORE ───────────────────────────────────────────

  _computePestScore(D) {
    const bio = D.biosecurity || { visitors: [], zones: [], pestSightings: [], protocols: [] };
    let score = 0;
    const unresolved = bio.pestSightings.filter(p => !p.resolved);
    score += Math.min(40, unresolved.length * 10);
    score += Math.min(20, unresolved.reduce((s, p) => s + (p.severity || 1), 0) * 2);
    const redZones = bio.zones.filter(z => z.riskLevel === 'red').length;
    const yellowZones = bio.zones.filter(z => z.riskLevel === 'yellow').length;
    score += redZones * 15 + yellowZones * 5;
    const today = todayStr();
    bio.zones.forEach(z => {
      if (z.lastDisinfection && z.frequencyDays) {
        const next = new Date(z.lastDisinfection + 'T12:00:00');
        next.setDate(next.getDate() + z.frequencyDays);
        if (next.toISOString().substring(0, 10) < today) score += 10;
      }
    });
    return Math.min(100, Math.round(score));
  }

  // ─── TAB 1: VISITORS ─────────────────────────────────────

  _renderVisitorsTab(D) {
    const bio = D.biosecurity || { visitors: [] };
    if (!bio.visitors.length) {
      return `<div class="card"><div class="page-header"><h3>${t('bio_visitors')}</h3><button class="btn btn-primary btn-sm" data-action="show-visitor-form">${t('bio_add_visitor')}</button></div>` + emptyState('', t('no_data')) + '</div>';
    }
    const zones = [...new Set(bio.visitors.map(v => v.zone).filter(Boolean))];
    return DataTable.create({
      id: 'bioVisitors',
      data: bio.visitors,
      onRefresh: () => this.render(),
      emptyIcon: '',
      emptyText: t('no_data'),
      headerHtml: `<div class="page-header"><h3>${t('bio_visitors')}</h3><button class="btn btn-primary btn-sm" data-action="show-visitor-form">${t('bio_add_visitor')}</button></div>`,
      columns: [
        { key: 'date', label: t('date'), type: 'date', sortable: true, filterable: true, filterType: 'date-range' },
        {
          key: 'name', label: t('bio_visitor_name'), type: 'text', sortable: true, filterable: true,
          render: r => {
            const crossRisk = r.fromFarmHealth && r.fromFarmHealth !== 'healthy';
            return sanitizeHTML(r.name) + (crossRisk ? ' <span title="' + t('bio_cross_risk') + '" style="color:var(--danger)">!</span>' : '');
          }
        },
        { key: 'company', label: t('bio_visitor_company'), type: 'text', sortable: true, render: r => sanitizeHTML(r.company || '-') },
        { key: 'purpose', label: t('bio_visitor_purpose'), type: 'text', sortable: true, render: r => sanitizeHTML(r.purpose || '-') },
        {
          key: 'zone', label: t('bio_visitor_zone'), type: 'text', sortable: true, filterable: true,
          filterType: 'select', filterOptions: zones.map(v => ({ value: v, label: v })),
          render: r => sanitizeHTML(r.zone || '-')
        },
        { key: 'vehiclePlate', label: t('bio_visitor_plate'), type: 'text', sortable: true, render: r => sanitizeHTML(r.vehiclePlate || '-') },
        {
          key: 'disinfected', label: t('bio_visitor_disinfected'), type: 'text', sortable: true, filterable: true,
          filterType: 'select', filterOptions: [{ value: 'true', label: '\u2713' }, { value: 'false', label: '\u2717' }],
          getValue: r => String(!!r.disinfected),
          render: r => r.disinfected ? '\u2713' : '\u2717'
        }
      ],
      actions: r => `<div class="btn-group">
        <button class="btn btn-secondary btn-sm" data-action="show-visitor-form" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-visitor" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
      </div>`,
      bulkActions: [{
        label: t('delete'), danger: true,
        action: ids => {
          showConfirm(t('confirm_delete')).then(ok => {
            if (!ok) return;
            const D2 = Store.get();
            D2.biosecurity.visitors = D2.biosecurity.visitors.filter(v => !ids.includes(v.id));
            Store.save(D2, 'bulk-delete-bio-visitors');
            this.render();
          });
        }
      }]
    });
  }

  _showVisitorForm(id) {
    const D = Store.get();
    const bio = D.biosecurity || { visitors: [], zones: [] };
    const v = id ? bio.visitors.find(x => x.id === id) : null;
    const zoneOpts = bio.zones.map(z => `<option value="${escapeAttr(z.name)}"${v && v.zone === z.name ? ' selected' : ''}>${sanitizeHTML(z.name)}</option>`).join('');

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="bv-date" value="${v ? v.date : todayStr()}"></div>
        <div class="form-group"><label>${t('bio_visitor_name')}</label><input id="bv-name" value="${v ? escapeAttr(v.name) : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('bio_visitor_company')}</label><input id="bv-company" value="${v ? escapeAttr(v.company || '') : ''}"></div>
        <div class="form-group"><label>${t('bio_visitor_purpose')}</label><select id="bv-purpose">${catalogSelect(CATALOGS.visitorPurposes, v ? v.purpose || '' : '')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('bio_visitor_zone')}</label><select id="bv-zone"><option value="">--</option>${zoneOpts}</select></div>
        <div class="form-group"><label>${t('bio_visitor_plate')}</label><input id="bv-plate" value="${v ? escapeAttr(v.vehiclePlate || '') : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('bio_visitor_disinfected')}</label><select id="bv-disinf">
          <option value="true"${v && v.disinfected ? ' selected' : ''}>${t('yes') || 'Yes'}</option>
          <option value="false"${v && !v.disinfected ? ' selected' : ''}>${t('no') || 'No'}</option>
        </select></div>
        <div class="form-group"><label>${t('bio_visitor_from_farm')}</label><select id="bv-farm">
          <option value="">--</option>
          <option value="internal"${v && v.fromFarmId === 'internal' ? ' selected' : ''}>${escapeAttr(D.farm.name || 'Mi Granja')} (interna)</option>
          <option value="external"${v && v.fromFarmId === 'external' ? ' selected' : (!v ? ' selected' : '')}>Externa</option>
        </select></div>
      </div>
      <div class="form-group"><label>${t('bio_visitor_from_health')}</label><select id="bv-health">
        <option value="healthy"${v && v.fromFarmHealth === 'healthy' ? ' selected' : ''}>Healthy</option>
        <option value="outbreak"${v && v.fromFarmHealth === 'outbreak' ? ' selected' : ''}>'!' + Outbreak</option>
        <option value="unknown"${v && v.fromFarmHealth === 'unknown' ? ' selected' : ''}>Unknown</option>
      </select></div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="bv-notes">${v ? escapeAttr(v.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-visitor" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: v ? t('edit') : t('bio_add_visitor'), body });
  }

  _saveVisitor(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      date: modalVal('bv-date'),
      name: modalVal('bv-name'),
      company: modalVal('bv-company'),
      purpose: modalVal('bv-purpose'),
      zone: modalVal('bv-zone'),
      vehiclePlate: modalVal('bv-plate'),
      disinfected: modalVal('bv-disinf') === 'true',
      fromFarmId: modalVal('bv-farm'),
      fromFarmHealth: modalVal('bv-health'),
      notes: modalVal('bv-notes')
    };

    const v = validateForm({
      'bv-date': { value: o.date, rules: { required: true, date: true } },
      'bv-name': { value: o.name, rules: { required: true, maxLength: 100 } },
      'bv-company': { value: o.company, rules: { maxLength: 100 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (!D.biosecurity) D.biosecurity = { visitors: [], zones: [], pestSightings: [], protocols: [] };
    if (id) {
      const i = D.biosecurity.visitors.findIndex(x => x.id === id);
      if (i >= 0) D.biosecurity.visitors[i] = { ...D.biosecurity.visitors[i], ...o };
    } else {
      o.id = genId();
      D.biosecurity.visitors.push(o);
    }
    Store.save(D, 'save-bio-visitor');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteVisitor(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.biosecurity.visitors = D.biosecurity.visitors.filter(v => v.id !== id);
    Store.save(D, 'delete-bio-visitor');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── TAB 2: ZONES ────────────────────────────────────────

  _renderZonesTab(D) {
    const bio = D.biosecurity || { zones: [] };
    const today = todayStr();

    let h = `<div class="card"><div class="page-header"><h3>${t('bio_zones')}</h3>
      <button class="btn btn-primary btn-sm" data-action="show-zone-form">${t('bio_add_zone')}</button></div>`;

    if (!bio.zones.length) return h + emptyState('', t('no_data')) + '</div>';

    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
    bio.zones.forEach(z => {
      const overdue = z.lastDisinfection && z.frequencyDays && (() => {
        const n = new Date(z.lastDisinfection + 'T12:00:00');
        n.setDate(n.getDate() + z.frequencyDays);
        return n.toISOString().substring(0, 10) < today;
      })();
      const borderColor = z.riskLevel === 'red' ? '#F44336' : z.riskLevel === 'yellow' ? '#FFC107' : '#4CAF50';
      h += `<div class="card" style="border-left:4px solid ${borderColor}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4>${sanitizeHTML(z.name)}</h4><span class="risk-badge risk-${z.riskLevel}">${t('bio_risk_' + z.riskLevel)}</span>
        </div>
        <p style="font-size:13px;color:var(--text-light)">${t('bio_zone_last_disinfection')}: ${z.lastDisinfection ? fmtDate(z.lastDisinfection) : '-'}
          ${overdue ? ' <span style="color:var(--danger);font-weight:700">' + t('bio_protocol_overdue') + '</span>' : ''}</p>
        <p style="font-size:13px;color:var(--text-light)">${t('bio_zone_frequency')}: ${z.frequencyDays || '-'} ${t('flock_days')}</p>
        ${z.notes ? '<p style="font-size:12px">' + sanitizeHTML(z.notes) + '</p>' : ''}
        <div class="btn-group" style="margin-top:8px">
          <button class="btn btn-secondary btn-sm" data-action="show-zone-form" data-id="${escapeAttr(z.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-zone" data-id="${escapeAttr(z.id)}">${t('delete')}</button>
        </div>
      </div>`;
    });
    return h + '</div></div>';
  }

  _showZoneForm(id) {
    const D = Store.get();
    const bio = D.biosecurity || { zones: [] };
    const z = id ? bio.zones.find(x => x.id === id) : null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('bio_zone_name')}</label><input id="bz-name" value="${z ? escapeAttr(z.name) : ''}"></div>
        <div class="form-group"><label>${t('bio_zone_risk')}</label><select id="bz-risk">
          <option value="green"${z && z.riskLevel === 'green' ? ' selected' : ''}>${t('bio_risk_green')}</option>
          <option value="yellow"${z && z.riskLevel === 'yellow' ? ' selected' : ''}>${t('bio_risk_yellow')}</option>
          <option value="red"${z && z.riskLevel === 'red' ? ' selected' : ''}>${t('bio_risk_red')}</option>
        </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('bio_zone_last_disinfection')}</label><input type="date" id="bz-last" value="${z ? z.lastDisinfection || '' : ''}"></div>
        <div class="form-group"><label>${t('bio_zone_frequency')}</label><input type="number" id="bz-freq" value="${z ? z.frequencyDays || '' : ''}" min="1"></div>
      </div>
      <div class="form-group"><label>${t('notes')}</label><textarea id="bz-notes">${z ? escapeAttr(z.notes || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-zone" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: z ? t('edit') : t('bio_add_zone'), body });
  }

  _saveZone(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      name: modalVal('bz-name'),
      riskLevel: modalVal('bz-risk'),
      lastDisinfection: modalVal('bz-last'),
      frequencyDays: parseInt(modalVal('bz-freq')) || 0,
      notes: modalVal('bz-notes')
    };

    const v = validateForm({
      'bz-name': { value: o.name, rules: { required: true, maxLength: 100 } },
      'bz-risk': { value: o.riskLevel, rules: { required: true } },
      'bz-freq': { value: modalVal('bz-freq'), rules: { numeric: true, min: 1 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (!D.biosecurity) D.biosecurity = { visitors: [], zones: [], pestSightings: [], protocols: [] };
    if (id) {
      const i = D.biosecurity.zones.findIndex(z => z.id === id);
      if (i >= 0) D.biosecurity.zones[i] = { ...D.biosecurity.zones[i], ...o };
    } else {
      o.id = genId();
      D.biosecurity.zones.push(o);
    }
    Store.save(D, 'save-bio-zone');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  async _deleteZone(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.biosecurity.zones = D.biosecurity.zones.filter(z => z.id !== id);
    Store.save(D, 'delete-bio-zone');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── TAB 3: PESTS ────────────────────────────────────────

  _renderPestsTab(D) {
    const bio = D.biosecurity || { pestSightings: [] };

    let h = `<div class="card"><div class="page-header"><h3>${t('bio_pests')}</h3>
      <button class="btn btn-primary btn-sm" data-action="show-pest-form">${t('bio_add_pest')}</button></div>`;

    if (!bio.pestSightings.length) return h + emptyState('', t('no_data')) + '</div>';

    h += '<div class="stress-timeline" style="padding-left:20px">';
    const sorted = [...bio.pestSightings].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(p => {
      const sColor = ['', '#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'][p.severity] || '#999';
      h += `<div class="stress-event" style="border-left:4px solid ${sColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
          <strong>${fmtDate(p.date)} ${t('bio_pest_' + p.type) || p.type}</strong>
          <span>${p.resolved ? '' + t('bio_pest_resolved') : '' + t('active')}</span>
        </div>
        <p style="margin:4px 0">${t('bio_pest_location')}: ${sanitizeHTML(p.location || '-')} | ${t('bio_pest_severity')}: ${'\u2B50'.repeat(p.severity || 1)}</p>
        ${p.action ? '<p style="font-size:12px;color:var(--text-light)">' + t('bio_pest_action') + ': ' + sanitizeHTML(p.action) + '</p>' : ''}
        <div class="btn-group" style="margin-top:4px">
          ${!p.resolved ? '<button class="btn btn-primary btn-sm" data-action="resolve-pest" data-id="' + escapeAttr(p.id) + '">' + t('bio_pest_resolved') + '</button>' : ''}
          <button class="btn btn-secondary btn-sm" data-action="show-pest-form" data-id="${escapeAttr(p.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-pest" data-id="${escapeAttr(p.id)}">${t('delete')}</button>
        </div>
      </div>`;
    });
    return h + '</div></div>';
  }

  _showPestForm(id) {
    const D = Store.get();
    const bio = D.biosecurity || { pestSightings: [], zones: [] };
    const p = id ? bio.pestSightings.find(x => x.id === id) : null;

    const zoneOptions = bio.zones.map(z => `<option value="${escapeAttr(z.name)}"${p && p.location === z.name ? ' selected' : ''}>${sanitizeHTML(z.name)}</option>`).join('');

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('date')}</label><input type="date" id="bp-date" value="${p ? p.date : todayStr()}"></div>
        <div class="form-group"><label>${t('bio_pest_type')}</label><select id="bp-type">
          <option value="rodent"${p && p.type === 'rodent' ? ' selected' : ''}>${t('bio_pest_rodent')}</option>
          <option value="fly"${p && p.type === 'fly' ? ' selected' : ''}>${t('bio_pest_fly')}</option>
          <option value="wild_bird"${p && p.type === 'wild_bird' ? ' selected' : ''}>${t('bio_pest_wild_bird')}</option>
          <option value="other"${p && p.type === 'other' ? ' selected' : ''}>${t('bio_pest_other')}</option>
        </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('bio_pest_location')}</label><select id="bp-loc">
          <option value="">--</option>
          ${zoneOptions}
          <option value="__other__">Otra...</option>
        </select></div>
        <div class="form-group"><label>${t('bio_pest_severity')} (1-5)</label><input type="number" id="bp-sev" value="${p ? p.severity || 3 : 3}" min="1" max="5"></div>
      </div>
      <div class="form-group"><label>${t('bio_pest_action')}</label><textarea id="bp-action">${p ? escapeAttr(p.action || '') : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-pest" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: p ? t('edit') : t('bio_add_pest'), body });
  }

  _savePest(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      date: modalVal('bp-date'),
      type: modalVal('bp-type'),
      location: modalVal('bp-loc'),
      severity: parseInt(modalVal('bp-sev')) || 3,
      action: modalVal('bp-action'),
      resolved: false
    };

    const v = validateForm({
      'bp-date': { value: o.date, rules: { required: true, date: true } },
      'bp-type': { value: o.type, rules: { required: true } },
      'bp-sev': { value: modalVal('bp-sev'), rules: { required: true, numeric: true, min: 1, max: 5 } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (!D.biosecurity) D.biosecurity = { visitors: [], zones: [], pestSightings: [], protocols: [] };
    if (id) {
      const i = D.biosecurity.pestSightings.findIndex(p => p.id === id);
      if (i >= 0) {
        o.resolved = D.biosecurity.pestSightings[i].resolved;
        D.biosecurity.pestSightings[i] = { ...D.biosecurity.pestSightings[i], ...o };
      }
    } else {
      o.id = genId();
      D.biosecurity.pestSightings.push(o);
    }
    Store.save(D, 'save-bio-pest');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  _resolvePest(id) {
    const D = Store.get();
    const p = D.biosecurity.pestSightings.find(x => x.id === id);
    if (p) {
      p.resolved = true;
      Store.save(D, 'resolve-bio-pest');
      Bus.emit('toast', { msg: t('cfg_saved') });
      this.render();
    }
  }

  async _deletePest(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.biosecurity.pestSightings = D.biosecurity.pestSightings.filter(p => p.id !== id);
    Store.save(D, 'delete-bio-pest');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  // ─── TAB 4: PROTOCOLS ────────────────────────────────────

  _renderProtocolsTab(D) {
    const bio = D.biosecurity || { protocols: [] };
    const today = todayStr();

    let h = `<div class="card"><div class="page-header"><h3>${t('bio_protocols')}</h3>
      <button class="btn btn-primary btn-sm" data-action="show-protocol-form">${t('bio_add_protocol')}</button></div>`;

    if (!bio.protocols.length) return h + emptyState('', t('no_data')) + '</div>';

    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">';
    bio.protocols.forEach(p => {
      const freqDays = { daily: 1, weekly: 7, monthly: 30 }[p.frequency] || 7;
      const overdue = p.lastCompleted && (() => {
        const n = new Date(p.lastCompleted + 'T12:00:00');
        n.setDate(n.getDate() + freqDays);
        return n.toISOString().substring(0, 10) < today;
      })();
      h += `<div class="card" style="border-top:3px solid ${overdue ? 'var(--danger)' : 'var(--primary)'}">
        <h4>${sanitizeHTML(p.name)}</h4>
        <p style="font-size:13px;color:var(--text-light)">${t('bio_protocol_frequency')}: ${t('bio_protocol_' + p.frequency)} | ${t('bio_protocol_last')}: ${p.lastCompleted ? fmtDate(p.lastCompleted) : '-'}
          ${overdue ? ' <span style="color:var(--danger);font-weight:700">' + t('bio_protocol_overdue') + '</span>' : ''}</p>`;
      if (p.items && p.items.length) {
        h += '<ul style="font-size:13px;margin:8px 0">';
        p.items.forEach(it => { h += `<li>${sanitizeHTML(it)}</li>`; });
        h += '</ul>';
      }
      h += `<div class="btn-group">
          <button class="btn btn-primary btn-sm" data-action="complete-protocol" data-id="${escapeAttr(p.id)}">${t('bio_protocol_complete')}</button>
          <button class="btn btn-secondary btn-sm" data-action="show-protocol-form" data-id="${escapeAttr(p.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-protocol" data-id="${escapeAttr(p.id)}">${t('delete')}</button>
        </div>
      </div>`;
    });
    return h + '</div></div>';
  }

  _showProtocolForm(id) {
    const D = Store.get();
    const bio = D.biosecurity || { protocols: [] };
    const p = id ? bio.protocols.find(x => x.id === id) : null;

    const body = `
      <div class="form-row">
        <div class="form-group"><label>${t('bio_protocol_name')}</label><select id="bpr-name">${catalogSelect(CATALOGS.bioProtocols, p ? p.name : '')}</select></div>
        <div class="form-group"><label>${t('bio_protocol_frequency')}</label><select id="bpr-freq">
          <option value="daily"${p && p.frequency === 'daily' ? ' selected' : ''}>${t('bio_protocol_daily')}</option>
          <option value="weekly"${p && p.frequency === 'weekly' ? ' selected' : ''}>${t('bio_protocol_weekly')}</option>
          <option value="monthly"${p && p.frequency === 'monthly' ? ' selected' : ''}>${t('bio_protocol_monthly')}</option>
        </select></div>
      </div>
      <div class="form-group"><label>${t('bio_protocol_items')} (${t('notes')}: uno por linea)</label>
        <textarea id="bpr-items" rows="5">${p && p.items ? escapeAttr(p.items.join('\n')) : ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cancel">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="save-protocol" data-edit-id="${id || ''}">${t('save')}</button>
      </div>`;
    Bus.emit('modal:open', { title: p ? t('edit') : t('bio_add_protocol'), body });
  }

  _saveProtocol(id) {
    clearFieldErrors();
    const D = Store.get();
    const o = {
      name: modalVal('bpr-name'),
      frequency: modalVal('bpr-freq'),
      items: modalVal('bpr-items').split('\n').map(s => s.trim()).filter(Boolean),
      lastCompleted: null
    };

    const v = validateForm({
      'bpr-name': { value: o.name, rules: { required: true } },
      'bpr-freq': { value: o.frequency, rules: { required: true } }
    });
    if (!v.valid) {
      Object.entries(v.errors).forEach(([k, e]) => showFieldError(k, e[0]));
      return;
    }

    if (!D.biosecurity) D.biosecurity = { visitors: [], zones: [], pestSightings: [], protocols: [] };
    if (id) {
      const i = D.biosecurity.protocols.findIndex(p => p.id === id);
      if (i >= 0) {
        o.lastCompleted = D.biosecurity.protocols[i].lastCompleted;
        D.biosecurity.protocols[i] = { ...D.biosecurity.protocols[i], ...o };
      }
    } else {
      o.id = genId();
      D.biosecurity.protocols.push(o);
    }
    Store.save(D, 'save-bio-protocol');
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  _completeProtocol(id) {
    const D = Store.get();
    const p = D.biosecurity.protocols.find(x => x.id === id);
    if (p) {
      p.lastCompleted = todayStr();
      Store.save(D, 'complete-bio-protocol');
      Bus.emit('toast', { msg: t('cfg_saved') });
      this.render();
    }
  }

  async _deleteProtocol(id) {
    if (!await showConfirm(t('confirm_delete'))) return;
    const D = Store.get();
    D.biosecurity.protocols = D.biosecurity.protocols.filter(p => p.id !== id);
    Store.save(D, 'delete-bio-protocol');
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

      /* ── KPI Grid ── */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
      }
      .kpi-card {
        background: var(--card, #fff); border-radius: 12px; padding: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative;
      }
      .kpi-card.danger { border-left: 4px solid var(--danger, #C62828); }
      .kpi-card.warning { border-left: 4px solid #FFC107; }
      .kpi-label { font-size: 12px; color: var(--text-light, #757575); font-weight: 600; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #212121); margin: 4px 0; }
      .kpi-sub { font-size: 12px; color: var(--text-light, #757575); }
      .kpi-info-btn {
        position: absolute; top: 8px; right: 8px; width: 20px; height: 20px;
        border-radius: 50%; border: 1px solid var(--border, #E0E0E0); background: var(--card, #fff);
        font-size: 11px; font-weight: 700; color: var(--text-light, #757575); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }

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

      /* ── Risk badges ── */
      .risk-badge {
        display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px;
        font-weight: 700; white-space: nowrap;
      }
      .risk-green { background: #E8F5E9; color: #2E7D32; }
      .risk-yellow { background: #FFF8E1; color: #F57F17; }
      .risk-red { background: #FFEBEE; color: #C62828; }

      /* ── Card ── */
      .card {
        background: var(--card, #fff); border-radius: 12px; padding: 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }
      .card h4 { margin: 0 0 8px 0; color: var(--text, #212121); }

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

      /* ── DataTable controls ── */
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

      /* ── Stress Timeline (reused for pests) ── */
      .stress-timeline { padding-left: 0; }
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

      /* ── Dark mode ── */
      :host-context(body.dark-mode) .card { background: #2D2D2D; }
      :host-context(body.dark-mode) .kpi-card { background: #2D2D2D; }
      :host-context(body.dark-mode) .kpi-value { color: #E0E0E0; }
      :host-context(body.dark-mode) .kpi-info-btn { background: #383838; border-color: #555; color: #BDBDBD; }
      :host-context(body.dark-mode) table th { color: #BDBDBD; border-color: #424242; }
      :host-context(body.dark-mode) table td { color: #E0E0E0; border-color: #424242; }
      :host-context(body.dark-mode) table tr:hover { background: #383838; }
      :host-context(body.dark-mode) .stress-event { background: #2D2D2D; }
      :host-context(body.dark-mode) .badge-success { background: #1B5E20; color: #A5D6A7; }
      :host-context(body.dark-mode) .badge-warning { background: #4E342E; color: #FFE082; }
      :host-context(body.dark-mode) .badge-danger { background: #4E0000; color: #EF9A9A; }
      :host-context(body.dark-mode) .badge-info { background: #0D47A1; color: #90CAF9; }
      :host-context(body.dark-mode) .risk-green { background: #1B5E20; color: #A5D6A7; }
      :host-context(body.dark-mode) .risk-yellow { background: #4E342E; color: #FFE082; }
      :host-context(body.dark-mode) .risk-red { background: #4E0000; color: #EF9A9A; }
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
      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
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

customElements.define('egg-biosecurity', EggBiosecurity);

export { EggBiosecurity };
