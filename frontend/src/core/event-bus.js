/**
 * EGGlogU — Event Bus
 * Decouples cross-module communication. Replaces direct function calls
 * between modules with publish/subscribe pattern.
 *
 * Usage:
 *   import { bus } from '@core/event-bus';
 *   bus.on('production:saved', (data) => updateDashboard(data));
 *   bus.emit('production:saved', { flockId: '...', eggs: 500 });
 */

class EventBus {
  constructor() {
    this._listeners = new Map();
    this._onceListeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event - Event name (e.g., 'production:saved')
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event once (auto-removes after first call).
   */
  once(event, callback) {
    if (!this._onceListeners.has(event)) {
      this._onceListeners.set(event, new Set());
    }
    this._onceListeners.get(event).add(callback);
  }

  /**
   * Unsubscribe from an event.
   */
  off(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback);
    }
    if (this._onceListeners.has(event)) {
      this._onceListeners.get(event).delete(callback);
    }
  }

  /**
   * Emit an event with optional data.
   * @param {string} event - Event name
   * @param {*} data - Event payload
   */
  emit(event, data) {
    // Regular listeners
    if (this._listeners.has(event)) {
      for (const cb of this._listeners.get(event)) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[EventBus] Error in listener for "${event}":`, err);
        }
      }
    }

    // Once listeners (remove after calling)
    if (this._onceListeners.has(event)) {
      for (const cb of this._onceListeners.get(event)) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[EventBus] Error in once-listener for "${event}":`, err);
        }
      }
      this._onceListeners.delete(event);
    }
  }

  /**
   * Remove all listeners for an event (or all events).
   */
  clear(event) {
    if (event) {
      this._listeners.delete(event);
      this._onceListeners.delete(event);
    } else {
      this._listeners.clear();
      this._onceListeners.clear();
    }
  }

  /**
   * Get count of listeners for an event.
   */
  listenerCount(event) {
    const regular = this._listeners.get(event)?.size || 0;
    const once = this._onceListeners.get(event)?.size || 0;
    return regular + once;
  }
}

// Singleton instance
export const bus = new EventBus();

// ── Event Constants ──
// Naming convention: module:action (lowercase, colon-separated)

export const Events = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_TOKEN_REFRESHED: 'auth:token-refreshed',
  AUTH_SESSION_EXPIRED: 'auth:session-expired',

  // Navigation
  NAV_SECTION_CHANGE: 'nav:section-change',
  NAV_SUBSECTION_CHANGE: 'nav:subsection-change',

  // Production
  PRODUCTION_SAVED: 'production:saved',
  PRODUCTION_DELETED: 'production:deleted',
  PRODUCTION_UPDATED: 'production:updated',

  // Flocks
  FLOCK_CREATED: 'flock:created',
  FLOCK_UPDATED: 'flock:updated',
  FLOCK_DELETED: 'flock:deleted',

  // Health
  VACCINE_APPLIED: 'health:vaccine-applied',
  MEDICATION_ADDED: 'health:medication-added',
  OUTBREAK_REPORTED: 'health:outbreak-reported',

  // Finance
  INCOME_ADDED: 'finance:income-added',
  EXPENSE_ADDED: 'finance:expense-added',
  RECEIVABLE_UPDATED: 'finance:receivable-updated',

  // Feed
  FEED_PURCHASED: 'feed:purchased',
  FEED_CONSUMED: 'feed:consumed',

  // Environment
  ENV_READING_ADDED: 'environment:reading-added',
  ENV_ALERT: 'environment:alert',

  // Sync
  SYNC_STARTED: 'sync:started',
  SYNC_COMPLETED: 'sync:completed',
  SYNC_FAILED: 'sync:failed',
  SYNC_CONFLICT: 'sync:conflict',

  // Data
  DATA_LOADED: 'data:loaded',
  DATA_SAVED: 'data:saved',
  DATA_RESET: 'data:reset',
  DATA_IMPORTED: 'data:imported',

  // Dashboard
  DASHBOARD_REFRESH: 'dashboard:refresh',
  KPI_SNAPSHOT: 'dashboard:kpi-snapshot',

  // Alerts
  ALERT_NEW: 'alert:new',
  ALERT_DISMISSED: 'alert:dismissed',

  // WebSocket (real-time)
  WS_CONNECTED: 'ws:connected',
  WS_DISCONNECTED: 'ws:disconnected',
  WS_MESSAGE: 'ws:message',

  // UI
  TOAST_SHOW: 'ui:toast',
  MODAL_OPEN: 'ui:modal-open',
  MODAL_CLOSE: 'ui:modal-close',
  THEME_CHANGED: 'ui:theme-changed',
  LANG_CHANGED: 'ui:lang-changed',
};

// Backward compatibility: expose on window for legacy code
window.__eggloguBus = bus;
window.__eggloguEvents = Events;
