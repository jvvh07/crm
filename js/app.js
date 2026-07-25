/**
 * IBEX CRM — App Orchestrator
 * Ponto de entrada final — inicializa e conecta todos os módulos
 * Depende: storage.js → state.js → utils.js → charts.js → ui.js
 * @version 1.0.0
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN APP INIT
   ───────────────────────────────────────────────────────────────────────── */

Ibex.register((app) => {

  /* ── 1. Render initial dashboard ──────────────────────────────────────── */
  const { state, storage } = app;

  /* Trigger initial page render */
  const currentPage = state.getCurrentPage();
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const initialPage = document.getElementById(`page-${currentPage}`);
  if (initialPage) initialPage.classList.remove('hidden');

  /* ── 2. Activate correct nav item ─────────────────────────────────────── */
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === currentPage);
  });

  /* ── 3. Dashboard initial load ────────────────────────────────────────── */
  if (currentPage === 'dashboard' && app.ui) {
    /* Small delay to let Chart.js load from CDN if needed */
    setTimeout(() => {
      app.ui._renderDashboard();
    }, 100);
  }

  /* ── 4. Subscribe to page changes to re-render dashboard ─────────────── */
  state.subscribe('page', (page) => {
    if (page === 'dashboard' && app.ui && app.charts) {
      setTimeout(() => {
        app.ui._renderDashboard();
      }, 50);
    }
  });

  /* ── 5. Handle "Ver tudo" activity button ─────────────────────────────── */
  const viewAllActivity = document.getElementById('view-all-activity');
  if (viewAllActivity) {
    viewAllActivity.addEventListener('click', () => {
      state.toastInfo('Em breve', 'Módulo de atividades completo disponível na Etapa 4.');
    });
  }

  /* ── 6. Handle "Ver todas" tasks button ───────────────────────────────── */
  const viewAllTasks = document.getElementById('view-all-tasks');
  if (viewAllTasks) {
    viewAllTasks.addEventListener('click', () => {
      state.navigate('tasks');
    });
  }

  /* ── 7. PWA support ───────────────────────────────────────────────────── */
  if ('serviceWorker' in navigator) {
    // Service worker registration would go here if manifest + sw.js present
    // For now just log
    console.info('[IBEX App] PWA-ready structure detected.');
  }

  /* ── 8. Handle dev console helpers ───────────────────────────────────── */
  window.ibexReset = () => {
    if (confirm('Redefinir todos os dados para a demo original?')) {
      storage.reset();
      location.reload();
    }
  };

  window.ibexStorageInfo = () => {
    const info = storage.getStorageInfo();
    console.table(
      Object.entries(info.breakdown).map(([k, v]) => ({
        Chave: v.key,
        'Tamanho (KB)': v.kb,
      }))
    );
    console.info(`Total: ${info.totalKb} KB`);
  };

  console.info(
    '%c IBEX CRM %c App ready. Digite ibexReset() para redefinir os dados. ',
    'background:#6366f1;color:#fff;font-weight:700;padding:2px 8px;border-radius:4px 0 0 4px',
    'background:#09090b;color:#71717a;padding:2px 8px;border-radius:0 4px 4px 0'
  );
});
