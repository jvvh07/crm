/**
 * IBEX CRM — Charts Module
 * Rendering dos gráficos do Dashboard usando Chart.js
 * Depende: Chart.js (CDN), IbexUtils
 * @version 1.0.0
 */

'use strict';

/**
 * BUGFIX (auditoria de segurança): o rótulo de cada estágio do pipeline
 * (`s.label`) é editável livremente pelo usuário via Pipeline Builder
 * (pipeline-builder.js) e era inserido sem escape na legenda do gráfico
 * — uma injeção real e alcançável através de uma funcionalidade legítima.
 */
function escCharts(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────────────────────────────────────────
   GLOBAL CHART DEFAULTS
   ───────────────────────────────────────────────────────────────────────── */

function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.font.family = "'Inter', 'system-ui', sans-serif";
  Chart.defaults.font.size   = 12;
  Chart.defaults.color       = '#a1a1aa';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#18181b';
  Chart.defaults.plugins.tooltip.borderColor     = 'rgba(255,255,255,0.1)';
  Chart.defaults.plugins.tooltip.borderWidth     = 1;
  Chart.defaults.plugins.tooltip.padding         = 12;
  Chart.defaults.plugins.tooltip.titleColor      = '#fafafa';
  Chart.defaults.plugins.tooltip.bodyColor       = '#a1a1aa';
  Chart.defaults.plugins.tooltip.cornerRadius    = 8;
  Chart.defaults.plugins.tooltip.titleFont       = { weight: '600', size: 13 };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CLASS: IbexCharts
   ───────────────────────────────────────────────────────────────────────── */

class IbexCharts {

  constructor() {
    this._charts = new Map();   /* id → Chart instance */
  }

  /* ── Destroy a chart safely ───────────────────────────────────────────── */

  _destroy(id) {
    if (this._charts.has(id)) {
      this._charts.get(id).destroy();
      this._charts.delete(id);
    }
  }

  /* ── Destroy all charts ──────────────────────────────────────────────── */

  destroyAll() {
    this._charts.forEach(c => c.destroy());
    this._charts.clear();
  }

  /* ════════════════════════════════════════════════════════════════════════
     REVENUE CHART — Line/Area (main dashboard chart)
     ════════════════════════════════════════════════════════════════════════ */

  renderRevenue(canvasId, metrics = []) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const labels   = metrics.map(m => m.month);
    const revenue  = metrics.map(m => m.revenue);
    const mrr      = metrics.map(m => m.mrr);

    const ctx = canvas.getContext('2d');

    /* Gradient for revenue fill */
    const gradRevenue = ctx.createLinearGradient(0, 0, 0, 300);
    gradRevenue.addColorStop(0, 'rgba(99,102,241,0.35)');
    gradRevenue.addColorStop(1, 'rgba(99,102,241,0.00)');

    const gradMrr = ctx.createLinearGradient(0, 0, 0, 300);
    gradMrr.addColorStop(0, 'rgba(16,185,129,0.25)');
    gradMrr.addColorStop(1, 'rgba(16,185,129,0.00)');

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label:           'Receita Total',
            data:            revenue,
            borderColor:     '#6366f1',
            backgroundColor: gradRevenue,
            borderWidth:     2.5,
            fill:            true,
            tension:         0.4,
            pointRadius:     0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#6366f1',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
          },
          {
            label:           'MRR',
            data:            mrr,
            borderColor:     '#10b981',
            backgroundColor: gradMrr,
            borderWidth:     2,
            fill:            true,
            tension:         0.4,
            pointRadius:     0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#10b981',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            borderDash:      [5, 3],
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction: {
          mode:      'index',
          intersect: false,
        },
        scales: {
          x: {
            grid:   { display: false },
            ticks:  { color: '#71717a', maxRotation: 0 },
            border: { display: false },
          },
          y: {
            grid:   { color: 'rgba(255,255,255,0.04)', drawBorder: false },
            ticks: {
              color: '#71717a',
              callback: v => window.formatCurrency ? formatCurrency(v, true) : `R$${(v/1000).toFixed(0)}K`,
            },
            border: { display: false },
          },
        },
        plugins: {
          legend:  { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${window.formatCurrency ? formatCurrency(ctx.raw) : ctx.raw}`,
            },
          },
        },
      },
    });

    this._charts.set(canvasId, chart);
    this._renderRevenueLegend(metrics);
    return chart;
  }

  _renderRevenueLegend(metrics) {
    const legendEl = document.getElementById('revenue-legend');
    if (!legendEl) return;

    const last = metrics[metrics.length - 1] || {};
    const prev = metrics[metrics.length - 2] || {};
    const delta = prev.revenue
      ? Math.round(((last.revenue - prev.revenue) / prev.revenue) * 100)
      : 0;

    legendEl.innerHTML = `
      <div class="chart-legend-item">
        <span class="chart-legend-dot" style="background:#6366f1"></span>
        <span class="chart-legend-label">Receita Total</span>
      </div>
      <div class="chart-legend-item">
        <span class="chart-legend-dot" style="background:#10b981;border-style:dashed"></span>
        <span class="chart-legend-label">MRR</span>
      </div>
      ${window.deltaBadge ? deltaBadge(delta) : ''}
    `;
  }

  /* ════════════════════════════════════════════════════════════════════════
     PIPELINE CHART — Doughnut
     ════════════════════════════════════════════════════════════════════════ */

  renderPipeline(canvasId, leads = []) {
    this._destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const stages = window.PIPELINE_STAGES || [];
    const activeStages = stages.filter(s => !['won','lost'].includes(s.id));

    const counts = activeStages.map(s => leads.filter(l => l.stage === s.id).length);
    const values = activeStages.map(s =>
      leads.filter(l => l.stage === s.id).reduce((sum, l) => sum + (l.dealValue || 0), 0)
    );

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: activeStages.map(s => s.label),
        datasets: [{
          data:            counts,
          backgroundColor: activeStages.map(s => s.color + 'cc'),
          borderColor:     activeStages.map(s => s.color),
          borderWidth:     2,
          hoverOffset:     6,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const i = ctx.dataIndex;
                const v = window.formatCurrency ? formatCurrency(values[i], true) : `R$${values[i]}`;
                return ` ${ctx.label}: ${ctx.raw} leads · ${v}`;
              },
            },
          },
        },
      },
    });

    this._charts.set(canvasId, chart);
    this._renderPipelineLegend(activeStages, counts, values);
    return chart;
  }

  _renderPipelineLegend(stages, counts, values) {
    const legendEl = document.getElementById('pipeline-legend');
    if (!legendEl) return;

    const total = counts.reduce((a, b) => a + b, 0) || 1;
    legendEl.innerHTML = stages.map((s, i) => {
      const pct = Math.round((counts[i] / total) * 100);
      const val = window.formatCurrency ? formatCurrency(values[i], true) : `R$${values[i]}`;
      return `
        <div class="pipeline-legend-item">
          <span class="pipeline-legend-dot" style="background:${escCharts(s.color)}"></span>
          <span class="pipeline-legend-name">${escCharts(s.label)}</span>
          <span class="pipeline-legend-count">${counts[i]}</span>
          <span class="pipeline-legend-pct">${pct}%</span>
        </div>
      `;
    }).join('');
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   BOOTSTRAP
   ───────────────────────────────────────────────────────────────────────── */

window.IbexCharts = IbexCharts;

/* Register module with the app */
window.Ibex?.register((app) => {
  applyChartDefaults();
  app.charts = new IbexCharts();
  console.info('[IbexCharts] Module registered.');
});
