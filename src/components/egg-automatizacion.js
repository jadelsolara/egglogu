// <egg-automatizacion> — Workflow Automation Web Component
// Replaces renderAutomatizacion(), WorkflowEngine, WorkflowUI from egglogu-workflows.js

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, genId, todayStr, emptyState, DataTable, kpi, activeHens, logAudit } from '../core/index.js';
import { locale } from '../core/i18n.js';
import { getModalBody, modalVal, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

// ─── Constants ────────────────────────────────────────────
const CONDITION_TYPES = [
  'deaths_spike', 'low_production', 'feed_stock', 'vaccine_due',
  'temperature', 'payment_overdue', 'outbreak_active', 'production_target'
];

const ACTION_TYPES = ['notify', 'email', 'auto_log', 'auto_task', 'update_status'];

const COMPARATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
const COMPARATOR_LABELS = { gt: '>', gte: '\u2265', lt: '<', lte: '\u2264', eq: '=', neq: '\u2260' };

const DEFAULT_COOLDOWN = 3600000; // 1 hour in ms

// ─── 8 Preset Templates ──────────────────────────────────
const PRESETS = {
  mortality_spike: {
    name: 'wf_preset_mortality', icon: '\uD83D\uDC80',
    condition: { type: 'deaths_spike', field: 'deaths_24h', comparator: 'gt', threshold: 5 },
    actions: [
      { type: 'notify', priority: 'high', messageKey: 'wf_notify_mortality' },
      { type: 'auto_log', module: 'health', messageKey: 'wf_log_mortality' }
    ],
    cooldown: 7200000
  },
  low_production: {
    name: 'wf_preset_low_prod', icon: '\uD83D\uDCC9',
    condition: { type: 'low_production', field: 'henday_drop_pct', comparator: 'gt', threshold: 10 },
    actions: [{ type: 'notify', priority: 'medium', messageKey: 'wf_notify_low_prod' }],
    cooldown: 86400000
  },
  feed_stock_critical: {
    name: 'wf_preset_feed_stock', icon: '\uD83C\uDF3E',
    condition: { type: 'feed_stock', field: 'days_remaining', comparator: 'lt', threshold: 7 },
    actions: [
      { type: 'notify', priority: 'high', messageKey: 'wf_notify_feed_stock' },
      { type: 'auto_task', messageKey: 'wf_task_feed_stock' }
    ],
    cooldown: 86400000
  },
  vaccine_due: {
    name: 'wf_preset_vaccine', icon: '\uD83D\uDC89',
    condition: { type: 'vaccine_due', field: 'days_until', comparator: 'lte', threshold: 3 },
    actions: [{ type: 'notify', priority: 'medium', messageKey: 'wf_notify_vaccine' }],
    cooldown: 86400000
  },
  temperature_alert: {
    name: 'wf_preset_temp', icon: '\uD83C\uDF21\uFE0F',
    condition: { type: 'temperature', field: 'thi', comparator: 'gt', threshold: 28 },
    actions: [
      { type: 'notify', priority: 'high', messageKey: 'wf_notify_temp' },
      { type: 'auto_log', module: 'environment', messageKey: 'wf_log_temp' }
    ],
    cooldown: 3600000
  },
  payment_overdue: {
    name: 'wf_preset_payment', icon: '\uD83D\uDCB8',
    condition: { type: 'payment_overdue', field: 'days_overdue', comparator: 'gt', threshold: 0 },
    actions: [{ type: 'notify', priority: 'medium', messageKey: 'wf_notify_payment' }],
    cooldown: 86400000
  },
  outbreak_response: {
    name: 'wf_preset_outbreak', icon: '\uD83E\uDDA0',
    condition: { type: 'outbreak_active', field: 'active_count', comparator: 'gt', threshold: 0 },
    actions: [{ type: 'notify', priority: 'critical', messageKey: 'wf_notify_outbreak' }],
    cooldown: 3600000
  },
  production_target: {
    name: 'wf_preset_target', icon: '\uD83C\uDFAF',
    condition: { type: 'production_target', field: 'below_target_days', comparator: 'gte', threshold: 3 },
    actions: [{ type: 'notify', priority: 'medium', messageKey: 'wf_notify_target' }],
    cooldown: 86400000
  }
};

// ─── Condition Evaluators ─────────────────────────────────
const Evaluators = {

  deaths_spike(D, cond) {
    const today = todayStr();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ys = yesterday.toISOString().substring(0, 10);
    const recent = D.dailyProduction.filter(p => p.date >= ys && p.date <= today);
    const deaths = recent.reduce((s, p) => s + (p.deaths || 0), 0);
    return {
      value: deaths,
      triggered: _compare(deaths, cond.comparator, cond.threshold),
      detail: deaths + ' ' + (t('kpi_deaths') || 'deaths').toLowerCase() + ' (24h)'
    };
  },

  low_production(D, cond) {
    const today = todayStr();
    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
    const d7s = d7.toISOString().substring(0, 10);
    const d14 = new Date(); d14.setDate(d14.getDate() - 14);
    const d14s = d14.toISOString().substring(0, 10);
    const week1 = D.dailyProduction.filter(p => p.date >= d7s && p.date <= today);
    const week2 = D.dailyProduction.filter(p => p.date >= d14s && p.date < d7s);
    const avg1 = week1.length > 0 ? week1.reduce((s, p) => s + (p.eggsCollected || 0), 0) / week1.length : 0;
    const avg2 = week2.length > 0 ? week2.reduce((s, p) => s + (p.eggsCollected || 0), 0) / week2.length : 0;
    const hens = activeHens();
    const hd = hens > 0 ? (avg1 / hens * 100) : 0;
    const drop = avg2 > 0 ? ((avg2 - avg1) / avg2 * 100) : 0;
    return {
      value: drop,
      triggered: _compare(drop, cond.comparator, cond.threshold),
      detail: t('kpi_henday') + ': ' + fmtNum(hd, 1) + '% (\u2193' + fmtNum(drop, 1) + '%)'
    };
  },

  feed_stock(D, cond) {
    const totalPurch = D.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0);
    const totalCons = D.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
    const stock = totalPurch - totalCons;
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const d30s = d30.toISOString().substring(0, 10);
    const cons30 = D.feed.consumption.filter(c => c.date >= d30s).reduce((s, c) => s + (c.quantityKg || 0), 0);
    const avgDaily = cons30 / 30;
    const daysRemaining = avgDaily > 0 ? stock / avgDaily : Infinity;
    return {
      value: daysRemaining,
      triggered: daysRemaining < Infinity && _compare(daysRemaining, cond.comparator, cond.threshold),
      detail: fmtNum(stock, 0) + ' kg \u2014 ' + fmtNum(daysRemaining, 0) + ' ' + t('flock_days')
    };
  },

  vaccine_due(D, cond) {
    const today = todayStr();
    const pending = D.vaccines.filter(v => v.status !== 'applied' && v.scheduledDate);
    let minDays = Infinity;
    let nextVac = null;
    pending.forEach(v => {
      const diff = Math.round((new Date(v.scheduledDate) - new Date(today)) / 864e5);
      if (diff < minDays) { minDays = diff; nextVac = v; }
    });
    return {
      value: minDays,
      triggered: minDays < Infinity && _compare(minDays, cond.comparator, cond.threshold),
      detail: nextVac
        ? sanitizeHTML(nextVac.vaccineName || nextVac.name) + ' \u2014 ' + fmtNum(minDays) + ' ' + t('flock_days')
        : t('no_data')
    };
  },

  temperature(D, cond) {
    const recent = D.environment.slice(-3);
    if (!recent.length) return { value: 0, triggered: false, detail: t('no_data') };
    const thiVals = recent.map(e => {
      if (!e.temperature || !e.humidity) return 0;
      // THI calculation (simplified)
      const tF = e.temperature * 1.8 + 32;
      return tF - (0.55 - 0.0055 * e.humidity) * (tF - 58);
    }).filter(v => v > 0);
    const countAbove = thiVals.filter(v => _compare(v, cond.comparator, cond.threshold)).length;
    const maxThi = thiVals.length ? Math.max(...thiVals) : 0;
    return {
      value: maxThi,
      triggered: countAbove >= 2,
      detail: 'THI max: ' + fmtNum(maxThi, 1) + ' (' + countAbove + '/' + thiVals.length + ' ' + t('wf_readings_above') + ')'
    };
  },

  payment_overdue(D, cond) {
    const today = todayStr();
    const recv = D.finances.receivables || [];
    const overdue = recv.filter(r => !r.paid && r.dueDate && r.dueDate < today);
    const totalOverdue = overdue.reduce((s, r) => s + (r.amount || 0), 0);
    const maxDays = overdue.length
      ? Math.max(...overdue.map(r => Math.round((new Date(today) - new Date(r.dueDate)) / 864e5)))
      : 0;
    return {
      value: maxDays,
      triggered: overdue.length > 0 && _compare(maxDays, cond.comparator, cond.threshold),
      detail: overdue.length + ' ' + t('rpt_overdue') + ' \u2014 ' + fmtMoney(totalOverdue)
    };
  },

  outbreak_active(D, cond) {
    const active = D.outbreaks.filter(o => o.status === 'active');
    return {
      value: active.length,
      triggered: _compare(active.length, cond.comparator, cond.threshold),
      detail: active.length + ' ' + (t('out_active') || 'active').toLowerCase()
    };
  },

  production_target(D, cond) {
    const target = D.settings.dailyEggTarget || 0;
    if (!target) return { value: 0, triggered: false, detail: t('wf_no_target') };
    const today = todayStr();
    let belowDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().substring(0, 10);
      const eggs = D.dailyProduction.filter(p => p.date === ds).reduce((s, p) => s + (p.eggsCollected || 0), 0);
      if (eggs < target) belowDays++;
    }
    return {
      value: belowDays,
      triggered: _compare(belowDays, cond.comparator, cond.threshold),
      detail: belowDays + '/7 ' + t('flock_days') + ' ' + t('wf_below_target')
    };
  }
};

// ─── Action Executors ─────────────────────────────────────
const Actions = {

  notify(D, rule, evalResult) {
    const action = rule.actions.find(a => a.type === 'notify');
    const msg = t(action.messageKey || 'wf_triggered')
      .replace('{rule}', sanitizeHTML(rule.name))
      .replace('{detail}', evalResult.detail);
    if (!D._workflowAlerts) D._workflowAlerts = [];
    const priority = action.priority || 'medium';
    D._workflowAlerts.push({
      type: priority === 'critical' || priority === 'high' ? 'danger' : 'warning',
      icon: '\u26A1', msg, ruleId: rule.id, ts: new Date().toISOString()
    });
  },

  auto_log(D, rule, evalResult) {
    const action = rule.actions.find(a => a.type === 'auto_log');
    const entry = {
      id: genId(), date: todayStr(),
      time: new Date().toTimeString().substring(0, 5),
      type: 'workflow',
      notes: '[AUTO] ' + t(action.messageKey || 'wf_auto_logged') + ': ' + evalResult.detail,
      module: action.module || 'general'
    };
    if (!D.logbook) D.logbook = [];
    D.logbook.push(entry);
  },

  auto_task(D, rule, evalResult) {
    const action = rule.actions.find(a => a.type === 'auto_task');
    const item = {
      id: genId(),
      text: t(action.messageKey || 'wf_auto_task') + ': ' + evalResult.detail,
      done: false, date: todayStr(), priority: 'high',
      source: 'workflow:' + rule.id
    };
    if (!D.checklist) D.checklist = [];
    if (!D.checklist.some(c => c.source === 'workflow:' + rule.id && !c.done)) {
      D.checklist.push(item);
    }
  }
};

// ─── Helper: comparator ───────────────────────────────────
function _compare(val, comp, threshold) {
  switch (comp) {
    case 'gt':  return val > threshold;
    case 'gte': return val >= threshold;
    case 'lt':  return val < threshold;
    case 'lte': return val <= threshold;
    case 'eq':  return val === threshold;
    case 'neq': return val !== threshold;
    default:    return false;
  }
}

// ─── WorkflowEngine (exported for external use) ───────────
export const WorkflowEngine = {

  evaluate(D) {
    if (!D) D = Store.get();
    const rules = D.workflowRules || [];
    if (!rules.length) return [];

    const now = Date.now();
    const results = [];
    D._workflowAlerts = [];

    rules.filter(r => r.enabled).forEach(rule => {
      // Cooldown check
      if (rule._lastFired && (now - rule._lastFired) < (rule.cooldown || DEFAULT_COOLDOWN)) return;

      const evaluator = Evaluators[rule.condition.type];
      if (!evaluator) return;

      const evalResult = evaluator(D, rule.condition);
      if (!evalResult.triggered) return;

      // Execute actions
      rule.actions.forEach(action => {
        const executor = Actions[action.type];
        if (executor) executor(D, rule, evalResult);
      });

      rule._lastFired = now;
      results.push({
        ruleId: rule.id, ruleName: rule.name,
        triggered: true, detail: evalResult.detail, ts: new Date().toISOString()
      });

      // Log execution
      if (!D.workflowExecutions) D.workflowExecutions = [];
      D.workflowExecutions.push({
        id: genId(), ruleId: rule.id, ruleName: rule.name,
        ts: new Date().toISOString(), detail: evalResult.detail,
        actions: rule.actions.map(a => a.type)
      });
      // Keep last 500 executions
      if (D.workflowExecutions.length > 500) {
        D.workflowExecutions = D.workflowExecutions.slice(-500);
      }
    });

    return results;
  },

  getAlerts(D) {
    return (D._workflowAlerts || []).slice();
  },

  testRule(rule, D) {
    if (!D) D = Store.get();
    const evaluator = Evaluators[rule.condition.type];
    if (!evaluator) return { triggered: false, detail: t('wf_invalid_condition') };
    return evaluator(D, rule.condition);
  },

  createFromPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return null;
    return {
      id: genId(), name: t(preset.name), icon: preset.icon,
      enabled: true,
      condition: { ...preset.condition },
      actions: preset.actions.map(a => ({ ...a })),
      cooldown: preset.cooldown || DEFAULT_COOLDOWN,
      createdAt: new Date().toISOString(),
      _lastFired: 0
    };
  },

  getPresets() {
    return Object.entries(PRESETS).map(([key, p]) => ({
      key, name: t(p.name), icon: p.icon, condition: p.condition
    }));
  }
};

// ─── Auto-evaluation interval ─────────────────────────────
let _wfInterval = null;

export function startWorkflowEvaluation() {
  if (_wfInterval) clearInterval(_wfInterval);
  _wfInterval = setInterval(() => {
    const D = Store.get();
    if (!D.workflowRules || !D.workflowRules.length) return;
    const results = WorkflowEngine.evaluate(D);
    if (results.length) {
      Store.save(D);
      results.forEach(r => {
        Bus.emit('toast', { msg: 'r.ruleName + ': ' + r.detail });
      });
    }
  }, 300000); // Every 5 minutes
}

// ─── Web Component ────────────────────────────────────────
class EggAutomatizacion extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._editRuleId = null;
  }

  connectedCallback() {
    this.render();
    DataTable.handleEvent(this.shadowRoot, () => this.render());

    // Listen for modal save actions
    this._unsubs.push(
      Bus.on('modal:action', (ev) => {
        if (ev.action === 'save-wf-rule') {
          this._saveRule(this._editRuleId);
        }
      })
    );

    // Reset edit state when modal closes
    this._unsubs.push(
      Bus.on('modal:closed', () => {
        this._editRuleId = null;
      })
    );

    // Start auto-evaluation
    startWorkflowEvaluation();
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  cleanup() { /* no charts */ }

  // ─────────────── RENDER ───────────────
  render() {
    const D = Store.get();
    if (!D.workflowRules) D.workflowRules = [];
    if (!D.workflowExecutions) D.workflowExecutions = [];

    let h = this._styles();

    h += `<div class="page-header">
      <h2>${t('wf_title')}</h2>
      <button class="btn btn-primary" data-action="create-rule">${t('wf_create_rule')}</button>
    </div>`;

    h += `<div class="alert-info">${t('wf_browser_note')}</div>`;

    // KPIs
    const activeRules = D.workflowRules.filter(r => r.enabled).length;
    const totalExec = D.workflowExecutions.length;
    const last24h = D.workflowExecutions.filter(e => (Date.now() - new Date(e.ts).getTime()) < 864e5).length;
    h += `<div class="kpi-grid">
      ${kpi(t('wf_active_rules'), fmtNum(activeRules), fmtNum(D.workflowRules.length) + ' ' + t('total'))}
      ${kpi(t('wf_executions'), fmtNum(totalExec), t('wf_last_24h') + ': ' + fmtNum(last24h))}
    </div>`;

    // Preset buttons
    h += `<div class="card"><h3>${t('wf_presets')}</h3><div class="preset-grid">`;
    Object.entries(PRESETS).forEach(([key, p]) => {
      const exists = D.workflowRules.some(r => r.condition.type === p.condition.type);
      h += `<button class="btn ${exists ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="add-preset" data-preset="${escapeAttr(key)}" ${exists ? 'disabled' : ''}>
        ${t(p.name)}${exists ? ' \u2713' : ''}
      </button>`;
    });
    h += '</div></div>';

    // Rules table
    if (D.workflowRules.length) {
      h += DataTable.create({
        id: 'workflowRules',
        data: D.workflowRules,
        emptyIcon: '',
        emptyText: t('no_data'),
        headerHtml: `<h3>${t('wf_rules')}</h3>`,
        columns: [
          {
            key: 'icon', label: '', type: 'text', width: '40px',
            render: r => ''
          },
          {
            key: 'name', label: t('name'), type: 'text', sortable: true, filterable: true,
            render: r => '<strong>' + sanitizeHTML(r.name) + '</strong>'
          },
          {
            key: 'condition.type', label: t('wf_condition'), type: 'text',
            sortable: true, filterable: true, filterType: 'select',
            filterOptions: CONDITION_TYPES.map(c => ({ value: c, label: t('wf_cond_' + c) })),
            getValue: r => r.condition.type,
            render: r => t('wf_cond_' + r.condition.type) + ' '
              + (COMPARATOR_LABELS[r.condition.comparator] || '') + ' ' + r.condition.threshold
          },
          {
            key: 'actions', label: t('actions'), type: 'text',
            render: r => r.actions.map(a =>
              '<span class="badge badge-info">' + t('wf_act_' + a.type) + '</span>'
            ).join(' ')
          },
          {
            key: 'enabled', label: t('status'), type: 'text',
            sortable: true, filterable: true, filterType: 'select',
            filterOptions: [
              { value: 'true', label: t('active') },
              { value: 'false', label: t('inactive') }
            ],
            getValue: r => String(!!r.enabled),
            render: r => `<label class="switch"><input type="checkbox" ${r.enabled ? 'checked' : ''} data-action="toggle-rule" data-id="${escapeAttr(r.id)}"><span class="slider"></span></label>`
          },
          {
            key: '_lastFired', label: t('wf_last_fired'), type: 'text', sortable: true,
            getValue: r => r._lastFired || 0,
            render: r => r._lastFired
              ? '<span style="font-size:11px">' + new Date(r._lastFired).toLocaleString(locale()) + '</span>'
              : '-'
          }
        ],
        actions: r => `<div class="btn-group">
          <button class="btn btn-secondary btn-sm" data-action="test-rule" data-id="${escapeAttr(r.id)}" title="${t('wf_test')}">\uD83E\uDDEA</button>
          <button class="btn btn-secondary btn-sm" data-action="edit-rule" data-id="${escapeAttr(r.id)}">${t('edit')}</button>
          <button class="btn btn-danger btn-sm" data-action="delete-rule" data-id="${escapeAttr(r.id)}">${t('delete')}</button>
        </div>`,
        bulkActions: [{
          label: t('delete'), danger: true,
          action: ids => this._bulkDeleteRules(ids)
        }]
      });
    } else {
      h += emptyState('', t('wf_no_rules'), t('wf_create_rule'));
    }

    // Execution log
    if (D.workflowExecutions.length) {
      const recentExec = [...D.workflowExecutions].reverse().slice(0, 50);
      h += DataTable.create({
        id: 'workflowExec',
        data: recentExec,
        emptyIcon: '',
        emptyText: t('no_data'),
        headerHtml: `<h3>${t('wf_execution_log')}</h3>`,
        showExport: true,
        columns: [
          {
            key: 'ts', label: t('date'), type: 'date', sortable: true,
            getValue: r => (r.ts || '').substring(0, 10),
            render: r => '<span style="font-size:12px;white-space:nowrap">'
              + (r.ts || '').replace('T', ' ').substring(0, 19) + '</span>'
          },
          {
            key: 'ruleName', label: t('wf_rule'), type: 'text',
            sortable: true, filterable: true,
            render: r => sanitizeHTML(r.ruleName)
          },
          {
            key: 'detail', label: t('wf_detail'), type: 'text',
            render: r => '<span style="font-size:12px">' + sanitizeHTML(r.detail) + '</span>'
          },
          {
            key: 'actions', label: t('actions'), type: 'text',
            render: r => (r.actions || []).map(a =>
              '<span class="badge badge-info">' + t('wf_act_' + a) + '</span>'
            ).join(' ')
          }
        ]
      });
    }

    this.shadowRoot.innerHTML = h;
    this._bindActions();
  }

  // ─────────────── STYLES ───────────────
  _styles() {
    return `<style>
      :host { display: block; }
      .page-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px; flex-wrap: wrap; gap: 8px;
      }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }

      /* Buttons */
      .btn {
        padding: 8px 16px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); background: var(--bg, #fff);
        cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity .2s;
      }
      .btn:hover { opacity: 0.85; }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: var(--primary, #4a7c59); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #C62828); color: #fff; border: none; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }

      /* Alert info banner */
      .alert-info {
        margin-bottom: 1rem; padding: .75rem 1rem; border-radius: 8px;
        background: var(--primary-bg, #e8f4fd); border: 1px solid var(--primary, #1976d2);
        font-size: .9rem;
      }

      /* KPI grid */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 12px; margin-bottom: 16px;
      }
      .kpi-card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative;
      }
      .kpi-label { font-size: 12px; color: var(--text-light, #757575); margin-bottom: 4px; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #212121); }
      .kpi-sub { font-size: 12px; color: var(--text-light, #757575); margin-top: 2px; }

      /* Badges */
      .badge {
        display: inline-block; padding: 2px 10px; border-radius: 12px;
        font-size: 12px; font-weight: 600; margin: 1px;
      }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .badge-warning { background: #fff8e1; color: #e65100; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-secondary { background: #f5f5f5; color: #757575; }
      .badge-danger { background: #ffebee; color: #c62828; }

      /* Card */
      .card {
        background: var(--bg, #fff); border-radius: var(--radius, 8px);
        padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }
      .card h3 { margin: 0 0 12px; color: var(--text, #212121); font-size: 16px; }

      /* Preset grid */
      .preset-grid { display: flex; flex-wrap: wrap; gap: 8px; }

      /* Toggle switch */
      .switch {
        position: relative; display: inline-block; width: 40px; height: 22px; margin: 0;
      }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
        background: #ccc; border-radius: 22px; transition: .3s;
      }
      .slider::before {
        content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px;
        background: #fff; border-radius: 50%; transition: .3s;
      }
      .switch input:checked + .slider { background: var(--primary, #4a7c59); }
      .switch input:checked + .slider::before { transform: translateX(18px); }

      /* Empty state */
      .empty-state { text-align: center; padding: 32px 16px; color: var(--text-light, #757575); }
      .empty-icon { font-size: 48px; margin-bottom: 8px; }

      /* Table */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }

      /* DataTable extras */
      .dt-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .dt-toolbar-right { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .dt-search-input {
        padding: 6px 12px; border: 1px solid var(--border, #e0e0e0);
        border-radius: var(--radius, 8px); font-size: 13px; min-width: 180px;
        background: var(--bg, #fff); color: var(--text, #212121);
      }
      .dt-filter-select, .dt-filter-input, .dt-filter-date, .dt-filter-num {
        width: 100%; padding: 4px 6px; border: 1px solid var(--border, #e0e0e0);
        border-radius: 6px; font-size: 12px; box-sizing: border-box;
        background: var(--bg, #fff); color: var(--text, #212121);
      }
      .dt-filter-row td { padding: 4px 6px; }
      .dt-card-wrap { position: relative; }
      .dt-table-desktop { display: block; }
      .dt-mobile-cards { display: none; }
      .dt-row-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-bulk-bar {
        display: flex; align-items: center; justify-content: space-between;
        background: var(--primary-fill, rgba(74,124,89,.08)); padding: 8px 12px;
        border-radius: var(--radius, 8px); margin-bottom: 8px; flex-wrap: wrap; gap: 8px;
      }
      .dt-bulk-count { font-weight: 600; font-size: 13px; }
      .dt-bulk-actions { display: flex; gap: 6px; }
      .dt-pagination {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 0; flex-wrap: wrap; gap: 8px; font-size: 13px;
      }
      .dt-page-buttons { display: flex; gap: 4px; }
      .dt-page-size { padding: 4px 8px; border: 1px solid var(--border, #e0e0e0); border-radius: 6px; font-size: 12px; background: var(--bg, #fff); }
      .dt-footer-info { font-size: 13px; color: var(--text-light, #757575); padding: 8px 0; }
      .dt-sortable { cursor: pointer; user-select: none; }
      .dt-sorted { color: var(--primary, #4a7c59); }
      .dt-col-picker-wrap { position: relative; }
      .dt-column-picker {
        position: absolute; right: 0; top: 100%; background: var(--bg, #fff);
        border: 1px solid var(--border, #e0e0e0); border-radius: 8px;
        padding: 8px; z-index: 100; min-width: 180px;
        box-shadow: 0 4px 12px rgba(0,0,0,.15);
      }
      .dt-col-option { display: block; padding: 4px 8px; font-size: 13px; cursor: pointer; }
      .dt-card { background: var(--bg, #fff); border-radius: 8px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .dt-card-selected { background: var(--primary-fill, rgba(74,124,89,.08)); }
      .dt-card-title { font-weight: 700; margin-bottom: 6px; }
      .dt-card-field { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
      .dt-card-label { color: var(--text-light, #757575); }
      .dt-card-actions { margin-top: 8px; display: flex; gap: 6px; }
      .dt-card-check { margin-bottom: 6px; }
      .dt-th-check, .dt-td-check { width: 36px; text-align: center; }

      @media (max-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 768px) {
        .dt-table-desktop { display: none; }
        .dt-mobile-cards { display: block; }
      }
    </style>`;
  }

  // ─────────────── ACTION BINDING ───────────────
  _bindActions() {
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'create-rule':
          this._showRuleForm(null);
          break;
        case 'add-preset':
          this._addPreset(btn.dataset.preset);
          break;
        case 'edit-rule':
          this._showRuleForm(btn.dataset.id);
          break;
        case 'delete-rule':
          this._deleteRule(btn.dataset.id);
          break;
        case 'test-rule':
          this._testRule(btn.dataset.id);
          break;
      }
    });

    // Handle toggle switches via change event
    root.addEventListener('change', (e) => {
      const toggle = e.target.closest('[data-action="toggle-rule"]');
      if (!toggle) return;
      this._toggleRule(toggle.dataset.id, toggle.checked);
    });

    // Handle empty-state button click
    const emptyBtn = root.querySelector('.empty-state .btn');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', () => this._showRuleForm(null));
    }
  }

  // ─────────────── ADD PRESET ───────────────
  _addPreset(key) {
    const rule = WorkflowEngine.createFromPreset(key);
    if (!rule) return;
    const D = Store.get();
    if (!D.workflowRules) D.workflowRules = [];
    D.workflowRules.push(rule);
    Store.save(D);
    logAudit('wf_preset_added', { preset: key, ruleId: rule.id });
    Bus.emit('toast', { msg: t('wf_rule_added') + ': ' + rule.name });
    this.render();
  }

  // ─────────────── TOGGLE RULE ───────────────
  _toggleRule(id, enabled) {
    const D = Store.get();
    const rule = (D.workflowRules || []).find(r => r.id === id);
    if (rule) {
      rule.enabled = enabled;
      Store.save(D);
      logAudit('wf_rule_toggled', { ruleId: id, enabled });
    }
  }

  // ─────────────── DELETE RULE ───────────────
  async _deleteRule(id) {
    const ok = await showConfirm(t('confirm_delete'));
    if (!ok) return;
    const D = Store.get();
    D.workflowRules = (D.workflowRules || []).filter(r => r.id !== id);
    Store.save(D);
    logAudit('wf_rule_deleted', { ruleId: id });
    Bus.emit('toast', { msg: t('deleted') || t('saved') });
    this.render();
  }

  // ─────────────── BULK DELETE ───────────────
  async _bulkDeleteRules(ids) {
    const ok = await showConfirm(t('confirm_delete'));
    if (!ok) return;
    const D = Store.get();
    D.workflowRules = D.workflowRules.filter(r => !ids.includes(r.id));
    Store.save(D);
    logAudit('wf_rules_bulk_deleted', { count: ids.length });
    this.render();
  }

  // ─────────────── TEST RULE ───────────────
  _testRule(id) {
    const D = Store.get();
    const rule = (D.workflowRules || []).find(r => r.id === id);
    if (!rule) return;
    const result = WorkflowEngine.testRule(rule, D);
    const msg = result.triggered
      ? '' + t('wf_would_trigger') + ': ' + result.detail
      : '\u2139\uFE0F ' + t('wf_would_not_trigger') + ': ' + result.detail;
    Bus.emit('toast', { msg });
  }

  // ─────────────── SHOW RULE FORM (modal) ───────────────
  _showRuleForm(id) {
    const D = Store.get();
    const rule = id ? (D.workflowRules || []).find(r => r.id === id) : null;
    this._editRuleId = id || '';

    const isEdit = !!rule;
    const r = rule || {
      id: genId(), name: '', icon: '\u26A1', enabled: true,
      condition: { type: 'deaths_spike', comparator: 'gt', threshold: 5 },
      actions: [{ type: 'notify', priority: 'medium', messageKey: 'wf_triggered' }],
      cooldown: DEFAULT_COOLDOWN
    };

    // Build action rows HTML
    const actionRowsHtml = r.actions.map((a, i) => this._actionRowHtml(a, i)).join('');

    const body = `
<div class="form-group">
  <label>${t('name')}</label>
  <input type="text" id="wf-name" class="form-control" value="${escapeAttr(r.name)}" placeholder="${t('wf_rule_name')}">
</div>
<div class="form-group">
  <label>${t('wf_condition')}</label>
  <select id="wf-cond-type" class="form-control">
    ${CONDITION_TYPES.map(c => `<option value="${c}" ${r.condition.type === c ? 'selected' : ''}>${t('wf_cond_' + c)}</option>`).join('')}
  </select>
</div>
<div class="form-row" style="display:flex;gap:8px;margin-bottom:12px">
  <div style="flex:1">
    <label>${t('wf_comparator')}</label>
    <select id="wf-cond-comp" class="form-control">
      ${COMPARATORS.map(c => `<option value="${c}" ${r.condition.comparator === c ? 'selected' : ''}>${COMPARATOR_LABELS[c]}</option>`).join('')}
    </select>
  </div>
  <div style="flex:1">
    <label>${t('wf_threshold')}</label>
    <input type="number" id="wf-cond-threshold" class="form-control" value="${r.condition.threshold}" step="any">
  </div>
</div>
<div class="form-group">
  <label>${t('actions')}</label>
  <div id="wf-actions">${actionRowsHtml}</div>
  <button class="btn btn-secondary btn-sm" data-action="add-wf-action" style="margin-top:4px">+ ${t('wf_add_action')}</button>
</div>
<div class="form-group">
  <label>${t('wf_cooldown')} (${t('wf_hours')})</label>
  <input type="number" id="wf-cooldown" class="form-control" value="${Math.round((r.cooldown || DEFAULT_COOLDOWN) / 3600000)}" min="1" max="168">
</div>`;

    Bus.emit('modal:open', {
      title: isEdit ? t('edit') : t('wf_create_rule'),
      body,
      actions: [
        { label: t('save'), cls: 'btn-primary', action: 'save-wf-rule' }
      ]
    });

    // Bind the "add action" button inside the modal after it opens
    setTimeout(() => {
      const modalBody = getModalBody();
      if (!modalBody) return;
      const addBtn = modalBody.querySelector('[data-action="add-wf-action"]');
      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this._addActionRow();
        });
      }
      // Bind remove buttons for action rows
      this._bindActionRowRemoves();
    }, 100);
  }

  _actionRowHtml(action, index) {
    return `<div style="display:flex;gap:8px;margin-bottom:4px;align-items:center" data-wf-action="${index}">
      <select class="form-control wf-action-type" style="flex:2">
        ${ACTION_TYPES.map(a => `<option value="${a}" ${action.type === a ? 'selected' : ''}>${t('wf_act_' + a)}</option>`).join('')}
      </select>
      <select class="form-control wf-action-priority" style="flex:1">
        <option value="low" ${action.priority === 'low' ? 'selected' : ''}>Low</option>
        <option value="medium" ${action.priority === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="high" ${action.priority === 'high' ? 'selected' : ''}>High</option>
        <option value="critical" ${action.priority === 'critical' ? 'selected' : ''}>Critical</option>
      </select>
      <button class="btn btn-danger btn-sm wf-remove-action">\u2715</button>
    </div>`;
  }

  _addActionRow() {
    const modalBody = getModalBody();
    if (!modalBody) return;
    const container = modalBody.querySelector('#wf-actions');
    if (!container) return;
    const idx = container.children.length;
    const div = document.createElement('div');
    div.innerHTML = this._actionRowHtml({ type: 'notify', priority: 'medium' }, idx);
    const row = div.firstElementChild;
    container.appendChild(row);
    // Bind remove button
    const removeBtn = row.querySelector('.wf-remove-action');
    if (removeBtn) removeBtn.addEventListener('click', () => row.remove());
  }

  _bindActionRowRemoves() {
    const modalBody = getModalBody();
    if (!modalBody) return;
    modalBody.querySelectorAll('.wf-remove-action').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('[data-wf-action]').remove());
    });
  }

  // ─────────────── SAVE RULE ───────────────
  _saveRule(editId) {
    const name = modalVal('wf-name') || t('wf_unnamed_rule');
    const condType = modalVal('wf-cond-type');
    const condComp = modalVal('wf-cond-comp');
    const condThreshold = parseFloat(modalVal('wf-cond-threshold')) || 0;
    const cooldownHours = parseInt(modalVal('wf-cooldown')) || 1;

    // Collect actions from modal
    const modalBody = getModalBody();
    const actionEls = modalBody ? modalBody.querySelectorAll('[data-wf-action]') : [];
    const actions = [];
    actionEls.forEach(el => {
      const typeEl = el.querySelector('.wf-action-type');
      const priorityEl = el.querySelector('.wf-action-priority');
      if (typeEl) {
        actions.push({
          type: typeEl.value,
          priority: priorityEl ? priorityEl.value : 'medium',
          messageKey: 'wf_triggered'
        });
      }
    });
    if (!actions.length) {
      actions.push({ type: 'notify', priority: 'medium', messageKey: 'wf_triggered' });
    }

    const D = Store.get();
    if (!D.workflowRules) D.workflowRules = [];

    const isEdit = !!editId && D.workflowRules.some(r => r.id === editId);

    if (isEdit) {
      const rule = D.workflowRules.find(r => r.id === editId);
      if (rule) {
        rule.name = name;
        rule.condition = { type: condType, comparator: condComp, threshold: condThreshold };
        rule.actions = actions;
        rule.cooldown = cooldownHours * 3600000;
      }
    } else {
      D.workflowRules.push({
        id: editId || genId(),
        name, icon: '\u26A1', enabled: true,
        condition: { type: condType, comparator: condComp, threshold: condThreshold },
        actions,
        cooldown: cooldownHours * 3600000,
        createdAt: new Date().toISOString(),
        _lastFired: 0
      });
    }

    Store.save(D);
    logAudit(isEdit ? 'wf_rule_updated' : 'wf_rule_created', { name });
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: t('saved') });
    this.render();
  }
}

customElements.define('egg-automatizacion', EggAutomatizacion);
export { EggAutomatizacion };
