/**
 * EGGlogU — WebSocket Client
 * Real-time dashboard updates via WebSocket connection.
 * Connects to backend WebSocket endpoint for live data.
 */

import { bus, Events } from './event-bus.js';
import { apiService } from './api-service.js';

const WS_RECONNECT_DELAY = 3000;
const WS_HEARTBEAT_INTERVAL = 30000;
const WS_MAX_RETRIES = 10;

class WebSocketClient {
  constructor() {
    this._ws = null;
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._retries = 0;
    this._channels = ['production', 'health', 'environment'];
    this._connected = false;
  }

  /**
   * Connect to WebSocket server.
   * @param {string} farmId - Farm ID to subscribe to
   */
  connect(farmId) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;

    const token = apiService.getToken();
    if (!token || !farmId) return;

    const baseUrl = (apiService.API_BASE || window.API_BASE || '')
      .replace('http://', 'ws://')
      .replace('https://', 'wss://')
      .replace('/api/v1', '');

    const wsUrl = `${baseUrl}/ws/dashboard/${farmId}?token=${token}`;

    try {
      this._ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      this._scheduleReconnect(farmId);
      return;
    }

    this._ws.onopen = () => {
      this._connected = true;
      this._retries = 0;

      // Subscribe to channels
      this._ws.send(JSON.stringify({
        type: 'subscribe',
        channels: this._channels,
      }));

      // Start heartbeat
      this._startHeartbeat();

      bus.emit(Events.WS_CONNECTED);
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        bus.emit(Events.WS_MESSAGE, msg);

        // Route to specific event
        if (msg.type === 'production_update') {
          bus.emit(Events.PRODUCTION_UPDATED, msg.data);
        } else if (msg.type === 'health_alert') {
          bus.emit(Events.ALERT_NEW, msg.data);
        } else if (msg.type === 'environment_reading') {
          bus.emit(Events.ENV_READING_ADDED, msg.data);
        }
      } catch {
        // Non-JSON message (ping/pong)
      }
    };

    this._ws.onclose = () => {
      this._connected = false;
      this._stopHeartbeat();
      bus.emit(Events.WS_DISCONNECTED);
      this._scheduleReconnect(farmId);
    };

    this._ws.onerror = () => {
      console.warn('[WS] Error occurred');
    };
  }

  disconnect() {
    this._stopHeartbeat();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close(1000, 'Client disconnect');
      this._ws = null;
    }
    this._connected = false;
  }

  isConnected() {
    return this._connected && this._ws?.readyState === WebSocket.OPEN;
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      }
    }, WS_HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _scheduleReconnect(farmId) {
    if (this._retries >= WS_MAX_RETRIES) {
      console.warn('[WS] Max retries reached');
      return;
    }
    this._retries++;
    const delay = WS_RECONNECT_DELAY * Math.min(this._retries, 5);
    this._reconnectTimer = setTimeout(() => this.connect(farmId), delay);
  }
}

export { WebSocketClient };
export const wsClient = new WebSocketClient();

// Backward compatibility
window.__eggloguWS = wsClient;
