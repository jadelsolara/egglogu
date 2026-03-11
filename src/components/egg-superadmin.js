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
import { mixCRM } from './egg-superadmin-crm.js';
import { mixIntelligence } from './egg-superadmin-intel.js';
import { mixOutbreaks } from './egg-superadmin-outbreaks.js';

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
    interval: 'Intervalo', month: 'Mes', year: 'Ano', change_plan: 'Cambiar Plan',
    tab_intel: 'Inteligencia', intel_privacy: 'Privacidad', intel_funnel: 'Funnel Conversion',
    intel_revenue: 'Revenue', intel_geo: 'Distribucion Geografica', intel_benchmarks: 'Benchmarks',
    intel_seasonal: 'Tendencias Estacionales', intel_channels: 'Canales de Mercado',
    intel_egg_types: 'Tipos de Huevo', intel_diseases: 'Prevalencia Enfermedades',
    intel_modules: 'Adopcion Modulos', intel_utm: 'Atribucion UTM',
    intel_engagement: 'Engagement', intel_k_anon: 'k-Anonimato',
    intel_compliance: 'Cumplimiento Legal', intel_no_pii: 'Sin datos personales',
    intel_aggregated: 'Datos agregados', intel_breed: 'Raza', intel_housing: 'Tipo Alojamiento',
    intel_signups: 'Registros', intel_verified: 'Verificados', intel_with_farm: 'Con Granja',
    intel_with_data: 'Con Datos', intel_paying: 'Pagando', intel_conv_rate: 'Tasa Conversion',
    intel_mrr: 'MRR', intel_arr: 'ARR', intel_arpu: 'ARPU', intel_ltv: 'LTV Promedio',
    intel_trials: 'En Trial', intel_free: 'Gratis', intel_power: 'Power Users',
    intel_active: 'Activos', intel_occasional: 'Ocasionales', intel_dormant: 'Dormidos',
    intel_source: 'Fuente', intel_converted: 'Convertidos', intel_avg_hen_day: '% Postura',
    intel_avg_mortality: '% Mortalidad', intel_farms: 'Granjas', intel_month: 'Mes',
    intel_avg_eggs: 'Huevos Prom', intel_data_points: 'Data Points',
    tab_outbreaks: 'Alertas Brotes', ob_title: 'Titulo', ob_disease: 'Enfermedad',
    ob_severity: 'Severidad', ob_transmission: 'Transmision', ob_species: 'Especies Afectadas',
    ob_lat: 'Latitud Epicentro', ob_lng: 'Longitud Epicentro', ob_radius: 'Radio (km)',
    ob_region: 'Region', ob_detected: 'Fecha Deteccion', ob_expires: 'Expira',
    ob_description: 'Descripcion', ob_contingency: 'Protocolo Contingencia',
    ob_source_url: 'URL Fuente', ob_cases: 'Casos Confirmados', ob_deaths: 'Muertes',
    ob_speed: 'Velocidad Propagacion (km/dia)', ob_direction: 'Direccion Propagacion',
    ob_active: 'Activa', ob_resolved: 'Resuelta', ob_create: 'Crear Alerta',
    ob_update: 'Actualizar', ob_resolve: 'Resolver', ob_reactivate: 'Reactivar',
    ob_delete: 'Eliminar', ob_no_alerts: 'No hay alertas de brotes',
    ob_confirm_delete: 'Eliminar alerta permanentemente?',
    ob_created: 'Alerta creada', ob_updated: 'Alerta actualizada', ob_deleted: 'Alerta eliminada',
    // ── New module labels ──
    tab_audit: 'Audit Log', tab_flags: 'Feature Flags', tab_health: 'Sistema', tab_emails: 'Email Center',
    tab_billing: 'Billing', tab_onboarding: 'Onboarding', tab_announce: 'Anuncios', tab_export: 'Exportar',
    tab_ratelimit: 'Rate Limits', tab_impersonate: 'Impersonar', tab_nps: 'NPS / Feedback',
    tab_verticals: 'Verticales', tab_partners: 'Partners', tab_compliance: 'Compliance',
    // Audit
    audit_action: 'Accion', audit_user: 'Usuario', audit_ip: 'IP', audit_target: 'Recurso',
    audit_details: 'Detalles', audit_timestamp: 'Fecha/Hora', audit_filter: 'Filtrar',
    audit_no_logs: 'Sin registros de auditoria', audit_export: 'Exportar Log',
    // Feature Flags
    flags_name: 'Flag', flags_enabled: 'Activo', flags_orgs: 'Organizaciones', flags_global: 'Global',
    flags_create: 'Crear Flag', flags_toggle: 'Alternar', flags_no_flags: 'Sin feature flags',
    flags_description: 'Descripcion', flags_assign: 'Asignar a Org',
    // System Health
    health_api: 'API Status', health_db: 'PostgreSQL', health_redis: 'Redis', health_latency: 'Latencia',
    health_uptime: 'Uptime', health_error_rate: 'Error Rate', health_memory: 'Memoria',
    health_cpu: 'CPU', health_disk: 'Disco', health_connections: 'Conexiones DB',
    health_queue: 'Cola Workers', health_last_check: 'Ultimo Check', health_refresh: 'Refrescar',
    // Email Center
    email_sent: 'Enviados', email_delivered: 'Entregados', email_bounced: 'Rebotados',
    email_opened: 'Abiertos', email_template: 'Plantilla', email_recipient: 'Destinatario',
    email_subject: 'Asunto', email_status: 'Estado', email_resend: 'Reenviar',
    email_no_emails: 'Sin emails recientes',
    // Billing Dashboard
    bill_mrr: 'MRR', bill_arr: 'ARR', bill_arpu: 'ARPU', bill_ltv: 'LTV Avg',
    bill_trials: 'En Trial', bill_converting: 'Trial→Paid', bill_failed: 'Pagos Fallidos',
    bill_upcoming: 'Proximas Renovaciones', bill_revenue_by_plan: 'Revenue por Plan',
    bill_monthly_growth: 'Crecimiento Mensual',
    // Onboarding
    onb_step: 'Paso', onb_users: 'Usuarios', onb_pct: '%', onb_dropoff: 'Abandono',
    onb_avg_time: 'Tiempo Promedio', onb_bottleneck: 'Cuello de Botella',
    // Announcements
    ann_title: 'Titulo', ann_message: 'Mensaje', ann_type: 'Tipo', ann_target: 'Destino',
    ann_active: 'Activo', ann_create: 'Crear Anuncio', ann_dismiss: 'Desactivar',
    ann_banner: 'Banner', ann_modal: 'Modal', ann_toast: 'Notificacion',
    ann_all: 'Todos', ann_plan: 'Por Plan', ann_org: 'Por Org',
    ann_no_announcements: 'Sin anuncios activos', ann_starts: 'Desde', ann_ends: 'Hasta',
    // Data Export
    exp_type: 'Tipo', exp_format: 'Formato', exp_download: 'Descargar',
    exp_platform: 'Plataforma Completa', exp_orgs: 'Organizaciones', exp_users: 'Usuarios',
    exp_production: 'Produccion', exp_financial: 'Financiero', exp_support: 'Soporte',
    // Rate Limit
    rl_org: 'Organizacion', rl_endpoint: 'Endpoint', rl_requests: 'Requests/min',
    rl_limit: 'Limite', rl_usage: 'Uso %', rl_blocked: 'Bloqueados',
    rl_override: 'Override Limite', rl_no_data: 'Sin datos de rate limit',
    // Impersonation
    imp_select: 'Seleccionar Organizacion', imp_start: 'Iniciar Sesion Como',
    imp_warning: 'ATENCION: Veras la app exactamente como la ve esta organizacion. Todas las acciones quedan en el audit log.',
    imp_active: 'Impersonando', imp_stop: 'Dejar de Impersonar',
    // NPS
    nps_score: 'NPS Score', nps_promoters: 'Promotores', nps_passives: 'Pasivos',
    nps_detractors: 'Detractores', nps_responses: 'Respuestas', nps_avg: 'Promedio',
    nps_trend: 'Tendencia NPS', nps_comments: 'Comentarios Recientes',
    nps_send_survey: 'Enviar Encuesta', nps_no_data: 'Sin datos NPS',
    // Verticals
    vert_name: 'Vertical', vert_status: 'Estado', vert_orgs: 'Orgs Asignadas',
    vert_modules: 'Modulos', vert_launch: 'Lanzamiento', vert_crosssell: 'Cross-Sell',
    vert_enable: 'Activar', vert_disable: 'Desactivar',
    // Partners
    part_name: 'Partner', part_type: 'Tipo', part_referrals: 'Referidos',
    part_commission: 'Comision', part_revenue: 'Revenue Generado', part_status: 'Estado',
    part_create: 'Crear Partner', part_no_partners: 'Sin partners registrados',
    part_code: 'Codigo Referido', part_payout: 'Pago Pendiente',
    // Compliance
    comp_framework: 'Framework', comp_status: 'Estado', comp_last_audit: 'Ultima Auditoria',
    comp_next_audit: 'Proxima Auditoria', comp_items: 'Items', comp_passed: 'Aprobados',
    comp_failed: 'Fallidos', comp_data_residency: 'Residencia Datos',
    comp_consent: 'Consentimientos', comp_dsar: 'Solicitudes DSAR', comp_export_data: 'Exportar Datos Usuario'
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
    interval: 'Interval', month: 'Month', year: 'Year', change_plan: 'Change Plan',
    tab_intel: 'Intelligence', intel_privacy: 'Privacy', intel_funnel: 'Conversion Funnel',
    intel_revenue: 'Revenue', intel_geo: 'Geographic Distribution', intel_benchmarks: 'Benchmarks',
    intel_seasonal: 'Seasonal Trends', intel_channels: 'Market Channels',
    intel_egg_types: 'Egg Types', intel_diseases: 'Disease Prevalence',
    intel_modules: 'Module Adoption', intel_utm: 'UTM Attribution',
    intel_engagement: 'Engagement', intel_k_anon: 'k-Anonymity',
    intel_compliance: 'Legal Compliance', intel_no_pii: 'No personal data',
    intel_aggregated: 'Aggregated data', intel_breed: 'Breed', intel_housing: 'Housing Type',
    intel_signups: 'Signups', intel_verified: 'Verified', intel_with_farm: 'With Farm',
    intel_with_data: 'With Data', intel_paying: 'Paying', intel_conv_rate: 'Conversion Rate',
    intel_mrr: 'MRR', intel_arr: 'ARR', intel_arpu: 'ARPU', intel_ltv: 'Avg LTV',
    intel_trials: 'On Trial', intel_free: 'Free', intel_power: 'Power Users',
    intel_active: 'Active', intel_occasional: 'Occasional', intel_dormant: 'Dormant',
    intel_source: 'Source', intel_converted: 'Converted', intel_avg_hen_day: 'Hen-Day %',
    intel_avg_mortality: 'Mortality %', intel_farms: 'Farms', intel_month: 'Month',
    intel_avg_eggs: 'Avg Eggs', intel_data_points: 'Data Points',
    tab_outbreaks: 'Outbreak Alerts', ob_title: 'Title', ob_disease: 'Disease',
    ob_severity: 'Severity', ob_transmission: 'Transmission', ob_species: 'Species Affected',
    ob_lat: 'Epicenter Latitude', ob_lng: 'Epicenter Longitude', ob_radius: 'Radius (km)',
    ob_region: 'Region', ob_detected: 'Detected Date', ob_expires: 'Expires',
    ob_description: 'Description', ob_contingency: 'Contingency Protocol',
    ob_source_url: 'Source URL', ob_cases: 'Confirmed Cases', ob_deaths: 'Deaths',
    ob_speed: 'Spread Speed (km/day)', ob_direction: 'Spread Direction',
    ob_active: 'Active', ob_resolved: 'Resolved', ob_create: 'Create Alert',
    ob_update: 'Update', ob_resolve: 'Resolve', ob_reactivate: 'Reactivate',
    ob_delete: 'Delete', ob_no_alerts: 'No outbreak alerts',
    ob_confirm_delete: 'Permanently delete alert?',
    ob_created: 'Alert created', ob_updated: 'Alert updated', ob_deleted: 'Alert deleted',
    // ── New module labels ──
    tab_audit: 'Audit Log', tab_flags: 'Feature Flags', tab_health: 'System', tab_emails: 'Email Center',
    tab_billing: 'Billing', tab_onboarding: 'Onboarding', tab_announce: 'Announcements', tab_export: 'Export',
    tab_ratelimit: 'Rate Limits', tab_impersonate: 'Impersonate', tab_nps: 'NPS / Feedback',
    tab_verticals: 'Verticals', tab_partners: 'Partners', tab_compliance: 'Compliance',
    audit_action: 'Action', audit_user: 'User', audit_ip: 'IP', audit_target: 'Resource',
    audit_details: 'Details', audit_timestamp: 'Timestamp', audit_filter: 'Filter',
    audit_no_logs: 'No audit logs', audit_export: 'Export Log',
    flags_name: 'Flag', flags_enabled: 'Enabled', flags_orgs: 'Organizations', flags_global: 'Global',
    flags_create: 'Create Flag', flags_toggle: 'Toggle', flags_no_flags: 'No feature flags',
    flags_description: 'Description', flags_assign: 'Assign to Org',
    health_api: 'API Status', health_db: 'PostgreSQL', health_redis: 'Redis', health_latency: 'Latency',
    health_uptime: 'Uptime', health_error_rate: 'Error Rate', health_memory: 'Memory',
    health_cpu: 'CPU', health_disk: 'Disk', health_connections: 'DB Connections',
    health_queue: 'Worker Queue', health_last_check: 'Last Check', health_refresh: 'Refresh',
    email_sent: 'Sent', email_delivered: 'Delivered', email_bounced: 'Bounced',
    email_opened: 'Opened', email_template: 'Template', email_recipient: 'Recipient',
    email_subject: 'Subject', email_status: 'Status', email_resend: 'Resend',
    email_no_emails: 'No recent emails',
    bill_mrr: 'MRR', bill_arr: 'ARR', bill_arpu: 'ARPU', bill_ltv: 'Avg LTV',
    bill_trials: 'On Trial', bill_converting: 'Trial→Paid', bill_failed: 'Failed Payments',
    bill_upcoming: 'Upcoming Renewals', bill_revenue_by_plan: 'Revenue by Plan',
    bill_monthly_growth: 'Monthly Growth',
    onb_step: 'Step', onb_users: 'Users', onb_pct: '%', onb_dropoff: 'Drop-off',
    onb_avg_time: 'Avg Time', onb_bottleneck: 'Bottleneck',
    ann_title: 'Title', ann_message: 'Message', ann_type: 'Type', ann_target: 'Target',
    ann_active: 'Active', ann_create: 'Create Announcement', ann_dismiss: 'Dismiss',
    ann_banner: 'Banner', ann_modal: 'Modal', ann_toast: 'Notification',
    ann_all: 'All Users', ann_plan: 'By Plan', ann_org: 'By Org',
    ann_no_announcements: 'No active announcements', ann_starts: 'Starts', ann_ends: 'Ends',
    exp_type: 'Type', exp_format: 'Format', exp_download: 'Download',
    exp_platform: 'Full Platform', exp_orgs: 'Organizations', exp_users: 'Users',
    exp_production: 'Production', exp_financial: 'Financial', exp_support: 'Support',
    rl_org: 'Organization', rl_endpoint: 'Endpoint', rl_requests: 'Requests/min',
    rl_limit: 'Limit', rl_usage: 'Usage %', rl_blocked: 'Blocked',
    rl_override: 'Override Limit', rl_no_data: 'No rate limit data',
    imp_select: 'Select Organization', imp_start: 'Log In As',
    imp_warning: 'WARNING: You will see the app exactly as this organization sees it. All actions are logged.',
    imp_active: 'Impersonating', imp_stop: 'Stop Impersonating',
    nps_score: 'NPS Score', nps_promoters: 'Promoters', nps_passives: 'Passives',
    nps_detractors: 'Detractors', nps_responses: 'Responses', nps_avg: 'Average',
    nps_trend: 'NPS Trend', nps_comments: 'Recent Comments',
    nps_send_survey: 'Send Survey', nps_no_data: 'No NPS data',
    vert_name: 'Vertical', vert_status: 'Status', vert_orgs: 'Assigned Orgs',
    vert_modules: 'Modules', vert_launch: 'Launch Date', vert_crosssell: 'Cross-Sell',
    vert_enable: 'Enable', vert_disable: 'Disable',
    part_name: 'Partner', part_type: 'Type', part_referrals: 'Referrals',
    part_commission: 'Commission', part_revenue: 'Revenue Generated', part_status: 'Status',
    part_create: 'Create Partner', part_no_partners: 'No partners registered',
    part_code: 'Referral Code', part_payout: 'Pending Payout',
    comp_framework: 'Framework', comp_status: 'Status', comp_last_audit: 'Last Audit',
    comp_next_audit: 'Next Audit', comp_items: 'Items', comp_passed: 'Passed',
    comp_failed: 'Failed', comp_data_residency: 'Data Residency',
    comp_consent: 'Consents', comp_dsar: 'DSAR Requests', comp_export_data: 'Export User Data'
  }
};

function _lbl() {
  const lang = document.documentElement.lang || 'es';
  return LABELS[lang] || LABELS[Object.keys(LABELS).find(k => lang.startsWith(k))] || LABELS.es;
}

const TABS = [
  { id: 'sa-dashboard', key: 'tab_dashboard'    },
  { id: 'sa-inventory', key: 'tab_inventory'    },
  { id: 'sa-accounts', key: 'tab_accounts'     },
  { id: 'sa-tickets', key: 'tab_tickets'      },
  { id: 'sa-market', key: 'tab_market'       },
  { id: 'sa-crm', key: 'tab_crm'          },
  { id: 'sa-intel', key: 'tab_intel'         },
  { id: 'sa-outbreaks', key: 'tab_outbreaks'    },
  { id: 'sa-audit', key: 'tab_audit'        },
  { id: 'sa-flags', key: 'tab_flags'        },
  { id: 'sa-health', key: 'tab_health'       },
  { id: 'sa-emails', key: 'tab_emails'       },
  { id: 'sa-billing', key: 'tab_billing'      },
  { id: 'sa-onboarding', key: 'tab_onboarding' },
  { id: 'sa-announce', key: 'tab_announce'     },
  { id: 'sa-export', key: 'tab_export'       },
  { id: 'sa-ratelimit', key: 'tab_ratelimit'    },
  { id: 'sa-impersonate', key: 'tab_impersonate' },
  { id: 'sa-nps',       key: 'tab_nps'          },
  { id: 'sa-verticals', key: 'tab_verticals'    },
  { id: 'sa-partners', key: 'tab_partners'     },
  { id: 'sa-compliance', key: 'tab_compliance' },
  { id: 'sa-settings', key: 'tab_settings'     }
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
    h += `<div class="page-header"><h2>${lbl.title}</h2></div>`;

    // Tab bar
    h += '<div class="tabs">';
    TABS.forEach(tb => {
      h += `<button class="btn ${this._currentTab === tb.id ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="tab" data-tab="${tb.id}">${lbl[tb.key]}</button>`;
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
      else if (this._currentTab === 'sa-intel')        ct.innerHTML = await this._renderIntelligence(lbl);
      else if (this._currentTab === 'sa-outbreaks')   ct.innerHTML = await this._renderOutbreaks(lbl);
      else if (this._currentTab === 'sa-audit')       ct.innerHTML = await this._renderAuditLog(lbl);
      else if (this._currentTab === 'sa-flags')       ct.innerHTML = await this._renderFeatureFlags(lbl);
      else if (this._currentTab === 'sa-health')      ct.innerHTML = await this._renderSystemHealth(lbl);
      else if (this._currentTab === 'sa-emails')      ct.innerHTML = await this._renderEmailCenter(lbl);
      else if (this._currentTab === 'sa-billing')     ct.innerHTML = await this._renderBillingDashboard(lbl);
      else if (this._currentTab === 'sa-onboarding')  ct.innerHTML = await this._renderOnboarding(lbl);
      else if (this._currentTab === 'sa-announce')    ct.innerHTML = await this._renderAnnouncements(lbl);
      else if (this._currentTab === 'sa-export')      ct.innerHTML = this._renderDataExport(lbl);
      else if (this._currentTab === 'sa-ratelimit')   ct.innerHTML = await this._renderRateLimit(lbl);
      else if (this._currentTab === 'sa-impersonate') ct.innerHTML = await this._renderImpersonate(lbl);
      else if (this._currentTab === 'sa-nps')         ct.innerHTML = await this._renderNPS(lbl);
      else if (this._currentTab === 'sa-verticals')   ct.innerHTML = this._renderVerticals(lbl);
      else if (this._currentTab === 'sa-partners')    ct.innerHTML = await this._renderPartners(lbl);
      else if (this._currentTab === 'sa-compliance')  ct.innerHTML = this._renderCompliance(lbl);
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
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
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
      .btn-group { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; white-space: nowrap; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .badge-success { background: #e8f5e9; color: #2e7d32; }
      .badge-warning { background: #fff8e1; color: #e65100; }
      .badge-danger { background: #ffebee; color: #c62828; }
      .badge-info { background: #e3f2fd; color: #1565c0; }
      .badge-secondary { background: #f5f5f5; color: #666; }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .table-wrap { overflow-x: auto; max-height: 320px; overflow-y: auto; }
      .intel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 900px) { .intel-grid { grid-template-columns: 1fr; } }
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
      @media (max-width: 900px) {
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

        // Outbreak Alerts
        case 'ob-create':
          this._obCreate();
          break;
        case 'ob-toggle':
          this._obToggle(id);
          break;
        case 'ob-delete':
          this._obDelete(id);
          break;
        case 'ob-edit':
          this._obShowEdit(id);
          break;
        case 'ob-save-edit':
          this._obSaveEdit(id);
          break;
        case 'ob-cancel-edit':
          this._obEditingId = null;
          this.render();
          break;

        // Audit Log
        case 'audit-filter':
          this._auditFilter();
          break;
        case 'audit-export':
          this._auditExport();
          break;

        // Feature Flags
        case 'flag-create':
          this._flagCreate();
          break;
        case 'flag-toggle':
          this._flagToggle(id);
          break;
        case 'flag-delete':
          this._flagDelete(id);
          break;
        case 'flag-assign':
          this._flagAssign(id);
          break;

        // System Health
        case 'health-refresh':
          this.render();
          break;

        // Email Center
        case 'email-resend':
          this._emailResend(id);
          break;

        // Announcements
        case 'ann-create':
          this._annCreate();
          break;
        case 'ann-dismiss':
          this._annDismiss(id);
          break;

        // Data Export
        case 'export-download':
          this._exportDownload(btn.dataset.type, btn.dataset.fmt);
          break;

        // Rate Limit
        case 'rl-override':
          this._rlOverride(id);
          break;

        // Impersonation
        case 'imp-start':
          this._impStart(id, name);
          break;
        case 'imp-stop':
          this._impStop();
          break;

        // NPS
        case 'nps-send-survey':
          this._npsSendSurvey();
          break;

        // Verticals
        case 'vert-toggle':
          this._vertToggle(id);
          break;

        // Partners
        case 'part-create':
          this._partCreate();
          break;
        case 'part-delete':
          this._partDelete(id);
          break;

        // Compliance
        case 'comp-dsar':
          this._compDSAR();
          break;
        case 'comp-export-user':
          this._compExportUser();
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
    h += `<div class="card"><h3>${lbl.tab_inventory}</h3>`;
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
    h += `<div class="card" style="margin-bottom:16px"><h3>${lbl.churn_title}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px">
      <div class="kpi-card"><div class="kpi-label">${lbl.monthly_churn}</div><div class="kpi-value" style="color:${churn.monthly_churn_rate > 5 ? 'var(--danger)' : 'var(--success)'}">${(churn.monthly_churn_rate || 0).toFixed(1)}%</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.retention}</div><div class="kpi-value" style="color:${churn.retention_rate >= 90 ? 'var(--success)' : 'var(--warning)'}">${(churn.retention_rate || 0).toFixed(1)}%</div></div>
      <div class="kpi-card"><div class="kpi-label">${lbl.churned_orgs}</div><div class="kpi-value" style="color:var(--danger)">${(churn.churned_orgs || []).length}</div></div>
      </div></div>`;

    // Orgs table
    h += `<div class="card"><h3>${lbl.tab_accounts}</h3>`;
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
    let h = `<div class="card"><h3>${lbl.tab_tickets}</h3>`;
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
        const trendIcon = { up: '\u2191', down: '\u2193', stable: '\u2192' };
        h += `<div class="kpi-card"><div class="kpi-label">${sanitizeHTML(s.region)}</div>
          <div class="kpi-value" style="font-size:1.1rem">${trendIcon[s.avg_trend] || '\u2192'} $${(s.avg_price || 0).toFixed(2)}</div>
          <div style="font-size:11px;color:var(--text-light)">${lbl.production}: ${(s.total_production || 0).toLocaleString()}</div></div>`;
      });
      h += '</div>';
    }

    // Add entry form
    const today = todayStr();
    h += `<div class="card" style="margin-bottom:16px"><h3>${lbl.add_entry}</h3>
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
    h += `<div class="card"><h3>${lbl.tab_market}</h3>`;
    if (!items.length) {
      h += `<p style="color:var(--text-light)">${lbl.no_data}</p>`;
    } else {
      h += `<div class="table-wrap"><table><thead><tr><th>${lbl.date}</th><th>${lbl.region}</th><th>${lbl.egg_type}</th><th>${lbl.price}</th><th>${lbl.production}</th><th>${lbl.demand}</th><th>${lbl.supply}</th><th>${lbl.trend}</th><th>${lbl.source}</th></tr></thead><tbody>`;
      items.forEach(mi => {
        const trendIcon = { up: '\u2191', down: '\u2193', stable: '\u2192' };
        h += `<tr><td>${sanitizeHTML(mi.report_date || '-')}</td><td>${sanitizeHTML(mi.region || '-')}</td><td>${sanitizeHTML(mi.egg_type || '-')}</td>
          <td>$${(mi.avg_price_per_unit || 0).toFixed(2)}</td><td>${(mi.total_production_units || 0).toLocaleString()}</td>
          <td>${mi.demand_index || 0}</td><td>${mi.supply_index || 0}</td>
          <td>${trendIcon[mi.price_trend] || '\u2192'} ${sanitizeHTML(mi.price_trend || '-')}</td><td>${sanitizeHTML(mi.source || '-')}</td></tr>`;
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

  // ── CRM — see egg-superadmin-crm.js (mixin)
  // ── CRM Action Methods — see egg-superadmin-crm.js (mixin)

  // ── Audit Log ────────────────────────────────────────────────

  _renderAuditLog(lbl) {
    return `<div class="sa-section">
      <h2>${lbl.audit_title}</h2>
      <div class="sa-toolbar" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <select data-ref="audit-actor" style="padding:6px;border-radius:6px;border:1px solid #ccc;">
          <option value="">${lbl.audit_all_actors}</option>
        </select>
        <select data-ref="audit-action" style="padding:6px;border-radius:6px;border:1px solid #ccc;">
          <option value="">${lbl.audit_all_actions}</option>
          <option value="create">Create</option><option value="update">Update</option>
          <option value="delete">Delete</option><option value="login">Login</option>
        </select>
        <input type="date" data-ref="audit-from" style="padding:6px;border-radius:6px;border:1px solid #ccc;">
        <input type="date" data-ref="audit-to" style="padding:6px;border-radius:6px;border:1px solid #ccc;">
        <button class="sa-btn" data-action="audit-filter">${lbl.audit_filter}</button>
        <button class="sa-btn sa-btn-outline" data-action="audit-export">${lbl.audit_export}</button>
      </div>
      <div data-ref="audit-table" style="color:#aaa;padding:24px;text-align:center;">${lbl.audit_empty}</div>
    </div>`;
  }

  async _auditFilter() {
    const lbl = this._lbl();
    const actor = this.shadowRoot.querySelector('[data-ref="audit-actor"]')?.value || '';
    const action = this.shadowRoot.querySelector('[data-ref="audit-action"]')?.value || '';
    const from = this.shadowRoot.querySelector('[data-ref="audit-from"]')?.value || '';
    const to = this.shadowRoot.querySelector('[data-ref="audit-to"]')?.value || '';
    try {
      const qs = new URLSearchParams();
      if (actor) qs.set('actor', actor);
      if (action) qs.set('action', action);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const data = await this._saFetch(`/audit?${qs}`);
      const entries = data.entries || [];
      const tbl = this.shadowRoot.querySelector('[data-ref="audit-table"]');
      if (!entries.length) { tbl.innerHTML = `<p>${lbl.audit_empty}</p>`; return; }
      tbl.innerHTML = `<table class="sa-table" style="width:100%"><thead><tr>
        <th>${lbl.audit_date}</th><th>${lbl.audit_actor_col}</th><th>${lbl.audit_action_col}</th><th>${lbl.audit_target}</th><th>${lbl.audit_detail}</th>
      </tr></thead><tbody>${entries.map(e => `<tr>
        <td>${new Date(e.ts).toLocaleString()}</td><td>${e.actor||'-'}</td><td>${e.action||'-'}</td><td>${e.target||'-'}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${e.detail||'-'}</td>
      </tr>`).join('')}</tbody></table>`;
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _auditExport() {
    try {
      const data = await this._saFetch('/audit/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `audit-log-${new Date().toISOString().slice(0,10)}.json`; a.click();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Feature Flags ───────────────────────────────────────────

  async _renderFeatureFlags(lbl) {
    try {
      const data = await this._saFetch('/flags');
      const flags = data.flags || [];
      const rows = flags.map(f => `<tr>
        <td><strong>${f.key}</strong></td>
        <td>${f.description || '-'}</td>
        <td><label class="sa-toggle"><input type="checkbox" ${f.enabled ? 'checked' : ''} data-action="flag-toggle" data-id="${f.id}"><span class="sa-slider"></span></label></td>
        <td>${f.scope || 'global'}</td>
        <td>
          <button class="sa-btn-sm" data-action="flag-assign" data-id="${f.id}">👥</button>
          <button class="sa-btn-sm sa-btn-danger" data-action="flag-delete" data-id="${f.id}">🗑️</button>
        </td>
      </tr>`).join('');
      return `<div class="sa-section">
        <h2>${lbl.flags_title}</h2>
        <button class="sa-btn" data-action="flag-create" style="margin-bottom:12px;">${lbl.flags_create}</button>
        <table class="sa-table" style="width:100%"><thead><tr>
          <th>${lbl.flags_key}</th><th>${lbl.flags_desc}</th><th>${lbl.flags_status}</th><th>${lbl.flags_scope}</th><th>${lbl.flags_actions}</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#aaa">${lbl.flags_empty}</td></tr>`}</tbody></table>
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.flags_title}</h2><p style="color:#aaa">${lbl.flags_empty}</p></div>`; }
  }

  async _flagCreate() {
    const key = prompt('Flag key (snake_case):');
    if (!key) return;
    const desc = prompt('Description:') || '';
    try {
      await apiService.request('POST', '/superadmin/flags', { key, description: desc, enabled: false });
      Bus.emit('toast', { msg: this._lbl().flags_created });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _flagToggle(e) {
    const id = e.target.dataset.id;
    const enabled = e.target.checked;
    try {
      await apiService.request('PATCH', `/superadmin/flags/${id}`, { enabled });
      Bus.emit('toast', { msg: enabled ? this._lbl().flags_enabled : this._lbl().flags_disabled });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); e.target.checked = !enabled; }
  }

  async _flagDelete(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm(this._lbl().flags_confirm_delete)) return;
    try {
      await apiService.request('DELETE', `/superadmin/flags/${id}`);
      Bus.emit('toast', { msg: this._lbl().flags_deleted });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _flagAssign(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    const orgs = prompt('Org IDs (comma-separated) or "all":');
    if (!orgs) return;
    try {
      await apiService.request('POST', `/superadmin/flags/${id}/assign`, { orgs: orgs === 'all' ? 'all' : orgs.split(',').map(s => s.trim()) });
      Bus.emit('toast', { msg: this._lbl().flags_assigned });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── System Health ───────────────────────────────────────────

  _renderSystemHealth(lbl) {
    return `<div class="sa-section">
      <h2>${lbl.health_title}</h2>
      <button class="sa-btn" data-action="health-refresh" style="margin-bottom:12px;">${lbl.health_refresh}</button>
      <div data-ref="health-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
        <div class="sa-card" style="text-align:center;padding:24px;color:#aaa;">${lbl.health_click_refresh}</div>
      </div>
    </div>`;
  }

  async _healthRefresh() {
    const lbl = this._lbl();
    const grid = this.shadowRoot.querySelector('[data-ref="health-grid"]');
    if (grid) grid.innerHTML = '<p style="color:#aaa;text-align:center;">Loading...</p>';
    try {
      const data = await this._saFetch('/health');
      const services = data.services || {};
      const cards = Object.entries(services).map(([name, info]) => {
        const ok = info.status === 'healthy' || info.status === 'ok';
        return `<div class="sa-card" style="border-left:4px solid ${ok ? '#4caf50' : '#f44336'};">
          <h4 style="margin:0 0 4px">${name}</h4>
          <span style="color:${ok ? '#4caf50' : '#f44336'};font-weight:600">${info.status}</span>
          ${info.latency ? `<br><small>Latency: ${info.latency}ms</small>` : ''}
          ${info.uptime ? `<br><small>Uptime: ${info.uptime}</small>` : ''}
          ${info.version ? `<br><small>v${info.version}</small>` : ''}
        </div>`;
      }).join('');
      if (grid) grid.innerHTML = cards || `<p style="color:#aaa">${lbl.health_all_ok}</p>`;
    } catch (err) {
      if (grid) grid.innerHTML = `<p style="color:#f44336">Error: ${err.message}</p>`;
    }
  }

  // ── Email Center ────────────────────────────────────────────

  async _renderEmailCenter(lbl) {
    try {
      const data = await this._saFetch('/emails/recent');
      const emails = data.emails || [];
      const rows = emails.map(e => `<tr>
        <td>${new Date(e.sent_at).toLocaleString()}</td>
        <td>${e.to}</td>
        <td>${e.subject}</td>
        <td><span style="color:${e.status === 'delivered' ? '#4caf50' : e.status === 'bounced' ? '#f44336' : '#ff9800'}">${e.status}</span></td>
        <td>${e.status === 'bounced' || e.status === 'failed' ? `<button class="sa-btn-sm" data-action="email-resend" data-id="${e.id}">🔁</button>` : '-'}</td>
      </tr>`).join('');
      return `<div class="sa-section">
        <h2>${lbl.emails_title}</h2>
        <div style="display:flex;gap:16px;margin-bottom:12px;">
          <div class="sa-stat-card"><strong>${data.total_sent || 0}</strong><br><small>${lbl.emails_sent}</small></div>
          <div class="sa-stat-card"><strong>${data.bounced || 0}</strong><br><small>${lbl.emails_bounced}</small></div>
          <div class="sa-stat-card"><strong>${data.queue || 0}</strong><br><small>${lbl.emails_queued}</small></div>
        </div>
        <table class="sa-table" style="width:100%"><thead><tr>
          <th>${lbl.emails_date}</th><th>${lbl.emails_to}</th><th>${lbl.emails_subject}</th><th>${lbl.emails_status}</th><th>${lbl.emails_actions}</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#aaa">${lbl.emails_empty}</td></tr>`}</tbody></table>
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.emails_title}</h2><p style="color:#aaa">${lbl.emails_empty}</p></div>`; }
  }

  async _emailResend(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      await apiService.request('POST', `/superadmin/emails/${id}/resend`);
      Bus.emit('toast', { msg: this._lbl().emails_resent });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Billing Dashboard ───────────────────────────────────────

  async _renderBillingDashboard(lbl) {
    try {
      const data = await this._saFetch('/billing/overview');
      const subs = data.subscriptions || [];
      const rows = subs.map(s => `<tr>
        <td>${s.org_name || s.org_id}</td>
        <td>${s.plan}</td>
        <td><span style="color:${s.status === 'active' ? '#4caf50' : '#f44336'}">${s.status}</span></td>
        <td>$${(s.mrr / 100).toFixed(2)}</td>
        <td>${s.trial_ends ? new Date(s.trial_ends).toLocaleDateString() : '-'}</td>
      </tr>`).join('');
      return `<div class="sa-section">
        <h2>${lbl.billing_title}</h2>
        <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
          <div class="sa-stat-card"><strong>$${((data.mrr || 0) / 100).toFixed(0)}</strong><br><small>${lbl.billing_mrr}</small></div>
          <div class="sa-stat-card"><strong>${data.active || 0}</strong><br><small>${lbl.billing_active}</small></div>
          <div class="sa-stat-card"><strong>${data.trials || 0}</strong><br><small>${lbl.billing_trials}</small></div>
          <div class="sa-stat-card"><strong>${data.churn_pct || 0}%</strong><br><small>${lbl.billing_churn}</small></div>
        </div>
        <table class="sa-table" style="width:100%"><thead><tr>
          <th>${lbl.billing_org}</th><th>${lbl.billing_plan}</th><th>${lbl.billing_status_col}</th><th>${lbl.billing_mrr}</th><th>${lbl.billing_trial_end}</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#aaa">No subscriptions</td></tr>`}</tbody></table>
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.billing_title}</h2><p style="color:#aaa">Error loading billing data</p></div>`; }
  }

  // ── Onboarding Funnel ───────────────────────────────────────

  async _renderOnboarding(lbl) {
    try {
      const data = await this._saFetch('/onboarding/funnel');
      const steps = data.steps || [];
      const funnel = steps.map(s => {
        const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <span style="width:160px;font-weight:500">${s.name}</span>
          <div style="flex:1;background:#e0e0e0;border-radius:8px;height:24px;overflow:hidden;">
            <div style="width:${pct}%;background:linear-gradient(90deg,#1565C0,#42a5f5);height:100%;border-radius:8px;transition:width .3s;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;">${pct}%</div>
          </div>
          <small style="width:80px;text-align:right">${s.completed}/${s.total}</small>
        </div>`;
      }).join('');
      return `<div class="sa-section">
        <h2>${lbl.onb_title}</h2>
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <div class="sa-stat-card"><strong>${data.signups_7d || 0}</strong><br><small>${lbl.onb_signups_7d}</small></div>
          <div class="sa-stat-card"><strong>${data.activated || 0}</strong><br><small>${lbl.onb_activated}</small></div>
          <div class="sa-stat-card"><strong>${data.dropoff_pct || 0}%</strong><br><small>${lbl.onb_dropoff}</small></div>
        </div>
        <h3 style="margin-top:16px">${lbl.onb_funnel}</h3>
        ${funnel || `<p style="color:#aaa">${lbl.onb_no_data}</p>`}
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.onb_title}</h2><p style="color:#aaa">${lbl.onb_no_data}</p></div>`; }
  }

  // ── Announcements ──────────────────────────────────────────

  async _renderAnnouncements(lbl) {
    try {
      const data = await this._saFetch('/announcements');
      const anns = data.announcements || [];
      const rows = anns.map(a => `<tr>
        <td>${a.title}</td>
        <td><span style="color:${a.active ? '#4caf50' : '#999'}">${a.active ? lbl.ann_active : lbl.ann_dismissed}</span></td>
        <td>${a.target || 'all'}</td>
        <td>${new Date(a.created_at).toLocaleDateString()}</td>
        <td>${a.active ? `<button class="sa-btn-sm sa-btn-danger" data-action="ann-dismiss" data-id="${a.id}">✖</button>` : '-'}</td>
      </tr>`).join('');
      return `<div class="sa-section">
        <h2>${lbl.ann_title}</h2>
        <button class="sa-btn" data-action="ann-create" style="margin-bottom:12px;">${lbl.ann_create}</button>
        <table class="sa-table" style="width:100%"><thead><tr>
          <th>${lbl.ann_title_col}</th><th>${lbl.ann_status}</th><th>${lbl.ann_target}</th><th>${lbl.ann_date}</th><th>${lbl.ann_actions}</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#aaa">${lbl.ann_empty}</td></tr>`}</tbody></table>
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.ann_title}</h2><p style="color:#aaa">${lbl.ann_empty}</p></div>`; }
  }

  async _annCreate() {
    const title = prompt('Announcement title:');
    if (!title) return;
    const body = prompt('Message body:') || '';
    const target = prompt('Target (all / plan:starter / org:ID):') || 'all';
    try {
      await apiService.request('POST', '/superadmin/announcements', { title, body, target, active: true });
      Bus.emit('toast', { msg: this._lbl().ann_created });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _annDismiss(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      await apiService.request('PATCH', `/superadmin/announcements/${id}`, { active: false });
      Bus.emit('toast', { msg: this._lbl().ann_dismissed_ok });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Data Export ─────────────────────────────────────────────

  _renderDataExport(lbl) {
    return `<div class="sa-section">
      <h2>${lbl.export_title}</h2>
      <p style="color:#aaa;margin-bottom:16px;">${lbl.export_desc}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
        ${['users','organizations','subscriptions','production','health_records','financial'].map(t => `
          <div class="sa-card" style="text-align:center;padding:16px;">
            <strong>${t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</strong><br>
            <select data-ref="fmt-${t}" style="margin:8px 0;padding:4px;border-radius:4px;border:1px solid #ccc;">
              <option value="csv">CSV</option><option value="json">JSON</option><option value="xlsx">XLSX</option>
            </select><br>
            <button class="sa-btn-sm" data-action="export-download" data-table="${t}">${lbl.export_download}</button>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  async _exportDownload(e) {
    const table = e.target.closest('[data-table]').dataset.table;
    const fmt = this.shadowRoot.querySelector(`[data-ref="fmt-${table}"]`)?.value || 'csv';
    try {
      const data = await this._saFetch(`/export/${table}?format=${fmt}`);
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: fmt === 'json' ? 'application/json' : 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${table}-export-${new Date().toISOString().slice(0,10)}.${fmt}`; a.click();
      Bus.emit('toast', { msg: this._lbl().export_success });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── API Rate Limit Monitor ─────────────────────────────────

  async _renderRateLimit(lbl) {
    try {
      const data = await this._saFetch('/ratelimit');
      const limits = data.endpoints || [];
      const rows = limits.map(r => `<tr>
        <td>${r.endpoint}</td>
        <td>${r.limit}/${r.window}</td>
        <td>${r.current_usage || 0}</td>
        <td><span style="color:${r.blocked ? '#f44336' : '#4caf50'}">${r.blocked ? 'BLOCKED' : 'OK'}</span></td>
        <td><button class="sa-btn-sm" data-action="rl-override" data-endpoint="${r.endpoint}">⚙️</button></td>
      </tr>`).join('');
      return `<div class="sa-section">
        <h2>${lbl.rl_title}</h2>
        <div style="display:flex;gap:16px;margin-bottom:12px;">
          <div class="sa-stat-card"><strong>${data.total_requests_1h || 0}</strong><br><small>${lbl.rl_requests_1h}</small></div>
          <div class="sa-stat-card"><strong>${data.blocked_ips || 0}</strong><br><small>${lbl.rl_blocked}</small></div>
        </div>
        <table class="sa-table" style="width:100%"><thead><tr>
          <th>${lbl.rl_endpoint}</th><th>${lbl.rl_limit}</th><th>${lbl.rl_usage}</th><th>${lbl.rl_status}</th><th>${lbl.rl_actions}</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#aaa">No rate limit data</td></tr>`}</tbody></table>
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.rl_title}</h2><p style="color:#aaa">Error loading rate limit data</p></div>`; }
  }

  async _rlOverride(e) {
    const endpoint = e.target.closest('[data-endpoint]').dataset.endpoint;
    const newLimit = prompt(`New rate limit for ${endpoint} (requests/minute):`);
    if (!newLimit || isNaN(newLimit)) return;
    try {
      await apiService.request('POST', '/superadmin/ratelimit/override', { endpoint, limit: parseInt(newLimit) });
      Bus.emit('toast', { msg: this._lbl().rl_updated });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Impersonation ──────────────────────────────────────────

  _renderImpersonate(lbl) {
    return `<div class="sa-section">
      <h2>${lbl.imp_title}</h2>
      <p style="color:#ff9800;margin-bottom:12px;">${lbl.imp_warning}</p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">
        <input type="email" data-ref="imp-email" placeholder="${lbl.imp_email_placeholder}" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ccc;">
        <button class="sa-btn" data-action="imp-start">${lbl.imp_start}</button>
      </div>
      <div data-ref="imp-status" style="color:#aaa;text-align:center;padding:16px;">${lbl.imp_not_active}</div>
    </div>`;
  }

  async _impStart() {
    const email = this.shadowRoot.querySelector('[data-ref="imp-email"]')?.value;
    if (!email) { Bus.emit('toast', { msg: 'Enter user email', type: 'error' }); return; }
    if (!confirm(this._lbl().imp_confirm.replace('{email}', email))) return;
    try {
      const data = await apiService.request('POST', '/superadmin/impersonate', { email });
      Bus.emit('toast', { msg: this._lbl().imp_started });
      const st = this.shadowRoot.querySelector('[data-ref="imp-status"]');
      if (st) st.innerHTML = `<div style="background:#fff3e0;padding:12px;border-radius:8px;border:1px solid #ff9800;">
        <strong>${this._lbl().imp_active_as} ${email}</strong><br>
        <small>Token: ${data.token?.slice(0,20)}...</small><br>
        <button class="sa-btn sa-btn-danger" data-action="imp-stop" style="margin-top:8px;">⏹️ ${this._lbl().imp_stop}</button>
      </div>`;
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _impStop() {
    try {
      await apiService.request('POST', '/superadmin/impersonate/stop');
      Bus.emit('toast', { msg: this._lbl().imp_stopped });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── NPS / Feedback ─────────────────────────────────────────

  async _renderNPS(lbl) {
    try {
      const data = await this._saFetch('/nps');
      const responses = data.responses || [];
      const avg = data.avg_score || 0;
      const promoters = data.promoters || 0;
      const detractors = data.detractors || 0;
      const nps = data.nps_score || 0;
      const rows = responses.slice(0, 20).map(r => `<tr>
        <td>${r.user_email || r.user_id}</td>
        <td><strong style="color:${r.score >= 9 ? '#4caf50' : r.score >= 7 ? '#ff9800' : '#f44336'}">${r.score}</strong></td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${r.feedback || '-'}</td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
      </tr>`).join('');
      return `<div class="sa-section">
        <h2>${lbl.nps_title}</h2>
        <button class="sa-btn" data-action="nps-send-survey" style="margin-bottom:12px;">${lbl.nps_send_survey}</button>
        <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
          <div class="sa-stat-card"><strong style="font-size:2em;color:${nps >= 50 ? '#4caf50' : nps >= 0 ? '#ff9800' : '#f44336'}">${nps}</strong><br><small>NPS Score</small></div>
          <div class="sa-stat-card"><strong>${avg.toFixed(1)}</strong><br><small>${lbl.nps_avg}</small></div>
          <div class="sa-stat-card"><strong style="color:#4caf50">${promoters}</strong><br><small>${lbl.nps_promoters}</small></div>
          <div class="sa-stat-card"><strong style="color:#f44336">${detractors}</strong><br><small>${lbl.nps_detractors}</small></div>
        </div>
        <table class="sa-table" style="width:100%"><thead><tr>
          <th>${lbl.nps_user}</th><th>${lbl.nps_score_col}</th><th>${lbl.nps_feedback}</th><th>${lbl.nps_date}</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#aaa">${lbl.nps_empty}</td></tr>`}</tbody></table>
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.nps_title}</h2><p style="color:#aaa">${lbl.nps_empty}</p></div>`; }
  }

  async _npsSendSurvey() {
    const target = prompt('Send NPS survey to (all / plan:starter / org:ID):') || 'all';
    if (!confirm(`Send NPS survey to: ${target}?`)) return;
    try {
      const res = await apiService.request('POST', '/superadmin/nps/send', { target });
      Bus.emit('toast', { msg: `${this._lbl().nps_sent}: ${res.sent_to || 0} users` });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Multi-Vertical Manager ─────────────────────────────────

  _renderVerticals(lbl) {
    const verticals = [
      { id: 'egg', name: 'EGGlogU', icon: '🥚', status: 'live' },
      { id: 'pig', name: 'PigLogU', icon: '🐷', status: 'planned' },
      { id: 'cow', name: 'CowLogU', icon: '🐄', status: 'planned' },
      { id: 'crop', name: 'CropLogU', icon: '🌾', status: 'planned' },
      { id: 'aqua', name: 'AquaLogU', icon: '🐟', status: 'planned' },
    ];
    const cards = verticals.map(v => `<div class="sa-card" style="text-align:center;padding:16px;border-left:4px solid ${v.status === 'live' ? '#4caf50' : '#ff9800'};">
      <span style="font-size:2em">${v.icon}</span>
      <h3 style="margin:8px 0 4px">${v.name}</h3>
      <span style="color:${v.status === 'live' ? '#4caf50' : '#ff9800'};font-weight:600">${v.status.toUpperCase()}</span>
      <br><label class="sa-toggle" style="margin-top:8px;"><input type="checkbox" ${v.status === 'live' ? 'checked' : ''} data-action="vert-toggle" data-id="${v.id}"><span class="sa-slider"></span></label>
    </div>`).join('');
    return `<div class="sa-section">
      <h2>${lbl.vert_title}</h2>
      <p style="color:#aaa;margin-bottom:16px;">${lbl.vert_desc}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">${cards}</div>
    </div>`;
  }

  async _vertToggle(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    const enabled = e.target.checked;
    try {
      await apiService.request('PATCH', `/superadmin/verticals/${id}`, { enabled });
      Bus.emit('toast', { msg: `${id.toUpperCase()} ${enabled ? 'enabled' : 'disabled'}` });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); e.target.checked = !enabled; }
  }

  // ── Partner Portal ─────────────────────────────────────────

  async _renderPartners(lbl) {
    try {
      const data = await this._saFetch('/partners');
      const partners = data.partners || [];
      const rows = partners.map(p => `<tr>
        <td>${p.name}</td>
        <td>${p.type || 'reseller'}</td>
        <td>${p.referred_orgs || 0}</td>
        <td>$${((p.revenue || 0) / 100).toFixed(2)}</td>
        <td><span style="color:${p.active ? '#4caf50' : '#999'}">${p.active ? 'Active' : 'Inactive'}</span></td>
        <td><button class="sa-btn-sm sa-btn-danger" data-action="part-delete" data-id="${p.id}">🗑️</button></td>
      </tr>`).join('');
      return `<div class="sa-section">
        <h2>${lbl.part_title}</h2>
        <button class="sa-btn" data-action="part-create" style="margin-bottom:12px;">${lbl.part_create}</button>
        <div style="display:flex;gap:16px;margin-bottom:12px;">
          <div class="sa-stat-card"><strong>${data.total || 0}</strong><br><small>${lbl.part_total}</small></div>
          <div class="sa-stat-card"><strong>$${((data.total_revenue || 0) / 100).toFixed(0)}</strong><br><small>${lbl.part_revenue}</small></div>
        </div>
        <table class="sa-table" style="width:100%"><thead><tr>
          <th>${lbl.part_name}</th><th>${lbl.part_type}</th><th>${lbl.part_referrals}</th><th>${lbl.part_revenue}</th><th>${lbl.part_status}</th><th>${lbl.part_actions}</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#aaa">${lbl.part_empty}</td></tr>`}</tbody></table>
      </div>`;
    } catch { return `<div class="sa-section"><h2>${lbl.part_title}</h2><p style="color:#aaa">${lbl.part_empty}</p></div>`; }
  }

  async _partCreate() {
    const name = prompt('Partner name:');
    if (!name) return;
    const type = prompt('Type (reseller / integrator / distributor):') || 'reseller';
    const email = prompt('Contact email:') || '';
    try {
      await apiService.request('POST', '/superadmin/partners', { name, type, email });
      Bus.emit('toast', { msg: this._lbl().part_created });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _partDelete(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm(this._lbl().part_confirm_delete)) return;
    try {
      await apiService.request('DELETE', `/superadmin/partners/${id}`);
      Bus.emit('toast', { msg: this._lbl().part_deleted });
      this.render();
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Compliance Center ──────────────────────────────────────

  _renderCompliance(lbl) {
    return `<div class="sa-section">
      <h2>${lbl.comp_title}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:16px;">
        <div class="sa-card" style="padding:16px;">
          <h4>${lbl.comp_gdpr}</h4>
          <ul style="font-size:13px;color:#aaa;padding-left:16px;">
            <li>${lbl.comp_data_retention}</li>
            <li>${lbl.comp_consent_log}</li>
            <li>${lbl.comp_dpa}</li>
          </ul>
        </div>
        <div class="sa-card" style="padding:16px;">
          <h4>${lbl.comp_soc2}</h4>
          <ul style="font-size:13px;color:#aaa;padding-left:16px;">
            <li>${lbl.comp_access_review}</li>
            <li>${lbl.comp_encryption}</li>
            <li>${lbl.comp_incident}</li>
          </ul>
        </div>
        <div class="sa-card" style="padding:16px;">
          <h4>${lbl.comp_local}</h4>
          <ul style="font-size:13px;color:#aaa;padding-left:16px;">
            <li>${lbl.comp_chile_pdp}</li>
            <li>${lbl.comp_brazil_lgpd}</li>
            <li>${lbl.comp_mexico_lfpdp}</li>
          </ul>
        </div>
      </div>
      <h3>${lbl.comp_dsar_title}</h3>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input type="email" data-ref="comp-email" placeholder="${lbl.comp_user_email}" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ccc;">
        <button class="sa-btn" data-action="comp-dsar">${lbl.comp_dsar_btn}</button>
        <button class="sa-btn sa-btn-outline" data-action="comp-export-user">${lbl.comp_export_user}</button>
      </div>
      <div data-ref="comp-result" style="color:#aaa;text-align:center;padding:12px;"></div>
    </div>`;
  }

  async _compDSAR() {
    const email = this.shadowRoot.querySelector('[data-ref="comp-email"]')?.value;
    if (!email) { Bus.emit('toast', { msg: 'Enter user email', type: 'error' }); return; }
    try {
      const data = await apiService.request('POST', '/superadmin/compliance/dsar', { email });
      const res = this.shadowRoot.querySelector('[data-ref="comp-result"]');
      if (res) res.innerHTML = `<div style="background:#e8f5e9;padding:12px;border-radius:8px;text-align:left;">
        <strong>${this._lbl().comp_dsar_result}</strong><br>
        <small>Records: ${data.records || 0} | Exports: ${data.exports || 0}</small><br>
        ${data.download_url ? `<a href="${data.download_url}" target="_blank">${this._lbl().comp_download}</a>` : ''}
      </div>`;
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  async _compExportUser() {
    const email = this.shadowRoot.querySelector('[data-ref="comp-email"]')?.value;
    if (!email) { Bus.emit('toast', { msg: 'Enter user email', type: 'error' }); return; }
    try {
      const data = await apiService.request('POST', '/superadmin/compliance/export-user', { email });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `user-data-${email}-${new Date().toISOString().slice(0,10)}.json`; a.click();
      Bus.emit('toast', { msg: this._lbl().comp_exported });
    } catch (err) { Bus.emit('toast', { msg: 'Error: ' + err.message, type: 'error' }); }
  }

  // ── Settings ───────────────────────────────────────────────

  _renderSettings(lbl) {
    const u = getCurrentUser() || {};
    let h = `<div class="card" style="margin-bottom:16px"><h3>${lbl.account_info}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px">
      <div class="kpi-card"><div class="kpi-label">Email</div><div class="kpi-value" style="font-size:0.95rem">${sanitizeHTML(u.email || '-')}</div></div>
      <div class="kpi-card"><div class="kpi-label">Nombre</div><div class="kpi-value" style="font-size:0.95rem">${sanitizeHTML(u.full_name || '-')}</div></div>
      <div class="kpi-card"><div class="kpi-label">Rol</div><div class="kpi-value" style="font-size:0.95rem;color:var(--primary)">SUPERADMIN</div></div>
      </div></div>`;

    h += `<div class="card"><h3>${lbl.change_pw}</h3>
      <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px">${lbl.pw_rules}</p>
      <div class="sa-pw-form" style="max-width:400px;display:flex;flex-direction:column;gap:12px">
        <div><label>${lbl.current_pw}</label><input type="password" class="sa-pw-current" autocomplete="current-password"></div>
        <div><label>${lbl.new_pw}</label><input type="password" class="sa-pw-new" minlength="8" maxlength="128" autocomplete="new-password"></div>
        <div><label>${lbl.confirm_pw}</label><input type="password" class="sa-pw-confirm" minlength="8" maxlength="128" autocomplete="new-password"></div>
        <button class="btn btn-primary" style="align-self:flex-start" data-action="change-pw">${lbl.change_pw}</button>
      </div></div>`;

    return h;
  }

  // ── Intelligence — see egg-superadmin-intel.js (mixin)

  // ── Outbreaks — see egg-superadmin-outbreaks.js (mixin)

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

// ── Apply mixins (extracted for F5 decomposition) ──
mixCRM(EggSuperadmin, _lbl);
mixIntelligence(EggSuperadmin);
mixOutbreaks(EggSuperadmin, _lbl);

customElements.define('egg-superadmin', EggSuperadmin);
export { EggSuperadmin };
export default EggSuperadmin;
