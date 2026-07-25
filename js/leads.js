/**
 * IBEX CRM — leads.js
 * Controller completo da página de Leads
 * Depende: storage.js → state.js → utils.js → ui.js
 * @version 1.0.0
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────── */

const STAGE_META = [
  { id: 'new',         label: 'Novo Lead',        color: '#6366f1', bg: 'rgba(99,102,241,0.15)'  },
  { id: 'qualified',   label: 'Qualificado',       color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)'  },
  { id: 'proposal',    label: 'Proposta Enviada',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  { id: 'negotiation', label: 'Negociação',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
  { id: 'won',         label: 'Fechado (Ganho)',   color: '#10b981', bg: 'rgba(16,185,129,0.15)'  },
  { id: 'lost',        label: 'Fechado (Perdido)', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)'   },
];

const PAGE_SIZE = 15;

const ACT_ICONS = {
  call: '📞', email: '✉️', meeting: '🤝', demo: '🖥️',
  proposal_sent: '📄', follow_up: '🔔', whatsapp: '💬',
  linkedin: '🔗', note: '📝', task_completed: '✅',
};

/* ─────────────────────────────────────────────────────────────────────────────
   LEADS PAGE CONTROLLER
   ───────────────────────────────────────────────────────────────────────── */

class LeadsPageController {

  constructor(storage, state) {
    this._storage = storage;
    this._state   = state;

    /* Local UI state */
    this._view          = 'table';   /* 'table' | 'cards' */
    this._currentPage   = 1;
    this._selectedIds   = new Set();
    this._activeLeadId  = null;
    this._editingLeadId = null;

    /* Filters */
    this._filters = {
      query:  '',
      stage:  'all',
      source: 'all',
      owner:  'all',
      sortBy: 'updatedAt',
      sortDir:'desc',
    };

    this._leads = [];
    this._filteredLeads = [];
    this._users = [];

    this._init();
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */

  _init() {
    this._loadData();
    this._populateOwnerFilter();
    this._bindFilters();
    this._bindTableHeaders();
    this._bindViewToggle();
    this._bindBulkActions();
    this._bindModal();
    this._bindDrawer();
    this._bindNewLeadBtn();
    this._bindKeyboard();
    this._applyFilters();
    this._render();

    /* React to storage events (lead created/updated/deleted) */
    document.addEventListener('ibex:lead:created',  () => this._refresh());
    document.addEventListener('ibex:lead:updated',  () => this._refresh());
    document.addEventListener('ibex:lead:deleted',  () => this._refresh());
  }

  _loadData() {
    this._leads = this._storage.getLeads({ includeArchived: false });
    this._users = this._storage.getUsers();
  }

  _refresh() {
    this._loadData();
    this._applyFilters();
    this._render();
    /* Re-open drawer if a lead is active */
    if (this._activeLeadId) {
      const updated = this._storage.getLeadById(this._activeLeadId);
      if (updated) this._openDrawer(updated);
    }
  }

  /* ── Filter data ──────────────────────────────────────────────────────── */

  _applyFilters() {
    const { query, stage, source, owner, sortBy, sortDir } = this._filters;
    let result = [...this._leads];

    if (stage  !== 'all') result = result.filter(l => l.stage  === stage);
    if (source !== 'all') result = result.filter(l => l.source === source);
    if (owner  !== 'all') result = result.filter(l => l.owner  === owner);

    if (query.length >= 2) {
      const q = query.toLowerCase();
      result = result.filter(l =>
        l.fullName.toLowerCase().includes(q)  ||
        l.company.toLowerCase().includes(q)   ||
        l.email.toLowerCase().includes(q)     ||
        l.segment.toLowerCase().includes(q)   ||
        l.ownerName.toLowerCase().includes(q)
      );
    }

    /* Sort */
    result.sort((a, b) => {
      let va = a[sortBy] ?? '';
      let vb = b[sortBy] ?? '';
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    this._filteredLeads = result;
    this._currentPage   = 1;

    /* Show/hide clear button */
    const hasFilters = stage !== 'all' || source !== 'all' || owner !== 'all' || query.length > 0;
    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) clearBtn.hidden = !hasFilters;
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  _render() {
    this._renderCountBadge();
    if (this._view === 'table') {
      this._renderTable();
    } else {
      this._renderCards();
    }
    this._renderPagination();
  }

  _getPageLeads() {
    const start = (this._currentPage - 1) * PAGE_SIZE;
    return this._filteredLeads.slice(start, start + PAGE_SIZE);
  }

  _renderCountBadge() {
    const badge = document.getElementById('leads-count-badge');
    if (badge) badge.textContent = `${this._filteredLeads.length} leads`;
  }

  /* ── Table ──────────────────────────────────────────────────────────── */

  _renderTable() {
    const tbody  = document.getElementById('leads-tbody');
    const empty  = document.getElementById('leads-empty');
    const tableW = document.getElementById('leads-table-wrap');
    const cardsW = document.getElementById('leads-cards-grid');

    if (!tbody) return;

    /* Show/hide containers */
    if (tableW) tableW.hidden = false;
    if (cardsW) cardsW.hidden = true;

    const pageLeads = this._getPageLeads();

    if (pageLeads.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    const tagsLib = this._storage.getTags ? this._storage.getTags() : [];

    tbody.innerHTML = pageLeads.map(lead => {
      const stage = STAGE_META.find(s => s.id === lead.stage) || STAGE_META[0];
      const heat  = window.getHeatInfo ? getHeatInfo(lead.heatScore || 0) : { label: '—', color: '#71717a' };
      const user  = this._users.find(u => u.id === lead.owner);
      const tags  = (lead.tags || []).slice(0, 2).map(tid => {
        const t = tagsLib.find(x => x.id === tid);
        return t
          ? `<span class="lead-tag" style="background:${t.color}22;color:${t.color}">${this._esc(t.label)}</span>`
          : '';
      }).join('');

      const isSelected = this._selectedIds.has(lead.id);

      return `
        <tr
          data-lead-id="${lead.id}"
          class="${isSelected ? 'row-selected' : ''}"
          role="row"
        >
          <td class="col-check" onclick="event.stopPropagation()">
            <input type="checkbox" class="leads-checkbox row-checkbox"
              data-id="${lead.id}" ${isSelected ? 'checked' : ''}
              aria-label="Selecionar ${this._esc(lead.fullName)}" />
          </td>
          <td class="col-star" onclick="event.stopPropagation()">
            <button class="leads-star-btn ${lead.isStarred ? 'starred' : ''}"
              data-star-id="${lead.id}"
              aria-label="${lead.isStarred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="${lead.isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </td>
          <td class="col-lead">
            <div class="lead-cell">
              <span class="lead-name">${this._esc(lead.fullName)}</span>
              <span class="lead-email">${this._esc(lead.email)}</span>
              ${tags ? `<div class="lead-tags">${tags}</div>` : ''}
            </div>
          </td>
          <td class="col-company">
            <div class="company-cell">
              <span class="company-name">${this._esc(lead.company)}</span>
              <span class="company-seg">${this._esc(lead.segment)}</span>
            </div>
          </td>
          <td class="col-stage">
            <span class="stage-badge" style="background:${stage.bg};color:${stage.color}">
              <span class="stage-dot" style="background:${stage.color}"></span>
              ${stage.label}
            </span>
          </td>
          <td class="col-value">
            <span class="deal-value">${window.formatCurrency ? formatCurrency(lead.dealValue, true) : `R$ ${lead.dealValue}`}</span>
          </td>
          <td class="col-heat hide-mobile">
            <div class="heat-cell">
              <div class="heat-bar-wrap">
                <div class="heat-bar-fill" style="width:${lead.heatScore || 0}%;background:${heat.color}"></div>
              </div>
              <span class="heat-label" style="color:${heat.color}">${heat.label}</span>
            </div>
          </td>
          <td class="col-owner hide-mobile">
            ${user ? `
              <div class="owner-cell">
                <div class="owner-mini-avatar" style="background:${user.color}22;color:${user.color}">${user.initials}</div>
                <span class="owner-name">${this._esc(user.name.split(' ')[0])}</span>
              </div>` : '—'}
          </td>
          <td class="col-updated hide-mobile">
            <span style="font-size:var(--text-xs);color:var(--text-muted)">
              ${window.formatRelativeTime ? formatRelativeTime(lead.updatedAt) : '—'}
            </span>
          </td>
          <td class="col-actions" onclick="event.stopPropagation()">
            <button class="row-action-btn" data-edit-id="${lead.id}" aria-label="Editar lead">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    /* Bind row interactions */
    this._bindTableRows(tbody);

    /* Update select-all checkbox */
    const selectAll = document.getElementById('select-all-checkbox');
    if (selectAll) {
      const pageIds = pageLeads.map(l => l.id);
      const allSelected = pageIds.length > 0 && pageIds.every(id => this._selectedIds.has(id));
      selectAll.checked = allSelected;
      selectAll.indeterminate = !allSelected && pageIds.some(id => this._selectedIds.has(id));
    }

    this._renderBulkBar();
  }

  _bindTableRows(tbody) {
    /* Row click → open drawer */
    tbody.querySelectorAll('tr[data-lead-id]').forEach(row => {
      row.addEventListener('click', () => {
        const lead = this._storage.getLeadById(row.dataset.leadId);
        if (lead) this._openDrawer(lead);
      });
    });

    /* Row checkboxes */
    tbody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) this._selectedIds.add(id);
        else this._selectedIds.delete(id);
        this._renderBulkBar();
        const row = cb.closest('tr');
        if (row) row.classList.toggle('row-selected', cb.checked);
        /* Update select-all state */
        const pageLeads = this._getPageLeads();
        const selectAll = document.getElementById('select-all-checkbox');
        if (selectAll) {
          const allSelected = pageLeads.every(l => this._selectedIds.has(l.id));
          selectAll.checked = allSelected && pageLeads.length > 0;
          selectAll.indeterminate = !allSelected && pageLeads.some(l => this._selectedIds.has(l.id));
        }
      });
    });

    /* Star buttons */
    tbody.querySelectorAll('.leads-star-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._storage.toggleStar(btn.dataset.starId);
      });
    });

    /* Edit buttons */
    tbody.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lead = this._storage.getLeadById(btn.dataset.editId);
        if (lead) this._openEditModal(lead);
      });
    });
  }

  /* ── Cards ────────────────────────────────────────────────────────────── */

  _renderCards() {
    const cardsW = document.getElementById('leads-cards-grid');
    const tableW = document.getElementById('leads-table-wrap');
    const empty  = document.getElementById('leads-empty');

    if (tableW) tableW.hidden = true;
    if (!cardsW) return;
    cardsW.hidden = false;

    const pageLeads = this._getPageLeads();

    if (pageLeads.length === 0) {
      cardsW.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    cardsW.innerHTML = pageLeads.map(lead => {
      const stage  = STAGE_META.find(s => s.id === lead.stage) || STAGE_META[0];
      const heat   = window.getHeatInfo ? getHeatInfo(lead.heatScore || 0) : { label: '—', color: '#71717a' };
      const initials = (lead.firstName[0] || '') + (lead.lastName[0] || '');
      return `
        <div class="lead-card" data-lead-id="${lead.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${this._esc(lead.fullName)}">
          <div class="lead-card-header">
            <div style="display:flex;align-items:center;gap:var(--space-2)">
              <div class="lead-card-avatar" style="background:${stage.bg};color:${stage.color}">${initials}</div>
              <div>
                <div class="lead-card-name">${this._esc(lead.fullName)}</div>
                <div class="lead-card-role">${this._esc(lead.role)}</div>
              </div>
            </div>
            <button class="leads-star-btn ${lead.isStarred ? 'starred' : ''}" data-star-id="${lead.id}" aria-label="Favoritar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="${lead.isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
          <div class="lead-card-company">${this._esc(lead.company)} · ${this._esc(lead.segment)}</div>
          <span class="stage-badge" style="background:${stage.bg};color:${stage.color};font-size:11px">
            <span class="stage-dot" style="background:${stage.color}"></span>${stage.label}
          </span>
          <div class="lead-card-footer">
            <span class="lead-card-value">${window.formatCurrency ? formatCurrency(lead.dealValue, true) : `R$${lead.dealValue}`}</span>
            <span class="heat-label" style="color:${heat.color};font-size:10px;font-weight:700">${heat.label}</span>
          </div>
        </div>
      `;
    }).join('');

    /* Bind card clicks */
    cardsW.querySelectorAll('.lead-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.leads-star-btn')) return;
        const lead = this._storage.getLeadById(card.dataset.leadId);
        if (lead) this._openDrawer(lead);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
      card.querySelector('.leads-star-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._storage.toggleStar(e.currentTarget.dataset.starId);
      });
    });
  }

  /* ── Pagination ──────────────────────────────────────────────────────── */

  _renderPagination() {
    const total     = this._filteredLeads.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start     = (this._currentPage - 1) * PAGE_SIZE + 1;
    const end       = Math.min(this._currentPage * PAGE_SIZE, total);

    const info = document.getElementById('pagination-info');
    if (info) info.textContent = total === 0 ? '0 leads' : `${start}–${end} de ${total} leads`;

    const prevBtn  = document.getElementById('prev-page-btn');
    const nextBtn  = document.getElementById('next-page-btn');
    const pagesEl  = document.getElementById('pagination-pages');

    if (prevBtn) prevBtn.disabled = this._currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this._currentPage >= totalPages;

    if (pagesEl) {
      const pages = [];
      for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || Math.abs(p - this._currentPage) <= 1) {
          pages.push(p);
        } else if (pages[pages.length - 1] !== '…') {
          pages.push('…');
        }
      }
      pagesEl.innerHTML = pages.map(p =>
        p === '…'
          ? `<span style="padding:0 var(--space-1);color:var(--text-muted);font-size:var(--text-xs)">…</span>`
          : `<button class="page-btn ${p === this._currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`
      ).join('');

      pagesEl.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._currentPage = parseInt(btn.dataset.page);
          this._render();
        });
      });
    }
  }

  /* ── Bulk Bar ─────────────────────────────────────────────────────────── */

  _renderBulkBar() {
    const bar    = document.getElementById('leads-bulk-bar');
    const countEl = document.getElementById('bulk-count');
    if (!bar) return;
    const count = this._selectedIds.size;
    bar.hidden  = count === 0;
    if (countEl) countEl.textContent = `${count} selecionado${count !== 1 ? 's' : ''}`;
  }

  /* ── Bind: Filter inputs ─────────────────────────────────────────────── */

  _bindFilters() {
    const searchInput = document.getElementById('leads-search');
    if (searchInput) {
      const debouncedSearch = window.debounce
        ? debounce(() => {
            this._filters.query = searchInput.value.trim();
            this._applyFilters();
            this._render();
          }, 280)
        : () => {
            this._filters.query = searchInput.value.trim();
            this._applyFilters();
            this._render();
          };
      searchInput.addEventListener('input', debouncedSearch);
    }

    const filterStage  = document.getElementById('filter-stage');
    const filterSource = document.getElementById('filter-source');
    const filterOwner  = document.getElementById('filter-owner');
    const filterSort   = document.getElementById('filter-sort');

    if (filterStage) filterStage.addEventListener('change', () => {
      this._filters.stage = filterStage.value;
      this._applyFilters(); this._render();
    });

    if (filterSource) filterSource.addEventListener('change', () => {
      this._filters.source = filterSource.value;
      this._applyFilters(); this._render();
    });

    if (filterOwner) filterOwner.addEventListener('change', () => {
      this._filters.owner = filterOwner.value;
      this._applyFilters(); this._render();
    });

    if (filterSort) filterSort.addEventListener('change', () => {
      const [key, dir] = filterSort.value.split('_');
      this._filters.sortBy  = key;
      this._filters.sortDir = dir;
      this._applyFilters(); this._render();
    });

    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => this._clearFilters());

    /* Pagination */
    document.getElementById('prev-page-btn')?.addEventListener('click', () => {
      if (this._currentPage > 1) { this._currentPage--; this._render(); }
    });
    document.getElementById('next-page-btn')?.addEventListener('click', () => {
      const total = Math.ceil(this._filteredLeads.length / PAGE_SIZE);
      if (this._currentPage < total) { this._currentPage++; this._render(); }
    });

    /* Select all */
    document.getElementById('select-all-checkbox')?.addEventListener('change', (e) => {
      const pageLeads = this._getPageLeads();
      pageLeads.forEach(l => {
        if (e.target.checked) this._selectedIds.add(l.id);
        else this._selectedIds.delete(l.id);
      });
      this._render();
    });
  }

  _clearFilters() {
    this._filters = { query: '', stage: 'all', source: 'all', owner: 'all', sortBy: 'updatedAt', sortDir: 'desc' };
    const els = ['leads-search','filter-stage','filter-source','filter-owner'];
    els.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = el.tagName === 'SELECT' ? 'all' : '';
    });
    const sortEl = document.getElementById('filter-sort');
    if (sortEl) sortEl.value = 'updatedAt_desc';
    this._applyFilters();
    this._render();
  }

  /* ── Bind: Table sort headers ───────────────────────────────────────── */

  _bindTableHeaders() {
    document.querySelectorAll('.leads-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (this._filters.sortBy === key) {
          this._filters.sortDir = this._filters.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this._filters.sortBy  = key;
          this._filters.sortDir = 'desc';
        }

        /* Sync select */
        const sortEl = document.getElementById('filter-sort');
        if (sortEl) {
          const val = `${key}_${this._filters.sortDir}`;
          if ([...sortEl.options].some(o => o.value === val)) sortEl.value = val;
        }

        /* Update header classes */
        document.querySelectorAll('.leads-table th').forEach(h => {
          h.classList.remove('sort-asc','sort-desc');
        });
        th.classList.add(this._filters.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');

        this._applyFilters();
        this._render();
      });
    });
  }

  /* ── Bind: View toggle ─────────────────────────────────────────────── */

  _bindViewToggle() {
    const tableBtn = document.getElementById('view-table-btn');
    const cardsBtn = document.getElementById('view-cards-btn');

    tableBtn?.addEventListener('click', () => {
      this._view = 'table';
      tableBtn.classList.add('active');
      cardsBtn?.classList.remove('active');
      this._render();
    });

    cardsBtn?.addEventListener('click', () => {
      this._view = 'cards';
      cardsBtn.classList.add('active');
      tableBtn?.classList.remove('active');
      this._render();
    });
  }

  /* ── Bind: Bulk Actions ────────────────────────────────────────────── */

  _bindBulkActions() {
    document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => {
      this._selectedIds.clear();
      this._render();
    });

    document.getElementById('bulk-delete-btn')?.addEventListener('click', () => {
      if (!confirm(`Arquivar ${this._selectedIds.size} lead(s)? Esta ação pode ser desfeita.`)) return;
      this._selectedIds.forEach(id => this._storage.archiveLead(id));
      this._selectedIds.clear();
      this._refresh();
      this._state.toastSuccess('Leads arquivados', `${this._selectedIds.size || 'Os'} lead(s) foram arquivados.`);
    });
  }

  /* ── Bind: New Lead button ─────────────────────────────────────────── */

  _bindNewLeadBtn() {
    ['topbar-new-lead-btn','empty-new-lead-btn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        this._editingLeadId = null;
        this._openCreateModal();
      });
    });

    document.getElementById('export-btn')?.addEventListener('click', () => {
      this._exportCSV();
    });
  }

  /* ── Bind: Modal ───────────────────────────────────────────────────── */

  _bindModal() {
    /* Close modal on backdrop / button */
    document.addEventListener('click', e => {
      if (e.target.closest('[data-close-modal]')) this._closeModal();
    });

    /* form submit */
    document.getElementById('form-lead-create')?.addEventListener('submit', e => {
      e.preventDefault();
      this._handleLeadSave(e.target);
    });
  }

  _openCreateModal() {
    const modal = document.getElementById('modal-lead-create');
    const title = document.getElementById('modal-lead-title');
    const form  = document.getElementById('form-lead-create');
    if (!modal) return;
    if (title) title.textContent = 'Novo Lead';
    if (form)  form.reset();
    document.getElementById('lf-lead-id').value = '';
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('modal-overlay--open'));
    document.getElementById('lf-first-name')?.focus();
    document.body.style.overflow = 'hidden';
  }

  _openEditModal(lead) {
    const modal = document.getElementById('modal-lead-create');
    const title = document.getElementById('modal-lead-title');
    if (!modal) return;
    this._editingLeadId = lead.id;
    if (title) title.textContent = 'Editar Lead';
    document.getElementById('lf-lead-id').value        = lead.id;
    document.getElementById('lf-first-name').value     = lead.firstName;
    document.getElementById('lf-last-name').value      = lead.lastName;
    document.getElementById('lf-role').value           = lead.role;
    document.getElementById('lf-email').value          = lead.email;
    document.getElementById('lf-phone').value          = lead.phone;
    document.getElementById('lf-company').value        = lead.company;
    document.getElementById('lf-segment').value        = lead.segment;
    document.getElementById('lf-deal-value').value     = lead.dealValue || 0;
    document.getElementById('lf-stage').value          = lead.stage;
    document.getElementById('lf-source').value         = lead.source || '';
    document.getElementById('lf-closing-date').value   = lead.closingDate ? lead.closingDate.slice(0,10) : '';
    document.getElementById('lf-notes').value          = lead.notes || '';
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
    this._editingLeadId = null;
  }

  _handleLeadSave(form) {
    const fd = new FormData(form);
    const data = {
      firstName:   fd.get('firstName')?.trim()  || '',
      lastName:    fd.get('lastName')?.trim()   || '',
      role:        fd.get('role')?.trim()        || '',
      email:       fd.get('email')?.trim()       || '',
      phone:       fd.get('phone')?.trim()       || '',
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
      this._state.toastSuccess('Lead atualizado!', `${data.firstName} ${data.lastName} foi atualizado.`);
    } else {
      this._storage.createLead(data);
      this._state.toastSuccess('Lead criado!', `${data.firstName} ${data.lastName} adicionado com sucesso.`);
    }

    this._closeModal();
  }

  /* ── Bind: Drawer ──────────────────────────────────────────────────── */

  _bindDrawer() {
    document.getElementById('drawer-close-btn')?.addEventListener('click', () => this._closeDrawer());
    document.getElementById('drawer-overlay')?.addEventListener('click', () => this._closeDrawer());

    /* Tabs */
    document.querySelectorAll('.drawer-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.drawer-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
        document.querySelectorAll('.drawer-panel').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.classList.remove('hidden');
      });
    });

    /* Save notes */
    document.getElementById('drawer-save-notes-btn')?.addEventListener('click', () => {
      if (!this._activeLeadId) return;
      const notes = document.getElementById('drawer-notes')?.value || '';
      this._storage.updateLead(this._activeLeadId, { notes });
      this._state.toastSuccess('Notas salvas', 'As notas do lead foram atualizadas.');
    });

    /* Edit btn in drawer */
    document.getElementById('drawer-edit-btn')?.addEventListener('click', () => {
      if (!this._activeLeadId) return;
      const lead = this._storage.getLeadById(this._activeLeadId);
      if (lead) this._openEditModal(lead);
    });

    /* Star btn in drawer */
    document.getElementById('drawer-star-btn')?.addEventListener('click', () => {
      if (!this._activeLeadId) return;
      this._storage.toggleStar(this._activeLeadId);
    });

    /* WhatsApp btn */
    document.getElementById('drawer-wa-btn')?.addEventListener('click', () => {
      if (!this._activeLeadId) return;
      const lead = this._storage.getLeadById(this._activeLeadId);
      if (lead?.phone) {
        window.open(`https://wa.me/${lead.phone.replace(/\D/g,'')}`, '_blank');
      } else {
        this._state.toastError('Sem telefone', 'Este lead não possui um número de telefone cadastrado.');
      }
    });

    /* Log activity */
    document.getElementById('drawer-log-activity-btn')?.addEventListener('click', () => {
      this._state.toastInfo('Em breve', 'Registro de atividade disponível na próxima versão.');
    });

    document.getElementById('drawer-add-task-btn')?.addEventListener('click', () => {
      this._state.toastInfo('Em breve', 'Criação de tarefa disponível na próxima versão.');
    });
  }

  _openDrawer(lead) {
    this._activeLeadId = lead.id;

    const drawer  = document.getElementById('lead-drawer');
    const overlay = document.getElementById('drawer-overlay');

    if (!drawer) return;

    /* Populate header */
    const initials = (lead.firstName[0] || '') + (lead.lastName[0] || '');
    document.getElementById('drawer-avatar').textContent     = initials;
    document.getElementById('drawer-lead-name').textContent  = lead.fullName;
    document.getElementById('drawer-lead-role').textContent  = `${lead.role} · ${lead.company}`;

    /* Star button */
    const starBtn = document.getElementById('drawer-star-btn');
    if (starBtn) starBtn.textContent = lead.isStarred ? '★ Favoritado' : '☆ Favoritar';

    /* Stage pills */
    this._renderStagePills(lead);

    /* Detail fields */
    this._renderDrawerFields(lead);

    /* Activity */
    this._renderDrawerActivity(lead.id);

    /* Tasks */
    this._renderDrawerTasks(lead.id);

    /* Notes */
    const notesArea = document.getElementById('drawer-notes');
    if (notesArea) notesArea.value = lead.notes || '';

    /* Reset to first tab */
    document.querySelectorAll('.drawer-tab').forEach((t, i) => {
      t.classList.toggle('active', i === 0);
      t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    });
    document.querySelectorAll('.drawer-panel').forEach((p, i) => {
      p.classList.toggle('hidden', i !== 0);
    });

    /* Show */
    drawer.hidden  = false;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';

    /* Animate in */
    requestAnimationFrame(() => {
      drawer.style.transform = 'translateX(0)';
    });
  }

  _closeDrawer() {
    const drawer  = document.getElementById('lead-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer)  drawer.hidden  = true;
    if (overlay) overlay.hidden = true;
    this._activeLeadId = null;
    document.body.style.overflow = '';
  }

  _renderStagePills(lead) {
    const container = document.getElementById('drawer-stage-pills');
    if (!container) return;
    container.innerHTML = STAGE_META.map(s => `
      <button
        class="drawer-stage-pill ${lead.stage === s.id ? 'active' : ''}"
        style="background:${s.bg};color:${s.color}"
        data-stage="${s.id}"
        aria-label="Mover para ${s.label}"
        ${lead.stage === s.id ? 'aria-pressed="true"' : ''}
      >${s.label}</button>
    `).join('');

    container.querySelectorAll('.drawer-stage-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this._storage.moveLeadStage(this._activeLeadId, btn.dataset.stage);
        this._state.toastSuccess('Estágio alterado', `Lead movido para ${btn.textContent}.`);
      });
    });
  }

  _renderDrawerFields(lead) {
    const dealEl    = document.getElementById('drawer-fields-deal');
    const contactEl = document.getElementById('drawer-fields-contact');
    const companyEl = document.getElementById('drawer-fields-company');
    const tagsEl    = document.getElementById('drawer-tags');

    const field = (key, val) => `
      <div class="drawer-field">
        <span class="drawer-field-key">${this._esc(key)}</span>
        <span class="drawer-field-val">${val}</span>
      </div>`;

    const fn = window.formatCurrency || (v => `R$ ${v}`);
    const fd = window.formatDate     || (v => v);

    const stage = STAGE_META.find(s => s.id === lead.stage);
    const heat  = window.getHeatInfo ? getHeatInfo(lead.heatScore || 0) : { label: '—', color: '#71717a' };

    if (dealEl) dealEl.innerHTML = [
      field('Valor',        `<strong>${fn(lead.dealValue)}</strong>`),
      field('Estágio',      stage ? `<span style="color:${stage.color};font-weight:700">${stage.label}</span>` : '—'),
      field('Probabilidade',`${lead.probability || 0}%`),
      field('Produto',      this._esc(lead.productName) || '—'),
      field('Fechamento',   fd(lead.closingDate) || '—'),
      field('Origem',       this._esc(lead.source) || '—'),
      field('Heat Score',   `<span style="color:${heat.color};font-weight:700">${lead.heatScore || 0} · ${heat.label}</span>`),
    ].join('');

    if (contactEl) contactEl.innerHTML = [
      field('Nome completo', this._esc(lead.fullName)),
      field('Cargo',         this._esc(lead.role) || '—'),
      field('E-mail',        `<a href="mailto:${this._esc(lead.email)}">${this._esc(lead.email)}</a>`),
      field('Telefone',      lead.phone ? `<a href="tel:${this._esc(lead.phone)}">${this._esc(lead.phone)}</a>` : '—'),
      field('LinkedIn',      lead.linkedin ? `<a href="${this._esc(lead.linkedin)}" target="_blank" rel="noopener">Ver perfil ↗</a>` : '—'),
    ].join('');

    if (companyEl) companyEl.innerHTML = [
      field('Empresa',   this._esc(lead.company)),
      field('Segmento',  this._esc(lead.segment)     || '—'),
      field('Porte',     this._esc(lead.companySize) || '—'),
      field('Cidade',    this._esc(lead.city)        || '—'),
      field('País',      this._esc(lead.country)     || '—'),
      field('Dono',      this._esc(lead.ownerName)   || '—'),
      field('Criado em', fd(lead.createdAt)),
    ].join('');

    /* Tags */
    if (tagsEl) {
      const tagsLib = this._storage.getTags ? this._storage.getTags() : [];
      tagsEl.innerHTML = (lead.tags || []).map(tid => {
        const t = tagsLib.find(x => x.id === tid);
        return t
          ? `<span class="lead-tag" style="background:${t.color}22;color:${t.color};padding:3px 10px;font-size:11px">${this._esc(t.label)}</span>`
          : '';
      }).join('') || '<span style="color:var(--text-muted);font-size:var(--text-xs)">Sem tags</span>';
    }
  }

  _renderDrawerActivity(leadId) {
    const container = document.getElementById('drawer-activity-log');
    if (!container) return;

    const acts = (this._storage.getActivities ? this._storage.getActivities({ leadId }) : [])
      .filter(a => a.leadId === leadId)
      .slice(0, 10);

    if (!acts.length) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:var(--text-sm)">Nenhuma atividade registrada.</p>`;
      return;
    }

    container.innerHTML = acts.map(a => `
      <div class="activity-log-item">
        <div class="activity-log-icon">${ACT_ICONS[a.type] || '📌'}</div>
        <div class="activity-log-body">
          <div class="activity-log-label">${this._esc(a.label)}</div>
          <div class="activity-log-meta">${this._esc(a.ownerName)} · ${window.formatRelativeTime ? formatRelativeTime(a.createdAt) : ''}</div>
        </div>
      </div>
    `).join('');
  }

  _renderDrawerTasks(leadId) {
    const container = document.getElementById('drawer-tasks-list');
    if (!container) return;

    const tasks = this._storage.getTasks({ leadId })
      .filter(t => t.status !== 'done')
      .slice(0, 8);

    if (!tasks.length) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:var(--text-sm)">Nenhuma tarefa pendente 🎉</p>`;
      return;
    }

    const fd = window.formatDate || (v => v);
    container.innerHTML = tasks.map(t => {
      const isOverdue = t.status === 'overdue';
      return `
        <div class="drawer-task-item">
          <input type="checkbox" class="drawer-task-check" data-task-id="${t.id}" aria-label="Concluir: ${this._esc(t.title)}" />
          <span class="drawer-task-title">${this._esc(t.title)}</span>
          <span class="drawer-task-due ${isOverdue ? 'overdue' : ''}">${fd(t.dueDate)}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.drawer-task-check').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          this._storage.updateTask(cb.dataset.taskId, { status: 'done', completedAt: new Date().toISOString() });
          this._state.toastSuccess('Tarefa concluída', 'Marcada como concluída!');
          setTimeout(() => this._renderDrawerTasks(leadId), 400);
        }
      });
    });
  }

  /* ── Owner filter populate ──────────────────────────────────────────── */

  _populateOwnerFilter() {
    const sel = document.getElementById('filter-owner');
    if (!sel) return;
    this._users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.name;
      sel.appendChild(opt);
    });
  }

  /* ── Keyboard shortcuts ─────────────────────────────────────────────── */

  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

      /* Escape → close drawer / modal */
      if (e.key === 'Escape') {
        if (this._activeLeadId) { this._closeDrawer(); return; }
      }

      /* N → new lead */
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this._openCreateModal();
      }
    });
  }

  /* ── Export CSV ─────────────────────────────────────────────────────── */

  _exportCSV() {
    const leads = this._filteredLeads;
    const headers = ['Nome','Empresa','Estágio','Valor','Origem','Dono','Atualizado'];
    const rows = leads.map(l => [
      l.fullName, l.company,
      STAGE_META.find(s => s.id === l.stage)?.label || l.stage,
      l.dealValue, l.source, l.ownerName,
      l.updatedAt ? new Date(l.updatedAt).toLocaleDateString('pt-BR') : '',
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ibex-leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this._state.toastSuccess('Exportado!', `${leads.length} leads exportados em CSV.`);
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   BOOTSTRAP — uses the Ibex singleton created by state.js
   ───────────────────────────────────────────────────────────────────────── */

function initLeadsPage() {
  /* Use the global Ibex singleton (created in state.js) */
  const app     = window.Ibex;
  const storage = app.storage;
  const state   = app.state;

  window._leadsCtrl = new LeadsPageController(storage, state);

  /* Also wire up sidebar collapse / mobile menu via existing ui.js patterns */
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

  /* Notifications panel */
  const notifBtn   = document.getElementById('notifications-btn');
  const notifPanel = document.getElementById('notif-panel');
  notifBtn?.addEventListener('click', e => { e.stopPropagation(); notifPanel.hidden = !notifPanel.hidden; });
  document.addEventListener('click', e => {
    if (notifPanel && !notifPanel.contains(e.target) && e.target !== notifBtn) notifPanel.hidden = true;
  });

  /* Render user info */
  try {
    const user = storage.getCurrentUser?.();
    if (user) {
      document.getElementById('sidebar-user-name').textContent  = user.name;
      document.getElementById('sidebar-user-role').textContent  = user.role;
      const initials = (user.initials || window.getInitials?.(user.name) || 'U');
      document.getElementById('sidebar-avatar').textContent  = initials;
      document.getElementById('topbar-avatar').textContent   = initials;
    }
  } catch(_) {}

  /* Keyboard: Ctrl+K → search (stub on this page) */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('leads-search')?.focus();
    }
    /* Number shortcuts back to other pages */
    if (!e.ctrlKey && !e.metaKey) {
      const tag = document.activeElement?.tagName;
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
      if (e.key === '1') window.location.href = 'index.html';
      if (e.key === '2') window.location.href = 'pipeline.html';
      if (e.key === '4') window.location.href = 'analytics.html';
      if (e.key === '6') window.location.href = 'settings.html';
    }
  });
}

/* Expose PIPELINE_STAGES constant for utils.js getStageInfo */
window.PIPELINE_STAGES = [
  { id: 'new',         label: 'Novo Lead',        color: '#6366f1' },
  { id: 'qualified',   label: 'Qualificado',       color: '#0ea5e9' },
  { id: 'proposal',    label: 'Proposta Enviada',  color: '#f59e0b' },
  { id: 'negotiation', label: 'Negociação',        color: '#8b5cf6' },
  { id: 'won',         label: 'Fechado (Ganho)',   color: '#10b981' },
  { id: 'lost',        label: 'Fechado (Perdido)', color: '#f43f5e' },
];

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLeadsPage);
} else {
  initLeadsPage();
}
