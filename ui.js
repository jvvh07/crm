/**
 * IBEX CRM — UI Module
 * Responsável por toda a renderização de componentes e interações da interface
 * Depende: IbexUtils, IbexCharts
 * @version 1.0.0
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CLASS: IbexUI
   ───────────────────────────────────────────────────────────────────────── */

class IbexUI {

  constructor(app) {
    this._app   = app;
    this._state = app.state;
    this._store = app.storage;
    this._unsubs = [];

    this._init();
  }

  /* ─────────────────────────────────────────────────────────────────────────
     INIT
     ───────────────────────────────────────────────────────────────────────*/

  _init() {
    this._bindNav();
    this._bindSidebar();
    this._bindSearch();
    this._bindModal();
    this._bindNotifications();
    this._bindTopbar();
    this._bindPeriodSelector();
    this._bindOfflineBanner();

    /* Subscribe to state changes */
    this._unsubs.push(
      this._state.subscribe('ui',     () => this._onUIChange()),
      this._state.subscribe('page',   (page) => this._onPageChange(page)),
      this._state.subscribe('kpis',   (kpis) => this._renderKPIs(kpis)),
      this._state.subscribe('ui',     () => this._renderToasts()),
      this._state.subscribe('ui',     () => this._syncSearchOverlay()),
      this._state.subscribe('searchResults', () => this._renderSearchResults()),
    );

    /* Initial renders */
    this._renderCurrentUser();
    this._renderNotifications();
    this._updateDateTime();
    setInterval(() => this._updateDateTime(), 60_000);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     NAVIGATION
     ───────────────────────────────────────────────────────────────────────*/

  _bindNav() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        const page = link.dataset.page;
        if (!page) return;

        /* External pages (pipeline.html, etc.) — let browser navigate */
        const href = link.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('#')) return;

        e.preventDefault();
        this._state.navigate(page);
      });
    });

    /* Logo → dashboard */
    const logoLink = document.getElementById('logo-link');
    if (logoLink) {
      logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        this._state.navigate('dashboard');
      });
    }
  }

  _onPageChange(page) {
    /* Hide all pages */
    document.querySelectorAll('.page').forEach(p => {
      p.classList.add('hidden');
    });

    /* Show active page */
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.remove('hidden');
      pageEl.scrollTop = 0;
    }

    /* Update nav active state */
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    /* Update breadcrumb */
    const breadcrumb = document.getElementById('breadcrumb-page');
    const pageLabels = {
      dashboard:   'Dashboard',
      pipeline:    'Pipeline',
      leads:       'Leads',
      analytics:   'Analytics',
      tasks:       'Tarefas',
      inbox:       'Caixa de Entrada',
      proposals:   'Propostas',
      automations: 'Automações',
      settings:    'Configurações',
    };
    if (breadcrumb) breadcrumb.textContent = pageLabels[page] || page;

    /* Render dashboard-specific content on arrival */
    if (page === 'dashboard') {
      this._renderDashboard();
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     SIDEBAR
     ───────────────────────────────────────────────────────────────────────*/

  _bindSidebar() {
    /* Collapse button (desktop) */
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => this._state.toggleSidebar());
    }

    /* Mobile menu button */
    const menuBtn = document.getElementById('topbar-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => this._state.toggleSidebar());
    }

    /* Mobile overlay */
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this._state.toggleSidebar());
    }

    /* Keyboard: B → toggle sidebar */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') {
        const tag = document.activeElement?.tagName;
        if (!['INPUT','TEXTAREA','SELECT'].includes(tag)) {
          this._state.toggleSidebar();
        }
      }
    });
  }

  _onUIChange() {
    const ui       = this._state.get('ui');
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const appShell = document.getElementById('app-shell');

    if (!sidebar) return;

    /* Mobile: open/close */
    if (ui.breakpoint === 'mobile') {
      sidebar.classList.toggle('sidebar--mobile-open', ui.sidebarOpen);
      if (overlay) overlay.classList.toggle('active', ui.sidebarOpen);
    } else {
      /* Desktop: collapsed/expanded */
      sidebar.classList.toggle('sidebar--collapsed', ui.sidebarCollapsed);
      if (appShell) appShell.classList.toggle('sidebar-collapsed', ui.sidebarCollapsed);
    }

    /* Modal visibility */
    this._syncModals(ui);

    /* Notification badge */
    const notifs = this._state.get('notifications') || [];
    const unread = notifs.filter(n => !n.read).length;
    const badge  = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = unread;
      badge.hidden = unread === 0;
    }

    /* Tasks badge */
    const tasks    = this._state.get('tasks') || [];
    const overdue  = tasks.filter(t => t.status === 'overdue').length;
    const taskBadge = document.getElementById('tasks-badge');
    if (taskBadge) {
      taskBadge.textContent = overdue;
      taskBadge.hidden = overdue === 0;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     SEARCH
     ───────────────────────────────────────────────────────────────────────*/

  _bindSearch() {
    const searchBtn  = document.getElementById('topbar-search-btn');
    const overlay    = document.getElementById('search-overlay');
    const backdrop   = document.getElementById('search-backdrop');
    const input      = document.getElementById('search-input');

    if (searchBtn) {
      searchBtn.addEventListener('click', () => this._state.openSearch());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this._state.closeSearch());
    }
    if (input) {
      input.addEventListener('input', () => {
        this._state.setSearchQuery(input.value);
      });
    }
  }

  _syncSearchOverlay() {
    const ui      = this._state.get('ui');
    const overlay = document.getElementById('search-overlay');
    const input   = document.getElementById('search-input');

    if (!overlay) return;

    if (ui.searchOpen) {
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add('search-overlay--open'));
      if (input) { input.value = ''; input.focus(); }
    } else {
      overlay.classList.remove('search-overlay--open');
      setTimeout(() => { overlay.hidden = true; }, 200);
      if (input) input.value = '';
    }
  }

  _renderSearchResults() {
    const results  = this._state.getSearchResults();
    const container = document.getElementById('search-results');
    const empty     = document.getElementById('search-empty');
    if (!container) return;

    /* Clear previous results (except empty state) */
    container.querySelectorAll('.search-result-item').forEach(el => el.remove());

    if (results.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.setAttribute('role', 'option');
      item.innerHTML = `
        <div class="search-result-icon search-result-icon--${r.icon}">
          ${r.type === 'lead' ? this._iconUser() : this._iconCheck()}
        </div>
        <div class="search-result-info">
          <span class="search-result-label">${this._esc(r.label)}</span>
          <span class="search-result-sub">${this._esc(r.sub)}</span>
        </div>
        <span class="search-result-type">${r.type === 'lead' ? 'Lead' : 'Tarefa'}</span>
      `;
      item.addEventListener('click', () => {
        this._state.closeSearch();
        if (r.type === 'lead') {
          this._state.navigate('leads');
        }
      });
      container.insertBefore(item, empty);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     MODALS
     ───────────────────────────────────────────────────────────────────────*/

  _bindModal() {
    /* New lead button */
    const newLeadBtn = document.getElementById('topbar-new-lead-btn');
    if (newLeadBtn) {
      newLeadBtn.addEventListener('click', () => this._state.openModal('lead-create'));
    }

    /* Close buttons / backdrops */
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-modal]')) {
        this._state.closeModal();
      }
    });

    /* Lead create form submit */
    const form = document.getElementById('form-lead-create');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._handleLeadCreate(form);
      });
    }
  }

  _syncModals(ui) {
    /* Lead create modal */
    const leadModal = document.getElementById('modal-lead-create');
    if (leadModal) {
      const isOpen = ui.activeModal === 'lead-create';
      leadModal.hidden = !isOpen;
      if (isOpen) {
        requestAnimationFrame(() => leadModal.classList.add('modal-overlay--open'));
        const firstInput = leadModal.querySelector('input');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
      } else {
        leadModal.classList.remove('modal-overlay--open');
        leadModal.querySelector('form')?.reset();
      }
    }
  }

  _handleLeadCreate(form) {
    const fd = new FormData(form);
    const data = {
      firstName:   fd.get('firstName')?.trim() || '',
      lastName:    fd.get('lastName')?.trim()  || '',
      role:        fd.get('role')?.trim()       || '',
      email:       fd.get('email')?.trim()      || '',
      phone:       fd.get('phone')?.trim()      || '',
      company:     fd.get('company')?.trim()    || '',
      segment:     fd.get('segment')?.trim()    || '',
      dealValue:   parseFloat(fd.get('dealValue')) || 0,
      stage:       fd.get('stage')              || 'new',
      source:      fd.get('source')             || '',
      closingDate: fd.get('closingDate')        || null,
      notes:       fd.get('notes')?.trim()      || '',
    };

    /* Basic validation */
    if (!data.firstName || !data.lastName || !data.email || !data.company) {
      this._state.toastError('Campos obrigatórios', 'Preencha Nome, Sobrenome, E-mail e Empresa.');
      return;
    }

    /* Disable submit button while saving */
    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

    /* createLead is async — await it properly */
    Promise.resolve(this._state.createLead(data)).then(lead => {
      if (lead) {
        this._state.closeModal();
        this._state.toastSuccess('Lead criado!', `${lead.fullName} adicionado com sucesso.`);
      } else {
        this._state.toastError('Erro ao criar lead', 'Tente novamente.');
      }
    }).catch(err => {
      console.error('[IbexUI] createLead error:', err);
      this._state.toastError('Erro ao salvar', err.message || 'Verifique o console.');
    }).finally(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Salvar Lead`; }
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     NOTIFICATIONS PANEL
     ───────────────────────────────────────────────────────────────────────*/

  _bindNotifications() {
    const btn   = document.getElementById('notifications-btn');
    const panel = document.getElementById('notif-panel');
    const markAllBtn = document.getElementById('mark-all-read-btn');

    if (btn && panel) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.hidden = !panel.hidden;
      });

      document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && e.target !== btn) {
          panel.hidden = true;
        }
      });
    }

    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        this._store.markAllNotificationsRead();
        this._renderNotifications();
        const badge = document.getElementById('notif-badge');
        if (badge) badge.hidden = true;
      });
    }
  }

  _renderNotifications() {
    const list  = document.getElementById('notif-list');
    if (!list) return;

    const notifications = this._state.get('notifications') || [];
    if (notifications.length === 0) {
      list.innerHTML = `<div class="notif-empty">Nenhuma notificação</div>`;
      return;
    }

    const icons = {
      task_due:       '📋',
      deal_update:    '📈',
      new_lead:       '👤',
      goal_milestone: '🎯',
      inactivity:     '⏰',
      proposal:       '📄',
      info:           'ℹ️',
    };

    list.innerHTML = notifications.slice(0, 10).map(n => `
      <div class="notif-item ${n.read ? '' : 'notif-item--unread'}" data-id="${n.id}">
        <div class="notif-item-icon">${icons[n.type] || '🔔'}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${this._esc(n.title)}</div>
          <div class="notif-item-body-text">${this._esc(n.body)}</div>
          <div class="notif-item-time">${window.formatRelativeTime ? formatRelativeTime(n.time) : ''}</div>
        </div>
      </div>
    `).join('');

    /* Mark as read on click */
    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        this._store.markNotificationRead(id);
        item.classList.remove('notif-item--unread');
        this._renderNotifications();
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     TOPBAR
     ───────────────────────────────────────────────────────────────────────*/

  _bindTopbar() {
    const avatarBtn = document.getElementById('topbar-avatar-btn');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', () => {
        this._state.navigate('settings');
      });
    }
  }

  _renderCurrentUser() {
    const user = this._state.get('currentUser');
    if (!user) return;

    const nameEl    = document.getElementById('sidebar-user-name');
    const roleEl    = document.getElementById('sidebar-user-role');
    const avatarEl  = document.getElementById('sidebar-avatar');
    const topAvatar = document.getElementById('topbar-avatar');
    const greeting  = document.getElementById('dash-greeting');

    if (nameEl)    nameEl.textContent    = user.name;
    if (roleEl)    roleEl.textContent    = user.role;
    if (avatarEl)  avatarEl.textContent  = user.initials || window.getInitials(user.name);
    if (topAvatar) topAvatar.textContent = user.initials || window.getInitials(user.name);
    if (greeting)  greeting.textContent  = `${window.getGreeting ? getGreeting() : 'Olá'}, ${user.name.split(' ')[0]} 👋`;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     DATE / TIME
     ───────────────────────────────────────────────────────────────────────*/

  _updateDateTime() {
    const dateEl = document.getElementById('dash-date');
    if (dateEl) {
      dateEl.textContent = window.getTodayLong ? getTodayLong() : new Date().toLocaleDateString('pt-BR');
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     PERIOD SELECTOR
     ───────────────────────────────────────────────────────────────────────*/

  _bindPeriodSelector() {
    const selector = document.getElementById('period-selector');
    if (!selector) return;

    selector.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-period]');
      if (!btn) return;

      selector.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      /* Re-render charts with filtered metrics */
      const period = btn.dataset.period;
      this._renderRevenueChart(period);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     DASHBOARD RENDER
     ───────────────────────────────────────────────────────────────────────*/

  _renderDashboard() {
    const kpis    = this._state.get('kpis');
    const leads   = this._state.get('leads');
    const tasks   = this._state.get('tasks');
    const activities = this._state.get('activities');
    const users   = this._state.get('users') || [];

    this._renderKPIs(kpis);
    this._renderQuotaBar(kpis);
    this._renderDailyFocus(kpis, leads, tasks);
    this._renderRevenueChart('30d');
    this._renderPipelineChart(leads);
    this._renderActivityFeed(activities);
    this._renderTaskList(tasks);
    this._renderLeaderboard(users, leads);
  }

  /* ── Daily Focus ───────────────────────────────────────────────────────── */

  _renderDailyFocus(kpis, leads, tasks) {
    const grid = document.getElementById('daily-focus-grid');
    const countEl = document.getElementById('focus-count');
    if (!grid) return;

    const focusItems = [];

    // 1. Follow-ups hoje
    const today = new Date().toISOString().split('T')[0];
    const followupsToday = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate.startsWith(today));
    if (followupsToday.length > 0) {
      focusItems.push({
        id: 'focus-followup',
        label: 'Follow-ups Hoje',
        value: `${followupsToday.length} Agendados`,
        icon: this._iconCalendar(),
        color: '#38bdf8',
        hint: 'Ver agenda →'
      });
    }

    // 2. Leads Estagnados (>3 dias sem contato)
    if (kpis.staleLeadsCount > 0) {
      focusItems.push({
        id: 'focus-stale',
        label: 'Leads Estagnados',
        value: `${kpis.staleLeadsCount} Sem Contato`,
        icon: this._iconClock(),
        color: '#f43f5e',
        hint: 'Retomar contato →'
      });
    }

    // 3. Leads Quentes
    if (kpis.hotLeadsCount > 0) {
      focusItems.push({
        id: 'focus-hot',
        label: 'Oportunidades Quentes',
        value: `${kpis.hotLeadsCount} Leads High-Heat`,
        icon: this._iconZap(),
        color: '#f59e0b',
        hint: 'Priorizar agora →'
      });
    }

    if (focusItems.length === 0) {
      grid.innerHTML = `<div class="focus-empty">Tudo em dia! Bom trabalho, Juan. 🚀</div>`;
      if (countEl) countEl.textContent = '0 Pendentes';
      return;
    }

    if (countEl) countEl.textContent = `${focusItems.length} Prioridades`;

    grid.innerHTML = focusItems.map(f => `
      <div class="focus-card" id="${f.id}">
        <div class="focus-icon" style="background:${f.color}15; color:${f.color}">
          ${f.icon}
        </div>
        <div class="focus-info">
          <span class="focus-label">${f.label}</span>
          <span class="focus-value">${f.value}</span>
          <div class="focus-action-hint">
            ${f.hint}
          </div>
        </div>
      </div>
    `).join('');

    // Bind clicks
    grid.querySelector('#focus-stale')?.addEventListener('click', () => {
      this._state.navigate('leads');
      setTimeout(() => {
        const search = document.getElementById('leads-search');
        if (search) {
          search.value = 'stale'; // Simplified filter trigger
          search.dispatchEvent(new Event('input'));
        }
      }, 100);
    });

    grid.querySelector('#focus-followup')?.addEventListener('click', () => this._state.navigate('tasks'));
    grid.querySelector('#focus-hot')?.addEventListener('click', () => this._state.navigate('leads'));
  }

  /* ── KPI Cards ─────────────────────────────────────────────────────────── */

  _renderKPIs(kpis) {
    if (!kpis || Object.keys(kpis).length === 0) return;
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;

    const fn = window.formatCurrency || (v => `R$ ${v}`);
    const fp = window.formatPercent  || (v => `${v}%`);
    const db = window.deltaBadge     || (() => '');

    const cards = [
      {
        id:      'kpi-pipeline',
        title:   'Pipeline Total',
        value:   fn(kpis.pipelineValue, true),
        sub:     `Pipeline ponderado: ${fn(kpis.weightedPipeline, true)}`,
        icon:    this._iconTrendUp(),
        color:   '#6366f1',
        delta:   db(kpis.revenueDelta),
      },
      {
        id:      'kpi-won',
        title:   'Receita Fechada',
        value:   fn(kpis.wonValue, true),
        sub:     `${kpis.activeLeads} leads ativos`,
        icon:    this._iconDollar(),
        color:   '#10b981',
        delta:   '',
      },
      {
        id:      'kpi-winrate',
        title:   'Win Rate',
        value:   fp(kpis.winRate),
        sub:     `Ticket médio: ${fn(kpis.avgDealValue, true)}`,
        icon:    this._iconTarget(),
        color:   '#f59e0b',
        delta:   '',
      },
      {
        id:      'kpi-overdue',
        title:   'Tarefas Vencidas',
        value:   String(kpis.overdueTasks),
        sub:     'Requerem atenção imediata',
        icon:    this._iconClock(),
        color:   kpis.overdueTasks > 0 ? '#f43f5e' : '#10b981',
        delta:   '',
      },
    ];

    grid.innerHTML = cards.map(c => `
      <div class="kpi-card card" id="${c.id}">
        <div class="kpi-card-header">
          <span class="kpi-card-title">${c.title}</span>
          <div class="kpi-card-icon" style="color:${c.color}; background:${c.color}18">
            ${c.icon}
          </div>
        </div>
        <div class="kpi-card-value">${c.value}</div>
        <div class="kpi-card-footer">
          <span class="kpi-card-sub">${c.sub}</span>
          ${c.delta}
        </div>
      </div>
    `).join('');
  }

  /* ── Quota Bar ─────────────────────────────────────────────────────────── */

  _renderQuotaBar(kpis) {
    if (!kpis?.goals) return;
    const goals = kpis.goals;
    if (!goals.revenue) return;

    const { target, current } = goals.revenue;
    const pct = Math.min(Math.round((current / target) * 100), 100);

    const currentEl = document.getElementById('quota-current');
    const targetEl  = document.getElementById('quota-target');
    const pctEl     = document.getElementById('quota-pct');
    const fillEl    = document.getElementById('quota-fill');
    const trackEl   = document.getElementById('quota-track-el');

    const fn = window.formatCurrency || (v => `R$ ${v}`);

    if (currentEl) currentEl.textContent = fn(current, true);
    if (targetEl)  targetEl.textContent  = fn(target,  true);
    if (pctEl)     pctEl.textContent     = `${pct}%`;
    if (fillEl)    fillEl.style.width    = `${pct}%`;
    if (trackEl)   trackEl.setAttribute('aria-valuenow', pct);

    /* Color the fill based on progress */
    if (fillEl) {
      fillEl.style.background = pct >= 80
        ? 'linear-gradient(90deg, #10b981, #34d399)'
        : pct >= 50
        ? 'linear-gradient(90deg, #6366f1, #818cf8)'
        : 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    }
  }

  /* ── Revenue Chart ────────────────────────────────────────────────────── */

  _renderRevenueChart(period) {
    const metrics = this._state.get('metrics') || [];
    let data = metrics;

    if (period === '7d') {
      /* Show last 3 months */
      data = metrics.slice(-3);
    } else if (period === '30d') {
      data = metrics.slice(-6);
    } else if (period === '90d') {
      data = metrics.slice(-9);
    } else {
      data = metrics;
    }

    if (window.Ibex?.charts) {
      window.Ibex.charts.renderRevenue('chart-revenue', data);
    }
  }

  /* ── Pipeline Donut ───────────────────────────────────────────────────── */

  _renderPipelineChart(leads) {
    if (window.Ibex?.charts) {
      window.Ibex.charts.renderPipeline('chart-pipeline', leads);
    }
  }

  /* ── Activity Feed ────────────────────────────────────────────────────── */

  _renderActivityFeed(activities) {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    const items = activities.slice(0, 8);
    if (items.length === 0) {
      feed.innerHTML = `<div class="feed-empty">Nenhuma atividade registrada</div>`;
      return;
    }

    const actIcons = {
      call:           '📞',
      email:          '✉️',
      meeting:        '🤝',
      demo:           '🖥️',
      proposal_sent:  '📄',
      follow_up:      '🔔',
      whatsapp:       '💬',
      linkedin:       '🔗',
      note:           '📝',
      task_completed: '✅',
      deal_won:       '🎉',
      new_lead:       '👤',
    };

    feed.innerHTML = items.map(a => `
      <div class="feed-item">
        <div class="feed-item-icon">${actIcons[a.type] || '📌'}</div>
        <div class="feed-item-body">
          <div class="feed-item-title">${this._esc(a.title)}: ${this._esc(a.meta)}</div>
          <div class="feed-item-meta">
            <span class="feed-item-owner">${this._esc(a.owner)}</span>
            <span class="feed-item-sep">·</span>
            <span class="feed-item-time">${window.formatRelativeTime ? formatRelativeTime(a.time) : ''}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  /* ── Task List ─────────────────────────────────────────────────────────── */

  _renderTaskList(tasks) {
    const list = document.getElementById('dash-task-list');
    if (!list) return;

    const priorityTasks = tasks.filter(t => t.status !== 'done').slice(0, 5);
    if (priorityTasks.length === 0) {
      list.innerHTML = `<div class="task-empty">Nenhuma tarefa pendente 🎉</div>`;
      return;
    }

    const priColors = { urgent: '#f43f5e', high: '#f59e0b', medium: '#0ea5e9', low: '#71717a' };
    const priLabels = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' };

    list.innerHTML = priorityTasks.map(t => {
      const color = priColors[t.priority] || '#71717a';
      const label = priLabels[t.priority] || t.priority;
      const due   = window.formatDate ? formatDate(t.dueDate) : t.dueDate;
      const isOverdue = t.status === 'overdue';
      return `
        <div class="task-item ${isOverdue ? 'task-item--overdue' : ''}">
          <button class="task-check-btn" data-task-id="${t.id}" aria-label="Concluir tarefa" title="Marcar como concluída">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <div class="task-item-body">
            <div class="task-item-title">${this._esc(t.title)}</div>
            <div class="task-item-meta">
              <span class="task-item-company">${this._esc(t.company)}</span>
              <span class="task-item-sep">·</span>
              <span class="task-item-due ${isOverdue ? 'task-item-due--overdue' : ''}">${due}</span>
            </div>
          </div>
          <span class="task-priority-badge" style="color:${color}; background:${color}18">${label}</span>
        </div>
      `;
    }).join('');

    /* Bind check buttons */
    list.querySelectorAll('.task-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.taskId;
        /* Visual feedback before async operation */
        const item = btn.closest('.task-item');
        if (item) {
          item.style.opacity = '0.4';
          item.style.transition = 'opacity 0.3s';
        }
        Promise.resolve(this._state.completeTask(id)).then(() => {
          /* Re-render to remove completed task */
          const tasks = this._state.get('tasks');
          this._renderTaskList(tasks);
        });
      });
    });
  }

  /* ── Leaderboard / Team Performance ──────────────────────────────────── */

  _renderLeaderboard(users, leads) {
    const list = document.getElementById('leaderboard-list');
    if (!list || !users.length) return;

    /* Calculate won value per user */
    const wonLeads = leads.filter(l => l.stage === 'won');
    const rankings = users.map(u => {
      const userWon = wonLeads.filter(l => l.owner === u.id);
      const wonValue = userWon.reduce((sum, l) => sum + (l.dealValue || 0), 0);
      const progress = Math.min(Math.round((wonValue / (u.quota || 1)) * 100), 100);
      return { ...u, wonValue, progress, dealsWon: userWon.length };
    }).sort((a, b) => b.wonValue - a.wonValue);

    const fn = window.formatCurrency || (v => `R$${v}`);

    list.innerHTML = rankings.map((u, i) => `
      <div class="leaderboard-item">
        <span class="leaderboard-rank">${['🥇','🥈','🥉'][i] || `#${i+1}`}</span>
        <div class="leaderboard-avatar" style="background:${u.color}22; color:${u.color}">${u.initials}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${this._esc(u.name)}</div>
          <div class="leaderboard-role">${this._esc(u.role)}</div>
          <div class="leaderboard-progress-track">
            <div class="leaderboard-progress-fill" style="width:${u.progress}%; background:${u.color}"></div>
          </div>
        </div>
        <div class="leaderboard-value">
          <div class="leaderboard-won">${fn(u.wonValue, true)}</div>
          <div class="leaderboard-pct">${u.progress}% da meta</div>
        </div>
      </div>
    `).join('');
  }

  /* ─────────────────────────────────────────────────────────────────────────
     TOASTS
     ───────────────────────────────────────────────────────────────────────*/

  _renderToasts() {
    const ui        = this._state.get('ui');
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastMap = new Map();
    container.querySelectorAll('[data-toast-id]').forEach(el => {
      toastMap.set(el.dataset.toastId, el);
    });

    const activeIds = new Set(ui.toasts.map(t => t.id));

    /* Remove stale toasts */
    toastMap.forEach((el, id) => {
      if (!activeIds.has(id)) {
        el.classList.add('toast--exit');
        setTimeout(() => el.remove(), 350);
      }
    });

    /* Add new toasts */
    ui.toasts.forEach(t => {
      if (toastMap.has(t.id)) return;

      const icons = {
        success: '✓',
        error:   '✕',
        warn:    '⚠',
        info:    'ℹ',
      };

      const toast = document.createElement('div');
      toast.className = `toast toast--${t.type}`;
      toast.dataset.toastId = t.id;
      toast.innerHTML = `
        <div class="toast-icon">${icons[t.type] || 'ℹ'}</div>
        <div class="toast-body">
          <div class="toast-title">${this._esc(t.title || '')}</div>
          ${t.message ? `<div class="toast-message">${this._esc(t.message)}</div>` : ''}
        </div>
        <button class="toast-close" aria-label="Fechar notificação">✕</button>
      `;

      toast.querySelector('.toast-close').addEventListener('click', () => {
        this._state.dismissToast(t.id);
      });

      container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('toast--enter'));
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     SVG ICON HELPERS
     ───────────────────────────────────────────────────────────────────────*/

  _iconTrendUp() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';
  }

  _iconDollar() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
  }

  _iconTarget() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
  }

  _iconClock() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  }

  _iconUser() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }

  _iconCheck() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
  }

  _iconCalendar() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  }

  _iconZap() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  }

  /* ─────────────────────────────────────────────────────────────────────────
     UTILITIES
     ───────────────────────────────────────────────────────────────────────*/

  /** Escape HTML to prevent XSS */
  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Offline Banner ────────────────────────────────────────────────────── */

  _bindOfflineBanner() {
    document.addEventListener('ibex:offline', (e) => {
      const msg = e.detail?.message || 'Modo offline — usando cache local.';
      this._state.toastWarn('Sem conexão com o servidor', msg);

      /* Show persistent banner below topbar */
      let banner = document.getElementById('offline-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.setAttribute('role', 'alert');
        banner.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>${this._esc(msg)}</span>
        `;
        const mainWrap = document.getElementById('main-wrap');
        if (mainWrap) mainWrap.prepend(banner);
      }
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   BOOTSTRAP
   ───────────────────────────────────────────────────────────────────────── */

window.IbexUI = IbexUI;

window.Ibex?.register((app) => {
  app.ui = new IbexUI(app);
  console.info('[IbexUI] Module registered.');
});
