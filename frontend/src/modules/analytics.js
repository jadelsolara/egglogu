/**
 * EGGlogU — Analytics Module
 * Flock comparison, seasonality, profitability, KPI evolution.
 * Extracted from egglogu.js lines ~4023-4160.
 */

import { bus, Events } from '@core/event-bus.js';
import { fmtNum, todayStr } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData } from '@core/data.js';

// ── Flock Comparison ────────────────────────────────────

export function getFlockComparison() {
  const data = getData();
  if (!data.flocks.length) return [];

  return data.flocks.map((f) => {
    const cur = getActiveHensForFlock(data, f.id);
    const last7 = data.dailyProduction
      .filter((p) => p.flockId === f.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
    const avgEggs = last7.length > 0 ? last7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / last7.length : 0;
    const henDay = cur > 0 ? (avgEggs / cur) * 100 : 0;

    // FCR 30d
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    const d30s = d30.toISOString().substring(0, 10);
    const feedKg = data.feed.consumption
      .filter((c) => c.flockId === f.id && c.date >= d30s)
      .reduce((s, c) => s + (c.quantityKg || 0), 0);
    const eggsKg = data.dailyProduction
      .filter((p) => p.flockId === f.id && p.date >= d30s)
      .reduce((s, p) => s + (p.eggsCollected || 0), 0) * 0.06;
    const fcr = eggsKg > 0 ? feedKg / eggsKg : 0;

    // Mortality
    const deaths = data.dailyProduction
      .filter((p) => p.flockId === f.id)
      .reduce((s, p) => s + (p.deaths || 0), 0);
    const mortality = f.count > 0 ? (deaths / f.count) * 100 : 0;

    return {
      id: f.id,
      name: f.name,
      count: f.count,
      currentHens: cur,
      henDay,
      fcr,
      mortality,
    };
  }).sort((a, b) => b.henDay - a.henDay);
}

// ── Seasonality ─────────────────────────────────────────

export function getSeasonalityData() {
  const data = getData();
  const months = {};

  data.dailyProduction.forEach((p) => {
    const m = p.date?.substring(5, 7);
    if (!m) return;
    if (!months[m]) months[m] = { eggs: 0, days: new Set() };
    months[m].eggs += p.eggsCollected || 0;
    months[m].days.add(p.date);
  });

  const result = [];
  for (let i = 1; i <= 12; i++) {
    const k = String(i).padStart(2, '0');
    const d = months[k];
    result.push({
      month: i,
      monthKey: k,
      totalEggs: d ? d.eggs : 0,
      uniqueDays: d ? d.days.size : 0,
      avgPerDay: d && d.days.size > 0 ? Math.round(d.eggs / d.days.size) : 0,
    });
  }

  return result;
}

// ── Profitability per Flock ─────────────────────────────

export function getProfitabilityByFlock() {
  const data = getData();
  if (!data.flocks.length) return [];

  const totalFeedCost = data.feed.purchases.reduce((s, p) => s + (p.cost || 0), 0);
  const totalFeedKg = data.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0);
  const feedPricePerKg = totalFeedKg > 0 ? totalFeedCost / totalFeedKg : 0;

  const totalIncAmt = data.finances.income.reduce((s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0)), 0);
  const totalIncQty = data.finances.income.reduce((s, i) => s + (i.quantity || 0), 0);
  const weightedAvgPrice = totalIncQty > 0 ? totalIncAmt / totalIncQty : 0;

  return data.flocks.map((f) => {
    const eggs = data.dailyProduction
      .filter((p) => p.flockId === f.id)
      .reduce((s, p) => s + (p.eggsCollected || 0), 0);
    const feedCost = data.feed.consumption
      .filter((c) => c.flockId === f.id)
      .reduce((s, c) => s + (c.quantityKg || 0) * feedPricePerKg, 0);
    const income = eggs * weightedAvgPrice;
    const net = income - feedCost - (f.cost || 0);
    const costPerEgg = eggs > 0 ? (feedCost + (f.cost || 0)) / eggs : 0;

    return {
      id: f.id,
      name: f.name,
      eggs,
      income,
      feedCost: feedCost + (f.cost || 0),
      netProfit: net,
      costPerEgg,
    };
  });
}

// ── KPI Evolution ───────────────────────────────────────

export function getKPIEvolution(limit = 30) {
  const data = getData();
  return (data.kpiSnapshots || []).slice(-limit);
}

// ── Monthly Breakdown ───────────────────────────────────

export function getMonthlyBreakdown() {
  const data = getData();
  const months = {};

  data.finances.income.forEach((i) => {
    const m = i.date?.substring(0, 7);
    if (!m) return;
    if (!months[m]) months[m] = { income: 0, expenses: 0 };
    months[m].income += (i.quantity || 0) * (i.unitPrice || 0) || (i.amount || 0);
  });

  data.finances.expenses.forEach((e) => {
    const m = e.date?.substring(0, 7);
    if (!m) return;
    if (!months[m]) months[m] = { income: 0, expenses: 0 };
    months[m].expenses += e.amount || 0;
  });

  return Object.entries(months)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, data]) => ({
      month,
      income: data.income,
      expenses: data.expenses,
      net: data.income - data.expenses,
    }));
}

// ── Helpers ─────────────────────────────────────────────

function getActiveHensForFlock(data, flockId) {
  const flock = data.flocks.find((f) => f.id === flockId);
  if (!flock) return 0;
  const deaths = data.dailyProduction
    .filter((p) => p.flockId === flockId)
    .reduce((d, p) => d + (p.deaths || 0), 0);
  return (flock.initialCount || flock.count || 0) - deaths;
}

// Backward compatibility
window.getFlockComparison = getFlockComparison;
window.getSeasonalityData = getSeasonalityData;
window.getProfitabilityByFlock = getProfitabilityByFlock;
window.getKPIEvolution = getKPIEvolution;
