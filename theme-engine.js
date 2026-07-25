/**
 * IBEX CRM — Theme Engine
 * Aplica, persiste e alterna entre temas. Roda em TODAS as páginas (incluído
 * antes de qualquer outro script de UI) para evitar "flash" do tema errado.
 *
 * Temas disponíveis: dark (padrão), light, oled, midnight, purple, emerald, corporate
 *
 * @version 1.0.0
 */

'use strict';

(function () {

  const STORAGE_KEY = 'ibex_theme';

  const THEMES = [
    { id: 'dark',      label: 'Escuro',       sidebar: '#0c0c0e', main: '#050505', dots: ['#6366f1', '#34d399', '#f59e0b'] },
    { id: 'light',     label: 'Claro',        sidebar: '#ffffff', main: '#f8f8fa', dots: ['#6366f1', '#34d399', '#f59e0b'] },
    { id: 'oled',      label: 'OLED',         sidebar: '#000000', main: '#000000', dots: ['#6366f1', '#34d399', '#f59e0b'] },
    { id: 'midnight',  label: 'Midnight',     sidebar: '#070b13', main: '#06090f', dots: ['#38bdf8', '#0ea5e9', '#94a3b8'] },
    { id: 'purple',    label: 'Purple',       sidebar: '#0c0c0e', main: '#050505', dots: ['#a855f7', '#c084fc', '#d8b4fe'] },
    { id: 'blue',      label: 'Blue',         sidebar: '#0c0c0e', main: '#050505', dots: ['#2563eb', '#60a5fa', '#93c5fd'] },
    { id: 'emerald',   label: 'Emerald',      sidebar: '#0c0c0e', main: '#050505', dots: ['#10b981', '#34d399', '#6ee7b7'] },
    { id: 'orange',    label: 'Orange',       sidebar: '#0c0c0e', main: '#050505', dots: ['#f97316', '#fb923c', '#fdba74'] },
    { id: 'red',       label: 'Red',          sidebar: '#0c0c0e', main: '#050505', dots: ['#ef4444', '#f87171', '#fca5a5'] },
    { id: 'rose',      label: 'Rose',         sidebar: '#0c0c0e', main: '#050505', dots: ['#f43f5e', '#fb7185', '#fda4af'] },
    { id: 'cyberpunk', label: 'Cyberpunk',    sidebar: '#06030b', main: '#08040f', dots: ['#d946ef', '#e879f9', '#22d3ee'] },
    { id: 'minimal',   label: 'Minimal',      sidebar: '#ffffff', main: '#ffffff', dots: ['#18181b', '#71717a', '#a1a1aa'] },
    { id: 'glassmorphism', label: 'Glass',    sidebar: '#0f1423', main: '#0a0e1a', dots: ['#818cf8', '#a5b4fc', '#38bdf8'] },
    { id: 'corporate', label: 'Corporate',    sidebar: '#ffffff', main: '#f4f5f7', dots: ['#334155', '#475569', '#94a3b8'] },
  ];

  /* ── Aplicação imediata (evita flash de tema errado ao carregar a página) ── */

  function getSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY) || 'dark'; }
    catch { return 'dark'; }
  }

  function applyThemeImmediate(themeId) {
    document.documentElement.setAttribute('data-theme', themeId);
  }

  // Aplica assim que este script carrega — antes do restante do DOM renderizar
  applyThemeImmediate(getSavedTheme());

  /* ── Classe principal, inicializada após DOMContentLoaded ── */

  class ThemeEngine {

    constructor() {
      this.current = getSavedTheme();
    }

    getThemes() { return THEMES; }

    getCurrent() { return this.current; }

    /**
     * Troca o tema com transição suave. Adiciona uma classe temporária que
     * habilita transition em todos os elementos, e remove logo depois para
     * não interferir com outras animações da aplicação (hover, drag etc).
     */
    setTheme(themeId) {
      if (!THEMES.find(t => t.id === themeId)) {
        console.warn('[ThemeEngine] Tema desconhecido:', themeId);
        return;
      }

      document.documentElement.classList.add('theme-transitioning');
      document.documentElement.setAttribute('data-theme', themeId);
      this.current = themeId;

      try { localStorage.setItem(STORAGE_KEY, themeId); } catch {}

      window.setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 300);

      document.dispatchEvent(new CustomEvent('ibex:theme:changed', { detail: { theme: themeId } }));
    }

    /**
     * Renderiza o grid de swatches de tema dentro de um container.
     * Uso: window.IbexThemeEngine.renderPicker(document.getElementById('theme-grid'))
     */
    renderPicker(container) {
      if (!container) return;

      container.innerHTML = THEMES.map(t => `
        <button class="theme-swatch-option ${t.id === this.current ? 'active' : ''}"
                data-theme-id="${t.id}"
                type="button"
                aria-pressed="${t.id === this.current}"
                aria-label="Tema ${t.label}">
          <span class="theme-swatch-check" aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <div class="theme-swatch-preview">
            <div class="theme-swatch-preview-side" style="background:${t.sidebar}"></div>
            <div class="theme-swatch-preview-main" style="background:${t.main}">
              ${t.dots.map(c => `<span class="theme-swatch-dot" style="background:${c}"></span>`).join('')}
            </div>
          </div>
          <span class="theme-swatch-label">${t.label}</span>
        </button>
      `).join('');

      container.querySelectorAll('.theme-swatch-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.themeId;
          this.setTheme(id);

          // Atualizar estado visual do grid inteiro
          container.querySelectorAll('.theme-swatch-option').forEach(b => {
            const isActive = b.dataset.themeId === id;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-pressed', String(isActive));
          });

          // Feedback via toast, se o sistema de state/toast já estiver disponível
          const themeLabel = THEMES.find(t => t.id === id)?.label || id;
          if (window.Ibex?.state?.toastSuccess) {
            window.Ibex.state.toastSuccess('Tema atualizado', `Agora usando o tema ${themeLabel}`);
          }
        });
      });
    }
  }

  window.IbexThemeEngine = new ThemeEngine();

  /* ── Auto-renderiza o picker se a página tiver o container #theme-grid ── */
  document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('theme-grid');
    if (grid) window.IbexThemeEngine.renderPicker(grid);
  });

})();
