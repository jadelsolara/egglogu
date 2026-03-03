/**
 * EGGlogU — Health & Sanidad Module
 * Vaccines, medications, outbreaks, stress events.
 * Extracted from egglogu.js lines ~3258-3447, 7157-7519.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData, addRecord, updateRecord, deleteRecord } from '@core/data.js';

// ── Vaccines ────────────────────────────────────────────

export function addVaccine(vaccine) {
  const entry = {
    id: genId(),
    flockId: vaccine.flockId,
    vaccine: vaccine.vaccine,
    scheduledDate: vaccine.scheduledDate,
    appliedDate: vaccine.appliedDate || null,
    batch: vaccine.batch || '',
    route: vaccine.route || '',
    notes: vaccine.notes || '',
    createdAt: new Date().toISOString(),
  };

  addRecord('vaccines', entry);
  bus.emit(Events.VACCINE_APPLIED, entry);
  return entry;
}

export function markVaccineApplied(id) {
  const updated = updateRecord('vaccines', id, {
    appliedDate: todayStr(),
  });
  if (updated) bus.emit(Events.VACCINE_APPLIED, updated);
  return updated;
}

export function getOverdueVaccines() {
  const data = getData();
  const today = todayStr();
  return (data.vaccines || []).filter(
    (v) => !v.appliedDate && v.scheduledDate && v.scheduledDate < today
  );
}

export function getUpcomingVaccines(days = 7) {
  const data = getData();
  const today = todayStr();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  return (data.vaccines || []).filter(
    (v) => !v.appliedDate && v.scheduledDate && v.scheduledDate >= today && v.scheduledDate <= cutoffStr
  );
}

// ── Medications ─────────────────────────────────────────

export function addMedication(med) {
  const entry = {
    id: genId(),
    flockId: med.flockId,
    name: med.name,
    reason: med.reason || '',
    start: med.start || todayStr(),
    end: med.end || '',
    withdrawalDays: Number(med.withdrawalDays) || 0,
    dosage: med.dosage || '',
    notes: med.notes || '',
    createdAt: new Date().toISOString(),
  };

  addRecord('medications', entry);
  bus.emit(Events.MEDICATION_ADDED, entry);
  return entry;
}

export function getActiveWithdrawals() {
  const data = getData();
  const today = new Date();
  return (data.medications || []).filter((m) => {
    if (!m.end || !m.withdrawalDays) return false;
    const withdrawalEnd = new Date(m.end);
    withdrawalEnd.setDate(withdrawalEnd.getDate() + m.withdrawalDays);
    return withdrawalEnd > today;
  });
}

// ── Outbreaks ───────────────────────────────────────────

export function addOutbreak(outbreak) {
  const entry = {
    id: genId(),
    flockId: outbreak.flockId,
    disease: outbreak.disease,
    start: outbreak.start || todayStr(),
    end: null,
    affected: Number(outbreak.affected) || 0,
    deaths: Number(outbreak.deaths) || 0,
    symptoms: outbreak.symptoms || '',
    treatment: outbreak.treatment || '',
    economicLoss: Number(outbreak.economicLoss) || 0,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  addRecord('outbreaks', entry);
  bus.emit(Events.OUTBREAK_REPORTED, entry);
  return entry;
}

export function resolveOutbreak(id) {
  return updateRecord('outbreaks', id, {
    status: 'resolved',
    end: todayStr(),
  });
}

export function getActiveOutbreaks() {
  const data = getData();
  return (data.outbreaks || []).filter((o) => o.status === 'active');
}

// ── Stress Events ───────────────────────────────────────

export function addStressEvent(event) {
  const entry = {
    id: genId(),
    type: event.type,
    severity: event.severity || 'medium',
    description: event.description || '',
    date: event.date || todayStr(),
    auto: event.auto || false,
    createdAt: new Date().toISOString(),
  };

  addRecord('stressEvents', entry);
  return entry;
}

// Backward compatibility
window.addVaccine = addVaccine;
window.markVaccineApplied = markVaccineApplied;
window.addMedication = addMedication;
window.addOutbreak = addOutbreak;
window.addStressEvent = addStressEvent;
