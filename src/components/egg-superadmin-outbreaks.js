// EGGlogU — Superadmin Outbreak Alerts Mixin
// Extracted from egg-superadmin.js for F5 decomposition

import { Bus } from '../core/bus.js';
import { apiService } from '../core/api.js';
import { sanitizeHTML, escapeAttr, todayStr } from '../core/utils.js';
import { showConfirm } from './egg-confirm.js';

/**
 * Mix Outbreak Alert methods into target class prototype
 * @param {Function} Klass - EggSuperadmin class
 * @param {Function} lblFn - _lbl function for labels
 */
export function mixOutbreaks(Klass, lblFn) {
  const P = Klass.prototype;

  P._renderOutbreaks = async function(lbl) {
    const alerts = await apiService.request('GET', '/superadmin/outbreak-alerts');
    this._obAlerts = alerts || [];

    let h = '';

    // ── Create form
    h += `<div class="card">
      <h3>${lbl.ob_create}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label>${lbl.ob_title} *</label><input class="ob-title" placeholder="Avian Influenza H5N1 - Region X" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_disease} *</label><input class="ob-disease" placeholder="H5N1" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_severity}</label><select class="ob-severity" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px">
          <option value="low">Low</option><option value="moderate" selected>Moderate</option><option value="high">High</option><option value="critical">Critical</option>
        </select></div>
        <div><label>${lbl.ob_transmission}</label><select class="ob-transmission" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px">
          <option value="unknown" selected>Unknown</option><option value="airborne">Airborne</option><option value="contact">Contact</option><option value="vector">Vector</option><option value="waterborne">Waterborne</option><option value="fomite">Fomite</option>
        </select></div>
        <div><label>${lbl.ob_species}</label><input class="ob-species" value="poultry" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_region} *</label><input class="ob-region" placeholder="Central Chile" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_lat} *</label><input class="ob-lat" type="number" step="any" min="-90" max="90" placeholder="-33.45" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_lng} *</label><input class="ob-lng" type="number" step="any" min="-180" max="180" placeholder="-70.66" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_radius}</label><input class="ob-radius" type="number" value="100" min="1" max="20000" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_detected} *</label><input class="ob-detected" type="date" value="${todayStr()}" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_expires}</label><input class="ob-expires" type="datetime-local" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_cases}</label><input class="ob-cases" type="number" value="0" min="0" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_deaths}</label><input class="ob-deaths" type="number" value="0" min="0" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_speed}</label><input class="ob-speed" type="number" step="any" min="0" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_direction}</label><input class="ob-direction" placeholder="NW" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
        <div><label>${lbl.ob_source_url}</label><input class="ob-source" placeholder="https://..." style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
      </div>
      <div style="margin-top:10px">
        <label>${lbl.ob_description}</label><textarea class="ob-desc" rows="2" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px"></textarea>
      </div>
      <div style="margin-top:10px">
        <label>${lbl.ob_contingency}</label><textarea class="ob-contingency" rows="2" style="width:100%;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px" placeholder="1. Restrict movement. 2. Notify authorities..."></textarea>
      </div>
      <button class="btn btn-danger" style="margin-top:12px" data-action="ob-create">${lbl.ob_create}</button>
    </div>`;

    // ── Alert list
    h += `<div class="card"><h3>${lbl.tab_outbreaks} (${this._obAlerts.length})</h3>`;
    if (!this._obAlerts.length) {
      h += `<p style="color:var(--text-light,#888)">${lbl.ob_no_alerts}</p>`;
    } else {
      h += '<div class="table-wrap"><table><thead><tr>';
      h += `<th>${lbl.ob_disease}</th><th>${lbl.ob_severity}</th><th>${lbl.ob_region}</th><th>${lbl.ob_radius}</th><th>${lbl.ob_cases}</th><th>${lbl.ob_deaths}</th><th>${lbl.status}</th><th>${lbl.ob_detected}</th><th>${lbl.actions}</th>`;
      h += '</tr></thead><tbody>';
      for (const a of this._obAlerts) {
        const sevClass = a.severity === 'critical' ? 'badge-danger' : a.severity === 'high' ? 'badge-warning' : a.severity === 'moderate' ? 'badge-info' : 'badge-secondary';
        const statusBadge = a.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-secondary">Resolved</span>';

        if (this._obEditingId === a.id) {
          h += `<tr style="background:var(--bg-secondary,#f9f9f9)">
            <td colspan="9">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px">
                <div><label>${lbl.ob_title}</label><input class="ob-edit-title" value="${escapeAttr(a.title)}" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
                <div><label>${lbl.ob_severity}</label><select class="ob-edit-severity" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px">
                  <option value="low" ${a.severity === 'low' ? 'selected' : ''}>Low</option><option value="moderate" ${a.severity === 'moderate' ? 'selected' : ''}>Moderate</option><option value="high" ${a.severity === 'high' ? 'selected' : ''}>High</option><option value="critical" ${a.severity === 'critical' ? 'selected' : ''}>Critical</option>
                </select></div>
                <div><label>${lbl.ob_radius}</label><input class="ob-edit-radius" type="number" value="${a.radius_km}" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
                <div><label>${lbl.ob_cases}</label><input class="ob-edit-cases" type="number" value="${a.confirmed_cases}" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
                <div><label>${lbl.ob_deaths}</label><input class="ob-edit-deaths" type="number" value="${a.deaths_reported}" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
                <div><label>${lbl.ob_speed}</label><input class="ob-edit-speed" type="number" step="any" value="${a.spread_speed_km_day || ''}" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
                <div><label>${lbl.ob_direction}</label><input class="ob-edit-direction" value="${escapeAttr(a.spread_direction || '')}" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
                <div><label>${lbl.ob_expires}</label><input class="ob-edit-expires" type="datetime-local" value="${a.expires_at ? a.expires_at.slice(0, 16) : ''}" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px"></div>
              </div>
              <div style="padding:0 8px 8px">
                <label>${lbl.ob_description}</label><textarea class="ob-edit-desc" rows="2" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px">${sanitizeHTML(a.description || '')}</textarea>
              </div>
              <div style="padding:0 8px 8px">
                <label>${lbl.ob_contingency}</label><textarea class="ob-edit-contingency" rows="2" style="width:100%;padding:4px;border:1px solid var(--border,#ddd);border-radius:4px">${sanitizeHTML(a.contingency_protocol || '')}</textarea>
              </div>
              <div style="display:flex;gap:6px;padding:0 8px 8px">
                <button class="btn btn-primary btn-sm" data-action="ob-save-edit" data-id="${a.id}">${lbl.save}</button>
                <button class="btn btn-secondary btn-sm" data-action="ob-cancel-edit">${lbl.cancel}</button>
              </div>
            </td>
          </tr>`;
        } else {
          h += `<tr>
            <td><strong>${sanitizeHTML(a.disease)}</strong><br><small>${sanitizeHTML(a.title)}</small></td>
            <td><span class="badge ${sevClass}">${a.severity}</span></td>
            <td>${sanitizeHTML(a.region_name)}</td>
            <td>${a.radius_km} km</td>
            <td>${a.confirmed_cases}</td>
            <td>${a.deaths_reported}</td>
            <td>${statusBadge}</td>
            <td>${a.detected_date}</td>
            <td>
              <div class="btn-group">
                <button class="btn btn-sm btn-info" data-action="ob-edit" data-id="${a.id}">Edit</button>
                <button class="btn btn-sm ${a.is_active ? 'btn-warning' : 'btn-primary'}" data-action="ob-toggle" data-id="${a.id}">${a.is_active ? lbl.ob_resolve : lbl.ob_reactivate}</button>
                <button class="btn btn-sm btn-danger" data-action="ob-delete" data-id="${a.id}">${lbl.ob_delete}</button>
              </div>
            </td>
          </tr>`;
        }
      }
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  };

  P._obCreate = async function() {
    const root = this.shadowRoot;
    const v = (sel) => (root.querySelector(sel)?.value || '').trim();
    const title = v('.ob-title');
    const disease = v('.ob-disease');
    const region = v('.ob-region');
    const lat = parseFloat(v('.ob-lat'));
    const lng = parseFloat(v('.ob-lng'));
    const detected = v('.ob-detected');

    if (!title || !disease || !region || isNaN(lat) || isNaN(lng) || !detected) {
      Bus.emit('toast', { msg: 'Required: title, disease, region, lat, lng, detected date', type: 'error' });
      return;
    }

    const body = {
      title, disease, region_name: region,
      epicenter_lat: lat, epicenter_lng: lng,
      severity: v('.ob-severity') || 'moderate',
      transmission: v('.ob-transmission') || 'unknown',
      species_affected: v('.ob-species') || 'poultry',
      radius_km: parseFloat(v('.ob-radius')) || 100,
      detected_date: detected,
      confirmed_cases: parseInt(v('.ob-cases')) || 0,
      deaths_reported: parseInt(v('.ob-deaths')) || 0,
    };
    const expires = v('.ob-expires');
    if (expires) body.expires_at = new Date(expires).toISOString();
    const desc = v('.ob-desc');
    if (desc) body.description = desc;
    const cont = v('.ob-contingency');
    if (cont) body.contingency_protocol = cont;
    const src = v('.ob-source');
    if (src) body.source_url = src;
    const speed = parseFloat(v('.ob-speed'));
    if (!isNaN(speed)) body.spread_speed_km_day = speed;
    const dir = v('.ob-direction');
    if (dir) body.spread_direction = dir;

    try {
      await apiService.request('POST', '/superadmin/outbreak-alerts', body);
      Bus.emit('toast', { msg: lblFn().ob_created });
      this.render();
    } catch (e) {
      Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' });
    }
  };

  P._obToggle = async function(id) {
    const alert = (this._obAlerts || []).find(a => a.id === id);
    if (!alert) return;
    try {
      await apiService.request('PATCH', `/superadmin/outbreak-alerts/${id}`, { is_active: !alert.is_active });
      Bus.emit('toast', { msg: lblFn().ob_updated });
      this.render();
    } catch (e) {
      Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' });
    }
  };

  P._obDelete = async function(id) {
    const yes = await showConfirm(lblFn().ob_confirm_delete);
    if (!yes) return;
    try {
      await apiService.request('DELETE', `/superadmin/outbreak-alerts/${id}`);
      Bus.emit('toast', { msg: lblFn().ob_deleted });
      this.render();
    } catch (e) {
      Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' });
    }
  };

  P._obShowEdit = function(id) {
    this._obEditingId = id;
    this.render();
  };

  P._obSaveEdit = async function(id) {
    const root = this.shadowRoot;
    const v = (sel) => (root.querySelector(sel)?.value || '').trim();
    const body = {};
    const title = v('.ob-edit-title');
    if (title) body.title = title;
    body.severity = v('.ob-edit-severity') || undefined;
    const radius = parseFloat(v('.ob-edit-radius'));
    if (!isNaN(radius)) body.radius_km = radius;
    const cases = parseInt(v('.ob-edit-cases'));
    if (!isNaN(cases)) body.confirmed_cases = cases;
    const deaths = parseInt(v('.ob-edit-deaths'));
    if (!isNaN(deaths)) body.deaths_reported = deaths;
    const speed = parseFloat(v('.ob-edit-speed'));
    if (!isNaN(speed)) body.spread_speed_km_day = speed;
    const dir = v('.ob-edit-direction');
    if (dir) body.spread_direction = dir;
    const expires = v('.ob-edit-expires');
    if (expires) body.expires_at = new Date(expires).toISOString();
    const desc = v('.ob-edit-desc');
    if (desc !== undefined) body.description = desc;
    const cont = v('.ob-edit-contingency');
    if (cont !== undefined) body.contingency_protocol = cont;

    try {
      await apiService.request('PATCH', `/superadmin/outbreak-alerts/${id}`, body);
      this._obEditingId = null;
      Bus.emit('toast', { msg: lblFn().ob_updated });
      this.render();
    } catch (e) {
      Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' });
    }
  };
}
