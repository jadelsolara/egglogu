/**
 * EGGlogU — Production Module
 * Daily egg production recording and management.
 * Extracted from egglogu.js lines ~3171-3257.
 */

import { bus, Events } from '@core/event-bus.js';
import { $, fmtNum, fmtDate, todayStr, genId, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { sanitizeHTML } from '@core/security.js';
import { getData, saveData, addRecord, deleteRecord } from '@core/data.js';

// ── Add Production Record ───────────────────────────────

export function addProductionRecord(record) {
  const data = getData();
  const entry = {
    id: genId(),
    flockId: record.flockId,
    date: record.date || todayStr(),
    eggs: Number(record.eggs) || 0,
    eggsCollected: Number(record.eggs) || 0,
    broken: Number(record.broken) || 0,
    brokenEggs: Number(record.broken) || 0,
    deaths: Number(record.deaths) || 0,
    deathCause: record.deathCause || '',
    sizeS: Number(record.sizeS) || 0,
    sizeM: Number(record.sizeM) || 0,
    sizeL: Number(record.sizeL) || 0,
    sizeXL: Number(record.sizeXL) || 0,
    sizeJumbo: Number(record.sizeJumbo) || 0,
    shellColor: record.shellColor || '',
    yolkQuality: Number(record.yolkQuality) || 0,
    eggType: record.eggType || 'conventional',
    market: record.market || 'wholesale',
    notes: record.notes || '',
    createdAt: new Date().toISOString(),
  };

  data.dailyProduction.push(entry);
  saveData();

  bus.emit(Events.PRODUCTION_SAVED, entry);
  showToast(t('qe_saved'));

  return entry;
}

// ── Delete Production Record ────────────────────────────

export function deleteProductionRecord(id) {
  const removed = deleteRecord('dailyProduction', id);
  if (removed) {
    bus.emit(Events.PRODUCTION_DELETED, removed);
  }
  return removed;
}

// ── Get Production Stats ────────────────────────────────

export function getProductionStats(days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const records = (data.dailyProduction || []).filter((p) => p.date >= cutoffStr);

  const totalEggs = records.reduce((s, p) => s + (p.eggs || p.eggsCollected || 0), 0);
  const totalBroken = records.reduce((s, p) => s + (p.broken || p.brokenEggs || 0), 0);
  const totalDeaths = records.reduce((s, p) => s + (p.deaths || 0), 0);
  const uniqueDays = new Set(records.map((r) => r.date)).size;

  return {
    totalEggs,
    totalBroken,
    totalDeaths,
    avgEggsPerDay: uniqueDays > 0 ? totalEggs / uniqueDays : 0,
    breakRate: totalEggs > 0 ? (totalBroken / totalEggs) * 100 : 0,
    records,
    days: uniqueDays,
  };
}

// ── Production by Flock ─────────────────────────────────

export function getProductionByFlock(flockId, days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  return (data.dailyProduction || []).filter(
    (p) => p.flockId === flockId && p.date >= cutoffStr
  );
}

// ── Trend Data (for charts) ─────────────────────────────

export function getProductionTrend(days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const records = (data.dailyProduction || []).filter((p) => p.date >= cutoffStr);

  // Group by date
  const byDate = {};
  records.forEach((p) => {
    if (!byDate[p.date]) byDate[p.date] = { eggs: 0, broken: 0, deaths: 0 };
    byDate[p.date].eggs += p.eggs || p.eggsCollected || 0;
    byDate[p.date].broken += p.broken || p.brokenEggs || 0;
    byDate[p.date].deaths += p.deaths || 0;
  });

  const dates = Object.keys(byDate).sort();
  return {
    labels: dates,
    eggs: dates.map((d) => byDate[d].eggs),
    broken: dates.map((d) => byDate[d].broken),
    deaths: dates.map((d) => byDate[d].deaths),
  };
}

// Backward compatibility
window.addProductionRecord = addProductionRecord;
window.getProductionStats = getProductionStats;
window.getProductionTrend = getProductionTrend;
