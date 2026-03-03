/**
 * EGGlogU — Feed Module
 * Feed purchases, consumption, stock tracking, FCR calculation.
 * Extracted from egglogu.js lines ~3450-3549.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Feed Purchases ──────────────────────────────────────

export function addFeedPurchase(purchase) {
  const data = getData();
  const entry = {
    id: genId(),
    date: purchase.date || todayStr(),
    type: purchase.type || '',
    quantityKg: parseFloat(purchase.quantityKg) || 0,
    cost: parseFloat(purchase.cost) || 0,
    supplier: purchase.supplier || '',
    createdAt: new Date().toISOString(),
  };

  data.feed.purchases.push(entry);
  saveData();
  bus.emit(Events.FEED_UPDATED, { action: 'purchase', entry });
  return entry;
}

export function updateFeedPurchase(id, changes) {
  const data = getData();
  const idx = data.feed.purchases.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  data.feed.purchases[idx] = { ...data.feed.purchases[idx], ...changes };
  saveData();
  bus.emit(Events.FEED_UPDATED, { action: 'purchase_updated' });
  return data.feed.purchases[idx];
}

export function deleteFeedPurchase(id) {
  const data = getData();
  const removed = data.feed.purchases.find((p) => p.id === id);
  data.feed.purchases = data.feed.purchases.filter((p) => p.id !== id);
  saveData();
  bus.emit(Events.FEED_UPDATED, { action: 'purchase_deleted' });
  return removed;
}

// ── Feed Consumption ────────────────────────────────────

export function addFeedConsumption(consumption) {
  const data = getData();
  const entry = {
    id: genId(),
    date: consumption.date || todayStr(),
    flockId: consumption.flockId || '',
    quantityKg: parseFloat(consumption.quantityKg) || 0,
    type: consumption.type || '',
    createdAt: new Date().toISOString(),
  };

  data.feed.consumption.push(entry);
  saveData();
  bus.emit(Events.FEED_UPDATED, { action: 'consumption', entry });
  return entry;
}

export function updateFeedConsumption(id, changes) {
  const data = getData();
  const idx = data.feed.consumption.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  data.feed.consumption[idx] = { ...data.feed.consumption[idx], ...changes };
  saveData();
  bus.emit(Events.FEED_UPDATED, { action: 'consumption_updated' });
  return data.feed.consumption[idx];
}

export function deleteFeedConsumption(id) {
  const data = getData();
  const removed = data.feed.consumption.find((c) => c.id === id);
  data.feed.consumption = data.feed.consumption.filter((c) => c.id !== id);
  saveData();
  bus.emit(Events.FEED_UPDATED, { action: 'consumption_deleted' });
  return removed;
}

// ── Stock & Analytics ───────────────────────────────────

export function calculateFeedStock() {
  const data = getData();
  const purchased = data.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0);
  const consumed = data.feed.consumption.reduce((s, c) => s + (c.quantityKg || 0), 0);
  return purchased - consumed;
}

export function isLowStock() {
  const data = getData();
  const stock = calculateFeedStock();
  const minStock = data.settings?.minFeedStock || 50;
  return stock < minStock;
}

export function calculateFCR(days = 30) {
  const data = getData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const consumed = data.feed.consumption
    .filter((c) => c.date >= cutoffStr)
    .reduce((s, c) => s + (c.quantityKg || 0), 0);

  const eggsKg = data.dailyProduction
    .filter((p) => p.date >= cutoffStr)
    .reduce((s, p) => s + (p.eggsCollected || 0), 0) * 0.06; // ~60g per egg

  return eggsKg > 0 ? consumed / eggsKg : 0;
}

export function getFeedCostPerKg() {
  const data = getData();
  const totalCost = data.feed.purchases.reduce((s, p) => s + (p.cost || 0), 0);
  const totalKg = data.feed.purchases.reduce((s, p) => s + (p.quantityKg || 0), 0);
  return totalKg > 0 ? totalCost / totalKg : 0;
}

// Backward compatibility
window.addFeedPurchase = addFeedPurchase;
window.addFeedConsumption = addFeedConsumption;
window.calculateFeedStock = calculateFeedStock;
window.calculateFCR = calculateFCR;
