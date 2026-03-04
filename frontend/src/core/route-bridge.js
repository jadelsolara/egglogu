/**
 * EGGlogU — Route Bridge
 * Strangler Fig pattern: intercepts monolith nav() dispatch
 * and redirects to modular render functions when feature flag is ON.
 *
 * The monolith patches nav() with 3 lines:
 *   const override = window.__routeBridge?.getRouteOverride(section);
 *   if (override) { override(); postRenderA11y(section); return; }
 *
 * If window.__routeBridge doesn't exist, monolith behavior is unchanged.
 */

import { isEnabled, enable, disable } from './feature-flags.js';

const _routes = {};

/**
 * Register a modular render function for a route key.
 * @param {string} section - Route key matching monolith R{} map (e.g. 'operaciones')
 * @param {Function} renderFn - The modular render function
 */
export function registerRoute(section, renderFn) {
  _routes[section] = renderFn;
  console.log(`[RouteBridge] Registered: ${section}`);
}

/**
 * Get the override render function if the feature flag is enabled.
 * Called by the monolith's patched nav().
 * @param {string} section - Route key
 * @returns {Function|null} - Render function or null (use monolith)
 */
export function getRouteOverride(section) {
  if (_routes[section] && isEnabled(section)) {
    return _routes[section];
  }
  return null;
}

/**
 * Enable a registered route's feature flag.
 */
export function enableRoute(section) {
  if (!_routes[section]) {
    console.warn(`[RouteBridge] No module registered for: ${section}`);
    return false;
  }
  enable(section);
  return true;
}

/**
 * Disable a route — falls back to monolith render.
 */
export function disableRoute(section) {
  disable(section);
}

/**
 * List all registered routes and their status.
 */
export function getStatus() {
  const status = {};
  for (const [key, fn] of Object.entries(_routes)) {
    status[key] = {
      registered: true,
      enabled: isEnabled(key),
      fnName: fn.name || '(anonymous)',
    };
  }
  return status;
}

// Expose on window for monolith interop
window.__routeBridge = { registerRoute, getRouteOverride, enableRoute, disableRoute, getStatus };
