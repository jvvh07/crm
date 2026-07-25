/**
 * IBEX CRM — Dashboard: Widgets Adicionais
 * Estende o dashboard-premium.js (NÃO o reescreve) adicionando uma segunda
 * fileira de insight-cards com métricas operacionais do dia a dia:
 * Leads novos hoje, Follow-ups pendentes, Reuniões de hoje, SLA médio,
 * Pipeline em risco e Metas do mês (mini-goals).
 *
 * Reaproveita 100% dos componentes visuais já existentes (.insight-card,
 * .insight-card-label, .insight-card-value, .insight-card-sub, .insight-delta)
 * definidos em css/premium.css — nenhum CSS novo de card é criado aqui.
 *
 * Depende de: state.js, storage.js, dashboard-premium.js (carregar DEPOIS dele)
 * @version 1.0.0
 */

'use strict';

(function () {

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtCompact(v) {
    if (v == null || isNaN(v)) return 'R$ 0';
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000)     return `R$ ${Math.round(v / 1_000)}K`;
    return `R$ ${Math.round(v)}`;
  }

  function isSameDay(dateStr, ref) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === ref.getFullYear() &&
           d.getMonth() === ref.getMonth() &&
           d.getDate() === ref.getDate();
  }

  class DashboardWidgetsExtra {

    constructor(app) {
      this._app     = app;
      this._state   = app.state;
      this._storage = app.storage;
    }

    init() {
      // Mesma proteção usada em dashboard-premium.js: getCurrentPage() cai no
      // fallback 'dashboard' em páginas sem elementos .page[data-page]. Checar
      // o DOM real evita este módulo tentar renderizar em página errada caso
      // o script seja incluído fora de index.html no futuro.
      const isRealDashboardPage = () => !!document.getElementById('insights-row') || !!document.getElementById('kpi-grid');

      this._state.subscribe('page', (page) => {
        if (page === 'dashboard' && isRealDashboardPage()) setTimeout(() => this._render(), 140);
      });

      if (this._state.getCurrentPage() === 'dashboard' && isRealDashboardPage()) {
        setTimeout(() => this._render(), 260);
      }
    }

    _render() {
      const leads = this._storage.getLeads({ includeArchived: false });
      const tasks = this._storage.getTasks();
      const kpis  = this._storage.getKPIs();

      this._renderOperationalRow(leads, tasks);
      this._renderPipelineRiskAndGoals(leads, kpis);
    }

    /* ── Linha 1: métricas operacionais do dia ───────────────────────────── */

    _renderOperationalRow(leads, tasks) {
      const existing = document.getElementById('widgets-row-operational');
      if (existing) existing.remove();

      const today = new Date();

      const leadsToday = leads.filter(l => isSameDay(l.createdAt, today));

      const followUpsPending = tasks.filter(t =>
        t.type === 'follow_up' && t.status !== 'done'
      );

      const meetingsToday = tasks.filter(t =>
        t.type === 'meeting' && isSameDay(t.dueDate, today) && t.status !== 'done'
      );

      // SLA médio: tempo entre criação do lead e a primeira atividade registrada.
      // Como não há timestamp de "primeira atividade" persistido, aproximamos
      // usando updatedAt como proxy de primeiro contato quando != createdAt.
      const leadsWithContact = leads.filter(l => l.updatedAt && l.createdAt && l.updatedAt !== l.createdAt);
      const avgSlaHours = leadsWithContact.length > 0
        ? Math.round(
            leadsWithContact.reduce((acc, l) => {
              const diffMs = new Date(l.updatedAt) - new Date(l.createdAt);
              return acc + Math.max(diffMs, 0);
            }, 0) / leadsWithContact.length / 3_600_000
          )
        : null;

      const widgets = [
        {
          label: 'Leads Novos Hoje',
          value: leadsToday.length,
          sub: leadsToday.length > 0
            ? leadsToday.slice(0, 2).map(l => l.fullName).join(', ') + (leadsToday.length > 2 ? '…' : '')
            : 'Nenhum lead novo ainda',
          delta: leadsToday.length > 0 ? 'Hoje' : 'Aguardando',
          deltaDir: leadsToday.length > 0 ? 'up' : 'flat',
          color: '#818cf8',
          nav: 'leads',
        },
        {
          label: 'Follow-ups Pendentes',
          value: followUpsPending.length,
          sub: followUpsPending.length > 0 ? 'Aguardando retorno' : 'Tudo em dia',
          delta: followUpsPending.length > 5 ? 'Volume alto' : 'Sob controle',
          deltaDir: followUpsPending.length > 5 ? 'down' : 'up',
          color: '#fbbf24',
          nav: 'tasks',
        },
        {
          label: 'Reuniões de Hoje',
          value: meetingsToday.length,
          sub: meetingsToday.length > 0
            ? meetingsToday.slice(0, 2).map(t => t.title).join(', ') + (meetingsToday.length > 2 ? '…' : '')
            : 'Nenhuma reunião agendada',
          delta: meetingsToday.length > 0 ? 'Confirmadas' : '—',
          deltaDir: meetingsToday.length > 0 ? 'up' : 'flat',
          color: '#38bdf8',
          nav: 'tasks',
        },
        {
          label: 'SLA Médio de Resposta',
          value: avgSlaHours != null ? `${avgSlaHours}h` : '—',
          sub: 'Tempo até 1º contato',
          delta: avgSlaHours == null ? 'Sem dados' : (avgSlaHours <= 24 ? 'Dentro da meta' : 'Acima do ideal'),
          deltaDir: avgSlaHours == null ? 'flat' : (avgSlaHours <= 24 ? 'up' : 'down'),
          color: '#34d399',
          nav: 'analytics',
        },
      ];

      const section = document.createElement('div');
      section.id = 'widgets-row-operational';
      section.className = 'insights-grid';
      section.style.gridTemplateColumns = 'repeat(4, 1fr)';

      section.innerHTML = widgets.map((w, i) => `
        <div class="insight-card stagger-item" style="animation-delay:${i * 50}ms" data-nav="${w.nav}"
             role="button" tabindex="0" aria-label="${esc(w.label)}: ${esc(String(w.value))}">
          <div class="insight-card-label">
            <span style="width:6px;height:6px;border-radius:50%;background:${w.color};display:inline-block;flex-shrink:0"></span>
            ${esc(w.label)}
          </div>
          <div class="insight-card-value" style="color:${w.color}">${esc(String(w.value))}</div>
          <div class="insight-card-sub">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${esc(w.sub)}</span>
            <span class="insight-delta insight-delta--${w.deltaDir}">
              ${w.deltaDir === 'up' ? '↑' : w.deltaDir === 'down' ? '↓' : '→'} ${esc(w.delta)}
            </span>
          </div>
        </div>
      `).join('');

      section.querySelectorAll('[data-nav]').forEach(card => {
        const handler = () => this._state.navigate(card.dataset.nav);
        card.addEventListener('click', handler);
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
      });

      // Inserir logo após a linha de insights já existente (dashboard-premium.js)
      const originalInsights = document.getElementById('insights-row');
      if (originalInsights) {
        originalInsights.after(section);
      } else {
        const focusSection = document.getElementById('daily-focus-section');
        if (focusSection) focusSection.before(section);
      }

      // Responsivo: 2 colunas em telas médias, 1 em mobile (reusa breakpoints do premium.css)
      this._injectResponsiveRuleOnce();
    }

    /* ── Linha 2: Pipeline em risco + Metas do mês ───────────────────────── */

    _renderPipelineRiskAndGoals(leads, kpis) {
      const existing = document.getElementById('widgets-row-risk-goals');
      if (existing) existing.remove();

      const activeLeads = leads.filter(l => !['won', 'lost'].includes(l.stage));
      const now = Date.now();

      const staleLeads = activeLeads.filter(l => {
        const days = Math.floor((now - new Date(l.updatedAt || l.createdAt)) / 86400000);
        return days >= 14;
      });

      const riskValue = staleLeads.reduce((acc, l) => acc + (l.dealValue || 0), 0);
      const riskPctOfPipeline = kpis.pipelineValue > 0
        ? Math.round((riskValue / kpis.pipelineValue) * 100)
        : 0;

      // Metas do mês — mini-goals derivados dos KPIs já existentes
      const revenueGoal   = kpis.goals?.revenue || { target: 0, current: 0 };
      const revenuePct    = revenueGoal.target > 0 ? Math.min(Math.round((revenueGoal.current / revenueGoal.target) * 100), 100) : 0;

      const newLeadsGoalTarget = 40; // meta mensal padrão de novos leads (mockado — configurável futuramente em Settings)
      const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const newLeadsThisMonth = leads.filter(l => new Date(l.createdAt) >= monthStart).length;
      const newLeadsPct = Math.min(Math.round((newLeadsThisMonth / newLeadsGoalTarget) * 100), 100);

      const callsGoalTarget = 60; // meta mensal de calls/contatos (mockado)
      const contactedThisMonth = leads.filter(l => l.updatedAt && new Date(l.updatedAt) >= monthStart && l.updatedAt !== l.createdAt).length;
      const callsPct = Math.min(Math.round((contactedThisMonth / callsGoalTarget) * 100), 100);

      const section = document.createElement('div');
      section.id = 'widgets-row-risk-goals';
      section.style.cssText = 'display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-bottom:20px';

      section.innerHTML = `
        <div class="card chart-card" style="padding:20px">
          <div class="section-header-premium" style="margin-bottom:14px">
            <span class="section-title-premium">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Pipeline em Risco
            </span>
            <span class="badge ${riskValue > 0 ? 'badge-rose' : 'badge-emerald'}">
              ${staleLeads.length} lead${staleLeads.length === 1 ? '' : 's'}
            </span>
          </div>
          ${staleLeads.length === 0 ? `
            <div style="display:flex;align-items:center;gap:10px;color:var(--emerald-400);font-size:13px;font-weight:600;padding:8px 0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
              Nenhum lead parado há mais de 14 dias
            </div>
          ` : `
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
              <span style="font-size:28px;font-weight:800;color:var(--rose-400);letter-spacing:-0.02em">${fmtCompact(riskValue)}</span>
              <span style="font-size:12px;color:var(--color-text-tertiary)">em risco · ${riskPctOfPipeline}% do pipeline ativo</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px">
              ${staleLeads.slice(0, 3).map(l => {
                const days = Math.floor((now - new Date(l.updatedAt || l.createdAt)) / 86400000);
                return `
                  <div class="widget-risk-row" data-lead-id="${esc(l.id)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(244,63,94,0.05);border:1px solid rgba(244,63,94,0.12);border-radius:10px;cursor:pointer;transition:background 0.12s">
                    <span style="width:6px;height:6px;border-radius:50%;background:var(--rose-500);flex-shrink:0"></span>
                    <span style="flex:1;font-size:12px;font-weight:600;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.fullName)} · ${esc(l.company)}</span>
                    <span style="font-size:11px;color:var(--rose-400);font-weight:700;flex-shrink:0">${days}d parado</span>
                    <span style="font-size:12px;color:var(--color-text-secondary);font-weight:700;flex-shrink:0">${fmtCompact(l.dealValue)}</span>
                  </div>
                `;
              }).join('')}
              ${staleLeads.length > 3 ? `
                <button class="btn btn-ghost btn-xs" id="widget-risk-viewall" style="margin-top:4px;align-self:flex-start">
                  Ver todos os ${staleLeads.length} leads em risco →
                </button>
              ` : ''}
            </div>
          `}
        </div>

        <div class="card chart-card" style="padding:20px">
          <div class="section-header-premium" style="margin-bottom:16px">
            <span class="section-title-premium">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
              Objetivos do Mês
            </span>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px">
            ${this._goalRow('Receita', revenuePct, `${fmtCompact(revenueGoal.current)} / ${fmtCompact(revenueGoal.target)}`, '#10b981')}
            ${this._goalRow('Novos Leads', newLeadsPct, `${newLeadsThisMonth} / ${newLeadsGoalTarget}`, '#6366f1')}
            ${this._goalRow('Contatos Realizados', callsPct, `${contactedThisMonth} / ${callsGoalTarget}`, '#f59e0b')}
          </div>
        </div>
      `;

      // Inserir depois da linha operacional
      const operationalRow = document.getElementById('widgets-row-operational');
      if (operationalRow) operationalRow.after(section);

      // Bind: click em lead de risco navega para leads
      section.querySelectorAll('.widget-risk-row').forEach(row => {
        row.addEventListener('click', () => this._state.navigate('leads'));
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(244,63,94,0.09)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'rgba(244,63,94,0.05)'; });
      });
      section.querySelector('#widget-risk-viewall')?.addEventListener('click', () => this._state.navigate('leads'));

      // Animar barras de progresso das metas
      requestAnimationFrame(() => {
        setTimeout(() => {
          section.querySelectorAll('.widget-goal-fill').forEach(bar => {
            bar.style.transition = 'width 1s cubic-bezier(0.16,1,0.3,1)';
            bar.style.width = bar.dataset.target;
          });
        }, 150);
      });

      // Responsivo
      this._injectResponsiveRuleOnce();
    }

    _goalRow(label, pct, subLabel, color) {
      return `
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:12px;font-weight:600;color:var(--color-text-secondary)">${esc(label)}</span>
            <span style="font-size:11px;color:var(--color-text-tertiary)">${esc(subLabel)}</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:99px;overflow:hidden">
            <div class="widget-goal-fill" data-target="${pct}%" style="width:0%;height:100%;border-radius:99px;background:${color}"></div>
          </div>
          <div style="text-align:right;margin-top:3px;font-size:10px;font-weight:700;color:${color}">${pct}%</div>
        </div>
      `;
    }

    _injectResponsiveRuleOnce() {
      if (document.getElementById('dashboard-widgets-extra-style')) return;
      const style = document.createElement('style');
      style.id = 'dashboard-widgets-extra-style';
      style.textContent = `
        @media (max-width: 1280px) {
          #widgets-row-operational { grid-template-columns: repeat(2, 1fr) !important; }
          #widgets-row-risk-goals  { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          #widgets-row-operational { grid-template-columns: 1fr !important; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  window.Ibex?.register((app) => {
    app.dashboardWidgetsExtra = new DashboardWidgetsExtra(app);
    app.dashboardWidgetsExtra.init();
    console.info('[DashboardWidgetsExtra] Módulo v1.0 registrado.');
  });

})();
