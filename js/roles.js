/**
 * IBEX CRM — Papéis e Permissões
 * Lista de papéis com hierarquia + matriz interativa papel × permissão.
 * Usa js/permissions-data.js como fonte única de verdade (compartilhada
 * com o drawer de permissões em team.js).
 *
 * TODO(backend): ver aviso completo no banner da própria página (roles.html).
 * Resumo: esta matriz hoje só controla a interface. Bloquear ações de
 * verdade exige um middleware de autorização no servidor validando o papel
 * do usuário (via sessão/JWT real) contra esta mesma matriz.
 *
 * @version 1.0.0
 */

'use strict';

(function () {

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function levelColor(level) {
    if (level >= 90) return '#f43f5e';
    if (level >= 70) return '#f59e0b';
    if (level >= 45) return '#0ea5e9';
    if (level >= 20) return '#6366f1';
    return '#71717a';
  }

  class RolesController {

    constructor(app) {
      this._app = app;

      if (!window.IbexPermissions) {
        console.error('[Roles] js/permissions-data.js não carregado — abortando init.');
        return;
      }

      this._categories = window.IbexPermissions.getCategories();
      this._roles = window.IbexPermissions.getRoles().slice(); // cópia mutável (permite papéis customizados em memória)
      this._matrix = window.IbexPermissions.getMatrix();
      this._collapsedCategories = new Set();

      this._renderRoleList();
      this._renderMatrix();
      this._bindGlobalActions();
      this._bindNewRoleModal();
      this._bindBackendInfoLink();
    }

    _toast(type, title, msg) {
      const fn = this._app?.state?.[`toast${type}`];
      if (typeof fn === 'function') fn.call(this._app.state, title, msg);
    }

    _persistMatrix() {
      window.IbexPermissions.saveMatrix(this._matrix);
    }

    /* ── Lista de Papéis (cards com hierarquia) ───────────────────────── */

    _renderRoleList() {
      const grid = document.getElementById('roles-list-grid');
      const badge = document.getElementById('roles-count-badge');
      if (!grid) return;

      if (badge) badge.textContent = `${this._roles.length} papéis`;

      const maxLevel = 100;

      grid.innerHTML = this._roles.map((r, i) => {
        const permCount = (this._matrix[r.id] || []).length;
        const color = levelColor(r.level);
        const widthPct = Math.round((r.level / maxLevel) * 100);
        return `
          <div class="role-card stagger-item" style="animation-delay:${i * 20}ms">
            <div class="role-card-header">
              <span class="role-card-name">${esc(r.label)}</span>
              <span class="role-card-perm-count">${permCount} permissões</span>
            </div>
            <div class="role-card-level-track">
              <div class="role-card-level-fill" style="width:${widthPct}%;background:${color}"></div>
            </div>
            <div class="role-card-level-label">Nível ${r.level}</div>
          </div>
        `;
      }).join('');
    }

    /* ── Matriz de Permissões ──────────────────────────────────────────── */

    _renderMatrix() {
      const wrap = document.getElementById('roles-matrix-wrap');
      if (!wrap) return;

      const headerCells = this._roles.map(r => `
        <th data-role-id="${r.id}">
          <div class="roles-matrix-role-th">
            <span class="roles-matrix-role-name">${esc(r.label)}</span>
            <span class="roles-matrix-role-level">Nv. ${r.level}</span>
            <span class="roles-matrix-col-toggle-all" data-toggle-col="${r.id}">marcar tudo</span>
          </div>
        </th>
      `).join('');

      const bodyRows = this._categories.map(cat => {
        const catRow = `
          <tr class="roles-matrix-cat-row">
            <td colspan="${this._roles.length + 1}">
              ${esc(cat.label)}
              <span class="roles-matrix-cat-toggle-all" data-toggle-cat="${esc(cat.label)}">marcar linha toda</span>
            </td>
          </tr>
        `;

        const permRows = cat.perms.map(perm => {
          const cells = this._roles.map(r => {
            const isSuperAdmin = r.id === 'super_admin';
            const checked = (this._matrix[r.id] || []).includes(perm);
            return `
              <td class="roles-matrix-checkbox-cell ${isSuperAdmin ? 'roles-matrix-col-locked' : ''}">
                <input type="checkbox" class="roles-matrix-checkbox"
                       data-role-id="${r.id}" data-perm="${esc(perm)}"
                       ${checked ? 'checked' : ''} ${isSuperAdmin ? 'disabled title="Super Admin sempre tem acesso total"' : ''} />
              </td>
            `;
          }).join('');

          return `
            <tr>
              <td class="roles-matrix-perm-cell">${esc(perm)}</td>
              ${cells}
            </tr>
          `;
        }).join('');

        return catRow + permRows;
      }).join('');

      wrap.innerHTML = `
        <table class="roles-matrix-table">
          <thead>
            <tr>
              <th>Permissão</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      `;

      this._bindMatrixEvents(wrap);
    }

    _bindMatrixEvents(wrap) {
      // Checkbox individual
      wrap.querySelectorAll('.roles-matrix-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const roleId = cb.dataset.roleId;
          const perm   = cb.dataset.perm;
          if (!this._matrix[roleId]) this._matrix[roleId] = [];

          if (cb.checked) {
            if (!this._matrix[roleId].includes(perm)) this._matrix[roleId].push(perm);
          } else {
            this._matrix[roleId] = this._matrix[roleId].filter(p => p !== perm);
          }

          this._persistMatrix();
          this._renderRoleList(); // atualiza contador de permissões nos cards
        });
      });

      // "marcar tudo" por coluna (papel)
      wrap.querySelectorAll('[data-toggle-col]').forEach(link => {
        link.addEventListener('click', () => {
          const roleId = link.dataset.toggleCol;
          if (roleId === 'super_admin') return; // já tem tudo, imutável

          const allPerms = window.IbexPermissions.getAllPermissions();
          const current = this._matrix[roleId] || [];
          const hasAll = allPerms.every(p => current.includes(p));

          this._matrix[roleId] = hasAll ? [] : allPerms.slice();
          this._persistMatrix();
          this._renderMatrix();
          this._renderRoleList();

          const role = this._roles.find(r => r.id === roleId);
          this._toast('Success', hasAll ? 'Permissões removidas' : 'Todas as permissões concedidas', role?.label || roleId);
        });
      });

      // "marcar linha toda" por categoria
      wrap.querySelectorAll('[data-toggle-cat]').forEach(link => {
        link.addEventListener('click', () => {
          const catLabel = link.dataset.toggleCat;
          const cat = this._categories.find(c => c.label === catLabel);
          if (!cat) return;

          // Marca a categoria inteira para TODOS os papéis não-super-admin
          this._roles.forEach(r => {
            if (r.id === 'super_admin') return;
            if (!this._matrix[r.id]) this._matrix[r.id] = [];
            cat.perms.forEach(p => {
              if (!this._matrix[r.id].includes(p)) this._matrix[r.id].push(p);
            });
          });

          this._persistMatrix();
          this._renderMatrix();
          this._renderRoleList();
          this._toast('Success', 'Categoria liberada', `"${catLabel}" concedida a todos os papéis.`);
        });
      });
    }

    /* ── Ações globais: expandir/recolher (placeholder simples) ─────────── */

    _bindGlobalActions() {
      // Como a matriz atual não tem categorias colapsáveis nativamente (é uma
      // tabela única), estes botões servem para destacar visualmente — expansão
      // real de categorias específicas fica como próxima iteração se necessário.
      document.getElementById('roles-expand-all-btn')?.addEventListener('click', () => {
        this._toast('Info', 'Matriz completa', 'Todas as categorias já estão visíveis na tabela.');
      });
      document.getElementById('roles-collapse-all-btn')?.addEventListener('click', () => {
        const wrap = document.getElementById('roles-matrix-wrap');
        wrap?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* ── Modal: Novo Papel ────────────────────────────────────────────── */

    _bindNewRoleModal() {
      const modal = document.getElementById('roles-modal-new-role');
      if (!modal) return;

      const levelSlider  = document.getElementById('rl-level');
      const levelDisplay = document.getElementById('rl-level-display');
      levelSlider?.addEventListener('input', () => {
        if (levelDisplay) levelDisplay.textContent = levelSlider.value;
      });

      document.getElementById('roles-new-role-btn')?.addEventListener('click', () => {
        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('modal-overlay--open'));
        document.getElementById('rl-name')?.focus();
      });

      const close = () => {
        modal.classList.remove('modal-overlay--open');
        setTimeout(() => { modal.hidden = true; document.getElementById('roles-new-role-form')?.reset(); }, 150);
      };
      modal.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', close));

      document.getElementById('roles-new-role-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = String(fd.get('name') || '').trim();
        if (!name) return;

        const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '_' + Date.now().toString(36).slice(-4);
        const level = Number(fd.get('level')) || 30;

        this._roles.push({ id, label: name, level });
        this._matrix[id] = [];
        this._persistMatrix();

        // Reordena por nível (maior primeiro) para manter a lista hierárquica coerente
        this._roles.sort((a, b) => b.level - a.level);

        this._renderRoleList();
        this._renderMatrix();
        close();
        this._toast('Success', 'Papel criado', `"${name}" foi adicionado com ${(this._matrix[id] || []).length} permissões.`);
      });
    }

    /* ── Link informativo sobre backend ──────────────────────────────── */

    _bindBackendInfoLink() {
      document.getElementById('roles-backend-info-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        this._toast(
          'Info',
          'Sobre segurança real',
          'Esta tela hoje só esconde/mostra elementos na interface. Bloquear ações de verdade exige validação de permissões no servidor.'
        );
      });
    }
  }

  /* ── Bootstrap ─────────────────────────────────────────────────────────── */

  function init() {
    if (!window.Ibex?.storage || !window.IbexPermissions) return setTimeout(init, 50);
    window.Ibex.roles = new RolesController(window.Ibex);
    console.info('[Roles] Módulo v1.0 inicializado.');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
