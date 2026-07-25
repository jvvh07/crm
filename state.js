/**
 * IBEX CRM — IbexState
 * Motor de estado reativo centralizado
 *
 * Responsabilidades:
 *   → Estado global único e previsível
 *   → Observer pattern para reatividade entre módulos
 *   → Sincronização com IbexStorage
 *   → Computação de estado derivado
 *   → Event bus para comunicação desacoplada
 *   → Controle de UI transversal (sidebar, modais, toasts, busca global)
 *
 * Padrão: Centralized Store + Observer
 * Comunicação: Custom Events no `document`
 *
 * @version 1.0.0
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────── */

const APP_PAGES = Object.freeze({
  DASHBOARD:   'dashboard',
  PIPELINE:    'pipeline',
  LEADS:       'leads',
  ANALYTICS:   'analytics',
  TASKS:       'tasks',
  INBOX:       'inbox',
  PROPOSALS:   'proposals',
  REPORTS:     'reports',
  SETTINGS:    'settings',
});

const FILTER_DEFAULTS = Object.freeze({
  stage:      'all',
  source:     'all',
  owner:      'all',
  priority:   'all',
  tag:        'all',
  period:     'this_month',
  sortBy:     'updatedAt',
  sortDir:    'desc',
  query:      '',
  heatMin:    0,
  dealMin:    0,
  dealMax:    Infinity,
});

/* ─────────────────────────────────────────────────────────────────────────────
   CLASS: IbexEventBus
   Decoupled pub/sub on top of Custom Events
   ───────────────────────────────────────────────────────────────────────── */

class IbexEventBus {

  constructor() {
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe callback
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);

    /* Also bind to document CustomEvents for cross-module integration */
    const wrapped = (e) => handler(e.detail);
    document.addEventListener(event, wrapped);

    /* Return unsubscribe function */
    return () => {
      this._listeners.get(event)?.delete(handler);
      document.removeEventListener(event, wrapped);
    };
  }

  /**
   * Subscribe once — auto-removes after first call.
   */
  once(event, handler) {
    const unsub = this.on(event, (...args) => {
      handler(...args);
      unsub();
    });
    return unsub;
  }

  /**
   * Emit an event.
   */
  emit(event, detail = {}) {
    document.dispatchEvent(new CustomEvent(event, { detail, bubbles: true, composed: true }));
  }

  /**
   * Remove all listeners for an event.
   */
  off(event) {
    this._listeners.delete(event);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   CLASS: IbexStateManager
   ───────────────────────────────────────────────────────────────────────── */

class IbexStateManager {

  constructor(storage) {
    if (!storage || !(storage instanceof IbexStorage)) {
      throw new Error('[IbexState] Requires a valid IbexStorage instance.');
    }

    this._storage   = storage;
    this._bus       = new IbexEventBus();
    this._observers = new Map();         /* key → Set<callback> */

    /* ── Core state object ──────────────────────────────────────────────── */
    this._state = {

      /* App navigation — detect from DOM first, fallback to dashboard */
      page:             (document.querySelector('.page[data-page]:not(.hidden)')?.dataset?.page)
                        || (document.querySelector('.page[data-page]')?.dataset?.page)
                        || APP_PAGES.DASHBOARD,

      prevPage:         null,
      isNavigating:     false,

      /* Auth/User */
      currentUser:      null,
      team:             [],

      /* Data collections (in-memory mirrors of localStorage) */
      leads:            [],
      tasks:            [],
      activities:       [],
      pipeline:         [],
      notifications:    [],
      products:         [],
      tags:             [],
      users:            [],
      automations:      [],
      metrics:          [],
      goals:            {},
      settings:         {},

      /* Computed / derived */
      kpis:             {},
      filteredLeads:    [],
      searchResults:    [],

      /* Active filters */
      filters:          { ...FILTER_DEFAULTS },

      /* UI state */
      ui: {
        sidebarOpen:        true,
        sidebarCollapsed:   false,
        searchOpen:         false,
        searchQuery:        '',
        activeModal:        null,      /* modal id string */
        modalData:          null,      /* any data passed to modal */
        activeDropdown:     null,
        activeLead:         null,      /* lead id currently in detail view */
        activeTask:         null,
        selectedLeads:      new Set(), /* multi-select */
        toasts:             [],        /* active toast queue */
        isLoading:          false,
        loadingTarget:      null,      /* granular loading (e.g. 'pipeline') */
        isDragging:         false,
        draggedLeadId:      null,
        theme:              'dark',
        breakpoint:         'desktop', /* 'mobile' | 'tablet' | 'desktop' */
      },
    };

    this._initState();
    this._bindStorageEvents();
    this._bindKeyboard();
    this._trackBreakpoint();
  }

  /* ── Initialization ───────────────────────────────────────────────────── */

  async _initState() {
    /* Load all data from storage into memory */
    const s = this._storage;

    try {
      // 1. Sync with backend cache
      await s._initStorage();

      // 2. Read from cache (synchronously or wrapped in async)
      this._set('leads',         s.getLeads({ includeArchived: false }));
      this._set('tasks',         s.getTasks());
      this._set('automations',   s.getAutomations());
      this._set('settings',      s.getSettings());
      
      // Fallbacks for others
      this._set('activities',    s.getActivities());
      this._set('pipeline',      s.getPipelineStages());
      this._set('notifications', s.getNotifications());
      this._set('products',      s.getProducts ? s.getProducts() : []);
      this._set('tags',          s.getTags());
      this._set('users',         s.getUsers());
      this._set('metrics',       s.getMetrics ? s.getMetrics() : []);
      this._set('goals',         s.getGoals ? s.getGoals() : {});
      this._set('currentUser',   s.getCurrentUser());

      /* Apply persisted settings to UI state */
      const currentSettings = this._state.settings || {};
      this._state.ui.theme            = currentSettings.theme || 'dark';
      this._state.ui.sidebarCollapsed = currentSettings.sidebarCollapsed === 'true' || currentSettings.sidebarCollapsed === true;

      /* Apply theme to document */
      this._applyTheme(this._state.ui.theme);

      /* Compute initial derived state */
      this._deriveKPIs();
      this._applyFilters();

      console.info('[IbexState] Initialized. Leads from Backend:', this._state.leads.length);
    } catch (e) {
      console.error('[IbexState] Initialization failed:', e);
    }
  }

  /* ── Reactive storage event bindings ──────────────────────────────────── */

  _bindStorageEvents() {
    /* Leads */
    document.addEventListener('ibex:lead:created', (e) => {
      const leads = [...this._state.leads, e.detail.lead];
      this._set('leads', leads);
      this._deriveKPIs();
      this._applyFilters();
    });

    document.addEventListener('ibex:lead:updated', (e) => {
      const leads = this._state.leads.map(l =>
        l.id === e.detail.lead.id ? e.detail.lead : l
      );
      this._set('leads', leads);
      if (e.detail.stageChanged) {
        this._deriveKPIs();
      }
      this._applyFilters();
    });

    document.addEventListener('ibex:lead:deleted', (e) => {
      const leads = this._state.leads.filter(l => l.id !== e.detail.id);
      this._set('leads', leads);
      this._deriveKPIs();
      this._applyFilters();
    });

    /* Tasks */
    document.addEventListener('ibex:task:created', (e) => {
      this._set('tasks', [...this._state.tasks, e.detail.task]);
    });

    document.addEventListener('ibex:task:updated', (e) => {
      const tasks = this._state.tasks.map(t =>
        t.id === e.detail.task.id ? e.detail.task : t
      );
      this._set('tasks', tasks);
    });

    document.addEventListener('ibex:task:deleted', (e) => {
      this._set('tasks', this._state.tasks.filter(t => t.id !== e.detail.id));
    });

    /* Activities */
    document.addEventListener('ibex:activity:logged', (e) => {
      this._set('activities', [e.detail.activity, ...this._state.activities].slice(0, 500));
    });

    /* Notifications */
    document.addEventListener('ibex:notification:added', (e) => {
      this._set('notifications', [e.detail.notification, ...this._state.notifications].slice(0, 100));
    });

    document.addEventListener('ibex:notification:read', () => {
      this._set('notifications', this._storage.getNotifications());
    });

    /* Settings */
    document.addEventListener('ibex:settings:updated', (e) => {
      /* Merge the changed key into local settings cache */
      this._set('settings', { ...(this._state.settings || {}), [e.detail.key]: e.detail.value });
      if (e.detail.key === 'theme') {
        this.setTheme(e.detail.value);
      }
      if (e.detail.key === 'sidebarCollapsed') {
        this._state.ui.sidebarCollapsed = e.detail.value === true || e.detail.value === 'true';
        this._notify('ui');
      }
    });

    /* Metrics */
    document.addEventListener('ibex:metrics:updated', () => {
      this._deriveKPIs();
    });

    /* Pipeline */
    document.addEventListener('ibex:pipeline:updated', (e) => {
      this._set('pipeline', e.detail.stages);
    });

    /* Seeded (first run) */
    document.addEventListener('ibex:seeded', () => {
      this._initState();
      this._notify('*');
    });

    /* Reset */
    document.addEventListener('ibex:reset', () => {
      this._initState();
      this._notify('*');
    });
  }

  /* ── Keyboard shortcuts ───────────────────────────────────────────────── */

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {

      /* Cmd/Ctrl + K → global search */
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggleSearch();
        return;
      }

      /* Escape → close modals / search */
      if (e.key === 'Escape') {
        if (this._state.ui.searchOpen) {
          this.closeSearch();
          return;
        }
        if (this._state.ui.activeModal) {
          this.closeModal();
          return;
        }
        if (this._state.ui.activeDropdown) {
          this._set('ui', { ...this._state.ui, activeDropdown: null });
          return;
        }
      }

      /* N → new lead (when no input is focused) */
      if (e.key === 'n' || e.key === 'N') {
        const tag = document.activeElement?.tagName;
        if (!['INPUT','TEXTAREA','SELECT'].includes(tag)) {
          e.preventDefault();
          this.openModal('lead-create');
          return;
        }
      }

      /* 1–6 → quick page navigation */
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName;
        if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

        const pageMap = {
          '1': APP_PAGES.DASHBOARD,
          '2': APP_PAGES.PIPELINE,
          '3': APP_PAGES.LEADS,
          '4': APP_PAGES.ANALYTICS,
          '5': APP_PAGES.TASKS,
          '6': APP_PAGES.SETTINGS,
        };
        if (pageMap[e.key]) {
          this.navigate(pageMap[e.key]);
        }
      }
    });
  }

  /* ── Breakpoint tracking ──────────────────────────────────────────────── */

  _trackBreakpoint() {
    const update = () => {
      const w = window.innerWidth;
      const bp = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
      if (bp !== this._state.ui.breakpoint) {
        this._state.ui.breakpoint = bp;
        /* Auto-collapse sidebar on mobile */
        if (bp === 'mobile') {
          this._state.ui.sidebarOpen = false;
        } else {
          this._state.ui.sidebarOpen = true;
        }
        this._notify('ui');
      }
    };

    update();
    window.addEventListener('resize', this._debounce(update, 150));
  }

  /* ─────────────────────────────────────────────────────────────────────────
     STATE MUTATION
     ───────────────────────────────────────────────────────────────────── */

  /**
   * Internal: set a top-level state key and notify observers.
   */
  _set(key, value) {
    this._state[key] = value;
    this._notify(key);
  }

  /**
   * External read-only access to state.
   * Returns a shallow copy to prevent direct mutation.
   */
  get(key) {
    const val = this._state[key];
    if (Array.isArray(val)) return [...val];
    if (val && typeof val === 'object' && !(val instanceof Set)) return { ...val };
    return val;
  }

  /**
   * Get entire state snapshot (deep-ish copy).
   */
  getState() {
    return {
      ...this._state,
      ui: {
        ...this._state.ui,
        selectedLeads: new Set(this._state.ui.selectedLeads),
      },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     OBSERVER / SUBSCRIBE
     ───────────────────────────────────────────────────────────────────── */

  /**
   * Subscribe to state changes.
   * @param {string|string[]} keys - state keys to watch ('*' = all)
   * @param {Function} callback - called with (newValue, key)
   * @returns {Function} unsubscribe
   */
  subscribe(keys, callback) {
    const keyList = Array.isArray(keys) ? keys : [keys];

    keyList.forEach(key => {
      if (!this._observers.has(key)) {
        this._observers.set(key, new Set());
      }
      this._observers.get(key).add(callback);
    });

    /* Return unsubscribe */
    return () => {
      keyList.forEach(key => {
        this._observers.get(key)?.delete(callback);
      });
    };
  }

  /**
   * Notify all observers for a given key (and wildcard listeners).
   */
  _notify(key) {
    const value = this._state[key];

    /* Key-specific observers */
    this._observers.get(key)?.forEach(cb => {
      try { cb(value, key); }
      catch (e) { console.error(`[IbexState] Observer error (${key}):`, e); }
    });

    /* Wildcard observers */
    if (key !== '*') {
      this._observers.get('*')?.forEach(cb => {
        try { cb(value, key); }
        catch (e) { console.error('[IbexState] Observer error (*):', e); }
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     COMPUTED STATE
     ───────────────────────────────────────────────────────────────────── */

  _deriveKPIs() {
    const kpis = this._storage.getKPIs();

    /* Compute revenue delta vs prior month using metrics */
    const metrics = this._storage.getMetrics ? this._storage.getMetrics() : [];
    if (metrics.length >= 2) {
      const last = metrics[metrics.length - 1]?.revenue || 0;
      const prev = metrics[metrics.length - 2]?.revenue || 0;
      kpis.revenueDelta = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;
    } else {
      kpis.revenueDelta = 0;
    }

    this._state.kpis = kpis;
    this._notify('kpis');
  }

  _applyFilters() {
    const { leads, filters } = this._state;
    let result = [...leads];

    if (filters.stage !== 'all') {
      result = result.filter(l => l.stage === filters.stage);
    }
    if (filters.source !== 'all') {
      result = result.filter(l => l.source === filters.source);
    }
    if (filters.owner !== 'all') {
      result = result.filter(l => l.owner === filters.owner);
    }
    if (filters.tag !== 'all') {
      result = result.filter(l => l.tags?.includes(filters.tag));
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      result = result.filter(l =>
        l.fullName.toLowerCase().includes(q)   ||
        l.company.toLowerCase().includes(q)     ||
        l.email.toLowerCase().includes(q)       ||
        l.segment.toLowerCase().includes(q)
      );
    }
    if (filters.heatMin > 0) {
      result = result.filter(l => (l.heatScore || 0) >= filters.heatMin);
    }
    if (filters.dealMin > 0) {
      result = result.filter(l => (l.dealValue || 0) >= filters.dealMin);
    }
    if (filters.dealMax !== Infinity) {
      result = result.filter(l => (l.dealValue || 0) <= filters.dealMax);
    }

    /* Sort */
    result.sort((a, b) => {
      let va = a[filters.sortBy] ?? '';
      let vb = b[filters.sortBy] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      let cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return filters.sortDir === 'asc' ? cmp : -cmp;
    });

    this._state.filteredLeads = result;
    this._notify('filteredLeads');
  }

  /* ─────────────────────────────────────────────────────────────────────────
     PUBLIC API
     ───────────────────────────────────────────────────────────────────── */

  /* ── Navigation ───────────────────────────────────────────────────────── */

  navigate(page) {
    if (page === this._state.page) return;
    if (!Object.values(APP_PAGES).includes(page)) {
      console.warn(`[IbexState] Unknown page: ${page}`);
      return;
    }
    this._state.prevPage = this._state.page;
    this._set('page', page);
    this._bus.emit('ibex:navigate', { page, prev: this._state.prevPage });
  }

  getCurrentPage() {
    return this._state.page;
  }

  /* ── Theme ────────────────────────────────────────────────────────────── */

  setTheme(theme) {
    const validThemes = ['dark','light','auto'];
    if (!validThemes.includes(theme)) return;

    let resolved = theme;
    if (theme === 'auto') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    this._state.ui.theme = theme;
    this._applyTheme(resolved);
    this._storage.updateSetting('theme', theme);
    this._notify('ui');
  }

  _applyTheme(resolved) {
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#09090b' : '#f8f8fa';
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────── */

  toggleSidebar() {
    const ui = this._state.ui;
    if (ui.breakpoint === 'mobile') {
      ui.sidebarOpen = !ui.sidebarOpen;
    } else {
      ui.sidebarCollapsed = !ui.sidebarCollapsed;
      this._storage.updateSetting('sidebarCollapsed', ui.sidebarCollapsed);
    }
    this._notify('ui');
  }

  /* ── Search ───────────────────────────────────────────────────────────── */

  toggleSearch() {
    const isOpen = this._state.ui.searchOpen;
    if (isOpen) {
      this.closeSearch();
    } else {
      this.openSearch();
    }
  }

  openSearch() {
    this._state.ui.searchOpen  = true;
    this._state.ui.searchQuery = '';
    this._state.searchResults  = [];
    this._notify('ui');
    this._bus.emit('ibex:search:opened', {});
  }

  closeSearch() {
    this._state.ui.searchOpen  = false;
    this._state.ui.searchQuery = '';
    this._state.searchResults  = [];
    this._notify('ui');
    this._bus.emit('ibex:search:closed', {});
  }

  setSearchQuery(query) {
    this._state.ui.searchQuery = query;

    /* Perform search */
    if (query.trim().length >= 2) {
      const leads    = this._storage.searchLeads(query);
      const tasks    = this._state.tasks.filter(t =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.company.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);

      this._state.searchResults = [
        ...leads.map(l => ({ type: 'lead',  id: l.id,  label: l.fullName,  sub: l.company,    icon: 'user' })),
        ...tasks.map(t => ({ type: 'task',  id: t.id,  label: t.title,     sub: t.company,    icon: 'check' })),
      ];
    } else {
      this._state.searchResults = [];
    }

    this._notify('searchResults');
    this._notify('ui');
  }

  getSearchResults() {
    return [...this._state.searchResults];
  }

  /* ── Modal ────────────────────────────────────────────────────────────── */

  openModal(modalId, data = null) {
    this._state.ui.activeModal = modalId;
    this._state.ui.modalData   = data;
    document.body.style.overflow = 'hidden';
    this._notify('ui');
    this._bus.emit('ibex:modal:opened', { modalId, data });
  }

  closeModal() {
    this._state.ui.activeModal = null;
    this._state.ui.modalData   = null;
    document.body.style.overflow = '';
    this._notify('ui');
    this._bus.emit('ibex:modal:closed', {});
  }

  /* ── Active Lead / Detail View ────────────────────────────────────────── */

  setActiveLead(leadId) {
    this._state.ui.activeLead = leadId;
    this._notify('ui');
  }

  getActiveLead() {
    const id = this._state.ui.activeLead;
    if (!id) return null;
    return this._storage.getLeadById(id);
  }

  /* ── Lead Selection (table multi-select) ─────────────────────────────── */

  selectLead(id, toggle = true) {
    const sel = new Set(this._state.ui.selectedLeads);
    if (toggle) {
      if (sel.has(id)) sel.delete(id);
      else             sel.add(id);
    } else {
      sel.add(id);
    }
    this._state.ui.selectedLeads = sel;
    this._notify('ui');
  }

  selectAllLeads() {
    this._state.ui.selectedLeads = new Set(this._state.filteredLeads.map(l => l.id));
    this._notify('ui');
  }

  clearSelection() {
    this._state.ui.selectedLeads = new Set();
    this._notify('ui');
  }

  /* ── Filters ──────────────────────────────────────────────────────────── */

  setFilter(key, value) {
    this._state.filters[key] = value;
    this._notify('filters');
    this._applyFilters();
  }

  setFilters(changes) {
    this._state.filters = { ...this._state.filters, ...changes };
    this._notify('filters');
    this._applyFilters();
  }

  resetFilters() {
    this._state.filters = { ...FILTER_DEFAULTS };
    this._notify('filters');
    this._applyFilters();
  }

  /* ── Drag & Drop (Kanban) ─────────────────────────────────────────────── */

  startDrag(leadId) {
    this._state.ui.isDragging    = true;
    this._state.ui.draggedLeadId = leadId;
    this._notify('ui');
  }

  endDrag() {
    this._state.ui.isDragging    = false;
    this._state.ui.draggedLeadId = null;
    this._notify('ui');
  }

  /* ── Toast Notifications ──────────────────────────────────────────────── */

  toast({ type = 'info', title, message, duration = 4000, action = null }) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const ui  = this._state.ui;

    ui.toasts = [...ui.toasts, { id, type, title, message, action, duration }];
    this._notify('ui');

    /* Auto-dismiss */
    if (duration > 0) {
      setTimeout(() => this.dismissToast(id), duration);
    }

    return id;
  }

  dismissToast(id) {
    this._state.ui.toasts = this._state.ui.toasts.filter(t => t.id !== id);
    this._notify('ui');
  }

  /* Convenience methods */
  toastSuccess(title, message) { return this.toast({ type: 'success', title, message }); }
  toastError(title, message)   { return this.toast({ type: 'error',   title, message, duration: 6000 }); }
  toastInfo(title, message)    { return this.toast({ type: 'info',    title, message }); }
  toastWarn(title, message)    { return this.toast({ type: 'warn',    title, message }); }

  /* ── Loading State ────────────────────────────────────────────────────── */

  setLoading(isLoading, target = null) {
    this._state.ui.isLoading     = isLoading;
    this._state.ui.loadingTarget = target;
    this._notify('ui');
  }

  /* ── Dropdown ─────────────────────────────────────────────────────────── */

  openDropdown(id) {
    this._state.ui.activeDropdown = id;
    this._notify('ui');
  }

  closeDropdown() {
    this._state.ui.activeDropdown = null;
    this._notify('ui');
  }

  /* ── Storage proxy methods (direct actions from UI) ───────────────────── */

  /* Create */
  createLead(data) {
    return this._storage.createLead(data);
  }

  updateLead(id, changes) {
    return this._storage.updateLead(id, changes);
  }

  moveLeadStage(id, stage) {
    const result = this._storage.moveLeadStage(id, stage);
    if (result && result.then) {
      return result.then(lead => {
        if (lead) {
          const stages = window.PIPELINE_STAGES || [];
          this.toastSuccess('Deal atualizado', `${lead.fullName} movido para "${stages.find(s => s.id === stage)?.label}".`);
        }
        return lead;
      });
    }
    return result;
  }

  deleteLead(id) {
    const lead = this._storage.getLeadById(id);
    if (!lead) return false;
    const result = this._storage.deleteLead(id);
    if (result) {
      this.toastSuccess('Lead removido', `${lead.fullName} foi removido do sistema.`);
      if (this._state.ui.activeLead === id) {
        this.setActiveLead(null);
      }
    }
    return result;
  }

  createTask(data) {
    return this._storage.createTask(data);
  }

  updateTask(id, changes) {
    return this._storage.updateTask(id, changes);
  }

  completeTask(id) {
    const result = this._storage.completeTask(id);
    if (result) {
      this.toastSuccess('Tarefa concluída', result.title);
    }
    return result;
  }

  deleteTask(id) {
    return this._storage.deleteTask(id);
  }

  logActivity(data) {
    return this._storage.logActivity(data);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     UTILITIES
     ───────────────────────────────────────────────────────────────────── */

  _debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /**
   * Expose the event bus for cross-module use.
   */
  get bus() {
    return this._bus;
  }

  /**
   * Expose storage reference.
   */
  get storage() {
    return this._storage;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   BOOTSTRAP — Initialize on DOM ready
   ───────────────────────────────────────────────────────────────────────── */

/**
 * IbexApp — Global singleton that bootstraps the system.
 * Accessible via window.Ibex throughout the app.
 */
class IbexApp {

  constructor() {
    this._ready   = false;
    this._queue   = [];     /* module init queue */
    this.storage  = null;
    this.state    = null;
  }

  /**
   * Boot the app.
   * Instantiates storage → state → runs queued module inits.
   */
  async boot() {
    if (this._ready) return;

    this.storage = new IbexStorage();
    this.state   = new IbexStateManager(this.storage);

    // Wait for state to fetch data from backend
    await this.state._initState();

    this._ready  = true;

    console.info(
      '%c IBEX CRM %c v1.1 Backend Booted ',
      'background:#6366f1;color:#fff;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px',
      'background:#18181b;color:#a1a1aa;padding:2px 6px;border-radius:0 4px 4px 0'
    );

    /* Run any modules that were queued before boot */
    this._queue.forEach(fn => {
      try { fn(this); }
      catch (e) { console.error('[IbexApp] Module init error:', e); }
    });
    this._queue = [];

    document.dispatchEvent(new CustomEvent('ibex:ready', { detail: { app: this } }));
  }

  /**
   * Register a module initializer to run after boot.
   * If already booted, runs immediately.
   */
  register(initFn) {
    if (this._ready) {
      try { initFn(this); }
      catch(e) { console.error('[IbexApp] Module init error:', e); }
    } else {
      this._queue.push(initFn);
    }
  }

  /* Convenience shortcuts */
  get s()    { return this.state; }
  get store() { return this.storage; }
  get bus()   { return this.state?.bus; }

  /* Quick toast access */
  toast(...args)        { return this.state?.toast(...args); }
  toastSuccess(...args) { return this.state?.toastSuccess(...args); }
  toastError(...args)   { return this.state?.toastError(...args); }
  toastInfo(...args)    { return this.state?.toastInfo(...args); }
  toastWarn(...args)    { return this.state?.toastWarn(...args); }
}

/* ─────────────────────────────────────────────────────────────────────────────
   GLOBAL EXPOSURE
   ───────────────────────────────────────────────────────────────────────── */

window.IbexStateManager = IbexStateManager;
window.IbexEventBus     = IbexEventBus;
window.IbexApp          = IbexApp;
window.APP_PAGES        = APP_PAGES;
window.FILTER_DEFAULTS  = FILTER_DEFAULTS;

/* Create and attach the singleton */
window.Ibex = new IbexApp();

/* Boot on DOMContentLoaded (or immediately if already loaded) */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.Ibex.boot());
} else {
  window.Ibex.boot();
}
