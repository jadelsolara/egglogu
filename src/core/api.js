// EGGlogU API Service — Backend communication layer
// Circuit breaker, JWT management, offline queue, auto-refresh

import { Bus } from './bus.js';

// Circuit breaker state
const _breakers = {};
function _getBreaker(key) {
  if (!_breakers[key]) _breakers[key] = { failures: 0, lastFail: 0, state: 'closed' };
  return _breakers[key];
}

function cbFetch(url, opts, key, threshold = 3, cooldownMs = 30000) {
  const cb = _getBreaker(key || url);
  if (cb.state === 'open') {
    if (Date.now() - cb.lastFail < cooldownMs) return Promise.reject(new Error('Circuit open: ' + key));
    cb.state = 'half-open';
  }
  return fetch(url, opts).then(r => {
    if (r.ok) { cb.failures = 0; cb.state = 'closed'; }
    else { cb.failures++; cb.lastFail = Date.now(); if (cb.failures >= threshold) cb.state = 'open'; }
    return r;
  }).catch(e => {
    cb.failures++; cb.lastFail = Date.now(); if (cb.failures >= threshold) cb.state = 'open';
    throw e;
  });
}

function _getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) return meta.content;
  const m = document.cookie.match(/csrf_token=([^;]+)/);
  return m ? m[1] : '';
}

const _isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_BASE = localStorage.getItem('egglogu_api_base') || (_isLocal ? 'http://localhost:8000/api/v1' : 'https://api.egglogu.com/api/v1');

export const apiService = {
  _token: null, _refreshToken: null, _online: navigator.onLine, _syncQueue: [],

  // Token management
  setTokens(access, refresh) {
    this._token = access; this._refreshToken = refresh;
    try { localStorage.setItem('egglogu_tokens', JSON.stringify({ access, refresh })); } catch (e) { /* quota */ }
  },
  getToken() {
    if (this._token) return this._token;
    try { const t = JSON.parse(localStorage.getItem('egglogu_tokens') || '{}'); this._token = t.access || null; this._refreshToken = t.refresh || null; return this._token; } catch (e) { return null; }
  },
  getRefreshToken() {
    if (this._refreshToken) return this._refreshToken;
    try { const t = JSON.parse(localStorage.getItem('egglogu_tokens') || '{}'); this._refreshToken = t.refresh || null; return this._refreshToken; } catch (e) { return null; }
  },
  clearTokens() { this._token = null; this._refreshToken = null; localStorage.removeItem('egglogu_tokens'); },
  isLoggedIn() { return !!this.getToken(); },

  // Core HTTP
  async request(method, path, body, retry = true) {
    const token = this.getToken();
    const opts = { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _getCsrfToken() } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    let resp;
    try { resp = await fetch(API_BASE + path, opts); } catch (e) {
      if (method !== 'GET' && body) { this._syncQueue.push({ method, path, body, ts: Date.now() }); }
      throw new Error('offline');
    }
    if (resp.status === 503) {
      const err = await resp.json().catch(() => ({}));
      if (err.error === 'offline') throw new Error('offline');
    }
    if (resp.status === 401 && retry) {
      const refreshed = await this.refresh();
      if (refreshed) return this.request(method, path, body, false);
      this.clearTokens();
      Bus.emit('auth:expired');
      throw new Error('session_expired');
    }
    if (resp.status === 403) throw new Error('forbidden');
    if (resp.status === 404) throw new Error('not_found');
    if (resp.status === 429) { const err = await resp.json().catch(() => ({})); throw new Error(err.detail || 'Too many requests'); }
    if (resp.status === 422) { const err = await resp.json(); throw new Error(err.detail || 'validation_error'); }
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.detail || 'server_error'); }
    if (resp.status === 204) return null;
    return resp.json();
  },

  // Auth endpoints
  async register(email, password, fullName, orgName, utmData) {
    const body = { email, password, full_name: fullName, organization_name: orgName };
    if (utmData) Object.assign(body, utmData);
    return this.request('POST', '/auth/register', body);
  },
  async login(email, password) {
    const resp = await this.request('POST', '/auth/login', { email, password });
    this.setTokens(resp.access_token, resp.refresh_token); return resp;
  },
  async verifyEmail(token) {
    const resp = await this.request('POST', '/auth/verify-email', { token });
    if (resp.access_token) this.setTokens(resp.access_token, resp.refresh_token);
    return resp;
  },
  async resendVerification(email) { return this.request('POST', '/auth/resend-verification', { email }); },
  async refresh() {
    const rt = this.getRefreshToken(); if (!rt) return false;
    try {
      const resp = await fetch(API_BASE + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) });
      if (!resp.ok) { this.clearTokens(); return false; }
      const data = await resp.json(); this.setTokens(data.access_token, data.refresh_token); return true;
    } catch (e) { return false; }
  },
  async getMe() { return this.request('GET', '/auth/me'); },
  async updateProfile(data) { return this.request('PATCH', '/auth/me', data); },
  async notifyReassignment(data) { return this.request('POST', '/auth/notify-reassignment', data); },
  async forgotPassword(email) { return this.request('POST', '/auth/forgot-password', { email }); },
  async resetPassword(token, newPassword) { return this.request('POST', '/auth/reset-password', { token, new_password: newPassword }); },
  async getAuthConfig() { return this.request('GET', '/auth/config'); },
  async googleAuth(credential, orgName) {
    const resp = await this.request('POST', '/auth/google', { credential, organization_name: orgName || '' });
    if (resp.access_token) this.setTokens(resp.access_token, resp.refresh_token); return resp;
  },
  async microsoftAuth(accessToken, orgName) {
    const resp = await this.request('POST', '/auth/microsoft', { access_token: accessToken, organization_name: orgName || '' });
    if (resp.access_token) this.setTokens(resp.access_token, resp.refresh_token); return resp;
  },

  // Sync
  async syncToServer(payload) { return this.request('POST', '/sync', payload); },

  // Entity endpoints
  async getFarms() { return this.request('GET', '/farms'); },
  async getFlocks() { return this.request('GET', '/flocks'); },
  async getClients() { return this.request('GET', '/clients'); },
  async getProduction() { return this.request('GET', '/production'); },

  // Billing (Stripe)
  async createCheckout(plan, interval = 'month') { return this.request('POST', '/billing/create-checkout', { plan, interval }); },
  async getPricing() { return this.request('GET', '/billing/pricing'); },
  async getBillingStatus() { return this.request('GET', '/billing/status'); },
  async getPortalUrl() { return this.request('GET', '/billing/portal'); },
  async cancelSubscription() { return this.request('POST', '/billing/cancel-subscription'); },
  async deleteAccount(password, confirmText) { return this.request('DELETE', '/billing/delete-account', { password, confirm_text: confirmText }); },

  // Support
  async getFaq(q = '', category = '') { const p = new URLSearchParams(); if (q) p.set('q', q); if (category) p.set('category', category); return this.request('GET', '/support/faq' + (p.toString() ? '?' + p : '')); },
  async faqHelpful(faqId, helpful) { return this.request('POST', `/support/faq/${faqId}/helpful`, { helpful }); },
  async getTickets() { return this.request('GET', '/support/tickets'); },
  async createTicket(subject, description, priority = 'medium') { return this.request('POST', '/support/tickets', { subject, description, priority }); },
  async getTicket(id) { return this.request('GET', `/support/tickets/${id}`); },
  async addTicketMessage(ticketId, message) { return this.request('POST', `/support/tickets/${ticketId}/messages`, { message }); },
  async closeTicket(ticketId) { return this.request('POST', `/support/tickets/${ticketId}/close`); },
  async rateTicket(ticketId, rating, comment = '') { return this.request('POST', `/support/tickets/${ticketId}/rate`, { rating, comment }); },
  async syncTickets(tickets) { return this.request('POST', '/support/tickets/sync', { tickets }); },
  // Support admin
  async getAdminTickets(status = '', category = '', priority = '', page = 1) { const p = new URLSearchParams(); if (status) p.set('status', status); if (category) p.set('category', category); if (priority) p.set('priority', priority); p.set('page', String(page)); return this.request('GET', '/support/admin/tickets?' + p); },
  async updateAdminTicket(id, data) { return this.request('PUT', `/support/admin/tickets/${id}`, data); },
  async adminReplyTicket(id, message, isInternal = false) { return this.request('POST', `/support/admin/tickets/${id}/reply`, { message, is_internal: isInternal }); },
  async getAdminAnalytics() { return this.request('GET', '/support/admin/analytics'); },
  async getAdminFaq() { return this.request('GET', '/support/faq'); },
  async createAdminFaq(data) { return this.request('POST', '/support/admin/faq', data); },
  async updateAdminFaq(id, data) { return this.request('PUT', `/support/admin/faq/${id}`, data); },
  async deleteAdminFaq(id) { return this.request('DELETE', `/support/admin/faq/${id}`); },

  // Outbreak alerts (geo-filtered by farm proximity)
  async getOutbreakAlerts() { return this.request('GET', '/health/outbreak-alerts'); },

  // Flush offline queue
  async flushQueue() {
    if (!this._syncQueue.length || !this.isLoggedIn()) return;
    const queue = [...this._syncQueue]; this._syncQueue = [];
    for (const item of queue) {
      try { await this.request(item.method, item.path, item.body); } catch (e) {
        if (e.message === 'offline') { this._syncQueue.unshift(item); break; }
      }
    }
  }
};

// Auto-detect online/offline
window.addEventListener('online', () => { apiService._online = true; apiService.flushQueue(); Bus.emit('network:online'); });
window.addEventListener('offline', () => { apiService._online = false; Bus.emit('network:offline'); });

export { cbFetch, API_BASE };
