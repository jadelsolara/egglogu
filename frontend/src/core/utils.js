/**
 * EGGlogU — Core Utilities
 * Shared utility functions used across all modules.
 * Extracted from egglogu.js lines 990-1001.
 */

// DOM shorthand
export const $ = (id) => document.getElementById(id);

// Number formatting
export function fmtNum(n, d = 0) {
  return Number(n || 0).toLocaleString(locale(), {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function fmtMoney(n) {
  return currency() + fmtNum(n, 2);
}

export function fmtDate(d) {
  if (!d) return '-';
  return new Date(d + 'T12:00:00').toLocaleDateString(locale());
}

export function fmtPercent(n, d = 1) {
  return fmtNum(n, d) + '%';
}

// ID generation
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Date helpers
export function todayStr() {
  return new Date().toISOString().substring(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
}

export function daysBetween(d1, d2) {
  const a = new Date(d1 + 'T00:00:00');
  const b = new Date(d2 + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// Locale helpers (rely on global state during migration)
export function locale() {
  const lang = window.LANG || localStorage.getItem('egglogu_lang') || 'es';
  const map = { es: 'es-CL', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ja: 'ja-JP', zh: 'zh-CN' };
  return map[lang] || 'es-CL';
}

export function currency() {
  try {
    const data = window.DATA || JSON.parse(localStorage.getItem('egglogu_data') || '{}');
    return (data.farm && data.farm.currency) || '$';
  } catch {
    return '$';
  }
}

// Array helpers
export function sumBy(arr, key) {
  return (arr || []).reduce((s, item) => s + (Number(item[key]) || 0), 0);
}

export function avgBy(arr, key) {
  if (!arr || !arr.length) return 0;
  return sumBy(arr, key) / arr.length;
}

export function groupBy(arr, key) {
  return (arr || []).reduce((groups, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    (groups[k] = groups[k] || []).push(item);
    return groups;
  }, {});
}

export function sortBy(arr, key, desc = false) {
  return [...(arr || [])].sort((a, b) => {
    const va = typeof key === 'function' ? key(a) : a[key];
    const vb = typeof key === 'function' ? key(b) : b[key];
    if (va < vb) return desc ? 1 : -1;
    if (va > vb) return desc ? -1 : 1;
    return 0;
  });
}

// Debounce
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Throttle
export function throttle(fn, ms = 300) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

// Toast notification
export function showToast(msg, type = 'success', duration = 3000) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, duration);
}

// Safe localStorage
export function safeGetItem(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('[Storage] Failed to write:', key, e.message);
    return false;
  }
}

export function safeGetJSON(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

// Backward compatibility: expose on window
window.$ = $;
window.fmtNum = fmtNum;
window.fmtMoney = fmtMoney;
window.fmtDate = fmtDate;
window.genId = genId;
window.todayStr = todayStr;
window.currency = currency;
window.locale = locale;
window.showToast = showToast;
