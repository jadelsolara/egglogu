/**
 * EGGlogU — Render Utilities
 * Shared rendering helpers for modular UI code.
 * Wraps monolith globals during the coexistence phase.
 */

import { sanitizeHTML, escapeAttr } from './security.js';
import { fmtNum, fmtDate, $ } from './utils.js';
import { t } from './translations.js';

// ── KPI Card ────────────────────────────────────────────

export function kpi(label, value, sub, cls = '', info = '') {
  // Delegate to monolith if available (keeps toggleKpiTip wiring)
  if (typeof window.kpi === 'function') return window.kpi(label, value, sub, cls, info);
  return `<div class="kpi-card ${cls}">${info ? '<button class="kpi-info-btn" onclick="event.stopPropagation();toggleKpiTip(this,\'' + info.replace(/'/g, '\\x27').replace(/"/g, '&quot;') + '\')">i</button>' : ''}<div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub || ''}</div></div>`;
}

// ── Empty State ─────────────────────────────────────────

export function emptyState(icon, msg, btn, act) {
  if (typeof window.emptyState === 'function') return window.emptyState(icon, msg, btn, act);
  let h = `<div class="empty-state"><div class="empty-icon">${sanitizeHTML(icon)}</div><p>${sanitizeHTML(msg)}</p>`;
  if (btn) h += `<button class="btn btn-primary" onclick="${escapeAttr(act)}">${sanitizeHTML(btn)}</button>`;
  return h + '</div>';
}

// ── Modal ───────────────────────────────────────────────

export function openModal(title, body) {
  if (typeof window.openModal === 'function') return window.openModal(title, body);
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  $('modal-overlay').classList.add('open');
}

export function closeModal() {
  if (typeof window.closeModal === 'function') return window.closeModal();
  $('modal-overlay').classList.remove('open');
}

// ── Toast ───────────────────────────────────────────────

export function toast(msg, err = false) {
  if (typeof window.toast === 'function') return window.toast(msg, err);
  const e = $('toast');
  if (!e) return;
  e.textContent = msg;
  e.className = 'toast show' + (err ? ' error' : '');
  setTimeout(() => e.className = 'toast', 3000);
}

// ── Pagination ──────────────────────────────────────────

const PAGE_SIZE = 50;

export function paginate(arr, page, size) {
  size = size || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(arr.length / size));
  const p = Math.max(1, Math.min(page || 1, totalPages));
  return { items: arr.slice((p - 1) * size, p * size), totalPages, page: p, total: arr.length };
}

export function paginationControls(stateKey, currentPage, totalPages, callbackName) {
  if (totalPages <= 1) return '';
  let h = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap">';
  h += `<button class="btn btn-sm btn-secondary" onclick="window.__pageState['${stateKey}']=${Math.max(1, currentPage - 1)};${callbackName}()" ${currentPage <= 1 ? 'disabled' : ''}>◀</button>`;
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    h += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-secondary'}" onclick="window.__pageState['${stateKey}']=${i};${callbackName}()">${i}</button>`;
  }
  h += `<button class="btn btn-sm btn-secondary" onclick="window.__pageState['${stateKey}']=${Math.min(totalPages, currentPage + 1)};${callbackName}()" ${currentPage >= totalPages ? 'disabled' : ''}>▶</button>`;
  h += `<span style="color:var(--text-light);font-size:13px;margin-left:8px">${currentPage}/${totalPages}</span></div>`;
  return h;
}

// Page state store (shared with monolith's _pageState)
if (!window.__pageState) window.__pageState = {};

// ── Validation Wrappers ─────────────────────────────────

export function validateForm(fields) {
  if (typeof window.validateForm === 'function') return window.validateForm(fields);
  return { valid: true, errors: {} };
}

export function clearFieldErrors() {
  if (typeof window.clearFieldErrors === 'function') window.clearFieldErrors();
}

export function showFieldError(fieldId, msg) {
  if (typeof window.showFieldError === 'function') window.showFieldError(fieldId, msg);
}

export function showConfirm(msg) {
  if (typeof window.showConfirm === 'function') return window.showConfirm(msg);
  return Promise.resolve(confirm(msg));
}

// ── Catalog Helper ──────────────────────────────────────

export function catalogSelect(items, sel, addOther = true) {
  if (typeof window.catalogSelect === 'function') return window.catalogSelect(items, sel, addOther);
  let h = '<option value="">--</option>';
  (items || []).forEach(item => {
    const v = typeof item === 'string' ? item : item.name || item.id;
    const lbl = typeof item === 'string' ? item : item.name;
    h += `<option value="${escapeAttr(v)}"${v === sel ? ' selected' : ''}>${sanitizeHTML(lbl)}</option>`;
  });
  if (addOther) h += '<option value="__other__">Otra...</option>';
  return h;
}

// ── Flock Select ────────────────────────────────────────

export function flockSelect(sel, all = false) {
  if (typeof window.flockSelect === 'function') return window.flockSelect(sel, all);
  return '<option value="">--</option>';
}
