// EGGlogU — Superadmin CRM Mixin
// Extracted from egg-superadmin.js for F5 decomposition
// Contains: _renderCRM, _crmRenderOrgList, _crmRender360, _crmRenderReport,
//           _crmRenderRetention, and all CRM action methods

import { Bus } from '../core/bus.js';
import { apiService } from '../core/api.js';
import { sanitizeHTML, escapeAttr } from '../core/utils.js';
import { showConfirm } from './egg-confirm.js';

function _saFetch(path) {
  return apiService.request('GET', '/superadmin' + path);
}

/**
 * Mix CRM methods into target class prototype
 * @param {Function} Klass - EggSuperadmin class
 * @param {Function} lblFn - _lbl function for labels
 */
export function mixCRM(Klass, lblFn) {
  const P = Klass.prototype;

  P._renderCRM = async function(lbl) {
    let h = '';
    const views = [
      { id: 'list',      label: lbl.crm_orgs,      icon: '\uD83C\uDFE2' },
      { id: 'report',    label: lbl.crm_report,     icon: '\uD83D\uDCCA' },
      { id: 'retention', label: lbl.crm_retention,  icon: '\uD83D\uDD04' }
    ];
    h += '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">';
    views.forEach(v => {
      h += `<button class="btn ${this._crmView === v.id ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="crm-view" data-view="${v.id}">${v.icon} ${v.label}</button>`;
    });
    if (this._crmView === '360' && this._crmOrgName) {
      h += `<span class="badge badge-info" style="align-self:center;font-size:0.85rem">360 ${sanitizeHTML(this._crmOrgName)}</span>`;
    }
    h += '</div>';

    if (this._crmView === '360' && this._crmOrgId) h += await this._crmRender360(lbl);
    else if (this._crmView === 'report')            h += await this._crmRenderReport(lbl);
    else if (this._crmView === 'retention')          h += await this._crmRenderRetention(lbl);
    else                                             h += await this._crmRenderOrgList(lbl);

    return h;
  };

  P._crmRenderOrgList = async function(lbl) {
    const data = await _saFetch('/crm/report');
    const orgs = await _saFetch('/organizations');
    let h = `<div class="card"><h3>\uD83C\uDFE2 ${lbl.crm_orgs}</h3>`;
    if (!orgs || !orgs.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p></div>`; return h; }

    h += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
      <div class="kpi-card"><div class="kpi-label">${lbl.total_orgs}</div><div class="kpi-value">${data.total_orgs || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_avg_health}</div><div class="kpi-value" style="color:${(data.avg_health_score || 0) >= 70 ? 'var(--success)' : (data.avg_health_score || 0) >= 40 ? 'var(--warning)' : 'var(--danger)'}">${(data.avg_health_score || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_total_ltv}</div><div class="kpi-value" style="color:var(--success)">$${(data.total_ltv || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_active_discounts}</div><div class="kpi-value">${data.active_discounts || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_events_30d}</div><div class="kpi-value">${data.retention_events_30d || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_credits_total}</div><div class="kpi-value">$${((data.credit_notes_total_cents || 0) / 100).toFixed(2)}</div></div>
    </div>`;

    if (data.risk_distribution) {
      h += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
      const riskColors = { low: 'var(--success)', medium: 'var(--warning)', high: '#ff5722', critical: 'var(--danger)' };
      const riskLabels = { low: 'Bajo', medium: 'Medio', high: 'Alto', critical: 'Critico' };
      Object.entries(data.risk_distribution).forEach(([r, c]) => {
        h += `<div style="padding:6px 14px;border-radius:20px;background:${riskColors[r] || 'var(--bg-card)'};color:#fff;font-size:0.8rem;font-weight:600">${riskLabels[r] || r}: ${c}</div>`;
      });
      h += '</div>';
    }

    h += `<div class="table-wrap"><table><thead><tr><th>${lbl.org_name}</th><th>${lbl.plan}</th><th>${lbl.crm_score}</th><th>${lbl.crm_risk}</th><th>${lbl.crm_ltv}</th><th>${lbl.users}</th><th>${lbl.farms}</th><th>${lbl.actions}</th></tr></thead><tbody>`;
    for (const o of orgs) {
      let hs = 0, risk = 'low';
      try {
        const h360 = await apiService.request('GET', '/superadmin/organizations/' + o.id + '/crm-360');
        hs = h360.health?.score || 0;
        risk = h360.health?.risk || 'low';
      } catch (_e) { /* silent */ }
      const riskColors = { low: 'success', medium: 'warning', high: 'danger', critical: 'danger' };
      const planColors = { hobby: 'secondary', starter: 'info', pro: 'info', enterprise: 'warning' };
      h += `<tr>
        <td><strong>${sanitizeHTML(o.name || '-')}</strong><br><span style="font-size:0.75rem;color:var(--text-light)">${sanitizeHTML(o.slug || '')}</span></td>
        <td><span class="badge badge-${planColors[o.plan] || 'secondary'}">${(o.plan || 'free').toUpperCase()}</span></td>
        <td><div style="display:flex;align-items:center;gap:6px"><div style="width:40px;height:6px;background:var(--bg-card,#eee);border-radius:3px;overflow:hidden"><div style="width:${hs}%;height:100%;background:${hs >= 70 ? 'var(--success)' : hs >= 40 ? 'var(--warning)' : 'var(--danger)'}"></div></div><span style="font-size:0.85rem;font-weight:600">${hs}</span></div></td>
        <td><span class="badge badge-${riskColors[risk] || 'secondary'}">${risk.toUpperCase()}</span></td>
        <td style="font-weight:600">$${(hs * 10).toFixed(0)}</td>
        <td>${o.user_count || 0}</td>
        <td>${o.farm_count || 0}</td>
        <td><button class="btn btn-primary btn-sm" data-action="crm-360" data-id="${escapeAttr(o.id)}" data-name="${escapeAttr(o.name || '')}">360</button>
        <button class="btn btn-secondary btn-sm" data-action="crm-export" data-id="${escapeAttr(o.id)}" data-fmt="json">${lbl.crm_export}</button></td>
      </tr>`;
    }
    h += '</tbody></table></div></div>';
    return h;
  };

  P._crmRender360 = async function(lbl) {
    const data = await apiService.request('GET', '/superadmin/organizations/' + this._crmOrgId + '/crm-360');
    const orgId = this._crmOrgId;
    let h = `<button class="btn btn-secondary btn-sm" data-action="crm-back" style="margin-bottom:12px">\u2190 ${lbl.crm_back}</button>`;

    const hs = data.health || {};
    const org = data.organization || {};
    h += `<div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div><h3 style="margin:0">${sanitizeHTML(org.name || this._crmOrgName)}</h3><span style="color:var(--text-light);font-size:0.85rem">${sanitizeHTML(org.slug || '')} · ${sanitizeHTML(org.tier || '')}</span></div>
      <div style="display:flex;gap:16px;align-items:center">
        <div style="text-align:center"><div style="font-size:2rem;font-weight:700;color:${(hs.score || 0) >= 70 ? 'var(--success)' : (hs.score || 0) >= 40 ? 'var(--warning)' : 'var(--danger)'}">${hs.score || 0}</div><div style="font-size:0.7rem;color:var(--text-light)">${lbl.crm_health}</div></div>
        <div style="text-align:center"><div style="font-size:1.3rem;font-weight:700;color:var(--success)">$${(data.ltv?.total_value || 0).toFixed(0)}</div><div style="font-size:0.7rem;color:var(--text-light)">${lbl.crm_ltv}</div></div>
        <span class="badge badge-${(hs.risk || 'low') === 'low' ? 'success' : (hs.risk || 'low') === 'medium' ? 'warning' : 'danger'}" style="font-size:0.9rem;padding:6px 12px">${(hs.risk || 'low').toUpperCase()}</span>
      </div></div></div>`;

    const sub = data.subscription || {};
    if (sub.plan || sub.status) {
      h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCB3 ${lbl.crm_subscription}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        <div class="kpi-card"><div class="kpi-label">${lbl.plan}</div><div class="kpi-value" style="font-size:0.95rem">${(sub.plan || '-').toUpperCase()}</div></div>
        <div class="kpi-card"><div class="kpi-label">${lbl.status}</div><div class="kpi-value" style="font-size:0.95rem">${sanitizeHTML(sub.status || '-')}</div></div>
        <div class="kpi-card"><div class="kpi-label">Stripe</div><div class="kpi-value" style="font-size:0.7rem">${sanitizeHTML(sub.stripe_subscription_id || '-')}</div></div>
        </div></div>`;
    }

    h += `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" data-action="crm-show-discount" data-id="${escapeAttr(orgId)}">\uD83C\uDFF7\uFE0F ${lbl.crm_apply_discount}</button>
      <button class="btn btn-warning btn-sm" data-action="crm-show-refund" data-id="${escapeAttr(orgId)}">\uD83D\uDCB8 ${lbl.crm_issue_refund}</button>
      <button class="btn btn-info btn-sm" data-action="crm-show-credit" data-id="${escapeAttr(orgId)}">\uD83D\uDCDD ${lbl.crm_issue_credit}</button>
      <button class="btn btn-secondary btn-sm" data-action="crm-show-plan" data-id="${escapeAttr(orgId)}">\uD83D\uDD04 ${lbl.crm_change_plan}</button>
      <button class="btn btn-secondary btn-sm" data-action="crm-export" data-id="${escapeAttr(orgId)}" data-fmt="csv">\uD83D\uDCE5 CSV</button>
      <button class="btn btn-secondary btn-sm" data-action="crm-export" data-id="${escapeAttr(orgId)}" data-fmt="json">\uD83D\uDCE5 JSON</button>
    </div>`;

    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCDD ${lbl.crm_notes}</h3>`;
    h += `<div style="display:flex;gap:8px;margin-bottom:12px">
      <input type="text" class="crm-note-input" placeholder="${lbl.crm_add_note}..." style="flex:1">
      <select class="crm-note-type"><option value="general">General</option><option value="billing">Billing</option><option value="support">Support</option><option value="retention">Retention</option></select>
      <button class="btn btn-primary btn-sm" data-action="crm-submit-note" data-id="${escapeAttr(orgId)}">${lbl.save}</button></div>`;
    const notes = data.notes || [];
    if (!notes.length) { h += `<p style="color:var(--text-light)">${lbl.crm_no_notes}</p>`; }
    else {
      notes.forEach(n => {
        h += `<div style="padding:10px;border-left:3px solid ${n.is_pinned ? 'var(--warning)' : 'var(--border)'};margin-bottom:8px;background:var(--bg-card,#fafafa);border-radius:0 6px 6px 0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:0.85rem">${sanitizeHTML(n.note_type || 'general')}${n.is_pinned ? ' \uD83D\uDCCC' : ''}</span>
            <div style="display:flex;gap:4px;align-items:center">
              <span style="font-size:0.7rem;color:var(--text-light)">${n.created_at ? n.created_at.substring(0, 10) : ''}</span>
              <button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:0.7rem" data-action="crm-toggle-pin" data-org-id="${escapeAttr(orgId)}" data-id="${escapeAttr(n.id)}" data-pin="${!n.is_pinned}">${n.is_pinned ? 'Unpin' : 'Pin'}</button>
              <button class="btn btn-danger btn-sm" style="padding:2px 6px;font-size:0.7rem" data-action="crm-delete-note" data-org-id="${escapeAttr(orgId)}" data-id="${escapeAttr(n.id)}">\u00D7</button>
            </div></div>
          <p style="margin:4px 0 0;font-size:0.9rem">${sanitizeHTML(n.content)}</p></div>`;
      });
    }
    h += '</div>';

    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83C\uDFF7\uFE0F ${lbl.crm_discounts}</h3>`;
    const discounts = data.discounts || [];
    if (!discounts.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.crm_percent_off}</th><th>${lbl.crm_duration}</th><th>${lbl.crm_reason}</th><th>${lbl.crm_active}</th><th>${lbl.actions}</th></tr></thead><tbody>`;
      discounts.forEach(d => {
        h += `<tr><td style="font-weight:700">${d.percent_off}%</td><td>${d.duration_months} ${lbl.crm_month}</td><td>${sanitizeHTML(d.reason || '-')}</td>
          <td><span class="badge badge-${d.is_active ? 'success' : 'secondary'}">${d.is_active ? lbl.crm_active : 'Expired'}</span></td>
          <td>${d.is_active ? `<button class="btn btn-danger btn-sm" data-action="crm-revoke-discount" data-id="${escapeAttr(d.id)}">${lbl.crm_revoke}</button>` : '-'}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCCB ${lbl.crm_credit_notes}</h3>`;
    const credits = data.credit_notes || [];
    if (!credits.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.crm_amount}</th><th>${lbl.crm_currency}</th><th>${lbl.crm_reason}</th><th>${lbl.status}</th><th>${lbl.created}</th></tr></thead><tbody>`;
      credits.forEach(c => {
        h += `<tr><td style="font-weight:700">$${(c.amount_cents / 100).toFixed(2)}</td><td>${sanitizeHTML(c.currency)}</td><td>${sanitizeHTML(c.reason || '-')}</td>
          <td><span class="badge badge-${c.status === 'issued' ? 'success' : 'secondary'}">${sanitizeHTML(c.status)}</span></td>
          <td>${c.created_at ? c.created_at.substring(0, 10) : '-'}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">';
    h += `<div class="card"><h3>\uD83D\uDC65 ${lbl.users} (${(data.users || []).length})</h3>`;
    (data.users || []).forEach(u => {
      h += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem"><strong>${sanitizeHTML(u.full_name || u.email)}</strong> · <span class="badge badge-secondary">${sanitizeHTML(u.role || '-')}</span></div>`;
    });
    h += '</div>';
    h += `<div class="card"><h3>\uD83C\uDFE0 ${lbl.farms} (${(data.farms || []).length})</h3>`;
    (data.farms || []).forEach(f => {
      h += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem"><strong>${sanitizeHTML(f.name || '-')}</strong> · ${sanitizeHTML(f.location || '')}</div>`;
    });
    h += '</div></div>';

    h += `<div class="card" style="margin-bottom:14px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      <div class="kpi-card"><div class="kpi-label">${lbl.open_tickets}</div><div class="kpi-value">${data.open_tickets || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">Flocks</div><div class="kpi-value">${data.total_flocks || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.total_eggs}</div><div class="kpi-value">${(data.total_eggs_in_stock || 0).toLocaleString()}</div></div>
    </div></div>`;

    return h;
  };

  P._crmRenderReport = async function(lbl) {
    const data = await _saFetch('/crm/report');
    let h = `<div class="card"><h3>\uD83D\uDCCA ${lbl.crm_report}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px">
      <div class="kpi-card"><div class="kpi-label">${lbl.total_orgs}</div><div class="kpi-value">${data.total_orgs || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.active_users}</div><div class="kpi-value" style="color:var(--success)">${data.active_orgs || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_avg_health}</div><div class="kpi-value" style="color:${(data.avg_health_score || 0) >= 70 ? 'var(--success)' : 'var(--warning)'}">${(data.avg_health_score || 0).toFixed(1)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_total_ltv}</div><div class="kpi-value" style="color:var(--success)">$${(data.total_ltv || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_ltv} (${lbl.crm_avg_health})</div><div class="kpi-value">$${(data.avg_ltv || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_active_discounts}</div><div class="kpi-value">${data.active_discounts || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_events_30d}</div><div class="kpi-value">${data.retention_events_30d || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_credits_total}</div><div class="kpi-value">$${((data.credit_notes_total_cents || 0) / 100).toFixed(2)}</div></div>
      </div>`;

    if (data.risk_distribution) {
      h += `<div style="margin-top:16px"><h4>${lbl.crm_risk} Distribution</h4>
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">`;
      const riskColors = { low: 'var(--success)', medium: 'var(--warning)', high: '#ff5722', critical: 'var(--danger)' };
      Object.entries(data.risk_distribution).forEach(([r, c]) => {
        const total = data.total_orgs || 1;
        const pct = ((c / total) * 100).toFixed(0);
        h += `<div style="flex:1;min-width:120px;text-align:center">
          <div style="background:var(--bg-card,#fafafa);border-radius:8px;padding:12px;border:2px solid ${riskColors[r] || 'var(--border)'}">
          <div style="font-size:1.5rem;font-weight:700;color:${riskColors[r] || 'var(--text)'}">${c}</div>
          <div style="font-size:0.75rem;color:var(--text-light)">${r.toUpperCase()} (${pct}%)</div>
          </div></div>`;
      });
      h += '</div></div>';
    }
    h += '</div>';
    return h;
  };

  P._crmRenderRetention = async function(lbl) {
    let h = '';
    const rules = await apiService.request('GET', '/superadmin/retention-rules');
    const events = await apiService.request('GET', '/superadmin/retention-events?limit=20');

    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCCB ${lbl.crm_rules}</h3>
      <div style="margin-bottom:12px">
        <button class="btn btn-primary btn-sm" data-action="crm-show-rule">${lbl.crm_add_note} Rule</button>
        <button class="btn btn-warning btn-sm" data-action="crm-evaluate">${lbl.crm_evaluate}</button>
      </div>`;
    if (!rules || !rules.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>Name</th><th>${lbl.crm_trigger}</th><th>${lbl.crm_action}</th><th>% Off</th><th>${lbl.crm_active}</th><th>${lbl.actions}</th></tr></thead><tbody>`;
      rules.forEach(r => {
        h += `<tr><td><strong>${sanitizeHTML(r.name)}</strong></td><td>${sanitizeHTML(r.trigger_type)}</td><td>${sanitizeHTML(r.action_type)}</td><td>${r.discount_percent}%</td>
          <td><span class="badge badge-${r.is_active ? 'success' : 'secondary'}">${r.is_active ? 'ON' : 'OFF'}</span></td>
          <td><button class="btn btn-secondary btn-sm" data-action="crm-toggle-rule" data-id="${escapeAttr(r.id)}" data-active="${!r.is_active}">${r.is_active ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-danger btn-sm" data-action="crm-delete-rule" data-id="${escapeAttr(r.id)}">\u00D7</button></td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    h += `<div class="card"><h3>\uD83D\uDCDC ${lbl.crm_events}</h3>`;
    const evtList = events.items || events || [];
    if (!evtList.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.org}</th><th>${lbl.crm_trigger}</th><th>${lbl.crm_action}</th><th>${lbl.crm_result}</th><th>${lbl.date}</th></tr></thead><tbody>`;
      evtList.forEach(ev => {
        h += `<tr><td>${ev.organization_id ? sanitizeHTML(ev.organization_id.substring(0, 8)) + '...' : '-'}</td><td>${sanitizeHTML(ev.trigger_type)}</td><td>${sanitizeHTML(ev.action_taken)}</td><td>${sanitizeHTML(ev.result || '-')}</td><td>${ev.created_at ? ev.created_at.substring(0, 10) : '-'}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  };

  // ── CRM Action Methods ──────────────────────────────────────

  P._crmShowDiscountModal = function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83C\uDFF7\uFE0F ${lbl.apply_discount}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.pct_off}</label><input type="number" class="crm-d-pct" min="1" max="100"></div>
        <div><label>${lbl.dur_months}</label><input type="number" class="crm-d-dur" min="1" max="36" value="1"></div>
        <div><label>${lbl.reason}</label><input type="text" class="crm-d-reason"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-action="crm-submit-discount" data-id="${escapeAttr(orgId)}">${lbl.apply_discount}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  };

  P._crmApplyDiscount = async function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    const body = {
      percent_off: parseInt(root.querySelector('.crm-d-pct')?.value) || 0,
      duration_months: parseInt(root.querySelector('.crm-d-dur')?.value) || 1,
      reason: root.querySelector('.crm-d-reason')?.value || ''
    };
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/discounts', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.discount_applied });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmShowRefundModal = function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDCB8 ${lbl.issue_refund}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.pid}</label><input type="text" class="crm-r-pid" placeholder="pi_..."></div>
        <div><label>${lbl.amt_cents}</label><input type="number" class="crm-r-amt" min="1" placeholder="Leave empty for full refund"></div>
        <div><label>${lbl.reason}</label><input type="text" class="crm-r-reason" value="requested_by_customer"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-warning" data-action="crm-submit-refund" data-id="${escapeAttr(orgId)}">${lbl.issue_refund}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  };

  P._crmIssueRefund = async function(orgId) {
    const lbl = lblFn();
    if (!confirm(lbl.crm_confirm_refund)) return;
    const root = this.shadowRoot;
    const body = {
      payment_intent_id: root.querySelector('.crm-r-pid')?.value || '',
      reason: root.querySelector('.crm-r-reason')?.value || ''
    };
    const amt = root.querySelector('.crm-r-amt')?.value;
    if (amt) body.amount_cents = parseInt(amt);
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/refund', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.refund_issued });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmShowCreditModal = function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDCDD ${lbl.issue_credit}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.amt_cents_req}</label><input type="number" class="crm-c-amt" min="1"></div>
        <div><label>${lbl.currency}</label><input type="text" class="crm-c-cur" value="usd" maxlength="3"></div>
        <div><label>${lbl.reason}</label><input type="text" class="crm-c-reason"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-info" data-action="crm-submit-credit" data-id="${escapeAttr(orgId)}">${lbl.issue_credit}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  };

  P._crmIssueCreditNote = async function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    const body = {
      amount_cents: parseInt(root.querySelector('.crm-c-amt')?.value) || 0,
      currency: root.querySelector('.crm-c-cur')?.value || 'usd',
      reason: root.querySelector('.crm-c-reason')?.value || ''
    };
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/credit-notes', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.credit_issued });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmShowPlanModal = function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDD04 ${lbl.change_plan}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.new_plan}</label><select class="crm-p-plan"><option value="hobby">Hobby ($9)</option><option value="starter">Starter ($19)</option><option value="pro">Pro ($49)</option><option value="enterprise">Enterprise ($99)</option></select></div>
        <div><label>${lbl.interval}</label><select class="crm-p-int"><option value="month">${lbl.month}</option><option value="year">${lbl.year}</option></select></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-action="crm-submit-plan" data-id="${escapeAttr(orgId)}">${lbl.change_plan}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  };

  P._crmChangePlan = async function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    const body = {
      new_plan: root.querySelector('.crm-p-plan')?.value || 'pro',
      interval: root.querySelector('.crm-p-int')?.value || 'month'
    };
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/change-plan', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.plan_changed });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmAddNote = async function(orgId) {
    const lbl = lblFn();
    const root = this.shadowRoot;
    const content = root.querySelector('.crm-note-input')?.value || '';
    const note_type = root.querySelector('.crm-note-type')?.value || 'general';
    if (!content.trim()) return;
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/notes', { content, note_type, is_pinned: false });
      Bus.emit('toast', { msg: lbl.note_added });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmTogglePin = async function(orgId, noteId, pin) {
    try {
      await apiService.request('PATCH', '/superadmin/organizations/' + orgId + '/notes/' + noteId, { is_pinned: pin });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmDeleteNote = async function(orgId, noteId) {
    const lbl = lblFn();
    if (!confirm('Delete note?')) return;
    try {
      await apiService.request('DELETE', '/superadmin/organizations/' + orgId + '/notes/' + noteId);
      Bus.emit('toast', { msg: lbl.note_deleted });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmRevokeDiscount = async function(discountId) {
    const lbl = lblFn();
    if (!confirm('Revoke discount?')) return;
    try {
      await apiService.request('DELETE', '/superadmin/discounts/' + discountId);
      Bus.emit('toast', { msg: lbl.discount_revoked });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmExport = async function(orgId, fmt) {
    const lbl = lblFn();
    try {
      const data = await apiService.request('GET', '/superadmin/organizations/' + orgId + '/export?format=' + fmt);
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: fmt === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm_${orgId.substring(0, 8)}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      Bus.emit('toast', { msg: lbl.exported });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmShowRuleModal = function() {
    const lbl = lblFn();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDCCB New Retention Rule</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>Name</label><input type="text" class="crm-rule-name"></div>
        <div><label>Trigger</label><select class="crm-rule-trigger"><option value="churn_risk">Churn Risk</option><option value="payment_failed">Payment Failed</option><option value="low_usage">Low Usage</option><option value="downgrade_request">Downgrade Request</option><option value="trial_expiring">Trial Expiring</option></select></div>
        <div><label>Action</label><select class="crm-rule-action"><option value="flag_for_review">Flag for Review</option><option value="auto_discount">Auto Discount</option><option value="send_email">Send Email</option><option value="extend_trial">Extend Trial</option></select></div>
        <div><label>Discount %</label><input type="number" class="crm-rule-disc" min="0" max="100" value="0"></div>
        <div><label>Email Template Key</label><input type="text" class="crm-rule-tpl" placeholder="optional"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-action="crm-submit-rule">Create</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  };

  P._crmCreateRule = async function() {
    const lbl = lblFn();
    const root = this.shadowRoot;
    const body = {
      name: root.querySelector('.crm-rule-name')?.value || '',
      trigger_type: root.querySelector('.crm-rule-trigger')?.value || 'churn_risk',
      action_type: root.querySelector('.crm-rule-action')?.value || 'flag_for_review',
      discount_percent: parseInt(root.querySelector('.crm-rule-disc')?.value) || 0,
      email_template_key: root.querySelector('.crm-rule-tpl')?.value || null,
      conditions: {}
    };
    try {
      await apiService.request('POST', '/superadmin/retention-rules', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.rule_created });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmToggleRule = async function(ruleId, active) {
    try {
      await apiService.request('PATCH', '/superadmin/retention-rules/' + ruleId, { is_active: active });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmDeleteRule = async function(ruleId) {
    const lbl = lblFn();
    if (!confirm('Delete rule?')) return;
    try {
      await apiService.request('DELETE', '/superadmin/retention-rules/' + ruleId);
      Bus.emit('toast', { msg: lbl.rule_deleted });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };

  P._crmEvaluateRetention = async function() {
    const lbl = lblFn();
    try {
      const res = await apiService.request('POST', '/superadmin/retention/evaluate');
      Bus.emit('toast', { msg: `${lbl.eval_complete}: ${res.events_created || 0} eventos` });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  };
}
