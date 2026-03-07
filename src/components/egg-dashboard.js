// EGGlogU — Dashboard Web Component
// KPIs, Quick Entry, Alerts, Recommendations, Weather, Trend Chart, KPI History, Integrity Widget

import { Bus } from '../core/bus.js';
import { Store } from '../core/store.js';
import { t, getLang } from '../core/i18n.js';
import { sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, genId } from '../core/utils.js';
import { computeKpiSnapshot, saveKpiSnapshot, snapshotDelta, getAlerts, getRecommendations } from '../core/kpi.js';
import { kpi, currency, flockSelect, feedTypeSelect, catalogSelect, logAudit } from '../core/helpers.js';
import { activeHens } from '../core/veng.js';
import { VENG } from '../core/veng.js';
import { CATALOGS } from '../core/catalogs.js';

const THEMES = {
  blue: { rgb: '26,60,110' }, green: { rgb: '46,125,50' }, purple: { rgb: '106,27,154' },
  black: { rgb: '55,71,79' }, dark: { rgb: '144,202,249' }
};

const PLAN_TIERS = {
  hobby: { name: 'Hobby' }, starter: { name: 'Starter' },
  pro: { name: 'Pro' }, enterprise: { name: 'Enterprise' }
};

function themeColor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function themeRgba(a) { const th = THEMES[localStorage.getItem('egglogu_theme') || 'blue'] || THEMES.blue; return 'rgba(' + th.rgb + ',' + a + ')'; }
function wmoDesc(c) { if (c === 0) return 'Clear sky'; if (c <= 3) return ['Mainly clear', 'Partly cloudy', 'Overcast'][c - 1]; if (c === 45 || c === 48) return 'Fog'; if (c >= 51 && c <= 55) return 'Drizzle'; if (c >= 56 && c <= 57) return 'Freezing drizzle'; if (c >= 61 && c <= 65) return 'Rain'; if (c >= 66 && c <= 67) return 'Freezing rain'; if (c >= 71 && c <= 77) return 'Snow'; if (c >= 80 && c <= 82) return 'Rain showers'; if (c >= 85 && c <= 86) return 'Snow showers'; if (c >= 95 && c <= 99) return 'Thunderstorm'; return 'Unknown'; }
function wmoIcon(c) { if (c === 0) return '\u2600\uFE0F'; if (c === 1) return '\uD83C\uDF24\uFE0F'; if (c === 2) return '\u26C5'; if (c === 3) return '\u2601\uFE0F'; if (c === 45 || c === 48) return '\uD83C\uDF2B\uFE0F'; if (c >= 51 && c <= 57) return '\uD83C\uDF26\uFE0F'; if (c >= 61 && c <= 67) return '\uD83C\uDF27\uFE0F'; if (c >= 71 && c <= 77) return '\uD83C\uDF28\uFE0F'; if (c >= 80 && c <= 82) return '\uD83C\uDF27\uFE0F'; if (c >= 85 && c <= 86) return '\uD83C\uDF28\uFE0F'; if (c >= 95) return '\u26C8\uFE0F'; return '\uD83C\uDF21\uFE0F'; }
function calcTHI(temp, h) { return (1.8 * temp + 32) - (0.55 - 0.0055 * h) * (1.8 * temp - 26); }

class EggDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._chart = null;
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const D = Store.get();

    if (D.settings.campoMode) { this._renderCampo(D); return; }
    if (D.settings.vetMode) { this._renderVet(D); return; }

    const today = todayStr();
    const snap = computeKpiSnapshot();
    const prevSnap = D.kpiSnapshots.length > 0 ? D.kpiSnapshots[D.kpiSnapshots.length - 1] : null;
    const alerts = getAlerts(D);

    let h = this._baseStyle();
    h += `<div class="page-header"><h2>${t('dash_title')}</h2><div class="btn-group"><button class="btn btn-secondary" data-action="snapshot">${t('dash_snapshot')}</button><span>${sanitizeHTML(D.farm.name)}</span></div></div>`;
    h += this._renderTrialBanner(D);
    h += '<div class="kpi-grid">';
    h += kpi(t('kpi_today'), fmtNum(snap.eggsToday), '', '', t('kpi_info_today'));
    h += kpi(t('kpi_henday'), fmtNum(snap.henDay, 1) + '%', fmtNum(snap.activeHens) + ' ' + (t('kpi_active_hens') || '').toLowerCase() + (prevSnap ? snapshotDelta(snap.henDay, prevSnap.henDay) : ''), snap.henDay < 50 ? 'danger' : snap.henDay < 70 ? 'warning' : '', t('kpi_info_henday'));
    h += kpi(t('kpi_fcr'), snap.fcr > 0 ? fmtNum(snap.fcr, 2) : '-', t('fcr_unit') + (prevSnap ? snapshotDelta(-snap.fcr, -prevSnap.fcr) : ''), snap.fcr > 3 ? 'danger' : snap.fcr > 2.5 ? 'warning' : '', t('kpi_info_fcr'));
    h += kpi(t('kpi_mortality'), fmtNum(snap.mortality, 1) + '%', '' + (prevSnap ? snapshotDelta(-snap.mortality, -prevSnap.mortality) : ''), snap.mortality > 5 ? 'danger' : snap.mortality > 3 ? 'warning' : '', t('kpi_info_mortality'));
    h += kpi(t('kpi_cost_egg'), fmtMoney(snap.costPerEgg), '' + (prevSnap ? snapshotDelta(-snap.costPerEgg, -prevSnap.costPerEgg) : ''), 'accent', t('kpi_info_cost_egg'));
    h += kpi(t('kpi_income_net'), fmtMoney(snap.netIncome), today.substring(0, 7) + (prevSnap ? snapshotDelta(snap.netIncome, prevSnap.netIncome) : ''), snap.netIncome < 0 ? 'danger' : 'secondary', t('kpi_info_income_net'));
    h += kpi(t('kpi_active_hens'), fmtNum(snap.activeHens), snap.totalFlocks + ' ' + (t('kpi_active_flocks') || '').toLowerCase(), '', t('kpi_info_active_hens'));
    h += kpi(t('kpi_alerts'), alerts.length.toString(), alerts.length > 0 ? '\u26A0' : '\u2713', alerts.length > 0 ? 'warning' : '', t('kpi_info_alerts'));
    h += '</div>';

    // Quick Entry
    h += this._renderQuickEntry(D);

    // Alerts
    if (alerts.length) {
      h += `<div class="card"><h3>${t('dash_alerts')}</h3>`;
      alerts.forEach(a => { h += `<div class="alert-card alert-${sanitizeHTML(a.type)}">${sanitizeHTML(a.icon)} ${a.msg}</div>`; });
      h += '</div>';
    }

    // Recommendations
    const recs = getRecommendations(D);
    if (recs.length) {
      h += `<div class="rec-card"><h3>\uD83D\uDCA1 ${t('rec_title')}</h3>`;
      recs.forEach(r => { h += `<div class="rec-item"><span class="rec-priority ${r.priority}">${r.priority.toUpperCase()}</span><span>${r.icon} ${r.msg}</span></div>`; });
      h += '</div>';
    }

    // Weather
    if (D.farm.lat !== null && D.farm.lng !== null) {
      h += '<div id="weather-widget"><div class="weather-widget"><p style="color:var(--text-light)">' + t('weather_title') + '...</p></div></div>';
    } else {
      h += `<div class="card" style="background:var(--primary-fill)"><p style="color:var(--text-light)">${t('weather_no_key')} <a data-action="go-config" style="color:var(--primary);cursor:pointer">${t('cfg_title')}</a></p></div>`;
    }

    // Trend Chart
    h += `<div class="card"><h3>${t('dash_trend')}</h3><div class="chart-container"><canvas id="chart-trend"></canvas></div></div>`;

    // KPI History
    if (D.kpiSnapshots.length > 1) {
      h += `<div class="card"><h3>${t('dash_kpi_history')} (${D.kpiSnapshots.length} ${t('snapshots')})</h3><div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>Hen-Day</th><th>FCR</th><th>${t('kpi_mortality')}</th><th>${t('kpi_cost_egg')}</th><th>${t('kpi_income_net')}</th><th>${t('kpi_active_hens')}</th></tr></thead><tbody>`;
      D.kpiSnapshots.slice(-10).reverse().forEach((s, i, arr) => {
        const prev = arr[i + 1] || null;
        h += `<tr><td>${fmtDate(s.date)}</td><td>${fmtNum(s.henDay, 1)}%${prev ? snapshotDelta(s.henDay, prev.henDay) : ''}</td><td>${fmtNum(s.fcr, 2)}</td><td>${fmtNum(s.mortality, 1)}%</td><td>${fmtMoney(s.costPerEgg)}</td><td>${fmtMoney(s.netIncome)}</td><td>${fmtNum(s.activeHens)}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    }

    // Integrity Widget
    h += this._renderIntegrityWidget(D);

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
    this._renderTrendChart(D);
    this._fetchWeather(D);
  }

  _baseStyle() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
      .btn-group { display: flex; gap: 8px; align-items: center; }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn:hover { opacity: 0.85; }
      .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
      .kpi-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative; }
      .kpi-card.danger { border-left: 4px solid var(--danger, #dc3545); }
      .kpi-card.warning { border-left: 4px solid var(--warning, #ffc107); }
      .kpi-card.accent { border-left: 4px solid var(--accent, #FF8F00); }
      .kpi-card.secondary { border-left: 4px solid var(--secondary, #6c757d); }
      .kpi-label { font-size: 12px; color: var(--text-light, #888); text-transform: uppercase; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #333); }
      .kpi-sub { font-size: 12px; color: var(--text-light, #888); margin-top: 4px; }
      .kpi-info-btn { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border, #ccc); background: var(--bg, #fff); font-size: 11px; cursor: pointer; color: var(--text-light, #888); }
      .kpi-tooltip { position: absolute; top: 36px; right: 8px; background: var(--text, #333); color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px; z-index: 10; max-width: 250px; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .alert-card { padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; font-size: 14px; }
      .alert-danger { background: #ffebee; color: #c62828; }
      .alert-warning { background: #fff8e1; color: #e65100; }
      .rec-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .rec-card h3 { margin: 0 0 12px; }
      .rec-item { display: flex; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border, #eee); }
      .rec-priority { font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 700; }
      .rec-priority.high { background: #ffcdd2; color: #b71c1c; }
      .rec-priority.medium { background: #fff9c4; color: #f57f17; }
      .rec-priority.low { background: #e8f5e9; color: #2e7d32; }
      .chart-container { position: relative; height: 300px; }
      .weather-widget { padding: 12px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
      .snapshot-badge { font-size: 11px; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
      .snapshot-up { background: #e8f5e9; color: #2e7d32; }
      .snapshot-down { background: #ffebee; color: #c62828; }
      .snapshot-same { background: #f5f5f5; color: #888; }
      /* Quick Entry */
      .qe-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px; }
      .qe-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .qe-card h4 { margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }
      .qe-icon { font-size: 20px; }
      .qe-fields { display: flex; flex-direction: column; gap: 8px; }
      .qe-fields label { font-size: 12px; color: var(--text-light, #888); display: block; margin-bottom: 2px; }
      .qe-fields select, .qe-fields input { width: 100%; padding: 8px; border: 1px solid var(--border, #ddd); border-radius: 6px; font-size: 14px; box-sizing: border-box; }
      .qe-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .qe-submit { width: 100%; padding: 10px; background: var(--primary, #1A3C6E); color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600; }
      .qe-submit:disabled { opacity: 0.5; }
      .qe-success { display: none; text-align: center; color: var(--success, #2e7d32); font-weight: 600; padding: 6px; }
      .campo-kpi { font-size: 32px; font-weight: 700; color: var(--primary, #1A3C6E); }
      .health-score { font-weight: 700; padding: 2px 8px; border-radius: 4px; }
      .health-score.good { background: #e8f5e9; color: #2e7d32; }
      .health-score.warn { background: #fff9c4; color: #f57f17; }
      .health-score.bad { background: #ffebee; color: #c62828; }
      details summary { cursor: pointer; font-weight: 600; color: var(--text-secondary, #555); }
      .dm-badge-critical { background: #ffcdd2; color: #b71c1c; padding: 3px 10px; border-radius: 10px; font-size: 12px; }
      @media (max-width: 600px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
        .qe-grid { grid-template-columns: 1fr; }
      }
    </style>`;
  }

  _renderQuickEntry(D) {
    const flocks = D.flocks.filter(f => f.status !== 'descarte');
    if (!flocks.length) return '';
    const fOpts = flocks.map(f => `<option value="${escapeAttr(f.id)}">${sanitizeHTML(f.name)}</option>`).join('');
    const causeOpts = catalogSelect(CATALOGS.deathCauses, '');
    let h = `<div style="margin-bottom:8px"><h3 style="color:var(--primary-dark);display:flex;align-items:center;gap:8px">\u26A1 ${t('qe_title')}</h3></div>`;
    h += '<div class="qe-grid">';
    // Eggs
    h += `<div class="qe-card qe-eggs"><h4><span class="qe-icon">\uD83E\uDD5A</span>${t('qe_eggs_title')}</h4><div class="qe-fields">`;
    h += `<div><label>${t('prod_flock')}</label><select id="qe-egg-flock">${fOpts}</select></div>`;
    h += `<div><label>${t('qe_eggs_count')}</label><input type="number" id="qe-egg-count" min="0" placeholder="0" inputmode="numeric"></div>`;
    h += `<button class="qe-submit" data-action="qe-eggs">${t('qe_save')}</button>`;
    h += `<div class="qe-success" id="qe-egg-ok">\u2713 ${t('qe_saved')}</div></div></div>`;
    // Feed
    h += `<div class="qe-card qe-feed"><h4><span class="qe-icon">\uD83C\uDF3E</span>${t('qe_feed_title')}</h4><div class="qe-fields">`;
    h += `<div><label>${t('prod_flock')}</label><select id="qe-feed-flock" data-action="qe-feed-flock-change">${fOpts}</select></div>`;
    h += `<div class="qe-row"><div><label>${t('qe_feed_kg')}</label><input type="number" id="qe-feed-kg" min="0" step="0.1" placeholder="0" inputmode="decimal"></div>`;
    h += `<div><label>${t('feed_type')}</label><select id="qe-feed-type">${feedTypeSelect('', flocks[0] ? flocks[0].id : '')}</select></div></div>`;
    h += `<button class="qe-submit" data-action="qe-feed">${t('qe_save')}</button>`;
    h += `<div class="qe-success" id="qe-feed-ok">\u2713 ${t('qe_saved')}</div></div></div>`;
    // Mortality
    h += `<div class="qe-card qe-mort"><h4><span class="qe-icon">\uD83D\uDC80</span>${t('qe_mort_title')}</h4><div class="qe-fields">`;
    h += `<div><label>${t('prod_flock')}</label><select id="qe-mort-flock">${fOpts}</select></div>`;
    h += `<div class="qe-row"><div><label>${t('qe_deaths')}</label><input type="number" id="qe-mort-count" min="0" placeholder="0" inputmode="numeric"></div>`;
    h += `<div><label>${t('qe_cause')}</label><select id="qe-mort-cause">${causeOpts}</select></div></div>`;
    h += `<button class="qe-submit" data-action="qe-mort">${t('qe_save')}</button>`;
    h += `<div class="qe-success" id="qe-mort-ok">\u2713 ${t('qe_saved')}</div></div></div>`;
    // Environment
    h += `<div class="qe-card qe-env"><h4><span class="qe-icon">\uD83C\uDF21\uFE0F</span>${t('qe_env_title')}</h4><div class="qe-fields">`;
    h += `<div class="qe-row"><div><label>${t('qe_temp')}</label><input type="number" id="qe-env-temp" step="0.1" placeholder="22" inputmode="decimal"></div>`;
    h += `<div><label>${t('qe_hum')}</label><input type="number" id="qe-env-hum" min="0" max="100" placeholder="55" inputmode="numeric"></div></div>`;
    h += `<div><label>${t('env_light')}</label><input type="number" id="qe-env-light" step="0.5" min="0" max="24" placeholder="14"></div>`;
    h += `<button class="qe-submit" data-action="qe-env">${t('qe_save')}</button>`;
    h += `<div class="qe-success" id="qe-env-ok">\u2713 ${t('qe_saved')}</div></div></div>`;
    h += '</div>';
    return h;
  }

  _renderTrialBanner(D) {
    const p = D.settings.plan || {};
    const pmo = t('price_per_mo');
    const tierName = (PLAN_TIERS[p.tier] || {}).name || p.tier || '';
    const phase = p.discount_phase || 0;
    const curPrice = p.current_price || 0;
    const basePrice = p.base_price || 0;
    const nextPrice = p.next_price || null;
    const discPct = p.discount_pct || 0;

    if (p.status === 'suspended') {
      return `<div class="card" style="background:linear-gradient(135deg,#dc3545,#c82333);color:#fff;padding:24px;margin-bottom:16px;text-align:center">
      <h3 style="margin:0 0 8px;font-size:1.3em">${t('trial_ended_title')}</h3>
      <p style="margin:0 0 16px;opacity:.9">${t('trial_ended_subtitle')}</p>
      <button class="btn" data-action="upgrade" style="background:#fff;color:#dc3545;font-weight:700;padding:12px 32px;font-size:1.1em;border:none;border-radius:8px;cursor:pointer">${t('btn_see_plans')}</button></div>`;
    }
    if (!p.is_trial && phase > 0 && phase < 4 && discPct > 0) {
      return `<div class="card" style="background:linear-gradient(135deg,#059669,#047857);color:#fff;padding:16px 24px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div><strong style="font-size:1.1em">${tierName}: $${curPrice}${pmo}</strong>
      <span style="background:rgba(255,255,255,.2);padding:2px 10px;border-radius:12px;font-size:.85em;margin-left:8px">${discPct}% off</span>
      ${nextPrice ? `<br><span style="opacity:.7;font-size:.85em">${t('billing_next_quarter')}: $${nextPrice}${pmo}</span>` : ''}
      </div><span style="opacity:.6;font-size:.8em">${t('billing_regular_price')}: $${basePrice}${pmo}</span></div>`;
    }
    if (!p.is_trial) return '';
    const days = p.trial_days_left;
    if (days === undefined || days === null) return '';
    const urgent = days <= 7;
    const bg = urgent ? 'linear-gradient(135deg,#fef3c7,#fde68a)' : 'linear-gradient(135deg,var(--primary-fill),var(--accent-fill))';
    const textColor = urgent ? '#92400e' : 'var(--text)';
    return `<div class="card" style="background:${bg};padding:16px 24px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
    <div style="color:${textColor}"><strong style="font-size:1.1em">${days > 0 ? days + ' ' + t('trial_days_left') : t('trial_last_day')}</strong>
    <br><span style="opacity:.8">${t('trial_full_access')}</span></div>
    ${days <= 7 ? `<button class="btn btn-primary" data-action="upgrade" style="white-space:nowrap">${t('btn_see_plans')}</button>` : ''}
    </div>`;
  }

  _renderIntegrityWidget(D) {
    const xv = VENG.xval(D); const mv = VENG.mathv(D); const cs = VENG.census(D);
    let h = `<div class="card" style="border-left:4px solid ${xv.score >= 90 ? 'var(--success)' : xv.score >= 70 ? 'var(--warning)' : 'var(--danger)'}">`;
    h += `<h3>\uD83D\uDD12 Data Integrity \u2014 Zero Tolerance</h3><div class="kpi-grid">`;
    h += kpi('Data Score', xv.score + '/100', 'XVAL cross-check', xv.score >= 90 ? '' : 'danger');
    h += kpi('Math Check', mv.pct + '%', mv.pass + '/' + mv.total + ' passed', mv.pct === 100 ? '' : 'danger');
    h += kpi('Farm Health', cs.overall + '/100', cs.critical + ' critical, ' + cs.warning + ' warnings', cs.overall >= 80 ? '' : 'danger');
    h += '</div>';
    if (cs.findings.length > 0) {
      h += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">';
      cs.findings.filter(f => f.sev === 'critical').slice(0, 3).forEach(f => {
        h += `<span class="dm-badge-critical">${f.code}</span>`;
      });
      h += ` <a data-action="go-carencias" style="font-size:12px;color:var(--primary);align-self:center;cursor:pointer">View all \u2192</a></div>`;
    }
    h += `</div><div class="card" style="border-left:4px solid ${cs.overall >= 80 ? 'var(--success)' : cs.overall >= 60 ? 'var(--warning)' : 'var(--danger)'}">`;
    h += '<h3>\uD83D\uDD0D Deficiency Census</h3><div style="display:flex;gap:10px;flex-wrap:wrap">';
    ['sanitary', 'nutritional', 'financial', 'operational', 'data'].forEach(cat => {
      const icons = { sanitary: '\uD83D\uDC89', nutritional: '\uD83C\uDF3E', financial: '\uD83D\uDCB0', operational: '\uD83D\uDCCB', data: '\uD83D\uDD12' };
      const s = cs.scores[cat]; const sc = s >= 80 ? '#2e7d32' : s >= 60 ? '#e65100' : '#c62828';
      h += `<div style="text-align:center;min-width:60px"><div style="font-size:20px;font-weight:700;color:${sc}">${s}</div><div style="font-size:11px;color:var(--text-light)">${icons[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</div></div>`;
    });
    h += '</div></div>';
    if (xv.issues.length) {
      h += `<details style="margin-top:8px"><summary>${xv.issues.length} issue${xv.issues.length > 1 ? 's' : ''} found</summary>`;
      h += '<div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Sev</th><th>Module</th><th>Issue</th></tr></thead><tbody>';
      xv.issues.forEach(i => {
        const c = i.severity === 'error' ? 'var(--danger)' : i.severity === 'warning' ? 'var(--warning)' : 'var(--text-light)';
        h += `<tr><td style="color:${c};font-weight:700">${i.severity.toUpperCase()}</td><td>${sanitizeHTML(i.module)}</td><td>${sanitizeHTML(i.msg)}`;
        if (i.trace && i.trace.length) { h += '<br><small style="color:var(--text-light)">Origin: ' + i.trace.map(tr => tr.date + ' ' + tr.type + (tr.balance !== undefined ? ' (bal:' + tr.balance + ')' : '')).join(' \u2192 ') + '</small>'; }
        h += '</td></tr>';
      });
      h += '</tbody></table></div></details>';
    }
    if (mv.checks.some(c => !c.ok)) {
      h += '<details style="margin-top:8px"><summary style="color:var(--danger)">Math verification failures</summary><div style="margin-top:6px">';
      mv.checks.filter(c => !c.ok).forEach(c => {
        h += `<div class="alert-card alert-danger" style="margin:4px 0">\u274C ${sanitizeHTML(c.name)}: ${sanitizeHTML(c.detail)}</div>`;
      });
      h += '</div></details>';
    }
    return h;
  }

  _renderCampo(D) {
    const snap = computeKpiSnapshot();
    const alerts = getAlerts(D);
    let h = this._baseStyle();
    h += `<div style="text-align:center;padding:20px 0"><h2>\uD83C\uDF3E ${t('nav_campo_mode')}</h2></div>`;
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:500px;margin:0 auto">';
    h += `<div class="kpi-card" style="padding:24px;text-align:center"><div class="kpi-label">${t('kpi_today')}</div><div class="campo-kpi">${fmtNum(snap.eggsToday)}</div></div>`;
    h += `<div class="kpi-card" style="padding:24px;text-align:center"><div class="kpi-label">${t('kpi_henday')}</div><div class="campo-kpi">${fmtNum(snap.henDay, 1)}%</div></div>`;
    h += `<div class="kpi-card" style="padding:24px;text-align:center"><div class="kpi-label">${t('kpi_mortality')}</div><div class="campo-kpi">${fmtNum(snap.mortality, 1)}%</div></div>`;
    h += `<div class="kpi-card" style="padding:24px;text-align:center"><div class="kpi-label">${t('kpi_alerts')}</div><div class="campo-kpi">${alerts.length}</div></div>`;
    h += '</div>';
    h += this._renderQuickEntry(D);
    if (alerts.length) {
      h += `<div class="card" style="margin-top:16px"><h3>${t('dash_alerts')}</h3>`;
      alerts.forEach(a => { h += `<div class="alert-card alert-${sanitizeHTML(a.type)}">${sanitizeHTML(a.icon)} ${a.msg}</div>`; });
      h += '</div>';
    }
    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  _renderVet(D) {
    let h = this._baseStyle();
    h += `<div style="text-align:center;padding:12px 0"><h2>\uD83E\uDE7A ${t('nav_vet_mode')}</h2></div>`;
    h += `<div class="card"><label>${t('vet_select_farm')}</label><select id="vet-flock" data-action="vet-flock-change">${flockSelect('', true)}</select></div>`;
    h += '<div id="vet-content"></div>';
    h += `<div class="card" style="margin-top:16px"><h4>${t('actions')}</h4><div class="btn-group">
    <button class="btn btn-primary" data-action="vet-visit">\u2705 ${t('vet_visit')}</button>
    <button class="btn btn-secondary" data-action="vet-vaccines">\uD83D\uDC89 ${t('vet_vaccines')}</button>
    <button class="btn btn-secondary" data-action="vet-pending">\u23F3 ${t('vet_pending')}</button></div></div>`;
    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) {
        // KPI tooltip toggle
        if (e.target.classList.contains('kpi-info-btn')) {
          const card = e.target.closest('.kpi-card');
          const existing = card.querySelector('.kpi-tooltip');
          if (existing) { existing.remove(); return; }
          root.querySelectorAll('.kpi-tooltip').forEach(el => el.remove());
          const info = e.target.dataset.kpiInfo;
          if (info) {
            const tip = document.createElement('div');
            tip.className = 'kpi-tooltip';
            tip.textContent = info;
            card.appendChild(tip);
          }
          return;
        }
        // Close tooltips on outside click
        if (!e.target.closest('.kpi-info-btn') && !e.target.closest('.kpi-tooltip')) {
          root.querySelectorAll('.kpi-tooltip').forEach(el => el.remove());
        }
        return;
      }
      const action = btn.dataset.action;
      switch (action) {
        case 'snapshot': this._saveSnapshot(); break;
        case 'qe-eggs': this._qeSaveEggs(btn); break;
        case 'qe-feed': this._qeSaveFeed(btn); break;
        case 'qe-mort': this._qeSaveMort(btn); break;
        case 'qe-env': this._qeSaveEnv(btn); break;
        case 'go-config': Bus.emit('nav:request', { section: 'config' }); break;
        case 'go-carencias': Bus.emit('nav:request', { section: 'carencias' }); break;
        case 'upgrade': Bus.emit('modal:upgrade'); break;
        case 'vet-visit': this._vetAction('visit'); break;
        case 'vet-vaccines': this._vetAction('vaccines'); break;
        case 'vet-pending': this._vetAction('pending'); break;
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.dataset.action === 'qe-feed-flock-change') {
        const fid = e.target.value || '';
        const sel = root.querySelector('#qe-feed-type');
        if (sel) sel.innerHTML = feedTypeSelect('', fid);
      }
      if (e.target.dataset.action === 'vet-flock-change') {
        this._renderVetFlock();
      }
    });
  }

  _saveSnapshot() {
    saveKpiSnapshot();
    Bus.emit('toast', { msg: t('cfg_saved') });
    this.render();
  }

  _qeFlash(id) {
    const el = this.shadowRoot.querySelector('#' + id);
    if (!el) return;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2500);
  }

  _qeSaveEggs(btn) {
    const root = this.shadowRoot;
    const fid = root.querySelector('#qe-egg-flock').value;
    const eggs = parseInt(root.querySelector('#qe-egg-count').value) || 0;
    if (!fid || eggs <= 0) { Bus.emit('toast', { msg: t('required'), type: 'error' }); return; }
    btn.disabled = true;
    const D = Store.get();
    D.dailyProduction.push({ id: genId(), date: todayStr(), flockId: fid, eggsCollected: eggs, deaths: 0, eggsBroken: 0, eggsS: 0, eggsM: 0, eggsL: 0, eggsXL: 0, eggsJumbo: 0, shellColor: '', yolkScore: 0, deathCause: '', eggType: 'conventional', marketChannel: 'wholesale', notes: 'quick entry' });
    logAudit('create', 'production', 'Quick entry: ' + eggs + ' eggs', null, { flockId: fid, eggs });
    if (eggs > 0) D.inventory.push({ id: genId(), date: todayStr(), flockId: fid, eggType: 'M', qtyIn: eggs, qtyOut: 0, source: 'production', ref: 'qe' });
    Store.save(D);
    root.querySelector('#qe-egg-count').value = '';
    this._qeFlash('qe-egg-ok');
    setTimeout(() => { btn.disabled = false; this.render(); }, 1500);
  }

  _qeSaveFeed(btn) {
    const root = this.shadowRoot;
    const fid = root.querySelector('#qe-feed-flock').value;
    const kg = parseFloat(root.querySelector('#qe-feed-kg').value) || 0;
    const ftype = root.querySelector('#qe-feed-type').value;
    if (!fid || kg <= 0) { Bus.emit('toast', { msg: t('required'), type: 'error' }); return; }
    btn.disabled = true;
    const D = Store.get();
    D.feed.consumption.push({ id: genId(), date: todayStr(), flockId: fid, quantityKg: kg, type: ftype });
    logAudit('create', 'feed', 'Quick entry: ' + kg + ' kg feed', null, { flockId: fid, kg });
    Store.save(D);
    root.querySelector('#qe-feed-kg').value = '';
    this._qeFlash('qe-feed-ok');
    setTimeout(() => { btn.disabled = false; this.render(); }, 1500);
  }

  _qeSaveMort(btn) {
    const root = this.shadowRoot;
    const fid = root.querySelector('#qe-mort-flock').value;
    const deaths = parseInt(root.querySelector('#qe-mort-count').value) || 0;
    const cause = root.querySelector('#qe-mort-cause').value;
    if (!fid || deaths <= 0) { Bus.emit('toast', { msg: t('required'), type: 'error' }); return; }
    btn.disabled = true;
    const D = Store.get();
    const existing = D.dailyProduction.find(p => p.date === todayStr() && p.flockId === fid);
    if (existing) {
      existing.deaths = (existing.deaths || 0) + deaths;
      if (cause && !existing.deathCause) existing.deathCause = cause;
    } else {
      D.dailyProduction.push({ id: genId(), date: todayStr(), flockId: fid, eggsCollected: 0, deaths, eggsBroken: 0, eggsS: 0, eggsM: 0, eggsL: 0, eggsXL: 0, eggsJumbo: 0, shellColor: '', yolkScore: 0, deathCause: cause, eggType: 'conventional', marketChannel: 'wholesale', notes: 'mortality quick entry' });
    }
    logAudit('create', 'mortality', 'Quick entry: ' + deaths + ' deaths', null, { flockId: fid, deaths, cause });
    Store.save(D);
    root.querySelector('#qe-mort-count').value = '';
    this._qeFlash('qe-mort-ok');
    setTimeout(() => { btn.disabled = false; this.render(); }, 1500);
  }

  _qeSaveEnv(btn) {
    const root = this.shadowRoot;
    const temp = parseFloat(root.querySelector('#qe-env-temp').value) || null;
    const hum = parseFloat(root.querySelector('#qe-env-hum').value) || null;
    const light = parseFloat(root.querySelector('#qe-env-light').value) || null;
    if (temp === null && hum === null) { Bus.emit('toast', { msg: t('required'), type: 'error' }); return; }
    btn.disabled = true;
    const D = Store.get();
    D.environment.push({ id: genId(), date: todayStr(), temperature: temp, humidity: hum, lightHours: light, ammoniaLevel: null, ventilation: '', notes: 'quick entry' });
    logAudit('create', 'environment', 'Quick entry: ' + temp + '\u00B0C ' + hum + '%', null, { temp, hum });
    Store.save(D);
    root.querySelector('#qe-env-temp').value = '';
    root.querySelector('#qe-env-hum').value = '';
    root.querySelector('#qe-env-light').value = '';
    this._qeFlash('qe-env-ok');
    setTimeout(() => { btn.disabled = false; this.render(); }, 1500);
  }

  _vetAction(type) {
    const D = Store.get();
    const fid = this.shadowRoot.querySelector('#vet-flock')?.value || '';
    const f = D.flocks.find(x => x.id === fid);
    const note = type === 'visit' ? t('vet_visit') : type === 'vaccines' ? t('vet_vaccines') : t('vet_pending');
    if (!D.logbook) D.logbook = [];
    D.logbook.push({ id: genId(), date: todayStr(), entry: '\uD83E\uDE7A ' + note + (f ? ' - ' + sanitizeHTML(f.name) : ''), category: 'health' });
    if (!D.biosecurity) D.biosecurity = { zones: [], visitors: [], pestSightings: [], protocols: [] };
    D.biosecurity.visitors.push({ id: genId(), date: todayStr(), name: 'Veterinario', company: '', purpose: note, zone: '', vehiclePlate: '', disinfected: true, fromFarmId: '', fromFarmHealth: 'healthy', notes: '' });
    Store.save(D);
    Bus.emit('toast', { msg: t('cfg_saved') });
  }

  _renderVetFlock() {
    const root = this.shadowRoot;
    const fid = root.querySelector('#vet-flock')?.value;
    const container = root.querySelector('#vet-content');
    if (!fid || !container) { if (container) container.innerHTML = ''; return; }
    const D = Store.get();
    const f = D.flocks.find(x => x.id === fid);
    if (!f) return;
    const hs = this._computeFlockHealth(fid, D);
    const outbreaks = D.outbreaks.filter(o => o.flockId === fid && o.status === 'active');
    const lastEnv = D.environment.length > 0 ? D.environment[D.environment.length - 1] : null;
    const pendingVac = D.vaccines.filter(v => v.flockId === fid && v.status !== 'applied');
    let h = '<div class="kpi-grid">';
    h += kpi(t('flock_health'), hs + '/100', '', hs < 50 ? 'danger' : hs < 70 ? 'warning' : '');
    h += kpi(t('out_title'), outbreaks.length.toString(), outbreaks.length ? t('out_active') : '\u2705', outbreaks.length ? 'danger' : '');
    h += kpi(t('vac_title'), pendingVac.length.toString(), t('vac_pending'), '');
    h += '</div>';
    if (outbreaks.length) {
      h += `<div class="card"><h4>\uD83E\uDDA0 ${t('out_title')}</h4>`;
      outbreaks.forEach(o => { h += `<div class="alert-card alert-danger">${sanitizeHTML(o.disease)} - ${fmtDate(o.startDate)} | ${sanitizeHTML(o.treatment || '-')}</div>`; });
      h += '</div>';
    }
    if (lastEnv) {
      h += `<div class="card"><h4>\uD83C\uDF21\uFE0F ${t('env_title')}</h4><p>${t('env_temp')}: ${lastEnv.temperature || '-'}\u00B0C | ${t('env_humidity')}: ${lastEnv.humidity || '-'}%</p></div>`;
    }
    if (pendingVac.length) {
      h += `<div class="card"><h4>\uD83D\uDC89 ${t('vac_title')}</h4>`;
      pendingVac.forEach(v => {
        h += `<div class="alert-card alert-${v.scheduledDate < todayStr() ? 'danger' : 'warning'}">${sanitizeHTML(v.vaccineName)} - ${fmtDate(v.scheduledDate)} (${v.scheduledDate < todayStr() ? t('vac_overdue') : t('vac_pending')})</div>`;
      });
      h += '</div>';
    }
    const recentVisitors = (D.biosecurity?.visitors || []).filter(v => v.fromFarmHealth === 'outbreak' && v.date >= new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10));
    if (recentVisitors.length) {
      h += `<div class="alert-card alert-danger">${t('bio_cross_risk')}: ${recentVisitors.map(v => sanitizeHTML(v.name)).join(', ')}</div>`;
    }
    container.innerHTML = h;
  }

  _computeFlockHealth(fid, D) {
    const f = D.flocks.find(x => x.id === fid);
    if (!f) return 0;
    const td = D.dailyProduction.filter(p => p.flockId === fid).reduce((s, p) => s + (p.deaths || 0), 0);
    const mPct = f.count > 0 ? (td / f.count) * 100 : 0;
    const mS = Math.max(0, 100 - mPct * 10);
    const l7 = D.dailyProduction.filter(p => p.flockId === fid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    const hens = f.count - td;
    let pS = 50;
    if (l7.length > 0 && hens > 0) { const avg = l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length; pS = Math.min(100, (avg / hens) * 125); }
    const ao = D.outbreaks.filter(o => o.flockId === fid && o.status === 'active').length;
    const oS = ao === 0 ? 100 : ao === 1 ? 40 : 0;
    return Math.round(mS * 0.4 + pS * 0.35 + oS * 0.25);
  }

  _renderTrendChart(D) {
    const c = this.shadowRoot.querySelector('#chart-trend');
    if (!c) return;
    if (typeof Chart === 'undefined') return;
    const labels = [], dE = [], dH = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().substring(0, 10);
      labels.push(ds.substring(5));
      const dp = D.dailyProduction.filter(p => p.date === ds);
      const eggs = dp.reduce((s, p) => s + (p.eggsCollected || 0), 0);
      dE.push(eggs);
      const h = activeHens();
      dH.push(h > 0 ? ((eggs / h) * 100) : 0);
    }
    this._chart = new Chart(c, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: t('prod_eggs'), data: dE, borderColor: themeColor('--primary'), backgroundColor: themeRgba(.1), fill: true, tension: .3, yAxisID: 'y' },
          { label: t('kpi_henday'), data: dH, borderColor: '#FF8F00', backgroundColor: 'transparent', borderDash: [5, 5], tension: .3, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { position: 'left', title: { display: true, text: t('prod_eggs') } },
          y1: { position: 'right', title: { display: true, text: '%' }, grid: { drawOnChartArea: false }, min: 0, max: 100 }
        }
      }
    });
    // Register chart with app shell for cleanup
    const app = document.querySelector('egg-app');
    if (app && app.registerChart) app.registerChart('trend', this._chart);
  }

  async _fetchWeather(D) {
    if (D.farm.lat === null || D.farm.lng === null) return;
    const cached = (D.weatherCache || []).find(w => Date.now() - w.ts < 1800000);
    if (cached) { this._renderWeatherWidget(cached); return; }
    try {
      let w;
      if (D.farm.owmApiKey) {
        const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(D.farm.lat)}&lon=${encodeURIComponent(D.farm.lng)}&appid=${encodeURIComponent(D.farm.owmApiKey)}&units=metric`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json(); if (d.cod && d.cod !== 200) return;
        w = { ts: Date.now(), temp: d.main.temp, humidity: d.main.humidity, wind: d.wind.speed, desc: d.weather[0].description, icon: d.weather[0].icon, feelsLike: d.main.feels_like };
      } else {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(D.farm.lat)}&longitude=${encodeURIComponent(D.farm.lng)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        w = { ts: Date.now(), temp: d.current.temperature_2m, humidity: d.current.relative_humidity_2m, wind: d.current.wind_speed_10m, desc: wmoDesc(d.current.weather_code), icon: wmoIcon(d.current.weather_code), feelsLike: null };
      }
      if (!D.weatherCache) D.weatherCache = [];
      D.weatherCache.push(w);
      if (D.weatherCache.length > 48) D.weatherCache = D.weatherCache.slice(-24);
      Store.save(D);
      this._renderWeatherWidget(w);
      const thi = calcTHI(w.temp, w.humidity);
      if (thi > 28) {
        const today = todayStr();
        if (!D.stressEvents.find(e => e.date === today && e.type === 'heat')) {
          D.stressEvents.push({ id: genId(), date: today, flockId: '', type: 'heat', severity: Math.min(5, Math.round((thi - 28) / 2) + 1), description: `THI=${thi.toFixed(1)}, T=${w.temp}\u00B0C, H=${w.humidity}%` });
          Store.save(D);
        }
      }
    } catch (e) {
      const el = this.shadowRoot.querySelector('#weather-widget');
      if (el) el.innerHTML = `<div style="padding:8px;color:var(--text-light);font-size:13px">${sanitizeHTML(t('error_network'))}</div>`;
    }
  }

  _renderWeatherWidget(w) {
    const el = this.shadowRoot.querySelector('#weather-widget');
    if (!el) return;
    const thi = calcTHI(w.temp, w.humidity);
    const thiClass = thi > 28 ? 'danger' : thi > 25 ? 'warning' : '';
    el.innerHTML = `<div class="weather-widget">
    <div style="display:flex;align-items:center;gap:12px">
    ${w.icon && w.icon.length <= 4 ? `<img src="https://openweathermap.org/img/wn/${escapeAttr(w.icon)}@2x.png" width="48" height="48" alt="">` : `<span style="font-size:48px;line-height:1">${sanitizeHTML(w.icon)}</span>`}
    <div><div style="font-size:24px;font-weight:700">${w.temp.toFixed(1)}\u00B0C</div><div style="color:var(--text-light)">${sanitizeHTML(w.desc)}</div></div></div>
    <div class="kpi-grid" style="margin-top:8px">
    ${kpi(t('weather_humidity'), w.humidity + '%', '', '')}
    ${kpi(t('weather_wind'), w.wind.toFixed(1) + ' m/s', '', '')}
    ${kpi('THI', thi.toFixed(1), thi > 28 ? t('weather_heat_alert') : 'OK', thiClass)}
    </div>
    <div style="font-size:11px;color:var(--text-light);margin-top:4px">${t('weather_last_update')}: ${new Date(w.ts).toLocaleTimeString()}</div>
    </div>`;
  }

  cleanup() {
    if (this._chart) { try { this._chart.destroy(); } catch (e) {} this._chart = null; }
  }
}

customElements.define('egg-dashboard', EggDashboard);
export { EggDashboard };
