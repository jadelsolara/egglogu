/**
 * EGGlogU — Traceability Module
 * Batch tracking, QR codes, health scores, CSV export.
 * Extracted from egglogu.js lines ~7769-7880.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, fmtNum, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Batch CRUD ───────────────────────────────────────────

export function addBatch(batch) {
  const data = getData();
  const entry = {
    id: genId(),
    date: batch.date || todayStr(),
    flockId: batch.flockId,
    house: batch.house || '',
    rackNumber: batch.rackNumber || '',
    boxCount: parseInt(batch.boxCount) || 0,
    eggsPerBox: parseInt(batch.eggsPerBox) || 30,
    eggType: batch.eggType || 'conventional',
    clientId: batch.clientId || '',
    deliveryDate: batch.deliveryDate || '',
    notes: batch.notes || '',
    createdAt: new Date().toISOString(),
  };

  entry.qrCode = `EGGLOGU|BATCH:${entry.id}|FLOCK:${entry.flockId}|DATE:${entry.date}|HOUSE:${entry.house}|TYPE:${entry.eggType}`;
  data.traceability.batches.push(entry);
  saveData();
  return entry;
}

export function updateBatch(id, changes) {
  const data = getData();
  const idx = data.traceability.batches.findIndex((b) => b.id === id);
  if (idx < 0) return null;

  const updated = { ...data.traceability.batches[idx], ...changes };
  updated.qrCode = `EGGLOGU|BATCH:${id}|FLOCK:${updated.flockId}|DATE:${updated.date}|HOUSE:${updated.house}|TYPE:${updated.eggType}`;
  data.traceability.batches[idx] = updated;
  saveData();
  return updated;
}

export function deleteBatch(id) {
  const data = getData();
  data.traceability.batches = data.traceability.batches.filter((b) => b.id !== id);
  saveData();
}

// ── Batch Queries ────────────────────────────────────────

export function getBatchById(id) {
  const data = getData();
  return data.traceability.batches.find((b) => b.id === id) || null;
}

export function searchBatches(query) {
  const data = getData();
  if (!query) return data.traceability.batches;

  const q = query.toLowerCase();
  return data.traceability.batches.filter((b) => {
    const flock = data.flocks.find((f) => f.id === b.flockId);
    const client = data.clients.find((c) => c.id === b.clientId);
    return (
      b.id.toLowerCase().includes(q) ||
      (b.qrCode || '').toLowerCase().includes(q) ||
      (b.house || '').toLowerCase().includes(q) ||
      (flock ? flock.name.toLowerCase().includes(q) : false) ||
      (client ? client.name.toLowerCase().includes(q) : false) ||
      (b.eggType || '').toLowerCase().includes(q) ||
      (b.date || '').includes(q)
    );
  });
}

// ── Batch Availability Check ─────────────────────────────

export function getAvailableEggs(flockId, excludeBatchId) {
  const data = getData();
  const prodEggs = data.dailyProduction
    .filter((p) => p.flockId === flockId)
    .reduce((s, p) => s + (p.eggsCollected || 0), 0);

  const batchedEggs = data.traceability.batches
    .filter((b) => b.flockId === flockId && b.id !== (excludeBatchId || ''))
    .reduce((s, b) => s + (b.boxCount || 0) * (b.eggsPerBox || 0), 0);

  return prodEggs - batchedEggs;
}

// ── Flock Health Score ───────────────────────────────────

export function computeFlockHealthScore(flockId) {
  const data = getData();
  let score = 100;

  const flock = data.flocks.find((f) => f.id === flockId);
  if (!flock) return 0;

  const deaths = data.dailyProduction
    .filter((p) => p.flockId === flockId)
    .reduce((s, p) => s + (p.deaths || 0), 0);

  const mortality = flock.count > 0 ? (deaths / flock.count) * 100 : 0;
  score -= Math.min(30, mortality * 3);

  const activeOutbreaks = data.outbreaks
    .filter((o) => o.flockId === flockId && o.status === 'active').length;
  score -= activeOutbreaks * 20;

  return Math.max(0, Math.round(score));
}

// ── Batch Trace (Origin Data) ────────────────────────────

export function getBatchTrace(batchId) {
  const data = getData();
  const batch = data.traceability.batches.find((b) => b.id === batchId);
  if (!batch) return null;

  const flock = data.flocks.find((f) => f.id === batch.flockId);
  const client = data.clients.find((c) => c.id === batch.clientId);
  const healthScore = flock ? computeFlockHealthScore(flock.id) : 0;

  return {
    batch,
    flock: flock || null,
    client: client || null,
    healthScore,
    qrCode: batch.qrCode || 'N/A',
  };
}

// ── CSV Export ───────────────────────────────────────────

export function exportBatchCSV() {
  const data = getData();
  const batches = data.traceability.batches;
  if (!batches.length) return;

  const esc = (s) => String(s || '').replace(/"/g, '""');
  let csv = 'Batch ID,Date,Flock,House,Rack,Boxes,Eggs/Box,Type,Client,Delivery,QR\n';

  batches.forEach((b) => {
    const f = data.flocks.find((x) => x.id === b.flockId);
    const c = data.clients.find((x) => x.id === b.clientId);
    csv += `"${esc(b.id)}","${b.date}","${esc(f ? f.name : '')}","${esc(b.house)}","${esc(b.rackNumber)}",${b.boxCount},${b.eggsPerBox},"${esc(b.eggType)}","${esc(c ? c.name : '')}","${b.deliveryDate || ''}","${esc(b.qrCode)}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'egglogu_batches.csv';
  a.click();
}

// Backward compatibility
window.saveBatch = addBatch;
window.deleteBatch = deleteBatch;
window.exportBatchCSV = exportBatchCSV;
window.computeFlockHealthScore = computeFlockHealthScore;
