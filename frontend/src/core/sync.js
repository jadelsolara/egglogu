/**
 * EGGlogU — Sync Engine
 * Handles bidirectional sync between local IndexedDB/localStorage and backend API.
 * Extracted from egglogu.js sync-related functions.
 */

import { bus, Events } from './event-bus.js';
import { apiService } from './api-service.js';
import { getData, saveData } from './data.js';

let syncTimer = null;
const SYNC_INTERVAL = 60000; // 1 minute

// ── Sync to Server ──────────────────────────────────────

export async function syncToServer() {
  if (!apiService.isLoggedIn() || !navigator.onLine) return;

  const data = getData();
  const lastSynced = localStorage.getItem('egglogu_last_sync') || '1970-01-01T00:00:00Z';

  bus.emit(Events.SYNC_STARTED);

  try {
    const payload = {
      last_synced_at: lastSynced,
      changes: {
        flocks: filterModifiedSince(data.flocks, lastSynced),
        daily_production: filterModifiedSince(data.dailyProduction, lastSynced),
        vaccines: filterModifiedSince(data.vaccines, lastSynced),
        medications: filterModifiedSince(data.medications, lastSynced),
        feed_purchases: filterModifiedSince(data.feed?.purchases, lastSynced),
        feed_consumption: filterModifiedSince(data.feed?.consumption, lastSynced),
        clients: filterModifiedSince(data.clients, lastSynced),
        finances_income: filterModifiedSince(data.finances?.income, lastSynced),
        finances_expenses: filterModifiedSince(data.finances?.expenses, lastSynced),
        environment: filterModifiedSince(data.environment, lastSynced),
      },
    };

    const result = await apiService.syncToServer(payload);

    // Merge server changes back to local
    if (result && result.server_changes) {
      mergeServerChanges(result.server_changes);
    }

    localStorage.setItem('egglogu_last_sync', new Date().toISOString());
    bus.emit(Events.SYNC_COMPLETED, result);
  } catch (e) {
    console.error('[Sync] Failed:', e.message);
    bus.emit(Events.SYNC_FAILED, { error: e.message });
  }
}

// ── Schedule Auto-Sync ──────────────────────────────────

export function scheduleSyncToServer() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    await syncToServer();
    scheduleSyncToServer(); // Re-schedule
  }, SYNC_INTERVAL);
}

export function stopSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

// ── Helpers ─────────────────────────────────────────────

function filterModifiedSince(arr, since) {
  if (!Array.isArray(arr)) return [];
  const sinceDate = new Date(since);
  return arr.filter((item) => {
    const mod = item.updatedAt || item.createdAt || item.date;
    return mod && new Date(mod) > sinceDate;
  });
}

function mergeServerChanges(changes) {
  const data = getData();

  const merge = (localArr, serverArr, key = 'id') => {
    if (!Array.isArray(serverArr)) return;
    for (const item of serverArr) {
      const idx = localArr.findIndex((l) => l[key] === item[key]);
      if (idx >= 0) {
        // Server wins on conflicts (server timestamp is more recent)
        Object.assign(localArr[idx], item);
      } else {
        localArr.push(item);
      }
    }
  };

  if (changes.flocks) merge(data.flocks, changes.flocks);
  if (changes.daily_production) merge(data.dailyProduction, changes.daily_production);
  if (changes.vaccines) merge(data.vaccines, changes.vaccines);

  saveData();
}

// Backward compatibility
window.scheduleSyncToServer = scheduleSyncToServer;

export default { syncToServer, scheduleSyncToServer, stopSync };
