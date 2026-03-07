// <egg-carencias> — Deficiency Census / Withdrawal Periods Web Component
// Shows VENG census: farm health scores, findings by category, anonymized export
// Replaces renderCarencias(), exportCensusAnon(), showCensusAnon() from the monolith

import { Store, Bus, t, sanitizeHTML, todayStr, kpi, VENG, logAudit } from '../core/index.js';

const CAT_META = {
  sanitary:    { icon: '\uD83D\uDC89', label: 'Sanitaria',    color: '#c62828' },
  nutritional: { icon: '\uD83C\uDF3E', label: 'Nutricional',  color: '#e65100' },
  financial:   { icon: '\uD83D\uDCB0', label: 'Financiera',   color: '#1565c0' },
  operational: { icon: '\uD83D\uDCCB', label: 'Operacional',  color: '#6a1b9a' },
  data:        { icon: '\uD83D\uDD12', label: 'Datos',         color: '#00695c' }
};

class EggCarencias extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._anonVisible = false;
  }

  connectedCallback() {
    this.render();
    this._bindEvents();

    this._unsubs.push(
      Bus.on('data:changed', () => this.render())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() {
    // No long-lived resources to destroy
  }

  // ─── RENDER ───────────────────────────────────────────────

  render() {
    const D = Store.get();
    const c = VENG.census(D);

    let h = this._css();

    // Page header
    h += `<h2>\uD83D\uDD0D ${sanitizeHTML(t('nav_census'))} \u2014 VENG Census</h2>`;

    // Overall score gauge
    const oc = c.overall >= 80 ? 'var(--success, #2E7D32)' : c.overall >= 60 ? 'var(--warning, #F57F17)' : 'var(--danger, #C62828)';
    h += `<div class="card" style="border-left:4px solid ${oc}">`;
    h += `<div class="score-header">`;
    h += `<div class="score-overall"><div class="score-number" style="color:${oc}">${c.overall}</div><div class="score-label">Overall Health /100</div></div>`;
    h += `<div class="score-categories"><div class="kpi-grid">`;

    for (const [k, m] of Object.entries(CAT_META)) {
      const s = c.scores[k];
      const sc = s >= 80 ? 'var(--success, #2E7D32)' : s >= 60 ? 'var(--warning, #F57F17)' : 'var(--danger, #C62828)';
      h += `<div class="kpi-card"><div class="kpi-label">${m.icon} ${sanitizeHTML(m.label)}</div><div class="kpi-value" style="color:${sc}">${s}</div></div>`;
    }

    h += `</div></div></div>`;

    // Summary counts
    h += `<div class="badge-row">`;
    if (c.critical > 0) h += `<span class="sev-badge sev-critical">${c.critical} Critical</span>`;
    if (c.warning > 0) h += `<span class="sev-badge sev-warning">${c.warning} Warning</span>`;
    if (c.info > 0) h += `<span class="sev-badge sev-info">${c.info} Info</span>`;
    if (c.findings.length === 0) h += `<span class="sev-badge sev-success">No deficiencies detected</span>`;
    h += `</div></div>`;

    // Findings by category
    for (const [cat, m] of Object.entries(CAT_META)) {
      const items = c.findings.filter(f => f.cat === cat);
      if (items.length === 0) continue;

      h += `<div class="card" style="border-left:4px solid ${m.color}">`;
      h += `<h3>${m.icon} ${sanitizeHTML(m.label)} (${items.length})</h3>`;
      h += `<div class="table-wrap"><table><thead><tr>`;
      h += `<th style="width:80px">Severity</th><th style="width:140px">Code</th><th>Finding</th><th>Metric</th><th>Benchmark</th>`;
      h += `</tr></thead><tbody>`;

      for (const f of items) {
        const sevClass = f.sev === 'critical' ? 'sev-critical' : f.sev === 'warning' ? 'sev-warning' : 'sev-info';
        h += `<tr>`;
        h += `<td><span class="sev-badge-sm ${sevClass}">${sanitizeHTML(f.sev.toUpperCase())}</span></td>`;
        h += `<td class="code-cell">${sanitizeHTML(f.code)}</td>`;
        h += `<td>${sanitizeHTML(f.msg)}<br><small class="rec-text">\u2192 ${sanitizeHTML(f.rec)}</small></td>`;
        h += `<td class="metric-cell">${f.metric} ${sanitizeHTML(f.unit)}</td>`;
        h += `<td class="bench-cell">${f.bench} ${sanitizeHTML(f.unit)}</td>`;
        h += `</tr>`;
      }

      h += `</tbody></table></div></div>`;
    }

    // Benchmarking context
    h += `<div class="card card-primary-fill">`;
    h += `<h3>\uD83D\uDCCA Benchmark Context</h3>`;
    h += `<p class="context-text">Benchmarks are based on international poultry standards: mortality &lt;1.5%/month, FCR &lt;2.2, feed 100-140g/hen/day, margin &gt;10%, XVAL score &gt;90. `;
    h += `Scores are calculated per category: each critical finding deducts 20 points, warning 10, info 3, from a base of 100.</p></div>`;

    // Anonymized export
    h += `<div class="card">`;
    h += `<h3>\uD83D\uDCE4 Anonymized Deficiency Report</h3>`;
    h += `<p class="context-text">Export an anonymized summary of deficiency patterns. Contains NO farm names, client data, or financial figures \u2014 only deficiency codes, category scores, and farm size classification.</p>`;
    h += `<div class="btn-row">`;
    h += `<button class="btn btn-primary" data-action="export-census-anon">Export Anonymized Report (.json)</button>`;
    h += `<button class="btn btn-secondary" data-action="preview-census-anon">Preview Report</button>`;
    h += `</div>`;
    h += `<div id="census-anon-preview" class="anon-preview" style="display:none"></div>`;
    h += `</div>`;

    this.shadowRoot.innerHTML = h;
  }

  // ─── EVENTS ───────────────────────────────────────────────

  _bindEvents() {
    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();

      switch (btn.dataset.action) {
        case 'export-census-anon': this._exportCensusAnon(); break;
        case 'preview-census-anon': this._toggleCensusAnonPreview(); break;
      }
    });
  }

  // ─── EXPORT ANONYMIZED REPORT ─────────────────────────────

  _exportCensusAnon() {
    const D = Store.get();
    const c = VENG.census(D);
    const json = JSON.stringify(c.anonymized, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'egglogu_census_anon_' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    logAudit('export', 'census', 'Exported anonymized deficiency report');
  }

  // ─── PREVIEW ANONYMIZED REPORT ────────────────────────────

  _toggleCensusAnonPreview() {
    const el = this.shadowRoot.getElementById('census-anon-preview');
    if (!el) return;

    if (el.style.display !== 'none') {
      el.style.display = 'none';
      this._anonVisible = false;
      return;
    }

    const D = Store.get();
    const c = VENG.census(D);
    el.style.display = 'block';
    this._anonVisible = true;
    el.innerHTML = `<pre class="anon-pre">${sanitizeHTML(JSON.stringify(c.anonymized, null, 2))}</pre>`;
  }

  // ─── CSS ──────────────────────────────────────────────────

  _css() {
    return `<style>
      :host { display: block; }

      h2 { margin: 0 0 16px 0; color: var(--text, #212121); }
      h3 { margin: 0 0 12px 0; color: var(--text, #212121); }

      /* ── Card ── */
      .card {
        background: var(--card, #fff); border-radius: 12px; padding: 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }
      .card-primary-fill { background: var(--primary-fill, #E8F5E9); }

      /* ── Score Header ── */
      .score-header {
        display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
      }
      .score-overall { text-align: center; }
      .score-number { font-size: 48px; font-weight: 800; }
      .score-label { color: var(--text-light, #757575); font-size: 13px; }
      .score-categories { flex: 1; min-width: 200px; }

      /* ── KPI Grid ── */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;
      }
      .kpi-card {
        background: var(--card, #fff); border-radius: 8px; padding: 12px;
        text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.06);
      }
      .kpi-label { font-size: 12px; font-weight: 600; color: var(--text-light, #757575); margin-bottom: 4px; }
      .kpi-value { font-size: 24px; font-weight: 800; }

      /* ── Severity Badges ── */
      .badge-row { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
      .sev-badge {
        padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 13px;
      }
      .sev-badge-sm {
        padding: 2px 8px; border-radius: 8px; font-size: 12px; font-weight: 600;
      }
      .sev-critical { background: #ffcdd2; color: #b71c1c; }
      .sev-warning { background: #fff9c4; color: #f57f17; }
      .sev-info { background: #e3f2fd; color: #1565c0; }
      .sev-success { background: #c8e6c9; color: #2e7d32; }

      /* ── Table ── */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
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

      .code-cell { font-family: monospace; font-size: 12px; color: var(--text-light, #757575); }
      .metric-cell { font-weight: 600; text-align: center; }
      .bench-cell { text-align: center; color: var(--text-light, #757575); }
      .rec-text { color: var(--primary, #4a7c59); }

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
      .btn-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }

      /* ── Context text ── */
      .context-text { color: var(--text-secondary, #757575); font-size: 13px; margin: 0 0 8px 0; }

      /* ── Anonymized preview ── */
      .anon-preview { margin-top: 12px; }
      .anon-pre {
        background: var(--bg, #FAFAFA); border: 1px solid var(--border, #E0E0E0);
        border-radius: 8px; padding: 12px; font-size: 12px;
        overflow-x: auto; max-height: 400px; margin: 0;
      }

      /* ── Dark mode ── */
      :host-context(body.dark-mode) .card { background: #2D2D2D; }
      :host-context(body.dark-mode) .card-primary-fill { background: #1B3A1B; }
      :host-context(body.dark-mode) h2, :host-context(body.dark-mode) h3 { color: #E0E0E0; }
      :host-context(body.dark-mode) table th { color: #BDBDBD; border-color: #424242; }
      :host-context(body.dark-mode) table td { color: #E0E0E0; border-color: #424242; }
      :host-context(body.dark-mode) table tr:hover { background: #383838; }
      :host-context(body.dark-mode) .kpi-card { background: #383838; }
      :host-context(body.dark-mode) .code-cell { color: #BDBDBD; }
      :host-context(body.dark-mode) .bench-cell { color: #BDBDBD; }
      :host-context(body.dark-mode) .context-text { color: #BDBDBD; }
      :host-context(body.dark-mode) .sev-critical { background: #4E0000; color: #EF9A9A; }
      :host-context(body.dark-mode) .sev-warning { background: #4E342E; color: #FFE082; }
      :host-context(body.dark-mode) .sev-info { background: #0D47A1; color: #90CAF9; }
      :host-context(body.dark-mode) .sev-success { background: #1B5E20; color: #A5D6A7; }
      :host-context(body.dark-mode) .anon-pre { background: #383838; border-color: #555; color: #E0E0E0; }

      /* ── Responsive ── */
      @media (max-width: 768px) {
        .score-header { flex-direction: column; }
        .kpi-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
        .score-number { font-size: 36px; }
        .btn-row { flex-direction: column; }
        .btn { width: 100%; justify-content: center; }
      }
    </style>`;
  }
}

customElements.define('egg-carencias', EggCarencias);
export { EggCarencias };
