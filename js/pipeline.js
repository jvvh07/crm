/**
 * IBEX CRM — pipeline.js
 * Kanban Board com Drag-and-Drop nativo (HTML5 DnD API)
 * @version 1.0.0
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────── */

/**
 * BUGFIX (auditoria de integração): STAGES era uma constante 100% hardcoded,
 * desconectada da customização feita em pipeline-builder.html. Renomear ou
 * recolorir um estágio lá nunca refletia aqui, apesar de storage.js já
 * expor os dados dinâmicos via getPipelineStages() desde a integração
 * anterior — só faltava este arquivo específico consumi-los.
 */
const STAGES_FALLBACK = [
  { id: 'new',         label: 'Novo Lead',        color: '#6366f1', bg: 'rgba(99,102,241,0.15)'  },
  { id: 'qualified',   label: 'Qualificado',       color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)'  },
  { id: 'proposal',    label: 'Proposta Enviada',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  { id: 'negotiation', label: 'Negociação',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
  { id: 'won',         label: 'Fechado (Ganho)',   color: '#10b981', bg: 'rgba(16,185,129,0.15)'  },
  { id: 'lost',        label: 'Fechado (Perdido)', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)'   },
];

function hexToRgbaBg(hex, alpha = 0.15) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(99,102,241,0.15)'; // fallback seguro se a cor vier inválida
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getStages() {
  try {
    const dynamic = window.Ibex?.storage?.getPipelineStages?.();
    if (Array.isArray(dynamic) && dynamic.length > 0) {
      return dynamic.map(s => ({
        id: s.id,
        label: s.label,
        color: s.color,
        bg: hexToRgbaBg(s.color),
      }));
    }
  } catch { /* usa fallback abaixo */ }
  return STAGES_FALLBACK;
}

const STAGES = getStages();

const HEAT_CONFIG = [
  { max: 30,  label: 'FRIO',    color: '#60a5fa' },
  { max: 59,  label: 'MORNO',   color: '#f59e0b' },
  { max: 79,  label: 'QUENTE',  color: '#f97316' },
  { max: 100, label: 'HOT 🔥',  color: '#ef4444' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   PIPELINE CONTROLLER
   ───────────────────────────────────────────────────────────────────────── */

class PipelineController {

  constructor(storage, state) {
    this._storage = storage;
    this._state   = state;

    this._leads     = [];
    this._users     = [];
    this._tagsLib   = [];
    this._compact   = false;
    this._filterOwner = 'all';
    this._filterQuery = '';

    /* Drag state */
    this._dragLeadId    = null;
    this._dragFromStage = null;
    this._placeholder   = null;

    this._init();
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */

  _init() {
    this._loadData();
    this._populateOwnerFilter();
    this._renderBoard();
    this._bindPageControls();
    this._bindModal();
    this._bindKeyboard();

    /* Storage events */
    document.addEventListener('ibex:lead:created', () => this._refresh());
    document.addEventListener('ibex:lead:updated', () => this._refresh());
    document.addEventListener('ibex:lead:deleted', () => this._refresh());
  }

  _loadData() {
    this._leads   = this._storage.getLeads({ includeArchived: false });
    this._users   = this._storage.getUsers();
    this._tagsLib = this._storage.getTags ? this._storage.getTags() : [];
  }

  _refresh() {
    this._loadData();
    this._renderBoard();
    this._renderSummary();
  }

  /* ── Filter / sort ────────────────────────────────────────────────────── */

  _getFilteredLeads() {
    let leads = [...this._leads];

    if (this._filterOwner !== 'all') {
      leads = leads.filter(l => l.owner === this._filterOwner);
    }

    if (this._filterQuery.length >= 2) {
      const q = this._filterQuery.toLowerCase();
      leads = leads.filter(l =>
        l.fullName.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q)  ||
        l.email.toLowerCase().includes(q)
      );
    }

    return leads;
  }

  _getColumnLeads(stageId) {
    return this._getFilteredLeads()
      .filter(l => l.stage === stageId)
      .sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
  }

  /* ── Board render ─────────────────────────────────────────────────────── */

  _renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;

    const totalValue = this._getFilteredLeads()
      .filter(l => l.stage !== 'won' && l.stage !== 'lost')
      .reduce((s, l) => s + (l.dealValue || 0), 0);

    board.innerHTML = STAGES.map(stage => this._buildColumnHTML(stage, totalValue)).join('') + `
      <button class="kanban-add-column-btn" id="kanban-add-col-btn" aria-label="Personalizar colunas">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Personalizar</span>
      </button>
    `;

    if (this._compact) board.classList.add('kanban-board--compact');
    else board.classList.remove('kanban-board--compact');

    this._bindColumnEvents();
    this._renderSummary();
  }

  _buildColumnHTML(stage, totalValue) {
    const leads = this._getColumnLeads(stage.id);
    const colValue = leads.reduce((s, l) => s + (l.dealValue || 0), 0);
    const pct = totalValue > 0 ? Math.round((colValue / totalValue) * 100) : 0;

    const fn = window.formatCurrency || (v => `R$ ${(v||0).toLocaleString('pt-BR')}`);

    const cardsHtml = leads.length > 0
      ? leads.map(l => this._buildCardHTML(l, stage)).join('')
      : `<div class="kanban-col-empty">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
             <circle cx="9" cy="7" r="4"/>
           </svg>
           <span>Sem leads neste estágio</span>
         </div>`;

    return `
      <div class="kanban-column" data-stage="${stage.id}"
           role="region" aria-label="Coluna: ${this._esc(stage.label)}">

        <div class="kanban-col-header">
          <span class="kanban-col-dot" style="background:${this._esc(stage.color)}"></span>
          <span class="kanban-col-title">${this._esc(stage.label)}</span>
          <span class="kanban-col-count">${leads.length}</span>
          <button class="kanban-col-add-btn" data-add-stage="${stage.id}" aria-label="Adicionar lead em ${this._esc(stage.label)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>

        <div class="kanban-col-value-bar">
          <span class="kanban-col-value-label">${pct}% do funil</span>
          <span class="kanban-col-value-amount">${fn(colValue, true)}</span>
        </div>
        <div class="kanban-col-progress">
          <div class="kanban-col-progress-fill" style="width:${pct}%;background:${this._esc(stage.color)}"></div>
        </div>

        <div class="kanban-cards" data-drop-zone="${stage.id}" aria-label="Cards de ${this._esc(stage.label)}">
          ${cardsHtml}
        </div>

      </div>
    `;
  }

  _buildCardHTML(lead, stage) {
    const heat = this._getHeat(lead.heatScore || 0);
    const user = this._users.find(u => u.id === lead.owner);
    const initials = (lead.firstName[0] || '') + (lead.lastName[0] || '');

    const tags = (lead.tags || []).slice(0, 2).map(tid => {
      const t = this._tagsLib.find(x => x.id === tid);
      return t ? `<span class="kanban-tag" style="background:${t.color}22;color:${t.color}">${this._esc(t.label)}</span>` : '';
    }).join('');

    const dueDate = lead.closingDate ? new Date(lead.closingDate) : null;
    const now = new Date();
    const isOverdue = dueDate && dueDate < now && lead.stage !== 'won' && lead.stage !== 'lost';
    const dueFmt = dueDate ? dueDate.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) : '';

    const fn = window.formatCurrency || (v => `R$ ${(v||0).toLocaleString('pt-BR')}`);

    return `
      <div class="kanban-card"
           data-lead-id="${lead.id}"
           data-stage="${stage.id}"
           draggable="true"
           role="button"
           tabindex="0"
           aria-label="${this._esc(lead.fullName)} — ${fn(lead.dealValue)}"
           style="--card-color:${this._esc(stage.color)}">
        
        <div class="kanban-card-actions">
           <button class="kanban-card-action-btn" data-whatsapp-phone="${this._esc(lead.phone || '')}" title="WhatsApp">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </button>
          <button class="kanban-card-action-btn" data-edit-id="${lead.id}" title="Editar">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>

        <div class="kanban-card-header">
          <div class="kanban-card-avatar" style="background:${stage.bg};color:${stage.color}">${initials}</div>
          <div style="flex:1;min-width:0">
            <div class="kanban-card-name">${this._esc(lead.fullName)}</div>
            <div class="kanban-card-company">${this._esc(lead.company)}</div>
          </div>
          <button class="kanban-card-star ${lead.isStarred ? 'starred' : ''}" data-star-id="${lead.id}" aria-label="Favoritar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${lead.isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
        </div>

        <div class="kanban-card-body">
          <div class="kanban-card-value-row">
            <span class="kanban-card-value">${fn(lead.dealValue, true)}</span>
            <div class="kanban-heat-badge" style="color:${heat.color}">
              <span class="heat-label">${heat.label}</span>
              <div class="heat-bar"><div class="heat-fill" style="width:${lead.heatScore || 0}%; background:${heat.color}"></div></div>
            </div>
          </div>
          
          ${tags ? `<div class="kanban-card-tags">${tags}</div>` : ''}
        </div>

        <div class="kanban-card-meta">
          <div class="meta-left">
            ${user ? `
              <div class="kanban-card-owner" title="Responsável: ${user.name}">
                <div class="kanban-owner-avatar" style="background:${user.color}22;color:${user.color}">${user.initials}</div>
              </div>
            ` : ''}
            <div class="kanban-card-age">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${this._getLeadAge(lead)}
            </div>
          </div>
          
          ${dueFmt ? `
            <div class="kanban-card-due ${isOverdue ? 'overdue' : ''}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${dueFmt}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /* ── Summary ──────────────────────────────────────────────────────────── */

  _renderSummary() {
    const el = document.getElementById('pipeline-summary');
    if (!el) return;

    const leads = this._getFilteredLeads();
    const active = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
    const won    = leads.filter(l => l.stage === 'won');
    const fn = window.formatCurrency || (v => `R$ ${(v||0).toLocaleString('pt-BR')}`);

    const total  = active.reduce((s, l) => s + (l.dealValue || 0), 0);
    const wonVal = won.reduce((s, l) => s + (l.dealValue || 0), 0);

    el.innerHTML = `
      <span class="pipeline-summary-pill" style="background:rgba(99,102,241,0.1);color:#818cf8;border-color:rgba(99,102,241,0.3)">
        ${active.length} ativos · ${fn(total, true)}
      </span>
      <span class="pipeline-summary-pill" style="background:rgba(16,185,129,0.1);color:#34d399;border-color:rgba(16,185,129,0.3)">
        ${won.length} ganhos · ${fn(wonVal, true)}
      </span>
    `;
  }

  /* ── Bind Column Events ────────────────────────────────────────────────── */

  _bindColumnEvents() {
    const board = document.getElementById('kanban-board');
    if (!board) return;

    /* Cards: click → navigate to leads page with lead in URL hash */
    board.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.kanban-card-star') || e.target.closest('[data-edit-id]')) return;
        window.location.href = `leads.html#lead-${card.dataset.leadId}`;
      });

      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
    });

    /* Star buttons */
    board.querySelectorAll('.kanban-card-star').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._storage.toggleStar(btn.dataset.starId);
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', btn.classList.toggle('starred') ? 'currentColor' : 'none');
        btn.classList.toggle('starred');
      });
    });

    /* Edit buttons */
    board.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const lead = this._storage.getLeadById(btn.dataset.editId);
        if (lead) this._openEditModal(lead);
      });
    });

    /* BUGFIX (auditoria de segurança): botão de WhatsApp antes usava
       onclick="window.open('...${lead.phone}...')" inline — o telefone do
       lead ia direto para dentro de uma string JavaScript de aspas simples,
       explorável mesmo com _esc() (que não escapa aspas simples). Trocado
       para o mesmo padrão de data-attribute + listener delegado usado nos
       outros botões do card, eliminando essa classe de risco por completo. */
    board.querySelectorAll('[data-whatsapp-phone]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const phone = (btn.dataset.whatsappPhone || '').replace(/\D/g, '');
        if (phone) window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer');
      });
    });

    /* Add lead to column */
    board.querySelectorAll('[data-add-stage]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._openCreateModal(btn.dataset.addStage);
      });
    });

    /* Drag and drop */
    this._initDragDrop(board);
  }

  /* ── Drag & Drop ──────────────────────────────────────────────────────── */

  _initDragDrop(board) {
    let dragCard     = null;
    let sourceZone   = null;
    let currentZone  = null;
    let placeholder  = null;

    const createPlaceholder = (h) => {
      const el = document.createElement('div');
      el.className = 'kanban-drop-placeholder';
      el.style.height = `${h}px`;
      return el;
    };

    const removePlaceholder = () => {
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      placeholder = null;
    };

    const clearDragOver = () => {
      board.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      board.querySelectorAll('.has-over').forEach(el => el.classList.remove('has-over'));
    };

    /* dragstart */
    board.addEventListener('dragstart', e => {
      dragCard = e.target.closest('.kanban-card');
      if (!dragCard) return;

      this._dragLeadId    = dragCard.dataset.leadId;
      this._dragFromStage = dragCard.dataset.stage;
      sourceZone          = dragCard.closest('.kanban-cards');

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this._dragLeadId);

      /* Ghost card offset: match mouse position */
      const rect = dragCard.getBoundingClientRect();
      e.dataTransfer.setDragImage(dragCard, e.clientX - rect.left, e.clientY - rect.top);

      requestAnimationFrame(() => dragCard.classList.add('dragging'));
    });

    /* dragover */
    board.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const zone = e.target.closest('.kanban-cards');
      if (!zone) return;

      if (zone !== currentZone) {
        clearDragOver();
        removePlaceholder();
        currentZone = zone;
        zone.classList.add('has-over');
        const col = zone.closest('.kanban-column');
        if (col) col.classList.add('drag-over');
      }

      /* Insert placeholder at drag position */
      if (!placeholder) {
        placeholder = createPlaceholder(dragCard ? dragCard.offsetHeight : 80);
      }

      const cards = [...zone.querySelectorAll('.kanban-card:not(.dragging)')];
      let afterCard = null;

      for (const c of cards) {
        const box = c.getBoundingClientRect();
        if (e.clientY < box.top + box.height / 2) { afterCard = c; break; }
      }

      if (placeholder.parentNode !== zone) {
        if (afterCard) zone.insertBefore(placeholder, afterCard);
        else zone.appendChild(placeholder);
      } else {
        if (afterCard && placeholder.nextSibling !== afterCard) zone.insertBefore(placeholder, afterCard);
        else if (!afterCard && zone.lastChild !== placeholder)  zone.appendChild(placeholder);
      }
    });

    /* dragleave */
    board.addEventListener('dragleave', e => {
      if (!board.contains(e.relatedTarget)) {
        clearDragOver();
        removePlaceholder();
        currentZone = null;
      }
    });

    /* drop */
    board.addEventListener('drop', e => {
      e.preventDefault();
      const targetZone  = e.target.closest('.kanban-cards');
      const targetStage = targetZone?.dataset.dropZone;

      if (!targetStage || !this._dragLeadId) {
        removePlaceholder();
        clearDragOver();
        return;
      }

      if (targetStage !== this._dragFromStage) {
        this._storage.moveLeadStage(this._dragLeadId, targetStage);
        const stage = STAGES.find(s => s.id === targetStage);
        const lead  = this._storage.getLeadById(this._dragLeadId);
        this._state.toastSuccess(
          `Movido para ${stage?.label}`,
          lead ? `${lead.fullName} → ${stage?.label}` : ''
        );
      } else {
        /* Reorder within same column (visual only, no persist) */
      }

      removePlaceholder();
      clearDragOver();
      dragCard?.classList.remove('dragging');

      this._refresh();
      dragCard     = null;
      sourceZone   = null;
      currentZone  = null;
      this._dragLeadId    = null;
      this._dragFromStage = null;
    });

    /* dragend (cleanup if dropped outside) */
    board.addEventListener('dragend', () => {
      dragCard?.classList.remove('dragging');
      removePlaceholder();
      clearDragOver();
      dragCard     = null;
      currentZone  = null;
    });
  }

  /* ── Owner filter populate ───────────────────────────────────────────── */

  _populateOwnerFilter() {
    const sel = document.getElementById('pipeline-filter-owner');
    if (!sel) return;
    this._users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.name;
      sel.appendChild(opt);
    });
  }

  /* ── Bind: page controls ─────────────────────────────────────────────── */

  _bindPageControls() {
    /* Owner filter */
    document.getElementById('pipeline-filter-owner')?.addEventListener('change', e => {
      this._filterOwner = e.target.value;
      this._renderBoard();
    });

    /* Search filter */
    const searchEl = document.getElementById('pipeline-search');
    if (searchEl) {
      const debouncedSearch = window.debounce
        ? debounce(() => { this._filterQuery = searchEl.value.trim(); this._renderBoard(); }, 280)
        : () => { this._filterQuery = searchEl.value.trim(); this._renderBoard(); };
      searchEl.addEventListener('input', debouncedSearch);
    }

    /* Compact mode toggle */
    document.getElementById('pipeline-compact-btn')?.addEventListener('click', (e) => {
      this._compact = !this._compact;
      e.currentTarget.classList.toggle('active', this._compact);
      const board = document.getElementById('kanban-board');
      board?.classList.toggle('kanban-board--compact', this._compact);
    });

    /* New lead btn */
    document.getElementById('topbar-new-lead-btn')?.addEventListener('click', () => {
      this._openCreateModal('new');
    });

    /* Sidebar/topbar shared behaviour */
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const menuBtn     = document.getElementById('topbar-menu-btn');
    const overlay     = document.getElementById('sidebar-overlay');
    const sidebar     = document.getElementById('sidebar');
    const appShell    = document.getElementById('app-shell');

    collapseBtn?.addEventListener('click', () => {
      sidebar?.classList.toggle('sidebar--collapsed');
      appShell?.classList.toggle('sidebar-collapsed');
    });

    const toggleMobile = () => {
      sidebar?.classList.toggle('sidebar--mobile-open');
      overlay?.classList.toggle('active');
    };
    menuBtn?.addEventListener('click', toggleMobile);
    overlay?.addEventListener('click', toggleMobile);

    /* Render user info */
    try {
      const user = this._storage.getCurrentUser?.();
      if (user) {
        document.getElementById('sidebar-user-name').textContent = user.name;
        document.getElementById('sidebar-user-role').textContent = user.role;
        const initials = user.initials || 'U';
        document.getElementById('sidebar-avatar').textContent  = initials;
        document.getElementById('topbar-avatar').textContent   = initials;
      }
    } catch(_) {}
  }

  /* ── Modal: Create / Edit Lead ─────────────────────────────────────────── */

  _bindModal() {
    document.addEventListener('click', e => {
      if (e.target.closest('[data-close-modal]')) this._closeModal();
    });

    document.getElementById('form-lead-create')?.addEventListener('submit', e => {
      e.preventDefault();
      this._handleLeadSave(e.target);
    });
  }

  _openCreateModal(defaultStage = 'new') {
    const modal = document.getElementById('modal-lead-create');
    if (!modal) return;
    const titleEl = document.getElementById('modal-lead-title');
    if (titleEl) titleEl.textContent = 'Novo Lead';
    document.getElementById('form-lead-create')?.reset();
    document.getElementById('lf-lead-id').value = '';
    const stageEl = document.getElementById('lf-stage');
    if (stageEl) stageEl.value = defaultStage;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('modal-overlay--open'));
    document.getElementById('lf-first-name')?.focus();
    document.body.style.overflow = 'hidden';
  }

  _openEditModal(lead) {
    const modal = document.getElementById('modal-lead-create');
    if (!modal) return;
    const titleEl = document.getElementById('modal-lead-title');
    if (titleEl) titleEl.textContent = 'Editar Lead';
    document.getElementById('lf-lead-id').value      = lead.id;
    document.getElementById('lf-first-name').value   = lead.firstName;
    document.getElementById('lf-last-name').value    = lead.lastName;
    document.getElementById('lf-role').value         = lead.role;
    document.getElementById('lf-email').value        = lead.email;
    document.getElementById('lf-company').value      = lead.company;
    document.getElementById('lf-segment').value      = lead.segment;
    document.getElementById('lf-deal-value').value   = lead.dealValue || 0;
    document.getElementById('lf-stage').value        = lead.stage;
    document.getElementById('lf-source').value       = lead.source || '';
    document.getElementById('lf-closing-date').value = lead.closingDate ? lead.closingDate.slice(0,10) : '';
    document.getElementById('lf-notes').value        = lead.notes || '';
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('modal-overlay--open'));
    document.body.style.overflow = 'hidden';
  }

  _closeModal() {
    const modal = document.getElementById('modal-lead-create');
    if (!modal) return;
    modal.classList.remove('modal-overlay--open');
    setTimeout(() => { modal.hidden = true; }, 200);
    document.body.style.overflow = '';
  }

  _handleLeadSave(form) {
    const fd = new FormData(form);
    const data = {
      firstName:   fd.get('firstName')?.trim()  || '',
      lastName:    fd.get('lastName')?.trim()   || '',
      role:        fd.get('role')?.trim()        || '',
      email:       fd.get('email')?.trim()       || '',
      company:     fd.get('company')?.trim()     || '',
      segment:     fd.get('segment')?.trim()     || '',
      dealValue:   parseFloat(fd.get('dealValue')) || 0,
      stage:       fd.get('stage')               || 'new',
      source:      fd.get('source')              || '',
      closingDate: fd.get('closingDate')         || null,
      notes:       fd.get('notes')?.trim()       || '',
    };

    if (!data.firstName || !data.lastName || !data.email || !data.company) {
      this._state.toastError('Campos obrigatórios', 'Preencha Nome, Sobrenome, E-mail e Empresa.');
      return;
    }

    const leadId = document.getElementById('lf-lead-id')?.value;
    if (leadId) {
      this._storage.updateLead(leadId, data);
      this._state.toastSuccess('Lead atualizado!', `${data.firstName} ${data.lastName} atualizado.`);
    } else {
      this._storage.createLead(data);
      this._state.toastSuccess('Lead criado!', `${data.firstName} ${data.lastName} adicionado ao pipeline.`);
    }

    this._closeModal();
  }

  /* ── Keyboard ─────────────────────────────────────────────────────────── */

  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

      if (e.key === 'Escape') this._closeModal();
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); this._openCreateModal('new'); }

      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === '1') window.location.href = 'index.html';
        if (e.key === '3') window.location.href = 'leads.html';
        if (e.key === '4') window.location.href = 'analytics.html';
        if (e.key === '6') window.location.href = 'settings.html';
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('pipeline-search')?.focus();
      }
    });
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  _getHeat(score) {
    return HEAT_CONFIG.find(h => score <= h.max) || HEAT_CONFIG[HEAT_CONFIG.length - 1];
  }

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  _getLeadAge(lead) {
    if (!lead.createdAt) return 'Recent';
    const created = new Date(lead.createdAt);
    const now = new Date();
    const diff = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    return `${diff} dias`;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   BOOTSTRAP
   ───────────────────────────────────────────────────────────────────────── */

function initPipelinePage() {
  const app     = window.Ibex;
  const storage = app.storage;
  const state   = app.state;

  window._pipelineCtrl = new PipelineController(storage, state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPipelinePage);
} else {
  initPipelinePage();
}
