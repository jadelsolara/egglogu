// <egg-community> — Community Forum & Chat Web Component
// Tier-gated access: higher plans see more categories. Cascade down.
// Backend: /community/* endpoints (categories, threads, posts, rooms, messages, insights, stats)

import { Store, Bus, t, sanitizeHTML, escapeAttr, getLang, apiService } from '../core/index.js';
import { getCurrentUser } from '../core/permissions.js';

// ── Labels (8 languages) ──────────────────────────────────────
function _cL() {
  const _L = {
    es: {
      title: 'Comunidad', tab_forum: 'Foro', tab_chat: 'Chat en Vivo', tab_stats: 'Estadisticas',
      categories: 'Categorias', threads: 'Hilos', new_thread: 'Nuevo Hilo', search_placeholder: 'Buscar hilos...',
      thread_title: 'Titulo', thread_content: 'Contenido', create: 'Crear', cancel: 'Cancelar',
      replies: 'respuestas', views: 'vistas', pinned: 'Fijado', locked: 'Bloqueado',
      by: 'por', ago: 'hace', just_now: 'ahora', minutes: 'min', hours: 'h', days: 'd',
      reply: 'Responder', reply_placeholder: 'Escribe tu respuesta...', send: 'Enviar', back: 'Volver',
      like: 'Me gusta', solution: 'Solucion', edit: 'Editar', save: 'Guardar',
      empty_threads: 'No hay hilos en esta categoria', empty_posts: 'Se el primero en responder',
      upgrade_required: 'Actualiza tu plan para acceder a esta categoria',
      upgrade_btn: 'Ver Planes', locked_category: 'Requiere plan superior',
      chat_rooms: 'Salas de Chat', chat_placeholder: 'Escribe un mensaje...', chat_send: 'Enviar',
      chat_locked: 'Actualiza tu plan para unirte a esta sala', online: 'en linea',
      chat_empty: 'No hay mensajes aun. Se el primero!',
      stats_threads: 'Total Hilos', stats_posts: 'Total Posts', stats_messages: 'Mensajes Chat',
      stats_active: 'Activos 24h', stats_insights: 'Insights AI', stats_countries: 'Paises',
      stats_top_cats: 'Categorias Populares', loading: 'Cargando...', error: 'Error al cargar',
      all_categories: 'Todas las Categorias', filter_open: 'Abiertos', filter_closed: 'Cerrados',
      filter_pinned: 'Fijados', moderated: 'En revision', ai_tags: 'Temas',
      sort_recent: 'Recientes', sort_popular: 'Populares', page_prev: 'Anterior', page_next: 'Siguiente',
      thread_created: 'Hilo creado', reply_sent: 'Respuesta enviada', post_liked: 'Like actualizado',
      post_edited: 'Post editado', suspended_msg: 'Tu cuenta esta suspendida. Solo puedes leer.',
    },
    en: {
      title: 'Community', tab_forum: 'Forum', tab_chat: 'Live Chat', tab_stats: 'Statistics',
      categories: 'Categories', threads: 'Threads', new_thread: 'New Thread', search_placeholder: 'Search threads...',
      thread_title: 'Title', thread_content: 'Content', create: 'Create', cancel: 'Cancel',
      replies: 'replies', views: 'views', pinned: 'Pinned', locked: 'Locked',
      by: 'by', ago: 'ago', just_now: 'just now', minutes: 'min', hours: 'h', days: 'd',
      reply: 'Reply', reply_placeholder: 'Write your reply...', send: 'Send', back: 'Back',
      like: 'Like', solution: 'Solution', edit: 'Edit', save: 'Save',
      empty_threads: 'No threads in this category', empty_posts: 'Be the first to reply',
      upgrade_required: 'Upgrade your plan to access this category',
      upgrade_btn: 'View Plans', locked_category: 'Requires higher plan',
      chat_rooms: 'Chat Rooms', chat_placeholder: 'Type a message...', chat_send: 'Send',
      chat_locked: 'Upgrade your plan to join this room', online: 'online',
      chat_empty: 'No messages yet. Be the first!',
      stats_threads: 'Total Threads', stats_posts: 'Total Posts', stats_messages: 'Chat Messages',
      stats_active: 'Active 24h', stats_insights: 'AI Insights', stats_countries: 'Countries',
      stats_top_cats: 'Top Categories', loading: 'Loading...', error: 'Error loading',
      all_categories: 'All Categories', filter_open: 'Open', filter_closed: 'Closed',
      filter_pinned: 'Pinned', moderated: 'Under review', ai_tags: 'Topics',
      sort_recent: 'Recent', sort_popular: 'Popular', page_prev: 'Previous', page_next: 'Next',
      thread_created: 'Thread created', reply_sent: 'Reply sent', post_liked: 'Like updated',
      post_edited: 'Post edited', suspended_msg: 'Your account is suspended. Read-only access.',
    },
    pt: {
      title: 'Comunidade', tab_forum: 'Forum', tab_chat: 'Chat ao Vivo', tab_stats: 'Estatisticas',
      categories: 'Categorias', threads: 'Topicos', new_thread: 'Novo Topico', search_placeholder: 'Buscar topicos...',
      thread_title: 'Titulo', thread_content: 'Conteudo', create: 'Criar', cancel: 'Cancelar',
      replies: 'respostas', views: 'visualizacoes', pinned: 'Fixado', locked: 'Bloqueado',
      by: 'por', ago: 'atras', just_now: 'agora', minutes: 'min', hours: 'h', days: 'd',
      reply: 'Responder', reply_placeholder: 'Escreva sua resposta...', send: 'Enviar', back: 'Voltar',
      like: 'Curtir', solution: 'Solucao', edit: 'Editar', save: 'Salvar',
      empty_threads: 'Nenhum topico nesta categoria', empty_posts: 'Seja o primeiro a responder',
      upgrade_required: 'Atualize seu plano para acessar esta categoria',
      upgrade_btn: 'Ver Planos', locked_category: 'Requer plano superior',
      chat_rooms: 'Salas de Chat', chat_placeholder: 'Digite uma mensagem...', chat_send: 'Enviar',
      chat_locked: 'Atualize seu plano para entrar nesta sala', online: 'online',
      chat_empty: 'Nenhuma mensagem ainda. Seja o primeiro!',
      stats_threads: 'Total Topicos', stats_posts: 'Total Posts', stats_messages: 'Mensagens Chat',
      stats_active: 'Ativos 24h', stats_insights: 'Insights AI', stats_countries: 'Paises',
      stats_top_cats: 'Categorias Populares', loading: 'Carregando...', error: 'Erro ao carregar',
      all_categories: 'Todas as Categorias', filter_open: 'Abertos', filter_closed: 'Fechados',
      filter_pinned: 'Fixados', moderated: 'Em revisao', ai_tags: 'Temas',
      sort_recent: 'Recentes', sort_popular: 'Populares', page_prev: 'Anterior', page_next: 'Proximo',
      thread_created: 'Topico criado', reply_sent: 'Resposta enviada', post_liked: 'Like atualizado',
      post_edited: 'Post editado', suspended_msg: 'Sua conta esta suspensa. Apenas leitura.',
    },
    fr: {
      title: 'Communaute', tab_forum: 'Forum', tab_chat: 'Chat en Direct', tab_stats: 'Statistiques',
      categories: 'Categories', threads: 'Fils', new_thread: 'Nouveau Fil', search_placeholder: 'Rechercher...',
      thread_title: 'Titre', thread_content: 'Contenu', create: 'Creer', cancel: 'Annuler',
      replies: 'reponses', views: 'vues', pinned: 'Epingle', locked: 'Verrouille',
      by: 'par', ago: 'il y a', just_now: 'maintenant', minutes: 'min', hours: 'h', days: 'j',
      reply: 'Repondre', reply_placeholder: 'Ecrivez votre reponse...', send: 'Envoyer', back: 'Retour',
      like: 'Aimer', solution: 'Solution', edit: 'Modifier', save: 'Sauvegarder',
      empty_threads: 'Aucun fil dans cette categorie', empty_posts: 'Soyez le premier a repondre',
      upgrade_required: 'Mettez a jour votre plan pour acceder',
      upgrade_btn: 'Voir les Plans', locked_category: 'Necessite un plan superieur',
      chat_rooms: 'Salons de Chat', chat_placeholder: 'Tapez un message...', chat_send: 'Envoyer',
      chat_locked: 'Mettez a jour votre plan pour rejoindre', online: 'en ligne',
      chat_empty: 'Aucun message. Soyez le premier!',
      stats_threads: 'Total Fils', stats_posts: 'Total Posts', stats_messages: 'Messages Chat',
      stats_active: 'Actifs 24h', stats_insights: 'Insights AI', stats_countries: 'Pays',
      stats_top_cats: 'Categories Populaires', loading: 'Chargement...', error: 'Erreur de chargement',
      all_categories: 'Toutes les Categories', filter_open: 'Ouverts', filter_closed: 'Fermes',
      filter_pinned: 'Epingles', moderated: 'En revision', ai_tags: 'Sujets',
      sort_recent: 'Recents', sort_popular: 'Populaires', page_prev: 'Precedent', page_next: 'Suivant',
      thread_created: 'Fil cree', reply_sent: 'Reponse envoyee', post_liked: 'Like mis a jour',
      post_edited: 'Post modifie', suspended_msg: 'Votre compte est suspendu. Lecture seule.',
    },
    de: {
      title: 'Gemeinschaft', tab_forum: 'Forum', tab_chat: 'Live-Chat', tab_stats: 'Statistiken',
      categories: 'Kategorien', threads: 'Themen', new_thread: 'Neues Thema', search_placeholder: 'Themen suchen...',
      thread_title: 'Titel', thread_content: 'Inhalt', create: 'Erstellen', cancel: 'Abbrechen',
      replies: 'Antworten', views: 'Aufrufe', pinned: 'Angepinnt', locked: 'Gesperrt',
      by: 'von', ago: 'vor', just_now: 'gerade', minutes: 'Min', hours: 'Std', days: 'T',
      reply: 'Antworten', reply_placeholder: 'Schreiben Sie Ihre Antwort...', send: 'Senden', back: 'Zuruck',
      like: 'Gefällt mir', solution: 'Lösung', edit: 'Bearbeiten', save: 'Speichern',
      empty_threads: 'Keine Themen in dieser Kategorie', empty_posts: 'Seien Sie der Erste',
      upgrade_required: 'Upgraden Sie Ihren Plan', upgrade_btn: 'Plane ansehen',
      locked_category: 'Erfordert hoheren Plan',
      chat_rooms: 'Chaträume', chat_placeholder: 'Nachricht eingeben...', chat_send: 'Senden',
      chat_locked: 'Upgrade fur diesen Raum erforderlich', online: 'online',
      chat_empty: 'Noch keine Nachrichten. Seien Sie der Erste!',
      stats_threads: 'Gesamt Themen', stats_posts: 'Gesamt Posts', stats_messages: 'Chat-Nachrichten',
      stats_active: 'Aktiv 24h', stats_insights: 'KI-Einblicke', stats_countries: 'Länder',
      stats_top_cats: 'Top-Kategorien', loading: 'Laden...', error: 'Fehler beim Laden',
      all_categories: 'Alle Kategorien', filter_open: 'Offen', filter_closed: 'Geschlossen',
      filter_pinned: 'Angepinnt', moderated: 'Wird uberpruft', ai_tags: 'Themen',
      sort_recent: 'Neueste', sort_popular: 'Beliebt', page_prev: 'Zuruck', page_next: 'Weiter',
      thread_created: 'Thema erstellt', reply_sent: 'Antwort gesendet', post_liked: 'Like aktualisiert',
      post_edited: 'Post bearbeitet', suspended_msg: 'Ihr Konto ist gesperrt. Nur Lesen.',
    },
    it: {
      title: 'Comunita', tab_forum: 'Forum', tab_chat: 'Chat dal Vivo', tab_stats: 'Statistiche',
      categories: 'Categorie', threads: 'Discussioni', new_thread: 'Nuova Discussione', search_placeholder: 'Cerca...',
      thread_title: 'Titolo', thread_content: 'Contenuto', create: 'Crea', cancel: 'Annulla',
      replies: 'risposte', views: 'visualizzazioni', pinned: 'Fissato', locked: 'Bloccato',
      by: 'di', ago: 'fa', just_now: 'adesso', minutes: 'min', hours: 'h', days: 'g',
      reply: 'Rispondi', reply_placeholder: 'Scrivi la tua risposta...', send: 'Invia', back: 'Indietro',
      like: 'Mi piace', solution: 'Soluzione', edit: 'Modifica', save: 'Salva',
      empty_threads: 'Nessuna discussione', empty_posts: 'Sii il primo a rispondere',
      upgrade_required: 'Aggiorna il tuo piano per accedere', upgrade_btn: 'Vedi Piani',
      locked_category: 'Richiede piano superiore',
      chat_rooms: 'Stanze Chat', chat_placeholder: 'Scrivi un messaggio...', chat_send: 'Invia',
      chat_locked: 'Aggiorna il tuo piano per unirti', online: 'online',
      chat_empty: 'Nessun messaggio. Sii il primo!',
      stats_threads: 'Totale Discussioni', stats_posts: 'Totale Post', stats_messages: 'Messaggi Chat',
      stats_active: 'Attivi 24h', stats_insights: 'Insights AI', stats_countries: 'Paesi',
      stats_top_cats: 'Categorie Popolari', loading: 'Caricamento...', error: 'Errore di caricamento',
      all_categories: 'Tutte le Categorie', filter_open: 'Aperti', filter_closed: 'Chiusi',
      filter_pinned: 'Fissati', moderated: 'In revisione', ai_tags: 'Argomenti',
      sort_recent: 'Recenti', sort_popular: 'Popolari', page_prev: 'Precedente', page_next: 'Successivo',
      thread_created: 'Discussione creata', reply_sent: 'Risposta inviata', post_liked: 'Like aggiornato',
      post_edited: 'Post modificato', suspended_msg: 'Il tuo account e sospeso. Solo lettura.',
    },
    ja: {
      title: '\u30B3\u30DF\u30E5\u30CB\u30C6\u30A3', tab_forum: '\u30D5\u30A9\u30FC\u30E9\u30E0', tab_chat: '\u30E9\u30A4\u30D6\u30C1\u30E3\u30C3\u30C8', tab_stats: '\u7D71\u8A08',
      categories: '\u30AB\u30C6\u30B4\u30EA', threads: '\u30B9\u30EC\u30C3\u30C9', new_thread: '\u65B0\u898F\u30B9\u30EC\u30C3\u30C9', search_placeholder: '\u30B9\u30EC\u30C3\u30C9\u3092\u691C\u7D22...',
      thread_title: '\u30BF\u30A4\u30C8\u30EB', thread_content: '\u5185\u5BB9', create: '\u4F5C\u6210', cancel: '\u30AD\u30E3\u30F3\u30BB\u30EB',
      replies: '\u8FD4\u4FE1', views: '\u8868\u793A', pinned: '\u56FA\u5B9A', locked: '\u30ED\u30C3\u30AF',
      by: '', ago: '\u524D', just_now: '\u305F\u3060\u4ECA', minutes: '\u5206', hours: '\u6642\u9593', days: '\u65E5',
      reply: '\u8FD4\u4FE1', reply_placeholder: '\u8FD4\u4FE1\u3092\u66F8\u304F...', send: '\u9001\u4FE1', back: '\u623B\u308B',
      like: '\u3044\u3044\u306D', solution: '\u89E3\u6C7A\u7B56', edit: '\u7DE8\u96C6', save: '\u4FDD\u5B58',
      empty_threads: '\u30B9\u30EC\u30C3\u30C9\u306A\u3057', empty_posts: '\u6700\u521D\u306E\u8FD4\u4FE1\u3092',
      upgrade_required: '\u30D7\u30E9\u30F3\u3092\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9', upgrade_btn: '\u30D7\u30E9\u30F3\u3092\u898B\u308B',
      locked_category: '\u4E0A\u4F4D\u30D7\u30E9\u30F3\u304C\u5FC5\u8981',
      chat_rooms: '\u30C1\u30E3\u30C3\u30C8\u30EB\u30FC\u30E0', chat_placeholder: '\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B...', chat_send: '\u9001\u4FE1',
      chat_locked: '\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u304C\u5FC5\u8981', online: '\u30AA\u30F3\u30E9\u30A4\u30F3',
      chat_empty: '\u30E1\u30C3\u30BB\u30FC\u30B8\u306A\u3057',
      stats_threads: '\u30B9\u30EC\u30C3\u30C9\u5408\u8A08', stats_posts: '\u30DD\u30B9\u30C8\u5408\u8A08', stats_messages: '\u30C1\u30E3\u30C3\u30C8\u30E1\u30C3\u30BB\u30FC\u30B8',
      stats_active: '24\u6642\u9593\u30A2\u30AF\u30C6\u30A3\u30D6', stats_insights: 'AI\u30A4\u30F3\u30B5\u30A4\u30C8', stats_countries: '\u56FD',
      stats_top_cats: '\u4EBA\u6C17\u30AB\u30C6\u30B4\u30EA', loading: '\u8AAD\u307F\u8FBC\u307F\u4E2D...', error: '\u30A8\u30E9\u30FC',
      all_categories: '\u5168\u30AB\u30C6\u30B4\u30EA', filter_open: '\u30AA\u30FC\u30D7\u30F3', filter_closed: '\u30AF\u30ED\u30FC\u30BA',
      filter_pinned: '\u56FA\u5B9A', moderated: '\u5BE9\u67FB\u4E2D', ai_tags: '\u30C8\u30D4\u30C3\u30AF',
      sort_recent: '\u6700\u65B0', sort_popular: '\u4EBA\u6C17', page_prev: '\u524D', page_next: '\u6B21',
      thread_created: '\u30B9\u30EC\u30C3\u30C9\u4F5C\u6210', reply_sent: '\u8FD4\u4FE1\u6E08\u307F', post_liked: '\u66F4\u65B0\u6E08\u307F',
      post_edited: '\u7DE8\u96C6\u6E08\u307F', suspended_msg: '\u30A2\u30AB\u30A6\u30F3\u30C8\u505C\u6B62\u4E2D',
    },
    zh: {
      title: '\u793E\u533A', tab_forum: '\u8BBA\u575B', tab_chat: '\u5B9E\u65F6\u804A\u5929', tab_stats: '\u7EDF\u8BA1',
      categories: '\u5206\u7C7B', threads: '\u4E3B\u9898', new_thread: '\u65B0\u4E3B\u9898', search_placeholder: '\u641C\u7D22\u4E3B\u9898...',
      thread_title: '\u6807\u9898', thread_content: '\u5185\u5BB9', create: '\u521B\u5EFA', cancel: '\u53D6\u6D88',
      replies: '\u56DE\u590D', views: '\u6D4F\u89C8', pinned: '\u7F6E\u9876', locked: '\u9501\u5B9A',
      by: '', ago: '\u524D', just_now: '\u521A\u521A', minutes: '\u5206\u949F', hours: '\u5C0F\u65F6', days: '\u5929',
      reply: '\u56DE\u590D', reply_placeholder: '\u5199\u56DE\u590D...', send: '\u53D1\u9001', back: '\u8FD4\u56DE',
      like: '\u70B9\u8D5E', solution: '\u89E3\u51B3\u65B9\u6848', edit: '\u7F16\u8F91', save: '\u4FDD\u5B58',
      empty_threads: '\u8BE5\u5206\u7C7B\u6CA1\u6709\u4E3B\u9898', empty_posts: '\u6210\u4E3A\u7B2C\u4E00\u4E2A\u56DE\u590D\u7684\u4EBA',
      upgrade_required: '\u5347\u7EA7\u8BA1\u5212\u4EE5\u8BBF\u95EE', upgrade_btn: '\u67E5\u770B\u8BA1\u5212',
      locked_category: '\u9700\u8981\u66F4\u9AD8\u7684\u8BA1\u5212',
      chat_rooms: '\u804A\u5929\u5BA4', chat_placeholder: '\u8F93\u5165\u6D88\u606F...', chat_send: '\u53D1\u9001',
      chat_locked: '\u5347\u7EA7\u4EE5\u52A0\u5165\u8BE5\u623F\u95F4', online: '\u5728\u7EBF',
      chat_empty: '\u6682\u65E0\u6D88\u606F',
      stats_threads: '\u4E3B\u9898\u603B\u6570', stats_posts: '\u5E16\u5B50\u603B\u6570', stats_messages: '\u804A\u5929\u6D88\u606F',
      stats_active: '24\u5C0F\u65F6\u6D3B\u8DC3', stats_insights: 'AI\u6D1E\u5BDF', stats_countries: '\u56FD\u5BB6',
      stats_top_cats: '\u70ED\u95E8\u5206\u7C7B', loading: '\u52A0\u8F7D\u4E2D...', error: '\u52A0\u8F7D\u9519\u8BEF',
      all_categories: '\u6240\u6709\u5206\u7C7B', filter_open: '\u5F00\u653E', filter_closed: '\u5173\u95ED',
      filter_pinned: '\u7F6E\u9876', moderated: '\u5BA1\u6838\u4E2D', ai_tags: '\u8BDD\u9898',
      sort_recent: '\u6700\u65B0', sort_popular: '\u70ED\u95E8', page_prev: '\u4E0A\u4E00\u9875', page_next: '\u4E0B\u4E00\u9875',
      thread_created: '\u4E3B\u9898\u5DF2\u521B\u5EFA', reply_sent: '\u56DE\u590D\u5DF2\u53D1\u9001', post_liked: '\u5DF2\u66F4\u65B0',
      post_edited: '\u5DF2\u7F16\u8F91', suspended_msg: '\u8D26\u6237\u5DF2\u6682\u505C\u3002\u53EA\u8BFB\u8BBF\u95EE\u3002',
    }
  };
  const lang = getLang();
  const d = _L[lang] || _L.es;
  const es = _L.es;
  const en = _L.en;
  return new Proxy({}, { get: (_, k) => d[k] || es[k] || en[k] || k });
}

// ── Time ago helper ────────────────────────────────────────
function _timeAgo(dateStr, lbl) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return lbl.just_now;
  if (diff < 3600) return `${Math.floor(diff / 60)} ${lbl.minutes} ${lbl.ago}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${lbl.hours} ${lbl.ago}`;
  return `${Math.floor(diff / 86400)} ${lbl.days} ${lbl.ago}`;
}

class EggCommunity extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tab = 'forum';
    this._categories = [];
    this._threads = [];
    this._selectedCategory = null;
    this._selectedThread = null;
    this._threadPosts = [];
    this._chatRooms = [];
    this._chatMessages = [];
    this._selectedRoom = null;
    this._stats = null;
    this._search = '';
    this._page = 1;
    this._showNewThread = false;
    this._editingPost = null;
    this._unsubs = [];
    this._chatPollInterval = null;
  }

  connectedCallback() {
    this.render();
    this._loadCategories();
    this._unsubs.push(
      Bus.on('lang:changed', () => this.render())
    );
  }

  disconnectedCallback() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    if (this._chatPollInterval) clearInterval(this._chatPollInterval);
  }

  async render() {
    const lbl = _cL();
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="community-root">
        <div class="comm-header">
          <h1>${lbl.title}</h1>
          <div class="comm-tabs">
            <button class="comm-tab ${this._tab === 'forum' ? 'active' : ''}" data-tab="forum">${lbl.tab_forum}</button>
            <button class="comm-tab ${this._tab === 'chat' ? 'active' : ''}" data-tab="chat">${lbl.tab_chat}</button>
            <button class="comm-tab ${this._tab === 'stats' ? 'active' : ''}" data-tab="stats">${lbl.tab_stats}</button>
          </div>
        </div>
        <div class="comm-content" data-ref="content">
          ${this._tab === 'forum' ? this._renderForum(lbl) :
            this._tab === 'chat' ? this._renderChat(lbl) :
            this._renderStats(lbl)}
        </div>
      </div>`;
    this._bind();

    // Auto-load data for active tab
    if (this._tab === 'chat' && !this._chatRooms.length) this._loadRooms();
    if (this._tab === 'stats' && !this._stats) this._loadStats();
  }

  // ── Forum Rendering ─────────────────────────────────────────

  _renderForum(lbl) {
    if (this._selectedThread) return this._renderThreadDetail(lbl);
    return `
      <div class="forum-layout">
        <aside class="forum-sidebar">
          <h3>${lbl.categories}</h3>
          <ul class="cat-list">
            <li class="cat-item ${!this._selectedCategory ? 'active' : ''}" data-action="cat-select" data-id="">${lbl.all_categories}
            </li>
            ${this._categories.map(c => `
              <li class="cat-item ${this._selectedCategory === c.id ? 'active' : ''} ${c.locked ? 'locked' : ''}"
                  data-action="cat-select" data-id="${c.id}">
                ${c.icon || ''} ${c.name}
                ${c.locked ? `<span class="lock-badge"></span>` : ''}
              </li>
            `).join('')}
          </ul>
        </aside>
        <main class="forum-main">
          <div class="forum-toolbar">
            <input type="text" class="comm-input" placeholder="${lbl.search_placeholder}"
                   value="${this._search}" data-ref="thread-search">
            <button class="comm-btn comm-btn-primary" data-action="new-thread">${lbl.new_thread}</button>
          </div>
          ${this._showNewThread ? this._renderNewThreadForm(lbl) : ''}
          <div class="thread-list">
            ${this._threads.length ? this._threads.map(th => `
              <div class="thread-card" data-action="open-thread" data-id="${th.id}">
                <div class="thread-meta-left">
                  ${th.is_pinned ? `<span class="badge badge-pin">${lbl.pinned}</span>` : ''}
                  ${th.is_locked ? `<span class="badge badge-lock"></span>` : ''}
                  <h3 class="thread-title">${sanitizeHTML(th.title)}</h3>
                  <span class="thread-author">${lbl.by} <strong>${th.author_name || 'Anonymous'}</strong> · ${_timeAgo(th.created_at, lbl)}</span>
                  ${th.ai_tags ? `<div class="thread-tags">${th.ai_tags.split(',').map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
                </div>
                <div class="thread-stats">
                  <span>${th.reply_count} ${lbl.replies}</span>
                  <span>${th.view_count} ${lbl.views}</span>
                </div>
              </div>
            `).join('') : `<div class="empty-state">${lbl.empty_threads}</div>`}
          </div>
          ${this._threads.length >= 20 ? `
            <div class="pagination">
              ${this._page > 1 ? `<button class="comm-btn" data-action="page-prev">← ${lbl.page_prev}</button>` : ''}
              <span>Pagina ${this._page}</span>
              <button class="comm-btn" data-action="page-next">${lbl.page_next} →</button>
            </div>
          ` : ''}
        </main>
      </div>`;
  }

  _renderNewThreadForm(lbl) {
    const unlocked = this._categories.filter(c => !c.locked);
    return `
      <div class="new-thread-form">
        <select data-ref="nt-category" class="comm-select">
          ${unlocked.map(c => `<option value="${c.id}" ${this._selectedCategory === c.id ? 'selected' : ''}>${c.icon || ''} ${c.name}</option>`).join('')}
        </select>
        <input type="text" class="comm-input" placeholder="${lbl.thread_title}" data-ref="nt-title" maxlength="300">
        <textarea class="comm-textarea" placeholder="${lbl.thread_content}" data-ref="nt-content" rows="5" maxlength="10000"></textarea>
        <div class="form-actions">
          <button class="comm-btn comm-btn-primary" data-action="submit-thread">${lbl.create}</button>
          <button class="comm-btn" data-action="cancel-thread">${lbl.cancel}</button>
        </div>
      </div>`;
  }

  _renderThreadDetail(lbl) {
    const th = this._selectedThread;
    return `
      <div class="thread-detail">
        <button class="comm-btn" data-action="back-to-list" style="margin-bottom:12px;">← ${lbl.back}</button>
        <div class="thread-header">
          <h2>${sanitizeHTML(th.title)}</h2>
          <span class="thread-author">${lbl.by} <strong>${th.author_name || 'Anonymous'}</strong> · ${_timeAgo(th.created_at, lbl)} · ${th.view_count} ${lbl.views}</span>
          ${th.ai_tags ? `<div class="thread-tags">${th.ai_tags.split(',').map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
        </div>
        <div class="posts-list">
          ${this._threadPosts.map((p, i) => `
            <div class="post-card ${p.is_solution ? 'post-solution' : ''} ${p.moderation_status === 'flagged' ? 'post-flagged' : ''}">
              <div class="post-header">
                <strong>${p.author_name || 'Anonymous'}</strong>
                <span class="post-time">${_timeAgo(p.created_at, lbl)}</span>
                ${p.is_solution ? `<span class="badge badge-solution">${lbl.solution}</span>` : ''}
                ${p.moderation_status === 'flagged' ? `<span class="badge badge-flagged">${lbl.moderated}</span>` : ''}
              </div>
              ${this._editingPost === p.id ? `
                <textarea class="comm-textarea" data-ref="edit-content" rows="4">${sanitizeHTML(p.content)}</textarea>
                <div class="form-actions">
                  <button class="comm-btn comm-btn-primary" data-action="save-edit" data-id="${p.id}">${lbl.save}</button>
                  <button class="comm-btn" data-action="cancel-edit">${lbl.cancel}</button>
                </div>
              ` : `
                <div class="post-body">${sanitizeHTML(p.content)}</div>
              `}
              <div class="post-actions">
                <button class="comm-btn-sm" data-action="like-post" data-id="${p.id}">${p.likes_count}</button>
                ${p.author_id === (getCurrentUser()?.id || '') ? `<button class="comm-btn-sm" data-action="edit-post" data-id="${p.id}">${lbl.edit}</button>` : ''}
              </div>
            </div>
          `).join('') || `<div class="empty-state">${lbl.empty_posts}</div>`}
        </div>
        ${!th.is_locked ? `
          <div class="reply-box">
            <textarea class="comm-textarea" data-ref="reply-content" placeholder="${lbl.reply_placeholder}" rows="3" maxlength="10000"></textarea>
            <button class="comm-btn comm-btn-primary" data-action="submit-reply">${lbl.send}</button>
          </div>
        ` : ''}
      </div>`;
  }

  // ── Chat Rendering ──────────────────────────────────────────

  _renderChat(lbl) {
    if (this._selectedRoom) return this._renderChatRoom(lbl);
    return `
      <div class="chat-layout">
        <h3>${lbl.chat_rooms}</h3>
        <div class="room-grid">
          ${this._chatRooms.map(r => `
            <div class="room-card ${r.locked ? 'locked' : ''}" data-action="open-room" data-id="${r.id}" data-slug="${r.slug}">
              <span class="room-icon">${r.icon || ''}</span>
              <h4>${r.name}</h4>
              <p class="room-desc">${r.description || ''}</p>
              ${r.locked ? `<span class="lock-overlay">${lbl.chat_locked}</span>` : ''}
            </div>
          `).join('') || `<div class="empty-state">${lbl.loading}</div>`}
        </div>
      </div>`;
  }

  _renderChatRoom(lbl) {
    const room = this._selectedRoom;
    return `
      <div class="chatroom-layout">
        <div class="chatroom-header">
          <button class="comm-btn" data-action="back-to-rooms">← ${lbl.back}</button>
          <h3>${room.icon || ''} ${room.name}</h3>
        </div>
        <div class="chatroom-messages" data-ref="chat-scroll">
          ${this._chatMessages.length ? this._chatMessages.map(m => `
            <div class="chat-msg ${m.is_ai ? 'chat-ai' : ''} ${m.author_id === (getCurrentUser()?.id || '') ? 'chat-own' : ''}">
              <span class="chat-author">${m.is_ai ? 'AI' : (m.author_name || 'Anonymous')}</span>
              <span class="chat-text">${sanitizeHTML(m.content)}</span>
              <span class="chat-time">${_timeAgo(m.created_at, lbl)}</span>
            </div>
          `).join('') : `<div class="empty-state">${lbl.chat_empty}</div>`}
        </div>
        <div class="chatroom-input">
          <input type="text" class="comm-input" data-ref="chat-input" placeholder="${lbl.chat_placeholder}" maxlength="2000">
          <button class="comm-btn comm-btn-primary" data-action="send-chat">${lbl.chat_send}</button>
        </div>
      </div>`;
  }

  // ── Stats Rendering ─────────────────────────────────────────

  _renderStats(lbl) {
    if (!this._stats) return `<div class="empty-state">${lbl.loading}</div>`;
    const s = this._stats;
    return `
      <div class="stats-layout">
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-num">${s.total_threads}</span><span class="stat-label">${lbl.stats_threads}</span></div>
          <div class="stat-card"><span class="stat-num">${s.total_posts}</span><span class="stat-label">${lbl.stats_posts}</span></div>
          <div class="stat-card"><span class="stat-num">${s.total_chat_messages}</span><span class="stat-label">${lbl.stats_messages}</span></div>
          <div class="stat-card"><span class="stat-num">${s.active_users_24h}</span><span class="stat-label">${lbl.stats_active}</span></div>
          <div class="stat-card"><span class="stat-num">${s.ai_insights_count}</span><span class="stat-label">${lbl.stats_insights}</span></div>
          <div class="stat-card"><span class="stat-num">${s.countries_active}</span><span class="stat-label">${lbl.stats_countries}</span></div>
        </div>
        ${s.top_categories?.length ? `
          <h3 style="margin-top:24px;">${lbl.stats_top_cats}</h3>
          <div class="top-cats">
            ${s.top_categories.map(c => `
              <div class="top-cat-bar">
                <span class="top-cat-name">${c.name}</span>
                <div class="top-cat-fill" style="width:${Math.min(100, (c.threads / Math.max(...s.top_categories.map(x => x.threads))) * 100)}%"></div>
                <span class="top-cat-count">${c.threads}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>`;
  }

  // ── Event Binding ───────────────────────────────────────────

  _bind() {
    const sr = this.shadowRoot;

    // Tab switching
    sr.querySelectorAll('.comm-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._tab = btn.dataset.tab;
        this.render();
      });
    });

    // Action delegation
    sr.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case 'cat-select': this._selectCategory(btn.dataset.id); break;
        case 'new-thread': this._showNewThread = !this._showNewThread; this.render(); break;
        case 'cancel-thread': this._showNewThread = false; this.render(); break;
        case 'submit-thread': this._submitThread(); break;
        case 'open-thread': this._openThread(btn.dataset.id); break;
        case 'back-to-list': this._selectedThread = null; this._threadPosts = []; this.render(); break;
        case 'submit-reply': this._submitReply(); break;
        case 'like-post': this._likePost(btn.dataset.id); break;
        case 'edit-post': this._editingPost = btn.dataset.id; this.render(); break;
        case 'cancel-edit': this._editingPost = null; this.render(); break;
        case 'save-edit': this._saveEdit(btn.dataset.id); break;
        case 'page-prev': this._page = Math.max(1, this._page - 1); this._loadThreads(); break;
        case 'page-next': this._page++; this._loadThreads(); break;
        case 'open-room': if (!btn.closest('.locked')) this._openRoom(btn.dataset.id); break;
        case 'back-to-rooms': this._selectedRoom = null; this._chatMessages = []; if (this._chatPollInterval) clearInterval(this._chatPollInterval); this.render(); break;
        case 'send-chat': this._sendChat(); break;
      }
    });

    // Search debounce
    const searchInput = sr.querySelector('[data-ref="thread-search"]');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => {
          this._search = searchInput.value;
          this._page = 1;
          this._loadThreads();
        }, 400);
      });
    }

    // Chat enter key
    const chatInput = sr.querySelector('[data-ref="chat-input"]');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendChat(); }
      });
    }

    // Auto-scroll chat
    const chatScroll = sr.querySelector('[data-ref="chat-scroll"]');
    if (chatScroll) chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  // ── API Methods ─────────────────────────────────────────────

  async _loadCategories() {
    try {
      this._categories = await apiService.request('GET', '/community/categories');
      this._loadThreads();
    } catch (err) { Bus.emit('toast', { msg: _cL().error + ': ' + err.message, type: 'error' }); }
  }

  async _loadThreads() {
    try {
      const params = new URLSearchParams();
      if (this._selectedCategory) params.set('category_id', this._selectedCategory);
      if (this._search) params.set('search', this._search);
      params.set('page', this._page);
      params.set('size', 20);
      this._threads = await apiService.request('GET', `/community/threads?${params}`);
      this.render();
    } catch (err) { Bus.emit('toast', { msg: _cL().error + ': ' + err.message, type: 'error' }); }
  }

  _selectCategory(id) {
    const cat = this._categories.find(c => c.id === id);
    if (cat && cat.locked) {
      Bus.emit('toast', { msg: _cL().upgrade_required, type: 'warning' });
      return;
    }
    this._selectedCategory = id || null;
    this._page = 1;
    this._loadThreads();
  }

  async _openThread(id) {
    try {
      const detail = await apiService.request('GET', `/community/threads/${id}`);
      this._selectedThread = detail;
      this._threadPosts = detail.posts || [];
      this.render();
    } catch (err) { Bus.emit('toast', { msg: _cL().error + ': ' + err.message, type: 'error' }); }
  }

  async _submitThread() {
    const lbl = _cL();
    const sr = this.shadowRoot;
    const category_id = sr.querySelector('[data-ref="nt-category"]')?.value;
    const title = sr.querySelector('[data-ref="nt-title"]')?.value?.trim();
    const content = sr.querySelector('[data-ref="nt-content"]')?.value?.trim();
    if (!title || title.length < 5 || !content || content.length < 10) {
      Bus.emit('toast', { msg: 'Title (5+ chars) and content (10+ chars) required', type: 'error' });
      return;
    }
    try {
      await apiService.request('POST', '/community/threads', { category_id, title, content });
      Bus.emit('toast', { msg: lbl.thread_created });
      this._showNewThread = false;
      this._loadThreads();
    } catch (err) { Bus.emit('toast', { msg: err.message, type: 'error' }); }
  }

  async _submitReply() {
    const lbl = _cL();
    const content = this.shadowRoot.querySelector('[data-ref="reply-content"]')?.value?.trim();
    if (!content) return;
    try {
      await apiService.request('POST', '/community/posts', {
        thread_id: this._selectedThread.id,
        content
      });
      Bus.emit('toast', { msg: lbl.reply_sent });
      this._openThread(this._selectedThread.id); // Reload
    } catch (err) { Bus.emit('toast', { msg: err.message, type: 'error' }); }
  }

  async _likePost(postId) {
    try {
      await apiService.request('POST', `/community/posts/${postId}/like`);
      Bus.emit('toast', { msg: _cL().post_liked });
      this._openThread(this._selectedThread.id);
    } catch (err) { Bus.emit('toast', { msg: err.message, type: 'error' }); }
  }

  async _saveEdit(postId) {
    const content = this.shadowRoot.querySelector('[data-ref="edit-content"]')?.value?.trim();
    if (!content) return;
    try {
      await apiService.request('PUT', `/community/posts/${postId}`, { content });
      Bus.emit('toast', { msg: _cL().post_edited });
      this._editingPost = null;
      this._openThread(this._selectedThread.id);
    } catch (err) { Bus.emit('toast', { msg: err.message, type: 'error' }); }
  }

  // ── Chat Methods ────────────────────────────────────────────

  async _loadRooms() {
    try {
      this._chatRooms = await apiService.request('GET', '/community/rooms');
      this.render();
    } catch (err) { Bus.emit('toast', { msg: _cL().error + ': ' + err.message, type: 'error' }); }
  }

  async _openRoom(id) {
    const room = this._chatRooms.find(r => r.id === id);
    if (!room || room.locked) return;
    this._selectedRoom = room;
    try {
      this._chatMessages = await apiService.request('GET', `/community/rooms/${id}/messages`);
    } catch { this._chatMessages = []; }
    this.render();
    // Poll for new messages every 5s
    if (this._chatPollInterval) clearInterval(this._chatPollInterval);
    this._chatPollInterval = setInterval(() => this._pollMessages(id), 5000);
  }

  async _pollMessages(roomId) {
    try {
      const msgs = await apiService.request('GET', `/community/rooms/${roomId}/messages`);
      if (msgs.length !== this._chatMessages.length) {
        this._chatMessages = msgs;
        this.render();
      }
    } catch { /* ignore poll errors */ }
  }

  async _sendChat() {
    const input = this.shadowRoot.querySelector('[data-ref="chat-input"]');
    const content = input?.value?.trim();
    if (!content || !this._selectedRoom) return;
    try {
      await apiService.request('POST', `/community/rooms/${this._selectedRoom.id}/messages`, {
        room_id: this._selectedRoom.id,
        content
      });
      input.value = '';
      // Immediate refresh
      this._chatMessages = await apiService.request('GET', `/community/rooms/${this._selectedRoom.id}/messages`);
      this.render();
    } catch (err) { Bus.emit('toast', { msg: err.message, type: 'error' }); }
  }

  // ── Stats Methods ───────────────────────────────────────────

  async _loadStats() {
    try {
      this._stats = await apiService.request('GET', '/community/stats');
      this.render();
    } catch (err) { Bus.emit('toast', { msg: _cL().error + ': ' + err.message, type: 'error' }); }
  }

  // ── Styles ──────────────────────────────────────────────────

  _styles() {
    return `
      :host { display: block; width: 100%; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .community-root {
        max-width: 1200px; margin: 0 auto; padding: 20px;
        font-family: var(--font, 'Inter', system-ui, sans-serif);
        color: var(--text, #1e293b);
      }

      .comm-header {
        display: flex; justify-content: space-between; align-items: center;
        flex-wrap: wrap; gap: 12px; margin-bottom: 20px;
      }
      .comm-header h1 { font-size: 1.6em; font-weight: 700; }

      .comm-tabs { display: flex; gap: 4px; background: #f1f5f9; border-radius: 10px; padding: 4px; }
      .comm-tab {
        padding: 8px 16px; border: none; background: none; border-radius: 8px;
        cursor: pointer; font-size: 14px; font-weight: 500; color: #64748b;
        transition: all .2s;
      }
      .comm-tab:hover { background: #e2e8f0; }
      .comm-tab.active { background: #fff; color: #1565C0; box-shadow: 0 1px 3px rgba(0,0,0,.1); font-weight: 600; }

      /* ── Forum Layout ── */
      .forum-layout { display: flex; gap: 20px; }
      .forum-sidebar { width: 240px; flex-shrink: 0; }
      .forum-sidebar h3 { font-size: 14px; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; letter-spacing: .05em; }
      .forum-main { flex: 1; min-width: 0; }

      .cat-list { list-style: none; }
      .cat-item {
        padding: 8px 12px; border-radius: 8px; cursor: pointer;
        font-size: 14px; display: flex; align-items: center; gap: 8px;
        transition: background .15s; margin-bottom: 2px;
      }
      .cat-item:hover { background: #f1f5f9; }
      .cat-item.active { background: #dbeafe; color: #1565C0; font-weight: 600; }
      .cat-item.locked { opacity: .55; }
      .lock-badge { margin-left: auto; font-size: 12px; }

      .forum-toolbar { display: flex; gap: 8px; margin-bottom: 16px; }

      .comm-input {
        flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
        font-size: 14px; outline: none; transition: border .2s;
      }
      .comm-input:focus { border-color: #1565C0; }
      .comm-select { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
      .comm-textarea {
        width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
        font-size: 14px; resize: vertical; font-family: inherit; outline: none;
      }
      .comm-textarea:focus { border-color: #1565C0; }

      .comm-btn {
        padding: 8px 16px; border: 1px solid #e2e8f0; background: #fff; border-radius: 8px;
        cursor: pointer; font-size: 13px; font-weight: 500; transition: all .15s;
      }
      .comm-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
      .comm-btn-primary { background: #1565C0; color: #fff; border-color: #1565C0; }
      .comm-btn-primary:hover { background: #1256a8; }
      .comm-btn-sm {
        padding: 4px 10px; border: 1px solid #e2e8f0; background: #fff; border-radius: 6px;
        cursor: pointer; font-size: 12px; transition: all .15s;
      }
      .comm-btn-sm:hover { background: #f1f5f9; }

      /* ── Thread Cards ── */
      .thread-card {
        display: flex; justify-content: space-between; align-items: center;
        padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px;
        margin-bottom: 8px; cursor: pointer; transition: all .15s;
      }
      .thread-card:hover { border-color: #1565C0; background: #f8fafc; transform: translateX(2px); }
      .thread-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
      .thread-author { font-size: 12px; color: #94a3b8; }
      .thread-stats { display: flex; gap: 12px; font-size: 12px; color: #94a3b8; flex-shrink: 0; }
      .thread-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
      .tag { font-size: 11px; padding: 2px 8px; background: #eff6ff; color: #1565C0; border-radius: 12px; }

      .badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
      .badge-pin { background: #fef3c7; color: #92400e; }
      .badge-lock { background: #fee2e2; color: #991b1b; }
      .badge-solution { background: #d1fae5; color: #065f46; }
      .badge-flagged { background: #fef3c7; color: #92400e; }

      /* ── New Thread Form ── */
      .new-thread-form {
        display: flex; flex-direction: column; gap: 10px;
        padding: 16px; border: 1px solid #dbeafe; border-radius: 10px;
        background: #f8fafc; margin-bottom: 16px;
      }
      .form-actions { display: flex; gap: 8px; }

      /* ── Thread Detail ── */
      .thread-detail { }
      .thread-header { margin-bottom: 20px; }
      .thread-header h2 { font-size: 1.4em; margin-bottom: 4px; }

      .posts-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
      .post-card {
        padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px;
        background: #fff;
      }
      .post-solution { border-color: #10b981; background: #f0fdf4; }
      .post-flagged { border-color: #f59e0b; background: #fffbeb; }
      .post-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
      .post-time { color: #94a3b8; }
      .post-body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
      .post-actions { display: flex; gap: 8px; margin-top: 10px; }

      .reply-box { display: flex; flex-direction: column; gap: 8px; }

      /* ── Chat ── */
      .room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
      .room-card {
        padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;
        cursor: pointer; transition: all .15s; text-align: center; position: relative;
      }
      .room-card:hover { border-color: #1565C0; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.06); }
      .room-card.locked { opacity: .5; cursor: default; }
      .room-card.locked:hover { transform: none; border-color: #e2e8f0; }
      .room-icon { font-size: 2em; display: block; margin-bottom: 8px; }
      .room-card h4 { font-size: 15px; margin-bottom: 4px; }
      .room-desc { font-size: 12px; color: #94a3b8; }
      .lock-overlay {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,.8); border-radius: 12px; font-size: 12px; color: #94a3b8;
      }

      .chatroom-layout { display: flex; flex-direction: column; height: calc(100vh - 220px); }
      .chatroom-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
      .chatroom-header h3 { font-size: 1.1em; }
      .chatroom-messages {
        flex: 1; overflow-y: auto; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px;
        background: #f8fafc; display: flex; flex-direction: column; gap: 8px;
      }
      .chat-msg {
        max-width: 75%; padding: 8px 12px; border-radius: 12px;
        font-size: 14px; background: #fff; border: 1px solid #e2e8f0;
        align-self: flex-start;
      }
      .chat-msg.chat-own { align-self: flex-end; background: #dbeafe; border-color: #93c5fd; }
      .chat-msg.chat-ai { background: #f0fdf4; border-color: #86efac; }
      .chat-author { font-size: 11px; font-weight: 600; color: #1565C0; display: block; margin-bottom: 2px; }
      .chat-text { display: block; line-height: 1.4; word-break: break-word; }
      .chat-time { font-size: 10px; color: #94a3b8; display: block; text-align: right; margin-top: 2px; }
      .chatroom-input { display: flex; gap: 8px; margin-top: 12px; }

      /* ── Stats ── */
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
      .stat-card {
        padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;
        text-align: center; background: #fff;
      }
      .stat-num { display: block; font-size: 2em; font-weight: 700; color: #1565C0; }
      .stat-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }

      .top-cats { display: flex; flex-direction: column; gap: 8px; }
      .top-cat-bar { display: flex; align-items: center; gap: 12px; }
      .top-cat-name { width: 140px; font-size: 14px; font-weight: 500; flex-shrink: 0; }
      .top-cat-fill {
        height: 24px; background: linear-gradient(90deg, #1565C0, #42a5f5);
        border-radius: 6px; transition: width .3s;
      }
      .top-cat-count { font-size: 13px; color: #64748b; font-weight: 600; width: 40px; text-align: right; }

      .empty-state { text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 14px; }
      .pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 16px; }

      /* ── Responsive ── */
      @media (max-width: 768px) {
        .forum-layout { flex-direction: column; }
        .forum-sidebar { width: 100%; }
        .cat-list { display: flex; overflow-x: auto; gap: 4px; padding-bottom: 8px; }
        .cat-item { white-space: nowrap; flex-shrink: 0; }
        .thread-card { flex-direction: column; align-items: flex-start; gap: 8px; }
        .thread-stats { align-self: flex-end; }
        .chat-msg { max-width: 90%; }
        .stats-grid { grid-template-columns: repeat(2, 1fr); }
        .room-grid { grid-template-columns: repeat(2, 1fr); }
      }

      @media (max-width: 480px) {
        .comm-header { flex-direction: column; align-items: flex-start; }
        .stats-grid { grid-template-columns: 1fr 1fr; }
        .room-grid { grid-template-columns: 1fr; }
      }
    `;
  }
}

customElements.define('egg-community', EggCommunity);
