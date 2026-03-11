// <egg-welfare> — Animal Welfare Assessment Module (Welfare Quality® Protocol v2.0)
// 4 Principles, 12 Criteria, ~30 Measures for Laying Hens
// Shadow DOM encapsulated Web Component

import { Store, Bus, t, fmtDate, todayStr, genId, kpi, emptyState, DataTable } from '../core/index.js';
import { showConfirm } from './egg-confirm.js';

// ─── CHART.JS DYNAMIC LOADER ───────────────────────────────────

let _chartJsLoaded = false;
let _chartJsLoading = null;

function loadChartJs() {
  if (_chartJsLoaded && window.Chart) return Promise.resolve();
  if (_chartJsLoading) return _chartJsLoading;
  _chartJsLoading = new Promise((resolve, reject) => {
    if (window.Chart) { _chartJsLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    s.onload = () => { _chartJsLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.head.appendChild(s);
  });
  return _chartJsLoading;
}

// ─── PROTOCOL DATA ──────────────────────────────────────────────

const PRINCIPLE_COLORS = {
  feeding: { main: '#FF6F00', bg: 'rgba(255,111,0,0.12)', light: '#FFF3E0' },
  housing: { main: '#1565C0', bg: 'rgba(21,101,192,0.12)', light: '#E3F2FD' },
  health:  { main: '#c62828', bg: 'rgba(198,40,40,0.12)', light: '#FFEBEE' },
  behaviour: { main: '#2e7d32', bg: 'rgba(46,125,50,0.12)', light: '#E8F5E9' },
};

const WQ_PRINCIPLES = [
  { id: 'feeding', icon: '🌾', key: 'wel_feeding' },
  { id: 'housing', icon: '🏠', key: 'wel_housing' },
  { id: 'health', icon: '💉', key: 'wel_health' },
  { id: 'behaviour', icon: '🐾', key: 'wel_behaviour' },
];

const WQ_CRITERIA = {
  feeding: [
    { id: 'hunger', key: 'wel_c_hunger', measures: ['keel_prominence'] },
    { id: 'thirst', key: 'wel_c_thirst', measures: ['water_avail'] },
  ],
  housing: [
    { id: 'resting', key: 'wel_c_resting', measures: ['perch_shape', 'red_mites', 'dust_sheet'] },
    { id: 'thermal', key: 'wel_c_thermal', measures: ['panting', 'huddling'] },
    { id: 'movement', key: 'wel_c_movement', measures: ['stocking_density', 'horiz_movement', 'vert_movement', 'perforated_floor'] },
  ],
  health: [
    { id: 'injuries', key: 'wel_c_injuries', measures: ['keel_damage', 'skin_lesions', 'footpad', 'toe_damage', 'beak_damage'] },
    { id: 'disease', key: 'wel_c_disease', measures: ['mortality', 'enlarged_crops', 'eye_path', 'resp_infect', 'enteritis', 'parasites', 'comb_abnorm'] },
    { id: 'pain', key: 'wel_c_pain', measures: ['beak_treatment'] },
  ],
  behaviour: [
    { id: 'social', key: 'wel_c_social', measures: ['plumage_head', 'comb_wounds'] },
    { id: 'other_beh', key: 'wel_c_other_beh', measures: ['plumage_body', 'nest_space', 'litter_quality', 'litter_material', 'enrichment_feed', 'enrichment_amount', 'free_range', 'cover_range', 'veranda'] },
    { id: 'human_rel', key: 'wel_c_human_rel', measures: ['avoidance_dist'] },
    { id: 'emotional', key: 'wel_c_emotional', measures: ['novel_object', 'qba'] },
  ],
};

const WQ_MEASURES = {
  keel_prominence: { key: 'wel_m_keel_prom', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_keel_prom_d' },
  water_avail: { key: 'wel_m_water', type: 'score02', unit: '', desc: 'wel_m_water_d' },
  perch_shape: { key: 'wel_m_perch', type: 'number', unit: 'cm/bird', desc: 'wel_m_perch_d' },
  red_mites: { key: 'wel_m_mites', type: 'score02', unit: '', desc: 'wel_m_mites_d' },
  dust_sheet: { key: 'wel_m_dust', type: 'score02', unit: '', desc: 'wel_m_dust_d' },
  panting: { key: 'wel_m_panting', type: 'number', unit: '%', desc: 'wel_m_panting_d' },
  huddling: { key: 'wel_m_huddling', type: 'number', unit: '%', desc: 'wel_m_huddling_d' },
  stocking_density: { key: 'wel_m_density', type: 'number', unit: 'cm²/hen', desc: 'wel_m_density_d' },
  horiz_movement: { key: 'wel_m_horiz', type: 'score02', unit: '', desc: 'wel_m_horiz_d' },
  vert_movement: { key: 'wel_m_vert', type: 'score02', unit: '', desc: 'wel_m_vert_d' },
  perforated_floor: { key: 'wel_m_perf_floor', type: 'number', unit: '%', desc: 'wel_m_perf_floor_d' },
  keel_damage: { key: 'wel_m_keel_dmg', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_keel_dmg_d' },
  skin_lesions: { key: 'wel_m_skin', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_skin_d' },
  footpad: { key: 'wel_m_footpad', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_footpad_d' },
  toe_damage: { key: 'wel_m_toe', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_toe_d' },
  beak_damage: { key: 'wel_m_beak_dmg', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_beak_dmg_d' },
  mortality: { key: 'wel_m_mortality', type: 'number', unit: '%', desc: 'wel_m_mortality_d' },
  enlarged_crops: { key: 'wel_m_crops', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_crops_d' },
  eye_path: { key: 'wel_m_eye', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_eye_d' },
  resp_infect: { key: 'wel_m_resp', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_resp_d' },
  enteritis: { key: 'wel_m_enteritis', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_enteritis_d' },
  parasites: { key: 'wel_m_parasites', type: 'score02', unit: '', desc: 'wel_m_parasites_d' },
  comb_abnorm: { key: 'wel_m_comb', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_comb_d' },
  beak_treatment: { key: 'wel_m_beak_treat', type: 'score02', unit: '', desc: 'wel_m_beak_treat_d' },
  plumage_head: { key: 'wel_m_plum_head', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_plum_head_d' },
  comb_wounds: { key: 'wel_m_comb_wounds', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_comb_wounds_d' },
  plumage_body: { key: 'wel_m_plum_body', type: 'score012', sample: 100, unit: '%', desc: 'wel_m_plum_body_d' },
  nest_space: { key: 'wel_m_nest', type: 'number', unit: 'hens/nest', desc: 'wel_m_nest_d' },
  litter_quality: { key: 'wel_m_litter_q', type: 'score02', unit: '', desc: 'wel_m_litter_q_d' },
  litter_material: { key: 'wel_m_litter_m', type: 'score02', unit: '', desc: 'wel_m_litter_m_d' },
  enrichment_feed: { key: 'wel_m_enrich_feed', type: 'score02', unit: '', desc: 'wel_m_enrich_feed_d' },
  enrichment_amount: { key: 'wel_m_enrich_amt', type: 'score012', unit: '', desc: 'wel_m_enrich_amt_d' },
  free_range: { key: 'wel_m_freerange', type: 'score02', unit: '', desc: 'wel_m_freerange_d' },
  cover_range: { key: 'wel_m_cover', type: 'number', unit: '%', desc: 'wel_m_cover_d' },
  veranda: { key: 'wel_m_veranda', type: 'number', unit: 'cm²/bird', desc: 'wel_m_veranda_d' },
  avoidance_dist: { key: 'wel_m_adt', type: 'number', unit: 'cm', sample: 21, desc: 'wel_m_adt_d' },
  novel_object: { key: 'wel_m_not', type: 'number', unit: 'avg hens', desc: 'wel_m_not_d' },
  qba: { key: 'wel_m_qba', type: 'qba', unit: 'mm (0-125)', desc: 'wel_m_qba_d' },
};

const QBA_TERMS = [
  { key: 'qba_active', neg: false }, { key: 'qba_relaxed', neg: false },
  { key: 'qba_comfortable', neg: false }, { key: 'qba_fearful', neg: true },
  { key: 'qba_agitated', neg: true }, { key: 'qba_confident', neg: false },
  { key: 'qba_depressed', neg: true }, { key: 'qba_calm', neg: false },
  { key: 'qba_content', neg: false }, { key: 'qba_tense', neg: true },
  { key: 'qba_unsure', neg: true }, { key: 'qba_energetic', neg: false },
  { key: 'qba_frustrated', neg: true }, { key: 'qba_bored', neg: true },
  { key: 'qba_friendly', neg: false }, { key: 'qba_positively_occupied', neg: false },
  { key: 'qba_scared', neg: true }, { key: 'qba_nervous', neg: true },
  { key: 'qba_happy', neg: false }, { key: 'qba_distressed', neg: true },
];

// ─── WELFARE CATEGORY CLASSIFICATION ────────────────────────────

function classifyWelfare(principleScores) {
  const vals = Object.values(principleScores);
  if (vals.some(v => v === null || v === undefined)) return { cat: 'incomplete', color: '#999', icon: '<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#999"></span>' };

  const above80 = vals.filter(v => v > 80).length;
  const above55 = vals.filter(v => v > 55).length;
  const above20 = vals.filter(v => v > 20).length;
  const allAbove55 = vals.every(v => v > 55);
  const allAbove20 = vals.every(v => v > 20);
  const allAbove10 = vals.every(v => v > 10);

  if (above80 >= 2 && allAbove55) return { cat: 'excellent', color: '#2e7d32', icon: '<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2e7d32"></span>' };
  if (above55 >= 2 && allAbove20) return { cat: 'enhanced', color: '#1565c0', icon: '<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1565c0"></span>' };
  if (above20 >= 3 && allAbove10) return { cat: 'acceptable', color: '#f57f17', icon: '<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f57f17"></span>' };
  return { cat: 'not_classified', color: '#c62828', icon: '<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#c62828"></span>' };
}

// ─── COMPONENT ──────────────────────────────────────────────────

class EggWelfare extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'overview';
    this._currentPrinciple = null;
    this._unsubs = [];
    this._charts = [];
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('data:changed', () => this.render())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    this._destroyCharts();
  }

  cleanup() { this._destroyCharts(); }

  _destroyCharts() {
    if (this._charts) {
      this._charts.forEach(c => { try { c.destroy(); } catch(_){} });
      this._charts = [];
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────

  render() {
    const D = Store.get();
    if (!D.welfare) D.welfare = { assessments: [] };
    let h = this._css();

    h += `<div class="page-header">
      <div class="header-content">
        <h2>${t('wel_title') || 'Animal Welfare Assessment'}</h2>
        <p class="subtitle">${t('wel_subtitle') || 'Welfare Quality® Protocol v2.0 for Laying Hens'}</p>
      </div>
      <div class="header-badge">
        <span class="protocol-badge">WQ® v2.0</span>
      </div>
    </div>`;

    // Tabs
    h += `<div class="tabs">
      <div class="tab${this._currentTab === 'overview' ? ' active' : ''}" data-tab="overview">
        <span class="tab-label">${t('wel_overview') || 'Overview'}</span>
      </div>
      <div class="tab${this._currentTab === 'new' ? ' active' : ''}" data-tab="new">
        <span class="tab-label">${t('wel_new_assess') || 'New Assessment'}</span>
      </div>
      <div class="tab${this._currentTab === 'history' ? ' active' : ''}" data-tab="history">
        <span class="tab-label">${t('wel_history') || 'History'}</span>
      </div>
      <div class="tab${this._currentTab === 'guide' ? ' active' : ''}" data-tab="guide">
        <span class="tab-label">${t('wel_guide') || 'Protocol Guide'}</span>
      </div>
    </div>`;

    if (this._currentTab === 'overview') h += this._renderOverview(D);
    else if (this._currentTab === 'new') h += this._renderNewAssessment(D);
    else if (this._currentTab === 'history') h += this._renderHistory(D);
    else if (this._currentTab === 'guide') h += this._renderGuide();

    this._destroyCharts();
    this.shadowRoot.innerHTML = h;
    this._bindEvents();
    if (this._currentTab === 'overview') this._initCharts(D);
  }

  // ─── OVERVIEW TAB ───────────────────────────────────────────

  _renderOverview(D) {
    const assessments = D.welfare.assessments || [];
    const latest = assessments[assessments.length - 1];
    let h = '';

    if (!latest) {
      h += `<div class="welcome-empty">
        <div class="welcome-visual">
          <div class="welcome-circle">
            <span class="welcome-emoji"></span>
          </div>
          <div class="welcome-rings"></div>
        </div>
        <h3>${t('wel_no_assessments') || 'No welfare assessments yet'}</h3>
        <p>${t('wel_start_first') || 'Start your first Welfare Quality® assessment to track and improve animal welfare on your farm.'}</p>
        <div class="welcome-features">
          ${WQ_PRINCIPLES.map(p => {
            const c = PRINCIPLE_COLORS[p.id];
            return `<div class="welcome-feature" style="border-left:3px solid ${c.main}">
              <span class="wf-icon"></span>
              <div><strong>${t(p.key) || p.id}</strong><br><small>${(WQ_CRITERIA[p.id] || []).length} ${t('wel_criteria') || 'criteria'}</small></div>
            </div>`;
          }).join('')}
        </div>
        <button class="btn btn-primary btn-lg" data-tab="new">${t('wel_start_assessment') || 'Start First Assessment'}</button>
      </div>`;
      return h;
    }

    // Classification hero card
    const ps = latest.principleScores || {};
    const cls = classifyWelfare(ps);
    const vals = WQ_PRINCIPLES.map(p => ps[p.id] ?? 0);
    const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);

    h += `<div class="hero-card" style="--hero-color:${cls.color}">
      <div class="hero-left">
        <div class="hero-score-ring">
          <svg viewBox="0 0 120 120" class="score-svg">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="8"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="8"
              stroke-dasharray="${(avg / 100) * 327} 327" stroke-linecap="round"
              transform="rotate(-90 60 60)" class="score-arc"/>
          </svg>
          <div class="hero-score-num">${avg}</div>
        </div>
        <div class="hero-info">
          <div class="hero-cat">${cls.icon} ${(t('wel_cat_' + cls.cat) || cls.cat).toUpperCase()}</div>
          <div class="hero-meta">${t('wel_last_assessment') || 'Last assessment'}: <strong>${fmtDate(latest.date)}</strong></div>
          <div class="hero-meta">${latest.flockName || ''} ${latest.assessor ? '— ' + latest.assessor : ''}</div>
        </div>
      </div>
      <button class="btn btn-outline-light btn-sm" data-tab="new">${t('wel_new_assess') || 'New Assessment'}</button>
    </div>`;

    // Principle score cards with progress bars
    h += `<div class="principle-grid">`;
    for (const p of WQ_PRINCIPLES) {
      const score = ps[p.id];
      const pct = score != null ? Math.round(score) : 0;
      const c = PRINCIPLE_COLORS[p.id];
      const level = pct > 80 ? 'excellent' : pct > 55 ? 'enhanced' : pct > 20 ? 'acceptable' : 'low';
      const criteriaCount = (WQ_CRITERIA[p.id] || []).length;
      h += `<div class="principle-score-card">
        <div class="psc-header" style="background:${c.bg}">
          <span class="psc-icon"></span>
          <span class="psc-name">${t(p.key) || p.id}</span>
          <span class="psc-value" style="color:${c.main}">${score != null ? pct : '—'}</span>
        </div>
        <div class="psc-bar-wrap">
          <div class="psc-bar" style="width:${pct}%;background:${c.main}"></div>
          <div class="psc-threshold" style="left:80%" title="Excellent threshold"></div>
          <div class="psc-threshold low" style="left:20%" title="Minimum threshold"></div>
        </div>
        <div class="psc-footer">
          <span class="psc-level ${level}">${t('wel_cat_' + level) || level}</span>
          <span class="psc-criteria">${criteriaCount} ${t('wel_criteria') || 'criteria'}</span>
        </div>
      </div>`;
    }
    h += `</div>`;

    // Charts row: Radar + Donut
    h += `<div class="charts-row">
      <div class="chart-card">
        <h3>${t('wel_radar_title') || 'Welfare Profile'}</h3>
        <div class="chart-wrap"><canvas id="wf-radar" width="350" height="350"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>${t('wel_overall_score') || 'Overall Score'}</h3>
        <div class="chart-wrap"><canvas id="wf-donut" width="250" height="250"></canvas></div>
        <div class="overall-label" id="wf-overall-label"></div>
      </div>
    </div>`;

    // Trend line chart (if >1 assessment)
    if (assessments.length > 1) {
      h += `<div class="chart-card full-width">
        <h3>${t('wel_trend') || 'Assessment Trend'}</h3>
        <div class="chart-wrap-wide"><canvas id="wf-trend" width="700" height="280"></canvas></div>
      </div>`;

      h += `<details class="trend-details">
        <summary>${t('wel_history_table') || 'History Table'}</summary>
        <div class="trend-table"><table>
          <thead><tr><th>${t('date') || 'Date'}</th><th>${t('wel_flock') || 'Flock'}</th>`;
      for (const p of WQ_PRINCIPLES) h += `<th>${t(p.key) || p.id}</th>`;
      h += `<th>${t('wel_category') || 'Category'}</th></tr></thead><tbody>`;
      for (const a of assessments.slice(-10).reverse()) {
        const aps = a.principleScores || {};
        const acls = classifyWelfare(aps);
        h += `<tr><td>${fmtDate(a.date)}</td><td>${a.flockName || '—'}</td>`;
        for (const p of WQ_PRINCIPLES) {
          const s = aps[p.id];
          const pc = PRINCIPLE_COLORS[p.id];
          h += `<td><span class="inline-score" style="color:${pc.main}">${s != null ? Math.round(s) : '—'}</span></td>`;
        }
        h += `<td><span class="cat-pill" style="background:${acls.color}">${t('wel_cat_' + acls.cat) || acls.cat}</span></td></tr>`;
      }
      h += `</tbody></table></div></details>`;
    }

    return h;
  }

  // ─── NEW ASSESSMENT TAB ─────────────────────────────────────

  _renderNewAssessment(D) {
    let h = '';
    const flocks = (D.flocks || []).filter(f => !f.deleted);

    h += `<div class="assess-header">
      <h3>${t('wel_new_assessment_title') || 'New Welfare Assessment'}</h3>
      <p>${t('wel_new_assessment_desc') || 'Fill in the assessment details and evaluate each principle below.'}</p>
    </div>`;

    h += `<div class="assess-form">
      <div class="form-row">
        <label>${t('date') || 'Date'}</label>
        <input type="date" id="wf-date" value="${todayStr()}">
      </div>
      <div class="form-row">
        <label>${t('wel_flock') || 'Flock'}</label>
        <select id="wf-flock">
          <option value="">${t('select') || '-- Select --'}</option>
          ${flocks.map(f => `<option value="${f.id}">${f.name || f.id}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>${t('wel_assessor') || 'Assessor'}</label>
        <input type="text" id="wf-assessor" placeholder="${t('wel_assessor_name') || 'Name'}">
      </div>
      <div class="form-row">
        <label>${t('wel_housing_type') || 'Housing System'}</label>
        <select id="wf-housing">
          <option value="cage">${t('wel_cage') || 'Cage'}</option>
          <option value="barn">${t('wel_barn') || 'Barn'}</option>
          <option value="free_range" selected>${t('wel_free_range_sys') || 'Free Range'}</option>
          <option value="aviary">${t('wel_aviary') || 'Aviary'}</option>
          <option value="organic">${t('wel_organic') || 'Organic'}</option>
        </select>
      </div>
    </div>`;

    // Principles accordion — visual cards
    h += `<div class="principles-accordion">`;
    for (const principle of WQ_PRINCIPLES) {
      const criteria = WQ_CRITERIA[principle.id] || [];
      const isOpen = this._currentPrinciple === principle.id;
      const c = PRINCIPLE_COLORS[principle.id];
      const measureCount = criteria.reduce((sum, cr) => sum + cr.measures.length, 0);
      h += `<div class="principle-block${isOpen ? ' open' : ''}" style="--p-color:${c.main};--p-bg:${c.bg}">
        <div class="principle-header" data-principle="${principle.id}">
          <div class="ph-left">
            <span class="principle-icon-wrap" style="background:${c.bg}">${principle.icon}</span>
            <div class="ph-text">
              <span class="principle-name">${t(principle.key) || principle.id}</span>
              <span class="principle-meta">${criteria.length} ${t('wel_criteria') || 'criteria'} · ${measureCount} ${t('wel_measures') || 'measures'}</span>
            </div>
          </div>
          <span class="chevron">${isOpen ? '▲' : '▼'}</span>
        </div>`;
      if (isOpen) {
        h += `<div class="principle-body">`;
        for (const criterion of criteria) {
          h += `<div class="criterion-block">
            <h4><span class="crit-dot" style="background:${c.main}"></span>${t(criterion.key) || criterion.id}</h4>
            <div class="measures-grid">`;
          for (const mId of criterion.measures) {
            const m = WQ_MEASURES[mId];
            if (!m) continue;
            h += this._renderMeasureInput(mId, m, c);
          }
          h += `</div></div>`;
        }
        h += `</div>`;
      }
      h += `</div>`;
    }
    h += `</div>`;

    h += `<div class="form-actions">
      <button class="btn btn-primary btn-lg" data-action="save-assessment">${t('save') || 'Save Assessment'}</button>
    </div>`;

    return h;
  }

  _renderMeasureInput(mId, m, color) {
    const label = t(m.key) || mId;
    const desc = t(m.desc) || '';
    let input = '';

    if (m.type === 'score012') {
      input = `<div class="score-inputs">
        <div class="score-col"><label class="score-label s0">0</label><input type="number" min="0" max="100" step="1" data-measure="${mId}" data-score="0" placeholder="%" class="score-input"></div>
        <div class="score-col"><label class="score-label s1">1</label><input type="number" min="0" max="100" step="1" data-measure="${mId}" data-score="1" placeholder="%" class="score-input"></div>
        <div class="score-col"><label class="score-label s2">2</label><input type="number" min="0" max="100" step="1" data-measure="${mId}" data-score="2" placeholder="%" class="score-input"></div>
      </div>`;
      if (m.sample) input += `<span class="sample-note">${t('wel_sample') || 'Sample'}: ${m.sample} ${t('wel_birds') || 'birds'}</span>`;
    } else if (m.type === 'score02') {
      input = `<select data-measure="${mId}" class="measure-select">
        <option value="">—</option>
        <option value="0">0 — ${t('wel_good') || 'Good'}</option>
        <option value="2">2 — ${t('wel_poor') || 'Poor / Jeopardized'}</option>
      </select>`;
    } else if (m.type === 'number') {
      input = `<div class="num-input-wrap">
        <input type="number" step="any" min="0" data-measure="${mId}" placeholder="0" class="measure-num">
        <span class="unit-label">${m.unit}</span>
      </div>`;
    } else if (m.type === 'qba') {
      input = this._renderQBA(mId);
    }

    return `<div class="measure-card" style="--mc-border:${color.main}">
      <div class="measure-name">${label}</div>
      ${desc ? `<div class="measure-desc">${desc}</div>` : ''}
      <div class="measure-input">${input}</div>
    </div>`;
  }

  _renderQBA(mId) {
    let h = `<div class="qba-grid">`;
    for (const term of QBA_TERMS) {
      const label = t(term.key) || term.key;
      h += `<div class="qba-row${term.neg ? ' neg' : ''}">
        <label>${label}${term.neg ? ' *' : ''}</label>
        <input type="range" min="0" max="125" value="0" data-measure="${mId}" data-qba="${term.key}" class="qba-slider">
        <span class="qba-val">0</span>
      </div>`;
    }
    h += `<div class="qba-note">* ${t('wel_qba_neg_note') || 'Italic/starred = negative terms (higher score = more negative state)'}</div>`;
    h += `</div>`;
    return h;
  }

  // ─── HISTORY TAB ────────────────────────────────────────────

  _renderHistory(D) {
    const assessments = (D.welfare.assessments || []).slice().reverse();
    if (!assessments.length) {
      return `<div class="welcome-empty">
        <div class="welcome-visual"><div class="welcome-circle"><span class="welcome-emoji"></span></div></div>
        <h3>${t('wel_no_history') || 'No assessment history'}</h3>
        <p>${t('wel_history_empty_desc') || 'Completed assessments will appear here with detailed scores and trends.'}</p>
        <button class="btn btn-primary" data-tab="new">${t('wel_start_assessment') || 'Start First Assessment'}</button>
      </div>`;
    }

    let h = `<div class="history-list">`;
    for (const a of assessments) {
      const ps = a.principleScores || {};
      const cls = classifyWelfare(ps);
      h += `<div class="history-card">
        <div class="hc-top">
          <div class="hc-top-left">
            <span class="hc-badge" style="background:${cls.color}">${cls.icon} ${t('wel_cat_' + cls.cat) || cls.cat}</span>
            <span class="hc-date">${fmtDate(a.date)}</span>
          </div>
          <button class="btn-icon" data-action="delete-assessment" data-id="${a.id}" title="${t('delete') || 'Delete'}">🗑️</button>
        </div>
        <div class="hc-flock">${a.flockName || '—'} ${a.assessor ? '— ' + a.assessor : ''}</div>
        <div class="hc-scores-grid">`;
      for (const p of WQ_PRINCIPLES) {
        const s = ps[p.id];
        const pct = s != null ? Math.round(s) : 0;
        const c = PRINCIPLE_COLORS[p.id];
        h += `<div class="hc-score-item">
          <div class="hc-score-header">
            <span>${t(p.key) || p.id}</span>
            <span style="color:${c.main};font-weight:700">${s != null ? pct : '—'}</span>
          </div>
          <div class="hc-mini-bar"><div class="hc-mini-fill" style="width:${pct}%;background:${c.main}"></div></div>
        </div>`;
      }
      h += `</div>
        <details class="hc-details"><summary>${t('wel_details') || 'View Details'}</summary>
          <pre class="hc-json">${JSON.stringify(a.measures || {}, null, 2)}</pre>
        </details>
      </div>`;
    }
    h += `</div>`;
    return h;
  }

  // ─── PROTOCOL GUIDE TAB ─────────────────────────────────────

  _renderGuide() {
    let h = `<div class="guide">
      <div class="guide-hero">
        <h3>${t('wel_guide_title') || 'Welfare Quality® Assessment Protocol v2.0'}</h3>
        <p>${t('wel_guide_intro') || 'This module implements the Welfare Quality® Assessment Protocol for Laying Hens (v2.0, December 2019). The protocol assesses welfare through 4 principles, 12 criteria, and approximately 30 individual measures.'}</p>
      </div>

      <div class="guide-section">
        <h4>${t('wel_scoring_system') || 'Classification System'}</h4>
        <div class="class-grid">
          <div class="class-card" style="--cc-color:#2e7d32;--cc-bg:linear-gradient(135deg,#2e7d32,#43a047)">
            <div class="cc-icon"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2e7d32"></span></div><div class="class-name">${t('wel_cat_excellent') || 'Excellent'}</div>
            <div class="class-rule">${t('wel_rule_excellent') || '2+ principles > 80, ALL > 55'}</div>
          </div>
          <div class="class-card" style="--cc-color:#1565c0;--cc-bg:linear-gradient(135deg,#1565c0,#1e88e5)">
            <div class="cc-icon"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1565c0"></span></div><div class="class-name">${t('wel_cat_enhanced') || 'Enhanced'}</div>
            <div class="class-rule">${t('wel_rule_enhanced') || '2+ principles > 55, ALL > 20'}</div>
          </div>
          <div class="class-card" style="--cc-color:#f57f17;--cc-bg:linear-gradient(135deg,#f57f17,#ffa000)">
            <div class="cc-icon"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f57f17"></span></div><div class="class-name">${t('wel_cat_acceptable') || 'Acceptable'}</div>
            <div class="class-rule">${t('wel_rule_acceptable') || '3+ principles > 20, ALL > 10'}</div>
          </div>
          <div class="class-card" style="--cc-color:#c62828;--cc-bg:linear-gradient(135deg,#c62828,#e53935)">
            <div class="cc-icon"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#c62828"></span></div><div class="class-name">${t('wel_cat_not_classified') || 'Not Classified'}</div>
            <div class="class-rule">${t('wel_rule_not_classified') || 'Below minimum thresholds'}</div>
          </div>
        </div>
      </div>

      <div class="guide-section">
        <h4>${t('wel_principles_criteria') || '4 Principles & 12 Criteria'}</h4>
        <div class="guide-principles-grid">`;

    for (const principle of WQ_PRINCIPLES) {
      const criteria = WQ_CRITERIA[principle.id] || [];
      const c = PRINCIPLE_COLORS[principle.id];
      h += `<div class="guide-principle-card" style="border-top:4px solid ${c.main}">
        <h5><span class="gp-icon" style="background:${c.bg};color:${c.main}">${principle.icon}</span> ${t(principle.key) || principle.id}</h5>
        <ul>`;
      for (const cr of criteria) {
        h += `<li><strong>${t(cr.key) || cr.id}</strong><br><small>${cr.measures.map(mId => t(WQ_MEASURES[mId]?.key) || mId).join(', ')}</small></li>`;
      }
      h += `</ul></div>`;
    }

    h += `</div></div>

      <div class="guide-section">
        <h4>${t('wel_measure_scales') || 'Scoring Scales'}</h4>
        <div class="scales-grid">
          <div class="scale-card s0"><div class="scale-num">0</div><div class="scale-text">${t('wel_score0_desc') || 'Good welfare — no or minimal issues'}</div></div>
          <div class="scale-card s1"><div class="scale-num">1</div><div class="scale-text">${t('wel_score1_desc') || 'Moderate compromise — some issues found'}</div></div>
          <div class="scale-card s2"><div class="scale-num">2</div><div class="scale-text">${t('wel_score2_desc') || 'Welfare jeopardized — serious issues'}</div></div>
        </div>
      </div>

      <div class="guide-info-grid">
        <div class="guide-info-card">
          <h4>${t('wel_time_required') || 'Time Required'}</h4>
          <p>${t('wel_time_desc') || 'A full assessment takes approximately 6-7 hours. Clinical assessment of 100 birds: 180-240 min. Behavioural tests (QBA, NOT, ADT): ~95 min. Resource-based measures: ~50 min.'}</p>
        </div>
        <div class="guide-info-card">
          <h4>${t('wel_qba_title') || 'Qualitative Behaviour Assessment (QBA)'}</h4>
          <p>${t('wel_qba_desc') || 'Score 20 expressive qualities on a 0-125mm visual analogue scale (VAS). 10 positive and 10 negative terms.'}</p>
          <div class="qba-terms-grid">`;
    for (const term of QBA_TERMS) {
      h += `<span class="qba-term${term.neg ? ' neg' : ''}">${t(term.key) || term.key}${term.neg ? '*' : ''}</span>`;
    }
    h += `</div></div></div></div>`;
    return h;
  }

  // ─── CHARTS ─────────────────────────────────────────────────

  _initCharts(D) {
    loadChartJs().then(() => {
      if (!this.isConnected) return;
      const Chart = window.Chart;
      if (!Chart) return;

      const assessments = (D.welfare?.assessments) || [];
      const latest = assessments[assessments.length - 1];
      if (!latest) return;
      const ps = latest.principleScores || {};

      // ── Radar Chart ──
      const radarCanvas = this.shadowRoot.querySelector('#wf-radar');
      if (radarCanvas) {
        const labels = WQ_PRINCIPLES.map(p => t(p.key) || p.id);
        const data = WQ_PRINCIPLES.map(p => ps[p.id] ?? 0);
        const radarChart = new Chart(radarCanvas, {
          type: 'radar',
          data: {
            labels,
            datasets: [{
              label: t('wel_current') || 'Current',
              data,
              backgroundColor: 'rgba(21, 101, 192, 0.18)',
              borderColor: '#1565C0',
              borderWidth: 2.5,
              pointBackgroundColor: WQ_PRINCIPLES.map(p => PRINCIPLE_COLORS[p.id].main),
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              pointRadius: 6,
              pointHoverRadius: 8,
            }, {
              label: t('wel_target') || 'Target (80)',
              data: [80, 80, 80, 80],
              backgroundColor: 'rgba(46, 125, 50, 0.06)',
              borderColor: 'rgba(46, 125, 50, 0.4)',
              borderWidth: 1.5,
              borderDash: [6, 4],
              pointRadius: 0,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
              r: {
                beginAtZero: true,
                max: 100,
                ticks: { stepSize: 20, font: { size: 11 }, backdropColor: 'transparent', color: '#666' },
                grid: { color: 'rgba(0,0,0,0.06)', circular: true },
                angleLines: { color: 'rgba(0,0,0,0.06)' },
                pointLabels: { font: { size: 13, weight: '600' }, color: '#333' },
              }
            },
            plugins: {
              legend: { position: 'bottom', labels: { font: { size: 12 }, usePointStyle: true, padding: 16 } },
            }
          }
        });
        this._charts.push(radarChart);
      }

      // ── Donut / Overall Score ──
      const donutCanvas = this.shadowRoot.querySelector('#wf-donut');
      if (donutCanvas) {
        const vals = WQ_PRINCIPLES.map(p => ps[p.id] ?? 0);
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const cls = classifyWelfare(ps);

        const donutChart = new Chart(donutCanvas, {
          type: 'doughnut',
          data: {
            labels: WQ_PRINCIPLES.map(p => t(p.key) || p.id),
            datasets: [{
              data: WQ_PRINCIPLES.map(p => ps[p.id] ?? 0),
              backgroundColor: WQ_PRINCIPLES.map(p => PRINCIPLE_COLORS[p.id].main),
              borderWidth: 2,
              borderColor: '#fff',
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
              legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, padding: 12 } },
              tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${Math.round(ctx.raw)}/100` } },
            }
          }
        });
        this._charts.push(donutChart);

        const labelEl = this.shadowRoot.querySelector('#wf-overall-label');
        if (labelEl) {
          labelEl.innerHTML = `<span class="donut-score" style="color:${cls.color}">${Math.round(avg)}</span>
            <span class="donut-cat" style="color:${cls.color}">${(t('wel_cat_' + cls.cat) || cls.cat).toUpperCase()}</span>`;
        }
      }

      // ── Trend Line Chart ──
      const trendCanvas = this.shadowRoot.querySelector('#wf-trend');
      if (trendCanvas && assessments.length > 1) {
        const last10 = assessments.slice(-10);
        const labels = last10.map(a => fmtDate(a.date));
        const datasets = WQ_PRINCIPLES.map(p => ({
          label: t(p.key) || p.id,
          data: last10.map(a => a.principleScores?.[p.id] ?? null),
          borderColor: PRINCIPLE_COLORS[p.id].main,
          backgroundColor: PRINCIPLE_COLORS[p.id].main + '18',
          borderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: PRINCIPLE_COLORS[p.id].main,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        }));

        datasets.push({
          label: '— Excellent (80)',
          data: last10.map(() => 80),
          borderColor: 'rgba(46,125,50,0.35)',
          borderWidth: 1.5,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false,
        }, {
          label: '— Minimum (20)',
          data: last10.map(() => 20),
          borderColor: 'rgba(198,40,40,0.35)',
          borderWidth: 1.5,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false,
        });

        const trendChart = new Chart(trendCanvas, {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
              y: { beginAtZero: true, max: 100, ticks: { stepSize: 20, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
              x: { ticks: { font: { size: 11 } }, grid: { display: false } }
            },
            plugins: {
              legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, padding: 12 } },
              tooltip: { mode: 'index', intersect: false },
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
          }
        });
        this._charts.push(trendChart);
      }
    }).catch(() => {
      const el = this.shadowRoot.querySelector('#wf-radar');
      if (el) el.parentElement.innerHTML = '<p style="text-align:center;color:#999;font-size:13px;padding:40px 0">Charts unavailable offline</p>';
    });
  }

  // ─── EVENTS ─────────────────────────────────────────────────

  _bindEvents() {
    const shadow = this.shadowRoot;

    shadow.addEventListener('click', (e) => {
      // Tabs (including CTA buttons with data-tab)
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this._currentTab = tab.dataset.tab;
        this._currentPrinciple = null;
        this.render();
        return;
      }

      // Principle accordion
      const ph = e.target.closest('.principle-header[data-principle]');
      if (ph) {
        const pid = ph.dataset.principle;
        this._currentPrinciple = this._currentPrinciple === pid ? null : pid;
        this.render();
        return;
      }

      // Save assessment
      if (e.target.closest('[data-action="save-assessment"]')) {
        this._saveAssessment();
        return;
      }

      // Delete assessment
      const delBtn = e.target.closest('[data-action="delete-assessment"]');
      if (delBtn) {
        const id = delBtn.dataset.id;
        showConfirm(t('wel_confirm_delete') || 'Delete this assessment?', (yes) => {
          if (!yes) return;
          const D = Store.get();
          D.welfare.assessments = (D.welfare.assessments || []).filter(a => a.id !== id);
          Store.save(D);
          this.render();
        });
        return;
      }
    });

    // QBA slider value display
    shadow.addEventListener('input', (e) => {
      if (e.target.classList.contains('qba-slider')) {
        const val = e.target.nextElementSibling;
        if (val) val.textContent = e.target.value;
      }
    });
  }

  _saveAssessment() {
    const shadow = this.shadowRoot;
    const date = shadow.querySelector('#wf-date')?.value || todayStr();
    const flockId = shadow.querySelector('#wf-flock')?.value || '';
    const assessor = shadow.querySelector('#wf-assessor')?.value || '';
    const housingType = shadow.querySelector('#wf-housing')?.value || 'free_range';

    const D = Store.get();
    const flock = (D.flocks || []).find(f => f.id === flockId);

    // Collect all measures
    const measures = {};

    shadow.querySelectorAll('.score-input').forEach(inp => {
      const mId = inp.dataset.measure;
      const score = inp.dataset.score;
      const val = parseFloat(inp.value);
      if (!isNaN(val)) {
        if (!measures[mId]) measures[mId] = {};
        measures[mId]['s' + score] = val;
      }
    });

    shadow.querySelectorAll('.measure-select').forEach(sel => {
      const mId = sel.dataset.measure;
      if (sel.value !== '') measures[mId] = parseInt(sel.value);
    });

    shadow.querySelectorAll('.measure-num').forEach(inp => {
      const mId = inp.dataset.measure;
      const val = parseFloat(inp.value);
      if (!isNaN(val)) measures[mId] = val;
    });

    shadow.querySelectorAll('.qba-slider').forEach(inp => {
      const mId = inp.dataset.measure;
      const qbaKey = inp.dataset.qba;
      if (!measures[mId]) measures[mId] = {};
      measures[mId][qbaKey] = parseInt(inp.value);
    });

    const principleScores = this._calcPrincipleScores(measures);

    const assessment = {
      id: genId(),
      date,
      flockId,
      flockName: flock?.name || '',
      assessor,
      housingType,
      measures,
      principleScores,
      createdAt: new Date().toISOString(),
    };

    if (!D.welfare) D.welfare = { assessments: [] };
    D.welfare.assessments.push(assessment);
    Store.save(D);

    Bus.emit('toast', { msg: t('wel_saved') || 'Welfare assessment saved', type: 'ok' });
    this._currentTab = 'overview';
    this.render();
  }

  _calcPrincipleScores(measures) {
    const scores = {};
    for (const principle of WQ_PRINCIPLES) {
      const criteria = WQ_CRITERIA[principle.id] || [];
      let total = 0, count = 0;

      for (const criterion of criteria) {
        for (const mId of criterion.measures) {
          const m = WQ_MEASURES[mId];
          const val = measures[mId];
          if (val == null || val === '') continue;

          if (m.type === 'score012' && typeof val === 'object') {
            const s0 = val.s0 || 0, s1 = val.s1 || 0, s2 = val.s2 || 0;
            const badPct = s1 * 0.5 + s2 * 1.0;
            total += Math.max(0, 100 - badPct);
            count++;
          } else if (m.type === 'score02') {
            total += (val === 0) ? 100 : 0;
            count++;
          } else if (m.type === 'number') {
            total += 50;
            count++;
          } else if (m.type === 'qba' && typeof val === 'object') {
            let posSum = 0, posN = 0, negSum = 0, negN = 0;
            for (const term of QBA_TERMS) {
              const v = val[term.key] || 0;
              if (term.neg) { negSum += v; negN++; }
              else { posSum += v; posN++; }
            }
            const posAvg = posN ? posSum / posN : 0;
            const negAvg = negN ? negSum / negN : 0;
            const qbaScore = Math.max(0, Math.min(100, ((posAvg - negAvg) / 125) * 100 + 50));
            total += qbaScore;
            count++;
          }
        }
      }

      scores[principle.id] = count > 0 ? Math.round(total / count) : null;
    }
    return scores;
  }

  // ─── STYLES ─────────────────────────────────────────────────

  _css() {
    return `<style>
:host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
* { box-sizing: border-box; }

/* Page header */
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding: 20px 24px; background: linear-gradient(135deg, #0E2240 0%, #1a3a5c 100%); border-radius: 16px; color: #fff; }
.header-content h2 { margin: 0; font-size: 22px; font-weight: 700; }
.subtitle { margin: 4px 0 0; font-size: 13px; opacity: .75; }
.protocol-badge { background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.25); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: .5px; }

/* Tabs */
.tabs { display: flex; gap: 4px; margin-bottom: 24px; background: var(--bg-alt, #f0f2f5); padding: 4px; border-radius: 12px; flex-wrap: wrap; }
.tab { display: flex; align-items: center; gap: 6px; padding: 10px 18px; cursor: pointer; font-size: 13px; font-weight: 500; border-radius: 10px; transition: all .2s; color: var(--text-muted, #666); }
.tab:hover { background: rgba(0,0,0,.05); }
.tab.active { background: var(--card-bg, #fff); color: var(--text, #1a1a1a); font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.tab-icon { font-size: 16px; }
.tab-label { white-space: nowrap; }

/* Welcome / Empty state */
.welcome-empty { text-align: center; padding: 48px 24px; }
.welcome-visual { position: relative; margin-bottom: 24px; }
.welcome-circle { width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #E3F2FD, #FFF3E0); display: flex; align-items: center; justify-content: center; margin: 0 auto; box-shadow: 0 8px 32px rgba(21,101,192,0.15); }
.welcome-emoji { font-size: 48px; }
.welcome-empty h3 { font-size: 20px; margin: 0 0 8px; color: var(--text, #1a1a1a); }
.welcome-empty p { font-size: 14px; color: var(--text-muted, #666); max-width: 480px; margin: 0 auto 24px; line-height: 1.6; }
.welcome-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 28px; max-width: 600px; margin-left: auto; margin-right: auto; }
.welcome-feature { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--card-bg, #fff); border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,.06); text-align: left; font-size: 13px; }
.wf-icon { font-size: 24px; }
.welcome-feature small { color: var(--text-muted, #888); }

/* Hero card */
.hero-card { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, var(--hero-color), color-mix(in srgb, var(--hero-color), #fff 20%)); border-radius: 16px; padding: 24px 28px; margin-bottom: 20px; color: #fff; flex-wrap: wrap; gap: 16px; }
.hero-left { display: flex; align-items: center; gap: 20px; }
.hero-score-ring { position: relative; width: 80px; height: 80px; flex-shrink: 0; }
.score-svg { width: 100%; height: 100%; }
.score-arc { transition: stroke-dasharray .6s ease; }
.hero-score-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #fff; }
.hero-cat { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
.hero-meta { font-size: 13px; opacity: .85; margin-top: 2px; }
.btn-outline-light { background: rgba(255,255,255,.2); color: #fff; border: 1px solid rgba(255,255,255,.4); padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: .2s; }
.btn-outline-light:hover { background: rgba(255,255,255,.35); }

/* Principle score cards */
.principle-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
.principle-score-card { background: var(--card-bg, #fff); border-radius: 14px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.psc-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; }
.psc-icon { font-size: 24px; }
.psc-name { flex: 1; font-size: 13px; font-weight: 600; }
.psc-value { font-size: 24px; font-weight: 800; }
.psc-bar-wrap { height: 6px; background: var(--bg-alt, #eee); position: relative; margin: 0 16px; border-radius: 3px; }
.psc-bar { height: 100%; border-radius: 3px; transition: width .6s ease; min-width: 2px; }
.psc-threshold { position: absolute; top: -3px; width: 2px; height: 12px; background: rgba(0,0,0,.2); border-radius: 1px; }
.psc-threshold.low { background: rgba(198,40,40,.3); }
.psc-footer { display: flex; justify-content: space-between; padding: 10px 16px; font-size: 11px; }
.psc-level { font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
.psc-level.excellent { color: #2e7d32; }
.psc-level.enhanced { color: #1565c0; }
.psc-level.acceptable { color: #f57f17; }
.psc-level.low { color: #c62828; }
.psc-criteria { color: var(--text-muted, #999); }

/* Charts */
.charts-row { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; margin-bottom: 20px; }
.chart-card { background: var(--card-bg, #fff); border-radius: 14px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.chart-card.full-width { margin-bottom: 20px; }
.chart-card h3 { margin: 0 0 16px; font-size: 15px; font-weight: 700; color: var(--text, #1a1a1a); }
.chart-wrap { display: flex; justify-content: center; align-items: center; max-height: 320px; }
.chart-wrap canvas { max-width: 100%; max-height: 300px; }
.chart-wrap-wide { width: 100%; max-height: 300px; }
.chart-wrap-wide canvas { width: 100% !important; max-height: 280px; }
.overall-label { text-align: center; margin-top: -20px; position: relative; z-index: 1; }
.donut-score { display: block; font-size: 36px; font-weight: 800; line-height: 1; }
.donut-cat { display: block; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; margin-top: 4px; }

/* Trend details */
.trend-details { margin-top: 16px; background: var(--card-bg, #fff); border-radius: 14px; padding: 16px 20px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.trend-details summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text, #333); padding: 4px 0; }
.trend-table { overflow-x: auto; margin-top: 12px; }
.trend-table table { width: 100%; border-collapse: collapse; font-size: 13px; }
.trend-table th, .trend-table td { padding: 10px 14px; border-bottom: 1px solid var(--border, #e8e8e8); text-align: center; }
.trend-table th { background: var(--bg-alt, #f5f5f5); font-weight: 600; font-size: 12px; }
.inline-score { font-weight: 700; }
.cat-pill { display: inline-block; padding: 3px 10px; border-radius: 20px; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }

/* Assessment form */
.assess-header { margin-bottom: 16px; }
.assess-header h3 { margin: 0 0 4px; font-size: 18px; }
.assess-header p { margin: 0; font-size: 13px; color: var(--text-muted, #666); }
.assess-form { background: var(--card-bg, #fff); border-radius: 14px; padding: 20px 24px; margin-bottom: 20px; box-shadow: 0 2px 12px rgba(0,0,0,.06); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.form-row label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted, #555); margin-bottom: 6px; }
.form-row input, .form-row select { width: 100%; padding: 10px 14px; border: 1px solid var(--border, #d0d0d0); border-radius: 10px; font-size: 14px; background: var(--bg, #fff); color: var(--text, #1a1a1a); transition: border .2s; }
.form-row input:focus, .form-row select:focus { border-color: #1565C0; outline: none; box-shadow: 0 0 0 3px rgba(21,101,192,.1); }

/* Principles accordion */
.principles-accordion { display: flex; flex-direction: column; gap: 10px; }
.principle-block { background: var(--card-bg, #fff); border-radius: 14px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.05); border: 1px solid var(--border, #e8e8e8); transition: box-shadow .2s; }
.principle-block.open { box-shadow: 0 4px 20px rgba(0,0,0,.1); border-color: var(--p-color); }
.principle-header { display: flex; align-items: center; gap: 14px; padding: 16px 20px; cursor: pointer; transition: .2s; }
.principle-header:hover { background: var(--p-bg); }
.ph-left { display: flex; align-items: center; gap: 14px; flex: 1; }
.principle-icon-wrap { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
.ph-text { display: flex; flex-direction: column; }
.principle-name { font-size: 15px; font-weight: 600; }
.principle-meta { font-size: 11px; color: var(--text-muted, #888); margin-top: 2px; }
.chevron { font-size: 12px; color: var(--text-muted, #999); transition: transform .2s; }
.principle-body { padding: 0 20px 20px; border-top: 1px solid var(--border, #eee); }

/* Criteria */
.criterion-block { margin-top: 18px; }
.criterion-block h4 { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; margin: 0 0 12px; color: var(--p-color, #333); }
.crit-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.measures-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }

/* Measure card */
.measure-card { background: var(--bg-alt, #f8f9fa); border-radius: 12px; padding: 14px 16px; border: 1px solid var(--border, #e8e8e8); border-left: 3px solid var(--mc-border, #ccc); transition: border-color .2s; }
.measure-card:hover { border-left-color: var(--mc-border); border-color: var(--mc-border); }
.measure-name { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.measure-desc { font-size: 11px; color: var(--text-muted, #888); margin-bottom: 10px; line-height: 1.4; }
.measure-input { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.measure-select, .measure-num { padding: 8px 12px; border: 1px solid var(--border, #d0d0d0); border-radius: 8px; font-size: 13px; background: var(--bg, #fff); min-width: 80px; }
.measure-select:focus, .measure-num:focus { border-color: #1565C0; outline: none; }
.num-input-wrap { display: flex; align-items: center; gap: 6px; }
.unit-label { font-size: 11px; color: var(--text-muted, #888); white-space: nowrap; }
.sample-note { font-size: 11px; color: var(--text-muted, #999); display: block; margin-top: 6px; }

/* Score 0/1/2 inputs */
.score-inputs { display: flex; gap: 8px; width: 100%; }
.score-col { display: flex; flex-direction: column; align-items: center; flex: 1; }
.score-label { font-size: 11px; margin-bottom: 4px; font-weight: 600; }
.score-label.s0 { color: #2e7d32; }
.score-label.s1 { color: #f57f17; }
.score-label.s2 { color: #c62828; }
.score-input { width: 100%; padding: 8px; border: 1px solid var(--border, #d0d0d0); border-radius: 8px; font-size: 13px; text-align: center; background: var(--bg, #fff); }
.score-input:focus { border-color: #1565C0; outline: none; }

/* QBA */
.qba-grid { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.qba-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.qba-row label { width: 140px; font-size: 12px; flex-shrink: 0; font-weight: 500; }
.qba-row.neg label { font-style: italic; color: var(--danger, #c62828); }
.qba-slider { flex: 1; height: 6px; accent-color: #1565C0; }
.qba-row.neg .qba-slider { accent-color: #c62828; }
.qba-val { width: 32px; text-align: right; font-size: 12px; font-weight: 700; color: var(--text, #333); }
.qba-note { font-size: 11px; color: var(--text-muted, #888); margin-top: 8px; padding: 8px; background: #fff3e0; border-radius: 6px; }

/* Form actions */
.form-actions { margin-top: 24px; text-align: center; }
.btn { padding: 10px 24px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .2s; }
.btn-lg { padding: 14px 32px; font-size: 15px; }
.btn-primary { background: linear-gradient(135deg, #1565C0, #1e88e5); color: #fff; box-shadow: 0 4px 12px rgba(21,101,192,.25); }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(21,101,192,.35); }

/* History */
.history-list { display: flex; flex-direction: column; gap: 14px; }
.history-card { background: var(--card-bg, #fff); border-radius: 14px; padding: 18px 22px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.hc-top { display: flex; align-items: center; justify-content: space-between; }
.hc-top-left { display: flex; align-items: center; gap: 12px; }
.hc-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 20px; color: #fff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }
.hc-date { font-weight: 600; font-size: 14px; color: var(--text, #333); }
.hc-flock { font-size: 13px; color: var(--text-muted, #666); margin-top: 6px; }
.hc-scores-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
.hc-score-item { }
.hc-score-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 4px; }
.hc-mini-bar { height: 4px; background: var(--bg-alt, #eee); border-radius: 2px; overflow: hidden; }
.hc-mini-fill { height: 100%; border-radius: 2px; transition: width .4s ease; }
.hc-details { margin-top: 12px; }
.hc-details summary { font-size: 13px; cursor: pointer; color: #1565c0; font-weight: 500; }
.hc-json { font-size: 11px; background: var(--bg-alt, #f5f5f5); padding: 12px; border-radius: 8px; overflow-x: auto; max-height: 300px; line-height: 1.5; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px 8px; border-radius: 6px; transition: .2s; }
.btn-icon:hover { background: rgba(198,40,40,.1); }

/* Guide */
.guide { }
.guide-hero { background: linear-gradient(135deg, #0E2240, #1a3a5c); border-radius: 16px; padding: 28px; color: #fff; margin-bottom: 24px; }
.guide-hero h3 { margin: 0 0 10px; font-size: 20px; }
.guide-hero p { margin: 0; font-size: 14px; opacity: .85; line-height: 1.6; }
.guide-section { margin-bottom: 28px; }
.guide-section h4 { font-size: 16px; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 2px solid #1565c0; }

/* Classification cards */
.class-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.class-card { padding: 18px; border-radius: 14px; color: #fff; background: var(--cc-bg); text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,.15); }
.cc-icon { font-size: 28px; margin-bottom: 6px; }
.class-name { font-size: 15px; font-weight: 700; }
.class-rule { font-size: 11px; opacity: .85; margin-top: 6px; line-height: 1.4; }

/* Guide principles grid */
.guide-principles-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.guide-principle-card { background: var(--card-bg, #fff); border-radius: 14px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.guide-principle-card h5 { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 15px; }
.gp-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.guide-principle-card ul { margin: 0; padding: 0 0 0 16px; font-size: 13px; line-height: 1.8; }
.guide-principle-card li { margin-bottom: 4px; }
.guide-principle-card small { color: var(--text-muted, #888); }

/* Scales grid */
.scales-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.scale-card { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 12px; background: var(--card-bg, #fff); box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.scale-card.s0 { border-left: 4px solid #2e7d32; }
.scale-card.s1 { border-left: 4px solid #f57f17; }
.scale-card.s2 { border-left: 4px solid #c62828; }
.scale-num { font-size: 28px; font-weight: 800; width: 40px; text-align: center; }
.scale-card.s0 .scale-num { color: #2e7d32; }
.scale-card.s1 .scale-num { color: #f57f17; }
.scale-card.s2 .scale-num { color: #c62828; }
.scale-text { font-size: 13px; line-height: 1.4; }

/* Guide info grid */
.guide-info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.guide-info-card { background: var(--card-bg, #fff); border-radius: 14px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.guide-info-card h4 { margin: 0 0 10px; font-size: 15px; }
.guide-info-card p { margin: 0 0 12px; font-size: 13px; color: var(--text-muted, #555); line-height: 1.6; }

/* QBA terms grid */
.qba-terms-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.qba-term { padding: 5px 12px; border-radius: 20px; font-size: 12px; background: #e8f5e9; color: #2e7d32; font-weight: 500; }
.qba-term.neg { background: #ffebee; color: #c62828; font-style: italic; }

/* Responsive */
@media (max-width: 1100px) {
  .principle-grid { grid-template-columns: repeat(2, 1fr); }
  .class-grid { grid-template-columns: repeat(2, 1fr); }
  .guide-principles-grid { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .principle-grid { grid-template-columns: 1fr 1fr; }
  .charts-row { grid-template-columns: 1fr; }
  .assess-form { grid-template-columns: 1fr; }
  .measures-grid { grid-template-columns: 1fr; }
  .class-grid { grid-template-columns: 1fr 1fr; }
  .scales-grid { grid-template-columns: 1fr; }
  .guide-info-grid { grid-template-columns: 1fr; }
  .hc-scores-grid { grid-template-columns: repeat(2, 1fr); }
  .hero-card { flex-direction: column; align-items: flex-start; }
  .qba-row label { width: 100px; font-size: 11px; }
}
@media (max-width: 480px) {
  .principle-grid { grid-template-columns: 1fr; }
  .class-grid { grid-template-columns: 1fr; }
  .welcome-features { grid-template-columns: 1fr; }
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

customElements.define('egg-welfare', EggWelfare);
export { EggWelfare };
