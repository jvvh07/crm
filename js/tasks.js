// js/tasks.js

/**
 * BUGFIX (auditoria de segurança): título da tarefa, nome de lead e empresa
 * são campos editáveis pelo usuário e eram inseridos sem escape via innerHTML.
 */
function escTasks(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

class TasksController {
  constructor(app) {
    this._app = app;
    this._state = app.state;
    this._storage = app.storage;
    
    this._filter = 'all'; // all, pending, done
    
    this._bindEvents();
    this._init();
  }

  _init() {
    this._state.subscribe('ibex:task:created', () => this._render());
    this._state.subscribe('ibex:task:updated', () => this._render());
    this._state.subscribe('ibex:task:deleted', () => this._render());
    
    this._render();
  }

  _bindEvents() {
    const btnNew = document.getElementById('btn-new-task');
    if (btnNew) {
      btnNew.addEventListener('click', () => this._openModal());
    }

    const filters = document.querySelectorAll('.task-filters .btn');
    filters.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filters.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this._filter = e.target.dataset.filter;
        this._render();
      });
    });

    const form = document.getElementById('form-task');
    if (form) {
      form.addEventListener('submit', e => this._handleSave(e));
    }
    
    const btnDelete = document.getElementById('btn-delete-task');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => this._handleDelete());
    }
  }

  _openModal(task = null) {
    const form = document.getElementById('form-task');
    form.reset();
    document.getElementById('tf-id').value = '';
    
    const leadSelect = document.getElementById('tf-lead');
    leadSelect.innerHTML = '<option value="">— Nenhum —</option>';
    const leads = this._storage.getLeads();
    leads.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = `${l.fullName} (${l.company})`;
      leadSelect.appendChild(opt);
    });

    const btnDelete = document.getElementById('btn-delete-task');
    
    if (task) {
      document.getElementById('task-modal-title').textContent = 'Editar Tarefa';
      document.getElementById('tf-id').value = task.id;
      document.getElementById('tf-title').value = task.title;
      document.getElementById('tf-type').value = task.type;
      document.getElementById('tf-priority').value = task.priority;
      document.getElementById('tf-lead').value = task.leadId || '';
      if (task.dueDate) {
        document.getElementById('tf-due').value = task.dueDate.split('T')[0];
      }
      document.getElementById('tf-notes').value = task.notes || '';
      btnDelete.classList.remove('hidden');
    } else {
      document.getElementById('task-modal-title').textContent = 'Nova Tarefa';
      btnDelete.classList.add('hidden');
    }

    const modal = document.getElementById('modal-task-form');
    modal.hidden = false;
    modal.classList.add('fade-in');
  }

  _handleSave(e) {
    e.preventDefault();
    const id = document.getElementById('tf-id').value;
    
    const leadId = document.getElementById('tf-lead').value;
    let leadName = '';
    let company = '';
    if (leadId) {
      const lead = this._storage.getLeadById(leadId);
      if (lead) {
        leadName = lead.fullName;
        company = lead.company;
      }
    }

    const data = {
      title: document.getElementById('tf-title').value,
      type: document.getElementById('tf-type').value,
      priority: document.getElementById('tf-priority').value,
      leadId: leadId || null,
      leadName,
      company,
      dueDate: document.getElementById('tf-due').value ? new Date(document.getElementById('tf-due').value).toISOString() : null,
      notes: document.getElementById('tf-notes').value,
    };

    if (id) {
      this._storage.updateTask(id, data);
      this._state.toastSuccess('Tarefa atualizada', 'A tarefa foi salva.');
    } else {
      this._storage.createTask(data);
      this._state.toastSuccess('Tarefa criada', 'Nova tarefa adicionada à sua lista.');
    }

    document.getElementById('modal-task-form').hidden = true;
    this._render();
  }

  _handleDelete() {
    const id = document.getElementById('tf-id').value;
    if (!id) return;
    
    if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
      const tasks = this._storage._read('ibex_tasks') || [];
      const filtered = tasks.filter(t => t.id !== id);
      this._storage._write('ibex_tasks', filtered);
      this._state.toastSuccess('Excluída', 'A tarefa foi removida.');
      document.getElementById('modal-task-form').hidden = true;
      this._render();
    }
  }

  _toggleDone(id) {
    const tasks = this._storage.getTasks();
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    const isDone = task.status === 'done';
    this._storage.updateTask(id, {
      status: isDone ? 'pending' : 'done',
      completedAt: isDone ? null : new Date().toISOString()
    });
    
    this._render();
  }

  _render() {
    const allTasks = this._storage.getTasks();
    
    // Filter
    let tasks = allTasks;
    if (this._filter === 'pending') tasks = allTasks.filter(t => t.status !== 'done');
    else if (this._filter === 'done') tasks = allTasks.filter(t => t.status === 'done');

    const now = new Date();
    now.setHours(0,0,0,0);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const urgent = [];
    const today = [];
    const upcoming = [];
    const completed = [];

    tasks.forEach(t => {
      if (t.status === 'done') {
        completed.push(t);
        return;
      }
      
      if (!t.dueDate) {
        upcoming.push(t);
        return;
      }

      const due = new Date(t.dueDate);
      due.setHours(0,0,0,0);
      
      if (due < now || t.priority === 'urgent') {
        urgent.push(t);
      } else if (due.getTime() === now.getTime()) {
        today.push(t);
      } else {
        upcoming.push(t);
      }
    });

    this._renderCol('urgent', urgent);
    this._renderCol('today', today);
    this._renderCol('upcoming', upcoming);
    
    // For completed, sort by most recent completedAt
    completed.sort((a,b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt));
    this._renderCol('completed', completed.slice(0, 20)); // show only recent 20
  }

  _renderCol(colId, tasks) {
    const container = document.getElementById(`list-${colId}`);
    const countEl = document.getElementById(`count-${colId}`);
    if (!container || !countEl) return;

    countEl.textContent = tasks.length;
    container.innerHTML = '';

    if (tasks.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:24px 12px; color:var(--text-muted); font-size:0.875rem;">Nenhuma tarefa</div>`;
      return;
    }

    const typeIcons = {
      call: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
      email: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
      meeting: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      follow_up: '<polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>',
      proposal: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
    };

    tasks.forEach(t => {
      const isDone = t.status === 'done';
      const checkSVG = isDone 
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        : '';

      const badgeClass = t.priority ? `badge-${t.priority}` : 'badge-low';
      const typeLabel = t.type ? t.type.toUpperCase() : 'TAREFA';
      const iconStr = typeIcons[t.type] || typeIcons.follow_up;

      const dateStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : '';

      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-card-header">
          <div class="task-checkbox ${isDone ? 'done' : ''}" data-id="${t.id}">
            ${checkSVG}
          </div>
          <div class="task-card-title" style="text-decoration: ${isDone ? 'line-through' : 'none'}; opacity: ${isDone ? '0.6' : '1'}">${escTasks(t.title)}</div>
        </div>
        ${t.leadName ? `<div class="task-card-lead"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${escTasks(t.leadName)} ${t.company ? `(${escTasks(t.company)})` : ''}</div>` : ''}
        <div class="task-card-meta">
          <span class="task-badge ${badgeClass}">${t.priority || 'Normal'}</span>
          <span style="display:flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconStr}</svg></span>
          ${dateStr ? `<span style="margin-left:auto;">${dateStr}</span>` : ''}
        </div>
      `;

      // Prevent triggering edit when clicking checkbox
      card.querySelector('.task-checkbox').addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleDone(t.id);
      });

      card.addEventListener('click', () => this._openModal(t));
      
      container.appendChild(card);
    });
  }
}

Ibex.register((app) => {
  if (app.state.getCurrentPage() === 'tasks') {
    new TasksController(app);
  }
});
