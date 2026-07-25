// js/proposals.js

/**
 * BUGFIX (auditoria de segurança): título de proposta, nome de lead e empresa
 * são campos editáveis pelo usuário e eram inseridos sem escape via innerHTML
 * — inclusive dentro do atributo title="..." (linha ~278), onde um valor como
 * `"><script>` quebraria o atributo e injetaria HTML/JS arbitrário.
 */
function escProposals(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

class ProposalsController {
  constructor(app) {
    this._app = app;
    this._state = app.state;
    this._storage = app.storage;
    this._filter = 'all';
    this._query = '';

    // Load leads first (they come from storage, always seeded)
    this._leads = this._storage.getLeads() || [];
    this._proposals = this._loadProposals();

    this._bindEvents();
    this._renderKPIs();
    this._renderList();
    this._populateLeadSelect();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  _loadProposals() {
    let props = null;
    try { props = JSON.parse(localStorage.getItem('ibex_proposals')); } catch (e) { }

    if (!props || !Array.isArray(props) || props.length === 0) {
      props = this._generateSeed();
      this._persist(props);
    }
    return props;
  }

  _generateSeed() {
    const leads = this._leads;
    const result = [];

    const statusMap = {
      proposal: 'sent',
      negotiation: 'viewed',
      won: 'signed',
      lost: 'rejected',
    };

    leads.forEach((l, i) => {
      if (['proposal', 'negotiation', 'won', 'lost'].includes(l.stage)) {
        let status = statusMap[l.stage] || 'sent';
        if (i % 5 === 0) status = 'draft';

        result.push({
          id: `prop-${l.id}`,
          leadId: l.id,
          leadName: l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
          company: l.company || '—',
          title: `Proposta Comercial — ${l.company}`,
          value: l.dealValue || 0,
          status,
          notes: '',
          expires: '',
          date: l.updatedAt || new Date().toISOString(),
        });
      }
    });

    return result;
  }

  _persist(arr) {
    localStorage.setItem('ibex_proposals', JSON.stringify(arr ?? this._proposals));
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    // Filter buttons
    document.querySelectorAll('#prop-filter-group .btn').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('#prop-filter-group .btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this._filter = e.currentTarget.dataset.filter;
        this._renderList();
      });
    });

    // Live search
    document.getElementById('proposals-search')?.addEventListener('input', e => {
      this._query = e.target.value.toLowerCase().trim();
      this._renderList();
    });

    // Open modal — new
    document.getElementById('btn-new-proposal')?.addEventListener('click', () => {
      this._openModal(null);
    });

    // Close modal
    ['btn-close-proposal-modal', 'btn-cancel-proposal'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => this._closeModal());
    });
    document.getElementById('backdrop-proposal-create')?.addEventListener('click', () => this._closeModal());

    // Submit
    document.getElementById('form-proposal-create')?.addEventListener('submit', e => {
      e.preventDefault();
      this._saveProposal();
    });
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  _openModal(prop) {
    const modal = document.getElementById('modal-proposal-create');
    if (!modal) return;

    // Populate lead select with fresh data every time
    this._populateLeadSelect(prop?.leadId);

    document.getElementById('pf-title').value = prop?.title ?? '';
    document.getElementById('pf-value').value = prop?.value ?? '';
    document.getElementById('pf-status').value = prop?.status ?? 'draft';
    document.getElementById('pf-expires').value = prop?.expires ?? '';
    document.getElementById('pf-notes').value = prop?.notes ?? '';

    modal._editId = prop?.id ?? null;
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    document.getElementById('pf-title')?.focus();
  }

  _closeModal() {
    const modal = document.getElementById('modal-proposal-create');
    if (modal) { modal.setAttribute('hidden', ''); modal.style.display = ''; }
  }

  _populateLeadSelect(selectedId) {
    const sel = document.getElementById('pf-lead');
    if (!sel) return;

    // Refresh leads list in case new leads were added
    this._leads = this._storage.getLeads() || [];

    sel.innerHTML = `<option value="">— Selecione um lead —</option>` +
      this._leads.map(l => {
        const name = l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim();
        const selAttr = selectedId === l.id ? 'selected' : '';
        return `<option value="${l.id}" ${selAttr}>${escProposals(name)} — ${escProposals(l.company)}</option>`;
      }).join('');
  }

  _saveProposal() {
    const modal = document.getElementById('modal-proposal-create');
    const title = document.getElementById('pf-title').value.trim();
    const leadId = document.getElementById('pf-lead').value;
    const value = parseFloat(document.getElementById('pf-value').value) || 0;
    const status = document.getElementById('pf-status').value;
    const expires = document.getElementById('pf-expires').value;
    const notes = document.getElementById('pf-notes').value.trim();

    if (!title) {
      this._state.toastError?.('Campo obrigatório', 'Preencha o título da proposta.');
      document.getElementById('pf-title')?.focus();
      return;
    }
    if (!leadId) {
      this._state.toastError?.('Campo obrigatório', 'Selecione um lead.');
      document.getElementById('pf-lead')?.focus();
      return;
    }

    const lead = this._leads.find(l => l.id === leadId) || {};
    const editId = modal._editId;

    if (editId) {
      const idx = this._proposals.findIndex(p => p.id === editId);
      if (idx !== -1) {
        Object.assign(this._proposals[idx], {
          title, leadId,
          leadName: lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
          company: lead.company || '—',
          value, status, expires, notes,
          date: new Date().toISOString(),
        });
      }
    } else {
      this._proposals.unshift({
        id: 'prop-' + Date.now(),
        leadId,
        leadName: lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        company: lead.company || '—',
        title, value, status, expires, notes,
        date: new Date().toISOString(),
      });
    }

    this._persist();
    this._closeModal();
    this._renderKPIs();
    this._renderList();
    this._state.toastSuccess('Proposta salva', `"${title}" adicionada com sucesso.`);
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────

  _renderKPIs() {
    const fmt = v => new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL', maximumFractionDigits: 0
    }).format(v);

    const all = this._proposals;
    const open = all.filter(p => ['sent', 'viewed'].includes(p.status));
    const sig = all.filter(p => p.status === 'signed');
    const sent = all.filter(p => ['sent', 'viewed', 'signed', 'rejected'].includes(p.status));
    const conv = sent.length ? Math.round((sig.length / sent.length) * 100) : 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('kpi-total', all.length);
    set('kpi-open-value', fmt(open.reduce((s, p) => s + (p.value || 0), 0)));
    set('kpi-conversion', `${conv}%`);
    set('kpi-signed-value', fmt(sig.reduce((s, p) => s + (p.value || 0), 0)));
  }

  // ── List ──────────────────────────────────────────────────────────────────

  _renderList() {
    const grid = document.getElementById('proposals-grid');
    if (!grid) return;

    let props = [...this._proposals];

    if (this._filter !== 'all') {
      props = props.filter(p => p.status === this._filter);
    }

    if (this._query) {
      props = props.filter(p =>
        (p.title || '').toLowerCase().includes(this._query) ||
        (p.company || '').toLowerCase().includes(this._query) ||
        (p.leadName || '').toLowerCase().includes(this._query)
      );
    }

    grid.innerHTML = '';

    if (!props.length) {
      grid.innerHTML = `
        <div class="prop-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <h3>Nenhuma proposta encontrada</h3>
          <p>Tente outro filtro ou crie uma nova proposta.</p>
        </div>`;
      return;
    }

    const fmt = v => new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL', maximumFractionDigits: 0
    }).format(v);
    const fmtDate = d => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch (e) { return '—'; } };
    const labels = { draft: 'Rascunho', sent: 'Enviada', viewed: 'Visualizada', signed: 'Assinada', rejected: 'Recusada' };

    props.forEach(p => {
      const card = document.createElement('div');
      card.className = 'prop-card';
      card.innerHTML = `
        <div class="prop-card-top">
          <div class="prop-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <span class="prop-status status-${p.status}">${labels[p.status] || p.status}</span>
        </div>
        <div class="prop-card-body">
          <div class="prop-title" title="${escProposals(p.title)}">${escProposals(p.title)}</div>
          <div class="prop-lead">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            ${escProposals(p.leadName) || '—'}
          </div>
          <span class="prop-company-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            ${escProposals(p.company) || '—'}
          </span>
        </div>
        <div class="prop-card-meta">
          <span class="prop-date">${fmtDate(p.date)}${p.expires ? ` · até ${fmtDate(p.expires)}` : ''}</span>
          <span class="prop-value">${fmt(p.value || 0)}</span>
        </div>
        <div class="prop-card-footer">
          <button class="btn btn-secondary btn-sm btn-edit-prop" data-id="${p.id}">Editar</button>
          ${p.status !== 'signed' && p.status !== 'rejected'
          ? `<button class="btn btn-primary btn-sm btn-action-prop" data-id="${p.id}" data-status="${p.status}">
                ${p.status === 'draft' ? 'Enviar' : p.status === 'sent' ? 'Marcar Visualizada' : 'Marcar Assinada'}
               </button>`
          : `<button class="btn btn-secondary btn-sm" disabled style="opacity:.4;cursor:default;">
                ${p.status === 'signed' ? '✓ Assinada' : '✗ Recusada'}
               </button>`
        }
        </div>`;

      // Edit
      card.querySelector('.btn-edit-prop')?.addEventListener('click', e => {
        e.stopPropagation();
        const prop = this._proposals.find(x => x.id === e.currentTarget.dataset.id);
        if (prop) this._openModal(prop);
      });

      // Status action
      card.querySelector('.btn-action-prop')?.addEventListener('click', e => {
        e.stopPropagation();
        const prop = this._proposals.find(x => x.id === e.currentTarget.dataset.id);
        if (!prop) return;

        const nextStatus = { draft: 'sent', sent: 'viewed', viewed: 'signed' };
        const next = nextStatus[prop.status];
        if (!next) return;

        prop.status = next;
        prop.date = new Date().toISOString();
        this._persist();
        this._renderKPIs();
        this._renderList();

        const msg = { sent: 'Proposta marcada como Enviada.', viewed: 'Proposta marcada como Visualizada.', signed: '🎉 Contrato Assinado!' };
        this._state.toastSuccess('Status atualizado', msg[next] || '');
      });

      grid.appendChild(card);
    });
  }
}

Ibex.register(app => {
  if (app.state.getCurrentPage() === 'proposals') {
    new ProposalsController(app);
  }
});
