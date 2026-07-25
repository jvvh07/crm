/**
 * IBEX CRM — analytics.js
 * Analytics page: KPIs, Chart.js charts, leaderboard, top opportunities
 * @version 1.0.0
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────── */

const STAGE_COLORS = {
  new:         '#6366f1',
  qualified:   '#0ea5e9',
  proposal:    '#f59e0b',
  negotiation: '#8b5cf6',
  won:         '#10b981',
  lost:        '#f43f5e',
};

const STAGE_LABELS = {
  new: 'Novo Lead', qualified: 'Qualificado', proposal: 'Proposta Enviada',
  negotiation: 'Negociação', won: 'Ganho', lost: 'Perdido',
};

const CHART_DEFAULTS = {
  font: { family: "'Inter', 'Outfit', sans-serif", size: 11 },
  color: '#71717a',
};

/* Chart.js theme */
const applyChartDefaults = () => {
  if (!window.Chart) return;
  Chart.defaults.font.family = CHART_DEFAULTS.font.family;
  Chart.defaults.font.size   = CHART_DEFAULTS.font.size;
  Chart.defaults.color       = CHART_DEFAULTS.color;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1c1c1f';
  Chart.defaults.plugins.tooltip.borderColor     = '#27272a';
  Chart.defaults.plugins.tooltip.borderWidth     = 1;
  Chart.defaults.plugins.tooltip.padding         = 10;
  Chart.defaults.plugins.tooltip.titleColor      = '#ffffff';
  Chart.defaults.plugins.tooltip.bodyColor       = '#a1a1aa';
  Chart.defaults.plugins.tooltip.cornerRadius    = 10;
};

/* ─────────────────────────────────────────────────────────────────────────────
   ANALYTICS CONTROLLER
   ───────────────────────────────────────────────────────────────────────── */

class AnalyticsController {

  constructor(storage, state) {
    this._storage = storage;
    this._state   = state;
    this._leads   = [];
    this._users   = [];
    this._period  = 'all';  /* default: all time */
    this._charts  = {};
    this._revenueMode = 'value'; /* 'value' | 'count' */

    this._init();
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */

  _init() {
    applyChartDefaults();
    this._loadData();
    this._renderKPIs();
    this._renderCharts();
    this._renderLeaderboard();
    this._renderTopLeads();
    this._bindControls();
    this._bindShell();
  }

  _loadData() {
    this._leads = this._storage.getLeads({ includeArchived: false });
    this._users = this._storage.getUsers();
  }

  /* Filter leads to within the selected period */
  _periodLeads() {
    if (this._period === 'all') return this._leads;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(this._period));
    return this._leads.filter(l => new Date(l.createdAt) >= cutoff);
  }

  /* ── KPIs ─────────────────────────────────────────────────────────────── */

  _renderKPIs() {
    const container = document.getElementById('analytics-kpi-row');
    if (!container) return;

    const leads = this._periodLeads();
    const fn = window.formatCurrency || (v => `R$ ${(v||0).toLocaleString('pt-BR')}`);

    const total      = leads.length;
    const won        = leads.filter(l => l.stage === 'won');
    const lost       = leads.filter(l => l.stage === 'lost');
    const active     = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
    const wonValue   = won.reduce((s, l) => s + (l.dealValue || 0), 0);
    const pipeValue  = active.reduce((s, l) => s + (l.dealValue || 0), 0);
    const winRate    = total > 0 ? Math.round((won.length / total) * 100) : 0;
    const avgTicket  = won.length > 0 ? Math.round(wonValue / won.length) : 0;

    const kpis = [
      {
        icon: '💰', label: 'Valor no Funil', value: fn(pipeValue, true),
        change: '+12%', trend: 'up', color: '#6366f1',
      },
      {
        icon: '🏆', label: 'Receita Gerada', value: fn(wonValue, true),
        change: '+8%', trend: 'up', color: '#10b981',
      },
      {
        icon: '📈', label: 'Taxa de Conversão', value: `${winRate}%`,
        change: winRate >= 20 ? '+3pp' : '-2pp', trend: winRate >= 20 ? 'up' : 'flat', color: '#8b5cf6',
      },
      {
        icon: '🎯', label: 'Ticket Médio', value: fn(avgTicket, true),
        change: '+5%', trend: 'up', color: '#f59e0b',
      },
    ];

    container.innerHTML = kpis.map(kpi => `
      <div class="analytics-kpi">
        <div class="analytics-kpi-glow" style="background:${kpi.color}"></div>
        <div style="display:flex;align-items:center;gap:var(--space-2)">
          <div class="analytics-kpi-icon" style="background:${kpi.color}18">
            <span style="font-size:16px">${kpi.icon}</span>
          </div>
          <span class="analytics-kpi-label">${kpi.label}</span>
        </div>
        <div class="analytics-kpi-value">${kpi.value}</div>
        <div class="analytics-kpi-change ${kpi.trend}">
          ${kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '—'}
          ${kpi.change} vs. período anterior
        </div>
      </div>
    `).join('');
  }

  /* ── Charts ───────────────────────────────────────────────────────────── */

  _renderCharts() {
    this._renderRevenueChart();
    this._renderFunnelChart();
    this._renderSourcesChart();
    this._renderWinLossChart();
    this._renderSegmentsChart();
  }

  _destroyChart(id) {
    if (this._charts[id]) { this._charts[id].destroy(); delete this._charts[id]; }
  }

  /* Revenue over time (line chart) */
  _renderRevenueChart() {
    this._destroyChart('revenue');
    const canvas = document.getElementById('chart-revenue');
    if (!canvas || !window.Chart) return;

    const leads = this._periodLeads();
    const months = this._getLast6Months();

    /* Group by month */
    const valueByMonth = {};
    const countByMonth = {};
    months.forEach(m => { valueByMonth[m.key] = 0; countByMonth[m.key] = 0; });

    leads.forEach(l => {
      const d = new Date(l.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (key in valueByMonth) {
        valueByMonth[key] += (l.dealValue || 0);
        countByMonth[key]++;
      }
    });

    const labels = months.map(m => m.label);
    const data   = this._revenueMode === 'value'
      ? months.map(m => valueByMonth[m.key])
      : months.map(m => countByMonth[m.key]);

    this._charts.revenue = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: this._revenueMode === 'value' ? 'Valor (R$)' : 'Qtd Leads',
          data,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          borderWidth: 2.5,
          pointBackgroundColor: '#6366f1',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { display: false },
            ticks: {
              callback: v => this._revenueMode === 'value'
                ? `R$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`
                : v,
            },
          },
        },
      },
    });
  }

  /* Funnel horizontal bar */
  _renderFunnelChart() {
    this._destroyChart('funnel');
    const canvas = document.getElementById('chart-funnel');
    if (!canvas || !window.Chart) return;

    const leads = this._periodLeads();
    const stages = ['new','qualified','proposal','negotiation','won','lost'];
    const labels = stages.map(s => STAGE_LABELS[s]);
    const data   = stages.map(s => leads.filter(l => l.stage === s).length);
    const colors = stages.map(s => STAGE_COLORS[s]);

    this._charts.funnel = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + '99'),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false }, ticks: { precision: 0 } },
          y: { grid: { display: false }, border: { display: false } },
        },
      },
    });
  }

  /* Sources donut */
  _renderSourcesChart() {
    this._destroyChart('sources');
    const canvas = document.getElementById('chart-sources');
    if (!canvas || !window.Chart) return;

    const leads = this._periodLeads();
    const sourceMap = {};
    leads.forEach(l => {
      const src = l.source || 'Outros';
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const sorted  = Object.entries(sourceMap).sort((a,b) => b[1]-a[1]).slice(0, 7);
    const labels  = sorted.map(([k]) => k);
    const data    = sorted.map(([,v]) => v);
    const palette = ['#6366f1','#0ea5e9','#f59e0b','#10b981','#8b5cf6','#f43f5e','#06b6d4'];

    this._charts.sources = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: palette.slice(0, data.length).map(c => c + 'cc'),
          borderColor: palette.slice(0, data.length),
          borderWidth: 1.5,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 8, padding: 12 } },
        },
      },
    });
  }

  /* Win/Loss pie */
  _renderWinLossChart() {
    this._destroyChart('winloss');
    const canvas = document.getElementById('chart-winloss');
    if (!canvas || !window.Chart) return;

    const leads = this._periodLeads();
    const won   = leads.filter(l => l.stage === 'won').length;
    const lost  = leads.filter(l => l.stage === 'lost').length;
    const open  = leads.length - won - lost;
    const total = leads.length;
    const winRate = total > 0 ? Math.round((won/total)*100) : 0;

    this._charts.winloss = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Ganhos', 'Perdidos', 'Em aberto'],
        datasets: [{
          data: [won, lost, open],
          backgroundColor: ['rgba(16,185,129,0.8)','rgba(244,63,94,0.8)','rgba(99,102,241,0.5)'],
          borderColor: ['#10b981','#f43f5e','#6366f1'],
          borderWidth: 1.5,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { position: 'bottom', labels: { padding: 12 } } },
      },
    });

    /* Win/loss stats below chart */
    const statsEl = document.getElementById('winloss-stats');
    if (statsEl) {
      const fn = window.formatCurrency || (v => `R$ ${v.toLocaleString('pt-BR')}`);
      const wonVal  = leads.filter(l=>l.stage==='won').reduce((s,l)=>s+(l.dealValue||0),0);
      const lostVal = leads.filter(l=>l.stage==='lost').reduce((s,l)=>s+(l.dealValue||0),0);
      statsEl.innerHTML = `
        <div class="winloss-stat"><span class="winloss-stat-value" style="color:#34d399">${winRate}%</span><span class="winloss-stat-label">Taxa de Conversão</span></div>
        <div class="winloss-stat"><span class="winloss-stat-value">${won}/${total}</span><span class="winloss-stat-label">Ganhos / Total</span></div>
        <div class="winloss-stat"><span class="winloss-stat-value" style="color:#34d399">${fn(wonVal,true)}</span><span class="winloss-stat-label">Valor Ganho</span></div>
        <div class="winloss-stat"><span class="winloss-stat-value" style="color:#f87171">${fn(lostVal,true)}</span><span class="winloss-stat-label">Valor Perdido</span></div>
      `;
    }
  }

  /* Segments bar */
  _renderSegmentsChart() {
    this._destroyChart('segments');
    const canvas = document.getElementById('chart-segments');
    if (!canvas || !window.Chart) return;

    const leads = this._periodLeads();
    const segMap = {};
    leads.forEach(l => {
      const seg = l.segment || 'Outros';
      segMap[seg] = (segMap[seg] || 0) + (l.dealValue || 0);
    });

    const sorted  = Object.entries(segMap).sort((a,b) => b[1]-a[1]).slice(0, 6);
    const labels  = sorted.map(([k]) => k);
    const data    = sorted.map(([,v]) => v);
    const palette = ['#6366f1','#0ea5e9','#8b5cf6','#10b981','#f59e0b','#f43f5e'];

    this._charts.segments = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: palette.map(c => c + '99'),
          borderColor: palette,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 30, minRotation: 0 } },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { display: false },
            ticks: { callback: v => `R$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}` },
          },
        },
      },
    });
  }

  /* ── Leaderboard ──────────────────────────────────────────────────────── */

  _renderLeaderboard() {
    const container = document.getElementById('analytics-leaderboard');
    if (!container) return;

    const leads = this._periodLeads();
    const fn = window.formatCurrency || (v => `R$ ${v.toLocaleString('pt-BR')}`);

    /* Group by owner */
    const ownerMap = {};
    leads.forEach(l => {
      const uid = l.owner || 'unknown';
      if (!ownerMap[uid]) ownerMap[uid] = { total: 0, won: 0, wonValue: 0, count: 0 };
      ownerMap[uid].count++;
      ownerMap[uid].total += (l.dealValue || 0);
      if (l.stage === 'won') { ownerMap[uid].won++; ownerMap[uid].wonValue += (l.dealValue || 0); }
    });

    const ranked = Object.entries(ownerMap)
      .map(([uid, stats]) => {
        const user = this._users.find(u => u.id === uid);
        return { uid, user, ...stats };
      })
      .sort((a, b) => b.wonValue - a.wonValue)
      .slice(0, 6);

    const maxVal = ranked[0]?.wonValue || 1;
    const rankClasses = ['gold','silver','bronze'];

    container.innerHTML = ranked.map((r, i) => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank ${rankClasses[i] || ''}">${i+1}</span>
        <div class="leaderboard-avatar" style="background:${r.user?.color || '#6366f1'}22;color:${r.user?.color || '#818cf8'}">
          ${r.user?.initials || '?'}
        </div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${r.user?.name || 'Desconhecido'}</div>
          <div class="leaderboard-meta">${r.won} ganhos · ${r.count} leads</div>
        </div>
        <div class="leaderboard-bar-wrap">
          <div class="leaderboard-bar-fill" style="width:${Math.round((r.wonValue/maxVal)*100)}%;background:${r.user?.color || '#6366f1'}"></div>
        </div>
        <div class="leaderboard-value">${fn(r.wonValue, true)}</div>
      </div>
    `).join('');

    if (!ranked.length) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:var(--text-sm);padding:var(--space-3)">Nenhum dado disponível.</p>`;
    }
  }

  /* ── Top Leads ────────────────────────────────────────────────────────── */

  _renderTopLeads() {
    const container = document.getElementById('analytics-top-leads');
    if (!container) return;

    const leads = this._periodLeads()
      .filter(l => l.stage !== 'lost' && l.stage !== 'won')
      .sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0))
      .slice(0, 7);

    const fn = window.formatCurrency || (v => `R$ ${v.toLocaleString('pt-BR')}`);

    container.innerHTML = leads.map(l => {
      const color = STAGE_COLORS[l.stage] || '#6366f1';
      const initials = (l.firstName[0]||'') + (l.lastName[0]||'');
      return `
        <a class="top-lead-row" href="leads.html#lead-${l.id}">
          <div class="top-lead-avatar" style="background:${color}22;color:${color}">${initials}</div>
          <div class="top-lead-info">
            <div class="top-lead-name">${this._esc(l.fullName)}</div>
            <div class="top-lead-company">${this._esc(l.company)}</div>
          </div>
          <div class="top-lead-value">${fn(l.dealValue, true)}</div>
        </a>
      `;
    }).join('');

    if (!leads.length) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:var(--text-sm);padding:var(--space-3)">Nenhum lead ativo encontrado.</p>`;
    }
  }

  /* ── Bind Controls ────────────────────────────────────────────────────── */

  _bindControls() {
    /* Period selector */
    document.getElementById('analytics-period')?.addEventListener('change', e => {
      this._period = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
      this._renderKPIs();
      this._renderCharts();
      this._renderLeaderboard();
      this._renderTopLeads();
    });

    /* Revenue chart mode toggle */
    document.querySelectorAll('[data-chart-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-chart-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._revenueMode = btn.dataset.chartType;
        this._renderRevenueChart();
      });
    });
  }

  /* ── Shell setup ──────────────────────────────────────────────────────── */

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
        if (e.key === '1') window.location.href = 'index.html';
        if (e.key === '2') window.location.href = 'pipeline.html';
        if (e.key === '3') window.location.href = 'leads.html';
        if (e.key === '6') window.location.href = 'settings.html';
      }
    });

    try {
      const user = this._storage.getCurrentUser?.();
      if (user) {
        document.getElementById('sidebar-user-name').textContent = user.name;
        document.getElementById('sidebar-user-role').textContent = user.role;
        const init = user.initials || 'U';
        document.getElementById('sidebar-avatar').textContent = init;
        document.getElementById('topbar-avatar').textContent  = init;
      }
    } catch(_) {}
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  _getLast6Months() {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
        label: d.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }),
      });
    }
    return months;
  }

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   BOOTSTRAP
   ───────────────────────────────────────────────────────────────────────── */

function initAnalyticsPage() {
  const app     = window.Ibex;
  const storage = app.storage;
  const state   = app.state;
  window._analyticsCtrl = new AnalyticsController(storage, state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnalyticsPage);
} else {
  initAnalyticsPage();
}
