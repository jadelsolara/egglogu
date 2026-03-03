/**
 * EGGlogU — Clients Module
 * Client management and claims tracking.
 * Extracted from egglogu.js lines ~3552-3718.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData, addRecord, updateRecord, deleteRecord } from '@core/data.js';

// ── Client CRUD ─────────────────────────────────────────

export function addClient(client) {
  const entry = {
    id: genId(),
    name: client.name,
    phone: client.phone || '',
    email: client.email || '',
    route: client.route || '',
    address: client.address || '',
    priceS: parseFloat(client.priceS) || 0,
    priceM: parseFloat(client.priceM) || 0,
    priceL: parseFloat(client.priceL) || 0,
    priceXL: parseFloat(client.priceXL) || 0,
    priceJumbo: parseFloat(client.priceJumbo) || 0,
    notes: client.notes || '',
    createdAt: new Date().toISOString(),
  };

  addRecord('clients', entry);
  return entry;
}

export function updateClient(id, changes) {
  return updateRecord('clients', id, changes);
}

export function deleteClient(id) {
  const data = getData();

  // Cascade: clear clientId references in financial records and batches
  data.finances.income.filter((i) => i.clientId === id).forEach((i) => { i.clientId = ''; });
  data.finances.receivables.filter((r) => r.clientId === id).forEach((r) => { r.clientId = ''; });
  data.traceability.batches.filter((b) => b.clientId === id).forEach((b) => { b.clientId = ''; });

  const removed = deleteRecord('clients', id);
  saveData();
  return removed;
}

export function getClientById(id) {
  const data = getData();
  return data.clients.find((c) => c.id === id) || null;
}

// ── Claims ──────────────────────────────────────────────

export function addClaim(claim) {
  const data = getData();
  const entry = {
    id: genId(),
    date: claim.date || todayStr(),
    clientId: claim.clientId,
    batchId: claim.batchId || '',
    category: claim.category || 'other',
    description: claim.description || '',
    severity: Number(claim.severity) || 3,
    status: 'open',
    resolution: '',
    satisfaction: null,
    resolvedDate: '',
    createdAt: new Date().toISOString(),
  };

  if (!data.clientClaims) data.clientClaims = [];
  data.clientClaims.push(entry);
  saveData();
  return entry;
}

export function resolveClaim(id, resolution, satisfaction) {
  const data = getData();
  const claim = (data.clientClaims || []).find((c) => c.id === id);
  if (!claim) return null;

  claim.status = 'resolved';
  claim.resolution = resolution;
  claim.satisfaction = Number(satisfaction) || 0;
  claim.resolvedDate = todayStr();

  saveData();
  return claim;
}

export function progressClaim(id) {
  const data = getData();
  const claim = (data.clientClaims || []).find((c) => c.id === id);
  if (!claim) return null;

  claim.status = 'in_progress';
  saveData();
  return claim;
}

export function deleteClaim(id) {
  const data = getData();
  data.clientClaims = (data.clientClaims || []).filter((c) => c.id !== id);
  saveData();
}

export function getOpenClaims() {
  const data = getData();
  return (data.clientClaims || []).filter((c) => c.status !== 'resolved');
}

export function getClaimStats() {
  const data = getData();
  const claims = data.clientClaims || [];
  const total = claims.length;
  const open = claims.filter((c) => c.status !== 'resolved').length;
  const resolved = claims.filter((c) => c.status === 'resolved').length;
  const resRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const sats = claims.filter((c) => c.satisfaction).map((c) => c.satisfaction);
  const avgSat = sats.length > 0 ? (sats.reduce((a, b) => a + b, 0) / sats.length) : 0;

  return { total, open, resolved, resRate, avgSat };
}

// Backward compatibility
window.addClient = addClient;
window.updateClient = updateClient;
window.deleteClient = deleteClient;
window.addClaim = addClaim;
window.resolveClaim = resolveClaim;
window.progressClaim = progressClaim;
