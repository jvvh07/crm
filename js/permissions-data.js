/**
 * IBEX CRM — Dados de Papéis e Permissões (fonte única de verdade)
 * Usado por team.js (drawer de permissões do colaborador) e roles.js
 * (matriz de papéis × permissões). Mantendo isso em um único arquivo evitamos
 * que as duas telas fiquem com listas de permissões divergentes.
 *
 * Persistência: localStorage. A matriz papel×permissão é editável na tela
 * de Papéis (roles.html); os papéis individuais atribuídos a cada colaborador
 * continuam em team.js (ibex_team_v1), pois dizem respeito à pessoa, não ao
 * catálogo de papéis em si.
 *
 * TODO(backend): ver aviso detalhado em roles.html — esta matriz hoje só
 * controla a interface, não bloqueia nada no servidor.
 *
 * @version 1.0.0
 */

'use strict';

(function () {

  const ROLE_MATRIX_KEY = 'ibex_role_permissions_v1';

  /* ── Catálogo de Permissões (categorizado) ────────────────────────────── */

  const PERMISSION_CATEGORIES = [
    { label: 'Leads',          perms: ['Visualizar Leads', 'Editar Leads', 'Excluir Leads'] },
    { label: 'Pipeline',       perms: ['Criar Pipeline', 'Editar Pipeline', 'Excluir Pipeline'] },
    { label: 'Financeiro',     perms: ['Ver Financeiro'] },
    { label: 'Automações',     perms: ['Criar Automações', 'Editar Automações'] },
    { label: 'Configurações',  perms: ['Editar Configurações', 'Exportar Dados'] },
    { label: 'Usuários',       perms: ['Gerenciar Usuários', 'Gerenciar Papéis'] },
  ];

  const ALL_PERMISSIONS = PERMISSION_CATEGORIES.flatMap(c => c.perms);

  /* ── Catálogo de Papéis (hierarquia) ──────────────────────────────────── */

  const ROLES = [
    { id: 'super_admin', label: 'Super Admin',    level: 100 },
    { id: 'admin',       label: 'Administrador',  level: 90  },
    { id: 'director',    label: 'Diretor',        level: 80  },
    { id: 'manager',     label: 'Gerente',        level: 70  },
    { id: 'coordinator', label: 'Coordenador',    level: 60  },
    { id: 'supervisor',  label: 'Supervisor',     level: 50  },
    { id: 'leader',      label: 'Líder',          level: 45  },
    { id: 'sdr',         label: 'SDR',            level: 30  },
    { id: 'closer',      label: 'Closer',         level: 30  },
    { id: 'executive',   label: 'Executivo',      level: 30  },
    { id: 'cs',          label: 'CS',             level: 30  },
    { id: 'user',        label: 'Usuário comum',  level: 10  },
    { id: 'guest',       label: 'Visitante',      level: 0   },
  ];

  /* ── Matriz padrão (seed) ──────────────────────────────────────────────── */

  function buildSeedMatrix() {
    return {
      super_admin: ALL_PERMISSIONS.slice(),
      admin:       ['Visualizar Leads','Editar Leads','Excluir Leads','Criar Pipeline','Editar Pipeline','Excluir Pipeline','Ver Financeiro','Gerenciar Usuários'],
      director:    ['Visualizar Leads','Editar Leads','Criar Pipeline','Editar Pipeline','Ver Financeiro','Exportar Dados'],
      manager:     ['Visualizar Leads','Editar Leads','Editar Pipeline','Criar Automações','Exportar Dados'],
      coordinator: ['Visualizar Leads','Editar Leads','Criar Automações'],
      supervisor:  ['Visualizar Leads','Editar Leads'],
      leader:      ['Visualizar Leads','Editar Leads'],
      sdr:         ['Visualizar Leads'],
      closer:      ['Visualizar Leads','Editar Leads'],
      executive:   ['Visualizar Leads','Editar Leads'],
      cs:          ['Visualizar Leads','Editar Leads'],
      user:        ['Visualizar Leads'],
      guest:       [],
    };
  }

  // PERFORMANCE: cache em memória para evitar reler + fazer JSON.parse do
  // localStorage a cada chamada de window.can() — que é pensado para ser
  // usado com frequência espalhado pela UI (ex: esconder botões conforme
  // permissão). Invalidado automaticamente sempre que saveMatrix() escreve.
  let _matrixCache = null;

  function loadMatrix() {
    if (_matrixCache) return _matrixCache;

    try {
      const raw = localStorage.getItem(ROLE_MATRIX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          _matrixCache = parsed;
          return _matrixCache;
        }
      }
    } catch { /* fallback abaixo */ }

    const seed = buildSeedMatrix();
    saveMatrix(seed);
    return seed;
  }

  function saveMatrix(matrix) {
    try {
      localStorage.setItem(ROLE_MATRIX_KEY, JSON.stringify(matrix));
      _matrixCache = matrix; // mantém o cache sincronizado com o que acabou de ser gravado
      return true;
    } catch (err) {
      console.error('[PermissionsData] Falha ao persistir matriz:', err);
      return false;
    }
  }

  /* ── API pública ───────────────────────────────────────────────────────── */

  window.IbexPermissions = {
    getCategories: () => PERMISSION_CATEGORIES,
    getAllPermissions: () => ALL_PERMISSIONS.slice(),
    getRoles: () => ROLES,

    getMatrix: () => loadMatrix(),
    saveMatrix: (matrix) => saveMatrix(matrix),

    /**
     * Verifica se o papel informado possui a permissão. Usar em qualquer
     * tela para esconder/desabilitar ações conforme o papel do usuário atual.
     *
     * IMPORTANTE: isto só controla a interface. Ver TODO(backend) em roles.html.
     */
    can(roleId, permissionId) {
      const matrix = loadMatrix();
      return (matrix[roleId] || []).includes(permissionId);
    },
  };

  /**
   * Helper global de conveniência: verifica a permissão do usuário ATUAL
   * (hoje mockado — ver storage.getCurrentUser()). Uso: if (!can('Excluir Leads')) { ... }
   */
  window.can = function (permissionId) {
    try {
      const currentUser = window.Ibex?.storage?.getCurrentUser?.();
      // TODO(backend): roleId deve vir de uma sessão/JWT real, não de um campo
      // opcional no objeto mockado do usuário. Fallback para 'admin' preserva
      // o comportamento atual (não bloqueia nada) até essa peça existir.
      const roleId = currentUser?.roleId || 'admin';
      return window.IbexPermissions.can(roleId, permissionId);
    } catch {
      return true; // fail-open na UI — nunca trava a interface por causa da checagem
    }
  };

})();
