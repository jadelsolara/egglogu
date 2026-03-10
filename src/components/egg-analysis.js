// EGGlogU — Analysis Web Component
// Comparison, Seasonality, Profitability, KPI Evolution, Predictions, Economics

import { Bus } from '../core/bus.js';
import { Store } from '../core/store.js';
import { t, getLang, locale } from '../core/i18n.js';
import { sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, genId, emptyState } from '../core/utils.js';
import { computeKpiSnapshot, saveKpiSnapshot, snapshotDelta } from '../core/kpi.js';
import { kpi, currency, flockSelect, healthScore, healthBadge, logAudit } from '../core/helpers.js';
import { activeHens, activeHensByFlock, flockAge, VENG } from '../core/veng.js';
import { BREED_CURVES, tc } from '../core/catalogs.js';
import { DataTable } from '../core/datatable.js';

/* ── Theme helpers (local to component) ── */
const THEMES = {
  blue: { rgb: '26,60,110' }, green: { rgb: '46,125,50' }, purple: { rgb: '106,27,154' },
  black: { rgb: '55,71,79' }, dark: { rgb: '144,202,249' }
};

function themeColor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function themeRgba(a) { const th = THEMES[localStorage.getItem('egglogu_theme') || 'blue'] || THEMES.blue; return 'rgba(' + th.rgb + ',' + a + ')'; }
function calcTHI(temp, h) { return (1.8 * temp + 32) - (0.55 - 0.0055 * h) * (1.8 * temp - 26); }

/* ── Outbreak Risk Classifier ── */
function computeOutbreakRisk(D) {
  const hens = activeHens();
  if (hens === 0) return { probability: 0, classification: 0, factors: [], recommendations: [] };
  const factors = [];

  // 1. Mortality spike (0.25)
  const l7prod = D.dailyProduction.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const l7deaths = l7prod.reduce((s, p) => s + (p.deaths || 0), 0);
  const deathRate = hens > 0 ? (l7deaths / hens * 100) : 0;
  const mortFactor = Math.min(1, deathRate / 10);
  factors.push({ name: tc('Mortalidad') || t('kpi_mortality') || 'Mortality', weight: 0.25, value: mortFactor, detail: fmtNum(deathRate, 2) + '%' });

  // 2. FCR deterioration (0.15)
  const d30 = new Date(); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().substring(0, 10);
  const f30 = D.feed.consumption.filter(c => c.date >= d30s);
  const e30 = D.dailyProduction.filter(p => p.date >= d30s);
  const tfkg = f30.reduce((s, c) => s + (c.quantityKg || 0), 0);
  const tekg = e30.reduce((s, p) => s + (p.eggsCollected || 0), 0) * 0.06;
  const fcr = tekg > 0 ? tfkg / tekg : 0;
  const fcrFactor = fcr > 0 ? Math.min(1, (fcr - 2) / 2) : 0;
  factors.push({ name: 'FCR', weight: 0.15, value: fcrFactor, detail: fmtNum(fcr, 2) });

  // 3. THI stress (0.15)
  const lastW = D.weatherCache.length > 0 ? D.weatherCache[D.weatherCache.length - 1] : null;
  let thiFactor = 0;
  if (lastW) {
    const thi = calcTHI(lastW.temp, lastW.humidity);
    thiFactor = thi > 28 ? Math.min(1, (thi - 25) / 10) : 0;
    factors.push({ name: 'THI', weight: 0.15, value: thiFactor, detail: fmtNum(thi, 1) });
  } else {
    factors.push({ name: 'THI', weight: 0.15, value: 0, detail: '-' });
  }

  // 4. Production drop (0.20)
  let prodFactor = 0;
  if (l7prod.length >= 7 && typeof ss !== 'undefined') {
    const points = l7prod.map((p, i) => [i, p.eggsCollected || 0]);
    const reg = ss.linearRegression(points);
    prodFactor = reg.m < 0 ? Math.min(1, Math.abs(reg.m) / 10) : 0;
  }
  factors.push({ name: t('pred_drop_risk') || 'Production drop', weight: 0.20, value: prodFactor, detail: '' });

  // 5. Active outbreaks (0.10)
  const activeOut = D.outbreaks.filter(o => o.status === 'active').length;
  const outFactor = Math.min(1, activeOut / 3);
  factors.push({ name: t('out_active') || 'Active outbreaks', weight: 0.10, value: outFactor, detail: activeOut.toString() });

  // 6. Vaccination gaps (0.10)
  const today = todayStr();
  const overdueVac = D.vaccines.filter(v => v.status !== 'applied' && v.scheduledDate < today).length;
  const vacFactor = Math.min(1, overdueVac / 5);
  factors.push({ name: t('vac_overdue') || 'Vaccine gaps', weight: 0.10, value: vacFactor, detail: overdueVac.toString() });

  // 7. Stress events (0.05)
  const d7 = new Date(); d7.setDate(d7.getDate() - 7); const d7s = d7.toISOString().substring(0, 10);
  const recentStress = D.stressEvents.filter(e => e.date >= d7s).length;
  const stressFactor = Math.min(1, recentStress / 3);
  factors.push({ name: t('stress_title') || 'Recent stress', weight: 0.05, value: stressFactor, detail: recentStress.toString() });

  // Compute probability via sigmoid
  const z = factors.reduce((s, f) => s + f.weight * f.value * 6, 0) - 2;
  const probability = 1 / (1 + Math.exp(-z));
  const classification = probability >= 0.5 ? 1 : 0;

  // Recommendations
  const recommendations = [];
  if (mortFactor > 0.5) recommendations.push(t('rec_lab_samples'));
  if (thiFactor > 0.5) recommendations.push(t('rec_ventilation'));
  if (fcrFactor > 0.5) recommendations.push(t('rec_check_diet'));
  if (prodFactor > 0.5) recommendations.push(t('rec_check_env'));
  if (overdueVac > 0) recommendations.push((t('alert_vaccine_overdue') || 'Overdue vaccines') + ': ' + overdueVac);

  return { probability, classification, factors, recommendations };
}

/* ── Multi-step Forecast (ensemble) ── */
function computeForecast(D, days = 7) {
  if (typeof ss === 'undefined') return { dates: [], actual: [], forecast: [], upper: [], lower: [] };
  const prod = D.dailyProduction.sort((a, b) => a.date.localeCompare(b.date));
  if (prod.length < 7) return { dates: [], actual: [], forecast: [], upper: [], lower: [] };
  const last14 = prod.slice(-14);
  const values = last14.map(p => p.eggsCollected || 0);

  // Weighted Moving Average
  const weights = values.map((_, i) => Math.exp(i * 0.2));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const wma = values.reduce((s, v, i) => s + v * weights[i], 0) / wSum;
  const wmaForecast = [];
  for (let i = 0; i < days; i++) wmaForecast.push(wma);

  // Linear regression
  const points = values.map((v, i) => [i, v]);
  const reg = ss.linearRegression(points);
  const regLine = ss.linearRegressionLine(reg);
  const lrForecast = [];
  for (let i = 0; i < days; i++) lrForecast.push(Math.max(0, regLine(values.length + i)));

  // Ensemble (average)
  const ensemble = wmaForecast.map((w, i) => (w + lrForecast[i]) / 2);

  // Residuals for confidence bands
  const residuals = values.map((v, i) => v - regLine(i));
  const stdDev = typeof ss.standardDeviation === 'function'
    ? ss.standardDeviation(residuals)
    : Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const upper = ensemble.map(v => v + stdDev);
  const lower = ensemble.map(v => Math.max(0, v - stdDev));

  // Generate date labels
  const dates = [];
  const lastDate = new Date(last14[last14.length - 1].date + 'T12:00:00');
  for (let i = 1; i <= days; i++) { const d = new Date(lastDate); d.setDate(d.getDate() + i); dates.push(d.toISOString().substring(0, 10)); }
  const actualDates = last14.map(p => p.date);

  return { dates, actual: values, actualDates, forecast: ensemble, upper, lower, wma: wmaForecast, lr: lrForecast };
}

/* ══════════════════════════════════════════ */
/*           EggAnalysis Component           */
/* ══════════════════════════════════════════ */

class EggAnalysis extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._charts = {};
    this._currentTab = 'comparison';
    this._forecastDays = 7;
    this._unsubs = [];
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(Bus.on('analysis:refresh', () => this.render()));
    this._unsubs.push(Bus.on('data:changed', () => this.render()));
  }

  disconnectedCallback() {
    this._destroyCharts();
    this._unsubs.forEach(fn => { if (typeof fn === 'function') fn(); });
    this._unsubs = [];
  }

  _destroyCharts() {
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch (e) { /* noop */ } });
    this._charts = {};
  }

  /* ── Scoped styles ── */
  _baseStyle() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
      .tabs { display: flex; gap: 0; margin-bottom: 16px; overflow-x: auto; border-bottom: 2px solid var(--border, #e0e0e0); }
      .tab { padding: 10px 16px; cursor: pointer; font-size: 14px; white-space: nowrap; border-bottom: 2px solid transparent; margin-bottom: -2px; color: var(--text-secondary, #666); transition: all .2s; }
      .tab:hover { color: var(--primary, #1A3C6E); background: var(--bg-secondary, #f5f5f5); }
      .tab.active { color: var(--primary, #1A3C6E); border-bottom-color: var(--primary, #1A3C6E); font-weight: 600; }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; }
      .btn-sm { padding: 4px 12px; font-size: 13px; }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn:hover { opacity: 0.85; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
      .kpi-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .kpi-card.danger { border-left: 4px solid var(--danger, #dc3545); }
      .kpi-card.warning { border-left: 4px solid var(--warning, #ffc107); }
      .kpi-label { font-size: 12px; color: var(--text-light, #888); text-transform: uppercase; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #333); }
      .kpi-sub { font-size: 12px; color: var(--text-light, #888); margin-top: 4px; }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .card h4 { margin: 8px 0; color: var(--text, #333); }
      .chart-container { position: relative; height: 300px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-warning { background: #fff9c4; color: #f57f17; }
      .badge-danger { background: #ffcdd2; color: #b71c1c; }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .empty-state { text-align: center; padding: 48px 16px; color: var(--text-light, #888); }
      .empty-state .empty-icon { font-size: 48px; display: block; margin-bottom: 12px; }
      /* Traffic light */
      .traffic-light { display: flex; flex-direction: column; gap: 6px; }
      .traffic-dot { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-tertiary, #e0e0e0); opacity: 0.3; }
      .traffic-dot.active { opacity: 1; }
      .traffic-dot.red { background: #F44336; }
      .traffic-dot.red.active { box-shadow: 0 0 8px #F44336; }
      .traffic-dot.yellow { background: #FFC107; }
      .traffic-dot.yellow.active { box-shadow: 0 0 8px #FFC107; }
      .traffic-dot.green { background: #4CAF50; }
      .traffic-dot.green.active { box-shadow: 0 0 8px #4CAF50; }
      /* Severity bar */
      .severity-bar { width: 100%; height: 10px; background: var(--bg-tertiary, #e0e0e0); border-radius: 5px; overflow: hidden; }
      .severity-bar > div { height: 100%; border-radius: 5px; transition: width .3s; }
      /* Anomaly icon */
      .anomaly-icon { color: var(--warning, #ffc107); font-weight: 700; }
      /* Stat row */
      .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border, #eee); flex-wrap: wrap; gap: 4px; }
      .stat-label { font-weight: 600; color: var(--text, #333); }
      .stat-value { font-size: 13px; color: var(--text-secondary, #666); }
      .health-score { font-weight: 700; padding: 2px 8px; border-radius: 4px; }
      .health-score.good { background: #e8f5e9; color: #2e7d32; }
      .health-score.warn { background: #fff9c4; color: #f57f17; }
      .health-score.bad { background: #ffebee; color: #c62828; }
      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .tabs { gap: 0; }
        .tab { padding: 8px 10px; font-size: 12px; }
      }
    </style>`;
  }

  /* ── Main render ── */
  render() {
    this._destroyCharts();
    const D = Store.get();
    let h = this._baseStyle();
    h += `<div class="page-header"><h2>${t('ana_title')}</h2></div>`;

    // Tabs
    const tabs = [
      { key: 'comparison',   icon: '\uD83D\uDD04', label: t('ana_comparison') },
      { key: 'seasonality',  icon: '\uD83D\uDCC5', label: t('ana_seasonality') },
      { key: 'profitability', icon: '\uD83D\uDCB0', label: t('ana_profitability') },
      { key: 'kpi_evo',      icon: '\uD83D\uDCCA', label: t('ana_kpi_evolution') },
      { key: 'predictions',  icon: '\uD83E\uDD16', label: t('pred_title') },
      { key: 'economics',    icon: '\uD83C\uDFE6', label: t('ana_economics') }
    ];
    h += '<div class="tabs">';
    tabs.forEach(tb => {
      h += `<div class="tab${this._currentTab === tb.key ? ' active' : ''}" data-tab="${tb.key}">${tb.icon} ${tb.label}</div>`;
    });
    h += '</div>';

    // Tab content
    switch (this._currentTab) {
      case 'comparison':    h += this._renderComparison(D); break;
      case 'seasonality':   h += this._renderSeasonality(D); break;
      case 'profitability': h += this._renderProfitability(D); break;
      case 'kpi_evo':       h += this._renderKpiEvo(D); break;
      case 'predictions':   h += this._renderPredictions(D); break;
      case 'economics':     h += this._renderEconomics(D); break;
      default:              h += this._renderComparison(D); break;
    }

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
    this._renderCharts(D);
  }

  /* ── Event delegation ── */
  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      // Tab switching
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this._currentTab = tab.dataset.tab;
        this.render();
        return;
      }

      // Forecast day buttons
      const fcBtn = e.target.closest('[data-forecast-days]');
      if (fcBtn) {
        this._forecastDays = parseInt(fcBtn.dataset.forecastDays) || 7;
        this.render();
        return;
      }
    });
  }

  /* ── Post-render chart initialization ── */
  _renderCharts(D) {
    if (typeof Chart === 'undefined') return;

    if (this._currentTab === 'seasonality') this._renderSeasonChart(D);
    else if (this._currentTab === 'kpi_evo') this._renderKpiEvoChart(D);
    else if (this._currentTab === 'predictions') this._renderForecastChart(D);
  }

  /* ──────────────────────────────────── */
  /*        TAB: Comparison              */
  /* ──────────────────────────────────── */
  _renderComparison(D) {
    if (!D.flocks.length) return emptyState('\uD83D\uDD04', t('no_data'));

    const stats = D.flocks.map(f => {
      const cur = activeHensByFlock(f.id);
      const l7 = D.dailyProduction.filter(p => p.flockId === f.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
      const avgE = l7.length > 0 ? l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length : 0;
      const hd = cur > 0 ? (avgE / cur * 100) : 0;
      const d30 = new Date(); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().substring(0, 10);
      const f30 = D.feed.consumption.filter(c => c.flockId === f.id && c.date >= d30s);
      const e30 = D.dailyProduction.filter(p => p.flockId === f.id && p.date >= d30s);
      const tfkg = f30.reduce((s, c) => s + (c.quantityKg || 0), 0);
      const tekg = e30.reduce((s, p) => s + (p.eggsCollected || 0), 0) * 0.06;
      const fcrVal = tekg > 0 ? tfkg / tekg : 0;
      const deaths = D.dailyProduction.filter(p => p.flockId === f.id).reduce((s, p) => s + (p.deaths || 0), 0);
      const mort = f.count > 0 ? (deaths / f.count * 100) : 0;
      const hs = healthScore(f.id);
      return { id: f.id, name: f.name, count: f.count, cur, hd, fcr: fcrVal, mort, hs };
    });
    stats.sort((a, b) => b.hd - a.hd);

    let kpiHtml = '';
    if (stats.length >= 2) {
      kpiHtml = `<div class="kpi-grid">${kpi(t('ana_best_flock'), sanitizeHTML(stats[0].name), 'Hen-Day: ' + fmtNum(stats[0].hd, 1) + '%')}`;
      kpiHtml += kpi(t('ana_worst_flock'), sanitizeHTML(stats[stats.length - 1].name), 'Hen-Day: ' + fmtNum(stats[stats.length - 1].hd, 1) + '%', 'danger') + '</div>';
    }

    // Build table manually (DataTable.create returns HTML for light-DOM; we inline here for Shadow DOM)
    let h = kpiHtml;
    h += `<div class="card"><h3>${t('ana_comparison')}</h3><div class="table-wrap"><table>`;
    h += `<thead><tr>
      <th>${t('flock_name')}</th>
      <th>${t('flock_count')}</th>
      <th>${t('flock_current')}</th>
      <th>${t('kpi_henday')} (7d)</th>
      <th>FCR (30d)</th>
      <th>${t('kpi_mortality')} %</th>
      <th>${t('flock_health')}</th>
    </tr></thead><tbody>`;
    stats.forEach(r => {
      const hdColor = r.hd >= 80 ? 'var(--success, #2e7d32)' : r.hd >= 60 ? 'var(--warning, #ffc107)' : 'var(--danger, #dc3545)';
      h += `<tr>
        <td><strong>${sanitizeHTML(r.name)}</strong></td>
        <td>${fmtNum(r.count)}</td>
        <td>${fmtNum(r.cur)}</td>
        <td><span style="color:${hdColor}">${fmtNum(r.hd, 1)}%</span></td>
        <td>${r.fcr > 0 ? fmtNum(r.fcr, 2) : '-'}</td>
        <td>${fmtNum(r.mort, 1)}%</td>
        <td>${healthBadge(r.hs)}</td>
      </tr>`;
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  /* ──────────────────────────────────── */
  /*        TAB: Seasonality             */
  /* ──────────────────────────────────── */
  _renderSeasonality(D) {
    const months = {};
    D.dailyProduction.forEach(p => {
      const m = p.date?.substring(5, 7);
      if (!m) return;
      if (!months[m]) months[m] = { eggs: 0, days: new Set() };
      months[m].eggs += (p.eggsCollected || 0);
      months[m].days.add(p.date);
    });

    if (!Object.keys(months).length) return emptyState('\uD83D\uDCC5', t('no_data'));

    const mNames = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(locale(), { month: 'short' }));

    let h = `<div class="card"><h3>${t('ana_seasonality')}</h3><div class="chart-container"><canvas id="chart-season"></canvas></div></div>`;
    h += `<div class="card"><div class="table-wrap"><table><thead><tr><th>${t('fin_month')}</th><th>${t('prod_eggs')}</th><th>${t('avg_per_day')}</th></tr></thead><tbody>`;

    for (let i = 1; i <= 12; i++) {
      const k = String(i).padStart(2, '0');
      const d = months[k];
      const avg = d ? Math.round(d.eggs / d.days.size) : 0;
      h += `<tr><td>${mNames[i - 1]}</td><td>${d ? fmtNum(d.eggs) : '-'}</td><td>${d ? fmtNum(avg) : '-'}</td></tr>`;
    }
    h += '</tbody></table></div></div>';

    // Store months data for chart rendering
    this._seasonData = { months, mNames };
    return h;
  }

  _renderSeasonChart(D) {
    const c = this.shadowRoot.querySelector('#chart-season');
    if (!c || !this._seasonData) return;
    const { months, mNames } = this._seasonData;
    const vals = [];
    for (let i = 1; i <= 12; i++) {
      const k = String(i).padStart(2, '0');
      const d = months[k];
      vals.push(d ? Math.round(d.eggs / d.days.size) : 0);
    }
    this._charts.season = new Chart(c, {
      type: 'bar',
      data: { labels: mNames, datasets: [{ label: t('avg_per_day'), data: vals, backgroundColor: themeColor('--primary-light') || themeRgba(0.5) }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  /* ──────────────────────────────────── */
  /*        TAB: Profitability           */
  /* ──────────────────────────────────── */
  _renderProfitability(D) {
    if (!D.flocks.length) return emptyState('\uD83D\uDCB0', t('no_data'));

    let h = `<div class="card"><h3>${t('ana_profitability')} / ${t('per_flock')}</h3><div class="table-wrap"><table><thead><tr>`;
    h += `<th>${t('flock_name')}</th><th>${t('prod_eggs')}</th><th>${t('fin_income')}</th><th>${t('fin_expenses')}</th><th>${t('fin_net')}</th><th>${t('fin_cost_per_egg')}</th></tr></thead><tbody>`;

    const _totalFeedCost = D.feed.purchases.reduce((s, p) => s + (p.cost || 0), 0);
    const _totalFeedKg = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0);
    const _feedPricePerKg = _totalFeedKg > 0 ? _totalFeedCost / _totalFeedKg : 0;
    const _totalIncAmt = D.finances.income.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    const _totalIncQty = D.finances.income.reduce((s, i) => s + (i.quantity || 0), 0);
    const _weightedAvgPrice = _totalIncQty > 0 ? _totalIncAmt / _totalIncQty : 0;

    D.flocks.forEach(f => {
      const eggs = D.dailyProduction.filter(p => p.flockId === f.id).reduce((s, p) => s + (p.eggsCollected || 0), 0);
      const feedCost = D.feed.consumption.filter(c => c.flockId === f.id).reduce((s, c) => s + (c.quantityKg || 0) * _feedPricePerKg, 0);
      const inc = eggs * _weightedAvgPrice;
      const net = inc - feedCost - (f.cost || 0);
      const cpe = eggs > 0 ? (feedCost + (f.cost || 0)) / eggs : 0;
      h += `<tr><td><strong>${sanitizeHTML(f.name)}</strong></td><td>${fmtNum(eggs)}</td>
        <td style="color:var(--success, #2e7d32)">${fmtMoney(inc)}</td>
        <td style="color:var(--danger, #dc3545)">${fmtMoney(feedCost + (f.cost || 0))}</td>
        <td style="font-weight:700;color:${net < 0 ? 'var(--danger, #dc3545)' : 'var(--success, #2e7d32)'}">${fmtMoney(net)}</td>
        <td>${fmtMoney(cpe)}</td></tr>`;
    });
    h += '</tbody></table></div></div>';

    // Per-Channel Weighted Average Pricing
    const chPricing = {};
    const typePricing = {};
    D.finances.income.filter(i => i.type === 'eggs' && i.quantity > 0).forEach(i => {
      const ch = i.marketChannel || 'other';
      const et = i.eggType || 'M';
      const amt = (i.quantity || 0) * (i.unitPrice || 0);
      if (!chPricing[ch]) chPricing[ch] = { qty: 0, revenue: 0 };
      chPricing[ch].qty += (i.quantity || 0);
      chPricing[ch].revenue += amt;
      if (!typePricing[et]) typePricing[et] = { qty: 0, revenue: 0 };
      typePricing[et].qty += (i.quantity || 0);
      typePricing[et].revenue += amt;
    });

    const totalChQty = Object.values(chPricing).reduce((s, v) => s + v.qty, 0);

    if (Object.keys(chPricing).length || Object.keys(typePricing).length) {
      h += `<div class="card"><h3>${t('ana_channel_pricing') || 'Per-Channel Pricing'}</h3>`;

      if (Object.keys(chPricing).length) {
        h += `<h4 style="margin:8px 0">${t('fin_channel') || 'Channel'}</h4><div class="table-wrap"><table><thead><tr>
          <th>${t('fin_channel') || 'Channel'}</th><th>${t('fin_qty')}</th><th>${t('fin_income')}</th><th>${t('fin_avg_price') || 'Avg Price'}</th><th>%</th></tr></thead><tbody>`;
        Object.entries(chPricing).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([k, v]) => {
          const avg = v.qty > 0 ? v.revenue / v.qty : 0;
          const pct = totalChQty > 0 ? ((v.qty / totalChQty) * 100) : 0;
          h += `<tr><td>${t('ch_' + k) || k}</td><td>${fmtNum(v.qty)}</td>
            <td style="color:var(--success, #2e7d32)">${fmtMoney(v.revenue)}</td>
            <td><strong>${fmtMoney(avg)}</strong></td><td>${fmtNum(pct, 1)}%</td></tr>`;
        });
        h += '</tbody></table></div>';
      }

      if (Object.keys(typePricing).length) {
        h += `<h4 style="margin:12px 0 8px">${t('fin_egg_type') || 'Egg Type'}</h4><div class="table-wrap"><table><thead><tr>
          <th>${t('fin_egg_type') || 'Type'}</th><th>${t('fin_qty')}</th><th>${t('fin_income')}</th><th>${t('fin_avg_price') || 'Avg Price'}</th></tr></thead><tbody>`;
        ['S', 'M', 'L', 'XL', 'Jumbo'].forEach(tp => {
          const v = typePricing[tp]; if (!v) return;
          const avg = v.qty > 0 ? v.revenue / v.qty : 0;
          h += `<tr><td>${tp}</td><td>${fmtNum(v.qty)}</td>
            <td style="color:var(--success, #2e7d32)">${fmtMoney(v.revenue)}</td>
            <td><strong>${fmtMoney(avg)}</strong></td></tr>`;
        });
        h += '</tbody></table></div>';
      }
      h += '</div>';
    }

    return h;
  }

  /* ──────────────────────────────────── */
  /*        TAB: KPI Evolution           */
  /* ──────────────────────────────────── */
  _renderKpiEvo(D) {
    if (!D.kpiSnapshots.length) return emptyState('\uD83D\uDCCA', t('ana_no_snapshots'));

    let h = `<div class="card"><h3>${t('ana_kpi_evolution')}</h3><div class="chart-container"><canvas id="chart-kpi-evo"></canvas></div></div>`;
    h += '<div class="card"><div class="table-wrap"><table><thead><tr>';
    h += `<th>${t('date')}</th><th>${t('kpi_active_hens')}</th><th>Hen-Day %</th><th>FCR</th><th>${t('kpi_mortality')} %</th><th>${t('kpi_cost_egg')}</th><th>${t('kpi_income_net')}</th></tr></thead><tbody>`;

    D.kpiSnapshots.slice(-20).reverse().forEach(s => {
      h += `<tr><td>${fmtDate(s.date)}</td><td>${fmtNum(s.activeHens)}</td><td>${fmtNum(s.henDay, 1)}%</td>
        <td>${fmtNum(s.fcr, 2)}</td><td>${fmtNum(s.mortality, 1)}%</td><td>${fmtMoney(s.costPerEgg)}</td><td>${fmtMoney(s.netIncome)}</td></tr>`;
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  _renderKpiEvoChart(D) {
    const c = this.shadowRoot.querySelector('#chart-kpi-evo');
    if (!c) return;
    const snaps = D.kpiSnapshots.slice(-30);
    this._charts.kpiEvo = new Chart(c, {
      type: 'line',
      data: {
        labels: snaps.map(s => s.date.substring(5)),
        datasets: [
          { label: 'Hen-Day %', data: snaps.map(s => s.henDay), borderColor: themeColor('--primary'), tension: .3, yAxisID: 'y' },
          { label: 'FCR', data: snaps.map(s => s.fcr), borderColor: '#FF8F00', tension: .3, yAxisID: 'y1' },
          { label: t('kpi_mortality') + ' %', data: snaps.map(s => s.mortality), borderColor: '#C62828', tension: .3, yAxisID: 'y' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { position: 'left', min: 0 }, y1: { position: 'right', grid: { drawOnChartArea: false } } }
      }
    });
  }

  /* ──────────────────────────────────── */
  /*        TAB: Predictions             */
  /* ──────────────────────────────────── */
  _renderPredictions(D) {
    if (!D.dailyProduction.length) return emptyState('\uD83E\uDD16', t('no_data'));
    let h = '';

    const sorted = [...D.dailyProduction].sort((a, b) => a.date.localeCompare(b.date));
    const last30 = sorted.slice(-30);

    // === Outbreak Risk Classifier (traffic light) ===
    const outbreak = computeOutbreakRisk(D);
    const obColor = outbreak.classification === 1 ? 'red' : outbreak.probability > 0.4 ? 'yellow' : 'green';
    const obLabel = obColor === 'red' ? t('pred_outbreak_high') : obColor === 'yellow' ? t('pred_outbreak_medium') : t('pred_outbreak_low');

    h += `<div class="card"><h3>\uD83D\uDD34 ${t('pred_outbreak_risk')}</h3>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
        <div class="traffic-light">
          <div class="traffic-dot red${obColor === 'red' ? ' active' : ''}"></div>
          <div class="traffic-dot yellow${obColor === 'yellow' ? ' active' : ''}"></div>
          <div class="traffic-dot green${obColor === 'green' ? ' active' : ''}"></div>
        </div>
        <div>
          <strong style="font-size:1.4em">${(outbreak.probability * 100).toFixed(0)}%</strong><br>
          <span class="badge badge-${obColor === 'red' ? 'danger' : obColor === 'yellow' ? 'warning' : 'success'}">${obLabel}</span>
        </div>
      </div>`;

    if (outbreak.factors.length) {
      h += `<div class="table-wrap"><table><thead><tr>
        <th>${t('pred_outbreak_factor')}</th><th>${t('pred_outbreak_weight')}</th><th>${t('pred_outbreak_value')}</th></tr></thead><tbody>`;
      outbreak.factors.forEach(f => {
        h += `<tr><td>${sanitizeHTML(f.name)}</td><td>${(f.weight * 100).toFixed(0)}%</td>
          <td><div class="severity-bar"><div style="width:${Math.min(100, f.value * 100)}%;background:${f.value > 0.6 ? 'var(--danger, #dc3545)' : f.value > 0.3 ? 'var(--warning, #ffc107)' : 'var(--success, #2e7d32)'}"></div></div></td></tr>`;
      });
      h += '</tbody></table></div>';
    }

    if (outbreak.recommendations.length) {
      h += `<div style="margin-top:12px"><strong>${t('rec_title')}:</strong><ul style="margin:4px 0 0 16px">`;
      outbreak.recommendations.forEach(r => { h += `<li>${sanitizeHTML(r)}</li>`; });
      h += '</ul></div>';
    }
    h += '</div>';

    // === Multi-step Forecast (ensemble) ===
    if (last30.length >= 7 && typeof ss !== 'undefined') {
      h += `<div class="card"><h3>\uD83D\uDCC8 ${t('pred_forecast')}</h3>
        <div style="margin-bottom:8px">
          <button class="btn btn-sm${this._forecastDays === 7 ? ' btn-primary' : ' btn-secondary'}" data-forecast-days="7">7d</button>
          <button class="btn btn-sm${this._forecastDays === 14 ? ' btn-primary' : ' btn-secondary'}" data-forecast-days="14">14d</button>
        </div>
        <div class="chart-container"><canvas id="chart-forecast"></canvas></div></div>`;
      // Store data for chart rendering
      this._forecastLast30 = last30;
    }

    // === Anomaly Detection ===
    if (last30.length >= 7 && typeof ss !== 'undefined') {
      const vals = last30.map(p => p.eggsCollected || 0);
      const mean = ss.mean(vals);
      const std = ss.standardDeviation(vals);
      const anomalies = last30.filter(p => { const z = std > 0 ? Math.abs((p.eggsCollected - mean) / std) : 0; return z > 2; });

      if (anomalies.length) {
        h += `<div class="card"><h3>${t('pred_anomaly')} (|Z|>2)</h3><div class="table-wrap"><table><thead><tr>
          <th>${t('date')}</th><th>${t('prod_eggs')}</th><th>Z-score</th></tr></thead><tbody>`;
        anomalies.forEach(p => {
          const z = std > 0 ? ((p.eggsCollected - mean) / std) : 0;
          h += `<tr><td>${fmtDate(p.date)}</td><td>${p.eggsCollected} <span class="anomaly-icon">\u26A0</span></td>
            <td style="color:var(--danger, #dc3545)">${z.toFixed(2)}</td></tr>`;
        });
        h += '</tbody></table></div></div>';
      }
    }

    // === Breed Benchmark ===
    const activeFlocks = D.flocks.filter(f => f.status !== 'descarte' && f.birthDate);
    if (activeFlocks.length) {
      h += `<div class="card"><h3>${t('pred_breed_curve')}</h3>`;
      activeFlocks.forEach(f => {
        const bkey = f.breed && BREED_CURVES[f.breed] ? f.breed : (f.targetCurve && BREED_CURVES[f.targetCurve] ? f.targetCurve : 'generic');
        const curve = BREED_CURVES[bkey];
        const age = flockAge(f);
        const weekIdx = Math.max(0, age.weeks - 18);
        const expected = weekIdx < curve.length ? curve[weekIdx] : curve[curve.length - 1];
        const hens = activeHensByFlock(f.id);
        const l7 = D.dailyProduction.filter(p => p.flockId === f.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
        const avgE = l7.length > 0 ? l7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / l7.length : 0;
        const actual = hens > 0 ? (avgE / hens * 100) : 0;
        const gap = actual - expected;
        const gapColor = gap >= 0 ? 'var(--success, #2e7d32)' : 'var(--danger, #dc3545)';
        h += `<div class="stat-row"><span class="stat-label">${sanitizeHTML(f.name)} (${sanitizeHTML(bkey)})</span>
          <span class="stat-value">${t('actual')}: ${fmtNum(actual, 1)}% | ${t('expected')}: ${expected}% |
          <span style="color:${gapColor}">Gap: ${gap > 0 ? '+' : ''}${fmtNum(gap, 1)}%</span></span></div>`;
      });
      h += '</div>';
    }

    return h;
  }

  _renderForecastChart(D) {
    const c = this.shadowRoot.querySelector('#chart-forecast');
    if (!c || !this._forecastLast30) return;
    const last30 = this._forecastLast30;
    const days = this._forecastDays;
    const fc = computeForecast(D, days);

    const allLabels = last30.map(p => p.date.substring(5));
    for (let i = 1; i <= days; i++) { const d = new Date(); d.setDate(d.getDate() + i); allLabels.push(d.toISOString().substring(5, 10)); }

    const actual = last30.map(p => p.eggsCollected || 0);
    const predLine = [...Array(last30.length).fill(null), ...fc.forecast];
    const upperBand = [...Array(last30.length).fill(null), ...fc.upper];
    const lowerBand = [...Array(last30.length).fill(null), ...fc.lower];

    this._charts.forecast = new Chart(c, {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          { label: t('prod_eggs'), data: [...actual, ...Array(days).fill(null)], borderColor: themeColor('--primary'), backgroundColor: themeRgba(.1), fill: true, tension: .3 },
          { label: t('pred_forecast'), data: predLine, borderColor: '#FF8F00', borderDash: [5, 5], tension: .3, pointRadius: 4 },
          { label: t('pred_forecast_upper'), data: upperBand, borderColor: 'rgba(255,143,0,.2)', backgroundColor: 'rgba(255,143,0,.08)', fill: '+1', borderDash: [2, 2], pointRadius: 0, tension: .3 },
          { label: t('pred_forecast_lower'), data: lowerBand, borderColor: 'rgba(255,143,0,.2)', pointRadius: 0, tension: .3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { filter: item => !item.text.includes('upper') && !item.text.includes('lower') } } }
      }
    });
  }

  /* ──────────────────────────────────── */
  /*        TAB: Economics               */
  /* ──────────────────────────────────── */
  _renderEconomics(D) {
    const flocks = D.flocks.filter(f => f.status !== 'descarte');
    if (!flocks.length) return emptyState('\uD83C\uDFE6', t('econ_no_data_guide'));

    // Weighted avg feed price
    let totalFeedCost = 0, totalFeedKg = 0;
    (D.feed.purchases || []).forEach(p => { totalFeedCost += (p.totalCost || 0); totalFeedKg += (p.kg || 0); });
    const avgFeedPrice = totalFeedKg > 0 ? totalFeedCost / totalFeedKg : null;

    // Total revenue
    const totalRevenue = D.finances.income.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
    const today = new Date();

    let orgTotalEggs = 0, orgTotalCosts = 0, orgTotalInvestment = 0, orgHasEggs = false, orgHasCosts = false;

    const flockData = flocks.map(f => {
      const daysActive = Math.max(Math.round((today - new Date(f.startDate)) / 86400000), 1);

      // Acquisition
      let acquisition = null;
      if (f.purchaseCostPerBird != null) { acquisition = f.purchaseCostPerBird * f.initialCount; orgTotalInvestment += acquisition; }

      // Feed
      const feedKg = (D.feed.consumption || []).filter(c => c.flockId === f.id).reduce((s, c) => s + (c.quantityKg || 0), 0);
      const feedCost = (feedKg > 0 && avgFeedPrice != null) ? Math.round(feedKg * avgFeedPrice * 100) / 100 : null;

      // Health
      let vaxCost = null, medCost = null;
      (D.health.vaccines || []).filter(v => v.flockId === f.id && v.cost != null).forEach(v => { vaxCost = (vaxCost || 0) + v.cost; });
      (D.health.medications || []).filter(m => m.flockId === f.id && m.cost != null).forEach(m => { medCost = (medCost || 0) + m.cost; });
      const healthCostVal = (vaxCost != null || medCost != null) ? Math.round(((vaxCost || 0) + (medCost || 0)) * 100) / 100 : null;

      // Direct expenses
      const directExp = D.finances.expenses.filter(e => e.flockId === f.id);
      const directExpTotal = directExp.length ? Math.round(directExp.reduce((s, e) => s + (e.amount || 0), 0) * 100) / 100 : null;

      // Eggs
      const prods = D.production.filter(p => p.flockId === f.id);
      const totalEggs = prods.reduce((s, p) => s + (p.totalEggs || 0), 0);
      if (totalEggs > 0) { orgTotalEggs += totalEggs; orgHasEggs = true; }

      // Total cost
      const costParts = [feedCost, healthCostVal, directExpTotal].filter(v => v != null);
      const totalCostOp = costParts.length ? Math.round(costParts.reduce((s, v) => s + v, 0) * 100) / 100 : null;
      let totalCostFull = totalCostOp;
      if (acquisition != null) totalCostFull = Math.round(((totalCostOp || 0) + acquisition) * 100) / 100;
      if (totalCostOp != null || acquisition != null) { orgTotalCosts += (totalCostFull || 0); orgHasCosts = true; }

      // Derived
      const costPerEgg = (totalCostOp != null && totalEggs > 0) ? Math.round(totalCostOp / totalEggs * 10000) / 10000 : null;
      const dailyCostBird = (totalCostFull != null && f.currentCount > 0 && daysActive > 0) ? Math.round(totalCostFull / f.currentCount / daysActive * 10000) / 10000 : null;

      return {
        f, daysActive, acquisition, feedCost, healthCost: healthCostVal, directExpTotal, totalEggs: totalEggs || null,
        totalCostFull, costPerEgg, dailyCostBird,
        hasPurchase: f.purchaseCostPerBird != null, hasFeed: feedCost != null, hasHealth: healthCostVal != null,
        hasDirect: directExpTotal != null, hasEggs: totalEggs > 0
      };
    });

    // ROI second pass
    flockData.forEach(fd => {
      fd.roiPerBird = null;
      if (fd.hasPurchase && fd.acquisition > 0 && fd.hasEggs && fd.totalEggs > 0 && orgTotalEggs > 0 && totalRevenue > 0 && fd.totalCostFull != null) {
        const flockRev = totalRevenue * (fd.totalEggs / orgTotalEggs);
        fd.roiPerBird = Math.round((flockRev - fd.totalCostFull) / fd.acquisition * 100) / 100;
      }
    });

    // Check if any flock has data
    const anyData = flockData.some(fd => fd.hasFeed || fd.hasHealth || fd.hasDirect || fd.hasPurchase || fd.hasEggs);
    if (!anyData) return emptyState('\uD83C\uDFE6', t('econ_no_data_guide'));

    // Determine visible columns
    const anyPurchase = flockData.some(fd => fd.hasPurchase);
    const anyFeed = flockData.some(fd => fd.hasFeed);
    const anyHealth = flockData.some(fd => fd.hasHealth);
    const anyDirect = flockData.some(fd => fd.hasDirect);
    const anyROI = flockData.some(fd => fd.roiPerBird != null);

    let h = '';

    // Org summary KPI cards
    const weightedCPE = (orgHasEggs && orgHasCosts && orgTotalEggs > 0) ? Math.round(orgTotalCosts / orgTotalEggs * 10000) / 10000 : null;
    const netResult = (totalRevenue > 0 && orgHasCosts) ? Math.round((totalRevenue - orgTotalCosts) * 100) / 100 : null;

    h += `<div class="card"><h3>${t('econ_org_summary')}</h3><div class="kpi-grid">`;
    if (orgHasEggs) h += `<div class="kpi-card"><span class="kpi-value">${fmtNum(orgTotalEggs)}</span><span class="kpi-label">\uD83E\uDD5A ${t('prod_eggs')}</span></div>`;
    if (weightedCPE != null) h += `<div class="kpi-card"><span class="kpi-value">${fmtMoney(weightedCPE)}</span><span class="kpi-label">\uD83D\uDCCA ${t('econ_cost_per_egg')}</span></div>`;
    if (orgTotalInvestment > 0) h += `<div class="kpi-card"><span class="kpi-value">${fmtMoney(orgTotalInvestment)}</span><span class="kpi-label">\uD83D\uDC14 ${t('econ_total_investment')}</span></div>`;
    if (orgHasCosts) h += `<div class="kpi-card"><span class="kpi-value">${fmtMoney(orgTotalCosts)}</span><span class="kpi-label">\uD83D\uDCC9 ${t('econ_total_costs')}</span></div>`;
    if (totalRevenue > 0) h += `<div class="kpi-card"><span class="kpi-value" style="color:var(--success, #2e7d32)">${fmtMoney(totalRevenue)}</span><span class="kpi-label">\uD83D\uDCB5 ${t('fin_income')}</span></div>`;
    if (netResult != null) h += `<div class="kpi-card"><span class="kpi-value" style="color:${netResult >= 0 ? 'var(--success, #2e7d32)' : 'var(--danger, #dc3545)'}">${fmtMoney(netResult)}</span><span class="kpi-label">\uD83D\uDCC8 ${t('econ_net_result')}</span></div>`;
    h += '</div></div>';

    // Per-flock table
    h += `<div class="card"><h3>${t('econ_cost_breakdown')}</h3><div class="table-wrap"><table><thead><tr>`;
    h += `<th>${t('flock_name')}</th><th>\uD83D\uDC14</th><th>\uD83E\uDD5A</th><th>${t('econ_days_active')}</th>`;
    if (anyFeed) h += `<th>${t('econ_feed_cost')}</th>`;
    if (anyHealth) h += `<th>${t('econ_health_cost')}</th>`;
    if (anyDirect) h += `<th>${t('econ_direct_expenses')}</th>`;
    if (anyPurchase) h += `<th>${t('econ_acquisition')}</th>`;
    h += `<th>${t('econ_cost_per_egg')}</th>`;
    if (anyROI) h += `<th>${t('econ_roi_per_bird')}</th>`;
    h += '</tr></thead><tbody>';

    flockData.forEach(fd => {
      h += `<tr><td><strong>${sanitizeHTML(fd.f.name)}</strong></td><td>${fmtNum(fd.f.currentCount)}</td>`;
      h += `<td>${fd.totalEggs != null ? fmtNum(fd.totalEggs) : '\u2014'}</td><td>${fd.daysActive}d</td>`;
      if (anyFeed) h += `<td>${fd.feedCost != null ? fmtMoney(fd.feedCost) : '\u2014'}</td>`;
      if (anyHealth) h += `<td>${fd.healthCost != null ? fmtMoney(fd.healthCost) : '\u2014'}</td>`;
      if (anyDirect) h += `<td>${fd.directExpTotal != null ? fmtMoney(fd.directExpTotal) : '\u2014'}</td>`;
      if (anyPurchase) h += `<td>${fd.acquisition != null ? fmtMoney(fd.acquisition) : '\u2014'}</td>`;
      h += `<td><strong>${fd.costPerEgg != null ? fmtMoney(fd.costPerEgg) : '\u2014'}</strong></td>`;
      if (anyROI) h += `<td>${fd.roiPerBird != null ? (fd.roiPerBird >= 0 ? '+' : '') + fmtNum(fd.roiPerBird, 2) + 'x' : '\u2014'}</td>`;
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';

    // Cost breakdown bars per flock (CSS bars, no Chart.js)
    const barsData = flockData.filter(fd => fd.totalCostFull != null && fd.totalCostFull > 0);
    if (barsData.length) {
      h += `<div class="card"><h3>${t('econ_cost_breakdown')} \u2014 ${t('ana_comparison')}</h3>`;
      const maxCost = Math.max(...barsData.map(fd => fd.totalCostFull));

      barsData.forEach(fd => {
        const barW = maxCost > 0 ? Math.round(fd.totalCostFull / maxCost * 100) : 0;
        const total = fd.totalCostFull;
        const parts = [];
        if (fd.feedCost != null) parts.push({ label: t('econ_feed_cost'), val: fd.feedCost, color: '#4CAF50' });
        if (fd.healthCost != null) parts.push({ label: t('econ_health_cost'), val: fd.healthCost, color: '#FF9800' });
        if (fd.directExpTotal != null) parts.push({ label: t('econ_direct_expenses'), val: fd.directExpTotal, color: '#2196F3' });
        if (fd.acquisition != null) parts.push({ label: t('econ_acquisition'), val: fd.acquisition, color: '#9C27B0' });

        h += `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong>${sanitizeHTML(fd.f.name)}</strong><span>${fmtMoney(fd.totalCostFull)}</span></div>`;
        h += `<div style="display:flex;height:24px;border-radius:6px;overflow:hidden;width:${barW}%;min-width:40px;background:var(--bg-tertiary, #e0e0e0)">`;
        parts.forEach(p => {
          const pw = total > 0 ? Math.round(p.val / total * 100) : 0;
          if (pw > 0) h += `<div title="${sanitizeHTML(p.label)}: ${fmtMoney(p.val)}" style="width:${pw}%;background:${p.color};min-width:2px"></div>`;
        });
        h += '</div></div>';
      });

      // Legend
      h += '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">';
      if (anyFeed) h += `<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#4CAF50;margin-right:4px"></span>${t('econ_feed_cost')}</span>`;
      if (anyHealth) h += `<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#FF9800;margin-right:4px"></span>${t('econ_health_cost')}</span>`;
      if (anyDirect) h += `<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#2196F3;margin-right:4px"></span>${t('econ_direct_expenses')}</span>`;
      if (anyPurchase) h += `<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#9C27B0;margin-right:4px"></span>${t('econ_acquisition')}</span>`;
      h += '</div></div>';
    }

    // Data completeness hints
    const incomplete = flockData.filter(fd => !fd.hasPurchase || !fd.hasFeed || !fd.hasHealth || !fd.hasEggs);
    if (incomplete.length) {
      h += `<div class="card"><h3>${t('econ_completeness')}</h3><div style="font-size:0.9em;color:var(--text-secondary, #666)">`;
      incomplete.forEach(fd => {
        const missing = [];
        if (!fd.hasPurchase) missing.push(t('flock_purchase_cost'));
        if (!fd.hasFeed) missing.push(t('econ_feed_cost'));
        if (!fd.hasHealth) missing.push(t('econ_health_cost'));
        if (!fd.hasEggs) missing.push(t('prod_eggs'));
        if (missing.length) h += `<div style="margin:4px 0">\u26A0\uFE0F <strong>${sanitizeHTML(fd.f.name)}</strong>: ${missing.join(', ')}</div>`;
      });
      h += '</div></div>';
    }

    return h;
  }

  /* ── Public API ── */
  cleanup() {
    this._destroyCharts();
  }
}

customElements.define('egg-analysis', EggAnalysis);
export { EggAnalysis };
