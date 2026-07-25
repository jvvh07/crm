/**
 * IBEX CRM — Dashboard Premium Module
 * Camada de melhorias sobre o dashboard existente.
 * Adiciona: animações de número, funil interativo, insights cards,
 * micro-interações, sparklines, contador animado, skeleton loading,
 * context menu, undo de exclusão, atalhos de teclado avançados.
 * Depende: state.js, storage.js, utils.js, ui.js
 * @version 2.0.0
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

/** Anima um número de `from` até `to` em `duration` ms */
function animateNumber(el, from, to, duration = 700, format = v => v) {
  if (!el) return;
  const start = performance.now();
  const diff  = to - from;

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out-expo
    const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    el.textContent = format(Math.round(from + diff * eased));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Formata número para exibição compacta BRL */
function fmtCompact(v) {
  if (v == null || isNaN(v)) return 'R$ 0';
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000)     return `R$ ${Math.round(v / 1_000)}K`;
  return `R$ ${Math.round(v)}`;
}

function fmtPct(v) { return `${Math.round(v || 0)}%`; }
function fmtNum(v) { return new Intl.NumberFormat('pt-BR').format(Math.round(v || 0)); }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * BUGFIX (compartilhado): state.navigate() só produz efeito visual dentro do
 * SPA multi-página de index.html (que tem elementos .page[data-page]). Em
 * páginas standalone (team.html, pipeline-builder.html etc.) chamar
 * state.navigate() diretamente é um no-op silencioso — o clique parece não
 * fazer nada. Esta função detecta o contexto real e usa redirecionamento de
 * URL de verdade quando fora do SPA.
 */
const IBEX_PAGE_URL_MAP = {
  dashboard: 'index.html', pipeline: 'pipeline.html', leads: 'leads.html',
  analytics: 'analytics.html', tasks: 'tasks.html', settings: 'settings.html',
};

function ibexSmartNavigate(state, page) {
  const isSpaContext = !!document.querySelector('.page[data-page]');
  if (isSpaContext) {
    state.navigate(page);
  } else if (IBEX_PAGE_URL_MAP[page]) {
    window.location.href = IBEX_PAGE_URL_MAP[page];
  } else {
    console.warn('[ibexSmartNavigate] Página desconhecida:', page);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SPARKLINE SVG GENERATOR
   ═══════════════════════════════════════════════════════════════════════════ */

function generateSparkline(values, color, width = 120, height = 36) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values) || 1;
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${points[0]} L ${points.join(' L ')} L ${(values.length-1)*step},${height} L 0,${height} Z`;

  return `<svg viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible">
    <defs>
      <linearGradient id="sg-${color.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#sg-${color.replace('#','')})" />
    <path d="${pathD}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${(values.length-1)*step}" cy="${points[points.length-1].split(',')[1]}" r="2.5" fill="${color}" />
  </svg>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════════════════════════════ */

class ContextMenu {
  constructor() {
    this._el = null;
    this._cleanup = this._cleanup.bind(this);
  }

  show(x, y, items) {
    this.hide();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = `left:${x}px;top:${y}px`;

    items.forEach(item => {
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'context-menu-sep';
        menu.appendChild(sep);
        return;
      }
      const el = document.createElement('button');
      el.className = `context-menu-item${item.danger ? ' context-menu-item--danger' : ''}`;
      el.setAttribute('role', 'menuitem');
      el.innerHTML = `
        ${item.icon ? `<span class="context-menu-item-icon" aria-hidden="true">${item.icon}</span>` : ''}
        <span>${esc(item.label)}</span>
        ${item.kbd ? `<span class="context-menu-item-kbd">${esc(item.kbd)}</span>` : ''}
      `;
      el.addEventListener('click', () => { item.action?.(); this.hide(); });
      menu.appendChild(el);
    });

    document.body.appendChild(menu);
    this._el = menu;

    // Reposition if off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8)  menu.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight - 8) menu.style.top  = `${y - rect.height}px`;

    setTimeout(() => document.addEventListener('click', this._cleanup, { once: true }), 10);
    setTimeout(() => document.addEventListener('keydown', this._escCleanup = e => { if (e.key === 'Escape') this.hide(); }, { once: true }), 10);
  }

  hide() {
    if (this._el) { this._el.remove(); this._el = null; }
    document.removeEventListener('click', this._cleanup);
  }

  _cleanup() { this.hide(); }
}

window._ibexContextMenu = new ContextMenu();

/* ═══════════════════════════════════════════════════════════════════════════
   UNDO TOAST
   ═══════════════════════════════════════════════════════════════════════════ */

function showUndoToast(message, onUndo, duration = 5000) {
  const existing = document.getElementById('undo-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'undo-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span class="undo-toast-msg">${esc(message)}</span>
    <button class="undo-toast-btn" id="undo-toast-btn">Desfazer</button>
    <div class="undo-toast-progress" id="undo-toast-progress"></div>
  `;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('undo-toast--show'));

  const progressEl = toast.querySelector('#undo-toast-progress');
  if (progressEl) {
    progressEl.style.transition = `width ${duration}ms linear`;
    requestAnimationFrame(() => { progressEl.style.width = '0%'; });
  }

  const btn = toast.querySelector('#undo-toast-btn');
  let dismissed = false;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('undo-toast--show');
    setTimeout(() => toast.remove(), 300);
  };

  btn?.addEventListener('click', () => { onUndo?.(); dismiss(); });

  const timer = setTimeout(dismiss, duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', () => setTimeout(dismiss, 1000));
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD PREMIUM CONTROLLER
   ═══════════════════════════════════════════════════════════════════════════ */

class DashboardPremium {

  constructor(app) {
    this._app     = app;
    this._state   = app.state;
    this._storage = app.storage;
    this._prevKpis = {};
    this._initialized = false;
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */

  init() {
    if (this._initialized) return;
    this._initialized = true;

    // BUGFIX: em páginas standalone sem elementos .page[data-page] (ex: team.html,
    // pipeline-builder.html), state.getCurrentPage() cai no fallback 'dashboard'
    // mesmo não sendo o dashboard de verdade. Checar a existência real do DOM
    // do dashboard evita _enhanceDashboard() rodar em páginas erradas.
    const isRealDashboardPage = () => !!document.getElementById('kpi-grid');

    // Aguarda DOM + navegação para dashboard
    this._state.subscribe('page', (page) => {
      if (page === 'dashboard' && isRealDashboardPage()) {
        setTimeout(() => this._enhanceDashboard(), 80);
      }
    });

    // Se já estiver no dashboard, aplica imediatamente
    if (this._state.getCurrentPage() === 'dashboard' && isRealDashboardPage()) {
      setTimeout(() => this._enhanceDashboard(), 200);
    }

    // Injeta estilos inline para undo toast (não está no premium.css)
    this._injectStyles();
  }

  /* ── Enhance dashboard ────────────────────────────────────────────────── */

  _enhanceDashboard() {
    const kpis      = this._storage.getKPIs();
    const leads     = this._storage.getLeads({ includeArchived: false });
    const metrics   = this._storage.getMetrics();
    const tasks     = this._storage.getTasks();
    const users     = this._storage.getUsers();
    const activities = this._storage.getActivities();

    this._enhanceKPICards(kpis, metrics);
    this._renderInsightsRow(kpis, leads, tasks);
    this._replacePipelineWithFunnel(leads);
    this._enhanceActivityFeed(activities);
    this._enhanceTaskList(tasks);
    this._enhanceLeaderboard(users, leads);
    this._enhanceQuotaBar(kpis);
    this._bindKPICardInteractions(kpis, leads);
    this._bindFocusCardInteractions(leads, tasks);

    // Animate all numbers after a brief delay
    setTimeout(() => this._animateAllNumbers(), 100);
  }

  /* ── KPI Cards — enhance existing ones ───────────────────────────────── */

  _enhanceKPICards(kpis, metrics) {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;

    // Compute sparkline data from metrics
    const revData  = (metrics || []).slice(-8).map(m => m.revenue || 0);
    const mrrData  = (metrics || []).slice(-8).map(m => m.mrr || 0);
    const leadData = (metrics || []).slice(-8).map((_, i, arr) =>
      Math.round(20 + Math.sin(i * 0.8) * 8));

    const cardConfigs = [
      {
        id:       'kpi-pipeline',
        title:    'Pipeline Total',
        value:    fmtCompact(kpis.pipelineValue),
        rawValue: kpis.pipelineValue,
        sub:      `Ponderado: ${fmtCompact(kpis.weightedPipeline)}`,
        icon:     this._iconTrend(),
        color:    '#6366f1',
        dataColor:'indigo',
        trend:    '+12%',
        trendDir: 'up',
        sparkData: revData,
      },
      {
        id:       'kpi-won',
        title:    'Receita Fechada',
        value:    fmtCompact(kpis.wonValue),
        rawValue: kpis.wonValue,
        sub:      `${kpis.activeLeads} leads ativos`,
        icon:     this._iconDollar(),
        color:    '#10b981',
        dataColor:'emerald',
        trend:    `${kpis.activeLeads} ativos`,
        trendDir: 'up',
        sparkData: mrrData,
      },
      {
        id:       'kpi-winrate',
        title:    'Win Rate',
        value:    fmtPct(kpis.winRate),
        rawValue: kpis.winRate,
        sub:      `Ticket médio: ${fmtCompact(kpis.avgDealValue)}`,
        icon:     this._iconTarget(),
        color:    '#f59e0b',
        dataColor:'amber',
        trend:    kpis.winRate > 30 ? '+2pts' : '-1pt',
        trendDir: kpis.winRate > 30 ? 'up' : 'down',
        sparkData: leadData,
      },
      {
        id:       'kpi-overdue',
        title:    'Tarefas Vencidas',
        value:    String(kpis.overdueTasks),
        rawValue: kpis.overdueTasks,
        sub:      kpis.overdueTasks > 0 ? 'Atenção imediata' : 'Tudo em dia ✓',
        icon:     this._iconClock(),
        color:    kpis.overdueTasks > 0 ? '#f43f5e' : '#10b981',
        dataColor: kpis.overdueTasks > 0 ? 'rose' : 'emerald',
        trend:    kpis.overdueTasks > 0 ? `${kpis.overdueTasks} pendentes` : 'Zero atrasos',
        trendDir: kpis.overdueTasks > 0 ? 'down' : 'up',
        sparkData: [2,4,3,5,2,1,kpis.overdueTasks],
      },
    ];

    grid.innerHTML = cardConfigs.map(c => `
      <div class="kpi-card" id="${c.id}" data-color="${c.dataColor}"
           style="cursor:pointer"
           title="Clique para detalhes"
           data-tooltip="${c.title}">
        <div class="kpi-card-header">
          <span class="kpi-card-title">${esc(c.title)}</span>
          <div class="kpi-card-icon" style="color:${c.color};background:${c.color}18">
            ${c.icon}
          </div>
        </div>
        <div class="kpi-card-value" data-target="${c.rawValue}" data-format="${c.dataColor === 'indigo' || c.dataColor === 'emerald' ? 'currency' : (c.dataColor === 'amber' ? 'pct' : 'num')}">
          ${c.value}
        </div>
        <div class="kpi-card-footer">
          <span class="kpi-card-sub">${esc(c.sub)}</span>
          <span class="kpi-card-trend kpi-card-trend--${c.trendDir}">
            ${c.trendDir === 'up' ? '↑' : '↓'} ${esc(c.trend)}
          </span>
        </div>
        <div class="kpi-sparkline" aria-hidden="true">
          ${generateSparkline(c.sparkData, c.color, 200, 40)}
        </div>
      </div>
    `).join('');
  }

  /* ── Insights Row (NEW between KPIs and Daily Focus) ─────────────────── */

  _renderInsightsRow(kpis, leads, tasks) {
    // Remove se já existe
    const existing = document.getElementById('insights-row');
    if (existing) existing.remove();

    const activeLeads = leads.filter(l => !['won','lost'].includes(l.stage));
    const wonLeads    = leads.filter(l => l.stage === 'won');
    const hotLeads    = leads.filter(l => (l.heatScore || 0) >= 80);

    const avgDaysInPipeline = activeLeads.length > 0
      ? Math.round(activeLeads.reduce((acc, l) => {
          const days = Math.floor((Date.now() - new Date(l.createdAt)) / 86400000);
          return acc + days;
        }, 0) / activeLeads.length)
      : 0;

    const conversion = leads.length > 0 ? Math.round((wonLeads.length / leads.length) * 100) : 0;

    const doneTasks   = tasks.filter(t => t.status === 'done').length;
    const totalTasks  = tasks.length;
    const taskRate    = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const insights = [
      {
        label: 'Leads Quentes',
        value: hotLeads.length,
        sub: 'Score acima de 80',
        delta: hotLeads.length > 0 ? `${hotLeads.length} prioritários` : 'Nenhum no momento',
        deltaDir: hotLeads.length > 0 ? 'up' : 'flat',
        color: '#f59e0b',
        nav: 'leads',
      },
      {
        label: 'Ciclo Médio',
        value: `${avgDaysInPipeline}d`,
        sub: 'Dias no pipeline',
        delta: avgDaysInPipeline < 30 ? 'Dentro da meta' : 'Acima do ideal',
        deltaDir: avgDaysInPipeline < 30 ? 'up' : 'down',
        color: '#818cf8',
        nav: 'pipeline',
      },
      {
        label: 'Conversão',
        value: `${conversion}%`,
        sub: `${wonLeads.length} de ${leads.length} leads`,
        delta: conversion > 20 ? 'Acima da média' : 'Pode melhorar',
        deltaDir: conversion > 20 ? 'up' : 'down',
        color: '#34d399',
        nav: 'analytics',
      },
    ];

    const insightsSection = document.createElement('div');
    insightsSection.id = 'insights-row';
    insightsSection.className = 'insights-grid';

    insightsSection.innerHTML = insights.map((ins, i) => `
      <div class="insight-card stagger-item" style="animation-delay:${i * 60}ms" data-nav="${ins.nav}" role="button" tabindex="0" aria-label="${ins.label}: ${ins.value}">
        <div class="insight-card-label">
          <span style="width:6px;height:6px;border-radius:50%;background:${ins.color};display:inline-block;flex-shrink:0"></span>
          ${esc(ins.label)}
        </div>
        <div class="insight-card-value" style="color:${ins.color}">${esc(ins.value)}</div>
        <div class="insight-card-sub">
          <span>${esc(ins.sub)}</span>
          <span class="insight-delta insight-delta--${ins.deltaDir}">
            ${ins.deltaDir === 'up' ? '↑' : ins.deltaDir === 'down' ? '↓' : '→'} ${esc(ins.delta)}
          </span>
        </div>
      </div>
    `).join('');

    // Bind click navigation
    insightsSection.querySelectorAll('[data-nav]').forEach(card => {
      const handler = () => this._state.navigate(card.dataset.nav);
      card.addEventListener('click', handler);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    });

    // Insert before daily-focus-section
    const focusSection = document.getElementById('daily-focus-section');
    if (focusSection) focusSection.before(insightsSection);
    else {
      const pageHeader = document.querySelector('#page-dashboard .page-header');
      if (pageHeader) pageHeader.after(insightsSection);
    }
  }


  /* ── Replace pipeline donut with interactive funnel bars ─────────────── */

  _replacePipelineWithFunnel(leads) {
    const card = document.getElementById('chart-pipeline-card');
    if (!card) return;

    const STAGES = [
      { id: 'new',         label: 'Novo Lead',   color: '#6366f1' },
      { id: 'qualified',   label: 'Qualificado', color: '#0ea5e9' },
      { id: 'proposal',    label: 'Proposta',    color: '#f59e0b' },
      { id: 'negotiation', label: 'Negociação',  color: '#8b5cf6' },
      { id: 'won',         label: 'Fechado',      color: '#10b981' },
    ];

    const counts = {};
    const values = {};
    STAGES.forEach(s => { counts[s.id] = 0; values[s.id] = 0; });
    leads.forEach(l => {
      if (counts[l.stage] !== undefined) {
        counts[l.stage]++;
        values[l.stage] += l.dealValue || 0;
      }
    });

    const maxCount = Math.max(...STAGES.map(s => counts[s.id]), 1);
    const totalActive = leads.filter(l => !['lost'].includes(l.stage)).length || 1;

    card.innerHTML = `
      <div class="chart-card-header">
        <div>
          <h2 class="chart-card-title">Funil de Vendas</h2>
          <p class="chart-card-sub">Leads por estágio · ${esc(fmtNum(totalActive))} ativos</p>
        </div>
        <button class="btn btn-ghost btn-xs" id="pipeline-view-btn" data-tooltip="Ver pipeline completo">
          Ver tudo →
        </button>
      </div>
      <div class="pipeline-funnel" id="pipeline-funnel-wrap">
        ${STAGES.map(s => {
          const pct = Math.round((counts[s.id] / maxCount) * 100);
          const convPct = Math.round((counts[s.id] / totalActive) * 100);
          return `
            <div class="funnel-stage" data-stage="${s.id}" tabindex="0" role="button"
                 aria-label="${s.label}: ${counts[s.id]} leads, ${fmtCompact(values[s.id])}">
              <span class="funnel-stage-label">${esc(s.label)}</span>
              <div class="funnel-bar-track">
                <div class="funnel-bar-fill" style="width:0%;background:${s.color}" data-target-width="${pct}%"></div>
              </div>
              <span class="funnel-stage-count">${counts[s.id]}</span>
              <span class="funnel-stage-value">${fmtCompact(values[s.id])}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind navigation
    card.querySelector('#pipeline-view-btn')?.addEventListener('click',
      () => this._state.navigate('pipeline'));

    card.querySelectorAll('.funnel-stage').forEach(row => {
      const handler = () => this._state.navigate('pipeline');
      row.addEventListener('click', handler);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
    });

    // Animate bars after paint
    requestAnimationFrame(() => {
      setTimeout(() => {
        card.querySelectorAll('.funnel-bar-fill').forEach(bar => {
          bar.style.transition = 'width 0.9s cubic-bezier(0.16, 1, 0.3, 1)';
          bar.style.width = bar.dataset.targetWidth;
        });
      }, 120);
    });
  }

  /* ── Enhanced Activity Feed ───────────────────────────────────────────── */

  _enhanceActivityFeed(activities) {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    const items = (activities || []).slice(0, 10);

    const ACT_CONFIG = {
      call:           { icon: '📞', bg: 'rgba(56,189,248,0.1)',   color: '#38bdf8', label: 'Chamada' },
      email:          { icon: '✉️',  bg: 'rgba(99,102,241,0.1)',   color: '#818cf8', label: 'Email' },
      meeting:        { icon: '🤝', bg: 'rgba(52,211,153,0.1)',   color: '#34d399', label: 'Reunião' },
      demo:           { icon: '🖥️',  bg: 'rgba(139,92,246,0.1)',   color: '#a78bfa', label: 'Demo' },
      proposal_sent:  { icon: '📄', bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24', label: 'Proposta' },
      follow_up:      { icon: '🔔', bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24', label: 'Follow-up' },
      whatsapp:       { icon: '💬', bg: 'rgba(52,211,153,0.1)',   color: '#34d399', label: 'WhatsApp' },
      linkedin:       { icon: '🔗', bg: 'rgba(56,189,248,0.1)',   color: '#38bdf8', label: 'LinkedIn' },
      note:           { icon: '📝', bg: 'rgba(161,161,170,0.1)',  color: '#a1a1aa', label: 'Nota' },
      task_completed: { icon: '✅', bg: 'rgba(52,211,153,0.12)',  color: '#34d399', label: 'Concluído' },
      deal_won:       { icon: '🎉', bg: 'rgba(52,211,153,0.15)',  color: '#34d399', label: 'Fechado' },
      new_lead:       { icon: '👤', bg: 'rgba(99,102,241,0.12)',  color: '#818cf8', label: 'Novo Lead' },
    };

    if (items.length === 0) {
      feed.innerHTML = `
        <div class="feed-empty">
          <div class="feed-empty-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div class="feed-empty-title">Nenhuma atividade ainda</div>
          <div class="feed-empty-sub">As atividades aparecerão aqui conforme você usa o CRM.</div>
        </div>
      `;
      return;
    }

    feed.innerHTML = items.map((a, i) => {
      const cfg = ACT_CONFIG[a.type] || ACT_CONFIG.note;
      const time = window.formatRelativeTime ? formatRelativeTime(a.time) : '—';
      return `
        <div class="feed-item stagger-item" style="animation-delay:${i * 30}ms">
          <div class="feed-item-icon-wrap" style="background:${cfg.bg};" aria-hidden="true">
            ${cfg.icon}
          </div>
          <div class="feed-item-body">
            <div class="feed-item-title">${esc(a.title)}: <strong style="color:var(--color-text-primary)">${esc(a.meta)}</strong></div>
            <div class="feed-item-meta">
              <span>${esc(a.owner)}</span>
              <span class="feed-item-badge">${cfg.label}</span>
            </div>
          </div>
          <div class="feed-item-time">${esc(time)}</div>
        </div>
      `;
    }).join('');
  }

  /* ── Enhanced Task List ───────────────────────────────────────────────── */

  _enhanceTaskList(tasks) {
    const list = document.getElementById('dash-task-list');
    if (!list) return;

    const now = new Date();
    const pending = tasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9);
      })
      .slice(0, 6);

    if (pending.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" style="color:var(--emerald-400);background:rgba(52,211,153,0.08)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div class="empty-state-title">Tudo em dia!</div>
          <div class="empty-state-sub">Nenhuma tarefa pendente no momento.</div>
        </div>
      `;
      return;
    }

    const PRI = {
      urgent: { label: 'Urgente', color: '#f43f5e' },
      high:   { label: 'Alta',    color: '#f59e0b' },
      medium: { label: 'Média',   color: '#0ea5e9' },
      low:    { label: 'Baixa',   color: '#71717a' },
    };

    list.innerHTML = pending.map((t, i) => {
      const pri = PRI[t.priority] || PRI.medium;
      const isOverdue = t.status === 'overdue' ||
        (t.status === 'pending' && t.dueDate && new Date(t.dueDate) < now);
      const dueText = window.formatDate ? formatDate(t.dueDate) : (t.dueDate || '—');
      return `
        <div class="task-item stagger-item ${isOverdue ? 'task-item--overdue' : ''}"
             style="animation-delay:${i * 35}ms;display:flex;align-items:flex-start;gap:12px;padding:10px 20px;cursor:pointer;border-left:2px solid transparent;transition:all 0.15s">
          <button class="task-check-btn" data-task-id="${esc(t.id)}" aria-label="Concluir: ${esc(t.title)}"></button>
          <div class="task-item-body" style="flex:1;min-width:0">
            <div class="task-item-title">${esc(t.title)}</div>
            <div class="task-item-meta">
              <span class="task-item-company">${esc(t.company || '')}</span>
              ${t.company ? '<span class="task-item-sep">·</span>' : ''}
              <span class="task-item-due ${isOverdue ? 'task-item-due--overdue' : ''}">${esc(dueText)}</span>
            </div>
          </div>
          <span class="task-priority-badge" style="color:${pri.color};background:${pri.color}1a">
            ${esc(pri.label)}
          </span>
        </div>
      `;
    }).join('');

    // Bind check buttons with animation
    list.querySelectorAll('.task-check-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const taskId = btn.dataset.taskId;
        const item   = btn.closest('.task-item');

        // Visual: mark done
        if (item) {
          btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`;
          btn.style.background = 'var(--emerald-500)';
          btn.style.borderColor = 'var(--emerald-500)';
          btn.style.color = 'white';
          item.style.transition = 'opacity 0.4s, transform 0.4s';
          item.style.opacity    = '0.4';
          item.style.transform  = 'translateX(8px)';
        }

        await Promise.resolve(this._state.completeTask(taskId));
        await new Promise(r => setTimeout(r, 300));

        const updatedTasks = this._storage.getTasks();
        this._enhanceTaskList(updatedTasks);
        showUndoToast('Tarefa marcada como concluída', () => {
          this._storage.updateTask?.(taskId, { status: 'pending' });
          const tasks2 = this._storage.getTasks();
          this._enhanceTaskList(tasks2);
        });
      });

      // Hover effect on row
      const row = btn.closest('.task-item');
      if (row) {
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.025)'; row.style.borderLeftColor = 'var(--indigo-500)'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; row.style.borderLeftColor = 'transparent'; });
      }
    });
  }

  /* ── Enhanced Leaderboard ─────────────────────────────────────────────── */

  _enhanceLeaderboard(users, leads) {
    const list = document.getElementById('leaderboard-list');
    if (!list || !users.length) return;

    const wonLeads = leads.filter(l => l.stage === 'won');
    const rankings = users.map(u => {
      const userWon  = wonLeads.filter(l => l.owner === u.id);
      const wonValue = userWon.reduce((s, l) => s + (l.dealValue || 0), 0);
      const progress = Math.min(Math.round((wonValue / (u.quota || 1)) * 100), 100);
      const activeDeals = leads.filter(l => l.owner === u.id && !['won','lost'].includes(l.stage)).length;
      return { ...u, wonValue, progress, dealsWon: userWon.length, activeDeals };
    }).sort((a, b) => b.wonValue - a.wonValue);

    const rankIcons  = ['🥇', '🥈', '🥉'];
    const rankColors = ['#fbbf24', '#94a3b8', '#b45309'];

    list.innerHTML = rankings.map((u, i) => `
      <div class="leaderboard-item stagger-item" style="animation-delay:${i * 50}ms">
        <span class="leaderboard-rank" style="${i < 3 ? `color:${rankColors[i]};font-size:16px` : ''}">
          ${i < 3 ? rankIcons[i] : `#${i+1}`}
        </span>
        <div class="leaderboard-avatar" style="background:${u.color}22;color:${u.color}">
          ${esc(u.initials)}
        </div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${esc(u.name)}</div>
          <div class="leaderboard-won" style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--color-text-disabled)">${u.dealsWon} fechados</span>
            <span style="color:var(--color-text-disabled);font-size:10px">·</span>
            <span style="color:var(--color-text-disabled)">${u.activeDeals} ativos</span>
          </div>
          <div class="leaderboard-progress-track">
            <div class="leaderboard-progress-fill" data-width="${u.progress}" style="width:0%;background:${u.color}"></div>
          </div>
        </div>
        <div class="leaderboard-value" style="text-align:right">
          <div style="color:var(--emerald-400);font-weight:700;font-size:var(--text-sm)">${fmtCompact(u.wonValue)}</div>
          <div class="leaderboard-pct">${u.progress}% da meta</div>
        </div>
      </div>
    `).join('');

    // Animate progress bars
    requestAnimationFrame(() => {
      setTimeout(() => {
        list.querySelectorAll('.leaderboard-progress-fill').forEach(bar => {
          bar.style.transition = 'width 1s cubic-bezier(0.16, 1, 0.3, 1)';
          bar.style.width = `${bar.dataset.width}%`;
        });
      }, 200);
    });
  }

  /* ── Enhanced Quota Bar ───────────────────────────────────────────────── */

  _enhanceQuotaBar(kpis) {
    const wrap = document.getElementById('quota-bar-wrap');
    if (!wrap || !kpis?.goals?.revenue) return;

    const { target, current } = kpis.goals.revenue;
    const pct = Math.min(Math.round((current / target) * 100), 100);

    // Add milestone labels
    const existingMilestones = wrap.querySelector('.quota-milestones');
    if (!existingMilestones) {
      const milestonesEl = document.createElement('div');
      milestonesEl.className = 'quota-milestones';
      milestonesEl.innerHTML = [25, 50, 75, 100].map(m => `
        <div class="quota-milestone" style="left:${m}%">
          <div class="quota-milestone-label">${m}%</div>
        </div>
      `).join('');
      wrap.appendChild(milestonesEl);
    }

    // Color based on progress
    const fill = document.getElementById('quota-fill');
    if (fill) {
      fill.style.background = pct >= 80
        ? 'linear-gradient(90deg, #059669, #10b981, #34d399)'
        : pct >= 50
        ? 'linear-gradient(90deg, #4f46e5, #6366f1, #818cf8)'
        : 'linear-gradient(90deg, #b45309, #f59e0b, #fbbf24)';
    }

    // Add status indicator
    const pctEl = document.getElementById('quota-pct');
    if (pctEl) {
      const status = pct >= 80 ? '🚀 Excelente!' : pct >= 50 ? '📈 No caminho' : '⚠️ Atenção';
      pctEl.title = status;
    }
  }

  /* ── Animate all numbers ─────────────────────────────────────────────── */

  _animateAllNumbers() {
    // KPI values
    document.querySelectorAll('.kpi-card-value[data-target]').forEach(el => {
      // Only numbers (skip currency strings already formatted)
      const format = el.dataset.format;
      // Skip pure text values
      const rawTarget = parseFloat(el.dataset.target);
      if (isNaN(rawTarget)) return;

      let fmt;
      if (format === 'currency') fmt = v => fmtCompact(v);
      else if (format === 'pct')  fmt = v => `${Math.round(v)}%`;
      else                         fmt = v => String(Math.round(v));

      el.classList.add('count-up');
      animateNumber(el, 0, rawTarget, 900, fmt);
    });

    // Insight values
    document.querySelectorAll('.insight-card-value').forEach(el => {
      el.classList.add('count-up');
    });
  }

  /* ── Bind KPI card interactions ──────────────────────────────────────── */

  _bindKPICardInteractions(kpis, leads) {
    const navMap = {
      'kpi-pipeline': 'pipeline',
      'kpi-won':      'analytics',
      'kpi-winrate':  'analytics',
      'kpi-overdue':  'tasks',
    };
    Object.entries(navMap).forEach(([id, page]) => {
      const card = document.getElementById(id);
      if (card) {
        card.addEventListener('click', () => this._state.navigate(page));
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          window._ibexContextMenu.show(e.clientX, e.clientY, [
            {
              icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
              label: 'Ver detalhes',
              action: () => this._state.navigate(page),
            },
            {
              icon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
              label: 'Filtrar por período',
              action: () => {},
            },
          ]);
        });
      }
    });
  }

  /* ── Bind Focus Card interactions ────────────────────────────────────── */

  _bindFocusCardInteractions(leads, tasks) {
    // Add arrow icons to focus cards
    document.querySelectorAll('.focus-card').forEach(card => {
      if (!card.querySelector('.focus-arrow')) {
        const arrow = document.createElement('span');
        arrow.className = 'focus-arrow';
        arrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        card.appendChild(arrow);
      }
    });
  }

  /* ── Inject extra inline styles ──────────────────────────────────────── */

  _injectStyles() {
    if (document.getElementById('ibex-premium-inline')) return;
    const style = document.createElement('style');
    style.id = 'ibex-premium-inline';
    style.textContent = `
      /* Undo toast */
      .undo-toast {
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(20px);
        background: rgba(22,22,26,0.97);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 12px 16px;
        display: flex; align-items: center; gap: 12px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        backdrop-filter: blur(20px);
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
        min-width: 280px; max-width: 400px;
        overflow: hidden;
      }
      .undo-toast--show { opacity: 1; transform: translateX(-50%) translateY(0); }
      .undo-toast-msg { font-size: 13px; color: var(--color-text-secondary); flex: 1; }
      .undo-toast-btn {
        font-size: 12px; font-weight: 700;
        color: var(--indigo-400);
        padding: 4px 10px; border-radius: 6px;
        background: rgba(99,102,241,0.12);
        border: 1px solid rgba(99,102,241,0.25);
        cursor: pointer; flex-shrink: 0;
        transition: all 0.15s;
      }
      .undo-toast-btn:hover { background: rgba(99,102,241,0.2); }
      .undo-toast-progress {
        position: absolute; bottom: 0; left: 0;
        height: 2px; width: 100%;
        background: rgba(99,102,241,0.4);
        border-radius: 0 0 12px 12px;
      }

      /* KPI sparkline positioning */
      .kpi-card { position: relative; }
      .kpi-sparkline {
        position: absolute;
        bottom: 0; left: 0; right: 0; height: 50px;
        pointer-events: none; opacity: 0.12;
      }

      /* Row hover feedback */
      tr[data-lead-id]:hover { background: rgba(255,255,255,0.025) !important; cursor: pointer; }

      /* Focus card enhanced hover */
      .focus-card:hover .focus-action-hint {
        color: var(--indigo-300);
      }

      /* Chart period btn active */
      .period-btn { border-radius: 6px; font-size: 11px; font-weight: 700;
        letter-spacing: 0.05em; padding: 4px 10px;
        color: var(--color-text-tertiary);
        transition: all 0.15s;
      }
      .period-btn:hover { color: var(--color-text-secondary); background: rgba(255,255,255,0.05); }
      .period-btn.active { color: var(--color-text-primary); background: rgba(255,255,255,0.08); box-shadow: 0 1px 3px rgba(0,0,0,0.3); }

      /* Topbar search: minimum width on small screens */
      @media (max-width: 768px) {
        .topbar-search-btn { min-width: 40px; }
        .topbar-search-label { display: none; }
        .topbar-kbd { display: none; }
      }

      /* Leaderboard progress bar */
      .leaderboard-progress-track {
        height: 3px; background: rgba(255,255,255,0.05);
        border-radius: 9999px; overflow: hidden; margin-top: 6px;
      }
      .leaderboard-progress-fill {
        height: 100%; border-radius: 9999px;
        transition: width 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s;
      }

      /* Feed item hover */
      .feed-item { transition: background 0.12s; }
      .feed-item:hover { background: rgba(255,255,255,0.025); }

      /* Insight card keyboard focus */
      .insight-card:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--color-bg-base), 0 0 0 4px var(--indigo-500);
      }

      /* Funnel stage hover */
      .funnel-stage:hover .funnel-stage-label { color: var(--color-text-primary); }
      .funnel-stage:focus-visible { outline: 2px solid var(--indigo-500); border-radius: 6px; }
    `;
    document.head.appendChild(style);
  }

  /* ── SVG Icon helpers ────────────────────────────────────────────────── */

  _iconTrend() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>`;
  }

  _iconDollar() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>`;
  }

  _iconTarget() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>`;
  }

  _iconClock() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL KEYBOARD SHORTCUTS ENHANCEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

class KeyboardShortcutsManager {

  constructor(state) {
    this._state = state;
    this._bind();
  }

  _bind() {
    document.addEventListener('keydown', (e) => {
      // Skip if typing in an input
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.target.isContentEditable) return;

      const key = e.key;
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd + K — search
      if (mod && key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('search-overlay');
        const input   = document.getElementById('search-input');
        if (overlay) {
          overlay.hidden = false;
          overlay.classList.add('search-overlay--open');
          input?.focus();
        }
        return;
      }

      // Escape — close modals/search
      if (key === 'Escape') {
        const overlay = document.getElementById('search-overlay');
        if (overlay && !overlay.hidden) {
          overlay.hidden = true;
          overlay.classList.remove('search-overlay--open');
          return;
        }
        const modal = document.querySelector('.modal-overlay:not([hidden])');
        if (modal) {
          modal.hidden = true;
          return;
        }
        // Close context menu
        window._ibexContextMenu?.hide();
        return;
      }

      // Number shortcuts: 1–6
      if (!mod && !e.altKey && !e.shiftKey) {
        const pageMap = { '1': 'dashboard', '2': 'pipeline', '3': 'leads', '4': 'analytics', '5': 'tasks', '6': 'settings' };
        if (pageMap[key]) {
          e.preventDefault();
          ibexSmartNavigate(this._state, pageMap[key]);
          return;
        }
      }

      // N — new lead
      if (!mod && !e.altKey && key.toLowerCase() === 'n') {
        const btn = document.getElementById('topbar-new-lead-btn') || document.getElementById('new-lead-btn');
        btn?.click();
        return;
      }

      // B — toggle sidebar
      if (!mod && !e.altKey && key.toLowerCase() === 'b') {
        const btn = document.getElementById('sidebar-collapse-btn');
        btn?.click();
        return;
      }

      // ? — show shortcuts help
      if (key === '?' && !mod) {
        this._showShortcutsHelp();
        return;
      }
    });
  }

  _showShortcutsHelp() {
    const existing = document.getElementById('shortcuts-modal');
    if (existing) { existing.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'shortcuts-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9000;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);
    `;
    modal.innerHTML = `
      <div style="
        background:rgba(14,14,17,0.98);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:20px;
        padding:24px;
        min-width:380px;max-width:480px;
        box-shadow:0 40px 80px rgba(0,0,0,0.8);
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <h2 style="font-size:16px;font-weight:700;color:#f8f8f8;letter-spacing:-0.02em">Atalhos de Teclado</h2>
          <button id="shortcuts-close" style="color:#52525b;padding:4px;border-radius:6px;font-size:18px;line-height:1" aria-label="Fechar">✕</button>
        </div>
        <div style="display:grid;gap:6px">
          ${[
            ['Ctrl + K', 'Busca global'],
            ['1 – 6',    'Navegar entre páginas'],
            ['N',        'Novo lead'],
            ['B',        'Recolher/expandir sidebar'],
            ['Esc',      'Fechar modal / overlay'],
            ['?',        'Mostrar atalhos'],
          ].map(([kbd, desc]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.03)">
              <span style="font-size:13px;color:#a1a1aa">${desc}</span>
              <kbd style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 8px;font-size:11px;font-family:monospace;color:#e4e4e7">${kbd}</kbd>
            </div>
          `).join('')}
        </div>
        <p style="font-size:11px;color:#52525b;margin-top:16px;text-align:center">Pressione ? para abrir ou fechar</p>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#shortcuts-close')?.addEventListener('click', () => modal.remove());
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEARCH OVERLAY — ENHANCED
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Rastreamento de "páginas recentes" para o Command Palette. Roda em toda
 * página que carrega dashboard-premium.js (praticamente todas), registrando
 * a visita atual em localStorage. Simples e robusto por não depender de
 * eventos de navegação de um SPA único (a arquitetura é multi-página).
 */
const IBEX_RECENT_PAGES_KEY = 'ibex_recent_pages_v1';

function ibexTrackPageVisit() {
  try {
    const path  = window.location.pathname.split('/').pop() || 'index.html';
    const title = (document.title || '').replace(/^IBEX CRM\s*[—-]\s*/, '').trim() || path;

    let recents = JSON.parse(localStorage.getItem(IBEX_RECENT_PAGES_KEY) || '[]');
    recents = recents.filter(r => r.path !== path);
    recents.unshift({ path, title, time: Date.now() });
    localStorage.setItem(IBEX_RECENT_PAGES_KEY, JSON.stringify(recents.slice(0, 5)));
  } catch { /* localStorage indisponível — não é crítico, apenas sem histórico */ }
}
ibexTrackPageVisit();

function ibexGetRecentPages() {
  try {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    const recents = JSON.parse(localStorage.getItem(IBEX_RECENT_PAGES_KEY) || '[]');
    return recents.filter(r => r.path !== current).slice(0, 4);
  } catch { return []; }
}

/**
 * Catálogo de Ações Rápidas do Command Palette (prefixo ">"). Cada ação
 * define seu próprio `run()` — pode navegar, abrir um modal existente na
 * página atual, ou executar uma função diretamente.
 */
function ibexGetQuickActionsCatalog(state) {
  return [
    {
      id: 'new-lead', icon: '➕', label: 'Criar novo lead',
      run: () => {
        const btn = document.getElementById('topbar-new-lead-btn') || document.getElementById('new-lead-btn');
        if (btn) { btn.click(); } else { window.location.href = 'leads.html'; }
      },
    },
    {
      id: 'new-task', icon: '✅', label: 'Criar nova tarefa',
      run: () => {
        const btn = document.getElementById('new-task-btn') || document.getElementById('topbar-new-task-btn');
        if (btn) { btn.click(); } else { window.location.href = 'tasks.html'; }
      },
    },
    {
      id: 'cycle-theme', icon: '🎨', label: 'Trocar tema',
      run: () => {
        if (!window.IbexThemeEngine) return;
        const themes = window.IbexThemeEngine.getThemes();
        const current = window.IbexThemeEngine.getCurrent();
        const idx = themes.findIndex(t => t.id === current);
        const next = themes[(idx + 1) % themes.length];
        window.IbexThemeEngine.setTheme(next.id);
      },
    },
    {
      id: 'view-report', icon: '📊', label: 'Ver relatório de vendas',
      run: () => ibexSmartNavigate(state, 'analytics'),
    },
    {
      id: 'open-settings', icon: '⚙️', label: 'Abrir configurações',
      run: () => ibexSmartNavigate(state, 'settings'),
    },
    {
      id: 'open-team', icon: '👥', label: 'Ver equipe',
      run: () => { window.location.href = 'team.html'; },
    },
    {
      id: 'open-roles', icon: '🛡️', label: 'Papéis e permissões',
      run: () => { window.location.href = 'roles.html'; },
    },
    {
      id: 'open-integrations', icon: '🔌', label: 'Ver integrações',
      run: () => { window.location.href = 'integrations.html'; },
    },
    {
      id: 'open-pipeline-builder', icon: '🏗️', label: 'Configurar pipelines',
      run: () => { window.location.href = 'pipeline-builder.html'; },
    },
    {
      id: 'show-shortcuts', icon: '⌨️', label: 'Ver atalhos de teclado',
      run: () => window.Ibex?.shortcuts?._showShortcutsHelp?.(),
    },
  ];
}

class SearchOverlayManager {

  constructor(storage, state) {
    this._storage = storage;
    this._state   = state;
    this._selected = 0;
    this._results  = [];
    this._bind();
  }

  _bind() {
    const overlay = document.getElementById('search-overlay');
    const input   = document.getElementById('search-input');
    const backdrop = document.getElementById('search-backdrop');

    if (!overlay || !input) return;

    // Update footer with keyboard hints
    const footer = overlay.querySelector('.search-footer');
    if (footer && !footer.querySelector('.search-footer-hint')) {
      footer.innerHTML = `
        <div class="search-footer-hint">
          <kbd>↑↓</kbd> navegar
        </div>
        <div class="search-footer-hint">
          <kbd>Enter</kbd> abrir
        </div>
        <div class="search-footer-hint">
          <kbd>Esc</kbd> fechar
        </div>
      `;
    }

    // Input search
    input.addEventListener('input', () => {
      this._search(input.value.trim());
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._selected = Math.min(this._selected + 1, this._results.length - 1);
        this._updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._selected = Math.max(this._selected - 1, 0);
        this._updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._activateSelected();
      }
    });

    // Backdrop click
    backdrop?.addEventListener('click', () => {
      overlay.hidden = true;
      overlay.classList.remove('search-overlay--open');
      input.value = '';
    });

    // Initial "quick actions" when empty
    overlay.addEventListener('ibex:searchopen', () => {
      if (!input.value.trim()) this._showQuickActions();
    });
  }

  _search(query) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    if (!query || query.length < 1) {
      this._showQuickActions();
      return;
    }

    // Prefixo ">" — busca apenas nas Ações Rápidas
    if (query.startsWith('>')) {
      this._searchActions(query.slice(1).trim());
      return;
    }

    // Prefixo "#" — busca apenas nas Páginas
    if (query.startsWith('#')) {
      this._searchPages(query.slice(1).trim());
      return;
    }

    const q = query.toLowerCase();
    const leads = (this._storage.getLeads({ includeArchived: false }) || [])
      .filter(l => l.fullName.toLowerCase().includes(q) || l.company.toLowerCase().includes(q) || l.email.toLowerCase().includes(q))
      .slice(0, 5);
    const tasks = (this._storage.getTasks() || [])
      .filter(t => t.title.toLowerCase().includes(q) || (t.company || '').toLowerCase().includes(q))
      .slice(0, 3);

    this._results = [
      ...leads.map(l => ({ type: 'lead',  id: l.id,  title: l.fullName, sub: l.company, nav: 'leads' })),
      ...tasks.map(t => ({ type: 'task',  id: t.id,  title: t.title,    sub: t.company || 'Tarefa', nav: 'tasks' })),
    ];

    const ICONS = {
      lead: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      task: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    };

    if (this._results.length === 0) {
      resultsEl.innerHTML = `
        <div style="padding:32px 20px;text-align:center">
          <div style="font-size:13px;color:var(--color-text-tertiary)">Nenhum resultado para "<strong style="color:var(--color-text-secondary)">${esc(query)}</strong>"</div>
        </div>
      `;
      return;
    }

    resultsEl.innerHTML = `
      ${leads.length ? `<div class="search-section-header">Leads</div>` : ''}
      ${leads.map((l, i) => `
        <div class="search-result-item" data-idx="${i}" data-nav="${'leads'}" role="option">
          <div class="search-result-icon">${ICONS.lead}</div>
          <div class="search-result-main">
            <div class="search-result-title">${esc(l.fullName)}</div>
            <div class="search-result-sub">${esc(l.company)}</div>
          </div>
          <span class="search-result-type">Lead</span>
        </div>
      `).join('')}
      ${tasks.length ? `<div class="search-section-header">Tarefas</div>` : ''}
      ${tasks.map((t, i) => `
        <div class="search-result-item" data-idx="${leads.length + i}" data-nav="tasks" role="option">
          <div class="search-result-icon">${ICONS.task}</div>
          <div class="search-result-main">
            <div class="search-result-title">${esc(t.title)}</div>
            <div class="search-result-sub">${esc(t.company || 'Tarefa')}</div>
          </div>
          <span class="search-result-type">Tarefa</span>
        </div>
      `).join('')}
    `;

    this._bindResultClicks(resultsEl);

    this._selected = 0;
    this._updateSelection();
  }

  _showQuickActions() {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    const pages = [
      { icon: '1', label: 'Dashboard',     page: 'dashboard' },
      { icon: '2', label: 'Pipeline',       page: 'pipeline' },
      { icon: '3', label: 'Leads',          page: 'leads' },
      { icon: '4', label: 'Analytics',      page: 'analytics' },
      { icon: '5', label: 'Tarefas',        page: 'tasks' },
      { icon: '⚙', label: 'Configurações', page: 'settings' },
    ];

    const favoriteLeads = (this._storage.getLeads?.({ includeArchived: false }) || [])
      .filter(l => l.isStarred)
      .slice(0, 4);

    const recentPages = ibexGetRecentPages();

    const actionsPreview = ibexGetQuickActionsCatalog(this._state).slice(0, 4);

    // Monta a lista combinada de resultados navegáveis (usada pelo teclado ↑↓)
    this._results = [
      ...actionsPreview.map(a => ({ type: 'action', id: a.id, title: a.label, sub: 'Ação rápida' })),
      ...favoriteLeads.map(l => ({ type: 'lead', id: l.id, title: l.fullName, sub: l.company, nav: 'leads' })),
      ...recentPages.map(r => ({ type: 'recent', id: r.path, title: r.title, sub: 'Recente' })),
      ...pages.map(a => ({ type: 'nav', id: a.page, title: a.label, sub: 'Navegar', nav: a.page })),
    ];

    let html = '';
    let idx = 0;

    html += `<div class="search-section-header">Ações Rápidas <span style="opacity:.6;font-weight:400">— digite &gt; para ver todas</span></div>`;
    html += actionsPreview.map(a => `
      <div class="search-result-item" data-idx="${idx++}" data-action-id="${a.id}" role="option">
        <div class="search-result-icon" style="font-size:13px">${a.icon}</div>
        <div class="search-result-main"><div class="search-result-title">${esc(a.label)}</div></div>
        <span class="search-result-type">Ação</span>
      </div>
    `).join('');

    if (favoriteLeads.length) {
      html += `<div class="search-section-header">Favoritos</div>`;
      html += favoriteLeads.map(l => `
        <div class="search-result-item" data-idx="${idx++}" data-nav="leads" role="option">
          <div class="search-result-icon">⭐</div>
          <div class="search-result-main">
            <div class="search-result-title">${esc(l.fullName)}</div>
            <div class="search-result-sub">${esc(l.company)}</div>
          </div>
          <span class="search-result-type">Lead</span>
        </div>
      `).join('');
    }

    if (recentPages.length) {
      html += `<div class="search-section-header">Recentes</div>`;
      html += recentPages.map(r => `
        <div class="search-result-item" data-idx="${idx++}" data-page-path="${esc(r.path)}" role="option">
          <div class="search-result-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="search-result-main"><div class="search-result-title">${esc(r.title)}</div></div>
          <span class="search-result-type">Recente</span>
        </div>
      `).join('');
    }

    html += `<div class="search-section-header">Navegar para</div>`;
    html += pages.map(a => `
      <div class="search-result-item" data-idx="${idx++}" data-nav="${a.page}" role="option">
        <div class="search-result-icon" style="font-size:12px;font-weight:700;font-family:monospace;color:var(--color-text-tertiary)">${esc(a.icon)}</div>
        <div class="search-result-main"><div class="search-result-title">${esc(a.label)}</div></div>
        <span class="search-result-type">Página</span>
      </div>
    `).join('');

    resultsEl.innerHTML = html;
    this._bindResultClicks(resultsEl);
    this._selected = 0;
    this._updateSelection();
  }

  /* ── Busca restrita: apenas Ações (prefixo ">") ──────────────────────── */

  _searchActions(query) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    const all = ibexGetQuickActionsCatalog(this._state);
    const q = query.toLowerCase();
    const filtered = q ? all.filter(a => a.label.toLowerCase().includes(q)) : all;

    this._results = filtered.map(a => ({ type: 'action', id: a.id, title: a.label, sub: 'Ação rápida' }));

    resultsEl.innerHTML = filtered.length === 0
      ? `<div style="padding:32px 20px;text-align:center"><div style="font-size:13px;color:var(--color-text-tertiary)">Nenhuma ação encontrada</div></div>`
      : `<div class="search-section-header">Ações Rápidas</div>` + filtered.map((a, i) => `
          <div class="search-result-item" data-idx="${i}" data-action-id="${a.id}" role="option">
            <div class="search-result-icon" style="font-size:13px">${a.icon}</div>
            <div class="search-result-main"><div class="search-result-title">${esc(a.label)}</div></div>
            <span class="search-result-type">Ação</span>
          </div>
        `).join('');

    this._bindResultClicks(resultsEl);
    this._selected = 0;
    this._updateSelection();
  }

  /* ── Busca restrita: apenas Páginas (prefixo "#") ────────────────────── */

  _searchPages(query) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    const pages = [
      { label: 'Dashboard',       page: 'dashboard' },
      { label: 'Pipeline',        page: 'pipeline' },
      { label: 'Pipeline Builder', href: 'pipeline-builder.html' },
      { label: 'Leads',           page: 'leads' },
      { label: 'Analytics',       page: 'analytics' },
      { label: 'Tarefas',         page: 'tasks' },
      { label: 'Equipe',          href: 'team.html' },
      { label: 'Papéis',          href: 'roles.html' },
      { label: 'Integrações',     href: 'integrations.html' },
      { label: 'Configurações',   page: 'settings' },
    ];

    const q = query.toLowerCase();
    const filtered = q ? pages.filter(p => p.label.toLowerCase().includes(q)) : pages;

    this._results = filtered.map(p => ({ type: p.href ? 'href' : 'nav', id: p.page || p.href, title: p.label, sub: 'Página', nav: p.page, href: p.href }));

    resultsEl.innerHTML = filtered.length === 0
      ? `<div style="padding:32px 20px;text-align:center"><div style="font-size:13px;color:var(--color-text-tertiary)">Nenhuma página encontrada</div></div>`
      : `<div class="search-section-header">Páginas</div>` + filtered.map((p, i) => `
          <div class="search-result-item" data-idx="${i}" ${p.href ? `data-href="${esc(p.href)}"` : `data-nav="${p.page}"`} role="option">
            <div class="search-result-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </div>
            <div class="search-result-main"><div class="search-result-title">${esc(p.label)}</div></div>
            <span class="search-result-type">Página</span>
          </div>
        `).join('');

    this._bindResultClicks(resultsEl);
    this._selected = 0;
    this._updateSelection();
  }

  /**
   * Handler unificado de clique para qualquer tipo de resultado renderizado
   * (ação, página via state.navigate, página via URL direta, ou recente).
   * Centralizado aqui para não duplicar a lógica de despacho em 4 métodos
   * de renderização diferentes.
   */
  _bindResultClicks(resultsEl) {
    resultsEl.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => this._activateItem(item));
    });
  }

  _activateItem(item) {
    if (item.dataset.actionId) {
      const action = ibexGetQuickActionsCatalog(this._state).find(a => a.id === item.dataset.actionId);
      this._closeOverlay();
      action?.run?.();
      return;
    }
    if (item.dataset.href) {
      this._closeOverlay();
      window.location.href = item.dataset.href;
      return;
    }
    if (item.dataset.pagePath) {
      this._closeOverlay();
      window.location.href = item.dataset.pagePath;
      return;
    }
    if (item.dataset.nav) {
      ibexSmartNavigate(this._state, item.dataset.nav);
      this._closeOverlay();
    }
  }

  _updateSelection() {
    document.querySelectorAll('.search-result-item').forEach((item, i) => {
      item.setAttribute('aria-selected', i === this._selected ? 'true' : 'false');
      if (i === this._selected) item.scrollIntoView({ block: 'nearest' });
    });
  }

  _activateSelected() {
    const items = document.querySelectorAll('.search-result-item');
    const item  = items[this._selected];
    if (item) this._activateItem(item);
  }

  _closeOverlay() {
    const overlay = document.getElementById('search-overlay');
    const input   = document.getElementById('search-input');
    if (overlay) { overlay.hidden = true; overlay.classList.remove('search-overlay--open'); }
    if (input) input.value = '';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOOTSTRAP
   ═══════════════════════════════════════════════════════════════════════════ */

window.Ibex?.register((app) => {
  // Dashboard premium
  app.dashPremium = new DashboardPremium(app);
  app.dashPremium.init();

  // Keyboard shortcuts
  app.shortcuts = new KeyboardShortcutsManager(app.state);

  // Enhanced search overlay
  app.searchManager = new SearchOverlayManager(app.storage, app.state);

  // Show quick actions on search open
  document.getElementById('topbar-search-btn')?.addEventListener('click', () => {
    const overlay = document.getElementById('search-overlay');
    const input   = document.getElementById('search-input');
    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add('search-overlay--open');
      input?.focus();
      app.searchManager._showQuickActions();
    }
  });

  console.info('[DashboardPremium] Module v2.0 registered.');
});
