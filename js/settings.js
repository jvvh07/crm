/**
 * IBEX CRM — settings.js v2
 * Controller completo para a página de Configurações
 */
'use strict';

class SettingsController {

  constructor(storage, state) {
    this._storage = storage;
    this._state   = state;
    this._leads   = storage.getLeads({ includeArchived: false });
    this._users   = storage.getUsers();
    this._currentUser = storage.getCurrentUser();

    this._init();
  }

  /* ── Boot ──────────────────────────────────────────────────────────────── */

  _init() {
    this._bindNav();
    this._populateUserHero();
    this._populateProfileStats();
    this._renderTeam();
    this._renderPipelineStages();
    this._renderStorageUsage();
    this._loadSavedPrefs();
    this._bindProfile();
    this._bindSecurity();
    this._bindWorkspace();
    this._bindPipeline();
    this._bindIntegrations();
    this._bindNotifications();
    this._bindAppearance();
    this._bindData();
    this._bindDanger();
    this._bindShell();

    /* Open tab from URL hash if present */
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const btn = document.querySelector(`[data-tab="${hash}"]`);
      if (btn) btn.click();
    }
  }

  /* ── Tab navigation ─────────────────────────────────────────────────────── */

  _bindNav() {
    document.querySelectorAll('#settings-nav [data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        document.querySelectorAll('#settings-nav [data-tab]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const panel = document.getElementById(`panel-${tab}`);
        if (panel) panel.classList.add('active');

        window.location.hash = tab;
        document.getElementById('settings-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  /* ── Profile hero ────────────────────────────────────────────────────────── */

  _populateUserHero() {
    const u = this._currentUser;
    if (!u) return;

    const heroAvatar = document.getElementById('user-hero-avatar');
    const heroName   = document.getElementById('user-hero-name');
    const heroRole   = document.getElementById('user-hero-role');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const topbarAvatar  = document.getElementById('topbar-avatar');
    const sidebarName   = document.getElementById('sidebar-user-name');
    const sidebarRole   = document.getElementById('sidebar-user-role');

    if (heroAvatar) { heroAvatar.textContent = u.initials || 'U'; heroAvatar.style.background = `linear-gradient(135deg, ${u.color || '#6366f1'}, ${u.color || '#6366f1'}cc)`; }
    if (heroName)  heroName.textContent = u.name;
    if (heroRole)  heroRole.textContent = `${u.role} · IBEX Vendas`;
    if (sidebarAvatar) sidebarAvatar.textContent = u.initials || 'U';
    if (topbarAvatar)  topbarAvatar.textContent  = u.initials || 'U';
    if (sidebarName)   sidebarName.textContent   = u.name;
    if (sidebarRole)   sidebarRole.textContent   = u.role;

    /* Pre-fill form */
    const parts = (u.name || '').split(' ');
    this._setVal('sf-first-name', parts[0] || '');
    this._setVal('sf-last-name',  parts.slice(1).join(' ') || '');
    this._setVal('sf-role',       u.role || '');
  }

  _populateProfileStats() {
    const u = this._currentUser;
    if (!u) return;

    const myLeads  = this._leads.filter(l => l.owner === u.id);
    const myWon    = myLeads.filter(l => l.stage === 'won');
    const myPipe   = myLeads.filter(l => l.stage !== 'won' && l.stage !== 'lost').reduce((s, l) => s + (l.dealValue || 0), 0);
    const myTasks  = this._storage.getTasks({ owner: u.id }).filter(t => t.status !== 'done').length;
    const fn = v => `R$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`;

    this._setText('my-leads-count',    String(myLeads.length));
    this._setText('my-pipeline-value', fn(myPipe));
    this._setText('my-won-count',      String(myWon.length));
    this._setText('my-tasks-count',    String(myTasks));
  }

  /* ── Team ─────────────────────────────────────────────────────────────── */

  _renderTeam() {
    const container = document.getElementById('team-list');
    const countEl   = document.getElementById('team-count');
    if (!container) return;

    const roles = ['admin','member','member','member','viewer'];

    if (countEl) countEl.textContent = `(${this._users.length})`;

    container.innerHTML = this._users.map((u, i) => {
      const count    = this._leads.filter(l => l.owner === u.id).length;
      const wonCount = this._leads.filter(l => l.owner === u.id && l.stage === 'won').length;
      const role     = roles[i] || 'member';
      const roleLabels = { admin: 'Admin', member: 'Membro', viewer: 'Visualizador' };

      return `
        <div class="team-member-row">
          <div class="team-avatar" style="background:${u.color}22;color:${u.color}">${u.initials}</div>
          <div class="team-member-info">
            <div class="team-member-name">${this._esc(u.name)}</div>
            <div class="team-member-role">${this._esc(u.role)}</div>
          </div>
          <span class="team-badge ${role}">${roleLabels[role]}</span>
          <div class="team-member-stats">
            <span class="team-stat-value">${count} leads</span>
            <span class="team-stat-label">${wonCount} ganhos</span>
          </div>
        </div>
      `;
    }).join('') || `<div style="padding:var(--space-5);color:var(--text-muted);text-align:center">Nenhum membro cadastrado.</div>`;
  }

  /* ── Pipeline stages ──────────────────────────────────────────────────── */

  _renderPipelineStages() {
    const container = document.getElementById('pipeline-stages-list');
    if (!container) return;

    const stages = window.PIPELINE_STAGES || [];
    container.innerHTML = stages.map(s => `
      <div class="info-row" style="align-items:center">
        <div style="display:flex;align-items:center;gap:var(--space-2)">
          <div style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
          <div class="info-row-label">${s.label}</div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          <div style="font-size:var(--text-xs);color:var(--text-muted)">Probabilidade:</div>
          <input type="number" class="form-input" style="width:70px;height:30px;padding:0 8px;font-size:var(--text-xs)" value="${s.probability}" min="0" max="100" data-stage-id="${s.id}" />
          <span style="font-size:var(--text-xs);color:var(--text-muted)">%</span>
        </div>
      </div>
    `).join('');
  }

  /* ── Storage usage ────────────────────────────────────────────────────── */

  _renderStorageUsage() {
    const container = document.getElementById('storage-usage');
    if (!container) return;

    const keys  = Object.keys(localStorage).filter(k => k.startsWith('ibex_'));
    let total   = 0;
    const sizes = {};
    keys.forEach(k => {
      const sz    = (localStorage.getItem(k) || '').length * 2;
      sizes[k]    = sz;
      total      += sz;
    });

    const kb    = (total / 1024).toFixed(1);
    const maxKB = 5120;
    const pct   = Math.min(Math.round((total / (maxKB * 1024)) * 100), 100);

    const dataMap = {
      ibex_leads:      { label: 'Leads',       icon: '👤' },
      ibex_tasks:      { label: 'Tarefas',      icon: '✅' },
      ibex_activities: { label: 'Atividades',   icon: '📋' },
      ibex_users:      { label: 'Usuários',     icon: '👥' },
      ibex_metrics:    { label: 'Métricas',     icon: '📊' },
      ibex_settings:   { label: 'Config',       icon: '⚙️' },
    };

    const countsHtml = Object.entries(dataMap).map(([key, meta]) => {
      let count = '—';
      try {
        const val = JSON.parse(localStorage.getItem(key) || 'null');
        count = Array.isArray(val) ? val.length : (val ? '1' : '0');
      } catch(_) {}
      return `
        <div class="storage-key-item">
          <div class="storage-key-name">${meta.icon} ${meta.label}</div>
          <div class="storage-key-count">${count}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="storage-headline">
        <span class="storage-used">${kb} KB</span>
        <span class="storage-total">de 5.120 KB disponíveis no navegador</span>
      </div>
      <div class="storage-bar-wrap"><div class="storage-bar-fill" style="width:${pct}%"></div></div>
      <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-3)">${pct}% utilizado · ${keys.length} chave(s) ativa(s)</div>
      <div class="storage-keys-grid">${countsHtml}</div>
    `;
  }

  /* ── Saved preferences ────────────────────────────────────────────────── */

  _loadSavedPrefs() {
    /* API Keys */
    try {
      const keys = JSON.parse(localStorage.getItem('ibex_api_keys') || '{}');
      if (keys.whatsapp) this._setVal('api-whatsapp', keys.whatsapp);
      if (keys.rdstation) this._setVal('api-rdstation', keys.rdstation);
      if (keys.openai) this._setVal('api-openai', keys.openai);
    } catch(_) {}

    /* Appearance */
    try {
      const ap = JSON.parse(localStorage.getItem('ibex_appearance') || '{}');
      if (ap.accent) {
        const r = document.querySelector(`[name="accent"][value="${ap.accent}"]`);
        if (r) r.checked = true;
        document.documentElement.style.setProperty('--color-primary', ap.accent);
      }
      if (ap.theme) {
        const r = document.querySelector(`[name="app-theme"][value="${ap.theme}"]`);
        if (r) { r.checked = true; this._updateThemeLabels(ap.theme); }
      }
    } catch(_) {}

    /* Notification prefs */
    try {
      const np = JSON.parse(localStorage.getItem('ibex_notif_prefs') || '{}');
      Object.entries(np).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.checked = val;
      });
    } catch(_) {}
  }

  /* ── Profile ──────────────────────────────────────────────────────────── */

  _bindProfile() {
    document.getElementById('save-profile-btn')?.addEventListener('click', () => {
      const name = `${this._getVal('sf-first-name')} ${this._getVal('sf-last-name')}`.trim();
      if (!name) { this._state.toastError('Nome obrigatório', 'Preencha pelo menos o primeiro nome.'); return; }

      /* Update hero display */
      const heroName = document.getElementById('user-hero-name');
      if (heroName) heroName.textContent = name;
      const sName = document.getElementById('sidebar-user-name');
      if (sName)  sName.textContent = name;

      this._state.toastSuccess('Perfil salvo!', `As informações de ${name} foram atualizadas.`);
    });

    document.getElementById('cancel-profile-btn')?.addEventListener('click', () => {
      this._populateUserHero();
    });

    document.getElementById('user-hero-avatar')?.addEventListener('click', () => {
      this._state.toastInfo('Upload em breve', 'O upload de foto de perfil estará disponível na versão com backend.');
    });
  }

  /* ── Security ─────────────────────────────────────────────────────────── */

  _bindSecurity() {
    document.getElementById('save-password-btn')?.addEventListener('click', () => {
      const curr    = this._getVal('sec-current-pw');
      const newPw   = this._getVal('sec-new-pw');
      const confirm = this._getVal('sec-confirm-pw');
      if (!curr || !newPw) { this._state.toastError('Campos obrigatórios', 'Preencha a senha atual e a nova senha.'); return; }
      if (newPw !== confirm) { this._state.toastError('Senhas diferentes', 'A nova senha e a confirmação não coincidem.'); return; }
      if (newPw.length < 8)  { this._state.toastError('Senha fraca', 'Use pelo menos 8 caracteres.'); return; }
      this._state.toastSuccess('Senha atualizada!', 'Sua senha foi alterada com sucesso.');
    });
  }

  revokeSessionStub() {
    this._state.toastWarn('Sessão revogada', 'O dispositivo foi desconectado.');
  }

  /* ── Workspace ────────────────────────────────────────────────────────── */

  _bindWorkspace() {
    document.getElementById('save-workspace-btn')?.addEventListener('click', () => {
      const company = this._getVal('ws-company');
      if (!company) { this._state.toastError('Campo obrigatório', 'Informe o nome da empresa.'); return; }
      this._state.toastSuccess('Workspace salvo!', 'As configurações foram aplicadas a toda a equipe.');
    });
  }

  /* ── Pipeline ─────────────────────────────────────────────────────────── */

  _bindPipeline() {
    document.getElementById('save-stages-btn')?.addEventListener('click', () => {
      this._state.toastSuccess('Estágios salvos!', 'As probabilidades do pipeline foram atualizadas.');
    });

    document.getElementById('add-stage-btn')?.addEventListener('click', () => {
      this._state.toastInfo('Em breve', 'Criação de estágios customizados disponível na próxima versão.');
    });

    document.getElementById('save-goals-btn')?.addEventListener('click', () => {
      const monthly = this._getVal('goal-monthly');
      const deals   = this._getVal('goal-deals');
      if (!monthly && !deals) { this._state.toastError('Campos vazios', 'Preencha ao menos uma meta.'); return; }
      this._state.toastSuccess('Metas salvas!', 'As metas do pipeline foram definidas.');
    });
  }

  /* ── Integrations ─────────────────────────────────────────────────────── */

  _bindIntegrations() {
    document.getElementById('copy-api-key-btn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText('ibex_sk_demo_key_placeholder').catch(() => {});
      this._state.toastSuccess('Copiado!', 'Chave de API copiada para a área de transferência.');
    });

    document.getElementById('copy-webhook-btn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText('https://api.ibexcrm.app/hooks/demo').catch(() => {});
      this._state.toastSuccess('Copiado!', 'URL do webhook copiada.');
    });

    document.getElementById('save-api-keys-btn')?.addEventListener('click', () => {
      const keys = {
        whatsapp: this._getVal('api-whatsapp'),
        rdstation: this._getVal('api-rdstation'),
        openai: this._getVal('api-openai')
      };
      localStorage.setItem('ibex_api_keys', JSON.stringify(keys));
      this._state.toastSuccess('Salvo', 'Credenciais de API salvas com sucesso!');
    });
  }

  /* ── Notifications ────────────────────────────────────────────────────── */

  _bindNotifications() {
    document.getElementById('save-notif-btn')?.addEventListener('click', () => {
      const prefs = {};
      ['nt-assigned','nt-inactive','nt-stage-change','nt-task-due','nt-task-overdue','nt-won','nt-weekly','nt-push'].forEach(id => {
        const el = document.getElementById(id);
        if (el) prefs[id] = el.checked;
      });
      localStorage.setItem('ibex_notif_prefs', JSON.stringify(prefs));
      this._state.toastSuccess('Preferências salvas!', 'Notificações configuradas com sucesso.');
    });
  }

  /* ── Appearance ───────────────────────────────────────────────────────── */

  _bindAppearance() {
    /* Theme radio */
    document.querySelectorAll('[name="app-theme"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this._updateThemeLabels(radio.value);
        if (radio.value === 'dark' || radio.value === 'light') {
          document.documentElement.setAttribute('data-theme', radio.value);
        } else {
          const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        }
      });
    });

    /* Accent live preview */
    document.querySelectorAll('[name="accent"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.documentElement.style.setProperty('--color-primary', radio.value);
      });
    });

    /* Grain toggle */
    document.getElementById('toggle-grain')?.addEventListener('change', e => {
      const grain = document.querySelector('.grain-overlay');
      if (grain) grain.style.opacity = e.target.checked ? '' : '0';
    });

    /* Reduced motion */
    document.getElementById('toggle-reduced-motion')?.addEventListener('change', e => {
      ['--duration-fast','--duration-moderate','--duration-slow'].forEach(v =>
        document.documentElement.style.setProperty(v, e.target.checked ? '0ms' : '')
      );
    });

    document.getElementById('save-appearance-btn')?.addEventListener('click', () => {
      const accent = document.querySelector('[name="accent"]:checked')?.value  || '#6366f1';
      const theme  = document.querySelector('[name="app-theme"]:checked')?.value || 'dark';
      localStorage.setItem('ibex_appearance', JSON.stringify({ accent, theme }));
      this._state.toastSuccess('Aparência salva!', 'Preferências visuais gravadas.');
    });
  }

  _updateThemeLabels(activeTheme) {
    ['dark','light','system'].forEach(t => {
      const lbl = document.getElementById(`theme-${t}-lbl`);
      if (lbl) lbl.classList.toggle('selected', t === activeTheme);
    });
  }

  /* ── Data ─────────────────────────────────────────────────────────────── */

  _bindData() {
    /* JSON export */
    document.getElementById('export-json-btn')?.addEventListener('click', () => {
      const leads = this._storage.getLeads({ includeArchived: true });
      this._downloadFile(
        JSON.stringify({ leads, version: '1.0', exportedAt: new Date().toISOString() }, null, 2),
        `ibex-leads-${this._today()}.json`, 'application/json'
      );
      this._state.toastSuccess('Exportado!', `${leads.length} leads exportados em JSON.`);
    });

    /* CSV leads */
    document.getElementById('export-csv-btn')?.addEventListener('click', () => {
      const leads = this._storage.getLeads({ includeArchived: true });
      const csv   = this._buildCSV(
        ['Nome','Empresa','Cargo','E-mail','Telefone','Estágio','Valor','Origem','Responsável','Criado em'],
        leads.map(l => [l.fullName, l.company, l.role, l.email, l.phone, l.stage, l.dealValue||0, l.source, l.ownerName, (l.createdAt||'').slice(0,10)])
      );
      this._downloadFile('\uFEFF'+csv, `ibex-leads-${this._today()}.csv`, 'text/csv;charset=utf-8');
      this._state.toastSuccess('Exportado!', `${leads.length} leads exportados em CSV.`);
    });

    /* CSV activities */
    document.getElementById('export-activities-btn')?.addEventListener('click', () => {
      const acts = this._storage.getActivities();
      const csv  = this._buildCSV(
        ['Tipo','Lead','Empresa','Resultado','Duração (min)','Data'],
        acts.map(a => [a.type, a.leadName||'', a.company||'', a.outcome||'', a.duration||0, (a.createdAt||'').slice(0,10)])
      );
      this._downloadFile('\uFEFF'+csv, `ibex-activities-${this._today()}.csv`, 'text/csv;charset=utf-8');
      this._state.toastSuccess('Exportado!', `${acts.length} atividades exportadas.`);
    });

    /* CSV tasks */
    document.getElementById('export-tasks-btn')?.addEventListener('click', () => {
      const tasks = this._storage.getTasks();
      const csv   = this._buildCSV(
        ['Título','Lead','Empresa','Tipo','Prioridade','Status','Prazo','Responsável'],
        tasks.map(t => [t.title, t.leadName||'', t.company||'', t.type, t.priority, t.status, (t.dueDate||'').slice(0,10), t.ownerName||''])
      );
      this._downloadFile('\uFEFF'+csv, `ibex-tasks-${this._today()}.csv`, 'text/csv;charset=utf-8');
      this._state.toastSuccess('Exportado!', `${tasks.length} tarefas exportadas.`);
    });

    /* Import CSV */
    document.getElementById('import-csv-input')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const text = ev.target.result;
          const rows = text.split('\n').map(r => r.trim()).filter(r => r);
          if (rows.length < 2) {
             this._state.toastError('Arquivo inválido', 'O CSV parece estar vazio ou sem cabeçalhos.');
             return;
          }
          
          let imported = 0;
          for (let i = 1; i < rows.length; i++) {
             const row = rows[i];
             // Basic CSV split, handle quotes correctly
             let cols = [];
             let inQuotes = false;
             let val = '';
             for (let ch of row) {
               if (ch === '"') inQuotes = !inQuotes;
               else if (ch === ',' && !inQuotes) { cols.push(val.trim()); val = ''; }
               else val += ch;
             }
             cols.push(val.trim());
             
             const [fullName, company, role, email, phone, stage, dealValue, source] = cols;
             
             if (fullName && company) {
               const parts = fullName.split(' ');
               this._storage.createLead({
                 firstName: parts[0],
                 lastName: parts.slice(1).join(' '),
                 company: company,
                 role: role || '',
                 email: email || '',
                 phone: phone || '',
                 stage: stage || 'new',
                 dealValue: parseFloat(dealValue) || 0,
                 source: source || 'Importação CSV'
               });
               imported++;
             }
          }
          this._state.toastSuccess('Importação concluída', `${imported} leads importados com sucesso.`);
          this._populateProfileStats();
          this._renderStorageUsage();
        } catch(err) {
          this._state.toastError('Erro ao importar', 'Ocorreu um erro ao processar o arquivo CSV.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    /* Import JSON (Backup Restore) */
    document.getElementById('import-json-input')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data  = JSON.parse(ev.target.result);
          const leads = data?.leads;
          if (Array.isArray(leads)) {
            const current = this._storage.getLeads({ includeArchived: true });
            const currentIds = new Set(current.map(l => l.id));
            let restored = 0;
            
            leads.forEach(l => {
              if (!currentIds.has(l.id)) {
                this._storage.createLead(l);
                restored++;
              } else {
                this._storage.updateLead(l.id, l);
              }
            });
            this._state.toastSuccess('Backup restaurado', `${leads.length} leads processados (${restored} novos).`);
            this._populateProfileStats();
            this._renderStorageUsage();
          } else {
            this._state.toastError('Arquivo inválido', 'O JSON não contém um formato de leads válido.');
          }
        } catch(_) {
          this._state.toastError('Arquivo inválido', 'Não foi possível ler o JSON. Verifique o arquivo.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  /* ── Danger zone ──────────────────────────────────────────────────────── */

  _bindDanger() {
    document.getElementById('clear-leads-btn')?.addEventListener('click', () => {
      if (!confirm('Tem certeza? TODOS os leads, tarefas e atividades serão removidos permanentemente. Isso não pode ser desfeito.')) return;
      /* Clear leads, tasks, activities from localStorage */
      ['ibex_leads','ibex_tasks','ibex_activities'].forEach(k => localStorage.removeItem(k));
      this._leads = [];
      this._renderStorageUsage();
      this._populateProfileStats();
      this._state.toastWarn('Dados removidos', 'Todos os leads foram apagados do sistema.');
    });

    document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
      if (!confirm('Isso vai APAGAR todos os dados atuais e restaurar os dados demo. confirmar?')) return;
      /* Remove seed flag to force re-seed on next load */
      localStorage.removeItem('ibex_seeded');
      localStorage.removeItem('ibex_leads');
      localStorage.removeItem('ibex_tasks');
      localStorage.removeItem('ibex_activities');
      localStorage.removeItem('ibex_metrics');
      this._state.toastSuccess('Resetando…', 'Recarregando o CRM com dados demo.');
      setTimeout(() => window.location.reload(), 1500);
    });

    document.getElementById('clear-settings-btn')?.addEventListener('click', () => {
      if (!confirm('As preferências (tema, filtros, aparência) serão limpas. Os dados de leads serão mantidos. confirmar?')) return;
      ['ibex_settings','ibex_notif_prefs','ibex_appearance'].forEach(k => localStorage.removeItem(k));
      this._state.toastSuccess('Cache limpo!', 'Preferências restauradas para o padrão.');
    });

    document.getElementById('delete-all-btn')?.addEventListener('click', () => {
      if (!confirm('⚠ ATENÇÃO: Isso vai apagar ABSOLUTAMENTE TUDO do IBEX CRM neste navegador.\n\nEsta ação é irreversível. confirmar?')) return;
      if (!confirm('Última confirmação: apagar todos os dados?')) return;
      Object.keys(localStorage).filter(k => k.startsWith('ibex_')).forEach(k => localStorage.removeItem(k));
      this._state.toastWarn('Tudo apagado', 'Redirecionando…');
      setTimeout(() => window.location.href = 'index.html', 2000);
    });
  }

  /* ── Shell ────────────────────────────────────────────────────────────── */

  _bindShell() {
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

    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
      if (!e.ctrlKey && !e.metaKey) {
        const map = { '1':'index.html','2':'pipeline.html','3':'leads.html','4':'analytics.html' };
        if (map[e.key]) window.location.href = map[e.key];
      }
    });
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  _getVal(id) { return (document.getElementById(id)?.value || '').trim(); }
  _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
  _setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  _today() { return new Date().toISOString().slice(0,10); }

  _downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  _buildCSV(headers, rows) {
    const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
    return [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  }
}

/* ─── Bootstrap ─────────────────────────────────────────────────────────── */

function initSettingsPage() {
  window._settingsCtrl = new SettingsController(window.Ibex.storage, window.Ibex.state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettingsPage);
} else {
  initSettingsPage();
}
