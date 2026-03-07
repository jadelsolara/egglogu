// <egg-soporte> — Support/Soporte module Web Component
// Tabs: FAQ, New Ticket, My Tickets, Contact Center (admin)
// Replaces renderSoporte() and all _render*Tab / _offline* functions from the monolith

import { Store, Bus, t, sanitizeHTML, escapeAttr, getLang, apiService, safeSetItem } from '../core/index.js';
import { getModalBody, modalVal } from './egg-modal.js';

// ── Plan tiers (support-specific constant) ──────────────────
const PLAN_TIERS = {
  hobby:      { name: 'Hobby',      baseCost: 9,  maxFlocks: 3,        includedUsers: 2,        extraUserCost: 0, modules: ['dashboard','production','feed'],                                           stripePlan: 'hobby' },
  starter:    { name: 'Starter',    baseCost: 19, maxFlocks: 10,       includedUsers: 5,        extraUserCost: 0, modules: ['dashboard','production','health','feed','clients','finance','environment'], stripePlan: 'starter' },
  pro:        { name: 'Pro',        baseCost: 49, maxFlocks: Infinity,  includedUsers: 15,       extraUserCost: 0, modules: 'all',                                                                      stripePlan: 'pro' },
  enterprise: { name: 'Enterprise', baseCost: 99, maxFlocks: Infinity,  includedUsers: Infinity, extraUserCost: 0, modules: 'all',                                                                      stripePlan: 'enterprise' }
};

// ── Ticket constants ────────────────────────────────────────
const TICKET_CATEGORIES = ['production','health','feed','iot','billing','bug','sync','feature_request','access','general'];
const TICKET_PRIORITIES = ['low','medium','high','urgent'];
const TICKET_STATUSES   = ['open','in_progress','waiting_user','resolved','closed'];

// ── Support labels (8 languages) ────────────────────────────
function _sL() {
  const _SL = {
    es: { faq_title:'Centro de Ayuda', faq_search:'Buscar articulos...', faq_helpful:'Te fue util?', faq_yes:'Si', faq_no:'No', faq_empty:'No hay articulos disponibles', faq_no_results:'Sin resultados para', tab_faq:'FAQ', tab_new_ticket:'Nuevo Ticket', tab_my_tickets:'Mis Tickets', tab_contact_center:'Contact Center', ticket_subject:'Asunto', ticket_desc:'Descripcion del problema', ticket_priority:'Prioridad', ticket_send:'Enviar Ticket', ticket_empty:'No tienes tickets', ticket_status:'Estado', ticket_created:'Creado', ticket_category:'Categoria', ticket_close:'Cerrar Ticket', ticket_rate:'Calificar', ticket_reply:'Responder', ticket_msg_placeholder:'Escribe tu mensaje...', ticket_send_msg:'Enviar', ticket_rated:'Calificado', ticket_offline:'Guardado offline — se enviara al reconectar', ticket_synced:'Tickets sincronizados', admin_total:'Total Tickets', admin_open:'Abiertos', admin_progress:'En Progreso', admin_resolved:'Resueltos', admin_avg_time:'Tiempo Promedio', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'horas', admin_filter:'Filtrar', admin_internal:'Nota interna', admin_notes:'Notas admin', admin_update:'Actualizar', admin_faq_manage:'Gestionar FAQ', pri_low:'Baja', pri_medium:'Media', pri_high:'Alta', pri_urgent:'Urgente', st_open:'Abierto', st_in_progress:'En Progreso', st_waiting_user:'Esperando Respuesta', st_resolved:'Resuelto', st_closed:'Cerrado', cat_production:'Produccion', cat_health:'Sanidad', cat_feed:'Alimento', cat_iot:'IoT', cat_billing:'Facturacion', cat_bug:'Bug', cat_sync:'Sincronizacion', cat_feature_request:'Solicitud', cat_access:'Acceso', cat_general:'General', all:'Todos', pending_offline:'tickets pendientes de envio', sync_now:'Sincronizar ahora', back:'Volver', support_label:'Soporte', you_label:'Tu', stars_select:'Selecciona estrellas', thanks_rating:'Gracias por tu calificacion', complete_fields:'Completa asunto y descripcion', ticket_created_msg:'creado', ticket_updated:'Ticket actualizado', write_msg:'Escribe un mensaje', internal_saved:'Nota interna guardada', reply_sent:'Respuesta enviada' },
    en: { faq_title:'Help Center', faq_search:'Search articles...', faq_helpful:'Was this helpful?', faq_yes:'Yes', faq_no:'No', faq_empty:'No articles available', faq_no_results:'No results for', tab_faq:'FAQ', tab_new_ticket:'New Ticket', tab_my_tickets:'My Tickets', tab_contact_center:'Contact Center', ticket_subject:'Subject', ticket_desc:'Describe the issue', ticket_priority:'Priority', ticket_send:'Submit Ticket', ticket_empty:'No tickets yet', ticket_status:'Status', ticket_created:'Created', ticket_category:'Category', ticket_close:'Close Ticket', ticket_rate:'Rate', ticket_reply:'Reply', ticket_msg_placeholder:'Type your message...', ticket_send_msg:'Send', ticket_rated:'Rated', ticket_offline:'Saved offline — will sync when online', ticket_synced:'Tickets synced', admin_total:'Total Tickets', admin_open:'Open', admin_progress:'In Progress', admin_resolved:'Resolved', admin_avg_time:'Avg Resolution', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'hours', admin_filter:'Filter', admin_internal:'Internal note', admin_notes:'Admin notes', admin_update:'Update', admin_faq_manage:'Manage FAQ', pri_low:'Low', pri_medium:'Medium', pri_high:'High', pri_urgent:'Urgent', st_open:'Open', st_in_progress:'In Progress', st_waiting_user:'Waiting Response', st_resolved:'Resolved', st_closed:'Closed', cat_production:'Production', cat_health:'Health', cat_feed:'Feed', cat_iot:'IoT', cat_billing:'Billing', cat_bug:'Bug', cat_sync:'Sync', cat_feature_request:'Feature Request', cat_access:'Access', cat_general:'General', all:'All', pending_offline:'tickets pending', sync_now:'Sync now', back:'Back', support_label:'Support', you_label:'You', stars_select:'Select stars', thanks_rating:'Thanks for your rating', complete_fields:'Complete subject and description', ticket_created_msg:'created', ticket_updated:'Ticket updated', write_msg:'Write a message', internal_saved:'Internal note saved', reply_sent:'Reply sent' },
    fr: { faq_title:'Centre d\'Aide', faq_search:'Rechercher...', faq_helpful:'Cela vous a aide?', faq_yes:'Oui', faq_no:'Non', faq_empty:'Aucun article disponible', faq_no_results:'Aucun resultat pour', tab_faq:'FAQ', tab_new_ticket:'Nouveau Ticket', tab_my_tickets:'Mes Tickets', tab_contact_center:'Contact Center', ticket_subject:'Objet', ticket_desc:'Decrivez le probleme', ticket_priority:'Priorite', ticket_send:'Envoyer le Ticket', ticket_empty:'Aucun ticket', ticket_status:'Statut', ticket_created:'Cree le', ticket_category:'Categorie', ticket_close:'Fermer le Ticket', ticket_rate:'Evaluer', ticket_reply:'Repondre', ticket_msg_placeholder:'Ecrivez votre message...', ticket_send_msg:'Envoyer', ticket_rated:'Evalue', ticket_offline:'Sauvegarde hors ligne — sera synchronise', ticket_synced:'Tickets synchronises', admin_total:'Total Tickets', admin_open:'Ouverts', admin_progress:'En Cours', admin_resolved:'Resolus', admin_avg_time:'Temps Moyen', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'heures', admin_filter:'Filtrer', admin_internal:'Note interne', admin_notes:'Notes admin', admin_update:'Mettre a jour', admin_faq_manage:'Gerer FAQ', pri_low:'Faible', pri_medium:'Moyenne', pri_high:'Haute', pri_urgent:'Urgente', st_open:'Ouvert', st_in_progress:'En Cours', st_waiting_user:'En Attente', st_resolved:'Resolu', st_closed:'Ferme', cat_production:'Production', cat_health:'Sante', cat_feed:'Alimentation', cat_iot:'IoT', cat_billing:'Facturation', cat_bug:'Bug', cat_sync:'Synchronisation', cat_feature_request:'Demande', cat_access:'Acces', cat_general:'General', all:'Tous', pending_offline:'tickets en attente', sync_now:'Synchroniser', back:'Retour', support_label:'Support', you_label:'Vous', stars_select:'Selectionnez les etoiles', thanks_rating:'Merci pour votre evaluation', complete_fields:'Completez objet et description', ticket_created_msg:'cree', ticket_updated:'Ticket mis a jour', write_msg:'Ecrivez un message', internal_saved:'Note interne enregistree', reply_sent:'Reponse envoyee' },
    pt: { faq_title:'Central de Ajuda', faq_search:'Pesquisar artigos...', faq_helpful:'Foi util?', faq_yes:'Sim', faq_no:'Nao', faq_empty:'Nenhum artigo disponivel', faq_no_results:'Sem resultados para', tab_faq:'FAQ', tab_new_ticket:'Novo Ticket', tab_my_tickets:'Meus Tickets', tab_contact_center:'Contact Center', ticket_subject:'Assunto', ticket_desc:'Descreva o problema', ticket_priority:'Prioridade', ticket_send:'Enviar Ticket', ticket_empty:'Nenhum ticket', ticket_status:'Estado', ticket_created:'Criado', ticket_category:'Categoria', ticket_close:'Fechar Ticket', ticket_rate:'Avaliar', ticket_reply:'Responder', ticket_msg_placeholder:'Digite sua mensagem...', ticket_send_msg:'Enviar', ticket_rated:'Avaliado', ticket_offline:'Salvo offline — sera sincronizado', ticket_synced:'Tickets sincronizados', admin_total:'Total Tickets', admin_open:'Abertos', admin_progress:'Em Progresso', admin_resolved:'Resolvidos', admin_avg_time:'Tempo Medio', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'horas', admin_filter:'Filtrar', admin_internal:'Nota interna', admin_notes:'Notas admin', admin_update:'Atualizar', admin_faq_manage:'Gerenciar FAQ', pri_low:'Baixa', pri_medium:'Media', pri_high:'Alta', pri_urgent:'Urgente', st_open:'Aberto', st_in_progress:'Em Progresso', st_waiting_user:'Aguardando Resposta', st_resolved:'Resolvido', st_closed:'Fechado', cat_production:'Producao', cat_health:'Saude', cat_feed:'Alimentacao', cat_iot:'IoT', cat_billing:'Faturamento', cat_bug:'Bug', cat_sync:'Sincronizacao', cat_feature_request:'Solicitacao', cat_access:'Acesso', cat_general:'Geral', all:'Todos', pending_offline:'tickets pendentes', sync_now:'Sincronizar agora', back:'Voltar', support_label:'Suporte', you_label:'Voce', stars_select:'Selecione estrelas', thanks_rating:'Obrigado pela avaliacao', complete_fields:'Complete assunto e descricao', ticket_created_msg:'criado', ticket_updated:'Ticket atualizado', write_msg:'Escreva uma mensagem', internal_saved:'Nota interna salva', reply_sent:'Resposta enviada' },
    de: { faq_title:'Hilfezentrum', faq_search:'Artikel suchen...', faq_helpful:'War das hilfreich?', faq_yes:'Ja', faq_no:'Nein', faq_empty:'Keine Artikel verfugbar', faq_no_results:'Keine Ergebnisse fur', tab_faq:'FAQ', tab_new_ticket:'Neues Ticket', tab_my_tickets:'Meine Tickets', tab_contact_center:'Contact Center', ticket_subject:'Betreff', ticket_desc:'Beschreiben Sie das Problem', ticket_priority:'Prioritat', ticket_send:'Ticket senden', ticket_empty:'Keine Tickets', ticket_status:'Status', ticket_created:'Erstellt', ticket_category:'Kategorie', ticket_close:'Ticket schliessen', ticket_rate:'Bewerten', ticket_reply:'Antworten', ticket_msg_placeholder:'Nachricht eingeben...', ticket_send_msg:'Senden', ticket_rated:'Bewertet', ticket_offline:'Offline gespeichert — wird synchronisiert', ticket_synced:'Tickets synchronisiert', admin_total:'Gesamt Tickets', admin_open:'Offen', admin_progress:'In Bearbeitung', admin_resolved:'Gelost', admin_avg_time:'Durchschnittliche Losung', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'Stunden', admin_filter:'Filtern', admin_internal:'Interne Notiz', admin_notes:'Admin-Notizen', admin_update:'Aktualisieren', admin_faq_manage:'FAQ verwalten', pri_low:'Niedrig', pri_medium:'Mittel', pri_high:'Hoch', pri_urgent:'Dringend', st_open:'Offen', st_in_progress:'In Bearbeitung', st_waiting_user:'Warte auf Antwort', st_resolved:'Gelost', st_closed:'Geschlossen', cat_production:'Produktion', cat_health:'Gesundheit', cat_feed:'Futter', cat_iot:'IoT', cat_billing:'Abrechnung', cat_bug:'Bug', cat_sync:'Synchronisation', cat_feature_request:'Anfrage', cat_access:'Zugang', cat_general:'Allgemein', all:'Alle', pending_offline:'Tickets ausstehend', sync_now:'Jetzt synchronisieren', back:'Zuruck', support_label:'Support', you_label:'Du', stars_select:'Sterne auswahlen', thanks_rating:'Danke fur Ihre Bewertung', complete_fields:'Betreff und Beschreibung ausfullen', ticket_created_msg:'erstellt', ticket_updated:'Ticket aktualisiert', write_msg:'Nachricht schreiben', internal_saved:'Interne Notiz gespeichert', reply_sent:'Antwort gesendet' },
    it: { faq_title:'Centro Assistenza', faq_search:'Cerca articoli...', faq_helpful:'Ti e stato utile?', faq_yes:'Si', faq_no:'No', faq_empty:'Nessun articolo disponibile', faq_no_results:'Nessun risultato per', tab_faq:'FAQ', tab_new_ticket:'Nuovo Ticket', tab_my_tickets:'I Miei Ticket', tab_contact_center:'Contact Center', ticket_subject:'Oggetto', ticket_desc:'Descrivi il problema', ticket_priority:'Priorita', ticket_send:'Invia Ticket', ticket_empty:'Nessun ticket', ticket_status:'Stato', ticket_created:'Creato', ticket_category:'Categoria', ticket_close:'Chiudi Ticket', ticket_rate:'Valuta', ticket_reply:'Rispondi', ticket_msg_placeholder:'Scrivi il tuo messaggio...', ticket_send_msg:'Invia', ticket_rated:'Valutato', ticket_offline:'Salvato offline — verra sincronizzato', ticket_synced:'Ticket sincronizzati', admin_total:'Totale Ticket', admin_open:'Aperti', admin_progress:'In Corso', admin_resolved:'Risolti', admin_avg_time:'Tempo Medio', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'ore', admin_filter:'Filtra', admin_internal:'Nota interna', admin_notes:'Note admin', admin_update:'Aggiorna', admin_faq_manage:'Gestisci FAQ', pri_low:'Bassa', pri_medium:'Media', pri_high:'Alta', pri_urgent:'Urgente', st_open:'Aperto', st_in_progress:'In Corso', st_waiting_user:'In Attesa', st_resolved:'Risolto', st_closed:'Chiuso', cat_production:'Produzione', cat_health:'Sanita', cat_feed:'Mangime', cat_iot:'IoT', cat_billing:'Fatturazione', cat_bug:'Bug', cat_sync:'Sincronizzazione', cat_feature_request:'Richiesta', cat_access:'Accesso', cat_general:'Generale', all:'Tutti', pending_offline:'ticket in sospeso', sync_now:'Sincronizza ora', back:'Indietro', support_label:'Supporto', you_label:'Tu', stars_select:'Seleziona le stelle', thanks_rating:'Grazie per la valutazione', complete_fields:'Completa oggetto e descrizione', ticket_created_msg:'creato', ticket_updated:'Ticket aggiornato', write_msg:'Scrivi un messaggio', internal_saved:'Nota interna salvata', reply_sent:'Risposta inviata' },
    ja: { faq_title:'\u30D8\u30EB\u30D7\u30BB\u30F3\u30BF\u30FC', faq_search:'\u8A18\u4E8B\u3092\u691C\u7D22...', faq_helpful:'\u5F79\u306B\u7ACB\u3061\u307E\u3057\u305F\u304B\uFF1F', faq_yes:'\u306F\u3044', faq_no:'\u3044\u3044\u3048', faq_empty:'\u8A18\u4E8B\u304C\u3042\u308A\u307E\u305B\u3093', faq_no_results:'\u7D50\u679C\u306A\u3057', tab_faq:'FAQ', tab_new_ticket:'\u65B0\u898F\u30C1\u30B1\u30C3\u30C8', tab_my_tickets:'\u30DE\u30A4\u30C1\u30B1\u30C3\u30C8', tab_contact_center:'\u30B3\u30F3\u30BF\u30AF\u30C8\u30BB\u30F3\u30BF\u30FC', ticket_subject:'\u4EF6\u540D', ticket_desc:'\u554F\u984C\u3092\u8AAC\u660E\u3057\u3066\u304F\u3060\u3055\u3044', ticket_priority:'\u512A\u5148\u5EA6', ticket_send:'\u30C1\u30B1\u30C3\u30C8\u9001\u4FE1', ticket_empty:'\u30C1\u30B1\u30C3\u30C8\u306A\u3057', ticket_status:'\u72B6\u614B', ticket_created:'\u4F5C\u6210\u65E5', ticket_category:'\u30AB\u30C6\u30B4\u30EA', ticket_close:'\u30C1\u30B1\u30C3\u30C8\u3092\u9589\u3058\u308B', ticket_rate:'\u8A55\u4FA1', ticket_reply:'\u8FD4\u4FE1', ticket_msg_placeholder:'\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B...', ticket_send_msg:'\u9001\u4FE1', ticket_rated:'\u8A55\u4FA1\u6E08\u307F', ticket_offline:'\u30AA\u30D5\u30E9\u30A4\u30F3\u4FDD\u5B58 \u2014 \u30AA\u30F3\u30E9\u30A4\u30F3\u6642\u306B\u540C\u671F', ticket_synced:'\u30C1\u30B1\u30C3\u30C8\u540C\u671F\u5B8C\u4E86', admin_total:'\u30C1\u30B1\u30C3\u30C8\u5408\u8A08', admin_open:'\u672A\u5BFE\u5FDC', admin_progress:'\u5BFE\u5FDC\u4E2D', admin_resolved:'\u89E3\u6C7A\u6E08\u307F', admin_avg_time:'\u5E73\u5747\u89E3\u6C7A\u6642\u9593', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'\u6642\u9593', admin_filter:'\u30D5\u30A3\u30EB\u30BF\u30FC', admin_internal:'\u5185\u90E8\u30E1\u30E2', admin_notes:'\u7BA1\u7406\u8005\u30E1\u30E2', admin_update:'\u66F4\u65B0', admin_faq_manage:'FAQ\u7BA1\u7406', pri_low:'\u4F4E', pri_medium:'\u4E2D', pri_high:'\u9AD8', pri_urgent:'\u7DCA\u6025', st_open:'\u672A\u5BFE\u5FDC', st_in_progress:'\u5BFE\u5FDC\u4E2D', st_waiting_user:'\u8FD4\u7B54\u5F85\u3061', st_resolved:'\u89E3\u6C7A\u6E08\u307F', st_closed:'\u7D42\u4E86', cat_production:'\u751F\u7523', cat_health:'\u885B\u751F', cat_feed:'\u98FC\u6599', cat_iot:'IoT', cat_billing:'\u8ACB\u6C42', cat_bug:'\u30D0\u30B0', cat_sync:'\u540C\u671F', cat_feature_request:'\u6A5F\u80FD\u8981\u671B', cat_access:'\u30A2\u30AF\u30BB\u30B9', cat_general:'\u4E00\u822C', all:'\u3059\u3079\u3066', pending_offline:'\u30C1\u30B1\u30C3\u30C8\u4FDD\u7559\u4E2D', sync_now:'\u4ECA\u3059\u3050\u540C\u671F', back:'\u623B\u308B', support_label:'\u30B5\u30DD\u30FC\u30C8', you_label:'\u3042\u306A\u305F', stars_select:'\u661F\u3092\u9078\u629E', thanks_rating:'\u8A55\u4FA1\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059', complete_fields:'\u4EF6\u540D\u3068\u8AAC\u660E\u3092\u5165\u529B', ticket_created_msg:'\u4F5C\u6210\u6E08\u307F', ticket_updated:'\u30C1\u30B1\u30C3\u30C8\u66F4\u65B0\u6E08\u307F', write_msg:'\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u66F8\u304F', internal_saved:'\u5185\u90E8\u30E1\u30E2\u4FDD\u5B58\u6E08\u307F', reply_sent:'\u8FD4\u4FE1\u6E08\u307F' },
    zh: { faq_title:'\u5E2E\u52A9\u4E2D\u5FC3', faq_search:'\u641C\u7D22\u6587\u7AE0...', faq_helpful:'\u5BF9\u60A8\u6709\u5E2E\u52A9\u5417\uFF1F', faq_yes:'\u662F', faq_no:'\u5426', faq_empty:'\u6682\u65E0\u6587\u7AE0', faq_no_results:'\u65E0\u7ED3\u679C', tab_faq:'FAQ', tab_new_ticket:'\u65B0\u5EFA\u5DE5\u5355', tab_my_tickets:'\u6211\u7684\u5DE5\u5355', tab_contact_center:'\u8054\u7CFB\u4E2D\u5FC3', ticket_subject:'\u4E3B\u9898', ticket_desc:'\u63CF\u8FF0\u60A8\u7684\u95EE\u9898', ticket_priority:'\u4F18\u5148\u7EA7', ticket_send:'\u63D0\u4EA4\u5DE5\u5355', ticket_empty:'\u6682\u65E0\u5DE5\u5355', ticket_status:'\u72B6\u6001', ticket_created:'\u521B\u5EFA\u65F6\u95F4', ticket_category:'\u5206\u7C7B', ticket_close:'\u5173\u95ED\u5DE5\u5355', ticket_rate:'\u8BC4\u4EF7', ticket_reply:'\u56DE\u590D', ticket_msg_placeholder:'\u8F93\u5165\u6D88\u606F...', ticket_send_msg:'\u53D1\u9001', ticket_rated:'\u5DF2\u8BC4\u4EF7', ticket_offline:'\u5DF2\u79BB\u7EBF\u4FDD\u5B58 \u2014 \u8054\u7F51\u540E\u81EA\u52A8\u540C\u6B65', ticket_synced:'\u5DE5\u5355\u5DF2\u540C\u6B65', admin_total:'\u5DE5\u5355\u603B\u6570', admin_open:'\u5F85\u5904\u7406', admin_progress:'\u5904\u7406\u4E2D', admin_resolved:'\u5DF2\u89E3\u51B3', admin_avg_time:'\u5E73\u5747\u89E3\u51B3\u65F6\u95F4', admin_csat:'CSAT', admin_sla:'SLA %', admin_hours:'\u5C0F\u65F6', admin_filter:'\u7B5B\u9009', admin_internal:'\u5185\u90E8\u5907\u6CE8', admin_notes:'\u7BA1\u7406\u5458\u5907\u6CE8', admin_update:'\u66F4\u65B0', admin_faq_manage:'\u7BA1\u7406FAQ', pri_low:'\u4F4E', pri_medium:'\u4E2D', pri_high:'\u9AD8', pri_urgent:'\u7D27\u6025', st_open:'\u5F85\u5904\u7406', st_in_progress:'\u5904\u7406\u4E2D', st_waiting_user:'\u7B49\u5F85\u56DE\u590D', st_resolved:'\u5DF2\u89E3\u51B3', st_closed:'\u5DF2\u5173\u95ED', cat_production:'\u751F\u4EA7', cat_health:'\u536B\u751F', cat_feed:'\u9972\u6599', cat_iot:'IoT', cat_billing:'\u8D26\u5355', cat_bug:'Bug', cat_sync:'\u540C\u6B65', cat_feature_request:'\u529F\u80FD\u9700\u6C42', cat_access:'\u8BBF\u95EE', cat_general:'\u901A\u7528', all:'\u5168\u90E8', pending_offline:'\u5DE5\u5355\u6682\u5B58', sync_now:'\u7ACB\u5373\u540C\u6B65', back:'\u8FD4\u56DE', support_label:'\u652F\u6301', you_label:'\u4F60', stars_select:'\u9009\u62E9\u661F\u7EA7', thanks_rating:'\u611F\u8C22\u60A8\u7684\u8BC4\u4EF7', complete_fields:'\u8BF7\u586B\u5199\u4E3B\u9898\u548C\u63CF\u8FF0', ticket_created_msg:'\u5DF2\u521B\u5EFA', ticket_updated:'\u5DE5\u5355\u5DF2\u66F4\u65B0', write_msg:'\u8BF7\u8F93\u5165\u6D88\u606F', internal_saved:'\u5185\u90E8\u5907\u6CE8\u5DF2\u4FDD\u5B58', reply_sent:'\u56DE\u590D\u5DF2\u53D1\u9001' }
  };
  const lang = getLang();
  const d = _SL[lang] || _SL.es;
  const es = _SL.es;
  const en = _SL.en;
  return new Proxy({}, { get: (_, k) => d[k] || es[k] || en[k] || k });
}

// ── Status / priority color maps ────────────────────────────
const STATUS_COLORS = { open: '#3b82f6', in_progress: '#f59e0b', waiting_user: '#8b5cf6', resolved: '#10b981', closed: '#6b7280' };
const PRIORITY_COLORS = { low: '#6b7280', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

class EggSoporte extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._currentTab = 'faq';
    this._unsubs = [];
    this._faq = [];
    this._tickets = [];
    this._ticketDetail = null;
    this._adminTickets = [];
    this._analytics = null;
    this._faqSearch = '';
    this._faqCategory = '';
    this._adminFilter = { status: '', category: '', priority: '' };
    this._pendingRating = 0;
    this._offlineQueue = JSON.parse(localStorage.getItem('egglogu_offline_tickets') || '[]');
  }

  connectedCallback() {
    this.render();
    this._bindEvents();

    this._unsubs.push(
      Bus.on('modal:action', (e) => this._onModalAction(e)),
      Bus.on('data:changed', () => this.render())
    );

    // Auto-sync offline tickets when back online
    this._onlineHandler = () => { if (this._offlineQueue.length) this._syncOfflineTickets(); };
    window.addEventListener('online', this._onlineHandler);
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    window.removeEventListener('online', this._onlineHandler);
  }

  cleanup() {
    // No long-lived resources
  }

  // ─── RENDER ───────────────────────────────────────────────

  render() {
    const D = Store.get();
    const L = _sL();
    const isAdmin = (D.settings.role === 'owner' || D.settings.role === 'manager');

    let h = this._css();
    h += `<div class="page-header"><h2>\uD83C\uDFA7 ${L.faq_title}</h2></div>`;

    // Tabs
    h += `<div class="tabs">`;
    ['faq', 'new_ticket', 'my_tickets'].forEach(tab => {
      h += `<div class="tab${this._currentTab === tab ? ' active' : ''}" data-tab="${tab}">${L['tab_' + tab]}</div>`;
    });
    if (isAdmin) {
      h += `<div class="tab${this._currentTab === 'contact_center' ? ' active' : ''}" data-tab="contact_center">${L.tab_contact_center}</div>`;
    }
    h += `</div>`;

    // Tab content
    if (this._currentTab === 'faq') h += this._renderFaqTab(L);
    else if (this._currentTab === 'new_ticket') h += this._renderNewTicketTab(L, D.settings.plan || {});
    else if (this._currentTab === 'my_tickets') h += this._renderMyTicketsTab(L);
    else if (this._currentTab === 'contact_center' && isAdmin) h += this._renderContactCenterTab(L);

    this.shadowRoot.innerHTML = h;
    this._bindTabEvents();

    // Load data async on first render of each tab
    if (this._currentTab === 'faq' && this._faq.length === 0) this._loadFaq();
    if (this._currentTab === 'my_tickets' && this._tickets.length === 0) this._loadMyTickets();
    if (this._currentTab === 'contact_center' && isAdmin && this._adminTickets.length === 0) this._loadAdminData();
  }

  // ─── EVENTS ───────────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.action;
      const id = btn.dataset.id || '';

      switch (action) {
        case 'search-faq':       this._searchFaq(); break;
        case 'faq-vote-yes':     this._faqVote(id, true); break;
        case 'faq-vote-no':      this._faqVote(id, false); break;
        case 'submit-ticket':    this._submitTicket(); break;
        case 'sync-offline':     this._syncOfflineTickets(); break;
        case 'open-ticket':      this._openTicket(id); break;
        case 'back-to-tickets':  this._ticketDetail = null; this.render(); break;
        case 'send-ticket-msg':  this._sendTicketMsg(id); break;
        case 'close-ticket':     this._closeUserTicket(id); break;
        case 'set-rating':       this._setRating(parseInt(btn.dataset.star)); break;
        case 'submit-rating':    this._submitRating(id); break;
        case 'admin-open':       this._adminOpenTicket(id); break;
      }
    });

    // FAQ search input — keyup triggers filter update, Enter triggers search
    root.addEventListener('keyup', (e) => {
      if (e.target.matches('#faq-search-input')) {
        this._faqSearch = e.target.value;
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.target.matches('#faq-search-input') && e.key === 'Enter') {
        this._searchFaq();
      }
      if (e.target.matches('#sup-msg') && e.key === 'Enter') {
        const tkId = e.target.dataset.ticketId;
        if (tkId) this._sendTicketMsg(tkId);
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.matches('#faq-category-select')) {
        this._faqCategory = e.target.value;
        this._searchFaq();
      }
      // Admin filters
      if (e.target.matches('#admin-filter-status'))   { this._adminFilter.status = e.target.value;   this._loadAdminTickets(); }
      if (e.target.matches('#admin-filter-category')) { this._adminFilter.category = e.target.value; this._loadAdminTickets(); }
      if (e.target.matches('#admin-filter-priority')) { this._adminFilter.priority = e.target.value; this._loadAdminTickets(); }
    });
  }

  _bindTabEvents() {
    this.shadowRoot.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._currentTab = tab.dataset.tab;
        this.render();
      });
    });
  }

  _onModalAction(e) {
    switch (e.action) {
      case 'admin-update-ticket': this._adminUpdateTicket(e.ticketId); break;
      case 'admin-reply':         this._adminReply(e.ticketId, false); break;
      case 'admin-reply-internal': this._adminReply(e.ticketId, true); break;
    }
  }

  // ─── TAB 1: FAQ ───────────────────────────────────────────

  _renderFaqTab(L) {
    let h = `<div class="card" style="padding:16px;margin-bottom:16px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <input type="text" class="form-input" id="faq-search-input"
               placeholder="${escapeAttr(L.faq_search)}" value="${escapeAttr(this._faqSearch)}"
               style="flex:1;min-width:200px">
        <select class="form-input" id="faq-category-select" style="max-width:180px">
          <option value="">${L.all}</option>`;
    TICKET_CATEGORIES.forEach(c => {
      h += `<option value="${escapeAttr(c)}" ${this._faqCategory === c ? 'selected' : ''}>${L['cat_' + c] || c}</option>`;
    });
    h += `</select>
        <button class="btn btn-primary" data-action="search-faq" style="padding:8px 16px">${L.faq_search.split('...')[0]}</button>
      </div>
    </div>`;

    if (this._faq.length === 0) {
      h += `<div class="empty-state"><div class="empty-icon">\uD83D\uDCD6</div><p>${L.faq_empty}</p></div>`;
    } else {
      const lang = getLang();
      const isEs = lang.startsWith('es');
      this._faq.forEach(faq => {
        const title = isEs ? (faq.title_es || faq.title_en) : (faq.title_en || faq.title_es);
        const content = isEs ? (faq.content_es || faq.content_en) : (faq.content_en || faq.content_es);
        h += `<details class="card" style="padding:0;margin-bottom:8px">
          <summary style="padding:16px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:8px">
            <span class="badge badge-info">${L['cat_' + faq.category] || faq.category}</span>
            ${sanitizeHTML(title)}
          </summary>
          <div style="padding:0 16px 16px;border-top:1px solid var(--border,#E0E0E0)">
            <div style="margin-top:12px;line-height:1.7;white-space:pre-line">${sanitizeHTML(content)}</div>
            <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border,#E0E0E0);display:flex;align-items:center;gap:12px;font-size:.85em;color:var(--text-muted,#757575)">
              <span>${L.faq_helpful}</span>
              <button class="btn btn-secondary btn-sm" data-action="faq-vote-yes" data-id="${escapeAttr(faq.id)}">\uD83D\uDC4D ${L.faq_yes}</button>
              <button class="btn btn-secondary btn-sm" data-action="faq-vote-no" data-id="${escapeAttr(faq.id)}">\uD83D\uDC4E ${L.faq_no}</button>
              <span style="opacity:.5">${faq.helpful_yes || 0} \uD83D\uDC4D / ${faq.helpful_no || 0} \uD83D\uDC4E</span>
            </div>
          </div>
        </details>`;
      });
    }
    return h;
  }

  // ─── TAB 2: NEW TICKET ────────────────────────────────────

  _renderNewTicketTab(L, plan) {
    const offline = !navigator.onLine;
    let h = `<div class="card" style="padding:24px">
      <h3 style="margin:0 0 16px">${L.tab_new_ticket}</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-weight:600;margin-bottom:4px;display:block">${L.ticket_subject}</label>
          <input type="text" id="sup-subject" class="form-input" placeholder="${escapeAttr(L.ticket_subject)}" maxlength="200" style="width:100%">
        </div>
        <div>
          <label style="font-weight:600;margin-bottom:4px;display:block">${L.ticket_desc}</label>
          <textarea id="sup-desc" class="form-input" placeholder="${escapeAttr(L.ticket_desc)}" rows="5" style="width:100%;resize:vertical"></textarea>
        </div>
        <div>
          <label style="font-weight:600;margin-bottom:4px;display:block">${L.ticket_priority}</label>
          <select id="sup-priority" class="form-input" style="max-width:200px">`;
    TICKET_PRIORITIES.forEach(p => {
      h += `<option value="${escapeAttr(p)}" ${p === 'medium' ? 'selected' : ''}>${L['pri_' + p] || p}</option>`;
    });
    h += `</select>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <button class="btn btn-primary" data-action="submit-ticket" style="padding:10px 24px">${L.ticket_send}</button>
          ${offline ? `<span style="color:var(--warning,#F57F17);font-size:.85em">\uD83D\uDCF4 ${L.ticket_offline}</span>` : ''}
        </div>
      </div>
    </div>`;

    // Offline queue indicator
    if (this._offlineQueue.length > 0) {
      h += `<div class="card" style="padding:12px;margin-top:12px;background:var(--warning-fill,#FFF8E1)">
        <strong>\uD83D\uDCF4 ${this._offlineQueue.length} ${L.pending_offline}</strong>
        ${navigator.onLine ? `<button class="btn btn-secondary" data-action="sync-offline" style="margin-left:12px;padding:4px 12px">${L.sync_now}</button>` : ''}
      </div>`;
    }
    return h;
  }

  // ─── TAB 3: MY TICKETS ────────────────────────────────────

  _renderMyTicketsTab(L) {
    if (this._tickets.length === 0) {
      return `<div class="empty-state"><div class="empty-icon">\uD83C\uDFAB</div><p>${L.ticket_empty}</p></div>`;
    }

    // If viewing a ticket detail
    if (this._ticketDetail) {
      return this._renderTicketDetail(L);
    }

    let h = `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>${L.ticket_subject}</th><th>${L.ticket_category}</th>
      <th>${L.ticket_priority}</th><th>${L.ticket_status}</th><th>${L.ticket_created}</th>
    </tr></thead><tbody>`;

    this._tickets.forEach(tk => {
      const stColor = STATUS_COLORS[tk.status] || '#6b7280';
      const priColor = PRIORITY_COLORS[tk.priority] || '#6b7280';
      h += `<tr class="clickable-row" data-action="open-ticket" data-id="${escapeAttr(tk.id)}">
        <td style="font-family:monospace;font-size:.85em">${sanitizeHTML(tk.ticket_number)}</td>
        <td style="font-weight:600">${sanitizeHTML(tk.subject)}</td>
        <td><span class="badge badge-info">${L['cat_' + tk.category] || tk.category}</span></td>
        <td><span style="color:${priColor};font-weight:600;font-size:.85em">${L['pri_' + tk.priority] || tk.priority}</span></td>
        <td><span style="background:${stColor}15;color:${stColor};padding:2px 10px;border-radius:6px;font-size:.8em;font-weight:600">${L['st_' + tk.status] || tk.status}</span></td>
        <td style="font-size:.85em;color:var(--text-muted,#757575)">${new Date(tk.created_at).toLocaleDateString()}</td>
      </tr>`;
    });
    h += `</tbody></table></div>`;
    return h;
  }

  // ─── TICKET DETAIL VIEW ───────────────────────────────────

  _renderTicketDetail(L) {
    const tk = this._ticketDetail;
    if (!tk) return '';
    const stColor = STATUS_COLORS[tk.status] || '#6b7280';
    const isClosed = tk.status === 'closed' || tk.status === 'resolved';

    // Back button
    let h = `<div style="margin-bottom:12px">
      <button class="btn btn-secondary" data-action="back-to-tickets" style="padding:6px 12px;font-size:.85em">&larr; ${L.tab_my_tickets}</button>
    </div>`;

    // Header card
    h += `<div class="card" style="padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-family:monospace;font-size:.85em;color:var(--text-muted,#757575);margin-bottom:4px">${sanitizeHTML(tk.ticket_number)}</div>
          <h3 style="margin:0 0 8px">${sanitizeHTML(tk.subject)}</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="background:${stColor}15;color:${stColor};padding:2px 10px;border-radius:6px;font-size:.85em;font-weight:600">${L['st_' + tk.status] || tk.status}</span>
            <span class="badge badge-info">${L['cat_' + tk.category] || tk.category}</span>
          </div>
        </div>
        <div style="text-align:right;font-size:.85em;color:var(--text-muted,#757575)">
          ${new Date(tk.created_at).toLocaleString()}
        </div>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border,#E0E0E0);white-space:pre-line;line-height:1.6">${sanitizeHTML(tk.description)}</div>
    </div>`;

    // Messages (chat style)
    if (tk.messages && tk.messages.length > 0) {
      h += `<div class="chat-messages">`;
      tk.messages.forEach(msg => {
        const isMe = !msg.is_admin;
        const align = isMe ? 'flex-end' : 'flex-start';
        const bg = isMe ? 'var(--primary-fill,#E8F5E9)' : 'var(--bg-secondary,#F5F5F5)';
        const border = msg.is_admin ? 'border-left:3px solid var(--primary,#4a7c59)' : '';
        h += `<div style="align-self:${align};max-width:80%;background:${bg};padding:12px 16px;border-radius:12px;${border}">
          <div style="white-space:pre-line;line-height:1.5">${sanitizeHTML(msg.message)}</div>
          <div style="font-size:.75em;color:var(--text-muted,#757575);margin-top:4px;text-align:right">${msg.is_admin ? '\uD83C\uDFA7 ' + L.support_label : L.you_label} \u2014 ${new Date(msg.created_at).toLocaleString()}</div>
        </div>`;
      });
      h += `</div>`;
    }

    // Reply box (if not closed)
    if (!isClosed) {
      h += `<div class="card" style="padding:12px;margin-bottom:12px">
        <div style="display:flex;gap:8px">
          <input type="text" id="sup-msg" class="form-input" data-ticket-id="${escapeAttr(tk.id)}"
                 placeholder="${escapeAttr(L.ticket_msg_placeholder)}" style="flex:1">
          <button class="btn btn-primary" data-action="send-ticket-msg" data-id="${escapeAttr(tk.id)}" style="padding:8px 16px">${L.ticket_send_msg}</button>
        </div>
      </div>`;
      h += `<button class="btn btn-secondary" data-action="close-ticket" data-id="${escapeAttr(tk.id)}" style="padding:8px 16px">${L.ticket_close}</button>`;
    }

    // Rating (if resolved/closed and no rating yet)
    if (isClosed && !tk.rating) {
      h += `<div class="card" style="padding:16px;margin-top:12px;text-align:center">
        <p style="font-weight:600;margin:0 0 12px">${L.ticket_rate}</p>
        <div class="star-rating" style="font-size:2em;margin-bottom:12px;cursor:pointer">
          ${[1, 2, 3, 4, 5].map(n =>
            `<span data-action="set-rating" data-star="${n}" data-id="${escapeAttr(tk.id)}" style="transition:.1s">\u2606</span>`
          ).join('')}
        </div>
        <input type="text" id="sup-rate-comment" class="form-input" placeholder="${escapeAttr(L.ticket_msg_placeholder)}" style="max-width:400px;margin:0 auto 12px;display:block">
        <button class="btn btn-primary" data-action="submit-rating" data-id="${escapeAttr(tk.id)}">${L.ticket_rate}</button>
      </div>`;
    } else if (tk.rating) {
      h += `<div class="card" style="padding:12px;margin-top:12px;text-align:center;color:var(--text-muted,#757575)">
        ${L.ticket_rated}: ${'\u2605'.repeat(tk.rating.rating)}${'\u2606'.repeat(5 - tk.rating.rating)}
        ${tk.rating.comment ? ` \u2014 "${sanitizeHTML(tk.rating.comment)}"` : ''}
      </div>`;
    }

    return h;
  }

  // ─── TAB 4: CONTACT CENTER (admin only) ───────────────────

  _renderContactCenterTab(L) {
    let h = '';

    if (!this._analytics) {
      this._loadAdminData();
      return `<div class="loading-spinner"></div>`;
    }

    const a = this._analytics;

    // KPI cards
    h += `<div class="kpi-grid">`;
    const kpis = [
      { label: L.admin_total,    value: a.total_tickets,       color: '#3b82f6' },
      { label: L.admin_open,     value: a.open_tickets,        color: '#f59e0b' },
      { label: L.admin_progress, value: a.in_progress_tickets, color: '#8b5cf6' },
      { label: L.admin_resolved, value: a.resolved_tickets,    color: '#10b981' },
      { label: L.admin_avg_time, value: a.avg_resolution_hours != null ? a.avg_resolution_hours + 'h' : '--', color: '#6366f1' },
      { label: L.admin_csat,     value: a.avg_rating != null ? a.avg_rating + '/5' : '--',                      color: '#ec4899' },
      { label: L.admin_sla,      value: a.sla_compliance_pct != null ? a.sla_compliance_pct + '%' : '--',        color: '#14b8a6' },
    ];
    kpis.forEach(k => {
      h += `<div class="card" style="padding:16px;text-align:center">
        <div style="font-size:1.8em;font-weight:900;color:${k.color}">${k.value}</div>
        <div style="font-size:.85em;color:var(--text-muted,#757575)">${k.label}</div>
      </div>`;
    });
    h += `</div>`;

    // Filters
    h += `<div class="card" style="padding:12px;margin-bottom:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span style="font-weight:600">${L.admin_filter}:</span>
        <select class="form-input" id="admin-filter-status" style="max-width:160px">
          <option value="">${L.ticket_status}: ${L.all}</option>`;
    TICKET_STATUSES.forEach(s => {
      h += `<option value="${escapeAttr(s)}" ${this._adminFilter.status === s ? 'selected' : ''}>${L['st_' + s] || s}</option>`;
    });
    h += `</select>
        <select class="form-input" id="admin-filter-category" style="max-width:160px">
          <option value="">${L.ticket_category}: ${L.all}</option>`;
    TICKET_CATEGORIES.forEach(c => {
      h += `<option value="${escapeAttr(c)}" ${this._adminFilter.category === c ? 'selected' : ''}>${L['cat_' + c] || c}</option>`;
    });
    h += `</select>
        <select class="form-input" id="admin-filter-priority" style="max-width:160px">
          <option value="">${L.ticket_priority}: ${L.all}</option>`;
    TICKET_PRIORITIES.forEach(p => {
      h += `<option value="${escapeAttr(p)}" ${this._adminFilter.priority === p ? 'selected' : ''}>${L['pri_' + p] || p}</option>`;
    });
    h += `</select>
      </div>
    </div>`;

    // Tickets table
    if (this._adminTickets.length === 0) {
      h += `<div class="empty-state"><div class="empty-icon">\uD83D\uDCED</div><p>${L.ticket_empty}</p></div>`;
    } else {
      h += `<div class="table-wrap"><table><thead><tr>
        <th>#</th><th>${L.ticket_subject}</th><th>${L.ticket_category}</th>
        <th>${L.ticket_priority}</th><th>${L.ticket_status}</th><th>${L.ticket_created}</th><th></th>
      </tr></thead><tbody>`;
      this._adminTickets.forEach(tk => {
        const stColor = STATUS_COLORS[tk.status] || '#6b7280';
        const priColor = PRIORITY_COLORS[tk.priority] || '#6b7280';
        const slaWarn = tk.sla_deadline && new Date(tk.sla_deadline) < new Date() && tk.status !== 'resolved' && tk.status !== 'closed';
        h += `<tr ${slaWarn ? 'style="background:rgba(239,68,68,.08)"' : ''}>
          <td style="font-family:monospace;font-size:.85em">${sanitizeHTML(tk.ticket_number)}</td>
          <td style="font-weight:600">${sanitizeHTML(tk.subject)}</td>
          <td><span style="font-size:.8em">${L['cat_' + tk.category] || tk.category}</span></td>
          <td><span style="color:${priColor};font-weight:600;font-size:.85em">${L['pri_' + tk.priority] || tk.priority}${slaWarn ? ' \u26A0\uFE0F' : ''}</span></td>
          <td><span style="background:${stColor}15;color:${stColor};padding:2px 8px;border-radius:6px;font-size:.8em;font-weight:600">${L['st_' + tk.status] || tk.status}</span></td>
          <td style="font-size:.85em">${new Date(tk.created_at).toLocaleDateString()}</td>
          <td><button class="btn btn-secondary btn-sm" data-action="admin-open" data-id="${escapeAttr(tk.id)}">${L.ticket_reply}</button></td>
        </tr>`;
      });
      h += `</tbody></table></div>`;
    }

    return h;
  }

  // ─── DATA LOADERS ─────────────────────────────────────────

  async _loadFaq() {
    if (!apiService.isLoggedIn()) return;
    try {
      this._faq = await apiService.getFaq(this._faqSearch, this._faqCategory) || [];
      this.render();
    } catch (e) { console.warn('[Support] FAQ load failed:', e.message); }
  }

  _searchFaq() {
    this._faq = [];
    this._loadFaq();
  }

  async _faqVote(faqId, helpful) {
    try {
      await apiService.faqHelpful(faqId, helpful);
      const f = this._faq.find(x => x.id === faqId);
      if (f) {
        if (helpful) f.helpful_yes = (f.helpful_yes || 0) + 1;
        else f.helpful_no = (f.helpful_no || 0) + 1;
      }
      this.render();
      Bus.emit('toast', { msg: helpful ? '\uD83D\uDC4D' : '\uD83D\uDC4E', type: 'info' });
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _loadMyTickets() {
    if (!apiService.isLoggedIn()) return;
    try {
      this._tickets = await apiService.getTickets() || [];
      this.render();
    } catch (e) { console.warn('[Support] Tickets load failed:', e.message); }
  }

  async _openTicket(id) {
    try {
      this._ticketDetail = await apiService.getTicket(id);
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _submitTicket() {
    const root = this.shadowRoot;
    const subject = root.querySelector('#sup-subject')?.value?.trim();
    const desc = root.querySelector('#sup-desc')?.value?.trim();
    const priority = root.querySelector('#sup-priority')?.value || 'medium';
    const L = _sL();

    if (!subject || !desc) {
      Bus.emit('toast', { msg: L.complete_fields, type: 'error' });
      return;
    }

    if (!navigator.onLine) {
      this._offlineQueue.push({ subject, description: desc, priority, created_offline: new Date().toISOString() });
      safeSetItem('egglogu_offline_tickets', JSON.stringify(this._offlineQueue));
      Bus.emit('toast', { msg: L.ticket_offline, type: 'info' });
      root.querySelector('#sup-subject').value = '';
      root.querySelector('#sup-desc').value = '';
      this.render();
      return;
    }

    try {
      const tk = await apiService.createTicket(subject, desc, priority);
      Bus.emit('toast', { msg: 'Ticket ' + tk.ticket_number + ' ' + L.ticket_created_msg, type: 'info' });
      this._tickets = [];
      this._currentTab = 'my_tickets';
      this.render();
      this._loadMyTickets();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _sendTicketMsg(ticketId) {
    const msg = this.shadowRoot.querySelector('#sup-msg')?.value?.trim();
    if (!msg) return;
    try {
      await apiService.addTicketMessage(ticketId, msg);
      this._ticketDetail = await apiService.getTicket(ticketId);
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _closeUserTicket(ticketId) {
    try {
      await apiService.closeTicket(ticketId);
      this._ticketDetail = await apiService.getTicket(ticketId);
      this._tickets = [];
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  _setRating(n) {
    this._pendingRating = n;
    this.shadowRoot.querySelectorAll('.star-rating span[data-star]').forEach(s => {
      s.textContent = parseInt(s.dataset.star) <= n ? '\u2605' : '\u2606';
    });
  }

  async _submitRating(ticketId) {
    const L = _sL();
    if (!this._pendingRating) {
      Bus.emit('toast', { msg: L.stars_select, type: 'error' });
      return;
    }
    const comment = this.shadowRoot.querySelector('#sup-rate-comment')?.value?.trim() || '';
    try {
      await apiService.rateTicket(ticketId, this._pendingRating, comment);
      this._ticketDetail = await apiService.getTicket(ticketId);
      this._pendingRating = 0;
      Bus.emit('toast', { msg: L.thanks_rating, type: 'info' });
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _syncOfflineTickets() {
    if (!this._offlineQueue.length || !navigator.onLine) return;
    const L = _sL();
    try {
      const res = await apiService.syncTickets(
        this._offlineQueue.map(t => ({ subject: t.subject, description: t.description, priority: t.priority }))
      );
      this._offlineQueue.length = 0;
      localStorage.removeItem('egglogu_offline_tickets');
      Bus.emit('toast', { msg: L.ticket_synced + ': ' + res.synced, type: 'info' });
      this._tickets = [];
      this._loadMyTickets();
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error sync: ' + e.message, type: 'error' }); }
  }

  // ─── ADMIN FUNCTIONS ──────────────────────────────────────

  async _loadAdminData() {
    if (!apiService.isLoggedIn()) return;
    try {
      const [analytics, tickets] = await Promise.all([
        apiService.getAdminAnalytics(),
        apiService.getAdminTickets(this._adminFilter.status, this._adminFilter.category, this._adminFilter.priority)
      ]);
      this._analytics = analytics;
      this._adminTickets = tickets || [];
      this.render();
    } catch (e) { console.warn('[Support] Admin data load failed:', e.message); }
  }

  async _loadAdminTickets() {
    try {
      this._adminTickets = await apiService.getAdminTickets(
        this._adminFilter.status, this._adminFilter.category, this._adminFilter.priority
      ) || [];
      this.render();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  _adminOpenTicket(ticketId) {
    const tk = this._adminTickets.find(t => t.id === ticketId);
    if (!tk) return;
    const L = _sL();

    let body = `<div style="padding:8px">
      <div style="font-family:monospace;font-size:.85em;color:var(--text-muted,#757575);margin-bottom:4px">${sanitizeHTML(tk.ticket_number)}</div>
      <h3 style="margin:0 0 8px">${sanitizeHTML(tk.subject)}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="badge badge-info">${L['cat_' + tk.category] || tk.category}</span>
        <span style="font-size:.85em;font-weight:600">${L['pri_' + tk.priority] || tk.priority}</span>
      </div>
      <p style="white-space:pre-line;line-height:1.6;margin-bottom:16px">${sanitizeHTML(tk.description)}</p>
      <hr style="border-color:var(--border,#E0E0E0);margin-bottom:12px">
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        <div style="display:flex;gap:8px">
          <select id="adm-tk-status" class="form-input" style="flex:1">`;
    TICKET_STATUSES.forEach(s => {
      body += `<option value="${escapeAttr(s)}" ${tk.status === s ? 'selected' : ''}>${L['st_' + s] || s}</option>`;
    });
    body += `</select>
          <select id="adm-tk-priority" class="form-input" style="flex:1">`;
    TICKET_PRIORITIES.forEach(p => {
      body += `<option value="${escapeAttr(p)}" ${tk.priority === p ? 'selected' : ''}>${L['pri_' + p] || p}</option>`;
    });
    body += `</select>
          <button class="btn btn-secondary" data-action="admin-update-ticket" data-ticket-id="${escapeAttr(tk.id)}" style="padding:8px 12px">${L.admin_update}</button>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-weight:600;display:block;margin-bottom:4px">${L.ticket_reply}</label>
        <textarea id="adm-reply-msg" class="form-input" rows="3" style="width:100%;resize:vertical" placeholder="${escapeAttr(L.ticket_msg_placeholder)}"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" data-action="admin-reply" data-ticket-id="${escapeAttr(tk.id)}">${L.ticket_reply}</button>
          <button class="btn btn-secondary" data-action="admin-reply-internal" data-ticket-id="${escapeAttr(tk.id)}" style="opacity:.7">${L.admin_internal}</button>
        </div>
      </div>
    </div>`;

    Bus.emit('modal:open', {
      title: tk.ticket_number + ' \u2014 ' + tk.subject,
      body
    });
  }

  async _adminUpdateTicket(ticketId) {
    const L = _sL();
    const status = modalVal('adm-tk-status');
    const priority = modalVal('adm-tk-priority');
    try {
      await apiService.updateAdminTicket(ticketId, { status, priority });
      Bus.emit('toast', { msg: L.ticket_updated, type: 'info' });
      Bus.emit('modal:close');
      this._loadAdminData();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  async _adminReply(ticketId, isInternal) {
    const L = _sL();
    const msg = modalVal('adm-reply-msg');
    if (!msg) { Bus.emit('toast', { msg: L.write_msg, type: 'error' }); return; }
    try {
      await apiService.adminReplyTicket(ticketId, msg, isInternal);
      Bus.emit('toast', { msg: isInternal ? L.internal_saved : L.reply_sent, type: 'info' });
      Bus.emit('modal:close');
      this._loadAdminData();
    } catch (e) { Bus.emit('toast', { msg: 'Error: ' + e.message, type: 'error' }); }
  }

  // ─── CSS ──────────────────────────────────────────────────

  _css() {
    return `<style>
      :host { display: block; }

      .page-header {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 12px; margin-bottom: 16px;
      }
      .page-header h2, .page-header h3 { margin: 0; color: var(--text, #212121); }

      /* Tabs */
      .tabs {
        display: flex; gap: 0; border-bottom: 2px solid var(--border, #E0E0E0);
        margin-bottom: 16px; overflow-x: auto;
      }
      .tab {
        padding: 10px 16px; cursor: pointer; font-weight: 600; font-size: 14px;
        color: var(--text-light, #757575); border-bottom: 2px solid transparent;
        margin-bottom: -2px; white-space: nowrap; user-select: none;
      }
      .tab.active { color: var(--primary, #4a7c59); border-bottom-color: var(--primary, #4a7c59); }
      .tab:hover { color: var(--text, #212121); }

      /* Buttons */
      .btn {
        padding: 8px 16px; border-radius: 8px; border: none; font-size: 13px;
        font-weight: 600; cursor: pointer; transition: background .2s; display: inline-flex;
        align-items: center; gap: 6px; text-decoration: none;
      }
      .btn-primary { background: var(--primary, #4a7c59); color: #fff; }
      .btn-primary:hover { filter: brightness(1.1); }
      .btn-secondary { background: var(--border, #E0E0E0); color: var(--text, #212121); }
      .btn-secondary:hover { filter: brightness(.95); }
      .btn-sm { padding: 4px 10px; font-size: 12px; }

      /* Badges */
      .badge {
        display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px;
        font-weight: 600; white-space: nowrap;
      }
      .badge-info { background: #E3F2FD; color: #1565C0; }

      /* Card */
      .card {
        background: var(--card, #fff); border-radius: 12px; padding: 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px;
      }

      /* Table */
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      table th {
        text-align: left; padding: 10px 8px; font-weight: 600; font-size: 12px;
        color: var(--text-light, #757575); border-bottom: 2px solid var(--border, #E0E0E0);
        white-space: nowrap;
      }
      table td {
        padding: 10px 8px; border-bottom: 1px solid var(--border, #E0E0E0);
        color: var(--text, #212121); vertical-align: middle;
      }
      table tr:hover { background: var(--hover, #F5F5F5); }
      tr.clickable-row { cursor: pointer; }

      /* Form inputs */
      .form-input {
        padding: 8px 12px; border: 1px solid var(--border, #E0E0E0); border-radius: 8px;
        font-size: 13px; font-family: inherit; background: var(--card, #fff);
        color: var(--text, #212121); outline: none; transition: border-color .2s;
      }
      .form-input:focus { border-color: var(--primary, #4a7c59); }
      textarea.form-input { line-height: 1.5; }

      /* Empty state */
      .empty-state { text-align: center; padding: 48px 16px; color: var(--text-muted, #757575); }
      .empty-icon { font-size: 3em; margin-bottom: 12px; }

      /* Loading spinner */
      .loading-spinner {
        width: 32px; height: 32px; border: 3px solid var(--border, #E0E0E0);
        border-top-color: var(--primary, #4a7c59); border-radius: 50%;
        animation: spin .8s linear infinite; margin: 48px auto;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Chat messages */
      .chat-messages {
        display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;
      }

      /* Star rating hover */
      .star-rating span:hover { transform: scale(1.2); }

      /* KPI grid */
      .kpi-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px; margin-bottom: 16px;
      }

      /* Details/accordion for FAQ */
      details summary::-webkit-details-marker { display: none; }
      details summary { list-style: none; }
      details summary::before {
        content: '\u25B6'; margin-right: 8px; font-size: .7em; transition: transform .2s; display: inline-block;
      }
      details[open] summary::before { transform: rotate(90deg); }
    </style>`;
  }
}

// ── Register the custom element ─────────────────────────────
customElements.define('egg-soporte', EggSoporte);

export { EggSoporte, PLAN_TIERS };
