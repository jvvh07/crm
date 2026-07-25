/**
 * IBEX CRM — Theme Engine Patch
 * O IbexStateManager (state.js) já tem seu próprio _applyTheme('dark'|'light'|'auto'),
 * chamado automaticamente no boot a partir das settings salvas. Isso sobrescreveria
 * de volta para 'dark'/'light' qualquer tema premium (oled, midnight, purple, emerald,
 * corporate) que o ThemeEngine (theme-engine.js) já tenha aplicado no <html>.
 *
 * Este patch intercepta APENAS esse método, sem tocar em state.js: se o usuário
 * tiver um tema premium ativo, o patch mantém esse tema; caso contrário, deixa o
 * comportamento original (dark/light/auto) intacto.
 *
 * Carregar DEPOIS de js/state.js e ANTES de js/app.js.
 * @version 1.0.0
 */

'use strict';

(function () {
  if (typeof IbexStateManager === 'undefined') {
    console.warn('[ThemeEnginePatch] IbexStateManager não encontrado — patch não aplicado.');
    return;
  }

  const PREMIUM_THEMES = ['oled', 'midnight', 'purple', 'emerald', 'corporate'];
  const originalApplyTheme = IbexStateManager.prototype._applyTheme;

  IbexStateManager.prototype._applyTheme = function (resolved) {
    const activeTheme = window.IbexThemeEngine?.getCurrent();

    if (activeTheme && PREMIUM_THEMES.includes(activeTheme)) {
      // Mantém o tema premium — apenas ajusta a meta theme-color para algo coerente
      document.documentElement.setAttribute('data-theme', activeTheme);
      const meta = document.querySelector('meta[name="theme-color"]');
      const isLightish = ['light', 'corporate'].includes(activeTheme);
      if (meta) meta.content = isLightish ? '#f8f8fa' : '#050505';
      return;
    }

    // Comportamento original para dark/light/auto (nenhum tema premium ativo)
    originalApplyTheme.call(this, resolved);
  };
})();
