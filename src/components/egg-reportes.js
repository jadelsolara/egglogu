// EGGlogU — Reports Web Component
// Generates printable/exportable reports for production, finances, health, feed, KPI trends
// Supports: daily/weekly/monthly/custom date range, CSV/Excel/PDF export, charts

import { Bus } from '../core/bus.js';
import { Store } from '../core/store.js';
import { t, locale } from '../core/i18n.js';
import { escapeAttr, todayStr, emptyState } from '../core/utils.js';
import { ReportTemplates, KPICards, PERIODS, THEMES, _dateRange, _trendArrow, themeColor, themeRgba } from './egg-report-templates.js';

/* ── Constants ─────────────────────────────────────────────── */
const TEMPLATES = ['production', 'financial', 'health', 'feed', 'kpi', 'flock', 'stats'];

/* ── Download / CSV helpers ────────────────────────────────── */
function _downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function _csvEscape(s) {
  const str = String(s == null ? '' : s);
  return str.includes(',') || str.includes('"') || str.includes('\n') ? '"' + str.replace(/"/g, '""') + '"' : str;
}

/* ── Report Engine ────────────────────────────────────────── */
const ReportEngine = {

  generate(template, params) {
    params = params || {};
    const D = Store.get();
    const period = params.period || '30d';
    let range;
    if (period === 'custom' && params.startDate && params.endDate) {
      range = { start: params.startDate, end: params.endDate };
    } else {
      const pd = PERIODS.find(p => p.key === period) || PERIODS[1];
      range = _dateRange(pd.days);
    }

    if (!ReportTemplates[template]) return { html: emptyState('', t('rpt_invalid_template')), charts: {}, data: {} };
    const result = ReportTemplates[template](D, range);
    return { ...result, template, period, range, generatedAt: new Date().toISOString() };
  },

  renderCharts(chartCfg, root) {
    if (!chartCfg || typeof Chart === 'undefined') return;
    const charts = {};
    Object.keys(chartCfg).forEach(key => {
      const cfg = chartCfg[key];
      if (!cfg) return;
      const el = root.getElementById(cfg.el) || root.querySelector('#' + cfg.el);
      if (!el) return;
      const opts = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false } };
      if (cfg.scales) opts.scales = cfg.scales;
      if (cfg.options) Object.assign(opts, cfg.options);
      if (cfg.type === 'doughnut' || cfg.type === 'pie') {
        delete opts.scales;
        opts.plugins = { legend: { position: 'right' } };
      }
      charts['rpt_' + key] = new Chart(el, { type: cfg.type, data: { labels: cfg.labels, datasets: cfg.datasets }, options: opts });
    });
    return charts;
  },

  exportCSV(result) {
    if (!result || !result.csvRows || !result.csvRows.length) return;
    const csv = result.csvRows.map(row => row.map(v => _csvEscape(v)).join(',')).join('\n');
    _downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'egglogu_' + result.template + '_' + todayStr() + '.csv');
    Bus.emit('toast', { msg: t('cfg_exported') });
  },

  exportExcel(result) {
    if (!result || !result.csvRows || !result.csvRows.length) return;
    if (typeof XLSX === 'undefined') {
      Bus.emit('toast', { msg: t('rpt_xlsx_missing') || 'Excel export requires SheetJS', type: 'error' });
      return;
    }
    try {
      const ws = XLSX.utils.aoa_to_sheet(result.csvRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, result.template || 'Report');
      XLSX.writeFile(wb, 'egglogu_' + result.template + '_' + todayStr() + '.xlsx');
      Bus.emit('toast', { msg: t('cfg_exported') });
    } catch (e) {
      Bus.emit('toast', { msg: t('rpt_xlsx_missing') || 'Excel export error', type: 'error' });
    }
  },

  async exportPDF(containerEl) {
    if (!containerEl) return;
    try {
      if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        Bus.emit('toast', { msg: t('rpt_pdf_error') || 'PDF libraries not loaded', type: 'error' });
        return;
      }
      const canvas = await html2canvas(containerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth() - 20;
      const h = canvas.height * w / canvas.width;
      let yPos = 10;
      pdf.setFontSize(16);
      pdf.text('EGGlogU -- ' + t('rpt_report'), 10, yPos);
      yPos += 8;
      pdf.setFontSize(10);
      pdf.text((t('rpt_generated') || 'Generated') + ': ' + new Date().toLocaleString(locale()), 10, yPos);
      yPos += 10;
      const pageH = pdf.internal.pageSize.getHeight() - 20;
      if (h <= pageH - yPos) {
        pdf.addImage(imgData, 'PNG', 10, yPos, w, h);
      } else {
        let remaining = h;
        let srcY = 0;
        while (remaining > 0) {
          const sliceH = Math.min(remaining, pageH - yPos);
          const sliceRatio = sliceH / h;
          const srcH = canvas.height * sliceRatio;
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = canvas.width;
          tmpCanvas.height = srcH;
          const ctx = tmpCanvas.getContext('2d');
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
          pdf.addImage(tmpCanvas.toDataURL('image/png'), 'PNG', 10, yPos, w, sliceH);
          remaining -= sliceH;
          srcY += srcH;
          if (remaining > 0) { pdf.addPage(); yPos = 10; }
        }
      }
      pdf.save('egglogu_report_' + todayStr() + '.pdf');
      Bus.emit('toast', { msg: t('cfg_exported') });
    } catch (e) {
      console.error('PDF export error:', e);
      Bus.emit('toast', { msg: t('rpt_pdf_error') || 'PDF export error', type: 'error' });
    }
  }
};

/* ── Styles ────────────────────────────────────────────────── */
function baseStyle() {
  return `<style>
    :host { display: block; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
    .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; transition: opacity .15s; }
    .btn:hover { opacity: 0.85; }
    .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
    .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
    .btn-sm { padding: 6px 12px; font-size: 13px; }
    .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }
    .form-control { padding: 8px 12px; border: 1px solid var(--border, #ddd); border-radius: var(--radius, 8px); font-size: 14px; background: var(--bg, #fff); color: var(--text, #333); }
    .form-control:focus { outline: none; border-color: var(--primary, #1A3C6E); box-shadow: 0 0 0 3px rgba(26,60,110,.12); }
    .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
    .card h3, .card h4 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .kpi-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative; }
    .kpi-card.danger { border-left: 4px solid var(--danger, #dc3545); }
    .kpi-card.warning { border-left: 4px solid var(--warning, #ffc107); }
    .kpi-card.accent { border-left: 4px solid var(--accent, #FF8F00); }
    .kpi-card.secondary { border-left: 4px solid var(--secondary, #6c757d); }
    .kpi-label { font-size: 12px; color: var(--text-light, #888); text-transform: uppercase; }
    .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #333); }
    .kpi-sub { font-size: 12px; color: var(--text-light, #888); margin-top: 4px; }
    .chart-container { position: relative; height: 300px; }
    .table, table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
    th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
    .rpt-section { margin-bottom: 24px; }
    .rpt-section h3 { margin: 0 0 8px; color: var(--primary-dark, #0E2240); }
    .rpt-subtitle { font-size: 13px; color: var(--text-light, #888); margin: 0 0 16px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .toolbar-group { display: flex; flex-direction: column; gap: 2px; }
    .toolbar-label { font-size: 12px; color: var(--text-light, #888); }
    .toolbar-actions { margin-left: auto; display: flex; gap: 8px; }
    .empty-state { text-align: center; padding: 40px 20px; color: var(--text-light, #888); }
    .empty-state .empty-icon { font-size: 48px; margin-bottom: 8px; }
    .empty-state .empty-msg { font-size: 14px; }
    @media (max-width: 900px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 600px) {
      .toolbar { flex-direction: column; align-items: stretch; }
      .toolbar-actions { margin-left: 0; justify-content: flex-end; }
    }
    @media print {
      .toolbar, .btn { display: none !important; }
      .card { box-shadow: none; border: 1px solid #ddd; break-inside: avoid; }
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

/* ── Web Component ─────────────────────────────────────────── */
class EggReportes extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._charts = {};
    this._lastResult = null;
    this._unsubs = [];
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('data:changed', () => this._refresh()),
      Bus.on('lang:changed', () => this.render())
    );
  }

  disconnectedCallback() {
    this.cleanup();
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  render() {
    const D = Store.get();
    const state = D.settings._reportState || { template: 'production', period: '30d' };

    let h = baseStyle();
    h += `<div class="page-header"><h2>${t('rpt_title')}</h2></div>`;

    // Toolbar
    h += `<div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="toolbar-label">${t('rpt_template')}</span>
          <select id="rpt-template" class="form-control" data-action="change-template" style="min-width:180px">
            ${TEMPLATES.map(tpl => `<option value="${escapeAttr(tpl)}" ${tpl === state.template ? 'selected' : ''}>${t('rpt_tpl_' + tpl)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-label">${t('rpt_period')}</span>
          <select id="rpt-period" class="form-control" data-action="change-period" style="min-width:140px">
            ${PERIODS.map(p => `<option value="${escapeAttr(p.key)}" ${p.key === state.period ? 'selected' : ''}>${t('rpt_period_' + p.key)}</option>`).join('')}
          </select>
        </div>
        <div id="rpt-custom-range" style="display:${state.period === 'custom' ? 'flex' : 'none'};gap:8px;align-items:flex-end">
          <input type="date" id="rpt-start" class="form-control" data-action="change-custom" value="${escapeAttr(state.startDate || '')}" style="width:150px">
          <span style="padding-bottom:8px">--</span>
          <input type="date" id="rpt-end" class="form-control" data-action="change-custom" value="${escapeAttr(state.endDate || '')}" style="width:150px">
        </div>
        <div class="toolbar-actions">
          <button class="btn btn-secondary btn-sm" data-action="export-csv" title="CSV">CSV</button>
          <button class="btn btn-secondary btn-sm" data-action="export-excel" title="Excel">Excel</button>
          <button class="btn btn-primary btn-sm" data-action="export-pdf" title="PDF">PDF</button>
        </div>
      </div>
    </div>`;

    h += `<div id="rpt-content"></div>`;

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
    this._refresh();
  }

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'export-csv': this._exportCSV(); break;
        case 'export-excel': this._exportExcel(); break;
        case 'export-pdf': this._exportPDF(); break;
      }
    });

    root.addEventListener('change', (e) => {
      const el = e.target;
      const action = el.dataset.action;
      if (!action) return;
      switch (action) {
        case 'change-template': this._changeTemplate(el.value); break;
        case 'change-period': this._changePeriod(el.value); break;
        case 'change-custom': this._refresh(); break;
      }
    });
  }

  _changeTemplate(tpl) {
    const D = Store.get();
    if (!D.settings._reportState) D.settings._reportState = {};
    D.settings._reportState.template = tpl;
    Store.save(D, 'reportes:template');
    this._refresh();
  }

  _changePeriod(period) {
    const D = Store.get();
    if (!D.settings._reportState) D.settings._reportState = {};
    D.settings._reportState.period = period;
    Store.save(D, 'reportes:period');
    const el = this.shadowRoot.getElementById('rpt-custom-range');
    if (el) el.style.display = period === 'custom' ? 'flex' : 'none';
    if (period !== 'custom') this._refresh();
  }

  _refresh() {
    const root = this.shadowRoot;
    const tplSel = root.getElementById('rpt-template');
    const perSel = root.getElementById('rpt-period');
    if (!tplSel || !perSel) return;

    const template = tplSel.value;
    const period = perSel.value;
    const params = { period };
    if (period === 'custom') {
      params.startDate = (root.getElementById('rpt-start') || {}).value || '';
      params.endDate = (root.getElementById('rpt-end') || {}).value || '';
      if (!params.startDate || !params.endDate) return;
    }

    // Destroy previous charts
    this._destroyCharts();

    const result = ReportEngine.generate(template, params);
    this._lastResult = result;

    const el = root.getElementById('rpt-content');
    if (el) el.innerHTML = result.html;

    // Render charts after DOM update
    setTimeout(() => {
      this._charts = ReportEngine.renderCharts(result.charts, root) || {};
    }, 50);
  }

  _exportCSV() {
    if (this._lastResult) ReportEngine.exportCSV(this._lastResult);
  }

  _exportExcel() {
    if (this._lastResult) ReportEngine.exportExcel(this._lastResult);
  }

  _exportPDF() {
    const el = this.shadowRoot.getElementById('rpt-content');
    if (el) ReportEngine.exportPDF(el);
  }

  _destroyCharts() {
    Object.keys(this._charts).forEach(k => {
      try { this._charts[k].destroy(); } catch (e) { /* ignore */ }
    });
    this._charts = {};
  }

  cleanup() {
    this._destroyCharts();
    this._lastResult = null;
  }
}

customElements.define('egg-reportes', EggReportes);
export { EggReportes, ReportEngine, KPICards };
