/**
 * EGGlogU — Support Module
 * Ticket management, FAQ, offline queue, contact center.
 * Extracted from egglogu.js lines ~4610-5090.
 */

import { showToast } from '@core/utils.js';

// ── Constants ────────────────────────────────────────────

export const TICKET_CATEGORIES = [
  'production', 'health', 'feed', 'iot', 'billing',
  'bug', 'sync', 'feature_request', 'access', 'general',
];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const TICKET_STATUSES = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];

// ── Offline Queue ────────────────────────────────────────

const OFFLINE_KEY = 'egglogu_offline_tickets';

export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToOfflineQueue(ticket) {
  const queue = getOfflineQueue();
  queue.push({
    subject: ticket.subject,
    description: ticket.description,
    priority: ticket.priority || 'medium',
    created_offline: new Date().toISOString(),
  });
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
  return queue;
}

export function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_KEY);
}

// ── Ticket Operations (via apiService) ───────────────────

export async function submitTicket(apiService, subject, description, priority) {
  if (!subject || !description) {
    showToast('Subject and description required', 'error');
    return null;
  }

  if (!navigator.onLine) {
    addToOfflineQueue({ subject, description, priority });
    return { offline: true };
  }

  return apiService.createTicket(subject, description, priority);
}

export async function syncOfflineTickets(apiService) {
  const queue = getOfflineQueue();
  if (!queue.length || !navigator.onLine) return { synced: 0 };

  const result = await apiService.syncTickets(
    queue.map((t) => ({
      subject: t.subject,
      description: t.description,
      priority: t.priority,
    }))
  );

  clearOfflineQueue();
  return result;
}

export async function loadUserTickets(apiService) {
  if (!apiService.isLoggedIn()) return [];
  return (await apiService.getTickets()) || [];
}

export async function loadTicketDetail(apiService, ticketId) {
  return apiService.getTicket(ticketId);
}

export async function sendTicketMessage(apiService, ticketId, message) {
  if (!message) return null;
  await apiService.addTicketMessage(ticketId, message);
  return apiService.getTicket(ticketId);
}

export async function closeTicket(apiService, ticketId) {
  await apiService.closeTicket(ticketId);
  return apiService.getTicket(ticketId);
}

export async function rateTicket(apiService, ticketId, rating, comment) {
  if (!rating) return null;
  await apiService.rateTicket(ticketId, rating, comment || '');
  return apiService.getTicket(ticketId);
}

// ── FAQ Operations ───────────────────────────────────────

export async function loadFAQ(apiService, search, category) {
  return (await apiService.getFAQ(search, category)) || [];
}

export async function voteFAQ(apiService, faqId, helpful) {
  return apiService.voteFAQ(faqId, helpful);
}

// ── Admin Operations ─────────────────────────────────────

export async function loadAdminData(apiService, filters) {
  const [analytics, tickets] = await Promise.all([
    apiService.getAdminAnalytics(),
    apiService.getAdminTickets(
      filters.status || '',
      filters.category || '',
      filters.priority || ''
    ),
  ]);
  return { analytics, tickets: tickets || [] };
}

export async function updateAdminTicket(apiService, ticketId, status, priority) {
  return apiService.updateTicket(ticketId, { status, priority });
}

export async function adminReply(apiService, ticketId, message, isInternal) {
  return apiService.addTicketMessage(ticketId, message, isInternal);
}

// ── Support i18n Keys ────────────────────────────────────
// The full i18n dictionary lives in egglogu.js (_sL function).
// During migration, the monolith's _sL() remains authoritative.

// Backward compatibility
window._TICKET_CATEGORIES = TICKET_CATEGORIES;
window._TICKET_PRIORITIES = TICKET_PRIORITIES;
window._TICKET_STATUSES = TICKET_STATUSES;
