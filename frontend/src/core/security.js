/**
 * EGGlogU — Security Module
 * XSS prevention, input validation, and password hashing.
 * Extracted from egglogu.js lines 1002-1045, 1201-1260.
 */

import { $ } from './utils.js';

// ── XSS Prevention ──────────────────────────────────────

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export function sanitizeHTML(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c]);
}

export function escapeAttr(str) {
  return sanitizeHTML(String(str || ''));
}

export function safeHTML(tpl, ...vals) {
  return tpl.reduce(
    (out, s, i) => out + s + (i < vals.length ? sanitizeHTML(String(vals[i])) : ''),
    ''
  );
}

// ── Input Validation ────────────────────────────────────

export function validateInput(value, rules = {}) {
  const errors = [];
  const v = typeof value === 'string' ? value.trim() : value;

  if (rules.required && (v === '' || v === null || v === undefined)) {
    errors.push('Required');
  }
  if (rules.minLength && typeof v === 'string' && v.length < rules.minLength) {
    errors.push(`Min length: ${rules.minLength}`);
  }
  if (rules.maxLength && typeof v === 'string' && v.length > rules.maxLength) {
    errors.push(`Max length: ${rules.maxLength}`);
  }
  if (rules.min !== undefined && Number(v) < rules.min) {
    errors.push(`Min: ${rules.min}`);
  }
  if (rules.max !== undefined && Number(v) > rules.max) {
    errors.push(`Max: ${rules.max}`);
  }
  if (rules.pattern && !rules.pattern.test(v)) {
    errors.push(rules.patternMsg || 'Invalid format');
  }
  if (rules.email && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    errors.push('Invalid email');
  }
  if (rules.phone && v && !/^[+\d\s\-()]{6,20}$/.test(v)) {
    errors.push('Invalid phone');
  }
  if (rules.numeric && v !== '' && isNaN(Number(v))) {
    errors.push('Must be a number');
  }
  if (rules.date && v && isNaN(Date.parse(v))) {
    errors.push('Invalid date');
  }

  return { valid: errors.length === 0, errors };
}

export function validateForm(fields) {
  const allErrors = {};
  let valid = true;
  for (const [name, { value, rules }] of Object.entries(fields)) {
    const result = validateInput(value, rules);
    if (!result.valid) {
      allErrors[name] = result.errors;
      valid = false;
    }
  }
  return { valid, errors: allErrors };
}

export function showFieldError(fieldId, msg) {
  const el = $(fieldId);
  if (!el) return;
  el.classList.add('field-error');
  let errEl = el.parentElement?.querySelector('.field-error-msg');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-error-msg';
    el.parentElement?.appendChild(errEl);
  }
  errEl.textContent = msg;
}

export function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
  document.querySelectorAll('.field-error-msg').forEach((el) => el.remove());
}

// ── Password Hashing (SHA-256) ──────────────────────────

export async function hashValue(input, salt) {
  if (!salt) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    salt = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const data = new TextEncoder().encode(input + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt };
}

export async function verifyHash(input, storedHash, salt) {
  const { hash } = await hashValue(input, salt);
  return hash === storedHash;
}

// ── Custom Confirm Dialog ───────────────────────────────

let _confirmResolve = null;

export function showConfirm(msg) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    const titleEl = $('confirm-title');
    const msgEl = $('confirm-msg');
    const overlay = $('confirm-overlay');
    if (titleEl) titleEl.textContent = 'Confirm';
    if (msgEl) msgEl.textContent = msg;
    if (overlay) overlay.classList.add('open');
  });
}

export function confirmYes() {
  const overlay = $('confirm-overlay');
  if (overlay) overlay.classList.remove('open');
  if (_confirmResolve) {
    _confirmResolve(true);
    _confirmResolve = null;
  }
}

export function confirmNo() {
  const overlay = $('confirm-overlay');
  if (overlay) overlay.classList.remove('open');
  if (_confirmResolve) {
    _confirmResolve(false);
    _confirmResolve = null;
  }
}

// Backward compatibility
window.sanitizeHTML = sanitizeHTML;
window.escapeAttr = escapeAttr;
window.safeHTML = safeHTML;
window.validateInput = validateInput;
window.validateForm = validateForm;
window.showFieldError = showFieldError;
window.clearFieldErrors = clearFieldErrors;
window.showConfirm = showConfirm;
window.confirmYes = confirmYes;
window.confirmNo = confirmNo;
