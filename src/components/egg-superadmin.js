// EGGlogU — Superadmin Panel Web Component
// Replaces renderSuperadmin(), _saRenderDashboard(), _saRenderInventory(),
// _saRenderAccounts(), _saRenderTickets(), _saRenderMarket(), _saRenderCRM(),
// _saRenderSettings(), and all CRM sub-functions (_crmRender360, _crmRenderReport,
// _crmRenderRetention, _crmShowDiscountModal, etc.)

import { Bus } from '../core/bus.js';
import { apiService } from '../core/api.js';
import { sanitizeHTML, escapeAttr, todayStr } from '../core/utils.js';
import { getCurrentUser } from '../core/permissions.js';
import { getModalBody, modalVal, modalQuery } from './egg-modal.js';
import { showConfirm } from './egg-confirm.js';

// ── i18n labels (ES / EN only; getLang picks one) ────────────
const LABELS = {
  es: {
    title: 'Panel Superadmin',
    tab_dashboard: 'Dashboard', tab_inventory: 'Inventario Global', tab_accounts: 'Cuentas',
    tab_tickets: 'Tickets', tab_market: 'Mercado', tab_crm: 'CRM', tab_settings: 'Mi Cuenta',
    loading: 'Cargando...', total_orgs: 'Organizaciones', total_users: 'Usuarios',
    active_users: 'Activos', mrr: 'MRR Estimado', total_eggs: 'Huevos en Stock',
    open_tickets: 'Tickets Abiertos', bug_tickets: 'Bugs', avg_resolution: 'Resol. Promedio',
    sla: 'SLA', support_rating: 'Rating Soporte', new_orgs_30d: 'Nuevas Orgs (30d)',
    new_users_30d: 'Nuevos Usuarios (30d)', plan_dist: 'Distribucion de Planes',
    org_name: 'Organizacion', plan: 'Plan', users: 'Usuarios', farms: 'Granjas',
    status: 'Estado', created: 'Creado', last_activity: 'Ultima Actividad',
    actions: 'Acciones', deactivate: 'Desactivar', activate: 'Activar', delete: 'Eliminar',
    churn_title: 'Analisis de Churn', monthly_churn: 'Churn Mensual', retention: 'Retencion',
    churned_orgs: 'Orgs Perdidas',
    egg_type: 'Tipo Huevo', quantity: 'Cantidad', warehouse: 'Almacen',
    ticket_id: '#Ticket', subject: 'Asunto', priority: 'Prioridad', category: 'Categoria',
    org: 'Organizacion', delete_selected: 'Eliminar Seleccionados',
    region: 'Region', price: 'Precio Promedio', production: 'Produccion',
    demand: 'Demanda', supply: 'Oferta', trend: 'Tendencia', add_entry: 'Nueva Entrada',
    date: 'Fecha', source: 'Fuente', notes: 'Notas', save: 'Guardar',
    no_data: 'Sin datos', error: 'Error al cargar datos', hours: 'hrs',
    confirm_delete_org: 'ELIMINAR ORGANIZACION COMPLETA. Esto es IRREVERSIBLE.',
    confirm_delete_ticket: 'Eliminar ticket permanentemente?',
    total_production: 'Produccion Total', feature_requests: 'Solicitudes',
    critical_tickets: 'Criticos', response_avg: 'Resp. Promedio',
    current_pw: 'Contrasena Actual', new_pw: 'Nueva Contrasena',
    confirm_pw: 'Confirmar Contrasena', change_pw: 'Cambiar Contrasena',
    pw_changed: 'Contrasena cambiada exitosamente', pw_mismatch: 'Las contrasenas no coinciden',
    pw_rules: 'Minimo 8 caracteres, 1 mayuscula, 1 minuscula, 1 numero, 1 simbolo',
    account_info: 'Informacion de Cuenta',
    crm_orgs: 'Clientes', crm_360: 'Vista 360', crm_health: 'Salud', crm_ltv: 'LTV',
    crm_risk: 'Riesgo', crm_notes: 'Notas', crm_discounts: 'Descuentos',
    crm_retention: 'Retencion', crm_credit_notes: 'Notas de Credito',
    crm_refund: 'Reembolso', crm_change_plan: 'Cambiar Plan', crm_report: 'Reporte CRM',
    crm_apply_discount: 'Aplicar Descuento', crm_issue_refund: 'Emitir Reembolso',
    crm_issue_credit: 'Emitir Nota de Credito', crm_percent_off: '% Descuento',
    crm_duration: 'Duracion (meses)', crm_reason: 'Motivo', crm_amount: 'Monto (centavos)',
    crm_currency: 'Moneda', crm_new_plan: 'Nuevo Plan', crm_interval: 'Intervalo',
    crm_active: 'Activo', crm_revoke: 'Revocar', crm_back: 'Volver', crm_export: 'Exportar',
    crm_score: 'Puntuacion', crm_subscription: 'Suscripcion',
    crm_billing_history: 'Historial Facturacion', crm_no_notes: 'Sin notas',
    crm_add_note: 'Agregar Nota', crm_pinned: 'Fijada', crm_evaluate: 'Evaluar Retencion',
    crm_rules: 'Reglas', crm_events: 'Eventos', crm_trigger: 'Disparador',
    crm_action: 'Accion', crm_result: 'Resultado', crm_conditions: 'Condiciones',
    crm_template: 'Plantilla Email', crm_avg_health: 'Salud Promedio',
    crm_total_ltv: 'LTV Total', crm_active_discounts: 'Descuentos Activos',
    crm_events_30d: 'Eventos (30d)', crm_credits_total: 'Total Creditos',
    crm_payment_id: 'ID Pago', crm_confirm_refund: 'Confirmar reembolso?',
    crm_month: 'mes', crm_year: 'ano',
    cancel: 'Cancelar', confirm: 'Confirmar',
    type_name_confirm: 'Escriba el nombre de la organizacion para confirmar:',
    name_no_match: 'Nombre no coincide. Cancelado.',
    org_updated: 'Organizacion actualizada', org_deleted: 'Organizacion eliminada',
    ticket_deleted: 'Ticket eliminado', select_tickets: 'Selecciona tickets',
    tickets_deleted: 'tickets eliminados', entry_created: 'Entrada creada',
    discount_applied: 'Descuento aplicado', refund_issued: 'Reembolso emitido',
    credit_issued: 'Nota de credito emitida', plan_changed: 'Plan cambiado',
    note_added: 'Nota agregada', note_deleted: 'Nota eliminada',
    discount_revoked: 'Descuento revocado', exported: 'Exportado',
    rule_created: 'Regla creada', rule_deleted: 'Regla eliminada',
    eval_complete: 'Evaluacion completa',
    pct_off: '% Descuento', dur_months: 'Duracion (meses)', reason: 'Motivo',
    apply_discount: 'Aplicar Descuento', pid: 'Payment Intent ID',
    amt_cents: 'Monto (centavos, vacio=total)', issue_refund: 'Emitir Reembolso',
    amt_cents_req: 'Monto (centavos)', currency: 'Moneda',
    issue_credit: 'Emitir Nota de Credito', new_plan: 'Nuevo Plan',
    interval: 'Intervalo', month: 'Mes', year: 'Ano', change_plan: 'Cambiar Plan'
  },
  en: {
    title: 'Superadmin Panel',
    tab_dashboard: 'Dashboard', tab_inventory: 'Global Inventory', tab_accounts: 'Accounts',
    tab_tickets: 'Tickets', tab_market: 'Market', tab_crm: 'CRM', tab_settings: 'My Account',
    loading: 'Loading...', total_orgs: 'Organizations', total_users: 'Users',
    active_users: 'Active', mrr: 'Estimated MRR', total_eggs: 'Eggs in Stock',
    open_tickets: 'Open Tickets', bug_tickets: 'Bugs', avg_resolution: 'Avg. Resolution',
    sla: 'SLA', support_rating: 'Support Rating', new_orgs_30d: 'New Orgs (30d)',
    new_users_30d: 'New Users (30d)', plan_dist: 'Plan Distribution',
    org_name: 'Organization', plan: 'Plan', users: 'Users', farms: 'Farms',
    status: 'Status', created: 'Created', last_activity: 'Last Activity',
    actions: 'Actions', deactivate: 'Deactivate', activate: 'Activate', delete: 'Delete',
    churn_title: 'Churn Analysis', monthly_churn: 'Monthly Churn', retention: 'Retention',
    churned_orgs: 'Churned Orgs',
    egg_type: 'Egg Type', quantity: 'Quantity', warehouse: 'Warehouse',
    ticket_id: '#Ticket', subject: 'Subject', priority: 'Priority', category: 'Category',
    org: 'Organization', delete_selected: 'Delete Selected',
    region: 'Region', price: 'Avg. Price', production: 'Production',
    demand: 'Demand', supply: 'Supply', trend: 'Trend', add_entry: 'New Entry',
    date: 'Date', source: 'Source', notes: 'Notes', save: 'Save',
    no_data: 'No data', error: 'Error loading data', hours: 'hrs',
    confirm_delete_org: 'DELETE ENTIRE ORGANIZATION. This is IRREVERSIBLE.',
    confirm_delete_ticket: 'Permanently delete ticket?',
    total_production: 'Total Production', feature_requests: 'Feature Requests',
    critical_tickets: 'Critical', response_avg: 'Avg. Response',
    current_pw: 'Current Password', new_pw: 'New Password',
    confirm_pw: 'Confirm Password', change_pw: 'Change Password',
    pw_changed: 'Password changed successfully', pw_mismatch: 'Passwords do not match',
    pw_rules: 'Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol',
    account_info: 'Account Info',
    crm_orgs: 'Customers', crm_360: '360 View', crm_health: 'Health', crm_ltv: 'LTV',
    crm_risk: 'Risk', crm_notes: 'Notes', crm_discounts: 'Discounts',
    crm_retention: 'Retention', crm_credit_notes: 'Credit Notes',
    crm_refund: 'Refund', crm_change_plan: 'Change Plan', crm_report: 'CRM Report',
    crm_apply_discount: 'Apply Discount', crm_issue_refund: 'Issue Refund',
    crm_issue_credit: 'Issue Credit Note', crm_percent_off: '% Off',
    crm_duration: 'Duration (months)', crm_reason: 'Reason', crm_amount: 'Amount (cents)',
    crm_currency: 'Currency', crm_new_plan: 'New Plan', crm_interval: 'Interval',
    crm_active: 'Active', crm_revoke: 'Revoke', crm_back: 'Back', crm_export: 'Export',
    crm_score: 'Score', crm_subscription: 'Subscription',
    crm_billing_history: 'Billing History', crm_no_notes: 'No notes',
    crm_add_note: 'Add Note', crm_pinned: 'Pinned', crm_evaluate: 'Evaluate Retention',
    crm_rules: 'Rules', crm_events: 'Events', crm_trigger: 'Trigger',
    crm_action: 'Action', crm_result: 'Result', crm_conditions: 'Conditions',
    crm_template: 'Email Template', crm_avg_health: 'Avg Health',
    crm_total_ltv: 'Total LTV', crm_active_discounts: 'Active Discounts',
    crm_events_30d: 'Events (30d)', crm_credits_total: 'Total Credits',
    crm_payment_id: 'Payment ID', crm_confirm_refund: 'Confirm refund?',
    crm_month: 'month', crm_year: 'year',
    cancel: 'Cancel', confirm: 'Confirm',
    type_name_confirm: 'Type the organization name to confirm:',
    name_no_match: 'Name does not match. Cancelled.',
    org_updated: 'Organization updated', org_deleted: 'Organization deleted',
    ticket_deleted: 'Ticket deleted', select_tickets: 'Select tickets',
    tickets_deleted: 'tickets deleted', entry_created: 'Entry created',
    discount_applied: 'Discount applied', refund_issued: 'Refund issued',
    credit_issued: 'Credit note issued', plan_changed: 'Plan changed',
    note_added: 'Note added', note_deleted: 'Note deleted',
    discount_revoked: 'Discount revoked', exported: 'Exported',
    rule_created: 'Rule created', rule_deleted: 'Rule deleted',
    eval_complete: 'Evaluation complete',
    pct_off: '% Off', dur_months: 'Duration (months)', reason: 'Reason',
    apply_discount: 'Apply Discount', pid: 'Payment Intent ID',
    amt_cents: 'Amount (cents, empty=full)', issue_refund: 'Issue Refund',
    amt_cents_req: 'Amount (cents)', currency: 'Currency',
    issue_credit: 'Issue Credit Note', new_plan: 'New Plan',
    interval: 'Interval', month: 'Month', year: 'Year', change_plan: 'Change Plan'
  }
};

function _lbl() {
  const lang = document.documentElement.lang || 'es';
  return LABELS[lang] || LABELS[Object.keys(LABELS).find(k => lang.startsWith(k))] || LABELS.es;
}

const TABS = [
  { id: 'sa-dashboard',  icon: '\uD83D\uDCCA' , key: 'tab_dashboard'  },
  { id: 'sa-inventory',  icon: '\uD83D\uDCE6' , key: 'tab_inventory'  },
  { id: 'sa-accounts',   icon: '\uD83C\uDFE2' , key: 'tab_accounts'   },
  { id: 'sa-tickets',    icon: '\uD83C\uDFAB' , key: 'tab_tickets'    },
  { id: 'sa-market',     icon: '\uD83D\uDCC8' , key: 'tab_market'     },
  { id: 'sa-crm',        icon: '\uD83D\uDCBC' , key: 'tab_crm'        },
  { id: 'sa-settings',   icon: '\u2699\uFE0F' , key: 'tab_settings'   }
];

// ── Helper: superadmin API fetch ─────────────────────────────
function _saFetch(path) {
  return apiService.request('GET', '/superadmin' + path);
}

// ══════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════

class EggSuperadmin extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'sa-dashboard';
    this._crmView = 'list';
    this._crmOrgId = null;
    this._crmOrgName = '';
    this._unsubs = [];
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('modal:action', (e) => this._onModalAction(e)),
      Bus.on('modal:change', (e) => this._onModalChange(e))
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  // ── Main render ────────────────────────────────────────────

  async render() {
    const lbl = _lbl();
    let h = this._baseStyle();

    // Header
    h += `<div class="page-header"><h2>\uD83D\uDD11 ${lbl.title}</h2></div>`;

    // Tab bar
    h += '<div class="tabs">';
    TABS.forEach(tb => {
      h += `<button class="btn ${this._currentTab === tb.id ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="tab" data-tab="${tb.id}">${tb.icon} ${lbl[tb.key]}</button>`;
    });
    h += '</div>';

    // Content container
    h += '<div class="sa-content"><div class="loading-spinner" aria-label="' + lbl.loading + '"></div></div>';

    this.shadowRoot.innerHTML = h;
    this._bindEvents();

    // Render active tab asynchronously
    const ct = this.shadowRoot.querySelector('.sa-content');
    if (!ct) return;

    try {
      if (this._currentTab === 'sa-dashboard')       ct.innerHTML = await this._renderDashboard(lbl);
      else if (this._currentTab === 'sa-inventory')   ct.innerHTML = await this._renderInventory(lbl);
      else if (this._currentTab === 'sa-accounts')    ct.innerHTML = await this._renderAccounts(lbl);
      else if (this._currentTab === 'sa-tickets')     ct.innerHTML = await this._renderTickets(lbl);
      else if (this._currentTab === 'sa-market')      ct.innerHTML = await this._renderMarket(lbl);
      else if (this._currentTab === 'sa-crm')         ct.innerHTML = await this._renderCRM(lbl);
      else if (this._currentTab === 'sa-settings')    ct.innerHTML = this._renderSettings(lbl);
    } catch (e) {
      ct.innerHTML = `<div class="card"><p style="color:var(--danger)">${lbl.error}: ${sanitizeHTML(e.message)}</p></div>`;
    }

    // Re-bind after async content
    this._bindContentEvents();
  }

  // ── Styles ─────────────────────────────────────────────────

  _baseStyle() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
      .tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
      .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
      .kpi-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .kpi-label { font-size: 12px; color: var(--text-light, #888); text-transform: uppercase; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #333); }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; font-weight: 500; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #dc3545); color: #fff; border: none; }
      .btn-warning { background: var(--warning, #ffc107); color: #000; border: none; }
      .btn-info { background: var(--info, #17a2b8); color: #fff; border: none; }
      .btn:hover { opacity: 0.85; }
      .btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-warning { background: #fff8e1; color: #e65100; }
      .badge-danger { background: #ffebee; color: #c62828; }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .badge-secondary { background: #f5f5f5; color: #666; }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
      th { background: var(--bg-secondary, #f5f5f5); font-weight: 600; }
      .loading-spinner { display: flex; justify-content: center; padding: 40px; }
      .loading-spinner::after { content: ''; width: 32px; height: 32px; border: 3px solid var(--border, #ddd); border-top-color: var(--primary, #1A3C6E); border-radius: 50%; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--text-light, #888); }
      input, select { padding: 8px; border: 1px solid var(--border, #ddd); border-radius: var(--radius, 8px); font-size: 14px; width: 100%; box-sizing: border-box; }
      input:focus, select:focus { outline: none; border-color: var(--primary, #1A3C6E); }
      form { margin: 0; }
      /* Modal overlay inside shadow DOM for CRM modals */
      .sa-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999; display: flex; align-items: center; justify-content: center; }
      .sa-modal-content { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 24px; max-width: 450px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,.2); }
      .sa-modal-content h3 { margin: 0 0 16px; }
      @media (max-width: 768px) {
        .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 480px) {
        .kpi-grid { grid-template-columns: 1fr; }
        .tabs { overflow-x: auto; }
      }
    </style>`;
  }

  // ── Event binding ──────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      // Tab switching
      if (action === 'tab') {
        this._currentTab = btn.dataset.tab;
        this.render();
        return;
      }
    });
  }

  _bindContentEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id || '';
      const name = btn.dataset.name || '';

      switch (action) {
        // Accounts
        case 'toggle-org':
          this._toggleOrg(id, btn.dataset.newStatus);
          break;
        case 'delete-org':
          this._deleteOrg(id, name);
          break;

        // Tickets
        case 'delete-ticket':
          this._deleteTicket(id);
          break;
        case 'bulk-delete-tickets':
          this._bulkDeleteTickets();
          break;
        case 'select-all-tickets': {
          const checked = btn.checked !== undefined ? btn.checked : !btn.classList.contains('checked');
          root.querySelectorAll('.sa-ticket-cb').forEach(c => { c.checked = checked; });
          break;
        }

        // Market
        case 'submit-market':
          this._addMarketEntry();
          break;

        // CRM navigation
        case 'crm-view':
          this._crmView = btn.dataset.view;
          this._crmOrgId = null;
          this.render();
          break;
        case 'crm-360':
          this._crmView = '360';
          this._crmOrgId = id;
          this._crmOrgName = name;
          this.render();
          break;
        case 'crm-back':
          this._crmView = 'list';
          this._crmOrgId = null;
          this.render();
          break;
        case 'crm-export':
          this._crmExport(id, btn.dataset.fmt || 'json');
          break;

        // CRM 360 actions
        case 'crm-show-discount':
          this._crmShowDiscountModal(id);
          break;
        case 'crm-show-refund':
          this._crmShowRefundModal(id);
          break;
        case 'crm-show-credit':
          this._crmShowCreditModal(id);
          break;
        case 'crm-show-plan':
          this._crmShowPlanModal(id);
          break;
        case 'crm-submit-note':
          this._crmAddNote(id);
          break;
        case 'crm-toggle-pin':
          this._crmTogglePin(btn.dataset.orgId, id, btn.dataset.pin === 'true');
          break;
        case 'crm-delete-note':
          this._crmDeleteNote(btn.dataset.orgId, id);
          break;
        case 'crm-revoke-discount':
          this._crmRevokeDiscount(id);
          break;

        // CRM Retention
        case 'crm-show-rule':
          this._crmShowRuleModal();
          break;
        case 'crm-evaluate':
          this._crmEvaluateRetention();
          break;
        case 'crm-toggle-rule':
          this._crmToggleRule(id, btn.dataset.active === 'true');
          break;
        case 'crm-delete-rule':
          this._crmDeleteRule(id);
          break;

        // CRM modal submissions
        case 'crm-modal-close':
          root.querySelector('.sa-modal-overlay')?.remove();
          break;
        case 'crm-submit-discount':
          this._crmApplyDiscount(id);
          break;
        case 'crm-submit-refund':
          this._crmIssueRefund(id);
          break;
        case 'crm-submit-credit':
          this._crmIssueCreditNote(id);
          break;
        case 'crm-submit-plan':
          this._crmChangePlan(id);
          break;
        case 'crm-submit-rule':
          this._crmCreateRule();
          break;

        // Settings
        case 'change-pw':
          this._changePassword();
          break;
      }
    });
  }

  // ── Modal action handler (from egg-modal Bus events) ───────

  _onModalAction(e) {
    // Not used for superadmin (uses inline modals), but reserved for future
  }

  _onModalChange(e) {
    // Reserved
  }

  // ══════════════════════════════════════════════════════════════
  // TAB RENDERERS
  // ══════════════════════════════════════════════════════════════

  // ── Dashboard ──────────────────────────────────────────────

  async _renderDashboard(lbl) {
    const stats = await _saFetch('/platform-stats');
    let h = '<div class="kpi-grid">';
    const kpis = [
      { label: lbl.total_orgs,       value: stats.total_organizations,                            color: 'var(--primary)' },
      { label: lbl.total_users,      value: stats.total_users,                                    color: 'var(--info)' },
      { label: lbl.active_users,     value: stats.active_users,                                   color: 'var(--success)' },
      { label: lbl.mrr,              value: '$' + ((stats.mrr_estimated || 0).toFixed(2)),         color: 'var(--warning)' },
      { label: lbl.total_eggs,       value: (stats.total_eggs_in_stock || 0).toLocaleString(),     color: '#8B4513' },
      { label: lbl.open_tickets,     value: stats.open_tickets || 0,                              color: 'var(--danger)' },
      { label: lbl.bug_tickets,      value: stats.bug_tickets || 0,                               color: '#f44336' },
      { label: lbl.feature_requests, value: stats.feature_requests || 0,                          color: '#2196F3' },
      { label: lbl.critical_tickets, value: stats.critical_tickets || 0,                          color: '#d32f2f' },
      { label: lbl.avg_resolution,   value: ((stats.avg_resolution_hours || 0).toFixed(1)) + ' ' + lbl.hours, color: 'var(--info)' },
      { label: lbl.response_avg,     value: ((stats.ticket_response_avg_hours || 0).toFixed(1)) + ' ' + lbl.hours, color: '#673AB7' },
      { label: lbl.sla,              value: ((stats.sla_compliance_pct || 0).toFixed(1)) + '%',   color: stats.sla_compliance_pct >= 90 ? 'var(--success)' : 'var(--danger)' },
      { label: lbl.support_rating,   value: ((stats.avg_support_rating || 0).toFixed(1)) + '/5',  color: '#FF9800' },
      { label: lbl.new_orgs_30d,     value: stats.new_orgs_30d || 0,                             color: 'var(--primary)' },
      { label: lbl.new_users_30d,    value: stats.new_users_30d || 0,                            color: 'var(--info)' }
    ];
    kpis.forEach(k => {
      h += `<div class="kpi-card"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="color:${k.color}">${k.value}</div></div>`;
    });
    h += '</div>';

    // Plan distribution
    if (stats.plan_distribution) {
      h += `<div class="card"><h3>${lbl.plan_dist}</h3><div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">`;
      const colors = { hobby: '#78909C', starter: '#42A5F5', pro: '#AB47BC', enterprise: '#FF7043' };
      Object.entries(stats.plan_distribution).forEach(([plan, count]) => {
        h += `<div style="text-align:center;padding:12px 20px;background:var(--bg-card,var(--bg,#fff));border-radius:8px;border:2px solid ${colors[plan] || 'var(--border)'}">
          <div style="font-size:24px;font-weight:700;color:${colors[plan] || 'var(--text)'}">${count}</div>
          <div style="font-size:12px;color:var(--text-light);text-transform:uppercase">${plan}</div></div>`;
      });
      h += '</div></div>';
    }
    return h;
  }

  // ── Inventory ──────────────────────────────────────────────

  async _renderInventory(lbl) {
    let h = '';
    const data = await _saFetch('/inventory/overview');
    h += `<div class="card"><h3>\uD83D\uDCE6 ${lbl.tab_inventory}</h3>`;
    if (!data || !data.length) {
      h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`;
    } else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.org}</th><th>${lbl.egg_type}</th><th>${lbl.quantity}</th><th>${lbl.warehouse}</th></tr></thead><tbody>`;
      data.forEach(item => {
        h += `<tr><td>${sanitizeHTML(item.organization_name || '-')}</td><td>${sanitizeHTML(item.egg_type || '-')}</td><td>${(item.total_quantity || 0).toLocaleString()}</td><td>${sanitizeHTML(item.warehouse || '-')}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  }

  // ── Accounts ───────────────────────────────────────────────

  async _renderAccounts(lbl) {
    const [orgs, churn] = await Promise.all([_saFetch('/organizations'), _saFetch('/churn-analysis')]);
    let h = '';

    // Churn KPIs
    h += `<div class="card" style="margin-bottom:16px"><h3>\uD83D\uDCC9 ${lbl.churn_title}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px">
      <div class="kpi-card"><div class="kpi-label">${lbl.monthly_churn}</div><div class="kpi-value" style="color:${churn.monthly_churn_rate > 5 ? 'var(--danger)' : 'var(--success)'}">${(churn.monthly_churn_rate || 0).toFixed(1)}%</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.retention}</div><div class="kpi-value" style="color:${churn.retention_rate >= 90 ? 'var(--success)' : 'var(--warning)'}">${(churn.retention_rate || 0).toFixed(1)}%</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.churned_orgs}</div><div class="kpi-value" style="color:var(--danger)">${(churn.churned_orgs || []).length}</div></div>
      </div></div>`;

    // Orgs table
    h += `<div class="card"><h3>\uD83C\uDFE2 ${lbl.tab_accounts}</h3>`;
    if (!orgs || !orgs.length) {
      h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`;
    } else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.org_name}</th><th>${lbl.plan}</th><th>${lbl.users}</th><th>${lbl.farms}</th><th>${lbl.status}</th><th>${lbl.created}</th><th>${lbl.actions}</th></tr></thead><tbody>`;
      orgs.forEach(o => {
        const st = o.subscription_status || 'active';
        const badge = st === 'active' ? 'success' : st === 'trialing' ? 'info' : 'secondary';
        const isActive = st === 'active' || st === 'trialing';
        h += `<tr>
          <td><strong>${sanitizeHTML(o.name || '-')}</strong></td>
          <td><span class="badge badge-${o.plan === 'enterprise' ? 'warning' : o.plan === 'pro' ? 'info' : 'secondary'}">${(o.plan || 'free').toUpperCase()}</span></td>
          <td>${o.user_count || 0}</td><td>${o.farm_count || 0}</td>
          <td><span class="badge badge-${badge}">${st}</span></td>
          <td>${o.created_at ? o.created_at.substring(0, 10) : '-'}</td>
          <td><div class="btn-group">
            <button class="btn btn-secondary btn-sm" data-action="toggle-org" data-id="${escapeAttr(o.id)}" data-new-status="${isActive ? 'cancelled' : 'active'}">${isActive ? lbl.deactivate : lbl.activate}</button>
            <button class="btn btn-danger btn-sm" data-action="delete-org" data-id="${escapeAttr(o.id)}" data-name="${escapeAttr(o.name || '')}">${lbl.delete}</button>
          </div></td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  }

  async _toggleOrg(orgId, newStatus) {
    const lbl = _lbl();
    try {
      await apiService.request('PATCH', '/superadmin/organizations/' + orgId, { subscription_status: newStatus });
      Bus.emit('toast', { msg: lbl.org_updated });
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _deleteOrg(orgId, orgName) {
    const lbl = _lbl();
    const input = prompt(lbl.confirm_delete_org + '\n' + lbl.type_name_confirm);
    if (!input || input !== orgName) {
      Bus.emit('toast', { msg: lbl.name_no_match, type: 'error' });
      return;
    }
    try {
      await apiService.request('DELETE', '/superadmin/organizations/' + orgId);
      Bus.emit('toast', { msg: lbl.org_deleted });
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  // ── Tickets ────────────────────────────────────────────────

  async _renderTickets(lbl) {
    const data = await _saFetch('/tickets?limit=50');
    const tickets = data.items || data || [];
    let h = `<div class="card"><h3>\uD83C\uDFAB ${lbl.tab_tickets}</h3>`;
    if (!tickets.length) {
      h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`;
    } else {
      h += `<div style="margin-bottom:12px"><button class="btn btn-danger btn-sm" data-action="bulk-delete-tickets">${lbl.delete_selected}</button></div>`;
      h += `<div class="table-wrap"><table><thead><tr>
        <th><input type="checkbox" data-action="select-all-tickets"></th>
        <th>${lbl.ticket_id}</th><th>${lbl.subject}</th><th>${lbl.org}</th><th>${lbl.priority}</th><th>${lbl.category}</th><th>${lbl.status}</th><th>${lbl.actions}</th>
      </tr></thead><tbody>`;
      tickets.forEach(tk => {
        const prBadge = { critical: 'danger', high: 'warning', medium: 'info', low: 'secondary' };
        h += `<tr>
          <td><input type="checkbox" class="sa-ticket-cb" value="${escapeAttr(tk.id)}"></td>
          <td>${sanitizeHTML(tk.ticket_number || (tk.id ? tk.id.substring(0, 8) : '-'))}</td>
          <td>${sanitizeHTML(tk.subject || '-')}</td>
          <td>${sanitizeHTML(tk.organization_name || '-')}</td>
          <td><span class="badge badge-${prBadge[tk.priority] || 'secondary'}">${sanitizeHTML(tk.priority || '-')}</span></td>
          <td>${sanitizeHTML(tk.category || '-')}</td>
          <td><span class="badge badge-${tk.status === 'open' ? 'warning' : tk.status === 'resolved' ? 'success' : 'secondary'}">${sanitizeHTML(tk.status || '-')}</span></td>
          <td><button class="btn btn-danger btn-sm" data-action="delete-ticket" data-id="${escapeAttr(tk.id)}">${lbl.delete}</button></td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  }

  async _deleteTicket(ticketId) {
    const lbl = _lbl();
    if (!confirm(lbl.confirm_delete_ticket)) return;
    try {
      await apiService.request('DELETE', '/superadmin/tickets/' + ticketId);
      Bus.emit('toast', { msg: lbl.ticket_deleted });
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _bulkDeleteTickets() {
    const lbl = _lbl();
    const ids = Array.from(this.shadowRoot.querySelectorAll('.sa-ticket-cb:checked')).map(c => c.value);
    if (!ids.length) { Bus.emit('toast', { msg: lbl.select_tickets, type: 'error' }); return; }
    if (!confirm(`${lbl.delete} ${ids.length} ticket(s)?`)) return;
    try {
      await apiService.request('DELETE', '/superadmin/tickets/bulk', { ticket_ids: ids });
      Bus.emit('toast', { msg: ids.length + ' ' + lbl.tickets_deleted });
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  // ── Market ─────────────────────────────────────────────────

  async _renderMarket(lbl) {
    const [data, summary] = await Promise.all([_saFetch('/market-intelligence'), _saFetch('/market-intelligence/summary')]);
    const items = data.items || data || [];
    let h = '';

    // Summary cards
    if (summary && summary.length) {
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">';
      summary.forEach(s => {
        const trendIcon = { up: '\uD83D\uDCC8', down: '\uD83D\uDCC9', stable: '\u27A1\uFE0F' };
        h += `<div class="kpi-card"><div class="kpi-label">${sanitizeHTML(s.region)}</div>
          <div class="kpi-value" style="font-size:1.1rem">${trendIcon[s.avg_trend] || '\u27A1\uFE0F'} $${(s.avg_price || 0).toFixed(2)}</div>
          <div style="font-size:11px;color:var(--text-light)">${lbl.production}: ${(s.total_production || 0).toLocaleString()}</div></div>`;
      });
      h += '</div>';
    }

    // Add entry form
    const today = todayStr();
    h += `<div class="card" style="margin-bottom:16px"><h3>\u2795 ${lbl.add_entry}</h3>
      <div class="sa-market-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px">
        <div><label>${lbl.date}</label><input type="date" data-field="report_date" value="${today}"></div>
        <div><label>${lbl.region}</label><input type="text" data-field="region" placeholder="LATAM, NA, EU..."></div>
        <div><label>${lbl.egg_type}</label><input type="text" data-field="egg_type" placeholder="Convencional, Organico..."></div>
        <div><label>${lbl.price} ($)</label><input type="number" data-field="avg_price_per_unit" step="0.01" min="0"></div>
        <div><label>${lbl.production} (units)</label><input type="number" data-field="total_production_units" min="0" value="0"></div>
        <div><label>${lbl.demand} (0-100)</label><input type="number" data-field="demand_index" step="0.1" min="0" max="100" value="50"></div>
        <div><label>${lbl.supply} (0-100)</label><input type="number" data-field="supply_index" step="0.1" min="0" max="100" value="50"></div>
        <div><label>${lbl.trend}</label><select data-field="price_trend"><option value="stable">Stable</option><option value="up">Up</option><option value="down">Down</option></select></div>
        <div><label>${lbl.source}</label><input type="text" data-field="source" placeholder="FAO, USDA..."></div>
        <div><label>${lbl.notes}</label><input type="text" data-field="notes"></div>
        <div style="display:flex;align-items:end"><button class="btn btn-primary" data-action="submit-market">${lbl.save}</button></div>
      </div></div>`;

    // Data table
    h += `<div class="card"><h3>\uD83D\uDCC8 ${lbl.tab_market}</h3>`;
    if (!items.length) {
      h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`;
    } else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.date}</th><th>${lbl.region}</th><th>${lbl.egg_type}</th><th>${lbl.price}</th><th>${lbl.production}</th><th>${lbl.demand}</th><th>${lbl.supply}</th><th>${lbl.trend}</th><th>${lbl.source}</th></tr></thead><tbody>`;
      items.forEach(mi => {
        const trendIcon = { up: '\uD83D\uDCC8', down: '\uD83D\uDCC9', stable: '\u27A1\uFE0F' };
        h += `<tr><td>${sanitizeHTML(mi.report_date || '-')}</td><td>${sanitizeHTML(mi.region || '-')}</td><td>${sanitizeHTML(mi.egg_type || '-')}</td>
          <td>$${(mi.avg_price_per_unit || 0).toFixed(2)}</td><td>${(mi.total_production_units || 0).toLocaleString()}</td>
          <td>${mi.demand_index || 0}</td><td>${mi.supply_index || 0}</td>
          <td>${trendIcon[mi.price_trend] || '\u27A1\uFE0F'} ${sanitizeHTML(mi.price_trend || '-')}</td><td>${sanitizeHTML(mi.source || '-')}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  }

  async _addMarketEntry() {
    const lbl = _lbl();
    const form = this.shadowRoot.querySelector('.sa-market-form');
    if (!form) return;
    const body = {};
    form.querySelectorAll('[data-field]').forEach(el => {
      const k = el.dataset.field;
      const v = el.value;
      if (['avg_price_per_unit', 'demand_index', 'supply_index'].includes(k)) body[k] = parseFloat(v);
      else if (k === 'total_production_units') body[k] = parseInt(v) || 0;
      else body[k] = v;
    });
    try {
      await apiService.request('POST', '/superadmin/market-intelligence', body);
      Bus.emit('toast', { msg: lbl.entry_created });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── CRM ────────────────────────────────────────────────────

  async _renderCRM(lbl) {
    let h = '';

    // Sub-nav
    const views = [
      { id: 'list',      label: lbl.crm_orgs,      icon: '\uD83C\uDFE2' },
      { id: 'report',    label: lbl.crm_report,     icon: '\uD83D\uDCCA' },
      { id: 'retention', label: lbl.crm_retention,  icon: '\uD83D\uDD04' }
    ];
    h += '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">';
    views.forEach(v => {
      h += `<button class="btn ${this._crmView === v.id ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="crm-view" data-view="${v.id}">${v.icon} ${v.label}</button>`;
    });
    if (this._crmView === '360' && this._crmOrgName) {
      h += `<span class="badge badge-info" style="align-self:center;font-size:0.85rem">360 ${sanitizeHTML(this._crmOrgName)}</span>`;
    }
    h += '</div>';

    if (this._crmView === '360' && this._crmOrgId) h += await this._crmRender360(lbl);
    else if (this._crmView === 'report')            h += await this._crmRenderReport(lbl);
    else if (this._crmView === 'retention')          h += await this._crmRenderRetention(lbl);
    else                                             h += await this._crmRenderOrgList(lbl);

    return h;
  }

  async _crmRenderOrgList(lbl) {
    const data = await _saFetch('/crm/report');
    const orgs = await _saFetch('/organizations');
    let h = `<div class="card"><h3>\uD83C\uDFE2 ${lbl.crm_orgs}</h3>`;
    if (!orgs || !orgs.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p></div>`; return h; }

    // KPI row
    h += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
      <div class="kpi-card"><div class="kpi-label">${lbl.total_orgs}</div><div class="kpi-value">${data.total_orgs || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_avg_health}</div><div class="kpi-value" style="color:${(data.avg_health_score || 0) >= 70 ? 'var(--success)' : (data.avg_health_score || 0) >= 40 ? 'var(--warning)' : 'var(--danger)'}">${(data.avg_health_score || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_total_ltv}</div><div class="kpi-value" style="color:var(--success)">$${(data.total_ltv || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_active_discounts}</div><div class="kpi-value">${data.active_discounts || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_events_30d}</div><div class="kpi-value">${data.retention_events_30d || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_credits_total}</div><div class="kpi-value">$${((data.credit_notes_total_cents || 0) / 100).toFixed(2)}</div></div>
    </div>`;

    // Risk distribution
    if (data.risk_distribution) {
      h += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
      const riskColors = { low: 'var(--success)', medium: 'var(--warning)', high: '#ff5722', critical: 'var(--danger)' };
      const riskLabels = { low: 'Bajo', medium: 'Medio', high: 'Alto', critical: 'Critico' };
      Object.entries(data.risk_distribution).forEach(([r, c]) => {
        h += `<div style="padding:6px 14px;border-radius:20px;background:${riskColors[r] || 'var(--bg-card)'};color:#fff;font-size:0.8rem;font-weight:600">${riskLabels[r] || r}: ${c}</div>`;
      });
      h += '</div>';
    }

    // Org table with health score
    h += `<div class="table-wrap"><table><thead><tr><th>${lbl.org_name}</th><th>${lbl.plan}</th><th>${lbl.crm_score}</th><th>${lbl.crm_risk}</th><th>${lbl.crm_ltv}</th><th>${lbl.users}</th><th>${lbl.farms}</th><th>${lbl.actions}</th></tr></thead><tbody>`;
    for (const o of orgs) {
      let hs = 0, risk = 'low';
      try {
        const h360 = await apiService.request('GET', '/superadmin/organizations/' + o.id + '/crm-360');
        hs = h360.health?.score || 0;
        risk = h360.health?.risk || 'low';
      } catch (_e) { /* silent */ }
      const riskColors = { low: 'success', medium: 'warning', high: 'danger', critical: 'danger' };
      const planColors = { hobby: 'secondary', starter: 'info', pro: 'info', enterprise: 'warning' };
      h += `<tr>
        <td><strong>${sanitizeHTML(o.name || '-')}</strong><br><span style="font-size:0.75rem;color:var(--text-light)">${sanitizeHTML(o.slug || '')}</span></td>
        <td><span class="badge badge-${planColors[o.plan] || 'secondary'}">${(o.plan || 'free').toUpperCase()}</span></td>
        <td><div style="display:flex;align-items:center;gap:6px"><div style="width:40px;height:6px;background:var(--bg-card,#eee);border-radius:3px;overflow:hidden"><div style="width:${hs}%;height:100%;background:${hs >= 70 ? 'var(--success)' : hs >= 40 ? 'var(--warning)' : 'var(--danger)'}"></div></div><span style="font-size:0.85rem;font-weight:600">${hs}</span></div></td>
        <td><span class="badge badge-${riskColors[risk] || 'secondary'}">${risk.toUpperCase()}</span></td>
        <td style="font-weight:600">$${(hs * 10).toFixed(0)}</td>
        <td>${o.user_count || 0}</td>
        <td>${o.farm_count || 0}</td>
        <td><button class="btn btn-primary btn-sm" data-action="crm-360" data-id="${escapeAttr(o.id)}" data-name="${escapeAttr(o.name || '')}">360</button>
        <button class="btn btn-secondary btn-sm" data-action="crm-export" data-id="${escapeAttr(o.id)}" data-fmt="json">${lbl.crm_export}</button></td>
      </tr>`;
    }
    h += '</tbody></table></div></div>';
    return h;
  }

  async _crmRender360(lbl) {
    const data = await apiService.request('GET', '/superadmin/organizations/' + this._crmOrgId + '/crm-360');
    const orgId = this._crmOrgId;
    let h = `<button class="btn btn-secondary btn-sm" data-action="crm-back" style="margin-bottom:12px">\u2190 ${lbl.crm_back}</button>`;

    // Header with health score
    const hs = data.health || {};
    const org = data.organization || {};
    h += `<div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div><h3 style="margin:0">${sanitizeHTML(org.name || this._crmOrgName)}</h3><span style="color:var(--text-light);font-size:0.85rem">${sanitizeHTML(org.slug || '')} · ${sanitizeHTML(org.tier || '')}</span></div>
      <div style="display:flex;gap:16px;align-items:center">
        <div style="text-align:center"><div style="font-size:2rem;font-weight:700;color:${(hs.score || 0) >= 70 ? 'var(--success)' : (hs.score || 0) >= 40 ? 'var(--warning)' : 'var(--danger)'}">${hs.score || 0}</div><div style="font-size:0.7rem;color:var(--text-light)">${lbl.crm_health}</div></div>
        <div style="text-align:center"><div style="font-size:1.3rem;font-weight:700;color:var(--success)">$${(data.ltv?.total_value || 0).toFixed(0)}</div><div style="font-size:0.7rem;color:var(--text-light)">${lbl.crm_ltv}</div></div>
        <span class="badge badge-${(hs.risk || 'low') === 'low' ? 'success' : (hs.risk || 'low') === 'medium' ? 'warning' : 'danger'}" style="font-size:0.9rem;padding:6px 12px">${(hs.risk || 'low').toUpperCase()}</span>
      </div></div></div>`;

    // Subscription info
    const sub = data.subscription || {};
    if (sub.plan || sub.status) {
      h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCB3 ${lbl.crm_subscription}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        <div class="kpi-card"><div class="kpi-label">${lbl.plan}</div><div class="kpi-value" style="font-size:0.95rem">${(sub.plan || '-').toUpperCase()}</div></div>
        <div class="kpi-card"><div class="kpi-label">${lbl.status}</div><div class="kpi-value" style="font-size:0.95rem">${sanitizeHTML(sub.status || '-')}</div></div>
        <div class="kpi-card"><div class="kpi-label">Stripe</div><div class="kpi-value" style="font-size:0.7rem">${sanitizeHTML(sub.stripe_subscription_id || '-')}</div></div>
        </div></div>`;
    }

    // Actions row
    h += `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" data-action="crm-show-discount" data-id="${escapeAttr(orgId)}">\uD83C\uDFF7\uFE0F ${lbl.crm_apply_discount}</button>
      <button class="btn btn-warning btn-sm" data-action="crm-show-refund" data-id="${escapeAttr(orgId)}">\uD83D\uDCB8 ${lbl.crm_issue_refund}</button>
      <button class="btn btn-info btn-sm" data-action="crm-show-credit" data-id="${escapeAttr(orgId)}">\uD83D\uDCDD ${lbl.crm_issue_credit}</button>
      <button class="btn btn-secondary btn-sm" data-action="crm-show-plan" data-id="${escapeAttr(orgId)}">\uD83D\uDD04 ${lbl.crm_change_plan}</button>
      <button class="btn btn-secondary btn-sm" data-action="crm-export" data-id="${escapeAttr(orgId)}" data-fmt="csv">\uD83D\uDCE5 CSV</button>
      <button class="btn btn-secondary btn-sm" data-action="crm-export" data-id="${escapeAttr(orgId)}" data-fmt="json">\uD83D\uDCE5 JSON</button>
    </div>`;

    // Notes section
    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCDD ${lbl.crm_notes}</h3>`;
    h += `<div style="display:flex;gap:8px;margin-bottom:12px">
      <input type="text" class="crm-note-input" placeholder="${lbl.crm_add_note}..." style="flex:1">
      <select class="crm-note-type"><option value="general">General</option><option value="billing">Billing</option><option value="support">Support</option><option value="retention">Retention</option></select>
      <button class="btn btn-primary btn-sm" data-action="crm-submit-note" data-id="${escapeAttr(orgId)}">${lbl.save}</button></div>`;
    const notes = data.notes || [];
    if (!notes.length) { h += `<p style="color:var(--text-light)">${lbl.crm_no_notes}</p>`; }
    else {
      notes.forEach(n => {
        h += `<div style="padding:10px;border-left:3px solid ${n.is_pinned ? 'var(--warning)' : 'var(--border)'};margin-bottom:8px;background:var(--bg-card,#fafafa);border-radius:0 6px 6px 0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:0.85rem">${sanitizeHTML(n.note_type || 'general')}${n.is_pinned ? ' \uD83D\uDCCC' : ''}</span>
            <div style="display:flex;gap:4px;align-items:center">
              <span style="font-size:0.7rem;color:var(--text-light)">${n.created_at ? n.created_at.substring(0, 10) : ''}</span>
              <button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:0.7rem" data-action="crm-toggle-pin" data-org-id="${escapeAttr(orgId)}" data-id="${escapeAttr(n.id)}" data-pin="${!n.is_pinned}">${n.is_pinned ? 'Unpin' : 'Pin'}</button>
              <button class="btn btn-danger btn-sm" style="padding:2px 6px;font-size:0.7rem" data-action="crm-delete-note" data-org-id="${escapeAttr(orgId)}" data-id="${escapeAttr(n.id)}">\u00D7</button>
            </div></div>
          <p style="margin:4px 0 0;font-size:0.9rem">${sanitizeHTML(n.content)}</p></div>`;
      });
    }
    h += '</div>';

    // Discounts
    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83C\uDFF7\uFE0F ${lbl.crm_discounts}</h3>`;
    const discounts = data.discounts || [];
    if (!discounts.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.crm_percent_off}</th><th>${lbl.crm_duration}</th><th>${lbl.crm_reason}</th><th>${lbl.crm_active}</th><th>${lbl.actions}</th></tr></thead><tbody>`;
      discounts.forEach(d => {
        h += `<tr><td style="font-weight:700">${d.percent_off}%</td><td>${d.duration_months} ${lbl.crm_month}</td><td>${sanitizeHTML(d.reason || '-')}</td>
          <td><span class="badge badge-${d.is_active ? 'success' : 'secondary'}">${d.is_active ? lbl.crm_active : 'Expired'}</span></td>
          <td>${d.is_active ? `<button class="btn btn-danger btn-sm" data-action="crm-revoke-discount" data-id="${escapeAttr(d.id)}">${lbl.crm_revoke}</button>` : '-'}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    // Credit Notes
    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCCB ${lbl.crm_credit_notes}</h3>`;
    const credits = data.credit_notes || [];
    if (!credits.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.crm_amount}</th><th>${lbl.crm_currency}</th><th>${lbl.crm_reason}</th><th>${lbl.status}</th><th>${lbl.created}</th></tr></thead><tbody>`;
      credits.forEach(c => {
        h += `<tr><td style="font-weight:700">$${(c.amount_cents / 100).toFixed(2)}</td><td>${sanitizeHTML(c.currency)}</td><td>${sanitizeHTML(c.reason || '-')}</td>
          <td><span class="badge badge-${c.status === 'issued' ? 'success' : 'secondary'}">${sanitizeHTML(c.status)}</span></td>
          <td>${c.created_at ? c.created_at.substring(0, 10) : '-'}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    // Users & Farms summary
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">';
    h += `<div class="card"><h3>\uD83D\uDC65 ${lbl.users} (${(data.users || []).length})</h3>`;
    (data.users || []).forEach(u => {
      h += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem"><strong>${sanitizeHTML(u.full_name || u.email)}</strong> · <span class="badge badge-secondary">${sanitizeHTML(u.role || '-')}</span></div>`;
    });
    h += '</div>';
    h += `<div class="card"><h3>\uD83C\uDFE0 ${lbl.farms} (${(data.farms || []).length})</h3>`;
    (data.farms || []).forEach(f => {
      h += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem"><strong>${sanitizeHTML(f.name || '-')}</strong> · ${sanitizeHTML(f.location || '')}</div>`;
    });
    h += '</div></div>';

    // Stats
    h += `<div class="card" style="margin-bottom:14px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      <div class="kpi-card"><div class="kpi-label">${lbl.open_tickets}</div><div class="kpi-value">${data.open_tickets || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">Flocks</div><div class="kpi-value">${data.total_flocks || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.total_eggs}</div><div class="kpi-value">${(data.total_eggs_in_stock || 0).toLocaleString()}</div></div>
    </div></div>`;

    return h;
  }

  async _crmRenderReport(lbl) {
    const data = await _saFetch('/crm/report');
    let h = `<div class="card"><h3>\uD83D\uDCCA ${lbl.crm_report}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px">
      <div class="kpi-card"><div class="kpi-label">${lbl.total_orgs}</div><div class="kpi-value">${data.total_orgs || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.active_users}</div><div class="kpi-value" style="color:var(--success)">${data.active_orgs || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_avg_health}</div><div class="kpi-value" style="color:${(data.avg_health_score || 0) >= 70 ? 'var(--success)' : 'var(--warning)'}">${(data.avg_health_score || 0).toFixed(1)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_total_ltv}</div><div class="kpi-value" style="color:var(--success)">$${(data.total_ltv || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_ltv} (${lbl.crm_avg_health})</div><div class="kpi-value">$${(data.avg_ltv || 0).toFixed(0)}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_active_discounts}</div><div class="kpi-value">${data.active_discounts || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_events_30d}</div><div class="kpi-value">${data.retention_events_30d || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.crm_credits_total}</div><div class="kpi-value">$${((data.credit_notes_total_cents || 0) / 100).toFixed(2)}</div></div>
      </div>`;

    // Risk distribution chart
    if (data.risk_distribution) {
      h += `<div style="margin-top:16px"><h4>${lbl.crm_risk} Distribution</h4>
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">`;
      const riskColors = { low: 'var(--success)', medium: 'var(--warning)', high: '#ff5722', critical: 'var(--danger)' };
      Object.entries(data.risk_distribution).forEach(([r, c]) => {
        const total = data.total_orgs || 1;
        const pct = ((c / total) * 100).toFixed(0);
        h += `<div style="flex:1;min-width:120px;text-align:center">
          <div style="background:var(--bg-card,#fafafa);border-radius:8px;padding:12px;border:2px solid ${riskColors[r] || 'var(--border)'}">
          <div style="font-size:1.5rem;font-weight:700;color:${riskColors[r] || 'var(--text)'}">${c}</div>
          <div style="font-size:0.75rem;color:var(--text-light)">${r.toUpperCase()} (${pct}%)</div>
          </div></div>`;
      });
      h += '</div></div>';
    }
    h += '</div>';
    return h;
  }

  async _crmRenderRetention(lbl) {
    let h = '';
    const rules = await apiService.request('GET', '/superadmin/retention-rules');
    const events = await apiService.request('GET', '/superadmin/retention-events?limit=20');

    h += `<div class="card" style="margin-bottom:14px"><h3>\uD83D\uDCCB ${lbl.crm_rules}</h3>
      <div style="margin-bottom:12px">
        <button class="btn btn-primary btn-sm" data-action="crm-show-rule">${lbl.crm_add_note} Rule</button>
        <button class="btn btn-warning btn-sm" data-action="crm-evaluate">${lbl.crm_evaluate}</button>
      </div>`;
    if (!rules || !rules.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>Name</th><th>${lbl.crm_trigger}</th><th>${lbl.crm_action}</th><th>% Off</th><th>${lbl.crm_active}</th><th>${lbl.actions}</th></tr></thead><tbody>`;
      rules.forEach(r => {
        h += `<tr><td><strong>${sanitizeHTML(r.name)}</strong></td><td>${sanitizeHTML(r.trigger_type)}</td><td>${sanitizeHTML(r.action_type)}</td><td>${r.discount_percent}%</td>
          <td><span class="badge badge-${r.is_active ? 'success' : 'secondary'}">${r.is_active ? 'ON' : 'OFF'}</span></td>
          <td><button class="btn btn-secondary btn-sm" data-action="crm-toggle-rule" data-id="${escapeAttr(r.id)}" data-active="${!r.is_active}">${r.is_active ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-danger btn-sm" data-action="crm-delete-rule" data-id="${escapeAttr(r.id)}">\u00D7</button></td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    // Events log
    h += `<div class="card"><h3>\uD83D\uDCDC ${lbl.crm_events}</h3>`;
    const evtList = events.items || events || [];
    if (!evtList.length) { h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`; }
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.org}</th><th>${lbl.crm_trigger}</th><th>${lbl.crm_action}</th><th>${lbl.crm_result}</th><th>${lbl.date}</th></tr></thead><tbody>`;
      evtList.forEach(ev => {
        h += `<tr><td>${ev.organization_id ? sanitizeHTML(ev.organization_id.substring(0, 8)) + '...' : '-'}</td><td>${sanitizeHTML(ev.trigger_type)}</td><td>${sanitizeHTML(ev.action_taken)}</td><td>${sanitizeHTML(ev.result || '-')}</td><td>${ev.created_at ? ev.created_at.substring(0, 10) : '-'}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  }

  // ── CRM Action Methods ────────────────────────────────────

  _crmShowDiscountModal(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83C\uDFF7\uFE0F ${lbl.apply_discount}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.pct_off}</label><input type="number" class="crm-d-pct" min="1" max="100"></div>
        <div><label>${lbl.dur_months}</label><input type="number" class="crm-d-dur" min="1" max="36" value="1"></div>
        <div><label>${lbl.reason}</label><input type="text" class="crm-d-reason"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-action="crm-submit-discount" data-id="${escapeAttr(orgId)}">${lbl.apply_discount}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  }

  async _crmApplyDiscount(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    const body = {
      percent_off: parseInt(root.querySelector('.crm-d-pct')?.value) || 0,
      duration_months: parseInt(root.querySelector('.crm-d-dur')?.value) || 1,
      reason: root.querySelector('.crm-d-reason')?.value || ''
    };
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/discounts', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.discount_applied });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  _crmShowRefundModal(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDCB8 ${lbl.issue_refund}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.pid}</label><input type="text" class="crm-r-pid" placeholder="pi_..."></div>
        <div><label>${lbl.amt_cents}</label><input type="number" class="crm-r-amt" min="1" placeholder="Leave empty for full refund"></div>
        <div><label>${lbl.reason}</label><input type="text" class="crm-r-reason" value="requested_by_customer"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-warning" data-action="crm-submit-refund" data-id="${escapeAttr(orgId)}">${lbl.issue_refund}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  }

  async _crmIssueRefund(orgId) {
    const lbl = _lbl();
    if (!confirm(lbl.crm_confirm_refund)) return;
    const root = this.shadowRoot;
    const body = {
      payment_intent_id: root.querySelector('.crm-r-pid')?.value || '',
      reason: root.querySelector('.crm-r-reason')?.value || ''
    };
    const amt = root.querySelector('.crm-r-amt')?.value;
    if (amt) body.amount_cents = parseInt(amt);
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/refund', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.refund_issued });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  _crmShowCreditModal(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDCDD ${lbl.issue_credit}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.amt_cents_req}</label><input type="number" class="crm-c-amt" min="1"></div>
        <div><label>${lbl.currency}</label><input type="text" class="crm-c-cur" value="usd" maxlength="3"></div>
        <div><label>${lbl.reason}</label><input type="text" class="crm-c-reason"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-info" data-action="crm-submit-credit" data-id="${escapeAttr(orgId)}">${lbl.issue_credit}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  }

  async _crmIssueCreditNote(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    const body = {
      amount_cents: parseInt(root.querySelector('.crm-c-amt')?.value) || 0,
      currency: root.querySelector('.crm-c-cur')?.value || 'usd',
      reason: root.querySelector('.crm-c-reason')?.value || ''
    };
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/credit-notes', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.credit_issued });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  _crmShowPlanModal(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDD04 ${lbl.change_plan}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.new_plan}</label><select class="crm-p-plan"><option value="hobby">Hobby ($9)</option><option value="starter">Starter ($19)</option><option value="pro">Pro ($49)</option><option value="enterprise">Enterprise ($99)</option></select></div>
        <div><label>${lbl.interval}</label><select class="crm-p-int"><option value="month">${lbl.month}</option><option value="year">${lbl.year}</option></select></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-action="crm-submit-plan" data-id="${escapeAttr(orgId)}">${lbl.change_plan}</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  }

  async _crmChangePlan(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    const body = {
      new_plan: root.querySelector('.crm-p-plan')?.value || 'pro',
      interval: root.querySelector('.crm-p-int')?.value || 'month'
    };
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/change-plan', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.plan_changed });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmAddNote(orgId) {
    const lbl = _lbl();
    const root = this.shadowRoot;
    const content = root.querySelector('.crm-note-input')?.value || '';
    const note_type = root.querySelector('.crm-note-type')?.value || 'general';
    if (!content.trim()) return;
    try {
      await apiService.request('POST', '/superadmin/organizations/' + orgId + '/notes', { content, note_type, is_pinned: false });
      Bus.emit('toast', { msg: lbl.note_added });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmTogglePin(orgId, noteId, pin) {
    try {
      await apiService.request('PATCH', '/superadmin/organizations/' + orgId + '/notes/' + noteId, { is_pinned: pin });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmDeleteNote(orgId, noteId) {
    const lbl = _lbl();
    if (!confirm('Delete note?')) return;
    try {
      await apiService.request('DELETE', '/superadmin/organizations/' + orgId + '/notes/' + noteId);
      Bus.emit('toast', { msg: lbl.note_deleted });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmRevokeDiscount(discountId) {
    const lbl = _lbl();
    if (!confirm('Revoke discount?')) return;
    try {
      await apiService.request('DELETE', '/superadmin/discounts/' + discountId);
      Bus.emit('toast', { msg: lbl.discount_revoked });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmExport(orgId, fmt) {
    const lbl = _lbl();
    try {
      const data = await apiService.request('GET', '/superadmin/organizations/' + orgId + '/export?format=' + fmt);
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: fmt === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm_${orgId.substring(0, 8)}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      Bus.emit('toast', { msg: lbl.exported });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  _crmShowRuleModal() {
    const lbl = _lbl();
    const root = this.shadowRoot;
    root.querySelector('.sa-modal-overlay')?.remove();
    const modal = document.createElement('div');
    modal.className = 'sa-modal-overlay';
    modal.innerHTML = `<div class="sa-modal-content">
      <h3>\uD83D\uDCCB New Retention Rule</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label>Name</label><input type="text" class="crm-rule-name"></div>
        <div><label>Trigger</label><select class="crm-rule-trigger"><option value="churn_risk">Churn Risk</option><option value="payment_failed">Payment Failed</option><option value="low_usage">Low Usage</option><option value="downgrade_request">Downgrade Request</option><option value="trial_expiring">Trial Expiring</option></select></div>
        <div><label>Action</label><select class="crm-rule-action"><option value="flag_for_review">Flag for Review</option><option value="auto_discount">Auto Discount</option><option value="send_email">Send Email</option><option value="extend_trial">Extend Trial</option></select></div>
        <div><label>Discount %</label><input type="number" class="crm-rule-disc" min="0" max="100" value="0"></div>
        <div><label>Email Template Key</label><input type="text" class="crm-rule-tpl" placeholder="optional"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-action="crm-submit-rule">Create</button>
          <button class="btn btn-secondary" data-action="crm-modal-close">${lbl.cancel}</button>
        </div>
      </div></div>`;
    root.appendChild(modal);
  }

  async _crmCreateRule() {
    const lbl = _lbl();
    const root = this.shadowRoot;
    const body = {
      name: root.querySelector('.crm-rule-name')?.value || '',
      trigger_type: root.querySelector('.crm-rule-trigger')?.value || 'churn_risk',
      action_type: root.querySelector('.crm-rule-action')?.value || 'flag_for_review',
      discount_percent: parseInt(root.querySelector('.crm-rule-disc')?.value) || 0,
      email_template_key: root.querySelector('.crm-rule-tpl')?.value || null,
      conditions: {}
    };
    try {
      await apiService.request('POST', '/superadmin/retention-rules', body);
      root.querySelector('.sa-modal-overlay')?.remove();
      Bus.emit('toast', { msg: lbl.rule_created });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmToggleRule(ruleId, active) {
    try {
      await apiService.request('PATCH', '/superadmin/retention-rules/' + ruleId, { is_active: active });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmDeleteRule(ruleId) {
    const lbl = _lbl();
    if (!confirm('Delete rule?')) return;
    try {
      await apiService.request('DELETE', '/superadmin/retention-rules/' + ruleId);
      Bus.emit('toast', { msg: lbl.rule_deleted });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _crmEvaluateRetention() {
    const lbl = _lbl();
    try {
      const res = await apiService.request('POST', '/superadmin/retention/evaluate');
      Bus.emit('toast', { msg: `${lbl.eval_complete}: ${res.events_created || 0} eventos` });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Settings ───────────────────────────────────────────────

  _renderSettings(lbl) {
    const u = getCurrentUser() || {};
    let h = `<div class="card" style="margin-bottom:16px"><h3>\uD83D\uDC64 ${lbl.account_info}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px">
      <div class="kpi-card"><div class="kpi-label">Email</div><div class="kpi-value" style="font-size:0.95rem">${sanitizeHTML(u.email || '-')}</div></div>
      <div class="kpi-card"><div class="kpi-label">Nombre</div><div class="kpi-value" style="font-size:0.95rem">${sanitizeHTML(u.full_name || '-')}</div></div>
      <div class="kpi-card"><div class="kpi-label">Rol</div><div class="kpi-value" style="font-size:0.95rem;color:var(--primary)">SUPERADMIN</div></div>
      </div></div>`;

    h += `<div class="card"><h3>\uD83D\uDD12 ${lbl.change_pw}</h3>
      <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px">${lbl.pw_rules}</p>
      <div class="sa-pw-form" style="max-width:400px;display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.current_pw}</label><input type="password" class="sa-pw-current" autocomplete="current-password"></div>
        <div><label>${lbl.new_pw}</label><input type="password" class="sa-pw-new" minlength="8" maxlength="128" autocomplete="new-password"></div>
        <div><label>${lbl.confirm_pw}</label><input type="password" class="sa-pw-confirm" minlength="8" maxlength="128" autocomplete="new-password"></div>
        <button class="btn btn-primary" style="align-self:flex-start" data-action="change-pw">${lbl.change_pw}</button>
      </div></div>`;

    return h;
  }

  async _changePassword() {
    const lbl = _lbl();
    const root = this.shadowRoot;
    const cur = root.querySelector('.sa-pw-current')?.value || '';
    const nw = root.querySelector('.sa-pw-new')?.value || '';
    const cf = root.querySelector('.sa-pw-confirm')?.value || '';
    if (nw !== cf) { Bus.emit('toast', { msg: lbl.pw_mismatch, type: 'error' }); return; }
    try {
      await apiService.request('POST', '/auth/change-password', { current_password: cur, new_password: nw });
      Bus.emit('toast', { msg: lbl.pw_changed });
      const form = root.querySelector('.sa-pw-form');
      if (form) form.querySelectorAll('input').forEach(i => { i.value = ''; });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }
}

customElements.define('egg-superadmin', EggSuperadmin);
export { EggSuperadmin };
export default EggSuperadmin;
