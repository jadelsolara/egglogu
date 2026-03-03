/**
 * EGGlogU — Planning Module
 * Production plans, flock allocation, estimation curves.
 * Extracted from egglogu.js lines ~7883-7964.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Breed Curves Reference ───────────────────────────────
// Production curves are stored in BREED_CURVES on window (from monolith)
// Each curve: array of hen-day % values starting from week 18

function getBreedCurve(breed) {
  const curves = window.BREED_CURVES || {};
  return curves[breed] || curves.generic || [90];
}

// ── Active Hens Helper ───────────────────────────────────

function activeHensByFlock(flockId) {
  const data = getData();
  const flock = data.flocks.find((f) => f.id === flockId);
  if (!flock) return 0;
  const deaths = data.dailyProduction
    .filter((p) => p.flockId === flockId)
    .reduce((s, p) => s + (p.deaths || 0), 0);
  return (flock.initialCount || flock.count || 0) - deaths;
}

// ── Production Estimation ────────────────────────────────

export function estimateProduction(flockId, fromDate, toDate) {
  const data = getData();
  const flock = data.flocks.find((f) => f.id === flockId);
  if (!flock || !flock.birthdate) return 0;

  const breed = flock.breed || flock.targetCurve || 'generic';
  const curve = getBreedCurve(breed);
  const birth = new Date(flock.birthdate + 'T12:00:00');
  const from = new Date(fromDate + 'T12:00:00');
  const to = new Date(toDate + 'T12:00:00');
  const hens = activeHensByFlock(flockId);
  const adj = flock.curveAdjust != null ? flock.curveAdjust : 1.0;

  let total = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const ageWeeks = Math.floor((d - birth) / (7 * 24 * 3600000));
    const weekIdx = ageWeeks - 18;
    if (weekIdx < 0) continue;
    const henDay = weekIdx < curve.length ? curve[weekIdx] : curve[curve.length - 1];
    total += hens * (henDay / 100) * adj;
  }

  return Math.round(total);
}

export function estimateTotalProduction(plan) {
  const data = getData();

  if (!plan.flockAllocations || !plan.flockAllocations.length) {
    let total = 0;
    data.flocks
      .filter((f) => f.status !== 'descarte')
      .forEach((f) => {
        total += estimateProduction(f.id, todayStr(), plan.targetDate);
      });
    return total;
  }

  return plan.flockAllocations.reduce(
    (s, a) => s + (a.expectedEggs || estimateProduction(a.flockId, todayStr(), plan.targetDate)),
    0
  );
}

// ── Plan CRUD ────────────────────────────────────────────

export function addPlan(plan) {
  const data = getData();
  const entry = {
    id: genId(),
    name: plan.name,
    targetDate: plan.targetDate,
    eggsNeeded: parseInt(plan.eggsNeeded) || 0,
    clientId: plan.clientId || '',
    notes: plan.notes || '',
    flockAllocations: plan.flockAllocations || [],
    createdAt: new Date().toISOString(),
  };

  data.productionPlans.push(entry);
  saveData();
  return entry;
}

export function updatePlan(id, changes) {
  const data = getData();
  const idx = data.productionPlans.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  data.productionPlans[idx] = { ...data.productionPlans[idx], ...changes };
  saveData();
  return data.productionPlans[idx];
}

export function deletePlan(id) {
  const data = getData();
  data.productionPlans = data.productionPlans.filter((p) => p.id !== id);
  saveData();
}

// ── Plan Status ──────────────────────────────────────────

export function getPlanStatus(plan) {
  const totalExpected = estimateTotalProduction(plan);
  const gap = totalExpected - plan.eggsNeeded;
  const pct = plan.eggsNeeded > 0 ? (totalExpected / plan.eggsNeeded) * 100 : 0;
  const status = pct >= 100 ? 'on_track' : pct >= 80 ? 'behind' : 'critical';

  return {
    totalExpected,
    gap,
    percentage: Math.round(pct),
    status,
  };
}

export function getAllPlanStatuses() {
  const data = getData();
  return data.productionPlans.map((plan) => ({
    ...plan,
    ...getPlanStatus(plan),
  }));
}

// Backward compatibility
window.estimateProduction = estimateProduction;
window.estimateTotalProduction = estimateTotalProduction;
window.savePlan = addPlan;
window.deletePlan = deletePlan;
