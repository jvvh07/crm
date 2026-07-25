// js/inbox.js

/**
 * BUGFIX (auditoria de segurança): esta função não existia neste arquivo.
 * name/subject/preview/body das mensagens vêm de dados de leads (editáveis
 * pelo usuário via formulário) ou futuramente de integrações reais
 * (WhatsApp/Email) — sem escape, um nome de lead como "<img src=x onerror=...>"
 * executaria como HTML/JS ao ser renderizado. Corrigido aplicando esc() em
 * todo campo de texto livre inserido via innerHTML abaixo.
 */
function escInbox(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

class InboxController {
  constructor(app) {
    this._app = app;
    this._state = app.state;
    this._storage = app.storage;
    
    this._filter = 'all'; // all, unread
    this._messages = this._loadOrGenerateMessages();
    this._activeMsgId = null;

    this._bindEvents();
    this._renderList();
  }

  _loadOrGenerateMessages() {
    // Try to load from localStorage first
    const stored = this._storage._read('ibex_inbox');
    if (stored && stored.length > 0) return stored;

    // Otherwise generate mock messages based on existing leads
    const leads = this._storage.getLeads() || [];
    if (!leads.length) return [];
    
    const subjects = [
      'Re: Proposta Comercial',
      'Dúvida sobre implementação',
      'Podemos agendar uma call?',
      'Encaminhando contrato assinado',
      'Feedback sobre a demonstração',
      'Preciso de ajuda com a integração',
      'Atualização de status do projeto'
    ];
    
    const now = new Date();
    const messages = [];
    
    for (let i = 0; i < Math.min(leads.length, 12); i++) {
      const l = leads[i];
      const date = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
      
      let timeStr = '';
      if (date.toDateString() === now.toDateString()) {
        timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } else if (date.toDateString() === new Date(now.getTime() - 86400000).toDateString()) {
        timeStr = 'Ontem';
      } else {
        timeStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      }

      messages.push({
        id: `msg-${i}-${Date.now()}`,
        leadId: l.id,
        name: l.fullName,
        email: l.email,
        company: l.company,
        subject: subjects[i % subjects.length],
        preview: 'Olá Juan, estive analisando os materiais que você me enviou e...',
        // BUGFIX (auditoria): l.fullName/l.role/l.company são escapados aqui porque
        // este template já contém HTML legítimo (<br>, <strong>) misturado com dados
        // do lead — escapar no momento do render quebraria a formatação de quebra de
        // linha. A escapagem precisa acontecer na origem, só nos dados do usuário.
        body: `Olá Juan,<br><br>Estive analisando os materiais que você me enviou e acho que a solução se encaixa muito bem no que estamos buscando para o nosso próximo trimestre.<br><br>Gostaria de entender melhor como funciona a fase de implementação e se existe algum custo adicional de setup.<br><br>Você tem disponibilidade para uma rápida call na próxima terça-feira?<br><br>Aguardo seu retorno.<br><br>Atenciosamente,<br><strong>${escInbox(l.fullName)}</strong><br>${escInbox(l.role)} | ${escInbox(l.company)}`,
        time: timeStr,
        timestamp: date.getTime(),
        unread: i < 4,
        avatar: l.fullName.charAt(0).toUpperCase()
      });
    }
    
    // Sort by timestamp descending
    messages.sort((a, b) => b.timestamp - a.timestamp);
    this._storage._write('ibex_inbox', messages);
    return messages;
  }

  _saveMessages() {
    this._storage._write('ibex_inbox', this._messages);
  }

  _bindEvents() {
    const filters = document.querySelectorAll('.inbox-filters .btn');
    filters.forEach((btn, idx) => {
      btn.addEventListener('click', (e) => {
        filters.forEach(b => b.classList.remove('active', 'btn-primary'));
        filters.forEach(b => b.classList.add('btn-secondary'));
        
        e.target.classList.remove('btn-secondary');
        e.target.classList.add('active', 'btn-primary');
        
        this._filter = idx === 0 ? 'all' : 'unread';
        this._renderList();
      });
    });

    const btnReply = document.querySelector('.thread-reply-actions .btn-primary');
    if (btnReply) {
      btnReply.addEventListener('click', () => {
        const textarea = document.querySelector('.thread-reply textarea');
        if (!textarea.value.trim()) {
          this._state.toastError('Erro', 'A mensagem não pode estar vazia.');
          return;
        }
        this._state.toastSuccess('Enviado', 'Sua resposta foi encaminhada com sucesso.');
        textarea.value = '';
      });
    }
    
    const btnMarkRead = document.getElementById('btn-mark-read');
    if (btnMarkRead) {
      btnMarkRead.addEventListener('click', () => {
        const msg = this._messages.find(m => m.id === this._activeMsgId);
        if (msg) {
          msg.unread = !msg.unread;
          this._saveMessages();
          this._renderList();
          this._renderThread(msg);
        }
      });
    }
  }

  _renderList() {
    const list = document.getElementById('inbox-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    let msgs = this._messages;
    if (this._filter === 'unread') {
      msgs = msgs.filter(m => m.unread);
    }

    if (msgs.length === 0) {
      list.innerHTML = `<div style="padding: 40px 24px; text-align: center; color: var(--text-tertiary);">Nenhuma mensagem encontrada.</div>`;
      return;
    }

    msgs.forEach(msg => {
      const el = document.createElement('div');
      el.className = `inbox-item ${msg.unread ? 'unread' : ''} ${msg.id === this._activeMsgId ? 'active' : ''}`;
      
      el.innerHTML = `
        <div class="inbox-item-avatar">${escInbox(msg.avatar)}</div>
        <div class="inbox-item-content">
          <div class="inbox-item-top">
            <span class="inbox-item-name">${escInbox(msg.name)}</span>
            <span class="inbox-item-time">${escInbox(msg.time)}</span>
          </div>
          <div class="inbox-item-subject">${escInbox(msg.subject)}</div>
          <div class="inbox-item-preview">${escInbox(msg.preview)}</div>
        </div>
      `;
      
      el.addEventListener('click', () => {
        this._activeMsgId = msg.id;
        if (msg.unread) {
          msg.unread = false;
          this._saveMessages();
        }
        this._renderList(); // update active state
        this._renderThread(msg);
      });
      
      list.appendChild(el);
    });
  }

  _renderThread(msg) {
    document.getElementById('empty-thread').classList.add('hidden');
    const threadContent = document.getElementById('thread-content');
    threadContent.classList.remove('hidden');
    
    // Animate thread entrance
    threadContent.style.animation = 'none';
    threadContent.offsetHeight; /* trigger reflow */
    threadContent.style.animation = 'fade-in 0.3s ease-out forwards';
    
    // We recreate the header dynamically to match the premium CSS
    const headerHtml = `
      <div class="thread-header-main">
        <div class="thread-avatar">${escInbox(msg.avatar)}</div>
        <div>
          <h2 id="thread-subject">${escInbox(msg.subject)}</h2>
          <div id="thread-sender">
            <strong>${escInbox(msg.name)}</strong> &lt;${escInbox(msg.email)}&gt; · ${escInbox(msg.company)}
          </div>
        </div>
      </div>
      <div class="thread-actions">
        <button class="btn btn-secondary btn-sm" id="btn-mark-read">${msg.unread ? 'Marcar como lido' : 'Marcar como não lido'}</button>
      </div>
    `;
    
    const threadHeader = document.querySelector('.thread-header');
    threadHeader.innerHTML = headerHtml;
    
    // Re-bind the mark as read button since we replaced the HTML
    document.getElementById('btn-mark-read').addEventListener('click', () => {
      msg.unread = !msg.unread;
      this._saveMessages();
      this._renderList();
      this._renderThread(msg); // re-render to update button text
    });
    
    document.getElementById('thread-body').innerHTML = `<div class="thread-body-msg">${msg.body}</div>`;
  }
}

Ibex.register((app) => {
  if (app.state.getCurrentPage() === 'inbox') {
    new InboxController(app);
  }
});
