/**
 * EGGlogU — Admin Module
 * Configuration, settings, data management, user administration.
 * Extracted from egglogu.js lines ~6544-7157.
 */

import { bus, Events } from '@core/event-bus.js';
import { todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Farm Config ──────────────────────────────────────────

export function saveFarmConfig(config) {
  const data = getData();
  data.farm.name = config.name || data.farm.name;
  data.farm.location = config.location || data.farm.location;
  data.farm.capacity = parseInt(config.capacity) || data.farm.capacity;
  data.farm.currency = config.currency || data.farm.currency || '$';
  saveData();
}

export function saveWeatherConfig(config) {
  const data = getData();
  data.farm.owmApiKey = config.owmApiKey || '';
  saveData();
}

export function saveMqttConfig(config) {
  const data = getData();
  data.farm.mqttBroker = config.broker || '';
  data.farm.mqttUser = config.user || '';
  data.farm.mqttPass = config.pass || '';
  data.farm.mqttTopicPrefix = config.topicPrefix || 'egglogu/';
  saveData();
}

export function saveGeoConfig(lat, lng) {
  const data = getData();
  data.farm.lat = lat;
  data.farm.lng = lng;
  saveData();
}

// ── Alert Thresholds ─────────────────────────────────────

export function saveAlertConfig(config) {
  const data = getData();
  data.settings.minFeedStock = parseFloat(config.minFeedStock) || 50;
  data.settings.maxMortality = parseFloat(config.maxMortality) || 5;
  data.settings.alertDaysBefore = parseInt(config.alertDaysBefore) || 3;
  saveData();
}

// ── Tax & Depreciation ───────────────────────────────────

export function saveTaxConfig(config) {
  const data = getData();
  data.settings.taxRate = parseFloat(config.taxRate) || 0;
  data.settings.depreciationYears = parseInt(config.depreciationYears) || 5;
  data.settings.assetValue = parseFloat(config.assetValue) || 0;
  saveData();
}

// ── Plan Config ──────────────────────────────────────────

export function savePlanConfig(config) {
  const data = getData();
  if (!data.settings.plan) data.settings.plan = {};
  data.settings.plan.ownerEmail = config.ownerEmail || '';
  data.settings.plan.includedUsers = parseInt(config.includedUsers) || 3;
  data.settings.plan.extraUserCost = parseFloat(config.extraUserCost) || 5;
  data.settings.plan.billingCycle = config.billingCycle || 'monthly';
  data.settings.plan.currency = config.currency || 'USD';
  saveData();
}

// ── Default Checklist ────────────────────────────────────

export function addChecklistDefault(task) {
  const data = getData();
  if (!data.settings.defaultChecklist) data.settings.defaultChecklist = [];
  data.settings.defaultChecklist.push(task);
  saveData();
}

export function removeChecklistDefault(index) {
  const data = getData();
  if (!data.settings.defaultChecklist) return;
  data.settings.defaultChecklist.splice(index, 1);
  saveData();
}

// ── Theme & Accessibility ────────────────────────────────

export function saveTheme(themeName) {
  localStorage.setItem('egglogu_theme', themeName);
}

export function getTheme() {
  return localStorage.getItem('egglogu_theme') || 'blue';
}

export function saveFontScale(scale) {
  const data = getData();
  data.settings.fontScale = scale;
  saveData();
}

export function toggleDarkMode() {
  const data = getData();
  data.settings.darkMode = !data.settings.darkMode;
  saveData();
  return data.settings.darkMode;
}

// ── Data Import / Export ─────────────────────────────────

export function exportData() {
  const data = getData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `egglogu_backup_${todayStr()}.json`;
  a.click();
}

export function importData(jsonString) {
  try {
    const imported = JSON.parse(jsonString);
    if (!imported || typeof imported !== 'object') {
      throw new Error('Invalid data format');
    }
    const data = getData();
    Object.assign(data, imported);
    saveData();
    return true;
  } catch (e) {
    showToast('Import error: ' + e.message, 'error');
    return false;
  }
}

export function resetData() {
  localStorage.removeItem('egglogu_data');
  window.location.reload();
}

// ── Storage Usage ────────────────────────────────────────

export function getStorageUsage() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('egglogu')) {
      total += (localStorage.getItem(key) || '').length * 2; // UTF-16
    }
  }
  return total;
}

export function getStoragePercentage() {
  const used = getStorageUsage();
  const max = 5 * 1024 * 1024; // 5MB
  return Math.min(100, (used / max) * 100);
}

// ── Data Stats ───────────────────────────────────────────

export function getDataStats() {
  const data = getData();
  return {
    flocks: data.flocks.length,
    production: data.dailyProduction.length,
    vaccines: data.vaccines.length,
    medications: data.medications.length,
    outbreaks: data.outbreaks.length,
    feedPurchases: data.feed.purchases.length,
    feedConsumption: data.feed.consumption.length,
    clients: data.clients.length,
    income: data.finances.income.length,
    expenses: data.finances.expenses.length,
    environment: data.environment.length,
    logbook: data.logbook.length,
    personnel: data.personnel.length,
    kpiSnapshots: data.kpiSnapshots.length,
    inventory: data.inventory.length,
    auditLog: data.auditLog.length,
    users: data.users.length,
  };
}

// ── User Role Permissions ────────────────────────────────

export function getCustomPermissions() {
  const data = getData();
  return data.settings.customPermissions || {};
}

export function toggleRolePermission(role, module, enabled) {
  const data = getData();
  if (!data.settings.customPermissions) data.settings.customPermissions = {};
  if (!data.settings.customPermissions[role]) {
    // Copy from defaults
    const defaults = window.ROLE_PERMISSIONS?.[role] || [];
    data.settings.customPermissions[role] = [...defaults];
  }

  const perms = data.settings.customPermissions[role];
  if (enabled && !perms.includes(module)) {
    perms.push(module);
  } else if (!enabled) {
    data.settings.customPermissions[role] = perms.filter((m) => m !== module);
  }
  saveData();
}

export function resetPermissionsToDefault() {
  const data = getData();
  delete data.settings.customPermissions;
  saveData();
}

// ── Campo / Vet Mode ─────────────────────────────────────

export function toggleCampoMode() {
  const data = getData();
  data.settings.campoMode = !data.settings.campoMode;
  if (data.settings.campoMode) data.settings.vetMode = false;
  saveData();
  return data.settings.campoMode;
}

export function toggleVetMode() {
  const data = getData();
  data.settings.vetMode = !data.settings.vetMode;
  if (data.settings.vetMode) data.settings.campoMode = false;
  saveData();
  return data.settings.vetMode;
}

export function getActiveMode() {
  const data = getData();
  if (data.settings.campoMode) return 'campo';
  if (data.settings.vetMode) return 'vet';
  return 'normal';
}

// Backward compatibility
window.saveConfig = saveFarmConfig;
window.saveAlertConfig = saveAlertConfig;
window.exportData = exportData;
window.resetData = resetData;
window.toggleCampoMode = toggleCampoMode;
window.toggleVetMode = toggleVetMode;
window.getStorageUsage = getStorageUsage;
