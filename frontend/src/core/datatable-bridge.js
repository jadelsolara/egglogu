/**
 * EGGlogU — DataTable Bridge
 * Thin wrapper around the monolith's DataTable IIFE (egglogu-datatable.js).
 * Provides a clean import for modular code while using the global.
 */

/**
 * Create a DataTable using the monolith's global DataTable component.
 * @param {Object} config - DataTable configuration (same API as DataTable.create)
 * @returns {string} - HTML string
 */
export function createDataTable(config) {
  if (typeof window.DataTable?.create === 'function') {
    return window.DataTable.create(config);
  }
  console.warn('[DataTableBridge] DataTable.create not available');
  return '<div class="card"><p style="text-align:center;color:var(--text-light)">DataTable not loaded</p></div>';
}
