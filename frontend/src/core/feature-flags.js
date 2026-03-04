/**
 * EGGlogU — Feature Flags
 * Controls modular route overrides via localStorage.
 * All flags default OFF — monolith renders by default.
 *
 * Usage:
 *   isEnabled('operations')  → true/false
 *   enable('operations')     → activates modular render
 *   disable('operations')    → falls back to monolith
 *
 * URL override for testing:
 *   ?ff_operations=1  → force ON
 *   ?ff_operations=0  → force OFF
 */

const STORAGE_KEY = 'egglogu_feature_flags';

let _flags = null;

function load() {
  if (_flags) return _flags;
  try {
    _flags = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    _flags = {};
  }
  return _flags;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_flags));
  } catch (e) {
    console.warn('[FeatureFlags] Save failed:', e.message);
  }
}

function urlOverride(module) {
  try {
    const params = new URLSearchParams(window.location.search);
    const val = params.get('ff_' + module);
    if (val === '1') return true;
    if (val === '0') return false;
  } catch { /* ignore */ }
  return null;
}

export function isEnabled(module) {
  const override = urlOverride(module);
  if (override !== null) return override;
  return !!load()[module];
}

export function enable(module) {
  load();
  _flags[module] = true;
  save();
  console.log(`[FeatureFlags] ${module} → ON`);
}

export function disable(module) {
  load();
  _flags[module] = false;
  save();
  console.log(`[FeatureFlags] ${module} → OFF`);
}

export function toggle(module) {
  if (isEnabled(module)) disable(module);
  else enable(module);
}

export function getAll() {
  return { ...load() };
}

export function reset() {
  _flags = {};
  save();
  console.log('[FeatureFlags] All flags reset');
}

// Expose for devtools/console
window.__featureFlags = { isEnabled, enable, disable, toggle, getAll, reset };
