// EGGlogU Shared Utilities — extracted from monolith core
// Zero dependencies, pure functions

/**
 * Sanitize string for safe HTML insertion (XSS prevention).
 */
export function sanitizeHTML(str) {
  if (typeof str !== 'string') return String(str || '');
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

/**
 * Escape a string for safe use in HTML attributes.
 */
export function escapeAttr(str) {
  return sanitizeHTML(String(str || ''));
}

/**
 * Tagged template for safe HTML with auto-escaped interpolations.
 */
export function safeHTML(tpl, ...vals) {
  return tpl.reduce((out, s, i) => out + s + (i < vals.length ? sanitizeHTML(String(vals[i])) : ''), '');
}

/**
 * Generate a unique ID (timestamp base36 + random).
 */
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Today as YYYY-MM-DD string.
 */
export function todayStr() {
  return new Date().toISOString().substring(0, 10);
}

/**
 * Format number with locale.
 */
export function fmtNum(n, d = 0, localeFn) {
  const loc = localeFn ? localeFn() : 'en-US';
  return Number(n || 0).toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Format as money (currency prefix + 2 decimals).
 */
export function fmtMoney(n, currencySymbol = '$', localeFn) {
  return currencySymbol + fmtNum(n, 2, localeFn);
}

/**
 * Format date string for display.
 */
export function fmtDate(d, localeFn) {
  if (!d) return '-';
  const loc = localeFn ? localeFn() : 'en-US';
  return new Date(d + 'T12:00:00').toLocaleDateString(loc);
}

/**
 * Input validation engine.
 */
export function validateInput(value, rules = {}, tFn) {
  const errors = [];
  const t = tFn || (k => k);
  const v = typeof value === 'string' ? value.trim() : value;
  if (rules.required && (v === '' || v === null || v === undefined)) errors.push(t('required') || 'Required');
  if (rules.minLength && typeof v === 'string' && v.length < rules.minLength) errors.push((t('min_length') || 'Min length') + ': ' + rules.minLength);
  if (rules.maxLength && typeof v === 'string' && v.length > rules.maxLength) errors.push((t('max_length') || 'Max length') + ': ' + rules.maxLength);
  if (rules.min !== undefined && Number(v) < rules.min) errors.push((t('min_value') || 'Min') + ': ' + rules.min);
  if (rules.max !== undefined && Number(v) > rules.max) errors.push((t('max_value') || 'Max') + ': ' + rules.max);
  if (rules.pattern && !rules.pattern.test(v)) errors.push(rules.patternMsg || (t('invalid_format') || 'Invalid format'));
  if (rules.email && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push(t('invalid_email') || 'Invalid email');
  if (rules.phone && v && !/^[+\d\s\-()]{6,20}$/.test(v)) errors.push(t('invalid_phone') || 'Invalid phone');
  if (rules.numeric && v !== '' && isNaN(Number(v))) errors.push(t('must_be_number') || 'Must be a number');
  if (rules.date && v && isNaN(Date.parse(v))) errors.push(t('invalid_date') || 'Invalid date');
  return { valid: errors.length === 0, errors };
}

/**
 * Validate multiple fields at once.
 */
export function validateForm(fields, tFn) {
  const allErrors = {};
  let valid = true;
  for (const [name, { value, rules }] of Object.entries(fields)) {
    const result = validateInput(value, rules, tFn);
    if (!result.valid) { allErrors[name] = result.errors; valid = false; }
  }
  return { valid, errors: allErrors };
}

/**
 * ERP Void Record — SAP/Oracle/Dynamics style.
 * Never physically delete; mark as voided with reason, timestamp, reversal entry.
 * @param {Array} arr - The data array (e.g., D.finances.expenses)
 * @param {string} id - Record ID to void
 * @param {string} reason - Mandatory void reason
 * @param {string} [user] - User who performed the void
 * @returns {object|null} The voided record, or null if not found
 */
export function voidRecord(arr, id, reason, user) {
  const rec = arr.find(r => r.id === id);
  if (!rec) return null;
  rec.status = 'voided';
  rec.voidedAt = new Date().toISOString();
  rec.voidedReason = reason;
  rec.voidedBy = user || 'system';
  return rec;
}

/**
 * Void multiple records at once.
 */
export function voidRecords(arr, ids, reason, user) {
  return ids.map(id => voidRecord(arr, id, reason, user)).filter(Boolean);
}

/**
 * Filter active (non-voided) records from an array.
 * Use in all .reduce() and display logic.
 */
export function activeOnly(arr) {
  if (!arr) return [];
  return arr.filter(r => r.status !== 'voided');
}

/**
 * Create a reversal entry (accounting contra-entry).
 * For financial records: creates a mirror record with negated amount.
 */
export function createReversalEntry(arr, id, reason, user) {
  const original = arr.find(r => r.id === id);
  if (!original) return null;
  const reversal = {
    ...original,
    id: genId(),
    amount: -(original.amount || 0),
    cost: -(original.cost || 0),
    status: 'reversal',
    reversalOf: id,
    reversalReason: reason,
    reversalAt: new Date().toISOString(),
    reversalBy: user || 'system',
    date: todayStr()
  };
  arr.push(reversal);
  return reversal;
}

/**
 * Empty state HTML block.
 */
export function emptyState(icon, msg, btn, act) {
  let h = `<div class="empty-state"><div class="empty-icon">${sanitizeHTML(icon)}</div><p>${sanitizeHTML(msg)}</p>`;
  if (btn) h += `<button class="btn btn-primary" onclick="${escapeAttr(act)}">${sanitizeHTML(btn)}</button>`;
  return h + '</div>';
}
