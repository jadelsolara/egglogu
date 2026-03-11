// EGGlogU — Financial Statements Module (P&L / Income Statement)
// Pure JS module — exports render functions returning HTML strings
// Used by egg-finances.js — NO web component, NO shadow DOM

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, kpi, currency, emptyState } from '../core/index.js';
import { activeOnly } from '../core/utils.js';

// ─── Helpers ────────────────────────────────────────────────

function _cur() { return currency(); }

function _today() { return new Date(todayStr() + 'T12:00:00'); }

/**
 * Get period start and end dates based on period key.
 * Returns { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
 */
function _periodRange(period) {
  const now = _today();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based

  switch (period) {
    case 'thisMonth': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { start: _dateStr(start), end: _dateStr(end) };
    }
    case 'lastMonth': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: _dateStr(start), end: _dateStr(end) };
    }
    case 'thisQuarter': {
      const qStart = Math.floor(m / 3) * 3;
      const start = new Date(y, qStart, 1);
      const end = new Date(y, qStart + 3, 0);
      return { start: _dateStr(start), end: _dateStr(end) };
    }
    case 'ytd': {
      const start = new Date(y, 0, 1);
      return { start: _dateStr(start), end: todayStr() };
    }
    case 'all':
    default:
      return { start: '1900-01-01', end: '2999-12-31' };
  }
}

function _dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _periodLabel(period) {
  const labels = {
    'thisMonth': t('this_month') || 'This Month',
    'lastMonth': t('last_month') || 'Last Month',
    'thisQuarter': t('this_quarter') || 'This Quarter',
    'ytd': t('ytd') || 'Year to Date',
    'all': t('all_time') || 'All Time'
  };
  return labels[period] || period;
}

function _inRange(dateStr, start, end) {
  if (!dateStr) return false;
  return dateStr >= start && dateStr <= end;
}

// ─── Statement line renderers ───────────────────────────────

function _statRow(label, amount, c, opts = {}) {
  const { bold, indent, negative, cls } = opts;
  const style = [];
  if (bold) style.push('font-weight:700');
  if (indent) style.push('padding-left:' + (indent * 20) + 'px');
  if (amount < 0 || negative) style.push('color:#c62828');
  const extraCls = cls ? ' ' + cls : '';

  return '<div class="stat-row' + extraCls + '" style="' + style.join(';') + '">'
    + '<span class="stat-label">' + sanitizeHTML(label) + '</span>'
    + '<span class="stat-value">' + fmtMoney(amount, c) + '</span>'
    + '</div>';
}

function _sectionHeader(title) {
  return '<h3 style="margin:20px 0 8px;padding-bottom:6px;border-bottom:2px solid var(--border,#e0e0e0);color:var(--primary-dark,#0E2240);font-size:15px">'
    + sanitizeHTML(title) + '</h3>';
}

function _subtotalRow(label, amount, c) {
  return _statRow(label, amount, c, { bold: true });
}

function _marginRow(label, pct) {
  const color = pct >= 0 ? '#2e7d32' : '#c62828';
  return '<div class="stat-row" style="font-style:italic;color:' + color + '">'
    + '<span class="stat-label">' + sanitizeHTML(label) + '</span>'
    + '<span class="stat-value">' + fmtNum(pct, 1) + '%</span>'
    + '</div>';
}

function _dividerRow() {
  return '<div style="border-top:2px solid var(--primary-dark,#0E2240);margin:12px 0"></div>';
}

// ═════════════════════════════════════════════════════════════
// renderPnL — Profit & Loss Statement
// ═════════════════════════════════════════════════════════════

export function renderPnL(D, period) {
  period = period || 'thisMonth';
  const c = _cur();
  const fin = D.finances || {};
  const settings = D.settings || D.farm || {};
  const { start, end } = _periodRange(period);

  const incomeActive = activeOnly(fin.income).filter(i => _inRange(i.date, start, end));
  const expensesActive = activeOnly(fin.expenses).filter(e => _inRange(e.date, start, end));

  let h = '';

  // Period selector tabs
  h += '<div class="card">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">';
  h += '<h3 style="margin:0;color:var(--primary-dark,#0E2240)">' + sanitizeHTML(t('profit_loss') || 'Profit & Loss Statement') + '</h3>';
  h += '<div style="display:flex;gap:4px;flex-wrap:wrap">';

  const periods = ['thisMonth', 'lastMonth', 'thisQuarter', 'ytd', 'all'];
  periods.forEach(p => {
    const active = p === period ? 'btn-primary' : 'btn-secondary';
    h += '<button class="btn btn-sm ' + active + '" data-action="pnl-period" data-period="' + escapeAttr(p) + '">'
      + sanitizeHTML(_periodLabel(p)) + '</button>';
  });

  h += '</div></div>';

  // ─── Revenue ──────────────────────────────────────────
  h += _sectionHeader(t('revenue') || 'Revenue');

  // Group income by type
  const incomeByType = {};
  incomeActive.forEach(i => {
    const type = i.type || 'other';
    const amt = (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
    incomeByType[type] = (incomeByType[type] || 0) + amt;
  });

  const revenueTypes = [
    { key: 'egg_sales', label: t('pnl_egg_sales') || 'Egg Sales' },
    { key: 'bird_sales', label: t('pnl_bird_sales') || 'Bird Sales' },
    { key: 'manure_sales', label: t('pnl_manure_sales') || 'Manure Sales' },
    { key: 'other', label: t('pnl_other_income') || 'Other Income' }
  ];

  let totalRevenue = 0;
  revenueTypes.forEach(rt => {
    const amt = incomeByType[rt.key] || 0;
    totalRevenue += amt;
    h += _statRow(rt.label, amt, c, { indent: 1 });
  });

  // Add any income types not in the standard list
  Object.keys(incomeByType).forEach(k => {
    if (!revenueTypes.find(rt => rt.key === k)) {
      const amt = incomeByType[k];
      totalRevenue += amt;
      h += _statRow(k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '), amt, c, { indent: 1 });
    }
  });

  h += _subtotalRow(t('total_revenue') || 'Total Revenue', totalRevenue, c);

  // ─── COGS ─────────────────────────────────────────────
  h += _sectionHeader(t('cogs') || 'Cost of Goods Sold');

  const expByCat = {};
  expensesActive.forEach(e => {
    const cat = e.category || 'other';
    expByCat[cat] = (expByCat[cat] || 0) + (e.amount || 0);
  });

  const cogsCats = [
    { key: 'feed', label: t('pnl_feed') || 'Feed' },
    { key: 'bird_purchase', label: t('pnl_bird_purchases') || 'Bird Purchases' }
  ];

  let totalCOGS = 0;
  cogsCats.forEach(cc => {
    const amt = expByCat[cc.key] || 0;
    totalCOGS += amt;
    h += _statRow(cc.label, amt, c, { indent: 1 });
  });

  h += _subtotalRow(t('total_cogs') || 'Total COGS', totalCOGS, c);

  // ─── Gross Profit ─────────────────────────────────────
  h += _dividerRow();
  const grossProfit = totalRevenue - totalCOGS;
  h += _subtotalRow(t('gross_profit') || '= Gross Profit', grossProfit, c);
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  h += _marginRow(t('gross_margin') || 'Gross Margin %', grossMargin);

  // ─── Operating Expenses ───────────────────────────────
  h += _sectionHeader(t('operating_expenses') || 'Operating Expenses');

  const opexCats = [
    { key: 'vaccines', label: t('pnl_vaccines') || 'Vaccines & Medicine' },
    { key: 'labor', label: t('pnl_labor') || 'Labor' },
    { key: 'transport', label: t('pnl_transport') || 'Transport' },
    { key: 'infrastructure', label: t('pnl_infrastructure') || 'Infrastructure / Maintenance' },
    { key: 'other', label: t('pnl_other_expenses') || 'Other' }
  ];

  let totalOpEx = 0;
  opexCats.forEach(oc => {
    const amt = expByCat[oc.key] || 0;
    totalOpEx += amt;
    h += _statRow(oc.label, amt, c, { indent: 1 });
  });

  // Add any expense categories not in COGS or OpEx lists
  const knownCats = new Set([...cogsCats.map(c => c.key), ...opexCats.map(c => c.key)]);
  Object.keys(expByCat).forEach(k => {
    if (!knownCats.has(k)) {
      const amt = expByCat[k];
      totalOpEx += amt;
      h += _statRow(k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '), amt, c, { indent: 1 });
    }
  });

  h += _subtotalRow(t('total_opex') || 'Total Operating Expenses', totalOpEx, c);

  // ─── Operating Profit (EBIT) ──────────────────────────
  h += _dividerRow();
  const ebit = grossProfit - totalOpEx;
  h += _subtotalRow(t('operating_profit') || '= Operating Profit (EBIT)', ebit, c);

  // ─── EBITDA ───────────────────────────────────────────
  const depreciation = Number(settings.depreciation || settings.monthlyDepreciation || 0);
  if (depreciation > 0) {
    h += _statRow(t('depreciation') || 'Depreciation', depreciation, c, { indent: 1 });
  }
  const ebitda = ebit + depreciation;
  h += _subtotalRow(t('ebitda') || '= EBITDA', ebitda, c);

  // ─── Tax ──────────────────────────────────────────────
  const taxRate = Number(settings.taxRate || 0) / 100;
  const taxableIncome = Math.max(ebit, 0);
  const tax = taxableIncome * taxRate;

  if (taxRate > 0) {
    h += _sectionHeader(t('taxes') || 'Taxes');
    h += _statRow((t('tax') || 'Tax') + ' (' + fmtNum(taxRate * 100, 1) + '%)', tax, c, { indent: 1 });
  }

  // ─── Net Profit ───────────────────────────────────────
  h += _dividerRow();
  const netProfit = ebit - tax;
  h += '<div class="stat-row" style="font-weight:700;font-size:16px;padding:12px 0;'
    + (netProfit >= 0 ? 'color:#2e7d32' : 'color:#c62828') + '">'
    + '<span class="stat-label">' + sanitizeHTML(t('net_profit') || '= Net Profit') + '</span>'
    + '<span class="stat-value">' + fmtMoney(netProfit, c) + '</span>'
    + '</div>';

  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  h += _marginRow(t('net_margin') || 'Net Margin %', netMargin);

  h += '</div>'; // close .card
  return h;
}
