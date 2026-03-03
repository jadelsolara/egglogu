/**
 * EGGlogU — Operations Module
 * Checklist, logbook, personnel management.
 * Extracted from egglogu.js lines ~4290-4417.
 */

import { bus, Events } from '@core/event-bus.js';
import { genId, todayStr, showToast } from '@core/utils.js';
import { t } from '@core/translations.js';
import { getData, saveData } from '@core/data.js';

// ── Checklist ───────────────────────────────────────────

export function getTodayChecklist() {
  const data = getData();
  const today = todayStr();
  let items = data.checklist.filter((c) => c.date === today);

  // Auto-populate from defaults if empty
  if (!items.length && data.settings.defaultChecklist) {
    data.settings.defaultChecklist.forEach((task) => {
      data.checklist.push({ id: genId(), date: today, task, done: false });
    });
    items = data.checklist.filter((c) => c.date === today);
    saveData();
  }

  return items;
}

export function toggleChecklistItem(id, done) {
  const data = getData();
  const item = data.checklist.find((c) => c.id === id);
  if (item) {
    item.done = !!done;
    saveData();
  }
  return item;
}

export function deleteChecklistItem(id) {
  const data = getData();
  data.checklist = data.checklist.filter((c) => c.id !== id);
  saveData();
}

export function addChecklistTask(task) {
  const data = getData();
  const entry = {
    id: genId(),
    date: todayStr(),
    task: task,
    done: false,
  };
  data.checklist.push(entry);
  saveData();
  return entry;
}

export function getChecklistHistory(days = 7) {
  const data = getData();
  const today = todayStr();
  const dates = [...new Set(data.checklist.map((c) => c.date))]
    .sort()
    .reverse()
    .filter((d) => d !== today)
    .slice(0, days);

  return dates.map((date) => {
    const items = data.checklist.filter((c) => c.date === date);
    const done = items.filter((c) => c.done).length;
    return {
      date,
      total: items.length,
      done,
      completion: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
    };
  });
}

// ── Logbook ─────────────────────────────────────────────

export function addLogEntry(entry) {
  const data = getData();
  const record = {
    id: genId(),
    date: entry.date || todayStr(),
    category: entry.category || 'general',
    entry: entry.entry || '',
    createdAt: new Date().toISOString(),
  };

  data.logbook.push(record);
  saveData();
  return record;
}

export function updateLogEntry(id, changes) {
  const data = getData();
  const idx = data.logbook.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  data.logbook[idx] = { ...data.logbook[idx], ...changes };
  saveData();
  return data.logbook[idx];
}

export function deleteLogEntry(id) {
  const data = getData();
  data.logbook = data.logbook.filter((l) => l.id !== id);
  saveData();
}

export function getLogEntries(category) {
  const data = getData();
  let logs = data.logbook.sort((a, b) => b.date.localeCompare(a.date));
  if (category) logs = logs.filter((l) => l.category === category);
  return logs;
}

// ── Personnel ───────────────────────────────────────────

export function addPersonnel(person) {
  const data = getData();
  const entry = {
    id: genId(),
    name: person.name,
    role: person.role || '',
    salary: parseFloat(person.salary) || 0,
    startDate: person.startDate || '',
    active: person.active !== false,
    notes: person.notes || '',
    createdAt: new Date().toISOString(),
  };

  data.personnel.push(entry);
  saveData();
  return entry;
}

export function updatePersonnel(id, changes) {
  const data = getData();
  const idx = data.personnel.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  data.personnel[idx] = { ...data.personnel[idx], ...changes };
  saveData();
  return data.personnel[idx];
}

export function deletePersonnel(id) {
  const data = getData();
  data.personnel = data.personnel.filter((p) => p.id !== id);
  saveData();
}

export function getPersonnelStats() {
  const data = getData();
  const active = data.personnel.filter((p) => p.active);
  return {
    total: data.personnel.length,
    active: active.length,
    totalSalary: active.reduce((s, p) => s + (p.salary || 0), 0),
  };
}

// Backward compatibility
window.toggleCheck = toggleChecklistItem;
window.addCheckTask = addChecklistTask;
window.addLogEntry = addLogEntry;
window.addPersonnel = addPersonnel;
window.deletePersonnel = deletePersonnel;
