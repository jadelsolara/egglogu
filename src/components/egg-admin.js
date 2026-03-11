// EGGlogU — Admin SaaS Panel Web Component
// Replaces renderAdmin(), showUpgradeModal(), showUserForm(), saveUser(),
// deactivateUser(), reactivateUser(), resendActivation(), removeUser(),
// requestUserActivation(), verifyOwnerForActivation(), confirmUserActivation(),
// sendActivationConfirmation(), activateWorkerDirect(), executeDeactivation(),
// showCancelSubscriptionModal(), confirmCancelSubscription(),
// showDeleteAccountModal(), confirmDeleteAccount(),
// getNextBillingDate(), checkBillingCycleDeactivations(), toggleEmailField(),
// openBillingPortal(), startSubscription(), refreshUserSection()

import { Store, Bus, t, sanitizeHTML, escapeAttr, genId, todayStr, logAudit, currency } from '../core/index.js';
import { getCurrentUser } from '../core/permissions.js';
import { apiService } from '../core/api.js';
import { hashPin, verifyPinHash, migratePinIfNeeded, isPinLocked, recordPinFailure, resetPinAttempts } from '../core/security.js';
import { showConfirm } from './egg-confirm.js';

// ── Plan tiers constant ──────────────────────────────────────
const PLAN_TIERS = {
  hobby:      { name: 'Hobby',      baseCost: 0,   maxFlocks: 3,        includedUsers: 2,        extraUserCost: 0, modules: ['dashboard','production','feed'],                                           stripePlan: 'hobby' },
  starter:    { name: 'Starter',    baseCost: 49,  maxFlocks: 10,       includedUsers: 5,        extraUserCost: 0, modules: ['dashboard','production','health','feed','clients','finance','environment'], stripePlan: 'starter' },
  pro:        { name: 'Pro',        baseCost: 99,  maxFlocks: Infinity,  includedUsers: 15,       extraUserCost: 0, modules: 'all',                                                                      stripePlan: 'pro' },
  enterprise: { name: 'Enterprise', baseCost: 199, maxFlocks: Infinity,  includedUsers: Infinity, extraUserCost: 0, modules: 'all',                                                                      stripePlan: 'enterprise' }
};

// ── PIN rate-limiting constants ──────────────────────────────
const PIN_MAX_ATTEMPTS = 5;

// ── i18n labels (8 languages) ────────────────────────────────
const LABELS = {
  es: { title:'Admin SaaS', plan_overview:'Resumen del Plan', current_plan:'Plan Actual', monthly_cost:'Costo Mensual', max_flocks:'Lotes Max.', included_users:'Usuarios Incluidos', extra_cost:'Costo Extra/Usuario', billing:'Ciclo Facturacion', user_kpis:'KPIs de Usuarios', total_users:'Total Usuarios', active_users:'Usuarios Activos', inactive_users:'Inactivos', by_role:'Por Rol', activation_kpis:'KPIs de Activacion', activation_rate:'Tasa Activacion', avg_time_activate:'Tiempo Promedio Activacion', pending_activations:'Activaciones Pendientes', churn_kpis:'KPIs de Cancelacion', monthly_churn:'Cancelacion Mensual', retention:'Retencion', deactivated_30d:'Desactivados (30d)', revenue_kpis:'KPIs de Ingresos', mrr:'MRR (Ingreso Mensual Recurrente)', base_revenue:'Ingreso Base', extra_user_revenue:'Ingreso Usuarios Extra', total_mrr:'MRR Total', user_table:'Tabla de Usuarios', name:'Nombre', email:'Email', role:'Rol', status:'Estado', since:'Desde', actions:'Acciones', active:'Activo', inactive:'Inactivo', pending:'Pendiente', no_users:'No hay usuarios registrados', upgrade_plan:'Cambiar Plan', upgrade:'Upgrade', current:'(Actual)', audit_recent:'Actividad Reciente', no_audit:'Sin registros de auditoria', deactivate:'Desactivar', activate:'Activar', days:'dias', confirm_deactivate:'Desactivar este usuario?', confirm_activate:'Reactivar este usuario?', plan_changed:'Plan actualizado exitosamente', user_toggled:'Estado del usuario actualizado', add_user:'Agregar Usuario', delete_user:'Eliminar', billing_title:'Facturacion y Pagos', billing_next:'Proxima Facturacion', billing_cycle:'Ciclo', billing_base:'Cargo Base', billing_extra:'Usuarios Extra', billing_total:'Total por Ciclo', billing_ledger:'Historial de Cobros', billing_type:'Tipo', billing_desc:'Descripcion', billing_amount:'Monto', billing_monthly:'Cobro mensual', billing_activation_charge:'Cargo proporcional activacion', billing_deactivation_credit:'Credito desactivacion', billing_auto_note:'Sistema autogestionable -- los cobros y creditos se calculan automaticamente segun activaciones/desactivaciones de usuarios. No se requiere intervencion manual.', date:'Fecha', save:'Guardar', cancel:'Cancelar', edit:'Editar', required:'Requerido', role_owner:'Owner', role_manager:'Manager', role_worker:'Worker', role_vet:'Vet', pin_label:'PIN', pin_placeholder:'0000', verify:'Verificar', security_check:'Verificacion de Seguridad', security_desc:'Para agregar un nuevo usuario se requiere verificacion del dueno. Ingrese su PIN para continuar.', owner_pin:'PIN del Dueno', verify_send:'Verificar y Enviar Confirmacion', confirm_sent:'Confirmacion Enviada', confirm_activation:'Confirmar Activacion', close_later:'Cerrar (confirmar despues)', extra_user_notice:'Usuario adicional', proportional_charge:'Se cobrara proporcional desde la fecha de activacion hasta fin del ciclo', activated_msg:'activado', deactivated_msg:'desactivado', eliminated_msg:'eliminado', incorrect_pin:'PIN incorrecto', too_many_attempts:'Demasiados intentos. Espera unos minutos.', confirm_deactivation:'Confirmar Desactivacion', deactivate_confirm_msg:'Ingrese su PIN para confirmar la desactivacion de', only_owner:'Solo el dueno puede agregar usuarios', only_owner_reactivate:'Solo el dueno puede reactivar usuarios', not_pending:'Usuario no esta pendiente', user_not_found:'Usuario no encontrado', cannot_deactivate_owner:'No se puede desactivar el ultimo dueno activo', deactivate_before_delete:'Desactive el usuario antes de eliminarlo', delete_confirm:'Eliminar permanentemente a {name}? Esta accion no se puede deshacer.', token_invalid:'Token de activacion invalido o expirado', token_expired:'Token expirado. Solicite una nueva activacion.', email_required:'Email valido requerido para', worker_id_required:'Worker ID requerido', pin_4_digits:'PIN debe ser 4 digitos numericos', email_optional:'(opcional)', email_required_label:'*', worker_id:'Worker ID', confirm_email_subject:'EGGlogU -- Confirmar activacion de usuario', requested_by:'Solicitado por', confirmation_token:'Token de confirmacion', expires_24h:'Este enlace expira en 24 horas. Si no solicito esto, ignore este mensaje.', included_in_plan:'Incluido en el plan (sin costo adicional)', extra_cost_notice:'Costo adicional', plans_title:'Planes EGGlogU', monthly:'Mensual', annual:'Anual', most_popular:'Mas popular', your_plan:'Tu plan', farms:'granjas', flocks:'lotes', users:'usuarios', choose_plan:'Elegir plan', manage:'Gestionar', first_3_months:'primeros 3 meses', discount_note:'', redirecting:'Redirigiendo a pago seguro...', perms_saved:'Permisos actualizados' },
  en: { title:'SaaS Admin', plan_overview:'Plan Overview', current_plan:'Current Plan', monthly_cost:'Monthly Cost', max_flocks:'Max Flocks', included_users:'Included Users', extra_cost:'Extra User Cost', billing:'Billing Cycle', user_kpis:'User KPIs', total_users:'Total Users', active_users:'Active Users', inactive_users:'Inactive', by_role:'By Role', activation_kpis:'Activation KPIs', activation_rate:'Activation Rate', avg_time_activate:'Avg. Time to Activate', pending_activations:'Pending Activations', churn_kpis:'Churn KPIs', monthly_churn:'Monthly Churn', retention:'Retention', deactivated_30d:'Deactivated (30d)', revenue_kpis:'Revenue KPIs', mrr:'MRR (Monthly Recurring Revenue)', base_revenue:'Base Revenue', extra_user_revenue:'Extra User Revenue', total_mrr:'Total MRR', user_table:'User Table', name:'Name', email:'Email', role:'Role', status:'Status', since:'Since', actions:'Actions', active:'Active', inactive:'Inactive', pending:'Pending', no_users:'No registered users', upgrade_plan:'Change Plan', upgrade:'Upgrade', current:'(Current)', audit_recent:'Recent Activity', no_audit:'No audit records', deactivate:'Deactivate', activate:'Activate', days:'days', confirm_deactivate:'Deactivate this user?', confirm_activate:'Reactivate this user?', plan_changed:'Plan updated successfully', user_toggled:'User status updated', add_user:'Add User', delete_user:'Delete', billing_title:'Billing & Payments', billing_next:'Next Billing', billing_cycle:'Cycle', billing_base:'Base Charge', billing_extra:'Extra Users', billing_total:'Total per Cycle', billing_ledger:'Payment History', billing_type:'Type', billing_desc:'Description', billing_amount:'Amount', billing_monthly:'Monthly charge', billing_activation_charge:'Proportional activation charge', billing_deactivation_credit:'Deactivation credit', billing_auto_note:'Self-managed system -- charges and credits are calculated automatically based on user activations/deactivations. No manual intervention required.', date:'Date', save:'Save', cancel:'Cancel', edit:'Edit', required:'Required', role_owner:'Owner', role_manager:'Manager', role_worker:'Worker', role_vet:'Vet', pin_label:'PIN', pin_placeholder:'0000', verify:'Verify', security_check:'Security Verification', security_desc:'Owner verification required to add a new user. Enter your PIN to continue.', owner_pin:'Owner PIN', verify_send:'Verify and Send Confirmation', confirm_sent:'Confirmation Sent', confirm_activation:'Confirm Activation', close_later:'Close (confirm later)', extra_user_notice:'Extra user', proportional_charge:'Proportional charge from activation date to end of billing cycle', activated_msg:'activated', deactivated_msg:'deactivated', eliminated_msg:'deleted', incorrect_pin:'Incorrect PIN', too_many_attempts:'Too many attempts. Wait a few minutes.', confirm_deactivation:'Confirm Deactivation', deactivate_confirm_msg:'Enter your PIN to confirm deactivation of', only_owner:'Only the owner can add users', only_owner_reactivate:'Only the owner can reactivate users', not_pending:'User is not pending', user_not_found:'User not found', cannot_deactivate_owner:'Cannot deactivate the last active owner', deactivate_before_delete:'Deactivate the user before deleting', delete_confirm:'Permanently delete {name}? This action cannot be undone.', token_invalid:'Invalid or expired activation token', token_expired:'Token expired. Request a new activation.', email_required:'Valid email required for', worker_id_required:'Worker ID required', pin_4_digits:'PIN must be 4 numeric digits', email_optional:'(optional)', email_required_label:'*', worker_id:'Worker ID', confirm_email_subject:'EGGlogU -- Confirm user activation', requested_by:'Requested by', confirmation_token:'Confirmation token', expires_24h:'This link expires in 24 hours. If you did not request this, ignore this message.', included_in_plan:'Included in plan (no additional cost)', extra_cost_notice:'Extra cost', plans_title:'EGGlogU Plans', monthly:'Monthly', annual:'Annual', most_popular:'Most popular', your_plan:'Current', farms:'farms', flocks:'flocks', users:'users', choose_plan:'Choose plan', manage:'Manage', first_3_months:'first 3 months', discount_note:'', redirecting:'Redirecting to secure payment...', perms_saved:'Permissions updated' },
  pt: { title:'Admin SaaS', plan_overview:'Resumo do Plano', current_plan:'Plano Atual', monthly_cost:'Custo Mensal', max_flocks:'Lotes Max.', included_users:'Usuarios Incluidos', extra_cost:'Custo Extra/Usuario', billing:'Ciclo de Faturamento', user_kpis:'KPIs de Usuarios', total_users:'Total de Usuarios', active_users:'Usuarios Ativos', inactive_users:'Inativos', by_role:'Por Funcao', activation_kpis:'KPIs de Ativacao', activation_rate:'Taxa de Ativacao', avg_time_activate:'Tempo Medio de Ativacao', pending_activations:'Ativacoes Pendentes', churn_kpis:'KPIs de Cancelamento', monthly_churn:'Cancelamento Mensal', retention:'Retencao', deactivated_30d:'Desativados (30d)', revenue_kpis:'KPIs de Receita', mrr:'MRR (Receita Mensal Recorrente)', base_revenue:'Receita Base', extra_user_revenue:'Receita Usuarios Extra', total_mrr:'MRR Total', user_table:'Tabela de Usuarios', name:'Nome', email:'Email', role:'Funcao', status:'Status', since:'Desde', actions:'Acoes', active:'Ativo', inactive:'Inativo', pending:'Pendente', no_users:'Nenhum usuario registrado', upgrade_plan:'Alterar Plano', upgrade:'Upgrade', current:'(Atual)', audit_recent:'Atividade Recente', no_audit:'Sem registros de auditoria', deactivate:'Desativar', activate:'Ativar', days:'dias', confirm_deactivate:'Desativar este usuario?', confirm_activate:'Reativar este usuario?', plan_changed:'Plano atualizado com sucesso', user_toggled:'Status do usuario atualizado', add_user:'Adicionar Usuario', delete_user:'Excluir', billing_title:'Faturamento e Pagamentos', billing_next:'Proximo Faturamento', billing_cycle:'Ciclo', billing_base:'Cobranca Base', billing_extra:'Usuarios Extra', billing_total:'Total por Ciclo', billing_ledger:'Historico de Cobrancas', billing_type:'Tipo', billing_desc:'Descricao', billing_amount:'Valor', billing_monthly:'Cobranca mensal', billing_activation_charge:'Cobranca proporcional de ativacao', billing_deactivation_credit:'Credito de desativacao', billing_auto_note:'Sistema autogerenciavel -- cobrancas e creditos sao calculados automaticamente com base em ativacoes/desativacoes de usuarios. Nenhuma intervencao manual necessaria.', date:'Data', save:'Salvar', cancel:'Cancelar', edit:'Editar', required:'Obrigatorio', days:'dias', add_user:'Adicionar Usuario', delete_user:'Excluir', plans_title:'Planos EGGlogU', monthly:'Mensal', annual:'Anual', most_popular:'Mais popular', your_plan:'Atual', farms:'fazendas', flocks:'lotes', users:'usuarios', choose_plan:'Escolher plano', manage:'Gerenciar', redirecting:'Redirecionando para pagamento seguro...' },
  fr: { title:'Admin SaaS', plan_overview:'Apercu du Plan', current_plan:'Plan Actuel', monthly_cost:'Cout Mensuel', max_flocks:'Lots Max.', included_users:'Utilisateurs Inclus', extra_cost:'Cout Extra/Utilisateur', billing:'Cycle de Facturation', user_kpis:'KPIs Utilisateurs', total_users:'Total Utilisateurs', active_users:'Utilisateurs Actifs', inactive_users:'Inactifs', by_role:'Par Role', activation_kpis:"KPIs d'Activation", activation_rate:"Taux d'Activation", avg_time_activate:"Temps Moyen d'Activation", pending_activations:'Activations en Attente', churn_kpis:"KPIs d'Attrition", monthly_churn:'Attrition Mensuelle', retention:'Retention', deactivated_30d:'Desactives (30j)', revenue_kpis:'KPIs de Revenus', mrr:'MRR (Revenu Mensuel Recurrent)', base_revenue:'Revenu de Base', extra_user_revenue:'Revenu Utilisateurs Extra', total_mrr:'MRR Total', user_table:'Tableau des Utilisateurs', name:'Nom', email:'Email', role:'Role', status:'Statut', since:'Depuis', actions:'Actions', active:'Actif', inactive:'Inactif', pending:'En attente', no_users:"Aucun utilisateur enregistre", upgrade_plan:'Changer de Plan', upgrade:'Upgrade', current:'(Actuel)', audit_recent:'Activite Recente', no_audit:"Aucun enregistrement d'audit", deactivate:'Desactiver', activate:'Activer', days:'jours', confirm_deactivate:'Desactiver cet utilisateur ?', confirm_activate:'Reactiver cet utilisateur ?', plan_changed:'Plan mis a jour avec succes', user_toggled:"Statut de l'utilisateur mis a jour", add_user:'Ajouter Utilisateur', delete_user:'Supprimer', billing_title:'Facturation et Paiements', billing_next:'Prochaine Facturation', billing_cycle:'Cycle', billing_base:'Frais de Base', billing_extra:'Utilisateurs Extra', billing_total:'Total par Cycle', billing_ledger:'Historique des Paiements', billing_type:'Type', billing_desc:'Description', billing_amount:'Montant', billing_monthly:'Frais mensuel', billing_activation_charge:"Frais proportionnel d'activation", billing_deactivation_credit:'Credit de desactivation', billing_auto_note:'Systeme autogere -- les frais et credits sont calcules automatiquement selon les activations/desactivations. Aucune intervention manuelle requise.', date:'Date', save:'Enregistrer', cancel:'Annuler', edit:'Modifier', required:'Requis', plans_title:'Plans EGGlogU', monthly:'Mensuel', annual:'Annuel', most_popular:'Le plus populaire', your_plan:'Actuel', farms:'fermes', flocks:'lots', users:'utilisateurs', choose_plan:'Choisir le plan', manage:'Gerer', redirecting:'Redirection vers le paiement securise...' },
  de: { title:'SaaS-Admin', plan_overview:'Planubersicht', current_plan:'Aktueller Plan', monthly_cost:'Monatliche Kosten', max_flocks:'Max. Herden', included_users:'Enthaltene Nutzer', extra_cost:'Extrakosten/Nutzer', billing:'Abrechnungszyklus', user_kpis:'Nutzer-KPIs', total_users:'Nutzer Gesamt', active_users:'Aktive Nutzer', inactive_users:'Inaktiv', by_role:'Nach Rolle', activation_kpis:'Aktivierungs-KPIs', activation_rate:'Aktivierungsrate', avg_time_activate:'Durchschn. Aktivierungszeit', pending_activations:'Ausstehende Aktivierungen', churn_kpis:'Abwanderungs-KPIs', monthly_churn:'Monatliche Abwanderung', retention:'Bindung', deactivated_30d:'Deaktiviert (30T)', revenue_kpis:'Umsatz-KPIs', mrr:'MRR (Monatlich wiederkehrender Umsatz)', base_revenue:'Basisumsatz', extra_user_revenue:'Umsatz Extra-Nutzer', total_mrr:'MRR Gesamt', user_table:'Nutzertabelle', name:'Name', email:'E-Mail', role:'Rolle', status:'Status', since:'Seit', actions:'Aktionen', active:'Aktiv', inactive:'Inaktiv', pending:'Ausstehend', no_users:'Keine registrierten Nutzer', upgrade_plan:'Plan andern', upgrade:'Upgrade', current:'(Aktuell)', audit_recent:'Letzte Aktivitat', no_audit:'Keine Audit-Eintrage', deactivate:'Deaktivieren', activate:'Aktivieren', days:'Tage', confirm_deactivate:'Diesen Nutzer deaktivieren?', confirm_activate:'Diesen Nutzer reaktivieren?', plan_changed:'Plan erfolgreich aktualisiert', user_toggled:'Nutzerstatus aktualisiert', add_user:'Nutzer hinzufugen', delete_user:'Loschen', billing_title:'Abrechnung & Zahlungen', billing_next:'Nachste Abrechnung', billing_cycle:'Zyklus', billing_base:'Grundgebuhr', billing_extra:'Extra-Nutzer', billing_total:'Gesamt pro Zyklus', billing_ledger:'Zahlungsverlauf', billing_type:'Typ', billing_desc:'Beschreibung', billing_amount:'Betrag', billing_monthly:'Monatliche Gebuhr', billing_activation_charge:'Anteilige Aktivierungsgebuhr', billing_deactivation_credit:'Deaktivierungsgutschrift', billing_auto_note:'Selbstverwaltetes System -- Gebuhren und Gutschriften werden automatisch basierend auf Nutzer-Aktivierungen/-Deaktivierungen berechnet. Kein manueller Eingriff erforderlich.', date:'Datum', save:'Speichern', cancel:'Abbrechen', edit:'Bearbeiten', required:'Erforderlich', plans_title:'EGGlogU Plane', monthly:'Monatlich', annual:'Jahrlich', most_popular:'Am beliebtesten', your_plan:'Aktuell', farms:'Farmen', flocks:'Herden', users:'Nutzer', choose_plan:'Plan wahlen', manage:'Verwalten', redirecting:'Weiterleitung zur sicheren Zahlung...' },
  it: { title:'Admin SaaS', plan_overview:'Riepilogo Piano', current_plan:'Piano Attuale', monthly_cost:'Costo Mensile', max_flocks:'Lotti Max.', included_users:'Utenti Inclusi', extra_cost:'Costo Extra/Utente', billing:'Ciclo di Fatturazione', user_kpis:'KPI Utenti', total_users:'Utenti Totali', active_users:'Utenti Attivi', inactive_users:'Inattivi', by_role:'Per Ruolo', activation_kpis:'KPI di Attivazione', activation_rate:'Tasso di Attivazione', avg_time_activate:'Tempo Medio di Attivazione', pending_activations:'Attivazioni in Sospeso', churn_kpis:'KPI di Abbandono', monthly_churn:'Abbandono Mensile', retention:'Fidelizzazione', deactivated_30d:'Disattivati (30g)', revenue_kpis:'KPI di Ricavi', mrr:'MRR (Ricavo Mensile Ricorrente)', base_revenue:'Ricavo Base', extra_user_revenue:'Ricavo Utenti Extra', total_mrr:'MRR Totale', user_table:'Tabella Utenti', name:'Nome', email:'Email', role:'Ruolo', status:'Stato', since:'Dal', actions:'Azioni', active:'Attivo', inactive:'Inattivo', pending:'In attesa', no_users:'Nessun utente registrato', upgrade_plan:'Cambia Piano', upgrade:'Upgrade', current:'(Attuale)', audit_recent:'Attivita Recente', no_audit:'Nessun registro di audit', deactivate:'Disattiva', activate:'Attiva', days:'giorni', confirm_deactivate:'Disattivare questo utente?', confirm_activate:'Riattivare questo utente?', plan_changed:'Piano aggiornato con successo', user_toggled:"Stato dell'utente aggiornato", add_user:'Aggiungi Utente', delete_user:'Elimina', billing_title:'Fatturazione e Pagamenti', billing_next:'Prossima Fatturazione', billing_cycle:'Ciclo', billing_base:'Addebito Base', billing_extra:'Utenti Extra', billing_total:'Totale per Ciclo', billing_ledger:'Storico Pagamenti', billing_type:'Tipo', billing_desc:'Descrizione', billing_amount:'Importo', billing_monthly:'Addebito mensile', billing_activation_charge:'Addebito proporzionale attivazione', billing_deactivation_credit:'Credito disattivazione', billing_auto_note:'Sistema autogestito -- addebiti e crediti vengono calcolati automaticamente in base ad attivazioni/disattivazioni degli utenti. Nessun intervento manuale necessario.', date:'Data', save:'Salva', cancel:'Annulla', edit:'Modifica', required:'Richiesto', plans_title:'Piani EGGlogU', monthly:'Mensile', annual:'Annuale', most_popular:'Piu popolare', your_plan:'Attuale', farms:'aziende', flocks:'lotti', users:'utenti', choose_plan:'Scegli piano', manage:'Gestisci', redirecting:'Reindirizzamento al pagamento sicuro...' },
  ja: { title:'SaaS\u7BA1\u7406', plan_overview:'\u30D7\u30E9\u30F3\u6982\u8981', current_plan:'\u73FE\u5728\u306E\u30D7\u30E9\u30F3', monthly_cost:'\u6708\u984D\u8CBB\u7528', max_flocks:'\u6700\u5927\u9D8F\u7FA4\u6570', included_users:'\u542B\u307E\u308C\u308B\u30E6\u30FC\u30B6\u30FC\u6570', extra_cost:'\u8FFD\u52A0\u30E6\u30FC\u30B6\u30FC\u8CBB\u7528', billing:'\u8ACB\u6C42\u30B5\u30A4\u30AF\u30EB', user_kpis:'\u30E6\u30FC\u30B6\u30FCKPI', total_users:'\u5408\u8A08\u30E6\u30FC\u30B6\u30FC', active_users:'\u30A2\u30AF\u30C6\u30A3\u30D6\u30E6\u30FC\u30B6\u30FC', inactive_users:'\u975E\u30A2\u30AF\u30C6\u30A3\u30D6', by_role:'\u5F79\u5272\u5225', activation_kpis:'\u30A2\u30AF\u30C6\u30A3\u30D9\u30FC\u30B7\u30E7\u30F3KPI', activation_rate:'\u30A2\u30AF\u30C6\u30A3\u30D9\u30FC\u30B7\u30E7\u30F3\u7387', avg_time_activate:'\u5E73\u5747\u30A2\u30AF\u30C6\u30A3\u30D9\u30FC\u30B7\u30E7\u30F3\u6642\u9593', pending_activations:'\u4FDD\u7559\u4E2D\u306E\u30A2\u30AF\u30C6\u30A3\u30D9\u30FC\u30B7\u30E7\u30F3', churn_kpis:'\u89E3\u7D04KPI', monthly_churn:'\u6708\u9593\u89E3\u7D04\u7387', retention:'\u30EA\u30C6\u30F3\u30B7\u30E7\u30F3', deactivated_30d:'\u7121\u52B9\u5316\u6E08\u307F (30\u65E5)', revenue_kpis:'\u53CE\u76CAKPI', mrr:'MRR (\u6708\u9593\u7D4C\u5E38\u53CE\u76CA)', base_revenue:'\u57FA\u672C\u53CE\u76CA', extra_user_revenue:'\u8FFD\u52A0\u30E6\u30FC\u30B6\u30FC\u53CE\u76CA', total_mrr:'MRR\u5408\u8A08', user_table:'\u30E6\u30FC\u30B6\u30FC\u4E00\u89A7', name:'\u540D\u524D', email:'\u30E1\u30FC\u30EB', role:'\u5F79\u5272', status:'\u30B9\u30C6\u30FC\u30BF\u30B9', since:'\u958B\u59CB\u65E5', actions:'\u64CD\u4F5C', active:'\u30A2\u30AF\u30C6\u30A3\u30D6', inactive:'\u975E\u30A2\u30AF\u30C6\u30A3\u30D6', pending:'\u4FDD\u7559\u4E2D', no_users:'\u767B\u9332\u30E6\u30FC\u30B6\u30FC\u306A\u3057', upgrade_plan:'\u30D7\u30E9\u30F3\u5909\u66F4', upgrade:'\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9', current:'(\u73FE\u5728)', audit_recent:'\u6700\u8FD1\u306E\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3', no_audit:'\u76E3\u67FB\u8A18\u9332\u306A\u3057', deactivate:'\u7121\u52B9\u5316', activate:'\u6709\u52B9\u5316', days:'\u65E5', plan_changed:'\u30D7\u30E9\u30F3\u304C\u6B63\u5E38\u306B\u66F4\u65B0\u3055\u308C\u307E\u3057\u305F', user_toggled:'\u30E6\u30FC\u30B6\u30FC\u30B9\u30C6\u30FC\u30BF\u30B9\u304C\u66F4\u65B0\u3055\u308C\u307E\u3057\u305F', add_user:'\u30E6\u30FC\u30B6\u30FC\u8FFD\u52A0', delete_user:'\u524A\u9664', billing_title:'\u8ACB\u6C42\u3068\u652F\u6255\u3044', billing_next:'\u6B21\u56DE\u8ACB\u6C42', billing_cycle:'\u30B5\u30A4\u30AF\u30EB', billing_base:'\u57FA\u672C\u6599\u91D1', billing_extra:'\u8FFD\u52A0\u30E6\u30FC\u30B6\u30FC', billing_total:'\u30B5\u30A4\u30AF\u30EB\u3042\u305F\u308A\u5408\u8A08', billing_ledger:'\u652F\u6255\u3044\u5C65\u6B74', billing_type:'\u7A2E\u985E', billing_desc:'\u8AAC\u660E', billing_amount:'\u91D1\u984D', billing_monthly:'\u6708\u984D\u8ACB\u6C42', billing_activation_charge:'\u6309\u5206\u30A2\u30AF\u30C6\u30A3\u30D9\u30FC\u30B7\u30E7\u30F3\u6599\u91D1', billing_deactivation_credit:'\u7121\u52B9\u5316\u30AF\u30EC\u30B8\u30C3\u30C8', billing_auto_note:'\u81EA\u5DF1\u7BA1\u7406\u578B\u30B7\u30B9\u30C6\u30E0 -- \u30E6\u30FC\u30B6\u30FC\u306E\u6709\u52B9\u5316/\u7121\u52B9\u5316\u306B\u57FA\u3065\u3044\u3066\u6599\u91D1\u3068\u30AF\u30EC\u30B8\u30C3\u30C8\u304C\u81EA\u52D5\u8A08\u7B97\u3055\u308C\u307E\u3059\u3002\u624B\u52D5\u64CD\u4F5C\u306F\u4E0D\u8981\u3067\u3059\u3002', date:'\u65E5\u4ED8', save:'\u4FDD\u5B58', cancel:'\u30AD\u30E3\u30F3\u30BB\u30EB', edit:'\u7DE8\u96C6', required:'\u5FC5\u9808', plans_title:'EGGlogU \u30D7\u30E9\u30F3', monthly:'\u6708\u984D', annual:'\u5E74\u984D', most_popular:'\u6700\u4EBA\u6C17', your_plan:'\u73FE\u5728', farms:'\u8FB2\u5834', flocks:'\u9D8F\u7FA4', users:'\u30E6\u30FC\u30B6\u30FC', choose_plan:'\u30D7\u30E9\u30F3\u3092\u9078\u629E', manage:'\u7BA1\u7406', redirecting:'\u5B89\u5168\u306A\u6C7A\u6E08\u3078\u30EA\u30C0\u30A4\u30EC\u30AF\u30C8\u4E2D...' },
  zh: { title:'SaaS\u7BA1\u7406', plan_overview:'\u65B9\u6848\u6982\u89C8', current_plan:'\u5F53\u524D\u65B9\u6848', monthly_cost:'\u6708\u8D39', max_flocks:'\u6700\u5927\u6279\u6B21', included_users:'\u5305\u542B\u7528\u6237\u6570', extra_cost:'\u989D\u5916\u7528\u6237\u8D39\u7528', billing:'\u8BA1\u8D39\u5468\u671F', user_kpis:'\u7528\u6237KPI', total_users:'\u603B\u7528\u6237\u6570', active_users:'\u6D3B\u8DC3\u7528\u6237', inactive_users:'\u4E0D\u6D3B\u8DC3', by_role:'\u6309\u89D2\u8272', activation_kpis:'\u6FC0\u6D3BKPI', activation_rate:'\u6FC0\u6D3B\u7387', avg_time_activate:'\u5E73\u5747\u6FC0\u6D3B\u65F6\u95F4', pending_activations:'\u5F85\u6FC0\u6D3B', churn_kpis:'\u6D41\u5931KPI', monthly_churn:'\u6708\u6D41\u5931\u7387', retention:'\u7559\u5B58\u7387', deactivated_30d:'\u5DF2\u505C\u7528 (30\u5929)', revenue_kpis:'\u6536\u5165KPI', mrr:'MRR (\u6708\u5EA6\u7ECF\u5E38\u6027\u6536\u5165)', base_revenue:'\u57FA\u7840\u6536\u5165', extra_user_revenue:'\u989D\u5916\u7528\u6237\u6536\u5165', total_mrr:'MRR\u603B\u8BA1', user_table:'\u7528\u6237\u8868', name:'\u59D3\u540D', email:'\u90AE\u7BB1', role:'\u89D2\u8272', status:'\u72B6\u6001', since:'\u8D77\u59CB', actions:'\u64CD\u4F5C', active:'\u6D3B\u8DC3', inactive:'\u4E0D\u6D3B\u8DC3', pending:'\u5F85\u5904\u7406', no_users:'\u6682\u65E0\u6CE8\u518C\u7528\u6237', upgrade_plan:'\u66F4\u6539\u65B9\u6848', upgrade:'\u5347\u7EA7', current:'(\u5F53\u524D)', audit_recent:'\u6700\u8FD1\u6D3B\u52A8', no_audit:'\u6682\u65E0\u5BA1\u8BA1\u8BB0\u5F55', deactivate:'\u505C\u7528', activate:'\u542F\u7528', days:'\u5929', plan_changed:'\u65B9\u6848\u66F4\u65B0\u6210\u529F', user_toggled:'\u7528\u6237\u72B6\u6001\u5DF2\u66F4\u65B0', add_user:'\u6DFB\u52A0\u7528\u6237', delete_user:'\u5220\u9664', billing_title:'\u8D26\u5355\u4E0E\u652F\u4ED8', billing_next:'\u4E0B\u6B21\u8D26\u5355', billing_cycle:'\u5468\u671F', billing_base:'\u57FA\u7840\u8D39\u7528', billing_extra:'\u989D\u5916\u7528\u6237', billing_total:'\u6BCF\u5468\u671F\u603B\u8BA1', billing_ledger:'\u652F\u4ED8\u8BB0\u5F55', billing_type:'\u7C7B\u578B', billing_desc:'\u63CF\u8FF0', billing_amount:'\u91D1\u989D', billing_monthly:'\u6708\u5EA6\u6536\u8D39', billing_activation_charge:'\u6309\u6BD4\u4F8B\u6FC0\u6D3B\u8D39\u7528', billing_deactivation_credit:'\u505C\u7528\u9000\u6B3E', billing_auto_note:'\u81EA\u7BA1\u7406\u7CFB\u7EDF -- \u8D39\u7528\u548C\u9000\u6B3E\u6839\u636E\u7528\u6237\u6FC0\u6D3B/\u505C\u7528\u81EA\u52A8\u8BA1\u7B97\u3002\u65E0\u9700\u4EBA\u5DE5\u5E72\u9884\u3002', date:'\u65E5\u671F', save:'\u4FDD\u5B58', cancel:'\u53D6\u6D88', edit:'\u7F16\u8F91', required:'\u5FC5\u586B', plans_title:'EGGlogU \u65B9\u6848', monthly:'\u6708\u4ED8', annual:'\u5E74\u4ED8', most_popular:'\u6700\u53D7\u6B22\u8FCE', your_plan:'\u5F53\u524D', farms:'\u519C\u573A', flocks:'\u6279\u6B21', users:'\u7528\u6237', choose_plan:'\u9009\u62E9\u65B9\u6848', manage:'\u7BA1\u7406', redirecting:'\u6B63\u5728\u91CD\u5B9A\u5411\u5230\u5B89\u5168\u652F\u4ED8...' }
};

function _lbl() {
  const lang = document.documentElement.lang || 'es';
  return LABELS[lang] || LABELS[Object.keys(LABELS).find(k => lang.startsWith(k))] || LABELS.es;
}

// ── Helper: next billing date ────────────────────────────────
function _getNextBillingDate(cycle) {
  const d = new Date();
  if (cycle === 'monthly') { d.setMonth(d.getMonth() + 1); d.setDate(1); }
  else if (cycle === 'quarterly') { d.setMonth(d.getMonth() + 3); d.setDate(1); }
  else { d.setFullYear(d.getFullYear() + 1); d.setMonth(0); d.setDate(1); }
  return d.toISOString().split('T')[0];
}

// ══════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════

class EggAdmin extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._unsubs = [];
    this._pendingActivation = null;
  }

  connectedCallback() {
    this.render();
    this._unsubs.push(
      Bus.on('modal:action', (e) => this._onModalAction(e)),
      Bus.on('data:changed', () => this.render())
    );
    // Check billing cycle deactivations on mount
    this._checkBillingCycleDeactivations();
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }

  // ── Main render ────────────────────────────────────────────

  render() {
    const D = Store.get();
    const lbl = _lbl();
    const plan = D.settings.plan || {};
    const tier = plan.tier || 'enterprise';
    const tierInfo = PLAN_TIERS[tier] || PLAN_TIERS.pro;
    const users = D.users || [];
    const pending = D.pendingActivations || [];
    const audit = D.auditLog || [];
    const cur = plan.currency || 'USD';
    const currentUser = getCurrentUser();

    // Compute KPIs
    const activeUsers = users.filter(u => u.status === 'active');
    const inactiveUsers = users.filter(u => u.status === 'inactive' || u.status === 'deactivated');
    const roleCounts = {};
    activeUsers.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

    // Activation KPIs
    const activatedUsers = users.filter(u => u.activatedAt);
    const activationRate = users.length ? Math.round(activatedUsers.length / users.length * 100) : 0;
    let avgActivationDays = 0;
    if (activatedUsers.length) {
      const totalDays = activatedUsers.reduce((s, u) => {
        const req = u.requestedAt ? new Date(u.requestedAt) : new Date(u.createdAt || u.activatedAt);
        const act = new Date(u.activatedAt);
        return s + Math.max(0, (act - req) / (1000 * 60 * 60 * 24));
      }, 0);
      avgActivationDays = Math.round(totalDays / activatedUsers.length * 10) / 10;
    }

    // Churn KPIs (30-day window)
    const now = Date.now();
    const d30 = 30 * 24 * 60 * 60 * 1000;
    const deactivated30d = users.filter(u => u.deactivatedAt && (now - new Date(u.deactivatedAt).getTime()) < d30);
    const activeStart = users.filter(u => {
      const created = new Date(u.createdAt || u.activatedAt || '2026-01-01').getTime();
      return created < (now - d30);
    });
    const churnRate = activeStart.length ? Math.round(deactivated30d.length / activeStart.length * 100) : 0;
    const retention = 100 - churnRate;

    // Revenue KPIs
    const extraUsers = Math.max(0, activeUsers.length - tierInfo.includedUsers);
    const baseRevenue = tierInfo.baseCost;
    const extraRevenue = extraUsers * tierInfo.extraUserCost;
    const totalMRR = baseRevenue + extraRevenue;

    let h = this._baseStyle();

    // Page header
    h += `<div class="page-header"><h2>${lbl.title}</h2></div>`;

    // Plan Overview Card
    h += `<div class="card" style="margin-bottom:16px"><h3>${lbl.plan_overview}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px">
    <div class="kpi-card"><div class="kpi-label">${lbl.current_plan}</div><div class="kpi-value" style="font-size:1.3rem;color:var(--primary)">${tierInfo.name.toUpperCase()}</div></div>
    <div class="kpi-card"><div class="kpi-label">${lbl.monthly_cost}</div><div class="kpi-value">$${tierInfo.baseCost}<small>/${cur}</small></div></div>
    <div class="kpi-card"><div class="kpi-label">${lbl.max_flocks}</div><div class="kpi-value">${tierInfo.maxFlocks === Infinity ? '\u221E' : tierInfo.maxFlocks}</div></div>
    <div class="kpi-card"><div class="kpi-label">${lbl.included_users}</div><div class="kpi-value">${tierInfo.includedUsers === Infinity ? '\u221E' : tierInfo.includedUsers}</div></div>
    <div class="kpi-card"><div class="kpi-label">${lbl.extra_cost}</div><div class="kpi-value">$${tierInfo.extraUserCost}</div></div>
    <div class="kpi-card"><div class="kpi-label">${lbl.billing}</div><div class="kpi-value">${plan.billingCycle || 'monthly'}</div></div>
    </div>
    <div style="margin-top:12px;text-align:right"><button class="btn btn-sm" data-action="upgrade-plan">${lbl.upgrade_plan}</button></div>
    </div>`;

    // KPI Row: Users + Activation + Churn + Revenue
    h += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:16px">`;

    // User KPIs
    h += `<div class="card"><h3>${lbl.user_kpis}</h3>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.total_users}</div><div class="kpi-value">${users.length}</div></div>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.active_users}</div><div class="kpi-value" style="color:#4caf50">${activeUsers.length}</div></div>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.inactive_users}</div><div class="kpi-value" style="color:#f44336">${inactiveUsers.length}</div></div>
    <div style="margin-top:8px;font-size:0.85rem;color:var(--text-muted)"><strong>${lbl.by_role}:</strong> ${Object.entries(roleCounts).map(([r, c]) => `${r}: ${c}`).join(' \u00B7 ') || '\u2014'}</div>
    </div>`;

    // Activation KPIs
    h += `<div class="card"><h3>${lbl.activation_kpis}</h3>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.activation_rate}</div><div class="kpi-value">${activationRate}%</div></div>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.avg_time_activate}</div><div class="kpi-value">${avgActivationDays} ${lbl.days}</div></div>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.pending_activations}</div><div class="kpi-value" style="color:${pending.length ? '#ff9800' : '#4caf50'}">${pending.length}</div></div>
    </div>`;

    // Churn KPIs
    h += `<div class="card"><h3>${lbl.churn_kpis}</h3>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.monthly_churn}</div><div class="kpi-value" style="color:${churnRate > 10 ? '#f44336' : churnRate > 5 ? '#ff9800' : '#4caf50'}">${churnRate}%</div></div>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.retention}</div><div class="kpi-value" style="color:${retention >= 90 ? '#4caf50' : '#ff9800'}">${retention}%</div></div>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.deactivated_30d}</div><div class="kpi-value">${deactivated30d.length}</div></div>
    </div>`;

    // Revenue KPIs
    h += `<div class="card"><h3>${lbl.revenue_kpis}</h3>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.base_revenue}</div><div class="kpi-value">$${baseRevenue.toFixed(2)}</div></div>
    <div class="kpi-card" style="margin:8px 0"><div class="kpi-label">${lbl.extra_user_revenue}</div><div class="kpi-value">$${extraRevenue.toFixed(2)} <small>(${extraUsers} extra)</small></div></div>
    <div class="kpi-card" style="margin:8px 0;border:2px solid var(--primary);border-radius:8px;padding:10px"><div class="kpi-label">${lbl.total_mrr}</div><div class="kpi-value" style="font-size:1.4rem;color:var(--primary)">$${totalMRR.toFixed(2)}</div></div>
    </div>`;

    h += `</div>`;

    // User Table with Add/Delete buttons
    h += `<div class="card" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <h3 style="margin:0">${lbl.user_table}</h3>
    <button class="btn btn-primary btn-sm" data-action="add-user" style="font-size:0.85rem">${lbl.add_user}</button>
    </div>`;

    if (users.length === 0) {
      h += `<p style="color:var(--text-muted);text-align:center;padding:24px">${lbl.no_users}</p>`;
    } else {
      h += `<div style="overflow-x:auto"><table class="data-table" style="width:100%;margin-top:12px"><thead><tr>
      <th>${lbl.name}</th><th>${lbl.email}</th><th>${lbl.role}</th><th>${lbl.status}</th><th>${lbl.since}</th><th style="min-width:180px">${lbl.actions}</th>
      </tr></thead><tbody>`;
      users.forEach(u => {
        const statusColor = u.status === 'active' ? '#4caf50' : u.status === 'pending' ? '#ff9800' : '#f44336';
        const statusText = u.status === 'active' ? lbl.active : u.status === 'pending' ? lbl.pending : lbl.inactive;
        const since = u.activatedAt || u.createdAt || '\u2014';
        const sinceStr = since !== '\u2014' ? new Date(since).toLocaleDateString() : since;
        const isOwnerSelf = u.role === 'owner' && u.id === currentUser?.id;
        const toggleBtn = u.status === 'active'
          ? `<button class="btn btn-sm" style="background:#f44336;color:#fff;font-size:0.72rem;padding:3px 8px" data-action="deactivate-user" data-id="${escapeAttr(u.id)}"${isOwnerSelf ? ' disabled title="Cannot deactivate current owner"' : ''}>${lbl.deactivate}</button>`
          : u.status === 'inactive' || u.status === 'expired' || u.status === 'deactivated'
          ? `<button class="btn btn-sm" style="background:#4caf50;color:#fff;font-size:0.72rem;padding:3px 8px" data-action="reactivate-user" data-id="${escapeAttr(u.id)}">${lbl.activate}</button>`
          : u.status === 'pending'
          ? `<button class="btn btn-sm" style="background:#ff9800;color:#fff;font-size:0.72rem;padding:3px 8px" data-action="resend-activation" data-id="${escapeAttr(u.id)}">\uD83D\uDCE7</button>` : '';
        const deleteBtn = u.status !== 'active' && !isOwnerSelf
          ? `<button class="btn btn-sm" style="background:#b71c1c;color:#fff;font-size:0.72rem;padding:3px 8px;margin-left:4px" data-action="remove-user" data-id="${escapeAttr(u.id)}" data-name="${escapeAttr(u.name)}">${lbl.delete_user}</button>` : '';
        const editBtn = `<button class="btn btn-sm" style="background:var(--primary);color:#fff;font-size:0.72rem;padding:3px 8px;margin-left:4px" data-action="edit-user" data-id="${escapeAttr(u.id)}">\u270F</button>`;
        h += `<tr>
        <td><strong>${sanitizeHTML(u.name || '\u2014')}</strong>${u.isExtra ? '<span style="font-size:0.65rem;background:var(--warning);color:#000;padding:1px 5px;border-radius:8px;margin-left:4px">EXTRA</span>' : ''}</td>
        <td>${sanitizeHTML(u.email || u.workerId || '\u2014')}</td>
        <td><span style="text-transform:capitalize">${u.role || '\u2014'}</span></td>
        <td><span style="color:${statusColor};font-weight:600">${statusText}</span></td>
        <td>${sinceStr}</td>
        <td style="white-space:nowrap">${toggleBtn}${editBtn}${deleteBtn}</td>
        </tr>`;
      });
      h += `</tbody></table></div>`;
    }
    h += `</div>`;

    // Billing & Payments (self-managed)
    const billingCycle = plan.billingCycle || 'monthly';
    const nextBilling = _getNextBillingDate(billingCycle);
    const extraUsersActive = activeUsers.filter(u => u.isExtra);
    const totalExtraCharge = Math.round(extraUsersActive.length * tierInfo.extraUserCost * 100) / 100;
    const totalMonthlyCharge = Math.round((tierInfo.baseCost + totalExtraCharge) * 100) / 100;

    h += `<div class="card" style="margin-bottom:16px"><h3>${lbl.billing_title}</h3>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-top:12px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
    <div><div style="font-size:0.75rem;color:var(--text-muted)">${lbl.billing_next}</div><div style="font-weight:700;font-size:1.1rem">${nextBilling}</div></div>
    <div><div style="font-size:0.75rem;color:var(--text-muted)">${lbl.billing_cycle}</div><div style="font-weight:700;font-size:1.1rem;text-transform:capitalize">${billingCycle}</div></div>
    <div><div style="font-size:0.75rem;color:var(--text-muted)">${lbl.billing_base}</div><div style="font-weight:700;font-size:1.1rem">$${tierInfo.baseCost.toFixed(2)}</div></div>
    <div><div style="font-size:0.75rem;color:var(--text-muted)">${lbl.billing_extra} (${extraUsersActive.length})</div><div style="font-weight:700;font-size:1.1rem">$${totalExtraCharge.toFixed(2)}</div></div>
    <div style="border:2px solid var(--primary);border-radius:8px;padding:8px"><div style="font-size:0.75rem;color:var(--text-muted)">${lbl.billing_total}</div><div style="font-weight:900;font-size:1.3rem;color:var(--primary)">$${totalMonthlyCharge.toFixed(2)}</div></div>
    </div></div>`;

    // Payment Ledger
    const ledger = [];
    users.forEach(u => {
      if (u.firstCharge && u.activatedAt) { ledger.push({ date: u.activatedAt, type: 'charge', desc: lbl.billing_activation_charge + ': ' + u.name + (u.isExtra ? ' (extra)' : ''), amount: u.firstCharge }); }
      if (u.deactivatedAt && u.isExtra) { ledger.push({ date: u.deactivatedAt, type: 'credit', desc: lbl.billing_deactivation_credit + ': ' + u.name, amount: Math.round(tierInfo.extraUserCost * 0.3 * 100) / 100 }); }
    });
    const months = new Set();
    D.kpiSnapshots?.forEach(k => { if (k.date) months.add(k.date.substring(0, 7)); });
    months.forEach(m => {
      const activeInMonth = users.filter(u => u.activatedAt && u.activatedAt.substring(0, 7) <= m && (!u.deactivatedAt || u.deactivatedAt.substring(0, 7) >= m));
      const extraInMonth = Math.max(0, activeInMonth.length - tierInfo.includedUsers);
      ledger.push({ date: m + '-01', type: 'charge', desc: lbl.billing_monthly + ' \u2014 ' + tierInfo.name + ' + ' + extraInMonth + ' extra', amount: Math.round((tierInfo.baseCost + extraInMonth * tierInfo.extraUserCost) * 100) / 100 });
    });
    ledger.sort((a, b) => b.date.localeCompare(a.date));

    if (ledger.length > 0) {
      h += `<div style="margin-top:12px"><h4 style="font-size:0.9rem;margin-bottom:8px">${lbl.billing_ledger}</h4>
      <div style="overflow-x:auto;max-height:250px;overflow-y:auto"><table class="data-table" style="width:100%;font-size:0.85rem"><thead><tr>
      <th>${lbl.date || 'Fecha'}</th><th>${lbl.billing_type}</th><th>${lbl.billing_desc}</th><th style="text-align:right">${lbl.billing_amount}</th>
      </tr></thead><tbody>`;
      ledger.slice(0, 30).forEach(l => {
        const color = l.type === 'charge' ? '#f44336' : '#4caf50';
        const sign = l.type === 'charge' ? '-' : '+';
        h += `<tr><td style="white-space:nowrap">${l.date}</td><td style="color:${color};font-weight:600;text-transform:capitalize">${l.type}</td>
        <td>${sanitizeHTML(l.desc)}</td><td style="text-align:right;font-weight:600;color:${color}">${sign}$${l.amount.toFixed(2)}</td></tr>`;
      });
      h += `</tbody></table></div></div>`;
    }
    h += `<div style="margin-top:12px;padding:10px;background:rgba(76,175,80,.08);border-radius:var(--radius);font-size:0.8rem;color:var(--text-muted)">${lbl.billing_auto_note}</div></div>`;

    // Recent Audit Activity
    h += `<div class="card"><h3>${lbl.audit_recent}</h3>`;
    const recentAudit = audit.slice(-20).reverse();
    if (recentAudit.length === 0) {
      h += `<p style="color:var(--text-muted);text-align:center;padding:24px">${lbl.no_audit}</p>`;
    } else {
      h += `<div style="overflow-x:auto"><table class="data-table" style="width:100%;margin-top:12px"><thead><tr>
      <th>${lbl.date}</th><th>${lbl.name}</th><th>${lbl.actions}</th><th>${lbl.role}</th><th>${lbl.billing_desc}</th>
      </tr></thead><tbody>`;
      recentAudit.forEach(a => {
        const ts = a.ts ? new Date(a.ts).toLocaleString() : '\u2014';
        h += `<tr>
        <td style="white-space:nowrap;font-size:0.8rem">${ts}</td>
        <td>${sanitizeHTML(a.user || '\u2014')}</td>
        <td>${sanitizeHTML(a.action || '\u2014')}</td>
        <td>${sanitizeHTML(a.module || '\u2014')}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sanitizeHTML(a.detail || '\u2014')}</td>
        </tr>`;
      });
      h += `</tbody></table></div>`;
    }
    h += `</div>`;

    this.shadowRoot.innerHTML = h;
    this._bindEvents();
  }

  // ── Styles ─────────────────────────────────────────────────

  _baseStyle() {
    return `<style>
      :host { display: block; }
      .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
      .page-header h2 { margin: 0; color: var(--primary-dark, #0E2240); }
      .kpi-card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .kpi-label { font-size: 12px; color: var(--text-light, #888); text-transform: uppercase; }
      .kpi-value { font-size: 24px; font-weight: 700; color: var(--text, #333); }
      .btn { padding: 8px 16px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); background: var(--bg, #fff); cursor: pointer; font-size: 14px; font-weight: 500; }
      .btn-sm { padding: 4px 10px; font-size: 12px; }
      .btn-primary { background: var(--primary, #1A3C6E); color: #fff; border: none; }
      .btn-secondary { background: var(--bg-secondary, #f5f5f5); }
      .btn-danger { background: var(--danger, #dc3545); color: #fff; border: none; }
      .btn:hover { opacity: 0.85; }
      .card { background: var(--bg, #fff); border-radius: var(--radius, 8px); padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
      .card h3 { margin: 0 0 12px; color: var(--primary-dark, #0E2240); }
      .data-table { border-collapse: collapse; font-size: 14px; }
      .data-table th, .data-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border, #e0e0e0); }
      .data-table th { font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-light, #888); background: var(--bg-secondary, #f9f9f9); position: sticky; top: 0; }
      .data-table tr:hover { background: var(--bg-secondary, #f9f9f9); }
      .form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
      .form-group { flex: 1; min-width: 180px; }
      .form-group label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
      .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px; border: 1px solid var(--border, #e0e0e0); border-radius: var(--radius, 8px); font-size: 14px; box-sizing: border-box; }
      .modal-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border, #e0e0e0); }
    </style>`;
  }

  // ── Event binding ──────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id || '';
      const name = btn.dataset.name || '';

      switch (action) {
        case 'upgrade-plan':
          this._showUpgradeModal();
          break;
        case 'add-user':
          this._showUserForm(null);
          break;
        case 'edit-user':
          this._showUserForm(id);
          break;
        case 'deactivate-user':
          this._deactivateUser(id);
          break;
        case 'reactivate-user':
          this._reactivateUser(id);
          break;
        case 'resend-activation':
          this._resendActivation(id);
          break;
        case 'remove-user':
          this._removeUser(id, name);
          break;
        case 'choose-plan':
          this._startSubscription(btn.dataset.plan, btn.dataset.interval);
          break;
        case 'billing-portal':
          this._openBillingPortal();
          break;
        case 'toggle-billing-interval':
          this._toggleBillingInterval(btn.dataset.show);
          break;
      }
    });
  }

  // ── Modal action handler ───────────────────────────────────

  _onModalAction(e) {
    if (e.action === 'save-user') {
      this._saveUser(e.editId || '');
    } else if (e.action === 'toggle-email-field') {
      this._toggleEmailField();
    } else if (e.action === 'verify-owner-activation') {
      this._verifyOwnerForActivation();
    } else if (e.action === 'confirm-activation') {
      this._confirmUserActivation(e.token);
    } else if (e.action === 'execute-deactivation') {
      this._executeDeactivation(e.userId);
    }
  }

  // ── User form (add/edit) ───────────────────────────────────

  _showUserForm(id) {
    const D = Store.get();
    const lbl = _lbl();
    const u = id ? D.users.find(x => x.id === id) : null;
    const isEs = (document.documentElement.lang || 'es').startsWith('es');
    const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
    const activeCount = D.users.filter(x => x.status === 'active').length;
    const isExtraUser = !id && activeCount >= plan.includedUsers;
    const billingNotice = isExtraUser ? `<div style="background:rgba(255,152,0,.1);border:1px solid var(--warning);border-radius:var(--radius);padding:10px;margin-bottom:12px;font-size:12px">
    <strong>'!' + ${lbl.extra_user_notice || 'Extra user'}</strong>${lbl.proportional_charge || 'Proportional charge from activation date to end of billing cycle'} (${plan.billingCycle}).</div>` : '';
    const editRole = u ? u.role : 'worker';

    const body = `${billingNotice}
    <div class="form-row"><div class="form-group"><label>${lbl.name}</label><input id="usr-name" value="${u ? escapeAttr(u.name) : ''}"></div>
    <div class="form-group"><label>${lbl.role || 'Role'}</label><select id="usr-role" onchange="this.getRootNode().host._toggleEmailFieldInModal()">
    <option value="owner"${editRole === 'owner' ? ' selected' : ''}>Owner</option>
    <option value="manager"${editRole === 'manager' ? ' selected' : ''}>Manager</option>
    <option value="worker"${editRole === 'worker' ? ' selected' : ''}>Worker</option>
    <option value="vet"${editRole === 'vet' ? ' selected' : ''}>Vet</option></select></div></div>
    <div class="form-row" id="email-row" style="${editRole === 'worker' ? 'display:none' : ''}">
    <div class="form-group"><label>Email ${editRole === 'worker' ? (lbl.email_optional || '(optional)') : (lbl.email_required_label || '*')}</label><input type="email" id="usr-email" value="${u ? escapeAttr(u.email || '') : ''}" placeholder="user@email.com"></div></div>
    <div class="form-row" id="worker-id-row" style="${editRole === 'worker' ? '' : 'display:none'}">
    <div class="form-group"><label>${lbl.worker_id || 'Worker ID'}</label><input id="usr-worker-id" value="${u ? escapeAttr(u.workerId || '') : ''}" placeholder="Ej: OP-001"></div></div>
    <div class="form-row"><div class="form-group"><label>${lbl.pin_label || 'PIN'} (4 ${lbl.days ? 'digits' : 'digits'})${u && u.pinHash ? ' \u2014 ' + (isEs ? 'dejar vacio para mantener actual' : 'leave empty to keep current') : ''}</label><input type="password" id="usr-pin" maxlength="4" pattern="[0-9]{4}" value="" placeholder="${u && u.pinHash ? '****' : '0000'}" inputmode="numeric"></div></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="this.getRootNode().host._closeModalViaHost()">${lbl.cancel}</button>
    <button class="btn btn-primary" onclick="this.getRootNode().host._saveUser('${id || ''}')">${lbl.save}</button></div>`;

    Bus.emit('modal:open', { title: u ? (lbl.edit || 'Edit') : (lbl.add_user || 'Add User'), body });
  }

  _toggleEmailFieldInModal() {
    const body = document.querySelector('egg-modal')?.shadowRoot || document;
    const role = body.querySelector('#usr-role')?.value;
    const emailRow = body.querySelector('#email-row');
    const workerRow = body.querySelector('#worker-id-row');
    const emailLabel = emailRow?.querySelector('label');
    if (role === 'worker') {
      if (emailRow) emailRow.style.display = 'none';
      if (workerRow) workerRow.style.display = '';
    } else {
      if (emailRow) emailRow.style.display = '';
      if (workerRow) workerRow.style.display = 'none';
      if (emailLabel) emailLabel.textContent = 'Email *';
    }
  }

  _closeModalViaHost() {
    Bus.emit('modal:close');
  }

  _getModalEl(id) {
    // Look for element in modal shadow DOM or main document
    const modal = document.querySelector('egg-modal');
    if (modal?.shadowRoot) {
      const el = modal.shadowRoot.querySelector('#' + id);
      if (el) return el;
    }
    return document.getElementById(id);
  }

  async _saveUser(id) {
    const D = Store.get();
    const lbl = _lbl();
    const rawPin = this._getModalEl('usr-pin')?.value || '';
    const o = {
      name: (this._getModalEl('usr-name')?.value || '').trim(),
      role: this._getModalEl('usr-role')?.value || 'worker',
      email: (this._getModalEl('usr-email')?.value || '').trim()
    };

    if (o.role === 'worker') {
      o.workerId = (this._getModalEl('usr-worker-id')?.value || '').trim();
      o.email = o.email || '';
    }

    if (!o.name) { Bus.emit('toast', { msg: lbl.required || 'Required', type: 'error' }); return; }
    if (o.role !== 'worker' && (!o.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email))) {
      Bus.emit('toast', { msg: (lbl.email_required || 'Valid email required for') + ' ' + o.role, type: 'error' }); return;
    }
    if (o.role === 'worker' && !o.workerId) {
      Bus.emit('toast', { msg: lbl.worker_id_required || 'Worker ID required', type: 'error' }); return;
    }
    if (rawPin && (rawPin.length !== 4 || !/^\d{4}$/.test(rawPin))) {
      Bus.emit('toast', { msg: lbl.pin_4_digits || 'PIN must be 4 numeric digits', type: 'error' }); return;
    }

    // Hash PIN if provided
    if (rawPin) {
      const { hash, salt } = await hashPin(rawPin);
      o.pinHash = hash;
      o.pinSalt = salt;
    }

    if (id) {
      const i = D.users.findIndex(u => u.id === id);
      if (i >= 0) {
        logAudit('update', 'users', 'Edit user: ' + o.name, D.users[i], { ...o, pinHash: '[hashed]' });
        D.users[i] = { ...D.users[i], ...o };
        if (o.pinHash) delete D.users[i].pin;
      }
      Store.save(D);
      Bus.emit('modal:close');
      Bus.emit('toast', { msg: lbl.user_toggled || 'User updated' });
      this.render();
    } else {
      // New user: trigger 4-layer activation flow
      Bus.emit('modal:close');
      this._requestUserActivation(o, D);
    }
  }

  // ── LAYER 1: Owner PIN re-authentication ───────────────────

  _requestUserActivation(newUser, D) {
    const currentUser = getCurrentUser();
    const lbl = _lbl();
    if (currentUser.role !== 'owner') {
      Bus.emit('toast', { msg: lbl.only_owner || 'Only the owner can add users', type: 'error' }); return;
    }
    this._pendingActivation = newUser;

    const body = `
    <p style="color:var(--text-light);font-size:13px;margin-bottom:16px">${lbl.security_desc || 'Owner verification required to add a new user.'}</p>
    <div style="text-align:center;margin-bottom:16px">
    <div style="font-size:13px;margin-bottom:8px"><strong>${newUser.name}</strong> (${newUser.role})</div>
    <div style="font-size:12px;color:var(--text-light)">${newUser.email || newUser.workerId || ''}</div>
    </div>
    <div class="form-group" style="max-width:200px;margin:0 auto">
    <label>${lbl.owner_pin || 'Owner PIN'}</label>
    <input type="password" id="auth-owner-pin" maxlength="4" pattern="[0-9]{4}" placeholder="\u2022\u2022\u2022\u2022" inputmode="numeric" style="text-align:center;font-size:20px;letter-spacing:8px">
    <p id="auth-pin-error" style="color:var(--danger);font-size:11px;margin-top:4px;display:none"></p>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="this.getRootNode().host._closeModalViaHost()">${lbl.cancel}</button>
    <button class="btn btn-primary" onclick="this.getRootNode().host._verifyOwnerForActivation()">${lbl.verify_send || 'Verify and Send Confirmation'}</button></div>`;

    Bus.emit('modal:open', { title: lbl.security_check || 'Security Verification', body });
  }

  async _verifyOwnerForActivation() {
    const D = Store.get();
    const lbl = _lbl();
    const currentUser = getCurrentUser();
    const errEl = this._getModalEl('auth-pin-error');

    if (isPinLocked()) {
      if (errEl) { errEl.textContent = lbl.too_many_attempts || 'Too many attempts.'; errEl.style.display = 'block'; }
      return;
    }

    const pin = this._getModalEl('auth-owner-pin')?.value || '';
    const owner = D.users.find(u => u.id === currentUser.id);
    if (!owner) { Bus.emit('toast', { msg: lbl.user_not_found || 'User not found', type: 'error' }); return; }

    // Migrate owner PIN if still plaintext
    let migrated = await migratePinIfNeeded(owner);
    if (migrated) Store.save(D);

    // Verify owner PIN
    if (owner.pinHash) {
      const match = await verifyPinHash(pin, owner.pinHash, owner.pinSalt);
      if (!match) {
        recordPinFailure();
        if (isPinLocked()) {
          if (errEl) { errEl.textContent = lbl.too_many_attempts || 'Too many attempts.'; errEl.style.display = 'block'; }
        } else {
          if (errEl) { errEl.textContent = lbl.incorrect_pin || 'Incorrect PIN'; errEl.style.display = 'block'; }
        }
        const pinEl = this._getModalEl('auth-owner-pin');
        if (pinEl) { pinEl.value = ''; pinEl.focus(); }
        logAudit('auth_fail', 'users', 'Owner PIN verification failed for new user activation', null, { attemptedFor: this._pendingActivation?.name });
        return;
      }
    }

    resetPinAttempts();
    logAudit('auth_success', 'users', 'Owner PIN verified for activation: ' + this._pendingActivation?.name, null, { owner: currentUser.name });
    Bus.emit('modal:close');

    const pending = this._pendingActivation;
    if (pending.role === 'worker') {
      this._activateWorkerDirect(pending);
    } else {
      this._sendActivationConfirmation(pending, D);
    }
  }

  // ── Direct worker activation ───────────────────────────────

  _activateWorkerDirect(newUser) {
    const D = Store.get();
    const lbl = _lbl();
    const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
    const activeCount = D.users.filter(x => x.status === 'active').length;
    const isExtra = activeCount >= plan.includedUsers;
    const now = new Date();
    const currentUser = getCurrentUser();
    let userObj;

    if (newUser._reactivateId) {
      userObj = D.users.find(u => u.id === newUser._reactivateId);
      if (!userObj) { Bus.emit('toast', { msg: lbl.user_not_found || 'User not found', type: 'error' }); return; }
    } else {
      userObj = { id: genId(), name: newUser.name, role: 'worker', pinHash: newUser.pinHash, pinSalt: newUser.pinSalt, workerId: newUser.workerId, email: newUser.email || '', created: todayStr() };
      D.users.push(userObj);
    }

    userObj.status = 'active';
    userObj.activatedAt = now.toISOString().split('T')[0];
    userObj.billingStart = now.toISOString();
    userObj.isExtra = isExtra;
    userObj.confirmedBy = currentUser.name;
    userObj.confirmedAt = now.toISOString();

    if (isExtra) {
      const daysInCycle = plan.billingCycle === 'monthly' ? 30 : plan.billingCycle === 'quarterly' ? 90 : 365;
      const remainingDays = daysInCycle - now.getDate() + 1;
      userObj.firstCharge = Math.round((plan.extraUserCost / daysInCycle) * remainingDays * 100) / 100;
      userObj.nextBillingDate = _getNextBillingDate(plan.billingCycle);
    }

    logAudit('activation_direct', 'users', 'Worker activated directly: ' + userObj.name + ' (' + userObj.workerId + ')', null, { user: userObj.name, workerId: userObj.workerId, isExtra, confirmedBy: currentUser.name });
    Store.save(D);
    Bus.emit('toast', { msg: userObj.name + ' (' + userObj.workerId + ') ' + (lbl.activated_msg || 'activated') });
    this._pendingActivation = null;
    this.render();
  }

  // ── LAYER 2: Email confirmation ────────────────────────────

  _sendActivationConfirmation(newUser, D) {
    if (!D) D = Store.get();
    const lbl = _lbl();
    const currentUser = getCurrentUser();
    const token = genId() + '-' + Date.now().toString(36);
    const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
    const activeCount = D.users.filter(x => x.status === 'active').length;
    const isExtra = activeCount >= plan.includedUsers;
    let userObj;

    if (newUser._reactivateId) {
      userObj = D.users.find(u => u.id === newUser._reactivateId);
      if (userObj) {
        userObj.status = 'pending'; userObj.activationToken = token;
        userObj.requestedBy = currentUser.name; userObj.requestedAt = new Date().toISOString();
        userObj.isExtra = isExtra; userObj.billingStart = null;
      } else { Bus.emit('toast', { msg: lbl.user_not_found || 'User not found', type: 'error' }); return; }
    } else {
      userObj = {
        id: genId(), name: newUser.name, email: newUser.email, role: newUser.role,
        pinHash: newUser.pinHash, pinSalt: newUser.pinSalt,
        status: 'pending', created: todayStr(), activationToken: token,
        requestedBy: currentUser.name, requestedAt: new Date().toISOString(),
        isExtra: isExtra, billingStart: null, activatedAt: null
      };
      D.users.push(userObj);
    }

    if (!D.pendingActivations) D.pendingActivations = [];
    D.pendingActivations.push({ token, userId: userObj.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    logAudit('create', 'users', 'User created (pending): ' + newUser.name + ' \u2014 awaiting email confirmation', null, { user: userObj.name, role: userObj.role, email: userObj.email, isExtra });
    Store.save(D);

    const ownerEmail = D.settings.ownerEmail || currentUser.email || 'owner@email.com';
    const costLine = isExtra
      ? `<br><span style="color:var(--warning)">${lbl.extra_cost_notice || 'Extra cost'}: ${plan.currency} ${plan.extraUserCost.toFixed(2)}/${plan.billingCycle}</span>`
      : `<br><span style="color:var(--success)">${lbl.included_in_plan || 'Included in plan'}</span>`;

    const body = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px">
    <div style="font-size:11px;color:var(--text-light);margin-bottom:8px">${lbl.confirm_email_subject || 'EMAIL CONFIRMATION'}</div>
    <div style="font-size:13px"><strong>To:</strong> ${sanitizeHTML(ownerEmail)}</div>
    <div style="font-size:13px"><strong>Subject:</strong> ${lbl.confirm_email_subject || 'EGGlogU -- Confirm user activation'}</div>
    <hr style="border:none;border-top:1px solid var(--border);margin:12px 0">
    <div style="background:var(--card);border-radius:var(--radius);padding:12px;margin:8px 0">
    <div><strong>${sanitizeHTML(newUser.name)}</strong>${newUser.role}</div>
    <div style="font-size:12px;color:var(--text-light)">${sanitizeHTML(newUser.email)}</div>
    ${costLine}
    </div>
    <p style="font-size:12px;color:var(--text-light)">${lbl.requested_by || 'Requested by'}: ${sanitizeHTML(currentUser.name)} \u2014 ${new Date().toLocaleString()}</p>
    <p style="font-size:12px;color:var(--text-light)">${lbl.confirmation_token || 'Token'}: <code style="font-size:11px">${token.substring(0, 8)}...</code></p>
    </div>
    <div style="text-align:center;margin-bottom:12px">
    <button class="btn btn-primary" onclick="this.getRootNode().host._confirmUserActivation('${token}')" style="padding:10px 24px">${lbl.confirm_activation || 'Confirm Activation'}</button>
    </div>
    <p style="font-size:11px;color:var(--text-light);text-align:center">${lbl.expires_24h || 'This link expires in 24 hours.'}</p>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="this.getRootNode().host._closeModalViaHost();this.getRootNode().host.render()">${lbl.close_later || 'Close (confirm later)'}</button></div>`;

    Bus.emit('modal:open', { title: lbl.confirm_sent || 'Confirmation Sent', body });
    this._pendingActivation = null;
  }

  // ── LAYER 2b: Confirm activation ──────────────────────────

  _confirmUserActivation(token) {
    const D = Store.get();
    const lbl = _lbl();
    const currentUser = getCurrentUser();
    const pending = D.pendingActivations?.find(p => p.token === token);
    if (!pending) { Bus.emit('toast', { msg: lbl.token_invalid || 'Invalid token', type: 'error' }); return; }
    if (new Date(pending.expiresAt) < new Date()) {
      Bus.emit('toast', { msg: lbl.token_expired || 'Token expired', type: 'error' });
      logAudit('activation_expired', 'users', 'Activation token expired', null, { token: token.substring(0, 8) });
      return;
    }
    const user = D.users.find(u => u.id === pending.userId);
    if (!user) { Bus.emit('toast', { msg: lbl.user_not_found || 'User not found', type: 'error' }); return; }

    // LAYER 3: Activate with proportional billing
    const now = new Date();
    user.status = 'active';
    user.activatedAt = now.toISOString().split('T')[0];
    user.billingStart = now.toISOString();
    user.activationToken = null;
    user.confirmedBy = currentUser.name;
    user.confirmedAt = now.toISOString();

    if (user.isExtra) {
      const plan = D.settings.plan || { includedUsers: 3, extraUserCost: 5, billingCycle: 'monthly', currency: 'USD' };
      const daysInCycle = plan.billingCycle === 'monthly' ? 30 : plan.billingCycle === 'quarterly' ? 90 : 365;
      const dayOfCycle = now.getDate();
      const remainingDays = daysInCycle - dayOfCycle + 1;
      const proportionalCost = (plan.extraUserCost / daysInCycle) * remainingDays;
      user.firstCharge = Math.round(proportionalCost * 100) / 100;
      user.nextBillingDate = _getNextBillingDate(plan.billingCycle);
      logAudit('billing', 'users', 'Extra user activated \u2014 proportional charge: ' + (plan.currency) + ' ' + user.firstCharge.toFixed(2) + ' for ' + remainingDays + ' remaining days', null,
        { user: user.name, charge: user.firstCharge, currency: plan.currency, remainingDays, nextBilling: user.nextBillingDate });
    }

    D.pendingActivations = D.pendingActivations.filter(p => p.token !== token);
    logAudit('activation_confirmed', 'users', 'User activated: ' + user.name + ' \u2014 confirmed by owner via email',
      { status: 'pending' }, { status: 'active', activatedAt: user.activatedAt, confirmedBy: user.confirmedBy });
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: user.name + ' ' + (lbl.activated_msg || 'activated') });
    this.render();
  }

  // ── Deactivate user (with PIN re-auth) ─────────────────────

  async _deactivateUser(id) {
    const D = Store.get();
    const lbl = _lbl();
    const u = D.users.find(x => x.id === id);
    if (!u) { Bus.emit('toast', { msg: lbl.user_not_found || 'User not found', type: 'error' }); return; }
    if (u.role === 'owner' && D.users.filter(x => x.role === 'owner' && x.status === 'active').length <= 1) {
      Bus.emit('toast', { msg: lbl.cannot_deactivate_owner || 'Cannot deactivate the last active owner', type: 'error' }); return;
    }

    const confirmMsg = (lbl.confirm_deactivate || 'Deactivate this user?') + ' ' + u.name + (u.isExtra ? ' \u2014 ' + (lbl.billing_deactivation_credit || 'credit will be applied') : '');
    if (!await showConfirm(confirmMsg)) return;

    const body = `
    <p style="font-size:13px;margin-bottom:12px">${lbl.deactivate_confirm_msg || 'Enter your PIN to confirm deactivation of'} <strong>${sanitizeHTML(u.name)}</strong>.</p>
    <div class="form-group" style="max-width:200px;margin:0 auto">
    <label>${lbl.owner_pin || 'Owner PIN'}</label>
    <input type="password" id="deact-pin" maxlength="4" inputmode="numeric" style="text-align:center;font-size:20px;letter-spacing:8px">
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="this.getRootNode().host._closeModalViaHost()">${lbl.cancel}</button>
    <button class="btn btn-danger" onclick="this.getRootNode().host._executeDeactivation('${escapeAttr(id)}')">${lbl.deactivate}</button></div>`;

    Bus.emit('modal:open', { title: lbl.confirm_deactivation || 'Confirm Deactivation', body });
  }

  async _executeDeactivation(id) {
    const lbl = _lbl();
    const currentUser = getCurrentUser();
    if (isPinLocked()) {
      Bus.emit('toast', { msg: lbl.too_many_attempts || 'Too many attempts.', type: 'error' }); return;
    }
    const D = Store.get();
    const pin = this._getModalEl('deact-pin')?.value || '';
    const owner = D.users.find(u => u.id === currentUser.id);

    let migrated = await migratePinIfNeeded(owner);
    if (migrated) Store.save(D);

    if (owner?.pinHash) {
      const match = await verifyPinHash(pin, owner.pinHash, owner.pinSalt);
      if (!match) {
        recordPinFailure();
        Bus.emit('toast', { msg: lbl.incorrect_pin || 'Incorrect PIN', type: 'error' });
        const pinEl = this._getModalEl('deact-pin');
        if (pinEl) pinEl.value = '';
        return;
      }
      resetPinAttempts();
    }

    const u = D.users.find(x => x.id === id);
    if (!u) return;
    const before = { status: u.status, activatedAt: u.activatedAt };
    u.status = 'inactive';
    u.deactivatedAt = new Date().toISOString().split('T')[0];
    u.deactivatedBy = currentUser.name;
    logAudit('deactivation', 'users', 'User deactivated: ' + u.name + ' by ' + currentUser.name, before, { status: 'inactive', deactivatedAt: u.deactivatedAt });
    Store.save(D);
    Bus.emit('modal:close');
    Bus.emit('toast', { msg: u.name + ' ' + (lbl.deactivated_msg || 'deactivated') });
    this.render();
  }

  // ── Reactivate user ────────────────────────────────────────

  _reactivateUser(id) {
    const D = Store.get();
    const lbl = _lbl();
    const u = D.users.find(x => x.id === id);
    if (!u) { Bus.emit('toast', { msg: lbl.user_not_found || 'User not found', type: 'error' }); return; }
    const currentUser = getCurrentUser();
    if (currentUser.role !== 'owner') {
      Bus.emit('toast', { msg: lbl.only_owner_reactivate || 'Only the owner can reactivate users', type: 'error' }); return;
    }
    this._requestUserActivation({ name: u.name, email: u.email, role: u.role, pinHash: u.pinHash, pinSalt: u.pinSalt, _reactivateId: id }, D);
  }

  // ── Resend activation ──────────────────────────────────────

  _resendActivation(id) {
    const D = Store.get();
    const lbl = _lbl();
    const u = D.users.find(x => x.id === id);
    if (!u || u.status !== 'pending') {
      Bus.emit('toast', { msg: lbl.not_pending || 'User is not pending', type: 'error' }); return;
    }
    if (D.pendingActivations) D.pendingActivations = D.pendingActivations.filter(p => p.userId !== id);
    const token = genId() + '-' + Date.now().toString(36);
    u.activationToken = token;
    if (!D.pendingActivations) D.pendingActivations = [];
    D.pendingActivations.push({ token, userId: id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    logAudit('resend_activation', 'users', 'Resent activation for: ' + u.name, null, { newToken: token.substring(0, 8) });
    Store.save(D);
    this._sendActivationConfirmation({ name: u.name, email: u.email, role: u.role }, D);
  }

  // ── Remove user permanently ────────────────────────────────

  async _removeUser(id, name) {
    const D = Store.get();
    const lbl = _lbl();
    const u = D.users.find(x => x.id === id);
    if (!u) return;
    if (u.status === 'active') {
      Bus.emit('toast', { msg: lbl.deactivate_before_delete || 'Deactivate the user before deleting', type: 'error' }); return;
    }
    const msg = (lbl.delete_confirm || 'Permanently delete {name}?').replace('{name}', u.name);
    if (!await showConfirm(msg)) return;
    logAudit('delete', 'users', 'Permanently removed user: ' + u.name, u, null);
    D.users = D.users.filter(x => x.id !== id);
    if (D.pendingActivations) D.pendingActivations = D.pendingActivations.filter(p => p.userId !== id);
    Store.save(D);
    Bus.emit('toast', { msg: u.name + ' ' + (lbl.eliminated_msg || 'deleted') });
    this.render();
  }

  // ── Billing cycle deactivation check ───────────────────────

  _checkBillingCycleDeactivations() {
    const D = Store.get();
    const today = todayStr();
    let changed = false;

    D.users.forEach(u => {
      if (u.status === 'active' && u.isExtra && u.nextBillingDate && u.nextBillingDate <= today) {
        u.status = 'inactive';
        u.deactivatedAt = today;
        u.deactivatedBy = 'system_billing';
        logAudit('auto_deactivation', 'users', 'Auto-deactivated at billing cycle end: ' + u.name, { status: 'active' }, { status: 'inactive', reason: 'billing_cycle_end' });
        changed = true;
      }
    });

    if (D.pendingActivations) {
      const before = D.pendingActivations.length;
      D.pendingActivations = D.pendingActivations.filter(p => new Date(p.expiresAt) > new Date());
      if (D.pendingActivations.length < before) {
        D.users.forEach(u => {
          if (u.status === 'pending' && u.activationToken) {
            const still = D.pendingActivations.find(p => p.userId === u.id);
            if (!still) { u.status = 'expired'; logAudit('activation_expired', 'users', 'Pending activation expired: ' + u.name, null, null); changed = true; }
          }
        });
      }
    }

    if (changed) Store.save(D);
  }

  // ── Upgrade plan modal ─────────────────────────────────────

  _showUpgradeModal() {
    const currentUser = getCurrentUser();
    const lbl = _lbl();
    if (currentUser && !['owner', 'manager', 'superadmin'].includes(currentUser.role)) {
      Bus.emit('toast', { msg: t('billing_no_permission') || 'No permission', type: 'error' }); return;
    }
    const D = Store.get();
    const plan = D.settings.plan || {};
    const lang = document.documentElement.lang || 'es';
    const isEs = lang.startsWith('es');
    const isSuperadmin = currentUser && currentUser.role === 'superadmin';
    const isPaying = isSuperadmin || (plan.status === 'active' && !plan.is_trial);
    const currentTier = isSuperadmin ? 'enterprise' : (plan.tier || '');

    const tiers = [
      { id: 'hobby', name: 'Hobby', mo: 0, yr: 0, farms: '1', flocks: '3', users: '2', free: true,
        feat: isEs ? ['Panel de control', 'Produccion basica', 'Alimentacion'] : ['Dashboard', 'Basic production', 'Feed tracking'],
        sla: isEs ? 'Solo FAQ' : 'FAQ only' },
      { id: 'starter', name: 'Starter', mo: 49, yr: 490, farms: '3', flocks: '10', users: '5',
        feat: isEs ? ['Todo en Hobby +', 'Sanidad', 'Clientes', 'Finanzas', 'Ambiental'] : ['Everything in Hobby +', 'Health', 'Clients', 'Finance', 'Environment'],
        sla: isEs ? 'Soporte 48h' : '48h support' },
      { id: 'pro', name: 'Pro', mo: 99, yr: 990, farms: '10', flocks: isEs ? 'Ilimitados' : 'Unlimited', users: '15', popular: true,
        feat: isEs ? ['Todo en Starter +', 'Todos los modulos', 'AI analytics', 'Reportes avanzados'] : ['Everything in Starter +', 'All modules', 'AI analytics', 'Advanced reports'],
        sla: isEs ? 'Soporte 12h' : '12h support' },
      { id: 'enterprise', name: 'Enterprise', mo: 199, yr: 1990, farms: isEs ? 'Ilimitado' : 'Unlimited', flocks: isEs ? 'Ilimitado' : 'Unlimited', users: isEs ? 'Ilimitado' : 'Unlimited',
        promo: { mo: 75, label: isEs ? '$75/mo x 3 meses (promo lanzamiento)' : '$75/mo x 3 months (launch promo)' },
        feat: isEs ? ['Todo en Pro +', 'IoT sensores', 'Bioseguridad', 'Trazabilidad', 'API access'] : ['Everything in Pro +', 'IoT sensors', 'Biosecurity', 'Traceability', 'API access'],
        sla: isEs ? 'Soporte prioritario 4h' : 'Priority 4h SLA' }
    ];

    let body = `<div style="text-align:center;padding:16px 8px">`;

    // Monthly/Annual toggle
    body += `<div style="display:inline-flex;background:var(--bg-secondary);border-radius:8px;padding:3px;margin-bottom:20px">
    <button class="btn active upg-toggle-mo" onclick="this.classList.add('active');this.parentElement.querySelector('.upg-toggle-yr').classList.remove('active');this.closest('.upg-container').querySelectorAll('.upg-yr').forEach(e=>e.style.display='none');this.closest('.upg-container').querySelectorAll('.upg-mo').forEach(e=>e.style.display='')" style="padding:6px 18px;font-size:.9em;border-radius:6px">${lbl.monthly || 'Monthly'}</button>
    <button class="btn upg-toggle-yr" onclick="this.classList.add('active');this.parentElement.querySelector('.upg-toggle-mo').classList.remove('active');this.closest('.upg-container').querySelectorAll('.upg-mo').forEach(e=>e.style.display='none');this.closest('.upg-container').querySelectorAll('.upg-yr').forEach(e=>e.style.display='')" style="padding:6px 18px;font-size:.9em;border-radius:6px">${lbl.annual || 'Annual'}</button>
    </div>`;

    body += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">`;
    tiers.forEach(tier => {
      const yrMo = tier.yr ? Math.round(tier.yr / 12) : 0;
      const isCurrent = isPaying && currentTier === tier.id;
      const pop = tier.popular;
      const border = pop ? 'border:2px solid var(--primary);' : 'border:1px solid var(--border);';
      const highlight = isCurrent ? 'background:var(--primary-fill);' : '';

      body += `<div style="${border}${highlight}border-radius:12px;padding:16px 12px;position:relative;text-align:center">`;
      if (pop) body += `<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:2px 12px;border-radius:10px;font-size:.75em;white-space:nowrap">${lbl.most_popular || 'Most popular'}</div>`;
      if (isCurrent) body += `<div style="position:absolute;top:-10px;right:8px;background:#059669;color:#fff;padding:2px 10px;border-radius:10px;font-size:.7em">${lbl.your_plan || 'Current'}</div>`;

      body += `<div style="font-weight:700;font-size:1.05em;margin-bottom:8px">${tier.name}</div>`;

      // Monthly prices
      body += `<div class="upg-mo">`;
      if (tier.free) {
        body += `<div style="font-size:1.8em;font-weight:900;color:#059669">${isEs ? 'Gratis' : 'Free'}</div>`;
      } else if (tier.promo && !isPaying) {
        body += `<div style="font-size:1.8em;font-weight:900">$${tier.mo}<small style="font-size:.5em;font-weight:400">/mo</small></div>`;
        body += `<div style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:8px;font-size:.72em;margin-top:4px">${tier.promo.label}</div>`;
      } else {
        body += `<div style="font-size:1.8em;font-weight:900">$${tier.mo}<small style="font-size:.5em;font-weight:400">/mo</small></div>`;
      }
      body += `</div>`;

      // Annual prices
      body += `<div class="upg-yr" style="display:none">`;
      if (tier.free) {
        body += `<div style="font-size:1.8em;font-weight:900;color:#059669">${isEs ? 'Gratis' : 'Free'}</div>`;
      } else {
        body += `<div style="font-size:1.8em;font-weight:900">$${tier.yr}<small style="font-size:.5em;font-weight:400">/yr</small></div>
        <div style="font-size:.75em;color:var(--text-muted)">= $${yrMo}/mo</div>`;
      }
      body += `</div>`;

      // Features
      body += `<div style="text-align:left;font-size:.8em;margin:12px 0;line-height:1.8">`;
      body += `<div>${tier.farms} ${lbl.farms || 'farms'}</div>`;
      body += `<div>${tier.flocks} ${lbl.flocks || 'flocks'}</div>`;
      body += `<div>${tier.users} ${lbl.users || 'users'}</div>`;
      tier.feat.forEach(f => body += `<div style="color:var(--text-muted)">${f}</div>`);
      body += `<div>${tier.sla}</div>`;
      body += `</div>`;

      // CTA button
      if (isCurrent) {
        body += `<button class="btn btn-secondary" onclick="this.getRootNode().host._openBillingPortal()" style="width:100%;padding:8px;font-size:.9em">${lbl.manage || 'Manage'}</button>`;
      } else {
        body += `<button class="btn ${pop ? 'btn-primary' : 'btn-secondary'}" onclick="this.getRootNode().host._startSubscription('${tier.id}',document.querySelector('.upg-yr')&&document.querySelector('.upg-yr').style.display!=='none'?'year':'month')" style="width:100%;padding:8px;font-size:.9em">${lbl.choose_plan || 'Choose plan'}</button>`;
      }
      body += `</div>`;
    });
    body += `</div>`;

    body += `</div>`;
    Bus.emit('modal:open', { title: lbl.plans_title || 'EGGlogU Plans', body, wide: true });
  }

  // ── Start subscription (Stripe) ────────────────────────────

  async _startSubscription(plan, interval) {
    const lbl = _lbl();
    const currentUser = getCurrentUser();
    if (currentUser && !['owner', 'manager', 'superadmin'].includes(currentUser.role)) {
      Bus.emit('toast', { msg: t('billing_no_permission') || 'No permission', type: 'error' }); return;
    }
    try {
      Bus.emit('toast', { msg: lbl.redirecting || 'Redirecting to secure payment...' });
      const res = await apiService.createCheckout(plan, interval);
      if (res && res.checkout_url) {
        try {
          const u = new URL(res.checkout_url);
          if (u.hostname.endsWith('stripe.com') || u.hostname === location.hostname) {
            window.location.href = res.checkout_url;
          } else {
            Bus.emit('toast', { msg: 'Invalid checkout URL', type: 'error' });
          }
        } catch (e) { Bus.emit('toast', { msg: 'Invalid checkout URL', type: 'error' }); }
      }
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  // ── Open billing portal (Stripe) ───────────────────────────

  async _openBillingPortal() {
    const currentUser = getCurrentUser();
    if (!apiService.isLoggedIn()) return;
    if (currentUser && !['owner', 'manager', 'superadmin'].includes(currentUser.role)) {
      Bus.emit('toast', { msg: t('billing_no_permission') || 'No permission', type: 'error' }); return;
    }
    try {
      const resp = await apiService.getPortalUrl();
      if (resp && resp.url) {
        try {
          const u = new URL(resp.url);
          if (u.hostname.endsWith('stripe.com') || u.hostname.endsWith('billing.stripe.com') || u.hostname === location.hostname) {
            window.open(resp.url, '_blank');
          } else { Bus.emit('toast', { msg: 'Invalid portal URL', type: 'error' }); }
        } catch (e) { Bus.emit('toast', { msg: 'Invalid portal URL', type: 'error' }); }
      }
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }
}

customElements.define('egg-admin', EggAdmin);

export { EggAdmin, PLAN_TIERS };
