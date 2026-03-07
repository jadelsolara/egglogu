// EGGlogU Event Bus — CustomEvent-based inter-component communication
// Zero dependencies, native browser API only

const _listeners = new Map();

export const Bus = {
  /**
   * Emit an event with optional detail payload.
   * Uses CustomEvent on document for cross-component reach.
   */
  emit(event, detail = null) {
    document.dispatchEvent(new CustomEvent(`egg:${event}`, { detail, bubbles: true }));
  },

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(event, handler) {
    const key = `egg:${event}`;
    const wrapped = (e) => handler(e.detail);
    document.addEventListener(key, wrapped);
    if (!_listeners.has(key)) _listeners.set(key, []);
    _listeners.get(key).push({ handler, wrapped });
    return () => {
      document.removeEventListener(key, wrapped);
      const arr = _listeners.get(key);
      if (arr) {
        const idx = arr.findIndex(x => x.handler === handler);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  },

  /**
   * Subscribe once — auto-unsubscribes after first call.
   */
  once(event, handler) {
    const unsub = this.on(event, (detail) => {
      unsub();
      handler(detail);
    });
    return unsub;
  },

  /**
   * Remove all listeners for a specific event.
   */
  off(event) {
    const key = `egg:${event}`;
    const arr = _listeners.get(key);
    if (arr) {
      arr.forEach(({ wrapped }) => document.removeEventListener(key, wrapped));
      _listeners.delete(key);
    }
  },

  /**
   * Remove ALL listeners (cleanup).
   */
  clear() {
    for (const [key, arr] of _listeners) {
      arr.forEach(({ wrapped }) => document.removeEventListener(key, wrapped));
    }
    _listeners.clear();
  }
};
