/**
 * EGGlogU — Finance Module
 * Income, expenses, receivables, financial summaries.
 * Extracted from egglogu.js lines ~3773-4020.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Income ──────────────────────────────────────────────

export function addIncome(income) {
  const data = getData();
  const entry = {
    id: genId(),
    date: income.date || todayStr(),
    type: income.type || 'eggs',
    quantity: parseFloat(income.quantity) || 0,
    unitPrice: parseFloat(income.unitPrice) || 0,
    eggType: income.eggType || '',
    marketChannel: income.marketChannel || '',
    clientId: income.clientId || '',
    notes: income.notes || '',
    createdAt: new Date().toISOString(),
  };

  data.finances.income.push(entry);
  saveData();
  bus.emit(Events.INCOME_ADDED, entry);
  return entry;
}

export function updateIncome(id, changes) {
  const data = getData();
  const idx = data.finances.income.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  data.finances.income[idx] = { ...data.finances.income[idx], ...changes };
  saveData();
  return data.finances.income[idx];
}

export function deleteIncome(id) {
  const data = getData();
  const removed = data.finances.income.find((i) => i.id === id);
  data.finances.income = data.finances.income.filter((i) => i.id !== id);
  saveData();
  return removed;
}

// ── Expenses ────────────────────────────────────────────

export function addExpense(expense) {
  const data = getData();
  const entry = {
    id: genId(),
    date: expense.date || todayStr(),
    category: expense.category || 'other',
    description: expense.description || '',
    amount: parseFloat(expense.amount) || 0,
    flockId: expense.flockId || null,
    notes: expense.notes || '',
    createdAt: new Date().toISOString(),
  };

  data.finances.expenses.push(entry);
  saveData();
  bus.emit(Events.EXPENSE_ADDED, entry);
  return entry;
}

export function updateExpense(id, changes) {
  const data = getData();
  const idx = data.finances.expenses.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  data.finances.expenses[idx] = { ...data.finances.expenses[idx], ...changes };
  saveData();
  return data.finances.expenses[idx];
}

export function deleteExpense(id) {
  const data = getData();
  const removed = data.finances.expenses.find((e) => e.id === id);
  data.finances.expenses = data.finances.expenses.filter((e) => e.id !== id);
  saveData();
  return removed;
}

// ── Receivables ─────────────────────────────────────────

export function addReceivable(receivable) {
  const data = getData();
  const entry = {
    id: genId(),
    date: receivable.date || todayStr(),
    dueDate: receivable.dueDate || '',
    clientId: receivable.clientId || '',
    amount: parseFloat(receivable.amount) || 0,
    description: receivable.description || '',
    paid: false,
    createdAt: new Date().toISOString(),
  };

  data.finances.receivables.push(entry);
  saveData();
  return entry;
}

export function toggleReceivablePaid(id, paid) {
  const data = getData();
  const rec = data.finances.receivables.find((r) => r.id === id);
  if (rec) {
    rec.paid = !!paid;
    saveData();
  }
  return rec;
}

export function deleteReceivable(id) {
  const data = getData();
  const removed = data.finances.receivables.find((r) => r.id === id);
  data.finances.receivables = data.finances.receivables.filter((r) => r.id !== id);
  saveData();
  return removed;
}

// ── Financial Summary ───────────────────────────────────

export function getFinancialSummary(month) {
  const data = getData();
  const mo = month || todayStr().substring(0, 7);

  const monthIncome = data.finances.income
    .filter((i) => i.date && i.date.startsWith(mo))
    .reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);

  const monthExpenses = data.finances.expenses
    .filter((e) => e.date && e.date.startsWith(mo))
    .reduce((s, e) => s + (e.amount || 0), 0);

  const grossProfit = monthIncome - monthExpenses;
  const taxRate = (data.settings?.taxRate || 0) / 100;
  const depYears = data.settings?.depreciationYears || 5;
  const assetVal = data.settings?.assetValue || 0;
  const monthlyDep = assetVal > 0 ? assetVal / (depYears * 12) : 0;
  const operatingProfit = grossProfit - monthlyDep;
  const taxAmt = operatingProfit > 0 ? operatingProfit * taxRate : 0;
  const netProfit = operatingProfit - taxAmt;

  return {
    month: mo,
    income: monthIncome,
    expenses: monthExpenses,
    grossProfit,
    monthlyDepreciation: monthlyDep,
    tax: taxAmt,
    netProfit,
  };
}

export function getCostPerEgg() {
  const data = getData();
  const totalEggs = data.dailyProduction.reduce((s, p) => s + (p.eggsCollected || 0), 0);
  const totalExpenses = data.finances.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  return totalEggs > 0 ? totalExpenses / totalEggs : 0;
}

export function getRevenueByChannel() {
  const data = getData();
  const channels = {};

  data.finances.income.forEach((i) => {
    const ch = i.marketChannel || 'other';
    const amt = (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
    const qty = i.quantity || 0;
    if (!channels[ch]) channels[ch] = { revenue: 0, qty: 0 };
    channels[ch].revenue += amt;
    channels[ch].qty += qty;
  });

  return channels;
}

export function getPendingReceivables() {
  const data = getData();
  return data.finances.receivables.filter((r) => !r.paid);
}

export function exportFinancesCSV() {
  const data = getData();
  const esc = (s) => String(s || '').replace(/"/g, '""');
  let csv = 'Type,Date,Category,Description,Quantity,Unit Price,Amount\n';

  data.finances.income.forEach((i) => {
    const amt = (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
    csv += `"${esc('Income')}","${i.date}","${esc(i.type)}","${esc(i.notes)}",${i.quantity || 0},${i.unitPrice || 0},${amt}\n`;
  });

  data.finances.expenses.forEach((e) => {
    csv += `"${esc('Expense')}","${e.date}","${esc(e.category)}","${esc(e.description)}",,,${e.amount || 0}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `egglogu_finanzas_${todayStr()}.csv`;
  a.click();
}

// Backward compatibility
window.addIncome = addIncome;
window.addExpense = addExpense;
window.addReceivable = addReceivable;
window.toggleReceivablePaid = toggleReceivablePaid;
window.getFinancialSummary = getFinancialSummary;
window.exportFinCSV = exportFinancesCSV;
