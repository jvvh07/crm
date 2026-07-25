/**
 * IBEX CRM — Módulo de Equipe
 * Departamentos, colaboradores, drawer de perfil (Perfil/Permissões/Indicadores),
 * modal de novo colaborador. Dados mockados e persistidos em localStorage.
 *
 * TODO(backend): hoje a equipe é 100% mockada e local ao navegador. Para valer
 * para toda a empresa, é necessário: tabela `users` completa no banco (hoje o
 * storage.js só tem 2 usuários fixos no código), endpoint de upload de foto de
 * perfil, e os campos de permissão devem ser aplicados de verdade no backend
 * (ver TODO em roles.html/roles.js quando essa tela for construída).
 *
 * @version 1.0.0
 */

'use strict';

(function () {

  const STORAGE_KEY = 'ibex_team_v1';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function uid(prefix = 'mem') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function fmtCompact(v) {
    if (v == null || isNaN(v) || v === 0) return 'R$ 0';
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000)     return `R$ ${Math.round(v / 1_000)}K`;
    return `R$ ${Math.round(v)}`;
  }

  // getInitials/getAvatarColor: fonte única em js/components.js (evita duas
  // implementações do mesmo hash de cor divergindo entre telas). Fallback
  // local mantido apenas por segurança, caso o script não tenha carregado.
  function getInitials(name) {
    if (window.getInitials) return window.getInitials(name);
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function getAvatarColor(name) {
    if (window.getAvatarColor) return window.getAvatarColor(name);
    const colors = ['#6366f1','#10b981','#f59e0b','#0ea5e9','#8b5cf6','#f43f5e','#34d399','#fb923c'];
    let hash = 0;
    for (let i = 0; i < String(name).length; i++) hash = String(name).charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DADOS MOCKADOS
     ═══════════════════════════════════════════════════════════════════════ */

  const DEPARTMENTS = [
    { id: 'sales',      label: 'Comercial',      color: '#6366f1' },
    { id: 'marketing',  label: 'Marketing',      color: '#8b5cf6' },
    { id: 'finance',    label: 'Financeiro',     color: '#10b981' },
    { id: 'hr',         label: 'RH',             color: '#f59e0b' },
    { id: 'support',    label: 'Suporte',        color: '#0ea5e9' },
    { id: 'ops',        label: 'Operações',      color: '#71717a' },
    { id: 'tech',       label: 'Tecnologia',     color: '#a78bfa' },
    { id: 'admin',      label: 'Administrativo', color: '#fb7185' },
    { id: 'directors',  label: 'Diretoria',      color: '#fbbf24' },
  ];

  // Fonte única de verdade: js/permissions-data.js (compartilhado com roles.js).
  // Removida a lista duplicada que existia aqui antes — evita divergência
  // entre o drawer de permissões do colaborador e a matriz de papéis.
  function getPermissionCategories() {
    return window.IbexPermissions?.getCategories() || [];
  }

  function buildSeedMembers() {
    return [
      {
        id: 'u1', name: 'Juan Heuer', photo: null, role: 'Executivo de Contas Sr.',
        department: 'sales', email: 'juan@ibexcrm.com', phone: '+55 47 99123-4567',
        status: 'active', admissionDate: '2023-01-15', quota: 500000,
        grantedPermissions: ['Visualizar Leads','Editar Leads','Excluir Leads','Criar Pipeline','Editar Pipeline'],
        kpis: { dealsWon: 12, activeDeals: 8, winRate: 34 },
      },
      {
        id: 'u2', name: 'Juliana Andrade', photo: null, role: 'Closer',
        department: 'sales', email: 'juliana@ibexcrm.com', phone: '+55 47 99876-5432',
        status: 'active', admissionDate: '2023-03-20', quota: 450000,
        grantedPermissions: ['Visualizar Leads','Editar Leads'],
        kpis: { dealsWon: 9, activeDeals: 6, winRate: 28 },
      },
      {
        id: uid(), name: 'Rafael Torres', photo: null, role: 'SDR',
        department: 'sales', email: 'rafael@ibexcrm.com', phone: '+55 47 99222-1100',
        status: 'active', admissionDate: '2024-02-10', quota: 200000,
        grantedPermissions: ['Visualizar Leads'],
        kpis: { dealsWon: 3, activeDeals: 14, winRate: 12 },
      },
      {
        id: uid(), name: 'Camila Duarte', photo: null, role: 'Coordenadora de CS',
        department: 'sales', email: 'camila@ibexcrm.com', phone: '+55 47 99333-2211',
        status: 'active', admissionDate: '2022-11-05', quota: 0,
        grantedPermissions: ['Visualizar Leads','Editar Leads'],
        kpis: { dealsWon: 0, activeDeals: 22, winRate: 0 },
      },
      {
        id: uid(), name: 'Bruno Ferreira', photo: null, role: 'Analista de Marketing',
        department: 'marketing', email: 'bruno@ibexcrm.com', phone: '+55 47 99444-3322',
        status: 'active', admissionDate: '2023-07-18', quota: 0,
        grantedPermissions: [],
        kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
      },
      {
        id: uid(), name: 'Larissa Prado', photo: null, role: 'Head de Marketing',
        department: 'marketing', email: 'larissa@ibexcrm.com', phone: '+55 47 99555-4433',
        status: 'active', admissionDate: '2021-09-01', quota: 0,
        grantedPermissions: ['Criar Automações'],
        kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
      },
      {
        id: uid(), name: 'Marcos Vinícius', photo: null, role: 'Controller',
        department: 'finance', email: 'marcos@ibexcrm.com', phone: '+55 47 99666-5544',
        status: 'active', admissionDate: '2020-05-12', quota: 0,
        grantedPermissions: ['Ver Financeiro','Exportar Dados'],
        kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
      },
      {
        id: uid(), name: 'Patrícia Lima', photo: null, role: 'Analista de RH',
        department: 'hr', email: 'patricia@ibexcrm.com', phone: '+55 47 99777-6655',
        status: 'inactive', admissionDate: '2022-04-25', quota: 0,
        grantedPermissions: [],
        kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
      },
      {
        id: uid(), name: 'Diego Martins', photo: null, role: 'Analista de Suporte N2',
        department: 'support', email: 'diego@ibexcrm.com', phone: '+55 47 99888-7766',
        status: 'active', admissionDate: '2023-10-09', quota: 0,
        grantedPermissions: ['Visualizar Leads'],
        kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
      },
      {
        id: uid(), name: 'Fernanda Costa', photo: null, role: 'Desenvolvedora Full Stack',
        department: 'tech', email: 'fernanda@ibexcrm.com', phone: '+55 47 99999-8877',
        status: 'active', admissionDate: '2023-05-30', quota: 0,
        grantedPermissions: ['Editar Configurações'],
        kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
      },
      {
        id: uid(), name: 'Ricardo Alves', photo: null, role: 'CEO',
        department: 'directors', email: 'ricardo@ibexcrm.com', phone: '+55 47 90000-1122',
        status: 'active', admissionDate: '2019-01-10', quota: 0,
        grantedPermissions: (window.IbexPermissions?.getAllPermissions() || []), // acesso total
        kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
      },
    ];
  }

  function loadMembers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* fallback abaixo */ }
    const seed = buildSeedMembers();
    saveMembers(seed);
    return seed;
  }

  function saveMembers(members) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(members)); return true; }
    catch (err) { console.error('[Team] Falha ao persistir equipe:', err); return false; }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONTROLLER
     ═══════════════════════════════════════════════════════════════════════ */

  class TeamController {

    constructor(app) {
      this._app = app;
      this._members = loadMembers();
      this._activeDept = 'all';
      this._searchQuery = '';
      this._view = localStorage.getItem('ibex_team_view') || 'grid';
      this._activeMemberId = null;
      this._activeDrawerTab = 'profile';

      this._renderHeaderStats();
      this._renderDeptGrid();
      this._renderMembers();
      this._bindSearch();
      this._bindViewToggle();
      this._bindDrawer();
      this._bindNewMemberModal();
    }

    _toast(type, title, msg) {
      const fn = this._app?.state?.[`toast${type}`];
      if (typeof fn === 'function') fn.call(this._app.state, title, msg);
    }

    _persist() { saveMembers(this._members); }

    /* ── Header Stats ─────────────────────────────────────────────────── */

    _renderHeaderStats() {
      const el = document.getElementById('team-header-stats');
      if (!el) return;

      const total = this._members.length;
      const active = this._members.filter(m => m.status === 'active').length;
      const deptsInUse = new Set(this._members.map(m => m.department)).size;

      el.innerHTML = `
        <div class="team-stat">
          <div class="team-stat-value">${total}</div>
          <div class="team-stat-label">Colaboradores</div>
        </div>
        <div class="team-stat">
          <div class="team-stat-value" style="color:var(--emerald-400)">${active}</div>
          <div class="team-stat-label">Ativos</div>
        </div>
        <div class="team-stat">
          <div class="team-stat-value">${deptsInUse}</div>
          <div class="team-stat-label">Departamentos</div>
        </div>
      `;
    }

    /* ── Grid de Departamentos ────────────────────────────────────────── */

    _renderDeptGrid() {
      const grid = document.getElementById('team-dept-grid');
      if (!grid) return;

      const countByDept = {};
      this._members.forEach(m => { countByDept[m.department] = (countByDept[m.department] || 0) + 1; });

      const allCard = `
        <div class="team-dept-card ${this._activeDept === 'all' ? 'active' : ''}" data-dept="all"
             role="tab" tabindex="0" aria-selected="${this._activeDept === 'all'}" style="--dept-color:#6366f1">
          <span class="team-dept-dot"></span>
          <span class="team-dept-label">Todos</span>
          <span class="team-dept-count">${this._members.length} colaborador${this._members.length === 1 ? '' : 'es'}</span>
        </div>
      `;

      const deptCards = DEPARTMENTS.map(d => {
        const count = countByDept[d.id] || 0;
        return `
          <div class="team-dept-card ${this._activeDept === d.id ? 'active' : ''}" data-dept="${d.id}"
               role="tab" tabindex="0" aria-selected="${this._activeDept === d.id}" style="--dept-color:${d.color}">
            <span class="team-dept-dot"></span>
            <span class="team-dept-label">${esc(d.label)}</span>
            <span class="team-dept-count">${count} colaborador${count === 1 ? '' : 'es'}</span>
          </div>
        `;
      }).join('');

      grid.innerHTML = allCard + deptCards;

      grid.querySelectorAll('.team-dept-card').forEach(card => {
        const select = () => {
          this._activeDept = card.dataset.dept;
          this._renderDeptGrid();
          this._renderMembers();
        };
        card.addEventListener('click', select);
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
      });
    }

    /* ── Filtro combinado (departamento + busca) ─────────────────────── */

    _getFilteredMembers() {
      let list = this._members;
      if (this._activeDept !== 'all') list = list.filter(m => m.department === this._activeDept);
      if (this._searchQuery.trim()) {
        const q = this._searchQuery.trim().toLowerCase();
        list = list.filter(m =>
          m.name.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
        );
      }
      return list;
    }

    /* ── Render de Colaboradores (grid ou lista) ─────────────────────── */

    _renderMembers() {
      const container = document.getElementById('team-members-container');
      if (!container) return;

      const list = this._getFilteredMembers();

      if (list.length === 0) {
        container.innerHTML = `
          <div class="team-empty">
            <div class="team-empty-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div class="team-empty-title">Nenhum colaborador encontrado</div>
            <div class="team-empty-sub">Tente outro departamento ou termo de busca.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = this._view === 'grid'
        ? `<div class="team-members-grid">${list.map((m, i) => this._renderMemberCard(m, i)).join('')}</div>`
        : `<div class="team-members-list">${list.map((m, i) => this._renderMemberRow(m, i)).join('')}</div>`;

      container.querySelectorAll('[data-member-id]').forEach(el => {
        el.addEventListener('click', () => this._openDrawer(el.dataset.memberId));
      });
    }

    _renderMemberCard(m, i) {
      const dept = DEPARTMENTS.find(d => d.id === m.department);
      const color = getAvatarColor(m.name);
      const initials = getInitials(m.name);
      const statusColor = m.status === 'active' ? '#34d399' : '#71717a';

      return `
        <div class="team-member-card stagger-item" data-member-id="${m.id}" style="animation-delay:${i * 30}ms"
             role="button" tabindex="0" aria-label="${esc(m.name)}">
          <div class="team-member-header">
            <div class="avatar avatar-lg" style="background:${color}22;color:${color}">${esc(initials)}</div>
            <div class="team-member-info">
              <div class="team-member-name">${esc(m.name)}</div>
              <div class="team-member-role">${esc(m.role)}</div>
            </div>
            <span class="team-member-status-dot" style="background:${statusColor}" title="${m.status === 'active' ? 'Ativo' : 'Inativo'}"></span>
          </div>
          ${dept ? `<span class="team-member-dept-badge" style="background:${dept.color}18;color:${dept.color}">${esc(dept.label)}</span>` : ''}
          <div class="team-member-kpis">
            <div class="team-member-kpi">
              <div class="team-member-kpi-value">${m.kpis.dealsWon}</div>
              <div class="team-member-kpi-label">Fechados</div>
            </div>
            <div class="team-member-kpi">
              <div class="team-member-kpi-value">${m.kpis.activeDeals}</div>
              <div class="team-member-kpi-label">Ativos</div>
            </div>
            <div class="team-member-kpi">
              <div class="team-member-kpi-value">${m.kpis.winRate}%</div>
              <div class="team-member-kpi-label">Conversão</div>
            </div>
          </div>
        </div>
      `;
    }

    _renderMemberRow(m, i) {
      const dept = DEPARTMENTS.find(d => d.id === m.department);
      const color = getAvatarColor(m.name);
      const initials = getInitials(m.name);
      const statusColor = m.status === 'active' ? '#34d399' : '#71717a';

      return `
        <div class="team-member-row stagger-item" data-member-id="${m.id}" style="animation-delay:${i * 20}ms"
             role="button" tabindex="0" aria-label="${esc(m.name)}">
          <span class="team-member-status-dot" style="background:${statusColor}"></span>
          <div class="avatar avatar-md" style="background:${color}22;color:${color}">${esc(initials)}</div>
          <div class="team-member-row-info">
            <div class="team-member-row-name">${esc(m.name)}</div>
            <div class="team-member-row-role">${esc(m.role)}</div>
          </div>
          ${dept ? `<span class="team-member-row-dept" style="background:${dept.color}18;color:${dept.color}">${esc(dept.label)}</span>` : ''}
          <span class="team-member-row-quota">${m.quota ? fmtCompact(m.quota) : '—'}</span>
        </div>
      `;
    }

    /* ── Busca ────────────────────────────────────────────────────────── */

    _bindSearch() {
      const input = document.getElementById('team-search-input');
      if (!input) return;
      let timer;
      input.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this._searchQuery = e.target.value;
          this._renderMembers();
        }, 200);
      });
    }

    /* ── Toggle Grid/Lista ────────────────────────────────────────────── */

    _bindViewToggle() {
      const toggle = document.getElementById('team-view-toggle');
      if (!toggle) return;
      toggle.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._view = btn.dataset.view;
          localStorage.setItem('ibex_team_view', this._view);
          toggle.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
          this._renderMembers();
        });
      });
    }

    /* ── Drawer de Perfil ─────────────────────────────────────────────── */

    _openDrawer(memberId) {
      const member = this._members.find(m => m.id === memberId);
      if (!member) return;

      this._activeMemberId = memberId;
      this._activeDrawerTab = 'profile';

      const overlay = document.getElementById('team-drawer-overlay');
      const drawer  = document.getElementById('team-drawer');
      const avatarEl = document.getElementById('team-drawer-avatar');
      const nameEl   = document.getElementById('team-drawer-name');
      const roleEl   = document.getElementById('team-drawer-role');

      if (!drawer || !overlay) return;

      if (avatarEl) {
        const color = getAvatarColor(member.name);
        avatarEl.textContent = getInitials(member.name);
        avatarEl.style.background = `${color}22`;
        avatarEl.style.color = color;
      }
      if (nameEl) nameEl.textContent = member.name;
      if (roleEl) roleEl.textContent = member.role;

      drawer.querySelectorAll('.drawer-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'profile'));
      this._renderDrawerTab(member);

      drawer.hidden  = false;
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';

      requestAnimationFrame(() => { drawer.style.transform = 'translateX(0)'; });
    }

    _closeDrawer() {
      const overlay = document.getElementById('team-drawer-overlay');
      const drawer  = document.getElementById('team-drawer');
      if (drawer)  drawer.hidden  = true;
      if (overlay) overlay.hidden = true;
      this._activeMemberId = null;
      document.body.style.overflow = '';
    }

    _bindDrawer() {
      const overlay = document.getElementById('team-drawer-overlay');
      const drawer  = document.getElementById('team-drawer');
      if (!overlay || !drawer) return;

      overlay.addEventListener('click', () => this._closeDrawer());
      drawer.querySelectorAll('[data-close-drawer]').forEach(el => el.addEventListener('click', () => this._closeDrawer()));

      drawer.querySelectorAll('.drawer-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this._activeDrawerTab = tab.dataset.tab;
          drawer.querySelectorAll('.drawer-tab').forEach(t => t.classList.toggle('active', t === tab));
          const member = this._members.find(m => m.id === this._activeMemberId);
          if (member) this._renderDrawerTab(member);
        });
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !drawer.hidden) this._closeDrawer();
      });
    }

    _renderDrawerTab(member) {
      const body = document.getElementById('team-drawer-body');
      if (!body) return;

      if (this._activeDrawerTab === 'profile') {
        const dept = DEPARTMENTS.find(d => d.id === member.department);
        body.innerHTML = `
          <div class="drawer-section">
            <div class="drawer-section-title">Informações</div>
            <div class="drawer-field"><span class="drawer-field-key">Departamento</span><span class="drawer-field-val">${dept ? esc(dept.label) : '—'}</span></div>
            <div class="drawer-field"><span class="drawer-field-key">E-mail</span><span class="drawer-field-val"><a href="mailto:${esc(member.email)}">${esc(member.email)}</a></span></div>
            <div class="drawer-field"><span class="drawer-field-key">Telefone</span><span class="drawer-field-val">${esc(member.phone || '—')}</span></div>
            <div class="drawer-field"><span class="drawer-field-key">Status</span><span class="drawer-field-val">${member.status === 'active' ? '🟢 Ativo' : '⚪ Inativo'}</span></div>
            <div class="drawer-field"><span class="drawer-field-key">Admissão</span><span class="drawer-field-val">${fmtDate(member.admissionDate)}</span></div>
            <div class="drawer-field"><span class="drawer-field-key">Meta mensal</span><span class="drawer-field-val">${member.quota ? fmtCompact(member.quota) : '—'}</span></div>
          </div>
          <div class="drawer-section" style="margin-top:20px">
            <div class="drawer-section-title">
              <span>Ações</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-secondary btn-sm" id="team-toggle-status-btn" style="flex:1">
                ${member.status === 'active' ? 'Desativar' : 'Reativar'}
              </button>
            </div>
          </div>
        `;

        body.querySelector('#team-toggle-status-btn')?.addEventListener('click', () => {
          member.status = member.status === 'active' ? 'inactive' : 'active';
          this._persist();
          this._renderMembers();
          this._renderHeaderStats();
          this._renderDrawerTab(member);
          this._toast('Success', 'Status atualizado', `${member.name} agora está ${member.status === 'active' ? 'ativo' : 'inativo'}.`);
        });

      } else if (this._activeDrawerTab === 'permissions') {
        body.innerHTML = getPermissionCategories().map(cat => `
          <div class="team-perm-category">
            <div class="team-perm-category-title">${esc(cat.label)}</div>
            ${cat.perms.map(p => {
              const granted = member.grantedPermissions.includes(p);
              return `
                <label class="team-perm-item ${granted ? 'granted' : ''}">
                  <input type="checkbox" data-perm="${esc(p)}" ${granted ? 'checked' : ''} />
                  ${esc(p)}
                </label>
              `;
            }).join('')}
          </div>
        `).join('') + `
          <p style="font-size:11px;color:var(--color-text-disabled);margin-top:12px;line-height:1.5">
            ⚠️ Esta tela ainda só controla a interface. Para bloquear ações de verdade no servidor,
            é necessário implementar validação de permissões no backend.
          </p>
        `;

        body.querySelectorAll('input[data-perm]').forEach(cb => {
          cb.addEventListener('change', () => {
            const perm = cb.dataset.perm;
            if (cb.checked) {
              if (!member.grantedPermissions.includes(perm)) member.grantedPermissions.push(perm);
            } else {
              member.grantedPermissions = member.grantedPermissions.filter(p => p !== perm);
            }
            cb.closest('.team-perm-item').classList.toggle('granted', cb.checked);
            this._persist();
          });
        });

      } else if (this._activeDrawerTab === 'kpis') {
        body.innerHTML = `
          <div class="drawer-section">
            <div class="drawer-section-title">Desempenho</div>
            <div class="team-kpi-row"><span class="team-kpi-row-label">Negócios fechados</span><span class="team-kpi-row-value">${member.kpis.dealsWon}</span></div>
            <div class="team-kpi-row"><span class="team-kpi-row-label">Negócios ativos</span><span class="team-kpi-row-value">${member.kpis.activeDeals}</span></div>
            <div class="team-kpi-row"><span class="team-kpi-row-label">Taxa de conversão</span><span class="team-kpi-row-value">${member.kpis.winRate}%</span></div>
            <div class="team-kpi-row"><span class="team-kpi-row-label">Meta mensal</span><span class="team-kpi-row-value">${member.quota ? fmtCompact(member.quota) : '—'}</span></div>
          </div>
        `;
      }
    }

    /* ── Modal: Novo Colaborador ──────────────────────────────────────── */

    _bindNewMemberModal() {
      const modal = document.getElementById('team-modal-new-member');
      if (!modal) return;

      const deptSelect = document.getElementById('tm-department');
      if (deptSelect) {
        deptSelect.innerHTML = DEPARTMENTS.map(d => `<option value="${d.id}">${esc(d.label)}</option>`).join('');
      }

      document.getElementById('team-add-member-btn')?.addEventListener('click', () => {
        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('modal-overlay--open'));
        document.getElementById('tm-name')?.focus();
      });

      const close = () => {
        modal.classList.remove('modal-overlay--open');
        setTimeout(() => { modal.hidden = true; document.getElementById('team-new-member-form')?.reset(); }, 150);
      };

      modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', close));

      document.getElementById('team-new-member-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);

        const newMember = {
          id: uid(),
          name: fd.get('name'),
          photo: null,
          role: fd.get('role'),
          department: fd.get('department'),
          email: fd.get('email'),
          phone: fd.get('phone') || '',
          status: 'active',
          admissionDate: fd.get('admissionDate') || new Date().toISOString().slice(0, 10),
          quota: Number(fd.get('quota')) || 0,
          grantedPermissions: [],
          kpis: { dealsWon: 0, activeDeals: 0, winRate: 0 },
        };

        this._members.push(newMember);
        this._persist();
        this._renderHeaderStats();
        this._renderDeptGrid();
        this._renderMembers();
        close();
        this._toast('Success', 'Colaborador adicionado', `${newMember.name} foi adicionado à equipe.`);
      });
    }
  }

  /* ── Bootstrap ─────────────────────────────────────────────────────────── */

  function init() {
    if (!window.Ibex?.storage) return setTimeout(init, 50);
    window.Ibex.team = new TeamController(window.Ibex);
    console.info('[Team] Módulo v1.0 inicializado.');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
