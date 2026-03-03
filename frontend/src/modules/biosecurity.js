/**
 * EGGlogU — Biosecurity Module
 * Visitors, zones, pest sightings, protocols management.
 * Extracted from egglogu.js lines ~7524-7766.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Visitors ─────────────────────────────────────────────

export function addVisitor(visitor) {
  const data = getData();
  const entry = {
    id: genId(),
    date: visitor.date || todayStr(),
    name: visitor.name,
    company: visitor.company || '',
    purpose: visitor.purpose || '',
    zone: visitor.zone || '',
    vehiclePlate: visitor.vehiclePlate || '',
    disinfected: !!visitor.disinfected,
    fromFarmId: visitor.fromFarmId || '',
    fromFarmHealth: visitor.fromFarmHealth || 'healthy',
    notes: visitor.notes || '',
    createdAt: new Date().toISOString(),
  };

  data.biosecurity.visitors.push(entry);
  saveData();
  return entry;
}

export function updateVisitor(id, changes) {
  const data = getData();
  const idx = data.biosecurity.visitors.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  data.biosecurity.visitors[idx] = { ...data.biosecurity.visitors[idx], ...changes };
  saveData();
  return data.biosecurity.visitors[idx];
}

export function deleteVisitor(id) {
  const data = getData();
  data.biosecurity.visitors = data.biosecurity.visitors.filter((v) => v.id !== id);
  saveData();
}

// ── Zones ────────────────────────────────────────────────

export function addZone(zone) {
  const data = getData();
  const entry = {
    id: genId(),
    name: zone.name,
    riskLevel: zone.riskLevel || 'green',
    lastDisinfection: zone.lastDisinfection || '',
    frequencyDays: parseInt(zone.frequencyDays) || 0,
    notes: zone.notes || '',
    createdAt: new Date().toISOString(),
  };

  data.biosecurity.zones.push(entry);
  saveData();
  return entry;
}

export function updateZone(id, changes) {
  const data = getData();
  const idx = data.biosecurity.zones.findIndex((z) => z.id === id);
  if (idx < 0) return null;
  data.biosecurity.zones[idx] = { ...data.biosecurity.zones[idx], ...changes };
  saveData();
  return data.biosecurity.zones[idx];
}

export function deleteZone(id) {
  const data = getData();
  data.biosecurity.zones = data.biosecurity.zones.filter((z) => z.id !== id);
  saveData();
}

export function getOverdueZones() {
  const data = getData();
  const today = todayStr();
  return data.biosecurity.zones.filter((z) => {
    if (!z.lastDisinfection || !z.frequencyDays) return false;
    const next = new Date(z.lastDisinfection + 'T12:00:00');
    next.setDate(next.getDate() + z.frequencyDays);
    return next.toISOString().substring(0, 10) < today;
  });
}

// ── Pest Sightings ───────────────────────────────────────

export function addPestSighting(pest) {
  const data = getData();
  const entry = {
    id: genId(),
    date: pest.date || todayStr(),
    type: pest.type || 'other',
    location: pest.location || '',
    severity: parseInt(pest.severity) || 3,
    action: pest.action || '',
    resolved: false,
    createdAt: new Date().toISOString(),
  };

  data.biosecurity.pestSightings.push(entry);
  saveData();
  return entry;
}

export function updatePestSighting(id, changes) {
  const data = getData();
  const idx = data.biosecurity.pestSightings.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  data.biosecurity.pestSightings[idx] = { ...data.biosecurity.pestSightings[idx], ...changes };
  saveData();
  return data.biosecurity.pestSightings[idx];
}

export function resolvePestSighting(id) {
  const data = getData();
  const pest = data.biosecurity.pestSightings.find((p) => p.id === id);
  if (!pest) return null;
  pest.resolved = true;
  saveData();
  return pest;
}

export function deletePestSighting(id) {
  const data = getData();
  data.biosecurity.pestSightings = data.biosecurity.pestSightings.filter((p) => p.id !== id);
  saveData();
}

export function getUnresolvedPests() {
  const data = getData();
  return data.biosecurity.pestSightings.filter((p) => !p.resolved);
}

// ── Protocols ────────────────────────────────────────────

export function addProtocol(protocol) {
  const data = getData();
  const entry = {
    id: genId(),
    name: protocol.name,
    frequency: protocol.frequency || 'weekly',
    items: protocol.items || [],
    lastCompleted: null,
    createdAt: new Date().toISOString(),
  };

  data.biosecurity.protocols.push(entry);
  saveData();
  return entry;
}

export function updateProtocol(id, changes) {
  const data = getData();
  const idx = data.biosecurity.protocols.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  data.biosecurity.protocols[idx] = { ...data.biosecurity.protocols[idx], ...changes };
  saveData();
  return data.biosecurity.protocols[idx];
}

export function completeProtocol(id) {
  const data = getData();
  const protocol = data.biosecurity.protocols.find((p) => p.id === id);
  if (!protocol) return null;
  protocol.lastCompleted = todayStr();
  saveData();
  return protocol;
}

export function deleteProtocol(id) {
  const data = getData();
  data.biosecurity.protocols = data.biosecurity.protocols.filter((p) => p.id !== id);
  saveData();
}

export function getOverdueProtocols() {
  const data = getData();
  const today = todayStr();
  return data.biosecurity.protocols.filter((p) => {
    if (!p.lastCompleted) return true;
    const freqDays = { daily: 1, weekly: 7, monthly: 30 }[p.frequency] || 7;
    const next = new Date(p.lastCompleted + 'T12:00:00');
    next.setDate(next.getDate() + freqDays);
    return next.toISOString().substring(0, 10) < today;
  });
}

// ── Pest Score ───────────────────────────────────────────

export function computePestScore() {
  const data = getData();
  const bio = data.biosecurity;
  let score = 0;

  const unresolved = bio.pestSightings.filter((p) => !p.resolved);
  score += Math.min(40, unresolved.length * 10);
  score += Math.min(20, unresolved.reduce((s, p) => s + (p.severity || 1), 0) * 2);

  const redZones = bio.zones.filter((z) => z.riskLevel === 'red').length;
  const yellowZones = bio.zones.filter((z) => z.riskLevel === 'yellow').length;
  score += redZones * 15 + yellowZones * 5;

  const today = todayStr();
  bio.zones.forEach((z) => {
    if (z.lastDisinfection && z.frequencyDays) {
      const next = new Date(z.lastDisinfection + 'T12:00:00');
      next.setDate(next.getDate() + z.frequencyDays);
      if (next.toISOString().substring(0, 10) < today) score += 10;
    }
  });

  return Math.min(100, Math.round(score));
}

// ── Stats ────────────────────────────────────────────────

export function getBiosecurityStats() {
  const data = getData();
  const bio = data.biosecurity;
  return {
    visitors: bio.visitors.length,
    zones: bio.zones.length,
    unresolvedPests: bio.pestSightings.filter((p) => !p.resolved).length,
    protocols: bio.protocols.length,
    overdueProtocols: getOverdueProtocols().length,
    overdueZones: getOverdueZones().length,
    pestScore: computePestScore(),
  };
}

// Backward compatibility
window.computePestScore = computePestScore;
window.addVisitor = addVisitor;
window.addPestSighting = addPestSighting;
window.resolveBioPest = resolvePestSighting;
window.completeBioProtocol = completeProtocol;
