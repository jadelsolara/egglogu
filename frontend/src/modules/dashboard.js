/**
 * EGGlogU — Dashboard Module
 * KPI cards, alerts, trend charts, quick entry forms.
 * Extracted from egglogu.js lines ~2881-3048.
 *
 * Migration Phase A: This module provides the modular interface.
 * During coexistence with egglogu.js, functions are re-exported
 * to the window namespace for backward compatibility.
 */

import { bus, Events } from '@core/event-bus.js';
import { $, fmtNum, fmtMoney, fmtPercent, todayStr } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData, addRecord } from '@core/data.js';

// ── KPI Calculation ─────────────────────────────────────

export function calculateKPIs() {
  const data = getData();
  const today = todayStr();
  const flocks = (data.flocks || []).filter((f) => f.status !== 'descarte');
  const todayProd = (data.dailyProduction || []).filter((p) => p.date === today);

  const totalHens = flocks.reduce((s, f) => {
    const deaths = (data.dailyProduction || [])
      .filter((p) => p.flockId === f.id)
      .reduce((d, p) => d + (p.deaths || 0), 0);
    return s + ((f.initialCount || f.count || 0) - deaths);
  }, 0);

  const todayEggs = todayProd.reduce((s, p) => s + (p.eggs || p.eggsCollected || 0), 0);
  const todayBroken = todayProd.reduce((s, p) => s + (p.broken || p.brokenEggs || 0), 0);
  const todayDeaths = todayProd.reduce((s, p) => s + (p.deaths || 0), 0);
  const henDay = totalHens > 0 ? ((todayEggs / totalHens) * 100) : 0;

  // 30-day totals for financial KPIs
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const last30Str = last30.toISOString().substring(0, 10);

  const income30 = (data.finances?.income || [])
    .filter((i) => i.date >= last30Str)
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const expenses30 = (data.finances?.expenses || [])
    .filter((e) => e.date >= last30Str)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return {
    totalHens,
    activeFlocks: flocks.length,
    todayEggs,
    todayBroken,
    todayDeaths,
    henDay,
    netIncome30: income30 - expenses30,
    alerts: calculateAlerts(),
  };
}

// ── Alert Generation ────────────────────────────────────

export function calculateAlerts() {
  const data = getData();
  const alerts = [];
  const today = todayStr();
  const settings = data.settings || {};
  const alertDays = settings.alertDaysBefore || 7;

  // Overdue vaccines
  (data.vaccines || []).forEach((v) => {
    if (!v.appliedDate && v.scheduledDate) {
      if (v.scheduledDate < today) {
        alerts.push({ type: 'danger', msg: `${t('alert_vaccine_overdue')}: ${v.vaccine} (${v.flockName || ''})` });
      } else {
        const daysUntil = Math.ceil((new Date(v.scheduledDate) - new Date(today)) / 86400000);
        if (daysUntil <= alertDays) {
          alerts.push({ type: 'warning', msg: `${t('alert_vaccine_soon')}: ${v.vaccine} (${daysUntil}d)` });
        }
      }
    }
  });

  // Low feed stock
  const feedStock = calculateFeedStock(data);
  if (feedStock < (settings.minFeedStock || 500)) {
    alerts.push({ type: 'warning', msg: `${t('alert_low_feed')}: ${fmtNum(feedStock)} kg` });
  }

  // Active outbreaks
  (data.outbreaks || []).filter((o) => o.status === 'active').forEach((o) => {
    alerts.push({ type: 'danger', msg: `${t('alert_active_outbreak')}: ${o.disease}` });
  });

  return alerts;
}

function calculateFeedStock(data) {
  const purchased = (data.feed?.purchases || []).reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const consumed = (data.feed?.consumption || []).reduce((s, c) => s + (Number(c.qty) || 0), 0);
  return purchased - consumed;
}

// ── KPI Snapshot ────────────────────────────────────────

export function saveKPISnapshot() {
  const kpis = calculateKPIs();
  addRecord('kpiSnapshots', {
    date: todayStr(),
    totalHens: kpis.totalHens,
    todayEggs: kpis.todayEggs,
    henDay: kpis.henDay,
    netIncome: kpis.netIncome30,
    alertCount: kpis.alerts.length,
  });
  bus.emit(Events.KPI_SNAPSHOT, kpis);
}

// ── Event Subscriptions ─────────────────────────────────

bus.on(Events.PRODUCTION_SAVED, () => bus.emit(Events.DASHBOARD_REFRESH));
bus.on(Events.FLOCK_UPDATED, () => bus.emit(Events.DASHBOARD_REFRESH));
bus.on(Events.INCOME_ADDED, () => bus.emit(Events.DASHBOARD_REFRESH));
bus.on(Events.EXPENSE_ADDED, () => bus.emit(Events.DASHBOARD_REFRESH));

// Backward compatibility
window.calculateKPIs = calculateKPIs;
window.calculateAlerts = calculateAlerts;
window.saveKPISnapshot = saveKPISnapshot;
