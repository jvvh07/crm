/**
 * IBEX CRM — IbexStorage
 * Camada de persistência via Backend API com cache síncrono para compatibilidade.
 *
 * @version 1.2.0
 */

'use strict';

const IBEX_VERSION = '1.0.0';
const API_BASE = 'http://localhost:3000/api';

/* ─ localStorage fallback keys ─────────────────────────────────────────── */
const LS_KEYS = Object.freeze({
  LEADS:         'ibex_ls_leads',
  TASKS:         'ibex_ls_tasks',
  AUTOMATIONS:   'ibex_ls_automations',
  SETTINGS:      'ibex_ls_settings',
  NOTIFICATIONS: 'ibex_ls_notifications',
});

function lsRead(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function lsWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const STORAGE_KEYS = Object.freeze({
  VERSION:       'ibex_version',
  LEADS:         'ibex_leads',
  TASKS:         'ibex_tasks',
  SETTINGS:      'ibex_settings',
  AUTOMATIONS:   'ibex_automations',
});

const PIPELINE_STAGES = Object.freeze([
  { id: 'new',         label: 'Novo Lead',        order: 0, color: '#6366f1', probability: 10  },
  { id: 'qualified',   label: 'Qualificado',       order: 1, color: '#0ea5e9', probability: 25  },
  { id: 'proposal',    label: 'Proposta Enviada',  order: 2, color: '#f59e0b', probability: 50  },
  { id: 'negotiation', label: 'Negociação',        order: 3, color: '#8b5cf6', probability: 75  },
  { id: 'won',         label: 'Fechado (Ganho)',   order: 4, color: '#10b981', probability: 100 },
  { id: 'lost',        label: 'Fechado (Perdido)', order: 5, color: '#f43f5e', probability: 0   },
]);

const TAGS_LIBRARY = Object.freeze([
  { id: 't1', label: 'Decisor',       color: '#6366f1' },
  { id: 't2', label: 'Alta Urgência', color: '#f43f5e' },
  { id: 't3', label: 'Enterprise',    color: '#0ea5e9' },
  { id: 't4', label: 'SMB',           color: '#f59e0b' },
]);

class IbexStorage {

  constructor() {
    this._cache = {
      leads: [],
      tasks: [],
      automations: [],
      settings: {},
      notifications: [],
      users: [
        { id: 'u1', name: 'Juan Heuer', role: 'Executivo de Contas Sr.', initials: 'JH', color: '#6366f1', quota: 500000 },
        { id: 'u2', name: 'Juliana Andrade', role: 'Account Executive', initials: 'JA', color: '#10b981', quota: 480000 }
      ]
    };
    this._ready = false;
    this._offlineMode = false;
  }

  async _initStorage() {
    try {
      const [leads, tasks, automations, settings] = await Promise.all([
        this._api('/leads'),
        this._api('/tasks'),
        this._api('/automations'),
        this._api('/settings')
      ]);

      this._cache.leads       = leads;
      this._cache.tasks       = tasks;
      this._cache.automations = automations;
      this._cache.settings    = settings;
      this._cache.notifications = lsRead(LS_KEYS.NOTIFICATIONS, []);
      this._offlineMode = false;
      this._ready = true;

      /* Persist to localStorage as offline backup */
      lsWrite(LS_KEYS.LEADS,       leads);
      lsWrite(LS_KEYS.TASKS,       tasks);
      lsWrite(LS_KEYS.AUTOMATIONS, automations);
      lsWrite(LS_KEYS.SETTINGS,    settings);

      console.info('[IbexStorage] Backend sync complete. Leads:', leads.length);
    } catch (e) {
      /* ── Offline fallback: load from localStorage ── */
      console.warn('[IbexStorage] Backend offline — loading from localStorage cache.');
      this._offlineMode = true;
      this._cache.leads       = lsRead(LS_KEYS.LEADS,       []);
      this._cache.tasks       = lsRead(LS_KEYS.TASKS,       []);
      this._cache.automations = lsRead(LS_KEYS.AUTOMATIONS, []);
      this._cache.settings    = lsRead(LS_KEYS.SETTINGS,    {});
      this._cache.notifications = lsRead(LS_KEYS.NOTIFICATIONS, []);
      this._ready = true;
      this._emit('ibex:offline', { message: 'Trabalhando offline — dados do cache local.' });
    }
  }

  async _api(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
    });
    if (!response.ok) throw new Error(`API Error ${response.status}`);
    return response.json();
  }

  /* ── Safe API wrapper: falls back gracefully in offline mode ── */
  async _safePut(path, options = {}) {
    if (this._offlineMode) return null;
    try { return await this._api(path, options); }
    catch (e) { console.warn('[IbexStorage] Write failed (offline):', e.message); return null; }
  }

  _emit(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true }));
  }

  _genId() {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  }

  /* ── Síncronos (Leitura do Cache) ── */

  getLeads({ includeArchived = false } = {}) {
    return includeArchived ? this._cache.leads : this._cache.leads.filter(l => !l.isArchived);
  }

  getLeadById(id) {
    return this._cache.leads.find(l => l.id === id) || null;
  }

  getTasks() {
    return this._cache.tasks;
  }

  getSettings() {
    return this._cache.settings;
  }

  getAutomations() {
    return this._cache.automations;
  }

  /* ── Assíncronos (Escrita + Sync Cache) ── */

  async createLead(data) {
    const now = new Date().toISOString();
    const newLead = {
      id: this._genId(),
      firstName: '', lastName: '', fullName: '', role: '', email: '', phone: '',
      company: '', segment: '', stage: 'new', dealValue: 0, heatScore: 50,
      notes: '', isArchived: false, isStarred: false, tags: [],
      owner: 'u1', source: '', closingDate: null,
      createdAt: now, updatedAt: now,
      ...data
    };
    if (newLead.firstName && newLead.lastName && !data.fullName) {
      newLead.fullName = `${newLead.firstName} ${newLead.lastName}`.trim();
    }

    this._cache.leads.push(newLead);
    lsWrite(LS_KEYS.LEADS, this._cache.leads);
    await this._safePut('/leads', { method: 'POST', body: JSON.stringify(newLead) });
    this._emit('ibex:lead:created', { lead: newLead });
    return newLead;
  }

  async updateLead(id, changes) {
    const idx = this._cache.leads.findIndex(l => l.id === id);
    if (idx === -1) return null;

    const stageChanged = changes.stage && changes.stage !== this._cache.leads[idx].stage;
    const updated = { ...this._cache.leads[idx], ...changes, id, updatedAt: new Date().toISOString() };
    this._cache.leads[idx] = updated;

    lsWrite(LS_KEYS.LEADS, this._cache.leads);
    await this._safePut(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(updated) });
    this._emit('ibex:lead:updated', { lead: updated, stageChanged });
    return updated;
  }

  async moveLeadStage(id, stage) {
    return this.updateLead(id, { stage });
  }

  async deleteLead(id) {
    this._cache.leads = this._cache.leads.filter(l => l.id !== id);
    lsWrite(LS_KEYS.LEADS, this._cache.leads);
    await this._safePut(`/leads/${id}`, { method: 'DELETE' });
    this._emit('ibex:lead:deleted', { id });
    return true;
  }

  searchLeads(query) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return this._cache.leads
      .filter(l => !l.isArchived && (
        (l.fullName || '').toLowerCase().includes(q) ||
        (l.company  || '').toLowerCase().includes(q) ||
        (l.email    || '').toLowerCase().includes(q) ||
        (l.segment  || '').toLowerCase().includes(q)
      ))
      .slice(0, 8);
  }

  async createTask(data) {
    const now = new Date().toISOString();
    const newTask = {
      id: this._genId(),
      status: 'pending',
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      dueDate: null,
      leadId: null,
      company: '',
      owner: 'u1',
      notes: '',
      type: 'follow_up',
      ...data
    };
    /* Map dueDate → date+time for backend schema */
    const backendTask = {
      ...newTask,
      date: newTask.dueDate ? newTask.dueDate.split('T')[0] : null,
      time: newTask.dueDate ? (newTask.dueDate.split('T')[1] || '09:00') : null,
    };
    this._cache.tasks.push(newTask);
    lsWrite(LS_KEYS.TASKS, this._cache.tasks);
    await this._safePut('/tasks', { method: 'POST', body: JSON.stringify(backendTask) });
    this._emit('ibex:task:created', { task: newTask });
    return newTask;
  }

  async updateTask(id, changes) {
    const idx = this._cache.tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    const updated = { ...this._cache.tasks[idx], ...changes, id, updatedAt: new Date().toISOString() };
    this._cache.tasks[idx] = updated;
    lsWrite(LS_KEYS.TASKS, this._cache.tasks);
    const backendTask = { ...updated, date: updated.dueDate?.split('T')[0], time: updated.dueDate?.split('T')[1] || '09:00' };
    await this._safePut(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(backendTask) });
    this._emit('ibex:task:updated', { task: updated });
    return updated;
  }

  async completeTask(id) {
    return this.updateTask(id, { status: 'done', updatedAt: new Date().toISOString() });
  }

  async deleteTask(id) {
    const task = this._cache.tasks.find(t => t.id === id);
    if (!task) return false;
    this._cache.tasks = this._cache.tasks.filter(t => t.id !== id);
    lsWrite(LS_KEYS.TASKS, this._cache.tasks);
    await this._safePut(`/tasks/${id}`, { method: 'DELETE' });
    this._emit('ibex:task:deleted', { id });
    return true;
  }

  logActivity(data) {
    /* Activities are derived from leads/tasks in getActivities() — this is a hook for future persistence */
    const activity = {
      id: this._genId(),
      time: new Date().toISOString(),
      owner: 'Você',
      ...data,
    };
    this._emit('ibex:activity:logged', { activity });
    return activity;
  }

  async updateSetting(key, value) {
    this._cache.settings[key] = value;
    lsWrite(LS_KEYS.SETTINGS, this._cache.settings);
    await this._safePut(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
    /* Emit with full settings object so listeners can access any key */
    this._emit('ibex:settings:updated', { key, value, settings: { ...this._cache.settings } });
  }

  async saveAutomation(wf) {
    const isNew = !wf.id || wf.id.startsWith('new-');
    if (isNew) wf.id = 'wf-' + Date.now();

    if (isNew) {
      this._cache.automations.push(wf);
      await this._safePut('/automations', { method: 'POST', body: JSON.stringify(wf) });
    } else {
      const idx = this._cache.automations.findIndex(a => a.id === wf.id);
      if (idx !== -1) this._cache.automations[idx] = wf;
      await this._safePut(`/automations/${wf.id}`, { method: 'PUT', body: JSON.stringify(wf) });
    }
    lsWrite(LS_KEYS.AUTOMATIONS, this._cache.automations);
    this._emit('ibex:automations:updated', { automation: wf });
    return wf;
  }

  /* ── Notificações ───────────────────────────────────────────────────── */

  getNotifications() { return this._cache.notifications; }

  addNotification(notif) {
    const n = { id: this._genId(), read: false, time: new Date().toISOString(), ...notif };
    this._cache.notifications.unshift(n);
    if (this._cache.notifications.length > 50) this._cache.notifications.length = 50;
    lsWrite(LS_KEYS.NOTIFICATIONS, this._cache.notifications);
    this._emit('ibex:notification:added', { notification: n });
    return n;
  }

  markNotificationRead(id) {
    const n = this._cache.notifications.find(n => n.id === id);
    if (n) n.read = true;
    lsWrite(LS_KEYS.NOTIFICATIONS, this._cache.notifications);
    this._emit('ibex:notification:read', {});
  }

  markAllNotificationsRead() {
    this._cache.notifications.forEach(n => n.read = true);
    lsWrite(LS_KEYS.NOTIFICATIONS, this._cache.notifications);
    this._emit('ibex:notification:read', {});
  }

  /* ── Outros ── */
  getPipelineStages() {
    // Se o usuário customizou o pipeline padrão no Pipeline Builder
    // (pipeline-builder.html), refletir essa customização aqui, mantendo
    // o comportamento original intacto quando nada foi customizado ainda.
    try {
      const raw = localStorage.getItem('ibex_pipelines_v1');
      if (raw) {
        const pipelines = JSON.parse(raw);
        const defaultPl = pipelines.find(p => p.isDefault) || pipelines[0];
        if (defaultPl && Array.isArray(defaultPl.stages) && defaultPl.stages.length > 0) {
          return defaultPl.stages
            .slice()
            .sort((a, b) => a.order - b.order)
            .map(s => ({ id: s.id, label: s.label, order: s.order, color: s.color, probability: s.probability }));
        }
      }
    } catch { /* localStorage indisponível ou dado corrompido — usar fallback */ }
    return PIPELINE_STAGES;
  }
  /**
   * BUGFIX (auditoria de integração — mesma classe do bug já corrigido em
   * getPipelineStages()): team.js mantinha seu próprio roster de
   * colaboradores em localStorage ('ibex_team_v1'), completamente
   * desconectado deste getUsers(). Resultado prático: adicionar alguém na
   * tela de Equipe nunca fazia essa pessoa aparecer como responsável
   * selecionável em Leads, Pipeline ou Tarefas — a feature era uma ilha.
   * Aqui, se o roster de Equipe existir, ele passa a ser a fonte real;
   * caso contrário, cai no array estático original (mantendo o
   * comportamento anterior intacto).
   */
  getUsers() {
    try {
      const raw = localStorage.getItem('ibex_team_v1');
      if (raw) {
        const members = JSON.parse(raw);
        if (Array.isArray(members) && members.length > 0) {
          return members
            .filter(m => m.status !== 'inactive') // inativos não devem virar responsáveis novos
            .map(m => ({
              id: m.id,
              name: m.name,
              role: m.role,
              initials: window.getInitials ? window.getInitials(m.name) : (m.name || '').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(),
              color: window.getAvatarColor ? window.getAvatarColor(m.name) : '#6366f1',
              quota: m.quota || 0,
            }));
        }
      }
    } catch { /* localStorage indisponível ou dado corrompido — usa fallback abaixo */ }
    return this._cache.users;
  }
  getTags() { return TAGS_LIBRARY; }
  getMetrics() { 
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      months.push({
        label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1) + ' ' + d.getFullYear(),
        year: d.getFullYear(),
        month: d.getMonth()
      });
    }

    const wonLeads = this._cache.leads.filter(l => l.stage === 'won' && !l.isArchived);

    return months.map(m => {
      const leadsInMonth = wonLeads.filter(l => {
        const d = new Date(l.updatedAt || l.createdAt);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      });

      const revenue = leadsInMonth.reduce((sum, l) => sum + (l.dealValue || 0), 0);
      const mrr = leadsInMonth.reduce((sum, l) => sum + (l.mrr || (l.dealValue || 0) * 0.1), 0);

      return {
        month: m.label,
        revenue,
        mrr
      };
    });
  }

  getGoals() { 
    const won = this._cache.leads.filter(l => l.stage === 'won');
    return { revenue: { target: 980000, current: won.reduce((a, b) => a + (b.dealValue || 0), 0) } }; 
  }

  getKPIs() { 
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
    
    const active = this._cache.leads.filter(l => !['won','lost'].includes(l.stage) && !l.isArchived);
    const won = this._cache.leads.filter(l => l.stage === 'won');
    
    const staleLeads = active.filter(l => new Date(l.updatedAt) < threeDaysAgo);
    const hotLeads = active.filter(l => (l.heatScore || 0) > 80);
    
    return {
      totalLeads: this._cache.leads.length,
      activeLeads: active.length,
      pipelineValue: active.reduce((a, b) => a + (b.dealValue || 0), 0),
      wonValue: won.reduce((a, b) => a + (b.dealValue || 0), 0),
      weightedPipeline: active.reduce((a, b) => {
        const stage = PIPELINE_STAGES.find(s => s.id === b.stage);
        return a + ((b.dealValue || 0) * (stage?.probability || 0) / 100);
      }, 0),
      staleLeadsCount: staleLeads.length,
      hotLeadsCount: hotLeads.length,
      overdueTasks: this._cache.tasks.filter(t => t.status === 'overdue' || (t.status === 'pending' && new Date(t.dueDate) < now)).length,
      winRate: this._cache.leads.length ? Math.round((won.length / this._cache.leads.length) * 100) : 0,
      avgDealValue: won.length ? Math.round(won.reduce((a, b) => a + (b.dealValue || 0), 0) / won.length) : 0,
      goals: this.getGoals()
    };
  }

  getActivities() { 
    const activities = [];
    
    const completedTasks = this._cache.tasks.filter(t => t.status === 'done');
    completedTasks.forEach(t => {
      activities.push({
        id: `act-t-${t.id}`,
        type: 'task_completed',
        title: `Tarefa Concluída`,
        meta: t.title,
        owner: 'Você',
        time: t.updatedAt || t.createdAt,
      });
    });

    this._cache.leads.forEach(l => {
      activities.push({
        id: `act-l-${l.id}`,
        type: 'new_lead',
        title: `Lead Adicionado`,
        meta: l.fullName,
        owner: 'Você',
        time: l.createdAt,
      });

      if (l.stage === 'won') {
        activities.push({
          id: `act-w-${l.id}`,
          type: 'deal_won',
          title: `Negócio Fechado`,
          meta: `${l.fullName} (${l.dealValue ? 'R$'+l.dealValue : 'Sem valor'})`,
          owner: 'Você',
          time: l.updatedAt || l.createdAt,
        });
      } else if (l.stage === 'proposal') {
        activities.push({
          id: `act-p-${l.id}`,
          type: 'proposal_sent',
          title: `Proposta Enviada`,
          meta: l.fullName,
          owner: 'Você',
          time: l.updatedAt || l.createdAt,
        });
      }
    });

    return activities.sort((a, b) => new Date(b.time) - new Date(a.time));
  }
  
  getCurrentUser() { return this._cache.users[0]; }
  archiveLead(id) { return this.updateLead(id, { isArchived: true }); }
  toggleStar(id) { 
    const l = this.getLeadById(id);
    return this.updateLead(id, { isStarred: !l?.isStarred });
  }
  isOffline() { return this._offlineMode; }
}

window.IbexStorage = IbexStorage;
window.PIPELINE_STAGES = PIPELINE_STAGES;
window.TAGS_LIBRARY = TAGS_LIBRARY;
