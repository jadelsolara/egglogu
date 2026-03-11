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
    'thisMonth': t('fin_period_this_month') || 'This Month',
    'lastMonth': t('fin_period_last_month') || 'Last Month',
    'thisQuarter': t('fin_period_quarter') || 'This Quarter',
    'ytd': t('fin_period_ytd') || 'Year to Date',
    'all': t('fin_period_all') || 'All Time'
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
    { key: 'eggs', label: t('fin_type_eggs') || 'Egg Sales' },
    { key: 'birds', label: t('fin_type_birds') || 'Bird Sales' },
    { key: 'manure', label: t('fin_type_manure') || 'Manure Sales' },
    { key: 'processed', label: t('fin_type_processed') || 'Processed Products' },
    { key: 'byproducts', label: t('fin_type_byproducts') || 'Byproducts' },
    { key: 'services', label: t('fin_type_services') || 'Services' },
    { key: 'other', label: t('fin_type_other') || 'Other Income' }
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
    { key: 'feed', label: t('fin_cat_feed') || 'Feed' },
    { key: 'bird_purchase', label: t('fin_cat_bird_purchase') || 'Bird Purchases' }
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
    { key: 'vaccines', label: t('fin_cat_vaccines') || 'Vaccines & Medicine' },
    { key: 'labor', label: t('fin_cat_labor') || 'Labor' },
    { key: 'transport', label: t('fin_cat_transport') || 'Transport' },
    { key: 'infrastructure', label: t('fin_cat_infrastructure') || 'Infrastructure' },
    { key: 'utilities', label: t('fin_cat_utilities') || 'Utilities' },
    { key: 'packaging', label: t('fin_cat_packaging') || 'Packaging' },
    { key: 'insurance', label: t('fin_cat_insurance') || 'Insurance' },
    { key: 'marketing', label: t('fin_cat_marketing') || 'Marketing' },
    { key: 'equipment', label: t('fin_cat_equipment') || 'Equipment' },
    { key: 'other', label: t('fin_cat_other') || 'Other' }
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

// ═════════════════════════════════════════════════════════════
// renderBalanceSheet — Balance General
// ═════════════════════════════════════════════════════════════

export function renderBalanceSheet(D, period) {
  period = period || 'thisMonth';
  const c = _cur();
  const fin = D.finances || {};
  const settings = D.settings || D.farm || {};
  const { start, end } = _periodRange(period);

  // ─── Data gathering ─────────────────────────────────────
  const incomeActive = activeOnly(fin.income).filter(i => _inRange(i.date, start, end));
  const expensesActive = activeOnly(fin.expenses).filter(e => _inRange(e.date, start, end));
  const receivables = activeOnly(fin.receivables).filter(r => !r.paid);
  const payables = activeOnly(fin.payables).filter(p => !p.paid);
  const inventory = activeOnly(D.inventory || []);

  // Cash position
  let totalIncomePaid = 0;
  incomeActive.forEach(i => {
    totalIncomePaid += (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
  });
  let totalExpensesPaid = 0;
  expensesActive.forEach(e => { totalExpensesPaid += (e.amount || 0); });
  const cash = totalIncomePaid - totalExpensesPaid;

  // Receivables
  let totalReceivables = 0;
  receivables.forEach(r => { totalReceivables += (r.amount || 0); });

  // Egg inventory value
  let avgEggPrice = 0;
  const eggIncome = activeOnly(fin.income).filter(i => (i.type || '') === 'eggs' && (i.unitPrice || 0) > 0);
  if (eggIncome.length > 0) {
    let sum = 0;
    eggIncome.forEach(i => { sum += (i.unitPrice || 0); });
    avgEggPrice = sum / eggIncome.length;
  }
  let eggInventoryQty = 0;
  inventory.forEach(inv => {
    eggInventoryQty += (inv.qtyIn || 0) - (inv.qtyOut || 0);
  });
  const eggInventory = Math.max(0, eggInventoryQty) * avgEggPrice;

  // Feed inventory estimate
  const feedPurchases = activeOnly(D.feed && D.feed.purchases || []);
  const feedConsumption = activeOnly(D.feed && D.feed.consumption || []);
  let feedPurchased = 0;
  feedPurchases.forEach(fp => { feedPurchased += (fp.amount || fp.quantity || 0); });
  let feedConsumed = 0;
  feedConsumption.forEach(fc => { feedConsumed += (fc.amount || fc.quantity || 0); });
  const feedInventory = Math.max(0, feedPurchased - feedConsumed);

  // Current Assets
  const currentAssets = cash + totalReceivables + eggInventory + feedInventory;

  // Non-Current Assets — Fixed assets & depreciation
  const assetValue = Number(settings.assetValue || 0);
  const depYears = Number(settings.depreciationYears || 10);
  const farmStartDate = settings.startDate || settings.createdAt || todayStr();
  const elapsedMs = _today().getTime() - new Date(farmStartDate + 'T12:00:00').getTime();
  const elapsedYears = Math.max(0, elapsedMs / (365.25 * 24 * 60 * 60 * 1000));
  const accumDepreciation = Math.min(assetValue, assetValue * (elapsedYears / depYears));
  const netFixedAssets = assetValue - accumDepreciation;

  const nonCurrentAssets = netFixedAssets;
  const totalAssets = currentAssets + nonCurrentAssets;

  // Liabilities
  let totalPayables = 0;
  payables.forEach(p => { totalPayables += (p.amount || 0); });
  const currentLiabilities = totalPayables;
  const nonCurrentLiabilities = 0;
  const totalLiabilities = currentLiabilities + nonCurrentLiabilities;

  // Equity
  const periodResult = totalIncomePaid - totalExpensesPaid;
  const capital = totalAssets - totalLiabilities;
  const totalEquity = capital;

  // Equation check
  const equationBalances = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  // ─── Render ─────────────────────────────────────────────
  let h = '';
  h += '<div class="card">';

  // Period selector
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">';
  h += '<h3 style="margin:0;color:var(--primary-dark,#0E2240)">' + sanitizeHTML(t('bal_title') || 'Balance Sheet') + '</h3>';
  h += '<div style="display:flex;gap:4px;flex-wrap:wrap">';

  const periods = ['thisMonth', 'lastMonth', 'thisQuarter', 'ytd', 'all'];
  periods.forEach(p => {
    const active = p === period ? 'btn-primary' : 'btn-secondary';
    h += '<button class="btn btn-sm ' + active + '" data-action="balance-period" data-period="' + escapeAttr(p) + '">'
      + sanitizeHTML(_periodLabel(p)) + '</button>';
  });

  h += '</div></div>';

  // ─── ACTIVOS ────────────────────────────────────────────
  h += _sectionHeader(t('bal_assets') || 'ASSETS');

  h += '<div style="font-weight:600;margin:8px 0 4px;color:var(--primary,#1565C0);font-size:13px">'
    + sanitizeHTML(t('bal_current_assets') || 'Current Assets') + '</div>';
  h += _statRow(t('bal_cash') || 'Cash', cash, c, { indent: 1 });
  h += _statRow(t('bal_receivables') || 'Accounts Receivable', totalReceivables, c, { indent: 1 });
  h += _statRow(t('bal_egg_inventory') || 'Egg Inventory', eggInventory, c, { indent: 1 });
  h += _statRow(t('bal_feed_inventory') || 'Feed Inventory', feedInventory, c, { indent: 1 });
  h += _subtotalRow(t('bal_current_assets') || 'Total Current Assets', currentAssets, c);

  h += '<div style="font-weight:600;margin:12px 0 4px;color:var(--primary,#1565C0);font-size:13px">'
    + sanitizeHTML(t('bal_non_current_assets') || 'Non-Current Assets') + '</div>';
  h += _statRow(t('bal_fixed_assets') || 'Fixed Assets', assetValue, c, { indent: 1 });
  h += _statRow(t('bal_accum_depreciation') || 'Accumulated Depreciation', -accumDepreciation, c, { indent: 1, negative: true });
  h += _statRow(t('bal_net_fixed_assets') || 'Net Fixed Assets', netFixedAssets, c, { indent: 1 });
  h += _subtotalRow(t('bal_non_current_assets') || 'Total Non-Current Assets', nonCurrentAssets, c);

  h += _dividerRow();
  h += '<div class="stat-row" style="font-weight:700;font-size:16px;padding:12px 0;color:var(--primary-dark,#0E2240)">'
    + '<span class="stat-label">' + sanitizeHTML(t('bal_total_assets') || 'TOTAL ASSETS') + '</span>'
    + '<span class="stat-value">' + fmtMoney(totalAssets, c) + '</span>'
    + '</div>';

  // ─── PASIVOS ────────────────────────────────────────────
  h += _sectionHeader(t('bal_liabilities') || 'LIABILITIES');

  h += '<div style="font-weight:600;margin:8px 0 4px;color:var(--primary,#1565C0);font-size:13px">'
    + sanitizeHTML(t('bal_current_liabilities') || 'Current Liabilities') + '</div>';
  h += _statRow(t('bal_payables') || 'Accounts Payable', totalPayables, c, { indent: 1 });
  h += _subtotalRow(t('bal_current_liabilities') || 'Total Current Liabilities', currentLiabilities, c);

  h += '<div style="font-weight:600;margin:12px 0 4px;color:var(--primary,#1565C0);font-size:13px">'
    + sanitizeHTML(t('bal_non_current_liabilities') || 'Non-Current Liabilities') + '</div>';
  h += _statRow(t('bal_non_current_liabilities') || 'Non-Current Liabilities', nonCurrentLiabilities, c, { indent: 1 });

  h += _dividerRow();
  h += _subtotalRow(t('bal_total_liabilities') || 'TOTAL LIABILITIES', totalLiabilities, c);

  // ─── PATRIMONIO ─────────────────────────────────────────
  h += _sectionHeader(t('bal_equity') || 'EQUITY');

  h += _statRow(t('bal_capital') || 'Capital', capital, c, { indent: 1 });
  h += _statRow(t('bal_period_result') || 'Period Result (Net Income)', periodResult, c, { indent: 1 });

  h += _dividerRow();
  h += _subtotalRow(t('bal_total_equity') || 'TOTAL EQUITY', totalEquity, c);

  // ─── Equation verification ──────────────────────────────
  h += '<div style="margin-top:16px;padding:12px;border-radius:8px;text-align:center;font-weight:700;'
    + (equationBalances
      ? 'background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7">'
        + sanitizeHTML(t('bal_equation_ok') || 'Assets = Liabilities + Equity') + ' &#10003;'
      : 'background:#ffebee;color:#c62828;border:1px solid #ef9a9a">'
        + sanitizeHTML(t('bal_equation_error') || 'Warning: Equation does not balance') + ' &#10007;')
    + '</div>';

  h += '</div>'; // close .card
  return h;
}

// ═════════════════════════════════════════════════════════════
// renderEERR — Estado de Resultados (Income Statement)
// ═════════════════════════════════════════════════════════════

export function renderEERR(D, period) {
  period = period || 'thisMonth';
  const c = _cur();
  const fin = D.finances || {};
  const settings = D.settings || D.farm || {};
  const { start, end } = _periodRange(period);

  const incomeActive = activeOnly(fin.income).filter(i => _inRange(i.date, start, end));
  const expensesActive = activeOnly(fin.expenses).filter(e => _inRange(e.date, start, end));

  // Group income by type
  const incomeByType = {};
  incomeActive.forEach(i => {
    const type = i.type || 'other';
    const amt = (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
    incomeByType[type] = (incomeByType[type] || 0) + amt;
  });

  // Group expenses by category
  const expByCat = {};
  expensesActive.forEach(e => {
    const cat = e.category || 'other';
    expByCat[cat] = (expByCat[cat] || 0) + (e.amount || 0);
  });

  let h = '';
  h += '<div class="card">';

  // Period selector
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">';
  h += '<h3 style="margin:0;color:var(--primary-dark,#0E2240)">' + sanitizeHTML(t('eerr_title') || 'Income Statement') + '</h3>';
  h += '<div style="display:flex;gap:4px;flex-wrap:wrap">';

  const periods = ['thisMonth', 'lastMonth', 'thisQuarter', 'ytd', 'all'];
  periods.forEach(p => {
    const active = p === period ? 'btn-primary' : 'btn-secondary';
    h += '<button class="btn btn-sm ' + active + '" data-action="eerr-period" data-period="' + escapeAttr(p) + '">'
      + sanitizeHTML(_periodLabel(p)) + '</button>';
  });

  h += '</div></div>';

  // ─── INGRESOS OPERACIONALES ─────────────────────────────
  h += _sectionHeader(t('eerr_operating_income') || 'Operating Income');

  const operatingIncomeTypes = [
    { key: 'eggs', label: t('fin_type_eggs') || 'Egg Sales' },
    { key: 'birds', label: t('fin_type_birds') || 'Bird Sales' },
    { key: 'manure', label: t('fin_type_manure') || 'Manure Sales' },
    { key: 'processed', label: t('fin_type_processed') || 'Processed Products' },
    { key: 'byproducts', label: t('fin_type_byproducts') || 'Byproducts' },
    { key: 'services', label: t('fin_type_services') || 'Services' },
    { key: 'other', label: t('fin_type_other') || 'Other Operating Income' }
  ];

  let subtotalIncome = 0;
  operatingIncomeTypes.forEach(rt => {
    const amt = incomeByType[rt.key] || 0;
    subtotalIncome += amt;
    h += _statRow(rt.label, amt, c, { indent: 1 });
  });

  // Any non-standard income types
  Object.keys(incomeByType).forEach(k => {
    if (!operatingIncomeTypes.find(rt => rt.key === k)) {
      const amt = incomeByType[k];
      subtotalIncome += amt;
      h += _statRow(k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '), amt, c, { indent: 1 });
    }
  });

  h += _subtotalRow(t('eerr_subtotal_income') || 'Subtotal Operating Income', subtotalIncome, c);

  // ─── COSTO DE VENTAS ────────────────────────────────────
  h += _sectionHeader('(-) ' + (t('eerr_cost_of_sales') || 'Cost of Sales'));

  const cogsCats = [
    { key: 'feed', label: t('fin_cat_feed') || 'Feed' },
    { key: 'bird_purchase', label: t('fin_cat_bird_purchase') || 'Bird Purchases' }
  ];

  let subtotalCOGS = 0;
  cogsCats.forEach(cc => {
    const amt = expByCat[cc.key] || 0;
    subtotalCOGS += amt;
    h += _statRow(cc.label, amt, c, { indent: 1 });
  });

  h += _subtotalRow(t('eerr_subtotal_cogs') || 'Subtotal Cost of Sales', subtotalCOGS, c);

  // ─── UTILIDAD BRUTA ─────────────────────────────────────
  h += _dividerRow();
  const grossProfit = subtotalIncome - subtotalCOGS;
  h += _subtotalRow('= ' + (t('eerr_gross_profit') || 'Gross Profit'), grossProfit, c);
  const grossMargin = subtotalIncome > 0 ? (grossProfit / subtotalIncome) * 100 : 0;
  h += _marginRow(t('eerr_gross_margin') || 'Gross Margin %', grossMargin);

  // ─── GASTOS OPERACIONALES ───────────────────────────────
  h += _sectionHeader('(-) ' + (t('eerr_operating_expenses') || 'Operating Expenses'));

  // Production expenses
  h += '<div style="font-weight:600;margin:8px 0 4px;color:var(--primary,#1565C0);font-size:13px">'
    + sanitizeHTML(t('eerr_production_expenses') || 'Production Expenses') + '</div>';

  const prodCats = [
    { key: 'vaccines', label: t('fin_cat_vaccines') || 'Vaccines & Medicine' },
    { key: 'labor', label: t('fin_cat_labor') || 'Labor' },
    { key: 'utilities', label: t('fin_cat_utilities') || 'Utilities' }
  ];

  let subtotalProd = 0;
  prodCats.forEach(pc => {
    const amt = (expByCat[pc.key] || 0) + (pc.key === 'utilities' ? (expByCat['services'] || 0) : 0);
    subtotalProd += amt;
    h += _statRow(pc.label, amt, c, { indent: 2 });
  });

  // Administrative expenses
  h += '<div style="font-weight:600;margin:12px 0 4px;color:var(--primary,#1565C0);font-size:13px">'
    + sanitizeHTML(t('eerr_admin_expenses') || 'Administrative Expenses') + '</div>';

  const adminCats = [
    { key: 'transport', label: t('fin_cat_transport') || 'Transport' },
    { key: 'infrastructure', label: t('fin_cat_infrastructure') || 'Infrastructure' },
    { key: 'packaging', label: t('fin_cat_packaging') || 'Packaging' },
    { key: 'insurance', label: t('fin_cat_insurance') || 'Insurance' },
    { key: 'marketing', label: t('fin_cat_marketing') || 'Marketing' },
    { key: 'equipment', label: t('fin_cat_equipment') || 'Equipment' },
    { key: 'other', label: t('fin_cat_other') || 'Other Expenses' }
  ];

  let subtotalAdmin = 0;
  adminCats.forEach(ac => {
    const amt = expByCat[ac.key] || 0;
    subtotalAdmin += amt;
    h += _statRow(ac.label, amt, c, { indent: 2 });
  });

  // Add unknown categories not covered
  const knownCats = new Set([...cogsCats.map(x => x.key), ...prodCats.map(x => x.key), ...adminCats.map(x => x.key), 'services']);
  Object.keys(expByCat).forEach(k => {
    if (!knownCats.has(k)) {
      const amt = expByCat[k];
      subtotalAdmin += amt;
      h += _statRow(k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '), amt, c, { indent: 2 });
    }
  });

  const subtotalOpex = subtotalProd + subtotalAdmin;
  h += _subtotalRow(t('eerr_subtotal_opex') || 'Total Operating Expenses', subtotalOpex, c);

  // ─── UTILIDAD OPERACIONAL (EBIT) ────────────────────────
  h += _dividerRow();
  const ebit = grossProfit - subtotalOpex;
  h += _subtotalRow('= ' + (t('eerr_operating_profit') || 'Operating Profit (EBIT)'), ebit, c);

  // ─── OTROS INGRESOS Y GASTOS ────────────────────────────
  h += _sectionHeader('(+/-) ' + (t('eerr_other_income_expenses') || 'Other Income & Expenses'));
  h += _statRow(t('eerr_non_operating_income') || 'Non-Operating Income', 0, c, { indent: 1 });
  h += _statRow(t('eerr_financial_expenses') || 'Financial Expenses', 0, c, { indent: 1 });

  // ─── UTILIDAD ANTES DE IMPUESTOS (EBT) ──────────────────
  h += _dividerRow();
  const ebt = ebit; // + non-operating (0) - financial expenses (0)
  h += _subtotalRow('= ' + (t('eerr_ebt') || 'Earnings Before Tax (EBT)'), ebt, c);

  // ─── IMPUESTO ───────────────────────────────────────────
  const taxRate = Number(settings.taxRate || 0) / 100;
  const taxableIncome = Math.max(ebt, 0);
  const tax = taxableIncome * taxRate;

  h += _statRow('(-) ' + (t('eerr_tax') || 'Tax') + (taxRate > 0 ? ' (' + fmtNum(taxRate * 100, 1) + '%)' : ''), tax, c, { indent: 1 });

  // ─── UTILIDAD NETA ──────────────────────────────────────
  h += _dividerRow();
  const netProfit = ebt - tax;
  h += '<div class="stat-row" style="font-weight:700;font-size:16px;padding:12px 0;'
    + (netProfit >= 0 ? 'color:#2e7d32' : 'color:#c62828') + '">'
    + '<span class="stat-label">' + sanitizeHTML('= ' + (t('eerr_net_profit') || 'Net Profit')) + '</span>'
    + '<span class="stat-value">' + fmtMoney(netProfit, c) + '</span>'
    + '</div>';

  const netMargin = subtotalIncome > 0 ? (netProfit / subtotalIncome) * 100 : 0;
  h += _marginRow(t('eerr_net_margin') || 'Net Margin %', netMargin);

  h += '</div>'; // close .card
  return h;
}
