/**
 * EGGlogU — Flocks Module
 * Flock management, lifecycle, breed info, health scoring.
 * Extracted from egglogu.js lines ~3052-3172.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, fmtNum, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { sanitizeHTML } from '@core/security.js';
import { getData, saveData, addRecord, updateRecord, deleteRecord } from '@core/data.js';

// ── Flock CRUD ──────────────────────────────────────────

export function addFlock(flock) {
  const entry = {
    id: genId(),
    name: flock.name,
    breed: flock.breed || '',
    count: Number(flock.count) || 0,
    initialCount: Number(flock.count) || 0,
    status: flock.status || 'produccion',
    housingType: flock.housingType || 'floor',
    targetCurve: flock.breed || flock.targetCurve || '',
    curveAdjust: parseFloat(flock.curveAdjust) || 1.0,
    birthDate: flock.birthDate || '',
    purchaseDate: flock.purchaseDate || '',
    supplier: flock.supplier || '',
    cost: Number(flock.cost) || 0,
    purchaseCostPerBird: flock.purchaseCostPerBird != null ? Number(flock.purchaseCostPerBird) : null,
    notes: flock.notes || '',
    createdAt: new Date().toISOString(),
  };

  addRecord('flocks', entry);
  bus.emit(Events.FLOCK_UPDATED, entry);
  return entry;
}

export function updateFlock(id, changes) {
  const updated = updateRecord('flocks', id, changes);
  if (updated) bus.emit(Events.FLOCK_UPDATED, updated);
  return updated;
}

export function deleteFlock(id) {
  const data = getData();
  const flock = data.flocks.find((f) => f.id === id);
  if (!flock) return null;

  // Cascade delete related records
  data.flocks = data.flocks.filter((f) => f.id !== id);
  data.dailyProduction = data.dailyProduction.filter((p) => p.flockId !== id);
  data.vaccines = data.vaccines.filter((v) => v.flockId !== id);
  data.medications = data.medications.filter((m) => m.flockId !== id);
  data.outbreaks = data.outbreaks.filter((o) => o.flockId !== id);
  data.feed.consumption = data.feed.consumption.filter((c) => c.flockId !== id);
  data.traceability.batches = data.traceability.batches.filter((b) => b.flockId !== id);

  saveData();
  bus.emit(Events.FLOCK_UPDATED, { id, deleted: true });
  return flock;
}

// ── Flock Calculations ──────────────────────────────────

export function activeHens() {
  const data = getData();
  return data.flocks
    .filter((f) => f.status !== 'descarte')
    .reduce((s, f) => {
      const deaths = data.dailyProduction
        .filter((p) => p.flockId === f.id)
        .reduce((d, p) => d + (p.deaths || 0), 0);
      return s + ((f.initialCount || f.count || 0) - deaths);
    }, 0);
}

export function activeHensByFlock(flockId) {
  const data = getData();
  const flock = data.flocks.find((f) => f.id === flockId);
  if (!flock) return 0;
  const deaths = data.dailyProduction
    .filter((p) => p.flockId === flockId)
    .reduce((d, p) => d + (p.deaths || 0), 0);
  return (flock.initialCount || flock.count || 0) - deaths;
}

export function flockAge(flock) {
  if (!flock.birthDate) return { weeks: 0, days: 0 };
  const birth = new Date(flock.birthDate);
  const now = new Date();
  const diffMs = now - birth;
  const diffDays = Math.floor(diffMs / 86400000);
  return {
    weeks: Math.floor(diffDays / 7),
    days: diffDays,
  };
}

export function getFlocksByStatus(status) {
  const data = getData();
  return data.flocks.filter((f) => f.status === status);
}

export function getActiveFlocks() {
  const data = getData();
  return data.flocks.filter((f) => f.status !== 'descarte');
}

// ── Flock Statistics ────────────────────────────────────

export function getFlockStats(flockId) {
  const data = getData();
  const flock = data.flocks.find((f) => f.id === flockId);
  if (!flock) return null;

  const production = data.dailyProduction.filter((p) => p.flockId === flockId);
  const totalEggs = production.reduce((s, p) => s + (p.eggsCollected || p.eggs || 0), 0);
  const totalDeaths = production.reduce((s, p) => s + (p.deaths || 0), 0);
  const currentHens = (flock.initialCount || flock.count || 0) - totalDeaths;
  const mortality = flock.count > 0 ? (totalDeaths / flock.count) * 100 : 0;

  // Last 7 days avg
  const last7 = production.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const avgEggs = last7.length > 0 ? last7.reduce((s, p) => s + (p.eggsCollected || 0), 0) / last7.length : 0;
  const henDay = currentHens > 0 ? (avgEggs / currentHens) * 100 : 0;

  return {
    flock,
    totalEggs,
    totalDeaths,
    currentHens,
    mortality,
    henDay,
    avgEggsPerDay: avgEggs,
    age: flockAge(flock),
  };
}

// Backward compatibility
window.addFlock = addFlock;
window.updateFlock = updateFlock;
window.deleteFlock = deleteFlock;
window.activeHens = activeHens;
window.activeHensByFlock = activeHensByFlock;
window.flockAge = flockAge;
