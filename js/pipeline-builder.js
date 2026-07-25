/**
 * IBEX CRM — Pipeline Builder
 * Tela de administração de pipelines: criar pipelines ilimitados, cada um com
 * estágios ilimitados (nome, cor, ícone, probabilidade, meta), reordenáveis
 * via drag & drop, com preview ao vivo do funil resultante.
 *
 * PERSISTÊNCIA: localStorage (chave 'ibex_pipelines_v1'). O pipeline marcado
 * como padrão é automaticamente refletido no Kanban real (pipeline.html)
 * através de um ajuste em storage.js::getPipelineStages().
 *
 * TODO(backend): esta tela hoje só persiste no navegador do usuário atual.
 * Para funcionar de verdade em produção (equipe toda vendo os mesmos
 * pipelines), é necessário: tabela `pipelines` + `pipeline_stages` no banco,
 * endpoints REST (GET/POST/PUT/DELETE /api/pipelines), e o endpoint de leads
 * precisa aceitar um `pipelineId` para saber a qual funil o lead pertence.
 *
 * @version 1.0.0
 */

'use strict';

(function () {

  const STORAGE_KEY = 'ibex_pipelines_v1';

  const EMOJI_OPTIONS = [
    '👤','✅','📞','🤝','📄','💬','📝','🎉','❌','⭐','🔥','💰',
    '📈','🎯','⏰','📦','🚀','💡','🏆','📊','✉️','🔔','🗓️','🔗',
  ];

  const COLOR_PALETTE = [
    '#6366f1', '#0ea5e9', '#8b5cf6', '#a78bfa', '#f59e0b', '#fb923c',
    '#38bdf8', '#10b981', '#f43f5e', '#34d399', '#fbbf24', '#71717a',
  ];

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function uid(prefix = 'stg') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function fmtCompact(v) {
    if (v == null || isNaN(v) || v === 0) return null;
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000)     return `R$ ${Math.round(v / 1_000)}K`;
    return `R$ ${Math.round(v)}`;
  }

  /* ── Seed inicial: deriva o pipeline padrão dos estágios reais já usados
     pelo Kanban (window.PIPELINE_STAGES), preservando 100% de compatibilidade
     com o que já existe, e adiciona ícone/meta como metadados extras. ── */

  function buildSeedPipelines() {
    const realStages = (window.PIPELINE_STAGES || [
      { id: 'new',         label: 'Novo Lead',        order: 0, color: '#6366f1', probability: 10  },
      { id: 'qualified',   label: 'Qualificado',       order: 1, color: '#0ea5e9', probability: 25  },
      { id: 'proposal',    label: 'Proposta Enviada',  order: 2, color: '#f59e0b', probability: 50  },
      { id: 'negotiation', label: 'Negociação',        order: 3, color: '#8b5cf6', probability: 75  },
      { id: 'won',         label: 'Fechado (Ganho)',   order: 4, color: '#10b981', probability: 100 },
      { id: 'lost',        label: 'Fechado (Perdido)', order: 5, color: '#f43f5e', probability: 0   },
    ]);

    const ICONS_BY_ID = {
      new: '👤', qualified: '✅', proposal: '📄', negotiation: '💬', won: '🎉', lost: '❌',
    };

    const GOALS_BY_ID = { won: 500000 };

    return [
      {
        id: 'pl_default',
        name: 'Pipeline Comercial',
        isDefault: true,
        createdAt: new Date().toISOString(),
        stages: realStages.map(s => ({
          id: s.id,
          label: s.label,
          order: s.order,
          color: s.color,
          probability: s.probability,
          icon: ICONS_BY_ID[s.id] || '🔹',
          goal: GOALS_BY_ID[s.id] || null,
        })),
      },
    ];
  }

  /* ── Persistência ─────────────────────────────────────────────────────── */

  function loadPipelines() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* dado corrompido — recria seed */ }
    const seed = buildSeedPipelines();
    savePipelines(seed);
    return seed;
  }

  function savePipelines(pipelines) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pipelines));
      return true;
    } catch (err) {
      console.error('[PipelineBuilder] Falha ao persistir pipelines:', err);
      return false;
    }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     CONTROLLER
     ═══════════════════════════════════════════════════════════════════════ */

  class PipelineBuilder {

    constructor(app) {
      this._app = app;
      this._pipelines = loadPipelines();
      this._activePipelineId = this._pipelines.find(p => p.isDefault)?.id || this._pipelines[0]?.id;
      this._dragStageId = null;

      this._renderPipelineList();
      this._renderEditor();
      this._bindGlobalActions();

      // BUGFIX (vazamento de memória): este listener antes era adicionado
      // dentro de _bindStageCardEvents(), que roda a cada re-render do editor
      // (toda edição de estágio). Isso empilhava um novo listener global no
      // document a cada render, sem nunca remover os anteriores — e cada um
      // fechava sobre uma referência de DOM (`listEl`) que ficava obsoleta
      // após o próximo re-render, impedindo o garbage collector de liberar
      // aquele nó desconectado. Bind único aqui, consultando o DOM atual a
      // cada clique em vez de fechar sobre uma referência antiga.
      document.addEventListener('click', () => {
        document.querySelectorAll('[data-emoji-picker]').forEach(p => { p.hidden = true; });
      });
    }

    /* ── Persistência ──────────────────────────────────────────────────── */

    _persist() {
      savePipelines(this._pipelines);
    }

    _getActivePipeline() {
      return this._pipelines.find(p => p.id === this._activePipelineId);
    }

    _toast(type, title, msg) {
      const fn = this._app?.state?.[`toast${type}`];
      if (typeof fn === 'function') fn.call(this._app.state, title, msg);
    }

    /* ── Lista de Pipelines (coluna esquerda) ─────────────────────────── */

    _renderPipelineList() {
      const body = document.getElementById('pb-pipeline-list-body');
      this._renderMobilePipelineSelect();
      if (!body) return;

      const canDelete = this._pipelines.length > 1;

      body.innerHTML = this._pipelines.map(p => {
        const stageCount = p.stages.length;
        const isActive = p.id === this._activePipelineId;
        return `
          <div class="pb-pipeline-item ${isActive ? 'active' : ''}" data-pipeline-id="${p.id}"
               role="button" tabindex="0" aria-label="${esc(p.name)}">
            <div class="pb-pipeline-item-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 20V10M12 20V4M6 20v-6"/>
              </svg>
            </div>
            <div class="pb-pipeline-item-info">
              <div class="pb-pipeline-item-name">${esc(p.name)}</div>
              <div class="pb-pipeline-item-meta">${stageCount} estágio${stageCount === 1 ? '' : 's'}</div>
            </div>
            ${p.isDefault ? '<span class="pb-pipeline-item-default-badge">Padrão</span>' : ''}
            ${canDelete ? `
              <button class="pb-pipeline-item-delete-btn" data-delete-pipeline-id="${p.id}"
                      aria-label="Excluir pipeline ${esc(p.name)}" title="Excluir pipeline"
                      style="opacity:0;transition:opacity 0.15s;color:var(--color-text-disabled);padding:4px;border-radius:6px;flex-shrink:0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            ` : ''}
          </div>
        `;
      }).join('');

      // Estilo de hover para revelar o botão de excluir (inline, sem depender de novo CSS file)
      if (!document.getElementById('pb-delete-hover-style')) {
        const style = document.createElement('style');
        style.id = 'pb-delete-hover-style';
        style.textContent = `
          .pb-pipeline-item:hover .pb-pipeline-item-delete-btn { opacity: 1 !important; }
          .pb-pipeline-item-delete-btn:hover { background: rgba(244,63,94,0.12) !important; color: var(--rose-400) !important; }
        `;
        document.head.appendChild(style);
      }

      body.querySelectorAll('.pb-pipeline-item').forEach(item => {
        const select = () => {
          this._activePipelineId = item.dataset.pipelineId;
          this._renderPipelineList();
          this._renderEditor();
        };
        item.addEventListener('click', select);
        item.addEventListener('keydown', e => { if (e.key === 'Enter') select(); });
      });

      body.querySelectorAll('[data-delete-pipeline-id]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // não seleciona o pipeline ao clicar em excluir
          await this._deletePipeline(btn.dataset.deletePipelineId);
        });
      });
    }

    /**
     * Popula e sincroniza o <select> visível apenas no breakpoint mobile
     * (ver CSS), garantindo que trocar de pipeline continue possível quando
     * a lista lateral (.pb-pipeline-list) está oculta por falta de espaço.
     */
    _renderMobilePipelineSelect() {
      const select = document.getElementById('pb-mobile-pipeline-select');
      if (!select) return;

      select.innerHTML = this._pipelines.map(p =>
        `<option value="${p.id}" ${p.id === this._activePipelineId ? 'selected' : ''}>${esc(p.name)}${p.isDefault ? ' (Padrão)' : ''}</option>`
      ).join('');

      // Usa .onchange (não addEventListener) propositalmente: sobrescreve o
      // handler anterior em vez de empilhar um novo a cada render.
      select.onchange = () => {
        this._activePipelineId = select.value;
        this._renderPipelineList();
        this._renderEditor();
      };
    }

    async _deletePipeline(pipelineId) {
      if (this._pipelines.length <= 1) {
        this._toast('Warn', 'Não é possível excluir', 'É necessário manter pelo menos um pipeline.');
        return;
      }

      const pipeline = this._pipelines.find(p => p.id === pipelineId);
      if (!pipeline) return;

      const ok = await window.ibexConfirm({
        title: 'Excluir pipeline?',
        message: `"${pipeline.name}" e seus ${pipeline.stages.length} estágio(s) serão excluídos permanentemente. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir pipeline',
        isDanger: true,
      });
      if (!ok) return;

      const wasDefault = pipeline.isDefault;
      this._pipelines = this._pipelines.filter(p => p.id !== pipelineId);

      // Se o pipeline excluído era o padrão, promove o próximo da lista
      // automaticamente — nunca podemos ficar sem nenhum pipeline padrão.
      if (wasDefault && this._pipelines.length > 0) {
        this._pipelines[0].isDefault = true;
      }

      // Se o pipeline ativo (sendo visualizado no editor) era o excluído,
      // troca para o novo padrão (ou o primeiro disponível).
      if (this._activePipelineId === pipelineId) {
        this._activePipelineId = this._pipelines.find(p => p.isDefault)?.id || this._pipelines[0]?.id;
      }

      this._persist();
      this._renderPipelineList();
      this._renderEditor();
      this._toast('Success', 'Pipeline excluído', `"${pipeline.name}" foi removido.`);
    }

    /* ── Editor de Estágios (coluna central) ──────────────────────────── */

    _renderEditor() {
      const pipeline = this._getActivePipeline();
      const titleEl  = document.getElementById('pb-editor-title');
      const subEl    = document.getElementById('pb-editor-sub');
      const listEl   = document.getElementById('pb-stage-list');
      const defaultCheckbox = document.getElementById('pb-default-checkbox');

      if (!pipeline || !listEl) return;

      if (titleEl) titleEl.textContent = pipeline.name;
      if (subEl) subEl.textContent = 'Arraste para reordenar. Clique para editar.';
      if (defaultCheckbox) {
        defaultCheckbox.checked = !!pipeline.isDefault;
        defaultCheckbox.onchange = () => this._setAsDefault(pipeline.id, defaultCheckbox.checked);
      }

      const sortedStages = pipeline.stages.slice().sort((a, b) => a.order - b.order);

      if (sortedStages.length === 0) {
        listEl.innerHTML = `
          <div class="pb-empty">
            <div style="font-size:13px;color:var(--color-text-tertiary)">
              Nenhum estágio ainda. Clique em "Adicionar estágio" para começar.
            </div>
          </div>
        `;
      } else {
        listEl.innerHTML = sortedStages.map((stage, i) => this._renderStageCard(stage, i)).join('');
      }

      this._bindStageCardEvents(listEl, pipeline);
      this._renderPreview(pipeline);
    }

    _renderStageCard(stage, index) {
      const goalDisplay = fmtCompact(stage.goal);
      return `
        <div class="pb-stage-card stagger-item" data-stage-id="${stage.id}" draggable="true" style="animation-delay:${index * 30}ms">
          <div class="pb-stage-row1">
            <span class="pb-stage-drag-handle" aria-label="Arrastar para reordenar" title="Arrastar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
            </span>

            <button class="pb-stage-icon-btn" data-action="emoji" style="background:${stage.color}22;color:${stage.color}" aria-label="Escolher ícone" title="Escolher ícone">
              ${stage.icon || '🔹'}
            </button>

            <input type="color" class="pb-stage-color-input" data-action="color" value="${stage.color}" aria-label="Cor do estágio" />

            <input type="text" class="pb-stage-name-input" data-action="name" value="${esc(stage.label)}" placeholder="Nome do estágio" aria-label="Nome do estágio" />

            <button class="pb-stage-delete-btn" data-action="delete" aria-label="Excluir estágio" title="Excluir estágio">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>

          <div class="pb-stage-row2">
            <div>
              <span class="pb-stage-field-label">Probabilidade de fechamento</span>
              <div class="pb-stage-prob-row">
                <input type="range" class="pb-stage-prob-slider" data-action="prob" min="0" max="100" step="5" value="${stage.probability}" aria-label="Probabilidade" />
                <span class="pb-stage-prob-value">${stage.probability}%</span>
              </div>
            </div>
            <div>
              <span class="pb-stage-field-label">Meta (opcional)</span>
              <input type="number" class="pb-stage-goal-input" data-action="goal" min="0" step="1000" placeholder="R$ 0" value="${stage.goal || ''}" aria-label="Meta em reais" />
            </div>
          </div>

          <div class="pb-emoji-picker" data-emoji-picker hidden>
            ${EMOJI_OPTIONS.map(e => `<button type="button" class="pb-emoji-option" data-emoji="${e}">${e}</button>`).join('')}
          </div>
        </div>
      `;
    }

    _bindStageCardEvents(listEl, pipeline) {
      listEl.querySelectorAll('.pb-stage-card').forEach(card => {
        const stageId = card.dataset.stageId;
        const stage = pipeline.stages.find(s => s.id === stageId);
        if (!stage) return;

        // Nome
        card.querySelector('[data-action="name"]')?.addEventListener('input', (e) => {
          stage.label = e.target.value;
          this._persist();
          this._renderPreview(pipeline);
          this._renderPipelineList();
        });

        // Cor
        card.querySelector('[data-action="color"]')?.addEventListener('input', (e) => {
          stage.color = e.target.value;
          const iconBtn = card.querySelector('[data-action="emoji"]');
          if (iconBtn) { iconBtn.style.background = `${stage.color}22`; iconBtn.style.color = stage.color; }
          this._persist();
          this._renderPreview(pipeline);
        });

        // Probabilidade
        const probSlider = card.querySelector('[data-action="prob"]');
        const probValue   = card.querySelector('.pb-stage-prob-value');
        probSlider?.addEventListener('input', (e) => {
          stage.probability = Number(e.target.value);
          if (probValue) probValue.textContent = `${stage.probability}%`;
          this._persist();
          this._renderPreview(pipeline);
        });

        // Meta
        card.querySelector('[data-action="goal"]')?.addEventListener('input', (e) => {
          const v = e.target.value.trim();
          stage.goal = v === '' ? null : Number(v);
          this._persist();
        });

        // Emoji picker toggle
        const emojiBtn = card.querySelector('[data-action="emoji"]');
        const emojiPicker = card.querySelector('[data-emoji-picker]');
        emojiBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('[data-emoji-picker]').forEach(p => { if (p !== emojiPicker) p.hidden = true; });

          const willOpen = emojiPicker.hidden;
          emojiPicker.hidden = !emojiPicker.hidden;

          // BUGFIX: .pb-emoji-picker usa position:fixed (para não ficar preso
          // pelo overflow do card), mas sem top/left explícitos ele herdava a
          // posição estática e aparecia deslocado. Calculamos a posição real
          // a partir do botão, com proteção contra sair da viewport.
          if (willOpen) {
            const btnRect = emojiBtn.getBoundingClientRect();
            const pickerWidth = 220; // deve bater com o width fixo em .pb-emoji-picker (css)
            let left = btnRect.left;
            let top  = btnRect.bottom + 6;

            if (left + pickerWidth > window.innerWidth - 12) {
              left = window.innerWidth - pickerWidth - 12;
            }
            if (top + 160 > window.innerHeight - 12) {
              top = btnRect.top - 166; // abre para cima se não couber embaixo
            }

            emojiPicker.style.left = `${Math.max(12, left)}px`;
            emojiPicker.style.top  = `${Math.max(12, top)}px`;
          }
        });
        emojiPicker?.querySelectorAll('.pb-emoji-option').forEach(opt => {
          opt.addEventListener('click', () => {
            stage.icon = opt.dataset.emoji;
            if (emojiBtn) emojiBtn.textContent = stage.icon;
            emojiPicker.hidden = true;
            this._persist();
            this._renderPreview(pipeline);
          });
        });

        // Excluir estágio
        card.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
          const hasGoal = stage.goal != null;
          const ok = await window.ibexConfirm({
            title: 'Excluir estágio?',
            message: `"${stage.label}" será removido do pipeline "${pipeline.name}". Leads que estiverem neste estágio precisarão ser reatribuídos manualmente.`,
            confirmLabel: 'Excluir estágio',
            isDanger: true,
          });
          if (!ok) return;

          pipeline.stages = pipeline.stages.filter(s => s.id !== stage.id);
          pipeline.stages.forEach((s, i) => { s.order = i; });
          this._persist();
          this._renderEditor();
          this._renderPipelineList();
          this._toast('Success', 'Estágio excluído', `"${stage.label}" foi removido.`);
        });

        // Drag & drop reorder
        card.addEventListener('dragstart', () => {
          this._dragStageId = stageId;
          requestAnimationFrame(() => card.classList.add('dragging'));
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          listEl.querySelectorAll('.pb-stage-card').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
          this._dragStageId = null;
        });
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!this._dragStageId || this._dragStageId === stageId) return;
          const rect = card.getBoundingClientRect();
          const isTopHalf = (e.clientY - rect.top) < rect.height / 2;
          card.classList.toggle('drag-over-top', isTopHalf);
          card.classList.toggle('drag-over-bottom', !isTopHalf);
        });
        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('drag-over-top', 'drag-over-bottom');
          if (!this._dragStageId || this._dragStageId === stageId) return;

          const draggedStage = pipeline.stages.find(s => s.id === this._dragStageId);
          if (!draggedStage) return;

          const rect = card.getBoundingClientRect();
          const isTopHalf = (e.clientY - rect.top) < rect.height / 2;

          // Remove o estágio arrastado da posição atual
          pipeline.stages = pipeline.stages.filter(s => s.id !== this._dragStageId);

          const sorted = pipeline.stages.slice().sort((a, b) => a.order - b.order);
          const targetIndex = sorted.findIndex(s => s.id === stageId);
          const insertAt = isTopHalf ? targetIndex : targetIndex + 1;

          sorted.splice(insertAt, 0, draggedStage);
          sorted.forEach((s, i) => { s.order = i; });
          pipeline.stages = sorted;

          this._persist();
          this._renderEditor();
        });
      });
    }

    /* ── Preview ao Vivo (coluna direita) ──────────────────────────────── */

    _renderPreview(pipeline) {
      const body = document.getElementById('pb-preview-body');
      if (!body) return;

      const sortedStages = pipeline.stages.slice().sort((a, b) => a.order - b.order);

      if (sortedStages.length === 0) {
        body.innerHTML = `<div class="pb-empty"><div style="font-size:12px;color:var(--color-text-tertiary)">Adicione estágios para ver o preview.</div></div>`;
        return;
      }

      body.innerHTML = sortedStages.map(stage => `
        <div class="pb-preview-col" data-stage-id="${stage.id}">
          <div class="pb-preview-col-header">
            <span class="pb-preview-col-dot" style="background:${stage.color}"></span>
            <span class="pb-preview-col-label">${stage.icon || ''} ${esc(stage.label)}</span>
            <span class="pb-preview-col-prob">${stage.probability}%</span>
          </div>
          <div class="pb-preview-card" style="border-left:2px solid ${stage.color}">
            <div style="font-size:11px;font-weight:600;color:var(--color-text-secondary)">Lead exemplo</div>
            <div style="font-size:10px;color:var(--color-text-disabled);margin-top:2px">Empresa Exemplo Ltda.</div>
          </div>
          ${stage.goal ? `<div style="font-size:10px;color:var(--color-text-tertiary);margin-top:6px;text-align:center">Meta: ${fmtCompact(stage.goal)}</div>` : ''}
        </div>
      `).join('');
    }

    /* ── Ações globais: novo pipeline, adicionar estágio, definir padrão ── */

    _bindGlobalActions() {
      // Novo pipeline
      document.getElementById('pb-new-pipeline-btn')?.addEventListener('click', () => {
        this._createNewPipeline();
      });

      // Adicionar estágio ao pipeline ativo
      document.getElementById('pb-add-stage-btn')?.addEventListener('click', () => {
        const pipeline = this._getActivePipeline();
        if (!pipeline) return;

        const newStage = {
          id: uid('stg'),
          label: 'Novo Estágio',
          order: pipeline.stages.length,
          color: COLOR_PALETTE[pipeline.stages.length % COLOR_PALETTE.length],
          probability: 20,
          icon: '🔹',
          goal: null,
        };
        pipeline.stages.push(newStage);
        this._persist();
        this._renderEditor();
        this._renderPipelineList();

        // Focar o input de nome do novo estágio recém-criado
        requestAnimationFrame(() => {
          const card = document.querySelector(`[data-stage-id="${newStage.id}"] [data-action="name"]`);
          card?.focus();
          card?.select();
        });
      });
    }

    async _createNewPipeline() {
      const name = window.prompt('Nome do novo pipeline:', 'Novo Pipeline');
      if (!name || !name.trim()) return;

      const newPipeline = {
        id: uid('pl'),
        name: name.trim(),
        isDefault: false,
        createdAt: new Date().toISOString(),
        stages: [
          { id: uid('stg'), label: 'Novo Lead', order: 0, color: '#6366f1', probability: 10, icon: '👤', goal: null },
          { id: uid('stg'), label: 'Em Andamento', order: 1, color: '#0ea5e9', probability: 40, icon: '⏰', goal: null },
          { id: uid('stg'), label: 'Fechado', order: 2, color: '#10b981', probability: 100, icon: '🎉', goal: null },
        ],
      };

      this._pipelines.push(newPipeline);
      this._activePipelineId = newPipeline.id;
      this._persist();
      this._renderPipelineList();
      this._renderEditor();
      this._toast('Success', 'Pipeline criado', `"${newPipeline.name}" está pronto para customização.`);
    }

    _setAsDefault(pipelineId, isDefault) {
      if (!isDefault) return; // não permite "desmarcar" sem marcar outro como padrão

      this._pipelines.forEach(p => { p.isDefault = (p.id === pipelineId); });
      this._persist();
      this._renderPipelineList();

      const pipeline = this._pipelines.find(p => p.id === pipelineId);
      this._toast('Success', 'Pipeline padrão atualizado', `"${pipeline.name}" agora é usado para novos leads.`);

      // Sincronizar imediatamente o EventBus/State, se disponível, para o Kanban
      // real (pipeline.html) refletir a mudança na próxima navegação.
      document.dispatchEvent(new CustomEvent('ibex:pipeline:default-changed', { detail: { pipelineId } }));
    }
  }

  /* ── Bootstrap ─────────────────────────────────────────────────────────── */

  function init() {
    if (!window.Ibex?.storage) {
      return setTimeout(init, 50);
    }
    window.Ibex.pipelineBuilder = new PipelineBuilder(window.Ibex);
    console.info('[PipelineBuilder] Módulo v1.0 inicializado.');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
