/**
 * IBEX CRM — Central de Integrações
 * Grid de integrações por categoria, modal de conexão (simulado), teste de
 * conexão, drawer de logs mockado, desconexão com confirmação.
 *
 * TODO(backend): CADA integração real precisa de: (1) fluxo OAuth2 completo
 * no backend para gerar/renovar tokens, (2) armazenamento seguro de
 * credenciais (nunca no frontend/localStorage — aqui é só para demonstração
 * de interface), (3) webhooks reais recebendo eventos de cada serviço,
 * (4) filas de job (ex: BullMQ) para processar sync assíncrono. Isso é um
 * projeto de backend à parte por integração — priorize 1-2 integrações
 * reais (ex: WhatsApp + Google Calendar) antes de expandir as demais.
 *
 * @version 1.0.0
 */

'use strict';

(function () {

  const STORAGE_KEY = 'ibex_integrations_v1';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatRelative(iso) {
    if (!iso) return 'Nunca sincronizado';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Agora mesmo';
    if (mins < 60) return `Há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Há ${days}d`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CATÁLOGO DE INTEGRAÇÕES
     ═══════════════════════════════════════════════════════════════════════ */

  const CATEGORIES = [
    { id: 'comunicacao',   label: 'Comunicação' },
    { id: 'produtividade', label: 'Produtividade' },
    { id: 'automacao',     label: 'Automação' },
    { id: 'pagamentos',    label: 'Pagamentos' },
    { id: 'marketing',     label: 'Marketing' },
    { id: 'erp',           label: 'ERP / Financeiro' },
    { id: 'ia',            label: 'Inteligência Artificial' },
    { id: 'importacao',    label: 'Importação de Dados' },
    { id: 'dev',           label: 'Desenvolvedores' },
  ];

  function buildCatalog() {
    return [
      { id: 'whatsapp',    label: 'WhatsApp Business',  category: 'comunicacao',   icon: '💬', status: 'disconnected', lastSync: null,
        fields: [{ key: 'phoneId', label: 'Phone Number ID', placeholder: 'Ex: 109876543210' }, { key: 'token', label: 'Token de Acesso', placeholder: 'EAAG...', type: 'password' }] },
      { id: 'instagram',   label: 'Instagram',           category: 'comunicacao',   icon: '📷', status: 'disconnected', lastSync: null },
      { id: 'facebook',    label: 'Facebook',            category: 'comunicacao',   icon: '👍', status: 'disconnected', lastSync: null },
      { id: 'meta',        label: 'Meta Business Suite', category: 'comunicacao',   icon: '∞',  status: 'disconnected', lastSync: null },
      { id: 'gmail',       label: 'Gmail',                category: 'comunicacao',   icon: '✉️', status: 'connected',    lastSync: '2026-07-19T08:12:00' },
      { id: 'outlook',     label: 'Outlook',              category: 'comunicacao',   icon: '📧', status: 'disconnected', lastSync: null },
      { id: 'ms365',       label: 'Microsoft 365',        category: 'comunicacao',   icon: '🪟', status: 'disconnected', lastSync: null },
      { id: 'slack',       label: 'Slack',                category: 'comunicacao',   icon: '💼', status: 'connected',    lastSync: '2026-07-19T07:40:00' },
      { id: 'discord',     label: 'Discord',              category: 'comunicacao',   icon: '🎮', status: 'disconnected', lastSync: null },
      { id: 'telegram',    label: 'Telegram',             category: 'comunicacao',   icon: '✈️', status: 'disconnected', lastSync: null },

      { id: 'gcalendar',   label: 'Google Calendar',      category: 'produtividade', icon: '📅', status: 'connected',    lastSync: '2026-07-19T09:00:00' },
      { id: 'gmeet',       label: 'Google Meet',          category: 'produtividade', icon: '🎥', status: 'disconnected', lastSync: null },

      { id: 'zapier',      label: 'Zapier',               category: 'automacao',     icon: '⚡', status: 'disconnected', lastSync: null },
      { id: 'n8n',         label: 'N8N',                  category: 'automacao',     icon: '🔗', status: 'disconnected', lastSync: null },
      { id: 'make',        label: 'Make (Integromat)',    category: 'automacao',     icon: '🧩', status: 'disconnected', lastSync: null },
      { id: 'webhook',     label: 'Webhook Customizado',  category: 'automacao',     icon: '🪝', status: 'disconnected', lastSync: null,
        fields: [{ key: 'url', label: 'URL do Webhook', placeholder: 'https://sua-api.com/webhook' }] },

      { id: 'mercadopago', label: 'Mercado Pago',         category: 'pagamentos',    icon: '💰', status: 'disconnected', lastSync: null },
      { id: 'stripe',      label: 'Stripe',               category: 'pagamentos',    icon: '💳', status: 'disconnected', lastSync: null },
      { id: 'asaas',       label: 'Asaas',                category: 'pagamentos',    icon: '🏦', status: 'disconnected', lastSync: null },
      { id: 'pagarme',     label: 'Pagar.me',             category: 'pagamentos',    icon: '🧾', status: 'disconnected', lastSync: null },

      { id: 'rdstation',   label: 'RD Station',           category: 'marketing',     icon: '📈', status: 'disconnected', lastSync: null },
      { id: 'hubspot',     label: 'HubSpot (Import)',     category: 'importacao',    icon: '🎯', status: 'disconnected', lastSync: null },
      { id: 'pipedrive',   label: 'Pipedrive (Import)',   category: 'importacao',    icon: '📥', status: 'disconnected', lastSync: null },
      { id: 'csv',         label: 'Importar CSV',         category: 'importacao',    icon: '📄', status: 'disconnected', lastSync: null },

      { id: 'tinyerp',     label: 'Tiny ERP',             category: 'erp',           icon: '🏭', status: 'disconnected', lastSync: null },
      { id: 'bling',       label: 'Bling',                category: 'erp',           icon: '📦', status: 'disconnected', lastSync: null },
      { id: 'contaazul',   label: 'Conta Azul',           category: 'erp',           icon: '💼', status: 'disconnected', lastSync: null },

      { id: 'openai',      label: 'OpenAI',                category: 'ia',            icon: '🤖', status: 'disconnected', lastSync: null,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-...', type: 'password' }] },
      { id: 'claude',      label: 'Claude API (Anthropic)', category: 'ia',          icon: '🧠', status: 'disconnected', lastSync: null,
        fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-ant-...', type: 'password' }] },
      { id: 'evolutionapi', label: 'Evolution API',        category: 'ia',           icon: '⚙️', status: 'disconnected', lastSync: null },

      { id: 'restapi',     label: 'API REST / OAuth',     category: 'dev',           icon: '🔑', status: 'connected',    lastSync: '2026-07-18T22:15:00' },
    ];
  }

  function loadCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* fallback abaixo */ }
    const seed = buildCatalog();
    saveCatalog(seed);
    return seed;
  }

  function saveCatalog(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; }
    catch (err) { console.error('[Integrations] Falha ao persistir:', err); return false; }
  }

  function loadLogs(integrationId) {
    try {
      const raw = localStorage.getItem(`ibex_integ_logs_${integrationId}`);
      if (raw) return JSON.parse(raw);
    } catch { /* vazio */ }
    return [];
  }

  function appendLog(integrationId, entry) {
    const logs = loadLogs(integrationId);
    logs.unshift({ ...entry, time: new Date().toISOString() });
    try { localStorage.setItem(`ibex_integ_logs_${integrationId}`, JSON.stringify(logs.slice(0, 30))); } catch {}
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONTROLLER
     ═══════════════════════════════════════════════════════════════════════ */

  class IntegrationsController {

    constructor(app) {
      this._app = app;
      this._catalog = loadCatalog();
      this._activeCategory = 'all';
      this._searchQuery = '';
      this._pendingConnectId = null;
      this._activeLogsId = null;

      this._renderHeaderStats();
      this._renderCatTabs();
      this._renderGrid();
      this._bindSearch();
      this._bindConnectModal();
      this._bindLogsDrawer();
    }

    _toast(type, title, msg) {
      const fn = this._app?.state?.[`toast${type}`];
      if (typeof fn === 'function') fn.call(this._app.state, title, msg);
    }

    _persist() { saveCatalog(this._catalog); }

    /* ── Header stats ─────────────────────────────────────────────────── */

    _renderHeaderStats() {
      const el = document.getElementById('integrations-header-stats');
      if (!el) return;
      const total = this._catalog.length;
      const connected = this._catalog.filter(i => i.status === 'connected').length;
      el.innerHTML = `
        <div class="team-stat">
          <div class="team-stat-value" style="color:var(--emerald-400)">${connected}</div>
          <div class="team-stat-label">Conectadas</div>
        </div>
        <div class="team-stat">
          <div class="team-stat-value">${total}</div>
          <div class="team-stat-label">Disponíveis</div>
        </div>
      `;
    }

    /* ── Tabs de Categoria ────────────────────────────────────────────── */

    _renderCatTabs() {
      const wrap = document.getElementById('integrations-cat-tabs');
      if (!wrap) return;

      const countByCategory = {};
      this._catalog.forEach(i => { countByCategory[i.category] = (countByCategory[i.category] || 0) + 1; });

      const allTab = `
        <button class="integ-cat-tab ${this._activeCategory === 'all' ? 'active' : ''}" data-cat="all">
          Todas <span class="integ-cat-tab-count">${this._catalog.length}</span>
        </button>
      `;

      const tabs = CATEGORIES.map(c => {
        const count = countByCategory[c.id] || 0;
        if (count === 0) return '';
        return `
          <button class="integ-cat-tab ${this._activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
            ${esc(c.label)} <span class="integ-cat-tab-count">${count}</span>
          </button>
        `;
      }).join('');

      wrap.innerHTML = allTab + tabs;

      wrap.querySelectorAll('.integ-cat-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          this._activeCategory = btn.dataset.cat;
          this._renderCatTabs();
          this._renderGrid();
        });
      });
    }

    /* ── Filtro combinado ─────────────────────────────────────────────── */

    _getFiltered() {
      let list = this._catalog;
      if (this._activeCategory !== 'all') list = list.filter(i => i.category === this._activeCategory);
      if (this._searchQuery.trim()) {
        const q = this._searchQuery.trim().toLowerCase();
        list = list.filter(i => i.label.toLowerCase().includes(q));
      }
      return list;
    }

    /* ── Grid de Cards ────────────────────────────────────────────────── */

    _renderGrid() {
      const grid = document.getElementById('integrations-grid');
      if (!grid) return;

      const list = this._getFiltered();

      if (list.length === 0) {
        grid.innerHTML = `
          <div class="integ-empty">
            <div class="integ-empty-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            </div>
            <div class="integ-empty-title">Nenhuma integração encontrada</div>
            <div class="integ-empty-sub">Tente outra categoria ou termo de busca.</div>
          </div>
        `;
        return;
      }

      grid.innerHTML = list.map((i, idx) => this._renderCard(i, idx)).join('');
      this._bindCardActions(grid);
    }

    _renderCard(integ, idx) {
      const isConnected = integ.status === 'connected';
      const catLabel = CATEGORIES.find(c => c.id === integ.category)?.label || integ.category;

      return `
        <div class="integ-card stagger-item" style="animation-delay:${idx * 20}ms" data-integ-id="${integ.id}">
          <div class="integ-card-header">
            <div class="integ-card-icon">${integ.icon}</div>
            <div class="integ-card-info">
              <div class="integ-card-name">${esc(integ.label)}</div>
              <div class="integ-card-category">${esc(catLabel)}</div>
            </div>
            <span class="integ-card-status integ-card-status--${isConnected ? 'connected' : 'disconnected'}">
              <span class="integ-status-dot"></span>
              ${isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <div class="integ-card-sync">
            ${isConnected ? `Última sync: ${formatRelative(integ.lastSync)}` : ''}
          </div>
          <div class="integ-card-actions">
            ${isConnected ? `
              <button class="btn btn-secondary btn-sm" data-action="test" data-integ-id="${integ.id}">Testar</button>
              <button class="btn btn-secondary btn-sm" data-action="logs" data-integ-id="${integ.id}">Logs</button>
              <button class="btn btn-secondary btn-sm" data-action="disconnect" data-integ-id="${integ.id}" style="color:var(--rose-400)">Desconectar</button>
            ` : `
              <button class="btn btn-primary btn-sm" data-action="connect" data-integ-id="${integ.id}" style="flex:1">Conectar</button>
            `}
          </div>
        </div>
      `;
    }

    _bindCardActions(grid) {
      grid.querySelectorAll('[data-action="connect"]').forEach(btn => {
        btn.addEventListener('click', () => this._openConnectModal(btn.dataset.integId));
      });
      grid.querySelectorAll('[data-action="test"]').forEach(btn => {
        btn.addEventListener('click', () => this._testConnection(btn.dataset.integId, btn));
      });
      grid.querySelectorAll('[data-action="logs"]').forEach(btn => {
        btn.addEventListener('click', () => this._openLogsDrawer(btn.dataset.integId));
      });
      grid.querySelectorAll('[data-action="disconnect"]').forEach(btn => {
        btn.addEventListener('click', () => this._disconnect(btn.dataset.integId));
      });
    }

    /* ── Busca ────────────────────────────────────────────────────────── */

    _bindSearch() {
      const input = document.getElementById('integrations-search-input');
      if (!input) return;
      let timer;
      input.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this._searchQuery = e.target.value;
          this._renderGrid();
        }, 200);
      });
    }

    /* ── Modal de Conexão ─────────────────────────────────────────────── */

    _openConnectModal(integId) {
      const integ = this._catalog.find(i => i.id === integId);
      if (!integ) return;

      this._pendingConnectId = integId;

      document.getElementById('integ-modal-icon').textContent = integ.icon;
      document.getElementById('integ-modal-title').textContent = `Conectar ${integ.label}`;

      const fieldsWrap = document.getElementById('integ-modal-fields');
      const fields = integ.fields || [{ key: 'apiKey', label: 'Chave de API / Token', placeholder: 'Cole sua credencial aqui' }];

      fieldsWrap.innerHTML = fields.map((f, i) => `
        <div class="form-group">
          <label class="form-label" for="integ-field-${i}">${esc(f.label)}</label>
          <input type="${f.type || 'text'}" class="form-input" id="integ-field-${i}" placeholder="${esc(f.placeholder || '')}" required />
        </div>
      `).join('');

      const modal = document.getElementById('integ-modal-connect');
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('modal-overlay--open'));
      document.getElementById('integ-field-0')?.focus();
    }

    _bindConnectModal() {
      const modal = document.getElementById('integ-modal-connect');
      if (!modal) return;

      const close = () => {
        modal.classList.remove('modal-overlay--open');
        setTimeout(() => { modal.hidden = true; document.getElementById('integ-connect-form')?.reset(); }, 150);
        this._pendingConnectId = null;
      };
      modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', close));

      document.getElementById('integ-connect-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const integId = this._pendingConnectId;
        const integ = this._catalog.find(i => i.id === integId);
        if (!integ) return;

        const submitBtn = document.getElementById('integ-connect-submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Conectando…';

        // Simula latência de rede real de um fluxo OAuth/API
        await new Promise(r => setTimeout(r, 900));

        integ.status = 'connected';
        integ.lastSync = new Date().toISOString();
        this._persist();
        appendLog(integId, { status: 'success', title: 'Conexão estabelecida com sucesso' });

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;

        close();
        this._renderHeaderStats();
        this._renderCatTabs();
        this._renderGrid();
        this._toast('Success', 'Integração conectada', `${integ.label} está pronto para uso.`);
      });
    }

    /* ── Testar Conexão ───────────────────────────────────────────────── */

    async _testConnection(integId, btn) {
      const integ = this._catalog.find(i => i.id === integId);
      if (!integ) return;

      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Testando…';

      await new Promise(r => setTimeout(r, 1200));

      btn.disabled = false;
      btn.textContent = original;

      appendLog(integId, { status: 'success', title: 'Teste de conexão bem-sucedido' });
      this._toast('Success', 'Conexão OK', `${integ.label} está respondendo normalmente.`);
    }

    /* ── Desconectar ──────────────────────────────────────────────────── */

    async _disconnect(integId) {
      const integ = this._catalog.find(i => i.id === integId);
      if (!integ) return;

      const confirmed = await window.ibexConfirm({
        title: 'Desconectar integração?',
        message: `${integ.label} será desconectado. Sincronizações automáticas serão interrompidas.`,
        confirmLabel: 'Desconectar',
        isDanger: true,
      });
      if (!confirmed) return;

      integ.status = 'disconnected';
      this._persist();
      appendLog(integId, { status: 'info', title: 'Integração desconectada pelo usuário' });

      this._renderHeaderStats();
      this._renderCatTabs();
      this._renderGrid();
      this._toast('Warn', 'Integração desconectada', `${integ.label} foi desconectado.`);
    }

    /* ── Drawer de Logs ───────────────────────────────────────────────── */

    _openLogsDrawer(integId) {
      const integ = this._catalog.find(i => i.id === integId);
      if (!integ) return;

      this._activeLogsId = integId;

      const overlay = document.getElementById('integ-logs-overlay');
      const drawer  = document.getElementById('integ-logs-drawer');
      if (!overlay || !drawer) return;

      document.getElementById('integ-logs-icon').textContent = integ.icon;
      document.getElementById('integ-logs-name').textContent = integ.label;

      this._renderLogsList(integId);

      drawer.hidden = false;
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    _closeLogsDrawer() {
      const overlay = document.getElementById('integ-logs-overlay');
      const drawer  = document.getElementById('integ-logs-drawer');
      if (drawer)  drawer.hidden  = true;
      if (overlay) overlay.hidden = true;
      this._activeLogsId = null;
      document.body.style.overflow = '';
    }

    _renderLogsList(integId) {
      const body = document.getElementById('integ-logs-body');
      if (!body) return;

      let logs = loadLogs(integId);

      // Seed de logs de exemplo na primeira abertura, para a tela não parecer vazia
      if (logs.length === 0) {
        const now = Date.now();
        logs = [
          { status: 'success', title: 'Sincronização concluída (14 registros)', time: new Date(now - 3600_000).toISOString() },
          { status: 'success', title: 'Conexão estabelecida com sucesso', time: new Date(now - 86400_000).toISOString() },
          { status: 'info',    title: 'Configuração inicial validada', time: new Date(now - 90000_000).toISOString() },
        ];
      }

      const ICONS = {
        success: '✓', error: '✕', info: 'ℹ',
      };

      body.innerHTML = `
        <div class="drawer-section">
          ${logs.map(log => `
            <div class="integ-log-item">
              <span class="integ-log-status-icon integ-log-status-icon--${log.status}">${ICONS[log.status] || 'ℹ'}</span>
              <div class="integ-log-body">
                <div class="integ-log-title">${esc(log.title)}</div>
                <div class="integ-log-time">${formatRelative(log.time)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    _bindLogsDrawer() {
      const overlay = document.getElementById('integ-logs-overlay');
      const drawer  = document.getElementById('integ-logs-drawer');
      if (!overlay || !drawer) return;

      overlay.addEventListener('click', () => this._closeLogsDrawer());
      drawer.querySelectorAll('[data-close-logs]').forEach(el => el.addEventListener('click', () => this._closeLogsDrawer()));

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !drawer.hidden) this._closeLogsDrawer();
      });
    }
  }

  /* ── Bootstrap ─────────────────────────────────────────────────────────── */

  function init() {
    if (!window.Ibex?.storage) return setTimeout(init, 50);
    window.Ibex.integrations = new IntegrationsController(window.Ibex);
    console.info('[Integrations] Módulo v1.0 inicializado.');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
