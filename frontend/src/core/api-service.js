/**
 * EGGlogU — API Service Layer
 * Backend HTTP client with JWT auth, auto-refresh, and offline queue.
 * Extracted from egglogu.js lines 1060-1199.
 */

import { bus, Events } from './event-bus.js';
import { safeSetItem } from './utils.js';

const API_BASE = localStorage.getItem('egglogu_api_base') || 'https://api.egglogu.com/api/v1';

const apiService = {
  _token: null,
  _refreshToken: null,
  _online: navigator.onLine,
  _syncQueue: [],

  // ── Token Management ──────────────────────────────────
  setTokens(access, refresh) {
    this._token = access;
    this._refreshToken = refresh;
    safeSetItem('egglogu_tokens', JSON.stringify({ access, refresh }));
  },

  getToken() {
    if (this._token) return this._token;
    try {
      const t = JSON.parse(localStorage.getItem('egglogu_tokens') || '{}');
      this._token = t.access || null;
      this._refreshToken = t.refresh || null;
      return this._token;
    } catch {
      return null;
    }
  },

  getRefreshToken() {
    if (this._refreshToken) return this._refreshToken;
    try {
      const t = JSON.parse(localStorage.getItem('egglogu_tokens') || '{}');
      this._refreshToken = t.refresh || null;
      return this._refreshToken;
    } catch {
      return null;
    }
  },

  clearTokens() {
    this._token = null;
    this._refreshToken = null;
    localStorage.removeItem('egglogu_tokens');
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  // ── Core HTTP ─────────────────────────────────────────
  async request(method, path, body, retry = true) {
    const token = this.getToken();
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    let resp;
    try {
      resp = await fetch(API_BASE + path, opts);
    } catch {
      if (method !== 'GET' && body) {
        this._syncQueue.push({ method, path, body, ts: Date.now() });
      }
      throw new Error('offline');
    }

    if (resp.status === 401 && retry) {
      const refreshed = await this.refresh();
      if (refreshed) return this.request(method, path, body, false);
      this.clearTokens();
      bus.emit(Events.AUTH_SESSION_EXPIRED);
      throw new Error('session_expired');
    }
    if (resp.status === 403) throw new Error('forbidden');
    if (resp.status === 404) throw new Error('not_found');
    if (resp.status === 429) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Too many requests');
    }
    if (resp.status === 422) {
      const err = await resp.json();
      throw new Error(err.detail || 'validation_error');
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'server_error');
    }
    if (resp.status === 204) return null;
    return resp.json();
  },

  // ── Auth ──────────────────────────────────────────────
  async register(email, password, fullName, orgName, utmData) {
    const body = { email, password, full_name: fullName, organization_name: orgName };
    if (utmData) Object.assign(body, utmData);
    return this.request('POST', '/auth/register', body);
  },

  async login(email, password) {
    const resp = await this.request('POST', '/auth/login', { email, password });
    this.setTokens(resp.access_token, resp.refresh_token);
    bus.emit(Events.AUTH_LOGIN, resp);
    return resp;
  },

  async verifyEmail(token) {
    const resp = await this.request('POST', '/auth/verify-email', { token });
    if (resp.access_token) this.setTokens(resp.access_token, resp.refresh_token);
    return resp;
  },

  async resendVerification(email) {
    return this.request('POST', '/auth/resend-verification', { email });
  },

  async refresh() {
    const rt = this.getRefreshToken();
    if (!rt) return false;
    try {
      const resp = await fetch(API_BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!resp.ok) { this.clearTokens(); return false; }
      const data = await resp.json();
      this.setTokens(data.access_token, data.refresh_token);
      bus.emit(Events.AUTH_TOKEN_REFRESHED);
      return true;
    } catch {
      return false;
    }
  },

  async getMe() { return this.request('GET', '/auth/me'); },
  async updateProfile(data) { return this.request('PATCH', '/auth/me', data); },
  async forgotPassword(email) { return this.request('POST', '/auth/forgot-password', { email }); },
  async resetPassword(token, newPwd) { return this.request('POST', '/auth/reset-password', { token, new_password: newPwd }); },
  async googleAuth(credential, orgName) {
    const resp = await this.request('POST', '/auth/google', { credential, organization_name: orgName || '' });
    if (resp.access_token) this.setTokens(resp.access_token, resp.refresh_token);
    return resp;
  },

  // ── Sync ──────────────────────────────────────────────
  async syncToServer(payload) { return this.request('POST', '/sync', payload); },

  // ── CRUD ──────────────────────────────────────────────
  async getFarms() { return this.request('GET', '/farms'); },
  async getFlocks() { return this.request('GET', '/flocks'); },
  async getClients() { return this.request('GET', '/clients'); },
  async getProduction() { return this.request('GET', '/production'); },

  // ── Billing ───────────────────────────────────────────
  async createCheckout(plan, interval = 'month') { return this.request('POST', '/billing/create-checkout', { plan, interval }); },
  async getPricing() { return this.request('GET', '/billing/pricing'); },
  async getBillingStatus() { return this.request('GET', '/billing/status'); },
  async getPortalUrl() { return this.request('GET', '/billing/portal'); },
  async cancelSubscription() { return this.request('POST', '/billing/cancel-subscription'); },
  async deleteAccount(password, confirmText) { return this.request('DELETE', '/billing/delete-account', { password, confirm_text: confirmText }); },

  // ── Support ───────────────────────────────────────────
  async getFaq(q = '', category = '') {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (category) p.set('category', category);
    return this.request('GET', '/support/faq' + (p.toString() ? '?' + p : ''));
  },
  async faqHelpful(faqId, helpful) { return this.request('POST', `/support/faq/${faqId}/helpful`, { helpful }); },
  async getTickets() { return this.request('GET', '/support/tickets'); },
  async createTicket(subject, description, priority = 'medium') { return this.request('POST', '/support/tickets', { subject, description, priority }); },
  async getTicket(id) { return this.request('GET', `/support/tickets/${id}`); },
  async addTicketMessage(ticketId, message) { return this.request('POST', `/support/tickets/${ticketId}/messages`, { message }); },
  async closeTicket(ticketId) { return this.request('POST', `/support/tickets/${ticketId}/close`); },
  async rateTicket(ticketId, rating, comment = '') { return this.request('POST', `/support/tickets/${ticketId}/rate`, { rating, comment }); },

  // ── Offline Queue ─────────────────────────────────────
  async flushQueue() {
    if (!this._syncQueue.length || !this.isLoggedIn()) return;
    const queue = [...this._syncQueue];
    this._syncQueue = [];
    for (const item of queue) {
      try {
        await this.request(item.method, item.path, item.body);
      } catch (e) {
        if (e.message === 'offline') {
          this._syncQueue.unshift(item);
          break;
        }
      }
    }
  },
};

// Online/offline detection
window.addEventListener('online', () => {
  apiService._online = true;
  apiService.flushQueue();
  bus.emit(Events.SYNC_STARTED);
});
window.addEventListener('offline', () => {
  apiService._online = false;
});

// Backward compatibility
window.apiService = apiService;
window.API_BASE = API_BASE;

export { apiService, API_BASE };
