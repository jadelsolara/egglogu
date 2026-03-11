// EGGlogU — Finance Analysis Module (Cash Flow, Budget, Aging)
// Pure JS module — exports render functions returning HTML strings
// Used by egg-finances.js — NO web component, NO shadow DOM

import { Store, Bus, t, sanitizeHTML, escapeAttr, fmtNum, fmtMoney, fmtDate, todayStr, kpi, currency, emptyState } from '../core/index.js';
import { activeOnly } from '../core/utils.js';

// ─── Helpers ────────────────────────────────────────────────

function _cur() { return currency(); }

function _monthKey(dateStr) {
  if (!dateStr) return '';
  return dateStr.substring(0, 7); // YYYY-MM
}

function _monthLabel(ym) {
  if (!ym) return '-';
  const [y, m] = ym.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(m, 10) - 1] + ' ' + y;
}

function _today() { return new Date(todayStr() + 'T12:00:00'); }

function _daysDiff(dueDateStr) {
  if (!dueDateStr) return 0;
  const due = new Date(dueDateStr + 'T12:00:00');
  const now = _today();
  return Math.floor((now - due) / 86400000);
}

function _agingBucket(daysDiff) {
  if (daysDiff <= 0) return 'current';
  if (daysDiff <= 30) return '1-30';
  if (daysDiff <= 60) return '31-60';
  if (daysDiff <= 90) return '61-90';
  return '90+';
}

function _agingBucketLabel(bucket) {
  const labels = {
    'current': t('aging_current') || 'Current',
    '1-30': '1-30 ' + (t('days') || 'days'),
    '31-60': '31-60 ' + (t('days') || 'days'),
    '61-90': '61-90 ' + (t('days') || 'days'),
    '90+': '90+ ' + (t('days') || 'days')
  };
  return labels[bucket] || bucket;
}

function _bucketClass(bucket) {
  if (bucket === 'current') return 'badge-success';
  if (bucket === '1-30') return 'badge-info';
  if (bucket === '31-60') return 'badge-warning';
  return 'badge-danger';
}

function _currentMonth() {
  return todayStr().substring(0, 7);
}

// ─── Category labels ────────────────────────────────────────

const EXPENSE_CATEGORIES = ['feed', 'vaccines', 'transport', 'labor', 'infrastructure', 'bird_purchase', 'other'];

function _catLabel(cat) {
  return t('fin_cat_' + cat) || t(cat) || cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ');
}

// ═════════════════════════════════════════════════════════════
// renderCashFlow — Real cash position and projected cash flow
// ═════════════════════════════════════════════════════════════

export function renderCashFlow(D) {
  const c = _cur();
  const fin = D.finances || {};

  const incomeActive = activeOnly(fin.income);
  const expensesActive = activeOnly(fin.expenses);
  const receivablesActive = activeOnly(fin.receivables);
  const payablesActive = activeOnly(fin.payables);

  // Totals
  const totalIncomePaid = incomeActive.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
  const totalExpensesPaid = expensesActive.reduce((s, e) => s + (e.amount || 0), 0);
  const cashPosition = totalIncomePaid - totalExpensesPaid;

  const pendingReceivables = receivablesActive
    .filter(r => !r.paid)
    .reduce((s, r) => s + (r.amount || 0), 0);

  const pendingPayables = payablesActive
    .filter(p => !p.paid)
    .reduce((s, p) => s + (p.amount || 0), 0);

  const projectedNet = cashPosition + pendingReceivables - pendingPayables;

  let h = '';

  // KPI cards
  h += '<div class="kpi-grid">';
  h += kpi(t('cash_position') || 'Cash Position', fmtMoney(cashPosition, c), '', cashPosition >= 0 ? '' : 'danger');
  h += kpi(t('pending_receivables') || 'Pending Receivables', fmtMoney(pendingReceivables, c), '', 'accent');
  h += kpi(t('pending_payables') || 'Pending Payables', fmtMoney(pendingPayables, c), '', 'warning');
  h += kpi(t('projected_net') || 'Projected Net', fmtMoney(projectedNet, c), '', projectedNet >= 0 ? '' : 'danger');
  h += '</div>';

  // Monthly Cash Flow table — last 12 months
  h += '<div class="card">';
  h += '<h3>' + sanitizeHTML(t('monthly_cash_flow') || 'Monthly Cash Flow') + '</h3>';

  // Build month map for last 12 months
  const today = _today();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    months.push(ym);
  }

  const incomeByMonth = {};
  const expenseByMonth = {};
  incomeActive.forEach(i => {
    const m = _monthKey(i.date);
    incomeByMonth[m] = (incomeByMonth[m] || 0) + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0));
  });
  expensesActive.forEach(e => {
    const m = _monthKey(e.date);
    expenseByMonth[m] = (expenseByMonth[m] || 0) + (e.amount || 0);
  });

  h += '<div class="table-wrap"><table>';
  h += '<thead><tr><th>' + sanitizeHTML(t('month') || 'Month') + '</th>';
  h += '<th>' + sanitizeHTML(t('cash_in') || 'Cash In') + '</th>';
  h += '<th>' + sanitizeHTML(t('cash_out') || 'Cash Out') + '</th>';
  h += '<th>' + sanitizeHTML(t('net') || 'Net') + '</th>';
  h += '<th>' + sanitizeHTML(t('running_balance') || 'Running Balance') + '</th>';
  h += '</tr></thead><tbody>';

  let runningBalance = 0;
  months.forEach(ym => {
    const cashIn = incomeByMonth[ym] || 0;
    const cashOut = expenseByMonth[ym] || 0;
    const net = cashIn - cashOut;
    runningBalance += net;
    const netColor = net >= 0 ? 'color:#2e7d32' : 'color:#c62828';
    const balColor = runningBalance >= 0 ? 'color:#2e7d32' : 'color:#c62828';

    h += '<tr>';
    h += '<td>' + sanitizeHTML(_monthLabel(ym)) + '</td>';
    h += '<td>' + fmtMoney(cashIn, c) + '</td>';
    h += '<td>' + fmtMoney(cashOut, c) + '</td>';
    h += '<td style="' + netColor + ';font-weight:600">' + fmtMoney(net, c) + '</td>';
    h += '<td style="' + balColor + ';font-weight:600">' + fmtMoney(runningBalance, c) + '</td>';
    h += '</tr>';
  });

  h += '</tbody></table></div></div>';

  // Upcoming Due — next 30 days
  h += '<div class="card">';
  h += '<h3>' + sanitizeHTML(t('upcoming_due') || 'Upcoming Due (Next 30 Days)') + '</h3>';

  const now = _today();
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const upcomingItems = [];

  receivablesActive.filter(r => !r.paid).forEach(r => {
    const due = new Date((r.dueDate || r.date || '') + 'T12:00:00');
    if (due <= in30) {
      upcomingItems.push({
        date: r.dueDate || r.date || '',
        description: r.description || r.client || '-',
        amount: r.amount || 0,
        type: 'receivable',
        overdue: due < now
      });
    }
  });

  payablesActive.filter(p => !p.paid).forEach(p => {
    const due = new Date((p.dueDate || p.date || '') + 'T12:00:00');
    if (due <= in30) {
      upcomingItems.push({
        date: p.dueDate || p.date || '',
        description: p.description || p.employee || '-',
        amount: p.amount || 0,
        type: 'payable',
        overdue: due < now
      });
    }
  });

  // Sort by due date ascending
  upcomingItems.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (upcomingItems.length === 0) {
    h += '<div class="empty-state"><div class="empty-icon">\u2705</div><p>' + sanitizeHTML(t('no_upcoming_due') || 'No items due in the next 30 days') + '</p></div>';
  } else {
    h += '<div class="table-wrap"><table>';
    h += '<thead><tr>';
    h += '<th>' + sanitizeHTML(t('due_date') || 'Due Date') + '</th>';
    h += '<th>' + sanitizeHTML(t('description') || 'Description') + '</th>';
    h += '<th>' + sanitizeHTML(t('amount') || 'Amount') + '</th>';
    h += '<th>' + sanitizeHTML(t('type') || 'Type') + '</th>';
    h += '<th>' + sanitizeHTML(t('status') || 'Status') + '</th>';
    h += '</tr></thead><tbody>';

    upcomingItems.forEach(item => {
      const typeBadge = item.type === 'receivable'
        ? '<span class="badge badge-info">' + sanitizeHTML(t('receivable') || 'Receivable') + '</span>'
        : '<span class="badge badge-warning">' + sanitizeHTML(t('payable') || 'Payable') + '</span>';
      const statusBadge = item.overdue
        ? '<span class="badge badge-danger">' + sanitizeHTML(t('overdue') || 'Overdue') + '</span>'
        : '<span class="badge badge-success">' + sanitizeHTML(t('on_time') || 'On Time') + '</span>';

      h += '<tr>';
      h += '<td>' + fmtDate(item.date) + '</td>';
      h += '<td>' + sanitizeHTML(item.description) + '</td>';
      h += '<td style="font-weight:600">' + fmtMoney(item.amount, c) + '</td>';
      h += '<td>' + typeBadge + '</td>';
      h += '<td>' + statusBadge + '</td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';
  }

  h += '</div>';
  return h;
}

// ═════════════════════════════════════════════════════════════
// renderBudget — Budget vs Actual comparison
// ═════════════════════════════════════════════════════════════

export function renderBudget(D) {
  const c = _cur();
  const fin = D.finances || {};
  const budgets = fin.budgets || [];
  const expensesActive = activeOnly(fin.expenses);
  const curMonth = _currentMonth();

  let h = '';

  // Header with button
  h += '<div class="page-header"><h3>' + sanitizeHTML(t('budget_vs_actual') || 'Budget vs Actual') + '</h3>';
  h += '<button class="btn btn-primary btn-sm" data-action="set-budget">' + sanitizeHTML(t('set_budget') || 'Set Budget') + '</button></div>';

  // Filter budgets to current month
  const monthBudgets = budgets.filter(b => _monthKey(b.month || b.date || '') === curMonth || b.month === curMonth);

  if (monthBudgets.length === 0) {
    h += emptyState('\uD83D\uDCCA', t('no_budgets_msg') || 'Configure your monthly budgets to track spending', t('set_budget') || 'Set Budget', "this.dispatchEvent(new CustomEvent('action',{detail:'set-budget',bubbles:true}))");
    return h;
  }

  // Build actual spending by category for current month
  const actualByCategory = {};
  expensesActive.forEach(e => {
    if (_monthKey(e.date) === curMonth) {
      const cat = e.category || 'other';
      actualByCategory[cat] = (actualByCategory[cat] || 0) + (e.amount || 0);
    }
  });

  h += '<div class="card">';
  h += '<h3>' + sanitizeHTML(_monthLabel(curMonth)) + '</h3>';
  h += '<div class="table-wrap"><table>';
  h += '<thead><tr>';
  h += '<th>' + sanitizeHTML(t('category') || 'Category') + '</th>';
  h += '<th>' + sanitizeHTML(t('budget') || 'Budget') + '</th>';
  h += '<th>' + sanitizeHTML(t('actual') || 'Actual') + '</th>';
  h += '<th>' + sanitizeHTML(t('variance') || 'Variance') + '</th>';
  h += '<th>' + sanitizeHTML(t('pct_used') || '% Used') + '</th>';
  h += '</tr></thead><tbody>';

  // Build lookup of budget amounts by category
  const budgetByCat = {};
  monthBudgets.forEach(b => {
    budgetByCat[b.category] = (budgetByCat[b.category] || 0) + (b.amount || 0);
  });

  // Show all categories that have either budget or actual
  const allCats = new Set([...Object.keys(budgetByCat), ...EXPENSE_CATEGORIES.filter(c => budgetByCat[c])]);
  // Also include categories with budget set
  Object.keys(budgetByCat).forEach(k => allCats.add(k));

  const catList = EXPENSE_CATEGORIES.filter(c => allCats.has(c));
  // Add any extra categories not in the standard list
  Object.keys(budgetByCat).forEach(k => {
    if (!catList.includes(k)) catList.push(k);
  });

  let totalBudget = 0;
  let totalActual = 0;

  catList.forEach(cat => {
    const budgetAmt = budgetByCat[cat] || 0;
    const actualAmt = actualByCategory[cat] || 0;
    const variance = budgetAmt - actualAmt;
    const pctUsed = budgetAmt > 0 ? (actualAmt / budgetAmt) * 100 : (actualAmt > 0 ? 100 : 0);

    totalBudget += budgetAmt;
    totalActual += actualAmt;

    // Color logic
    let rowColor = '';
    let barColor = '#2e7d32'; // green
    let pctClass = 'badge-success';
    if (pctUsed >= 100) {
      rowColor = 'background:#ffebee';
      barColor = '#c62828';
      pctClass = 'badge-danger';
    } else if (pctUsed >= 80) {
      rowColor = 'background:#fff8e1';
      barColor = '#e65100';
      pctClass = 'badge-warning';
    }

    const varianceColor = variance >= 0 ? 'color:#2e7d32' : 'color:#c62828';
    const clampedPct = Math.min(pctUsed, 100);

    h += '<tr style="' + rowColor + '">';
    h += '<td>' + sanitizeHTML(_catLabel(cat)) + '</td>';
    h += '<td>' + fmtMoney(budgetAmt, c) + '</td>';
    h += '<td>' + fmtMoney(actualAmt, c) + '</td>';
    h += '<td style="' + varianceColor + ';font-weight:600">' + fmtMoney(variance, c) + '</td>';
    h += '<td>';
    h += '<div style="display:flex;align-items:center;gap:8px">';
    h += '<div style="flex:1;background:#e0e0e0;border-radius:4px;height:8px;min-width:60px">';
    h += '<div style="width:' + clampedPct.toFixed(0) + '%;background:' + barColor + ';height:100%;border-radius:4px;transition:width .3s"></div>';
    h += '</div>';
    h += '<span class="badge ' + pctClass + '">' + fmtNum(pctUsed, 0) + '%</span>';
    h += '</div>';
    h += '</td>';
    h += '</tr>';
  });

  // Totals row
  const totalVariance = totalBudget - totalActual;
  const totalPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const totVarColor = totalVariance >= 0 ? 'color:#2e7d32' : 'color:#c62828';

  h += '<tr style="font-weight:700;border-top:2px solid var(--border,#ccc)">';
  h += '<td>' + sanitizeHTML(t('total') || 'Total') + '</td>';
  h += '<td>' + fmtMoney(totalBudget, c) + '</td>';
  h += '<td>' + fmtMoney(totalActual, c) + '</td>';
  h += '<td style="' + totVarColor + '">' + fmtMoney(totalVariance, c) + '</td>';
  h += '<td><span class="badge ' + (totalPct >= 100 ? 'badge-danger' : totalPct >= 80 ? 'badge-warning' : 'badge-success') + '">' + fmtNum(totalPct, 0) + '%</span></td>';
  h += '</tr>';

  h += '</tbody></table></div></div>';
  return h;
}

// ═════════════════════════════════════════════════════════════
// renderAging — Receivables and payables aging report
// ═════════════════════════════════════════════════════════════

export function renderAging(D) {
  const c = _cur();
  const fin = D.finances || {};

  const receivablesActive = activeOnly(fin.receivables).filter(r => !r.paid);
  const payablesActive = activeOnly(fin.payables).filter(p => !p.paid);

  let h = '';

  // ── Receivables Aging ──
  h += '<div class="card">';
  h += '<h3>' + sanitizeHTML(t('receivables_aging') || 'Receivables Aging') + '</h3>';

  const recBuckets = { 'current': 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const recItems = receivablesActive.map(r => {
    const dd = _daysDiff(r.dueDate || r.date || '');
    const bucket = _agingBucket(dd);
    recBuckets[bucket] += (r.amount || 0);
    return { ...r, daysDiff: dd, bucket };
  });

  // KPI cards per bucket
  h += '<div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">';
  ['current', '1-30', '31-60', '61-90', '90+'].forEach(b => {
    const cls = b === 'current' ? '' : (b === '1-30' ? 'accent' : (b === '31-60' ? 'warning' : 'danger'));
    h += kpi(_agingBucketLabel(b), fmtMoney(recBuckets[b], c), '', cls);
  });
  h += '</div>';

  if (recItems.length === 0) {
    h += '<div class="empty-state"><div class="empty-icon">\u2705</div><p>' + sanitizeHTML(t('no_outstanding_receivables') || 'No outstanding receivables') + '</p></div>';
  } else {
    // Sort by days overdue descending
    recItems.sort((a, b) => b.daysDiff - a.daysDiff);

    h += '<div class="table-wrap"><table>';
    h += '<thead><tr>';
    h += '<th>' + sanitizeHTML(t('client') || 'Client') + '</th>';
    h += '<th>' + sanitizeHTML(t('invoice') || 'Invoice') + '</th>';
    h += '<th>' + sanitizeHTML(t('amount') || 'Amount') + '</th>';
    h += '<th>' + sanitizeHTML(t('due_date') || 'Due Date') + '</th>';
    h += '<th>' + sanitizeHTML(t('days_overdue') || 'Days Overdue') + '</th>';
    h += '<th>' + sanitizeHTML(t('bucket') || 'Bucket') + '</th>';
    h += '</tr></thead><tbody>';

    recItems.forEach(item => {
      const daysLabel = item.daysDiff <= 0 ? '-' : String(item.daysDiff);
      h += '<tr>';
      h += '<td>' + sanitizeHTML(item.client || item.description || '-') + '</td>';
      h += '<td>' + sanitizeHTML(item.invoice || item.id || '-') + '</td>';
      h += '<td style="font-weight:600">' + fmtMoney(item.amount || 0, c) + '</td>';
      h += '<td>' + fmtDate(item.dueDate || item.date || '') + '</td>';
      h += '<td>' + sanitizeHTML(daysLabel) + '</td>';
      h += '<td><span class="badge ' + _bucketClass(item.bucket) + '">' + sanitizeHTML(_agingBucketLabel(item.bucket)) + '</span></td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';
  }

  h += '</div>';

  // ── Payables Aging ──
  h += '<div class="card">';
  h += '<h3>' + sanitizeHTML(t('payables_aging') || 'Payables Aging') + '</h3>';

  const payBuckets = { 'current': 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const payItems = payablesActive.map(p => {
    const dd = _daysDiff(p.dueDate || p.date || '');
    const bucket = _agingBucket(dd);
    payBuckets[bucket] += (p.amount || 0);
    return { ...p, daysDiff: dd, bucket };
  });

  // KPI cards per bucket
  h += '<div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">';
  ['current', '1-30', '31-60', '61-90', '90+'].forEach(b => {
    const cls = b === 'current' ? '' : (b === '1-30' ? 'accent' : (b === '31-60' ? 'warning' : 'danger'));
    h += kpi(_agingBucketLabel(b), fmtMoney(payBuckets[b], c), '', cls);
  });
  h += '</div>';

  if (payItems.length === 0) {
    h += '<div class="empty-state"><div class="empty-icon">\u2705</div><p>' + sanitizeHTML(t('no_outstanding_payables') || 'No outstanding payables') + '</p></div>';
  } else {
    payItems.sort((a, b) => b.daysDiff - a.daysDiff);

    h += '<div class="table-wrap"><table>';
    h += '<thead><tr>';
    h += '<th>' + sanitizeHTML(t('employee') || 'Employee') + ' / ' + sanitizeHTML(t('description') || 'Description') + '</th>';
    h += '<th>' + sanitizeHTML(t('amount') || 'Amount') + '</th>';
    h += '<th>' + sanitizeHTML(t('due_date') || 'Due Date') + '</th>';
    h += '<th>' + sanitizeHTML(t('days_overdue') || 'Days Overdue') + '</th>';
    h += '<th>' + sanitizeHTML(t('bucket') || 'Bucket') + '</th>';
    h += '</tr></thead><tbody>';

    payItems.forEach(item => {
      const daysLabel = item.daysDiff <= 0 ? '-' : String(item.daysDiff);
      h += '<tr>';
      h += '<td>' + sanitizeHTML(item.employee || item.description || '-') + '</td>';
      h += '<td style="font-weight:600">' + fmtMoney(item.amount || 0, c) + '</td>';
      h += '<td>' + fmtDate(item.dueDate || item.date || '') + '</td>';
      h += '<td>' + sanitizeHTML(daysLabel) + '</td>';
      h += '<td><span class="badge ' + _bucketClass(item.bucket) + '">' + sanitizeHTML(_agingBucketLabel(item.bucket)) + '</span></td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';
  }

  h += '</div>';
  return h;
}
