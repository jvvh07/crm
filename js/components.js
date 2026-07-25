/**
 * IBEX CRM — Componentes Compartilhados
 * Sistema de componentes reutilizáveis usados em múltiplas telas: confirm
 * dialog assíncrono, avatar com cor determinística.
 *
 * Extraído para cá porque `confirmDialog` existia duplicado localmente em
 * pipeline-builder.js e era esperado globalmente (window.ibexConfirm) por
 * integrations.js — manter uma única fonte evita telas divergentes ou
 * quebradas por dependência ausente.
 *
 * @version 1.0.0
 */

'use strict';

(function () {

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ibexConfirm — substitui window.confirm com um modal no padrão visual
     do CRM. Uso: const ok = await window.ibexConfirm({ title, message, ... })
     ═══════════════════════════════════════════════════════════════════════ */

  function injectConfirmStyles() {
    if (document.getElementById('ibex-confirm-inline-style')) return;
    const style = document.createElement('style');
    style.id = 'ibex-confirm-inline-style';
    style.textContent = `
      .ibex-confirm-overlay {
        position: fixed; inset: 0; z-index: 9500;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        animation: ibexConfirmFadeIn 0.15s ease-out;
      }
      @keyframes ibexConfirmFadeIn { from { opacity: 0; } to { opacity: 1; } }
      .ibex-confirm-dialog {
        background: rgba(18,18,22,0.98);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px; padding: 24px; width: 320px;
        box-shadow: 0 25px 50px rgba(0,0,0,0.7);
        animation: ibexConfirmIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes ibexConfirmIn { from { opacity:0; transform:scale(0.92);} to { opacity:1; transform:none; } }
      .ibex-confirm-title { font-size:15px; font-weight:700; color:var(--color-text-primary); margin-bottom:6px; }
      .ibex-confirm-message { font-size:13px; color:var(--color-text-tertiary); line-height:1.5; margin-bottom:20px; }
      .ibex-confirm-actions { display:flex; gap:8px; justify-content:flex-end; }
    `;
    document.head.appendChild(style);
  }

  function ibexConfirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', isDanger = false }) {
    return new Promise(resolve => {
      injectConfirmStyles();

      const overlay = document.createElement('div');
      overlay.className = 'ibex-confirm-overlay';
      overlay.innerHTML = `
        <div class="ibex-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="ibex-confirm-title">${esc(title)}</div>
          <div class="ibex-confirm-message">${esc(message)}</div>
          <div class="ibex-confirm-actions">
            <button class="btn btn-secondary btn-sm" data-action="cancel">${esc(cancelLabel)}</button>
            <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'} btn-sm" data-action="confirm">${esc(confirmLabel)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(result);
      };

      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
        // BUGFIX: antes, QUALQUER Enter confirmava, mesmo com foco no botão
        // "Cancelar" (navegado via Tab) — contrariava o comportamento nativo
        // esperado (Enter deveria ativar o botão focado, não sempre confirmar).
        // Agora só intercepta Enter fora dos botões; com foco em um botão,
        // deixamos o clique nativo do próprio botão decidir.
        if (e.key === 'Enter' && document.activeElement?.dataset?.action !== 'cancel' &&
            document.activeElement?.dataset?.action !== 'confirm') {
          cleanup(true);
        }
      }

      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
      overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
      document.addEventListener('keydown', onKey);

      // Foco inicial no botão de confirmar para permitir Enter imediato
      overlay.querySelector('[data-action="confirm"]')?.focus();
    });
  }

  window.ibexConfirm = ibexConfirm;

  /* ═══════════════════════════════════════════════════════════════════════
     Avatar com cor determinística (hash do nome)
     ═══════════════════════════════════════════════════════════════════════ */

  const AVATAR_COLORS = ['#6366f1','#10b981','#f59e0b','#0ea5e9','#8b5cf6','#f43f5e','#34d399','#fb923c'];

  function getAvatarColor(name) {
    let hash = 0;
    const str = String(name || '');
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function getInitials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function renderAvatar(name, size = 'md') {
    const initials = getInitials(name);
    const color = getAvatarColor(name);
    const sizes = { sm: 24, md: 32, lg: 40, xl: 52 };
    const px = sizes[size] || 32;
    return `<div class="avatar avatar-${size}"
      style="background:${color}22;color:${color};width:${px}px;height:${px}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(px*0.35)}px;flex-shrink:0;"
      aria-label="${esc(name)}">
      ${esc(initials)}
    </div>`;
  }

  window.getAvatarColor = getAvatarColor;
  window.getInitials = getInitials;
  window.renderAvatar = renderAvatar;

  /* ═══════════════════════════════════════════════════════════════════════
     FOCUS TRAP — acessibilidade de teclado para modais e drawers
     Observa QUALQUER elemento [role="dialog"] da página via MutationObserver
     no atributo `hidden`. Quando um dialog abre: prende o Tab dentro dele e
     foca o primeiro elemento focável. Quando fecha: devolve o foco para
     quem tinha aberto o dialog. Funciona com todo modal/drawer já existente
     no projeto sem precisar alterar nenhuma lógica individual de abrir/
     fechar — o padrão [role="dialog"] + toggle de `hidden` já é usado
     consistentemente em todas as 13 páginas.
     ═══════════════════════════════════════════════════════════════════════ */

  class FocusTrapManager {
    constructor() {
      this._lastFocused = null;
      this._activeDialog = null;
      this._keyHandler = null;
      this._observeExisting();
    }

    _getFocusable(container) {
      const selector = 'a[href], button:not([disabled]), textarea:not([disabled]), ' +
                        'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(container.querySelectorAll(selector))
        .filter(el => el.offsetParent !== null); // só elementos realmente visíveis
    }

    _activate(dialogEl) {
      // Evita reativar se já é o dialog ativo (ex: mutação redundante)
      if (this._activeDialog === dialogEl) return;

      this._lastFocused = document.activeElement;
      this._activeDialog = dialogEl;

      // Pequeno delay: dá tempo do conteúdo (renderizado via JS) existir no DOM
      setTimeout(() => {
        const focusables = this._getFocusable(dialogEl);
        if (focusables.length) focusables[0].focus();
      }, 30);

      this._keyHandler = (e) => {
        if (e.key !== 'Tab') return;
        const items = this._getFocusable(dialogEl);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      };
      dialogEl.addEventListener('keydown', this._keyHandler);
    }

    _deactivate(dialogEl) {
      if (this._keyHandler) dialogEl.removeEventListener('keydown', this._keyHandler);
      if (this._activeDialog === dialogEl) {
        // Devolve o foco para onde o usuário estava antes de abrir o dialog
        if (this._lastFocused && document.body.contains(this._lastFocused)) {
          this._lastFocused.focus();
        }
        this._activeDialog = null;
      }
    }

    _observeExisting() {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
          if (m.type !== 'attributes' || m.attributeName !== 'hidden') return;
          const el = m.target;
          if (el.hidden) this._deactivate(el);
          else this._activate(el);
        });
      });

      document.querySelectorAll('[role="dialog"]').forEach(el => {
        observer.observe(el, { attributes: true, attributeFilter: ['hidden'] });
        // Se o dialog já nasce visível (raro, mas defensivo), ativa direto
        if (!el.hidden) this._activate(el);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.ibexFocusTrap = new FocusTrapManager();
  });

})();
