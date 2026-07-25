/**
 * IBEX CRM — Automations Flow Builder
 * Implementação premium inspirada em n8n e Notion.
 */

/**
 * BUGFIX (auditoria de segurança): título do workflow, título e descrição
 * de cada nó são campos editáveis pelo usuário (via _applyConfig) e eram
 * inseridos sem escape via innerHTML — incluindo um ponto dentro de um
 * atributo `value="..."` no painel de configuração, que é o mais grave:
 * disparava só de abrir o painel, sem precisar de nenhum clique adicional.
 */
function escAutomations(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

class AutomationsController {
  constructor(app) {
    this._app = app;
    this._state = app.state;
    this._storage = app.storage;
    
    this._workflows = [];
    this._activeWfId = null;
    this._activeStepId = null;
    
    /* Dragging state */
    this._draggingNode = null;
    this._dragOffset = { x: 0, y: 0 };
    this._isPanning = false;
    this._panOffset = { x: 0, y: 0 };
    
    this._init();
  }

  async _init() {
    this._workflows = await this._storage.getAutomations();
    if (!this._workflows || this._workflows.length === 0) {
      this._workflows = this._getSeedWorkflows();
      for (const wf of this._workflows) {
        await this._storage.saveAutomation(wf);
      }
    }
    
    this._bindEvents();
    this._renderSidebar();
  }

  _getSeedWorkflows() {
    return [
      {
        id: 'wf-1', title: 'Boas-vindas Novo Lead', active: true,
        steps: [
          { id: 's1', type: 'trigger', tool: 'trigger', icon: 'zap', title: 'Lead Criado', desc: 'Quando um novo lead entra', x: 50, y: 50, next: ['s2'] },
          { id: 's2', type: 'action', tool: 'whatsapp', icon: 'message-circle', title: 'Boas-vindas WA', desc: 'Enviar template padrão', x: 300, y: 50, next: ['s3'] },
          { id: 's3', type: 'action', tool: 'delay', icon: 'clock', title: 'Aguardar 2 dias', desc: 'Delay estratégico', x: 550, y: 50, next: ['s4'] },
          { id: 's4', type: 'action', tool: 'task', icon: 'check-square', title: 'Call de Follow-up', desc: 'Tarefa para o SDR', x: 550, y: 200, next: [] }
        ]
      },
      {
        id: 'wf-2', title: 'Reativação de Perdidos', active: false,
        steps: [
          { id: 's1', type: 'trigger', tool: 'trigger', icon: 'zap', title: 'Perdido há 30 dias', desc: 'Gatilho temporal', x: 50, y: 50, next: ['s2'] },
          { id: 's2', type: 'action', tool: 'email', icon: 'mail', title: 'Email de Saudade', desc: 'Template reativação', x: 300, y: 50, next: [] }
        ]
      }
    ];
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    document.getElementById('btn-new-workflow')?.addEventListener('click', () => this._createNew());
    document.getElementById('btn-save-workflow')?.addEventListener('click', () => this._handleSave());
    document.getElementById('btn-delete-workflow')?.addEventListener('click', () => this._handleDelete());
    document.getElementById('btn-add-node')?.addEventListener('click', () => this._openActionPicker());
    document.getElementById('wf-search')?.addEventListener('input', e => this._renderSidebar(e.target.value));

    /* Canvas Interactions */
    const canvas = document.getElementById('builder-canvas');
    if (canvas) {
      canvas.addEventListener('mousedown', e => this._handleMouseDown(e));
      window.addEventListener('mousemove', e => this._handleMouseMove(e));
      window.addEventListener('mouseup', () => this._handleMouseUp());
    }

    /* Action Picker */
    document.getElementById('btn-close-action-picker')?.addEventListener('click', () => this._closeActionPicker());
    document.querySelectorAll('.action-picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this._addNode(btn.dataset.action);
        this._closeActionPicker();
      });
    });

    /* Config Panel */
    document.getElementById('btn-close-node-config')?.addEventListener('click', () => this._closeConfigPanel());
    document.getElementById('btn-apply-node-config')?.addEventListener('click', () => this._applyConfig());
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async _handleSave() {
    const wf = this._activeWf();
    if (!wf) return;
    wf.title = document.getElementById('builder-title').value || 'Workflow';
    wf.active = document.getElementById('builder-toggle-active').checked;
    await this._storage.saveAutomation(wf);
    this._renderSidebar();
    this._state.toastSuccess('Salvo', 'Fluxo atualizado com sucesso.');
  }

  async _handleDelete() {
    if (!this._activeWfId) return;
    if (!confirm('Excluir esta automação permanentemente?')) return;
    // Implementation of delete in storage is needed if not exists
    // For now we just remove from local list and hope storage handles it or we re-sync
    this._workflows = this._workflows.filter(w => w.id !== this._activeWfId);
    this._activeWfId = null;
    this._renderSidebar();
    document.getElementById('builder-empty').classList.remove('hidden');
    document.getElementById('builder-view').classList.add('hidden');
  }

  _handleMouseDown(e) {
    const nodeEl = e.target.closest('.flow-node');
    if (nodeEl) {
      this._draggingNode = nodeEl.dataset.id;
      const rect = nodeEl.getBoundingClientRect();
      this._dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this._selectNode(this._draggingNode);
      return;
    }

    if (e.target.id === 'builder-canvas' || e.target.id === 'nodes-layer' || e.target.closest('.flow-svg-layer')) {
      this._isPanning = true;
      this._panOffset = { x: e.clientX, y: e.clientY };
    }
  }

  _handleMouseMove(e) {
    if (this._draggingNode) {
      const canvas = document.getElementById('builder-canvas');
      const canvasRect = canvas.getBoundingClientRect();
      const x = e.clientX - canvasRect.left - this._dragOffset.x;
      const y = e.clientY - canvasRect.top - this._dragOffset.y;
      
      const wf = this._activeWf();
      const step = wf.steps.find(s => s.id === this._draggingNode);
      if (step) {
        step.x = Math.max(0, x);
        step.y = Math.max(0, y);
        this._updateNodePosition(step);
        this._drawLines();
      }
    }
  }

  _handleMouseUp() {
    this._draggingNode = null;
    this._isPanning = false;
  }

  // ── Logic ─────────────────────────────────────────────────────────────────

  _activeWf() {
    return this._workflows.find(w => w.id === this._activeWfId);
  }

  _createNew() {
    const wf = {
      id: 'wf-' + Date.now(),
      title: 'Nova Automação',
      active: false,
      steps: [
        { id: 's1', type: 'trigger', tool: 'trigger', icon: 'zap', title: 'Gatilho Inicial', desc: 'Clique para definir o gatilho', x: 100, y: 100, next: [] }
      ]
    };
    this._workflows.unshift(wf);
    this._activeWfId = wf.id;
    this._renderSidebar();
    this._renderBuilder(wf);
  }

  _renderSidebar(query = '') {
    const list = document.getElementById('wf-list');
    if (!list) return;
    list.innerHTML = '';
    const filtered = this._workflows.filter(w => w.title.toLowerCase().includes(query.toLowerCase()));
    filtered.forEach(wf => {
      const item = document.createElement('div');
      item.className = `wf-item ${wf.id === this._activeWfId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="wf-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
        <div class="wf-item-content">
          <div class="wf-item-title">${escAutomations(wf.title)}</div>
          <div class="wf-item-meta">${wf.active ? 'Ativo' : 'Inativo'} · ${wf.steps.length} nós</div>
        </div>
      `;
      item.onclick = () => {
        this._activeWfId = wf.id;
        this._renderSidebar(query);
        this._renderBuilder(wf);
      };
      list.appendChild(item);
    });
  }

  _renderBuilder(wf) {
    document.getElementById('builder-empty').classList.add('hidden');
    document.getElementById('builder-view').classList.remove('hidden');
    document.getElementById('builder-title').value = wf.title;
    document.getElementById('builder-toggle-active').checked = wf.active;
    
    this._renderNodes(wf);
    this._drawLines();
  }

  _renderNodes(wf) {
    const layer = document.getElementById('nodes-layer');
    layer.innerHTML = '';
    wf.steps.forEach(step => {
      const el = document.createElement('div');
      el.className = `flow-node ${this._activeStepId === step.id ? 'selected' : ''}`;
      el.dataset.id = step.id;
      el.style.left = `${step.x}px`;
      el.style.top = `${step.y}px`;
      
      const iconColor = this._getIconColor(step.tool);
      
      el.innerHTML = `
        <div class="node-header">
          <div class="node-icon" style="background:${iconColor}22;color:${iconColor}">
            ${this._svgFor(step.icon, 16)}
          </div>
          <div class="node-title">${escAutomations(step.title)}</div>
        </div>
        <div class="node-body">${escAutomations(step.desc)}</div>
        <div class="node-port node-port-in"></div>
        <div class="node-port node-port-out"></div>
      `;
      
      el.onclick = (e) => {
        e.stopPropagation();
        this._selectNode(step.id);
        this._openConfigPanel(step);
      };
      
      layer.appendChild(el);
    });
  }

  _updateNodePosition(step) {
    const el = document.querySelector(`.flow-node[data-id="${step.id}"]`);
    if (el) {
      el.style.left = `${step.x}px`;
      el.style.top = `${step.y}px`;
    }
  }

  _drawLines() {
    const svg = document.getElementById('flow-svg-layer');
    // Keep defs
    const defs = svg.querySelector('defs');
    svg.innerHTML = '';
    if (defs) svg.appendChild(defs);
    
    const wf = this._activeWf();
    if (!wf) return;
    
    wf.steps.forEach(step => {
      if (!step.next) return;
      step.next.forEach(nextId => {
        const nextStep = wf.steps.find(s => s.id === nextId);
        if (nextStep) {
          this._drawLineBetween(step, nextStep);
        }
      });
    });
  }

  _drawLineBetween(s1, s2) {
    const svg = document.getElementById('flow-svg-layer');
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    
    const x1 = s1.x + 220; // width
    const y1 = s1.y + 35;  // middle
    const x2 = s2.x;
    const y2 = s2.y + 35;
    
    const cp1x = x1 + (x2 - x1) / 2;
    const cp2x = x1 + (x2 - x1) / 2;
    
    const d = `M ${x1} ${y1} C ${cp1x} ${y1} ${cp2x} ${y2} ${x2} ${y2}`;
    
    path.setAttribute("d", d);
    path.setAttribute("class", "flow-line");
    path.setAttribute("marker-end", "url(#arrowhead)");
    svg.appendChild(path);
  }

  _selectNode(id) {
    this._activeStepId = id;
    document.querySelectorAll('.flow-node').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
  }

  // ── Node Actions ──────────────────────────────────────────────────────────

  _openActionPicker() {
    document.getElementById('modal-action-picker').removeAttribute('hidden');
    document.getElementById('modal-action-picker').style.display = 'flex';
  }

  _closeActionPicker() {
    document.getElementById('modal-action-picker').setAttribute('hidden', '');
    document.getElementById('modal-action-picker').style.display = '';
  }

  _addNode(tool) {
    const wf = this._activeWf();
    const config = this._getToolConfig(tool);
    const newNode = {
      id: 's' + Date.now(),
      type: 'action',
      tool,
      ...config,
      x: 400,
      y: 100,
      next: []
    };
    
    // Auto-connect from last selected or last node
    if (this._activeStepId) {
      const prev = wf.steps.find(s => s.id === this._activeStepId);
      if (prev) {
        prev.next = prev.next || [];
        prev.next.push(newNode.id);
        newNode.x = prev.x + 250;
        newNode.y = prev.y;
      }
    }
    
    wf.steps.push(newNode);
    this._activeStepId = newNode.id;
    this._renderNodes(wf);
    this._drawLines();
    this._openConfigPanel(newNode);
  }

  _getToolConfig(tool) {
    const map = {
      whatsapp: { icon: 'message-circle', title: 'WhatsApp', desc: 'Envio automático' },
      email:    { icon: 'mail',           title: 'E-mail',   desc: 'Disparo de template' },
      task:     { icon: 'check-square',   title: 'Tarefa',   desc: 'Criar lembrete' },
      webhook:  { icon: 'link',           title: 'Webhook',  desc: 'Notificar sistema externo' },
      delay:    { icon: 'clock',          title: 'Delay',    desc: 'Pausar fluxo' },
      note:     { icon: 'edit-2',         title: 'Anotação', desc: 'Registrar log' },
      qualify:  { icon: 'award',          title: 'Qualificar', desc: 'Mudar status' },
      followup: { icon: 'calendar',       title: 'Follow-up', desc: 'Agendar call' }
    };
    return map[tool] || { icon: 'settings', title: 'Nó', desc: 'Configurar' };
  }

  _getIconColor(tool) {
    const colors = {
      whatsapp: '#25D366',
      email: '#6366f1',
      task: '#f59e0b',
      webhook: '#ec4899',
      delay: '#94a3b8',
      trigger: '#10b981',
      note: '#a855f7',
      qualify: '#10b981',
      followup: '#38bdf8'
    };
    return colors[tool] || '#ffffff';
  }

  // ── Config ────────────────────────────────────────────────────────────────

  _openConfigPanel(step) {
    document.getElementById('nc-title').textContent = step.title;
    document.getElementById('node-config-body').innerHTML = `
      <div class="nc-field">
        <label>Título da Etapa</label>
        <input type="text" class="form-input" id="nc-step-title" value="${escAutomations(step.title)}">
      </div>
      <div class="nc-field">
        <label>Descrição</label>
        <textarea class="form-textarea" id="nc-step-desc">${escAutomations(step.desc)}</textarea>
      </div>
      <div class="nc-field">
        <label>Configurações Específicas</label>
        <p style="font-size:12px;color:var(--text-muted)">Parametrize os gatilhos e ações deste nó para execução automática.</p>
      </div>
    `;
    document.getElementById('node-config-panel').classList.remove('hidden');
  }

  _closeConfigPanel() {
    document.getElementById('node-config-panel').classList.add('hidden');
    this._activeStepId = null;
    this._drawLines();
    this._renderNodes(this._activeWf());
  }

  _applyConfig() {
    const wf = this._activeWf();
    const step = wf.steps.find(s => s.id === this._activeStepId);
    if (step) {
      step.title = document.getElementById('nc-step-title').value;
      step.desc = document.getElementById('nc-step-desc').value;
      this._save();
      this._renderNodes(wf);
      this._drawLines();
      this._state.toastSuccess('Atualizado', 'Nó configurado com sucesso.');
      this._closeConfigPanel();
    }
  }

  _save() {
    this._storage.saveAutomation(this._activeWf());
  }

  _svgFor(icon, size = 18) {
    const paths = {
      zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
      mail: `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`,
      'check-square': `<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>`,
      'message-circle': `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`,
      clock: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
      link: `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
      'edit-2': `<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`,
      award: `<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>`,
      calendar: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>`,
      settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
    };
    const d = paths[icon] || paths.settings;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }
}

Ibex.register((app) => {
  if (app.state.getCurrentPage() === 'automations') {
    new AutomationsController(app);
  }
});
