// public/js/intercom.js - MCP Intercom HUD & First-Person Monitor Cockpit
import { audioSynth } from './audio.js';

export class IntercomController {
  constructor(app) {
    this.app = app;
    this.activeTab = 'chat';
    this.currentMonitorAgentId = null;

    this.bindDomElements();
    this.bindEvents();
  }

  bindDomElements() {
    this.modalEl = document.getElementById('intercom-modal');
    this.monitorEl = document.getElementById('monitor-cockpit');
    this.chatFeedEl = document.getElementById('chat-feed');
    this.chatInputEl = document.getElementById('chat-input');
    this.recipientSelectEl = document.getElementById('recipient-select');
    this.sendBtnEl = document.getElementById('send-btn');
    this.sprintBtnEl = document.getElementById('btn-sprint');
    this.whiteboardContainerEl = document.getElementById('whiteboard-cards');
    this.agentsGridEl = document.getElementById('agents-grid');
    this.protocolLogEl = document.getElementById('protocol-log');
  }

  bindEvents() {
    // Intercom modal toggle
    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        if (!this.isInputFocused()) {
          e.preventDefault();
          this.toggleIntercom();
        }
      }
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    document.getElementById('btn-open-intercom')?.addEventListener('click', () => {
      this.openIntercom();
    });

    document.getElementById('btn-close-intercom')?.addEventListener('click', () => {
      this.closeIntercom();
    });

    document.getElementById('btn-close-monitor')?.addEventListener('click', () => {
      this.closeMonitor();
    });

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Send message
    this.sendBtnEl?.addEventListener('click', () => this.sendMessage());
    this.chatInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    // Sprint button
    this.sprintBtnEl?.addEventListener('click', () => {
      const topic = prompt('Enter Collaborative Sprint Topic:', 'Pixel Quest 16-Bit Boss Battle Mini-Game');
      if (topic) {
        this.app.sendWebSocketAction({ type: 'trigger_sprint', feature: topic });
        audioSynth.playChime();
        this.closeIntercom();
      }
    });

    // Submit Job handler
    document.getElementById('btn-submit-job')?.addEventListener('click', () => {
      const agentId = document.getElementById('job-agent-select')?.value || 'alice';
      const title = document.getElementById('job-title-input')?.value?.trim();
      const desc = document.getElementById('job-desc-input')?.value?.trim();
      if (!title) {
        alert('Please enter a Job Title');
        return;
      }
      this.app.sendWebSocketAction({
        type: 'assign_task',
        agentId,
        title,
        description: desc,
        category: 'Feature'
      });
      audioSynth.playChime();
      if (document.getElementById('job-title-input')) document.getElementById('job-title-input').value = '';
      if (document.getElementById('job-desc-input')) document.getElementById('job-desc-input').value = '';
      this.switchTab('whiteboard');
    });

    // Token Saver toggle
    let ecoOn = true;
    document.getElementById('btn-eco-toggle')?.addEventListener('click', (e) => {
      ecoOn = !ecoOn;
      fetch('/api/eco', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: ecoOn }) }).catch(() => {});
      const btn = document.getElementById('btn-eco-toggle');
      if (btn) btn.textContent = ecoOn ? '🌱 Token Saver: ON' : '⚡ Token Saver: OFF';
      audioSynth.playBleep();
    });

    // Clear demo jobs handler
    document.getElementById('btn-clear-jobs')?.addEventListener('click', () => {
      if (confirm('Clear all demo jobs from the whiteboard and reset agent workspaces to a clean slate?')) {
        this.app.sendWebSocketAction({ type: 'clear_jobs' });
        this.app.state.whiteboard = [];
        this.renderWhiteboard();
        audioSynth.playChime();
      }
    });

    // Save API Keys handler
    document.getElementById('btn-save-keys')?.addEventListener('click', () => {
      const geminiKey = document.getElementById('key-gemini')?.value?.trim();
      const claudeKey = document.getElementById('key-claude')?.value?.trim();
      const openaiKey = document.getElementById('key-openai')?.value?.trim();

      this.app.sendWebSocketAction({
        type: 'save_keys',
        geminiKey,
        claudeKey,
        openaiKey
      });

      const statusEl = document.getElementById('keys-save-status');
      if (statusEl) {
        statusEl.textContent = '✓ Saved to .env! Connected.';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
      }
      audioSynth.playChime();
    });

    // Monitor cycle buttons
    document.getElementById('btn-prev-monitor')?.addEventListener('click', () => this.cycleMonitor(-1));
    document.getElementById('btn-next-monitor')?.addEventListener('click', () => this.cycleMonitor(1));
    document.getElementById('btn-monitor-talk')?.addEventListener('click', () => {
      if (this.currentMonitorAgentId) {
        this.openIntercom('chat', this.currentMonitorAgentId);
      }
    });
  }

  isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  toggleIntercom() {
    if (this.modalEl.classList.contains('hidden')) {
      this.openIntercom();
    } else {
      this.closeIntercom();
    }
  }

  openIntercom(tab = 'chat', targetRecipient = null) {
    this.modalEl.classList.remove('hidden');
    this.switchTab(tab);
    if (targetRecipient && this.recipientSelectEl) {
      this.recipientSelectEl.value = targetRecipient;
    }
    this.chatInputEl?.focus();
    audioSynth.playBleep();
  }

  closeIntercom() {
    this.modalEl.classList.add('hidden');
  }

  closeAllModals() {
    this.closeIntercom();
    this.closeMonitor();
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-400');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-400');
      }
    });

    document.querySelectorAll('.tab-pane').forEach((pane) => {
      if (pane.id === `tab-${tab}`) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });

    if (tab === 'whiteboard') this.renderWhiteboard();
    if (tab === 'agents') this.renderAgentsGrid();
    if (tab === 'protocol') this.renderProtocolLog();
  }

  sendMessage() {
    const text = this.chatInputEl?.value?.trim();
    if (!text) return;

    const recipient = this.recipientSelectEl?.value || 'all';
    if (recipient === 'all') {
      this.app.sendWebSocketAction({ type: 'broadcast', text, sender: 'player' });
    } else {
      this.app.sendWebSocketAction({ type: 'send_message', recipient, text, sender: 'player' });
    }

    this.chatInputEl.value = '';
    audioSynth.playKeyClick();
  }

  // First-Person Monitor Cockpit
  openMonitor(agentId) {
    this.currentMonitorAgentId = agentId;
    this.monitorEl.classList.remove('hidden');
    this.updateMonitorContent(agentId);
    audioSynth.playBleep();
  }

  closeMonitor() {
    this.monitorEl.classList.add('hidden');
    this.currentMonitorAgentId = null;
  }

  cycleMonitor(offset) {
    const agentIds = Object.keys(this.app.state.agents);
    const currIdx = agentIds.indexOf(this.currentMonitorAgentId);
    let nextIdx = (currIdx + offset) % agentIds.length;
    if (nextIdx < 0) nextIdx += agentIds.length;
    this.openMonitor(agentIds[nextIdx]);
  }

  updateMonitorContent(agentId) {
    const agent = this.app.state.agents[agentId];
    if (!agent) return;

    document.getElementById('mon-agent-name').textContent = `${agent.name.toUpperCase()} // ${agent.role}`;
    document.getElementById('mon-agent-name').style.color = agent.color || '#38bdf8';
    document.getElementById('mon-agent-status').textContent = agent.status;
    document.getElementById('mon-agent-state').textContent = `[STATE: ${agent.state}]`;
    const eBar = document.getElementById('mon-agent-energy');
    eBar.style.width = `${agent.energy}%`;
    eBar.style.background = agent.energy > 50 ? '#22c55e' : agent.energy > 20 ? '#f59e0b' : '#ef4444';
    const tb = agent.tokenBudget;
    document.getElementById('mon-agent-coffee').textContent = tb
      ? `🔋 ${Math.max(0, tb.limit - tb.used).toLocaleString()} / ${tb.limit.toLocaleString()} tokens left`
      : `🔋 ${agent.energy}%`;

    document.getElementById('mon-filename').textContent = `${agent.screen.title} // ${agent.screen.file}`;

    // Editor lines
    const linesEl = document.getElementById('mon-editor-lines');
    linesEl.innerHTML = agent.screen.lines
      .map(
        (line, idx) =>
          `<div class="flex hover:bg-slate-800/50"><span class="w-8 text-right text-slate-500 mr-3 select-none">${
            idx + 1
          }</span><span class="text-green-300 font-mono">${this.escapeHtml(line)}</span></div>`
      )
      .join('');

    // Thoughts
    document.getElementById('mon-thoughts').textContent = `"${agent.screen.thoughts}"`;

    // Logs
    const logsEl = document.getElementById('mon-terminal-logs');
    logsEl.innerHTML = agent.screen.logs
      .slice(-6)
      .map((log) => `<div class="text-slate-300 text-xs font-mono">${this.escapeHtml(log)}</div>`)
      .join('');
  }

  renderChatFeed() {
    if (!this.chatFeedEl) return;
    const msgs = this.app.state.intercomMessages || [];
    this.chatFeedEl.innerHTML = msgs
      .slice(-25)
      .map((m) => {
        const isBroadcast = m.recipient === 'all';
        const senderColor = this.app.state.agents[m.sender]?.color || '#38bdf8';
        return `
          <div class="mb-2 p-2 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono">
            <div class="flex justify-between items-center mb-1 text-slate-400">
              <span>
                <strong style="color: ${senderColor}">${m.sender.toUpperCase()}</strong>
                ${isBroadcast ? '<span class="text-amber-400">-> [ALL]</span>' : `<span class="text-slate-400">-> @${m.recipient}</span>`}
              </span>
              <span class="text-[10px] text-slate-500">${m.timestamp}</span>
            </div>
            <div class="text-slate-200">${this.escapeHtml(m.text)}</div>
          </div>
        `;
      })
      .join('');

    this.chatFeedEl.scrollTop = this.chatFeedEl.scrollHeight;
  }

  renderWhiteboard() {
    if (!this.whiteboardContainerEl) return;
    const cards = this.app.state.whiteboard || [];
    this.whiteboardContainerEl.innerHTML = cards
      .map((c) => {
        const statusCol = c.status === 'DONE' ? 'text-green-400 border-green-700' : 'text-amber-400 border-amber-700';
        return `
          <div class="p-3 bg-slate-900/70 border ${statusCol} rounded-lg text-xs font-mono mb-2">
            <div class="flex justify-between items-center mb-1">
              <span class="font-bold text-white">${this.escapeHtml(c.title)}</span>
              <span class="px-2 py-0.5 rounded text-[10px] bg-slate-800">${c.status}</span>
            </div>
            <div class="text-slate-400 text-[11px] mb-2">${this.escapeHtml(c.category)} | Assignee: @${c.assignee}</div>
            <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div class="bg-blue-500 h-full" style="width: ${c.progress}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  renderAgentsGrid() {
    if (!this.agentsGridEl) return;
    const agents = Object.values(this.app.state.agents);
    this.agentsGridEl.innerHTML = agents
      .map(
        (a) => `
        <div class="p-3 bg-slate-900/80 border border-slate-700 rounded-lg text-xs font-mono">
          <div class="flex justify-between items-center mb-1">
            <span class="font-bold text-sm" style="color: ${a.color}">${a.name}</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">${a.state}</span>
          </div>
          <div class="text-slate-400 mb-2">${a.role}</div>
          <div class="text-[11px] text-slate-300 mb-2">Task: ${this.escapeHtml(a.currentTask)}</div>
          <div class="flex justify-between text-slate-400 text-[10px] mb-2">
            <span>🔋 Tokens left: ${a.energy}%</span>
            <span>☕ ${a.coffeeCups} breaks</span>
          </div>
          <div class="h-1.5 bg-slate-800 rounded mb-2 overflow-hidden"><div class="h-full" style="width:${a.energy}%;background:${a.energy > 50 ? '#22c55e' : a.energy > 20 ? '#f59e0b' : '#ef4444'}"></div>
          </div>
          <button class="w-full py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-center btn-inspect" data-agent="${
            a.id
          }">
            Inspect Monitor [E]
          </button>
        </div>
      `
      )
      .join('');

    this.agentsGridEl.querySelectorAll('.btn-inspect').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.agent;
        this.closeIntercom();
        this.openMonitor(id);
      });
    });
  }

  renderProtocolLog() {
    if (!this.protocolLogEl) return;
    const items = [
      { method: 'tools/call', tool: 'workroom_broadcast', status: '200 OK', latency: '1.2ms' },
      { method: 'tools/call', tool: 'workroom_send_agent_message', status: '200 OK', latency: '0.8ms' },
      { method: 'resources/read', uri: 'workroom://screens/alice', status: '200 OK', latency: '0.5ms' },
      { method: 'tools/call', tool: 'workroom_update_agent_screen', status: '200 OK', latency: '1.4ms' },
      { method: 'tools/list', params: 'count=8', status: '200 OK', latency: '0.3ms' }
    ];

    this.protocolLogEl.innerHTML = items
      .map(
        (it) => `
        <div class="p-2 mb-1 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] flex justify-between">
          <span class="text-purple-400">${it.method} <span class="text-cyan-300">${it.tool || it.uri || it.params}</span></span>
          <span class="text-green-400">${it.status} (${it.latency})</span>
        </div>
      `
      )
      .join('');
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
