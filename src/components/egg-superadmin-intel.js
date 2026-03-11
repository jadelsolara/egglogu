// EGGlogU — Superadmin Intelligence Hub Mixin
// Extracted from egg-superadmin.js for F5 decomposition

import { apiService } from '../core/api.js';
import { sanitizeHTML } from '../core/utils.js';

function _saFetch(path) {
  return apiService.request('GET', '/superadmin' + path);
}

/**
 * Mix Intelligence Hub methods into target class prototype
 * @param {Function} Klass - EggSuperadmin class
 */
export function mixIntelligence(Klass) {
  const P = Klass.prototype;

  P._renderIntelligence = async function(lbl) {
    const data = await _saFetch('/intelligence');
    let h = '';

    // ── Privacy Banner
    h += `<div class="card" style="border-left:4px solid var(--success,#4caf50);margin-bottom:16px;padding:12px 16px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-size:20px;font-weight:bold">&#x1F6E1;</span>
        <div>
          <strong style="font-size:13px">${lbl.intel_compliance}</strong>
          <div style="font-size:11px;color:var(--text-light)">
            ${(data.privacy?.compliance || []).join(' + ')} &bull;
            ${lbl.intel_k_anon}: \u2265${data.privacy?.k_anonymity_threshold || 5} &bull;
            ${lbl.intel_aggregated} &bull; ${lbl.intel_no_pii}
          </div>
        </div>
      </div>
    </div>`;

    // ── Conversion Funnel
    const f = data.funnel || {};
    const steps = [
      { label: lbl.intel_signups,    value: f.total_signups,       color: '#90CAF9' },
      { label: lbl.intel_verified,   value: f.email_verified,      color: '#64B5F6' },
      { label: lbl.intel_with_farm,  value: f.has_farm,            color: '#42A5F5' },
      { label: lbl.intel_with_data,  value: f.has_production_data, color: '#2196F3' },
      { label: lbl.intel_paying,     value: f.paying_customers,    color: '#1565C0' },
    ];
    const maxFunnel = Math.max(...steps.map(s => s.value || 1), 1);
    h += `<div class="card"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_funnel}</h3>
      <div style="display:flex;gap:6px;align-items:end;height:120px;margin-top:8px">`;
    steps.forEach(s => {
      const pct = Math.max(((s.value || 0) / maxFunnel) * 100, 10);
      h += `<div style="flex:1;min-width:60px;text-align:center;display:flex;flex-direction:column;justify-content:end;height:100%">
        <div style="font-size:16px;font-weight:700;color:${s.color}">${s.value || 0}</div>
        <div style="height:${pct}%;background:${s.color};border-radius:4px 4px 0 0;margin:2px auto 0;width:70%;min-height:8px"></div>
        <div style="font-size:9px;color:var(--text-light);margin-top:3px;line-height:1.2">${s.label}</div>
      </div>`;
    });
    h += `</div>
      <div style="text-align:right;margin-top:6px;font-size:12px">
        <strong>${lbl.intel_conv_rate}:</strong> <span style="color:var(--primary);font-weight:700">${f.conversion_rate_pct || 0}%</span>
      </div>
    </div>`;

    // ── Revenue Metrics
    const r = data.revenue || {};
    h += `<div class="card"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_revenue}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">
        <div class="kpi-card" style="padding:10px"><div class="kpi-label" style="font-size:10px">${lbl.intel_mrr}</div><div class="kpi-value" style="font-size:18px;color:var(--success)">$${(r.mrr || 0).toLocaleString()}</div></div>
        <div class="kpi-card" style="padding:10px"><div class="kpi-label" style="font-size:10px">${lbl.intel_arr}</div><div class="kpi-value" style="font-size:18px;color:var(--success)">$${(r.arr || 0).toLocaleString()}</div></div>
        <div class="kpi-card" style="padding:10px"><div class="kpi-label" style="font-size:10px">${lbl.intel_arpu}</div><div class="kpi-value" style="font-size:18px;color:var(--info)">$${(r.arpu || 0).toFixed(2)}</div></div>
        <div class="kpi-card" style="padding:10px"><div class="kpi-label" style="font-size:10px">${lbl.intel_ltv}</div><div class="kpi-value" style="font-size:18px;color:#FF9800">$${(r.avg_ltv || 0).toFixed(2)}</div></div>
        <div class="kpi-card" style="padding:10px"><div class="kpi-label" style="font-size:10px">${lbl.intel_paying}</div><div class="kpi-value" style="font-size:18px;color:var(--primary)">${r.paying_count || 0}</div></div>
        <div class="kpi-card" style="padding:10px"><div class="kpi-label" style="font-size:10px">${lbl.intel_trials}</div><div class="kpi-value" style="font-size:18px;color:var(--warning)">${r.trial_count || 0}</div></div>
        <div class="kpi-card" style="padding:10px"><div class="kpi-label" style="font-size:10px">${lbl.intel_free}</div><div class="kpi-value" style="font-size:18px;color:var(--text-light)">${r.free_count || 0}</div></div>
      </div>
    </div>`;

    // ── Engagement Tiers
    const eng = data.engagement_tiers || [];
    if (eng.length) {
      h += `<div class="card"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_engagement}</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">`;
      const engLabels = { power_user: lbl.intel_power, active: lbl.intel_active, occasional: lbl.intel_occasional, dormant: lbl.intel_dormant };
      const engColors = { power_user: '#1565C0', active: '#4CAF50', occasional: '#FF9800', dormant: '#9E9E9E' };
      eng.forEach(e => {
        h += `<div style="text-align:center;padding:10px 6px;background:var(--bg-card,var(--bg,#fff));border-radius:6px;border:2px solid ${engColors[e.tier] || '#ddd'}">
          <div style="font-size:22px;font-weight:700;color:${engColors[e.tier] || 'var(--text)'}">${e.count}</div>
          <div style="font-size:10px;color:var(--text-light);text-transform:uppercase">${engLabels[e.tier] || e.tier}</div>
          <div style="font-size:11px;color:${engColors[e.tier]};margin-top:2px">${e.percentage}%</div>
        </div>`;
      });
      h += '</div></div>';
    }

    // ── 2-Column Grid
    h += `<div class="intel-grid">`;

    // ── Geographic Distribution
    const geo = data.geo_distribution || [];
    if (geo.length) {
      h += `<div class="card"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_geo}</h3>
        <div class="table-wrap"><table style="font-size:12px"><thead><tr>
          <th></th><th>${lbl.total_users}</th><th>${lbl.total_orgs}</th>
        </tr></thead><tbody>`;
      geo.forEach(g => {
        h += `<tr><td><strong>${sanitizeHTML(g.country)}</strong></td><td>${g.user_count}</td><td>${g.org_count}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // ── Disease Prevalence
    const diseases = data.disease_prevalence || [];
    if (diseases.length) {
      h += `<div class="card"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_diseases}</h3>
        <div class="table-wrap"><table style="font-size:12px"><thead><tr>
          <th>${lbl.ob_disease}</th><th>#</th><th>${lbl.intel_farms}</th>
        </tr></thead><tbody>`;
      diseases.forEach(d => {
        h += `<tr><td><strong>${sanitizeHTML(d.disease)}</strong></td><td>${d.occurrence_count}</td><td>${d.farm_count}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // ── Breed Benchmarks
    const breeds = data.breed_benchmarks || [];
    if (breeds.length) {
      h += `<div class="card"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_benchmarks} — ${lbl.intel_breed}</h3>
        <div class="table-wrap"><table style="font-size:12px"><thead><tr>
          <th>${lbl.intel_breed}</th><th>${lbl.intel_farms}</th><th>Hen-Day%</th><th>Mort%</th><th>${lbl.intel_avg_eggs}</th>
        </tr></thead><tbody>`;
      breeds.forEach(b => {
        h += `<tr><td><strong>${sanitizeHTML(b.breed)}</strong></td><td>${b.farm_count}</td>
          <td>${b.avg_hen_day_pct != null ? b.avg_hen_day_pct + '%' : '-'}</td>
          <td>${b.avg_mortality_pct != null ? b.avg_mortality_pct + '%' : '-'}</td>
          <td>${b.avg_eggs_per_flock != null ? Math.round(b.avg_eggs_per_flock).toLocaleString() : '-'}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // ── Housing Type Benchmarks
    const housing = data.housing_benchmarks || [];
    if (housing.length) {
      h += `<div class="card"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_benchmarks} — ${lbl.intel_housing}</h3>
        <div class="table-wrap"><table style="font-size:12px"><thead><tr>
          <th>${lbl.intel_housing}</th><th>${lbl.intel_farms}</th><th>Hen-Day%</th><th>Mort%</th>
        </tr></thead><tbody>`;
      housing.forEach(hs => {
        h += `<tr><td><strong>${sanitizeHTML(hs.housing_type)}</strong></td><td>${hs.farm_count}</td>
          <td>${hs.avg_hen_day_pct != null ? hs.avg_hen_day_pct + '%' : '-'}</td>
          <td>${hs.avg_mortality_pct != null ? hs.avg_mortality_pct + '%' : '-'}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // ── Seasonal Trends
    const seasonal = data.seasonal_trends || [];
    if (seasonal.length) {
      h += `<div class="card" style="grid-column:1/-1"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_seasonal}</h3>
        <div class="table-wrap"><table style="font-size:12px"><thead><tr>
          <th>${lbl.intel_month}</th><th>${lbl.intel_avg_eggs}</th><th>${lbl.intel_avg_mortality}</th><th>${lbl.intel_data_points}</th>
        </tr></thead><tbody>`;
      seasonal.forEach(s => {
        h += `<tr><td><strong>${sanitizeHTML(s.month_name)}</strong></td>
          <td>${s.avg_total_eggs.toLocaleString()}</td>
          <td>${s.avg_mortality}</td>
          <td>${s.data_points.toLocaleString()}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // ── Market Channels
    const channels = data.channel_distribution || [];
    if (channels.length) {
      h += `<div class="card"><h3 style="font-size:14px;margin-bottom:6px">${lbl.intel_channels}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">`;
      const chColors = { wholesale: '#5C6BC0', supermarket: '#26A69A', restaurant: '#EF5350', direct: '#66BB6A', export: '#FFA726', pasteurized: '#AB47BC' };
      channels.forEach(c => {
        h += `<div style="flex:1;min-width:70px;text-align:center;padding:8px 4px;border-radius:6px;background:${chColors[c.channel] || '#78909C'}20;border:1px solid ${chColors[c.channel] || '#78909C'}40">
          <div style="font-size:15px;font-weight:700;color:${chColors[c.channel] || '#78909C'}">${c.percentage}%</div>
          <div style="font-size:9px;text-transform:uppercase;color:var(--text-light)">${sanitizeHTML(c.channel)}</div>
        </div>`;
      });
      h += '</div></div>';
    }

    // ── Egg Type Distribution
    const eggTypes = data.egg_type_distribution || [];
    if (eggTypes.length) {
      h += `<div class="card"><h3 style="font-size:14px;margin-bottom:6px">${lbl.intel_egg_types}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">`;
      eggTypes.forEach(et => {
        h += `<div style="flex:1;min-width:70px;text-align:center;padding:8px 4px;border-radius:6px;background:var(--bg-secondary,#f5f5f5)">
          <div style="font-size:15px;font-weight:700;color:var(--primary)">${et.percentage}%</div>
          <div style="font-size:9px;text-transform:uppercase;color:var(--text-light)">${sanitizeHTML(et.egg_type)}</div>
        </div>`;
      });
      h += '</div></div>';
    }

    // ── Close 2-Column Grid
    h += '</div>';

    // ── Module Adoption (full width)
    const modules = data.module_adoption || [];
    if (modules.length) {
      h += `<div class="card" style="margin-top:12px"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_modules}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">`;
      modules.forEach(m => {
        h += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="width:90px;font-size:11px;font-weight:600;text-transform:capitalize">${sanitizeHTML(m.module)}</div>
          <div style="flex:1;height:18px;background:var(--bg-secondary,#eee);border-radius:9px;overflow:hidden">
            <div style="height:100%;width:${m.adoption_pct}%;background:var(--primary,#1A3C6E);border-radius:9px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;min-width:30px">
              <span style="font-size:9px;color:#fff;font-weight:600">${m.adoption_pct}%</span>
            </div>
          </div>
          <div style="width:30px;font-size:10px;color:var(--text-light)">${m.orgs_using}</div>
        </div>`;
      });
      h += '</div></div>';
    }

    // ── UTM Attribution (full width)
    const utm = data.utm_attribution || [];
    if (utm.length) {
      h += `<div class="card" style="margin-top:12px"><h3 style="font-size:14px;margin-bottom:8px">${lbl.intel_utm}</h3>
        <div class="table-wrap"><table style="font-size:12px"><thead><tr>
          <th>${lbl.intel_source}</th><th>${lbl.intel_signups}</th><th>${lbl.intel_converted}</th><th>${lbl.intel_conv_rate}</th>
        </tr></thead><tbody>`;
      utm.forEach(u => {
        h += `<tr><td><strong>${sanitizeHTML(u.source)}</strong></td><td>${u.signups}</td><td>${u.converted_to_paid}</td>
          <td><span class="badge ${u.conversion_pct >= 10 ? 'badge-success' : u.conversion_pct >= 5 ? 'badge-warning' : 'badge-secondary'}">${u.conversion_pct}%</span></td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // Empty state
    if (!geo.length && !breeds.length && !seasonal.length && !channels.length && !modules.length) {
      h += `<div class="card" style="text-align:center;padding:32px;color:var(--text-light)">
        <div style="font-size:20px;margin-bottom:10px;font-weight:bold">Intelligence</div>
        <p style="font-size:13px">Los datos de inteligencia se poblaran automaticamente a medida que los usuarios registren informacion.</p>
        <p style="font-size:11px">Los benchmarks requieren minimo ${data.privacy?.k_anonymity_threshold || 5} granjas por grupo (k-anonimato).</p>
      </div>`;
    }

    return h;
  };
}
