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

  // ---------------------------------------------------------------- Models tab: choose and download local models
  async refreshModels() {
    const el = document.getElementById('models-body');
    if (!el) return;
    try {
      this.models = await (await fetch('/api/local/models')).json();
      if (this.models.pull && !this.models.pull.done) this.pull = this.models.pull;
    } catch {
      el.textContent = 'Could not reach the server.';
      return;
    }
    this.renderModels();
  }

  renderModels() {
    const el = document.getElementById('models-body');
    const o = this.models;
    if (!el || !o) return;
    const esc = (s) => this.escapeHtml(String(s));
    const btn = 'px-2 py-1 rounded border text-[11px] transition';
    // video memory (VRAM): green fits, amber is tight, red is too big (runs partly on the CPU and gets slow)
    const fitBorder = { fits: 'border-emerald-700 text-emerald-200', tight: 'border-amber-600 text-amber-200', toobig: 'border-rose-800 text-rose-300', unknown: 'border-slate-600 text-slate-200' };
    const fitText = { fits: 'text-emerald-400', tight: 'text-amber-400', toobig: 'text-rose-400', unknown: 'text-slate-500' };
    const fitHint = { fits: 'fits on your graphics card', tight: 'tight: may need most of your video memory', toobig: 'too big for your video memory: part runs on the CPU and is much slower', unknown: 'video memory of your card is unknown' };

    if (!o.available) {
      el.innerHTML = `<div class="p-4 rounded-xl bg-slate-950 border border-slate-800">
        <div class="text-amber-300 font-semibold mb-1">⚪ No local model server found</div>
        <div class="text-slate-400 mb-3">${esc(o.reason || '')}</div>
        <ol class="list-decimal ml-5 text-slate-300 space-y-1 mb-3">
          <li>Install <strong>Ollama</strong> (free): <span class="text-cyan-300">ollama.com</span></li>
          <li>Start it, then press the button below.</li>
          <li>Come back to this tab: you can download and pick models right here.</li>
        </ol>
        <button data-act="refresh" class="${btn} border-cyan-600 text-cyan-200 hover:bg-cyan-900/40">↻ Check again</button></div>`;
      this.bindModels(el);
      return;
    }

    const pull = this.pull && !this.pull.done ? this.pull : null;
    const installed = o.installed
      .map((m, i) => `
        <div class="p-2.5 rounded-lg bg-slate-950 border ${m.chat || m.build ? 'border-cyan-700/70' : 'border-slate-800'}">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-slate-100 break-all">${esc(m.name)}</span>
            <span class="text-slate-500">${m.gb ? m.gb + ' GB' : ''}</span>
            ${m.vram ? `<span class="${fitText[m.fit]}" title="${fitHint[m.fit]}">~${m.vram} GB VRAM${m.loadedVram != null ? ` · using ${m.loadedVram} GB now` : ''}</span>` : ''}
            ${m.tools
              ? '<span class="px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-[10px]" title="Can use tools, so it can write files in a build">tools</span>'
              : '<span class="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px]" title="Cannot use tools: fine for chat, usually writes no files in a build">no tools</span>'}
            <span class="ml-auto flex gap-1">
              <button data-act="sel-chat" data-model="${esc(m.name)}" class="${btn} ${m.chat ? 'bg-cyan-700 border-cyan-500 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}" title="Use this model for chat answers">${m.chat ? '✓ ' : ''}Chat</button>
              <button data-act="sel-build" data-model="${esc(m.name)}" class="${btn} ${m.build ? 'bg-purple-700 border-purple-500 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}" title="Use this model when a build falls back to a local model">${m.build ? '✓ ' : ''}Build</button>
              <button data-act="try" data-model="${esc(m.name)}" data-i="${i}" class="${btn} border-slate-700 text-slate-300 hover:bg-slate-800" title="Ask it to say hello">Try</button>
            </span>
          </div>
          <div id="try-${i}" class="mt-1 text-slate-400 hidden"></div>
        </div>`)
      .join('');

    // One card per model family with a ladder of sizes ("B" = billions of parameters)
    const familyCard = (f) => `
        <div class="p-2.5 rounded-lg bg-slate-950 border ${f.uncensored ? 'border-amber-800/60' : 'border-slate-800'}">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-slate-100">${esc(f.label)}</span>
            ${f.tools ? '<span class="px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-[10px]">tools</span>' : ''}
            ${f.uncensored ? '<span class="px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-300 text-[10px]">uncensored</span>' : ''}
            <span class="text-slate-600 break-all">${esc(f.name)}</span>
          </div>
          <div class="text-slate-500 mb-1.5">${esc(f.why)}</div>
          <div class="flex flex-wrap gap-1.5">${f.sizes
            .map((x) =>
              x.installed
                ? `<span class="${btn} border-emerald-700 text-emerald-300">✓ ${esc(x.tag.toUpperCase())}</span>`
                : `<button data-act="pull" data-model="${esc(x.model)}" data-gb="${x.gb}" ${pull || !o.canPull ? 'disabled' : ''} class="${btn} ${fitBorder[x.fit]} hover:bg-cyan-900/40 disabled:opacity-40 disabled:cursor-not-allowed" title="Download ${esc(x.model)} (about ${x.gb} GB). Needs about ${x.vram} GB of video memory: ${fitHint[x.fit]}">⬇ ${esc(x.tag.toUpperCase())} · ${x.gb} GB · ~${x.vram} GB VRAM</button>`
            )
            .join('')}</div>
        </div>`;
    const standard = o.families.filter((f) => !f.uncensored).map(familyCard).join('');
    const uncensored = o.families.filter((f) => f.uncensored).map(familyCard).join('');

    const progress = pull
      ? `<div class="p-3 rounded-xl bg-slate-950 border border-cyan-700/70">
          <div class="flex items-center justify-between mb-1"><span class="font-bold text-cyan-200">Downloading ${esc(pull.model)}</span>
            <button data-act="cancel" class="${btn} border-rose-700 text-rose-200 hover:bg-rose-900/40">Cancel</button></div>
          <div class="h-2.5 bg-slate-800 rounded-full overflow-hidden"><div id="pull-bar" class="h-full rounded-full" style="width:${pull.percent}%;background:linear-gradient(90deg,#2563eb,#22d3ee);transition:width .3s"></div></div>
          <div id="pull-text" class="mt-1 text-slate-400">${esc(this.pullText(pull))}</div></div>`
      : '';

    el.innerHTML = `
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 mb-3">
        <div class="text-emerald-300 font-semibold">🟢 ${esc(o.kind)} is running</div>
        <div class="text-slate-400 mt-0.5">Chat answers: <strong class="text-slate-100">${esc(o.chatModel)}</strong> · Builds: <strong class="text-slate-100">${o.canBuild ? esc(o.buildModel) : 'not supported here'}</strong></div>
        <div class="text-slate-400 mt-0.5">🎮 ${o.gpu
          ? `${esc(o.gpu.name)} · <strong class="text-slate-100">${o.gpu.totalGB} GB</strong> video memory (${o.gpu.freeGB} GB free right now)`
          : 'Video memory unknown (only NVIDIA cards are detected; put GPU_VRAM_GB=12 in .env to tell it)'}${o.loaded && o.loaded.length ? ` · in memory now: ${o.loaded.map((m) => `${esc(m.name)} (${m.vramGB} GB)`).join(', ')}` : ''}</div>
        <div class="text-slate-500 mt-0.5">Local models are free and private. They answer when paid models are out of tokens.</div>
      </div>
      <div class="font-semibold text-slate-200 mb-1.5">Installed (${o.installed.length})</div>
      <div class="space-y-1.5 mb-4">${installed}</div>
      ${progress ? `<div class="mb-3">${progress}</div>` : ''}
      <div class="font-semibold text-slate-200 mb-1.5">Download a model</div>
      ${o.canPull
        ? `<div class="text-slate-500 mb-1.5">"B" means billions of parameters. Bigger is smarter but slower. <strong class="text-slate-300">VRAM</strong> is the memory on your graphics card that the model needs while it runs (an estimate for short chats). <span class="text-emerald-400">Green</span> fits comfortably, <span class="text-amber-400">amber</span> is tight, <span class="text-rose-400">red</span> is too big: it then runs partly on the CPU and gets much slower.</div>
           <div class="space-y-1.5 mb-3">${standard}</div>
           <div class="font-semibold text-amber-300 mb-0.5">Uncensored ("abliterated") models</div>
           <div class="text-slate-500 mb-1.5">Community versions with the built-in refusals removed, so they answer what normal models decline. Quality can be a little lower than the original, and what you ask and do with them is your responsibility.</div>
           <div class="space-y-1.5 mb-3">${uncensored}</div>
           <div class="text-slate-400 mb-1">Or any other Ollama model:</div>
           <div class="flex gap-2"><input id="pull-custom" type="text" placeholder="any Ollama model, e.g. mistral:7b" class="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-cyan-500">
             <button data-act="pull-custom" ${pull ? 'disabled' : ''} class="${btn} border-cyan-600 text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-40">⬇ Download</button></div>
           <div class="text-slate-500 mt-2">Downloads come from the Ollama library through your own Ollama. They use internet and disk space. Sizes are approximate.</div>`
        : '<div class="text-slate-400">This server manages its models itself (for LM Studio use its own download screen). Downloads from here need Ollama.</div>'}
    `;
    this.bindModels(el);
  }

  pullText(p) {
    const gb = (n) => (n / 1e9).toFixed(2);
    const part = p.total ? ` · ${gb(p.completed)} of ${gb(p.total)} GB` : '';
    return `${p.status || 'working'}${part} · ${p.percent}%`;
  }

  bindModels(el) {
    el.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => this.modelAction(b.dataset.act, b.dataset.model, b))
    );
  }

  async modelAction(act, model, button) {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(async (r) => ({ ok: r.ok, json: await r.json() }));
    if (act === 'refresh') return this.refreshModels();
    if (act === 'sel-chat' || act === 'sel-build') {
      const r = await post('/api/local/select', { role: act === 'sel-chat' ? 'chat' : 'build', model });
      if (!r.ok) return this.app.toast(r.json.error || 'Could not select it');
      this.models = r.json;
      this.renderModels();
      const picked = this.models.installed.find((m) => m.name === model);
      if (act === 'sel-build' && picked && !picked.tools) {
        const better = this.models.installed.find((m) => m.tools);
        return this.app.toast(`⚠ ${model} cannot use tools, so a build with it will usually write no files.${better ? ` ${better.name} works better.` : ''}`, 6000);
      }
      return this.app.toast(`${model} will ${act === 'sel-chat' ? 'answer chat' : 'be used for builds'}`);
    }
    if (act === 'try') {
      const out = document.getElementById(`try-${button.dataset.i}`);
      out.classList.remove('hidden');
      out.textContent = 'Asking... (the first answer can take a few seconds while the model loads)';
      const r = await post('/api/local/try', { model });
      out.textContent = r.ok ? `"${r.json.text}" (${(r.json.ms / 1000).toFixed(1)} s)` : `⚠ ${r.json.error}`;
      return;
    }
    if (act === 'cancel') {
      await post('/api/local/pull/cancel');
      return this.app.toast('Download cancelled');
    }
    if (act === 'pull' || act === 'pull-custom') {
      const name = act === 'pull' ? model : document.getElementById('pull-custom')?.value.trim();
      if (!name) return document.getElementById('pull-custom')?.focus();
      const size = act === 'pull' ? ` (about ${button.dataset.gb} GB)` : '';
      if (!confirm(`Download "${name}"${size} from the Ollama library?\n\nIt uses internet and disk space.`)) return;
      const r = await post('/api/local/pull', { model: name });
      if (!r.ok) return this.app.toast(r.json.error || 'Could not start the download');
      this.pull = r.json.pull || { model: name, percent: 0, status: 'starting', done: false };
      this.renderModels();
    }
  }

  // live progress from the server (WebSocket)
  onPull(snap) {
    if (!snap) return;
    this.pull = snap;
    if (!snap.done) {
      const bar = document.getElementById('pull-bar');
      if (bar) {
        bar.style.width = `${snap.percent}%`;
        document.getElementById('pull-text').textContent = this.pullText(snap);
      } else if (this.activeTab === 'models') this.renderModels();
      return;
    }
    // finished: say how it went and refresh the list so the new model shows up
    if (snap.error) this.app.toast(`Download failed: ${snap.error}`);
    else if (snap.cancelled) this.app.toast('Download cancelled');
    else this.app.toast(`✅ ${snap.model} is installed. Pick it with Chat or Build.`);
    if (this.activeTab === 'models') this.refreshModels();
  }

  // ---------------------------------------------------------------- Library tab: everything built so far
  async refreshLibrary() {
    const el = document.getElementById('library-body');
    if (!el) return;
    let projects = [];
    try {
      projects = (await (await fetch('/api/projects')).json()).projects;
    } catch {
      el.textContent = 'Could not reach the server.';
      return;
    }
    if (!projects.length) {
      el.innerHTML = `<div class="text-center text-slate-500 py-10"><div class="text-3xl mb-2">📚</div>
        <div class="text-slate-300 font-semibold mb-1">The library is empty</div><div>Everything the team builds will be kept here, one folder per goal.</div></div>`;
      return;
    }
    const base = `http://127.0.0.1:${location.port}`;
    el.innerHTML =
      `<div class="mb-2 text-slate-400">${projects.length} project(s). Each goal gets its own folder, so nothing is overwritten.</div>` +
      projects
        .map((p) => `
        <div class="p-3 mb-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
          <div class="min-w-0">
            <div class="font-bold text-slate-100 truncate">${this.escapeHtml(p.title || p.name)}</div>
            <div class="text-slate-500 truncate">${this.escapeHtml(p.name)} · ${p.files} files · ${new Date(p.updated).toLocaleString()}</div>
          </div>
          ${p.hasIndex
            ? `<a href="${base}/workspace/${encodeURIComponent(p.name)}/index.html" target="_blank" rel="noopener" class="ml-auto shrink-0 px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold">▶ Open</a>`
            : '<span class="ml-auto text-slate-600">no index.html</span>'}
        </div>`)
        .join('');
  }

  // Shows whether a free local model (Ollama / LM Studio) is running and which one will be used
  async refreshLocalStatus() {
    const el = document.getElementById('local-status');
    if (!el) return;
    try {
      const l = await (await fetch('/api/local')).json();
      el.innerHTML = l.available
        ? `<div class="text-emerald-300 font-semibold">🟢 Local model ready (${this.escapeHtml(l.kind)})</div>
           <div class="mt-1 text-slate-400">Chat: <strong class="text-slate-200">${this.escapeHtml(l.chatModel)}</strong> · Builds: <strong class="text-slate-200">${l.canBuild ? this.escapeHtml(l.buildModel) : 'not supported on this server'}</strong></div>
           <div class="mt-1 text-slate-500">Free. Used automatically when paid models run out of tokens. Small models are slower and weaker, especially for builds.</div>`
        : `<div class="text-amber-300 font-semibold">⚪ No local model</div><div class="mt-1 text-slate-500">${this.escapeHtml(l.reason || '')}. Install Ollama and run: ollama pull qwen3:8b</div>`;
    } catch {
      el.textContent = 'Could not check for a local model.';
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    if (tab === 'apikeys') this.refreshLocalStatus();
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

    // draw the chat again now that it is visible, so it starts at the newest message instead of the top
    if (tab === 'chat') this.renderChatFeed();
    if (tab === 'whiteboard') this.renderWhiteboard();
    if (tab === 'models') this.refreshModels();
    if (tab === 'library') this.refreshLibrary();
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
      .slice(-14)
      .map((log) => {
        // shell commands stand out, blocked ones are red; long commands wrap instead of being cut
        const cmd = /\] \$ /.test(log) || /^\$ /.test(log);
        const blocked = /\(blocked:/.test(log);
        const colour = blocked ? 'text-rose-300' : cmd ? 'text-amber-300' : 'text-slate-300';
        return `<div class="${colour} text-xs font-mono whitespace-pre-wrap break-all">${this.escapeHtml(log)}</div>`;
      })
      .join('');
  }

  renderChatFeed() {
    if (!this.chatFeedEl) return;
    const msgs = (this.app.state.intercomMessages || []).slice(-30);
    if (!msgs.length) {
      this.chatFeedEl.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs py-10">
        <div class="text-3xl mb-2">💬</div>
        <div class="text-slate-300 font-semibold mb-1">It is quiet in here</div>
        <div>Say hi to an agent below, or give the team a goal with the 🎯 bar.</div></div>`;
      return;
    }
    const people = ['player', 'web', 'user', 'lead'];
    this.chatFeedEl.innerHTML = msgs
      .map((m) => {
        const text = this.escapeHtml(String(m.text).slice(0, 600) + (String(m.text).length > 600 ? '…' : ''));
        // announcements from the room itself are small centred pills
        if (m.sender === 'system') {
          return `<div class="text-center my-2"><span class="inline-block max-w-[90%] px-3 py-1 rounded-full bg-slate-800/70 border border-slate-700 text-[11px] text-slate-300 break-words">${text}</span></div>`;
        }
        const agent = this.app.state.agents[String(m.sender).toLowerCase()];
        const mine = people.includes(m.sender);
        const color = agent?.color || (mine ? '#22d3ee' : '#94a3b8');
        const initial = agent ? agent.name[0] : '👤';
        const to = m.recipient === 'all' ? '<span class="text-amber-400">everyone</span>' : '@' + this.escapeHtml(m.recipient);
        const avatar = `<div class="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-slate-900" style="background:${color}">${initial}</div>`;
        const bubble = `<div class="max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed break-words ${mine ? 'rounded-br-sm bg-cyan-900/40 border border-cyan-700/50' : 'rounded-bl-sm bg-slate-900/80 border border-slate-700'}">
            <div class="flex items-center gap-2 mb-0.5 text-[10px] text-slate-400">
              <strong style="color:${color}">${this.escapeHtml(String(m.sender).toUpperCase())}</strong><span>→ ${to}</span><span class="text-slate-600 ml-auto">${m.timestamp}</span>
            </div>
            <div class="text-slate-100">${text}</div></div>`;
        return `<div class="flex items-end gap-2 mb-2 ${mine ? 'flex-row-reverse' : ''}">${avatar}${bubble}</div>`;
      })
      .join('');

    this.chatFeedEl.scrollTop = this.chatFeedEl.scrollHeight;
  }
  // Update one job card in place (progress bar and status) without redrawing the whole board
  updateWhiteboardCard(card) {
    if (this.activeTab !== 'whiteboard') return;
    const el = document.querySelector(`[data-task-id="${card.id}"]`);
    if (!el) return this.renderWhiteboard();
    const bar = el.querySelector('.task-bar');
    if (bar) bar.style.width = `${card.progress}%`;
    const pct = el.querySelector('.task-pct');
    if (pct) pct.textContent = `${card.progress}%`;
    const badge = el.querySelector('.task-status');
    if (badge && badge.textContent !== card.status) return this.renderWhiteboard();   // status changed: colours change too
  }

  renderWhiteboard() {
    if (!this.whiteboardContainerEl) return;
    const cards = this.app.state.whiteboard || [];
    if (!cards.length) {
      this.whiteboardContainerEl.innerHTML = `<div class="text-center text-slate-500 text-xs py-10">
        <div class="text-3xl mb-2">📋</div><div class="text-slate-300 font-semibold mb-1">No jobs yet</div>
        <div>Type a goal in the 🎯 bar and the team's jobs will appear here with live progress.</div></div>`;
      return;
    }
    this.whiteboardContainerEl.innerHTML = cards
      .map((c) => {
        const done = c.status === 'DONE';
        const edge = done ? '#22c55e' : c.status === 'BLOCKED' ? '#ef4444' : '#f59e0b';
        const agent = this.app.state.agents[c.assignee];
        return `
          <div data-task-id="${c.id}" class="p-3 bg-slate-900/70 border border-slate-700 rounded-xl text-xs font-mono mb-2" style="border-left: 4px solid ${edge}">
            <div class="flex justify-between items-center mb-1 gap-2">
              <span class="font-bold text-white truncate">${this.escapeHtml(c.title)}</span>
              <span class="task-status px-2 py-0.5 rounded-full text-[10px] bg-slate-800" style="color:${edge}">${c.status}</span>
            </div>
            <div class="text-slate-400 text-[11px] mb-2">${this.escapeHtml(c.category)} · <span style="color:${agent?.color || '#94a3b8'}">@${c.assignee}</span></div>
            <div class="flex items-center gap-2">
              <div class="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden"><div class="task-bar h-full rounded-full" style="width: ${c.progress}%; background: linear-gradient(90deg,#2563eb,#22d3ee); transition: width 0.4s ease"></div></div>
              <span class="task-pct w-9 text-right text-[10px] text-slate-400">${c.progress}%</span>
            </div>
          </div>`;
      })
      .join('');
  }
  renderAgentsGrid() {
    if (!this.agentsGridEl) return;
    const agents = Object.values(this.app.state.agents);
    const chip = { CODING: 'bg-emerald-900/60 text-emerald-300', THINKING: 'bg-purple-900/60 text-purple-300', TESTING: 'bg-amber-900/60 text-amber-300', CHATTING: 'bg-cyan-900/60 text-cyan-300', RESEARCHING: 'bg-indigo-900/60 text-indigo-300', IDLE: 'bg-slate-800 text-slate-400' };
    this.agentsGridEl.innerHTML = agents
      .map((a) => {
        const bar = a.energy > 50 ? '#22c55e' : a.energy > 20 ? '#f59e0b' : '#ef4444';
        return `
        <div class="p-3 bg-slate-900/80 border border-slate-700 rounded-xl text-xs font-mono" style="border-top: 3px solid ${a.color}">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-slate-900" style="background:${a.color}">${a.name[0]}</div>
            <div class="min-w-0">
              <div class="font-bold text-sm" style="color: ${a.color}">${a.name}</div>
              <div class="text-slate-500 text-[10px] truncate">${a.role}</div>
            </div>
            <span class="ml-auto text-[10px] px-2 py-0.5 rounded-full ${chip[a.state] || chip.IDLE}">${a.state}</span>
          </div>
          <div class="text-[11px] text-slate-300 mb-2 line-clamp-2">${this.escapeHtml(a.currentTask)}</div>
          <div class="flex justify-between text-slate-400 text-[10px] mb-1"><span>🔋 tokens left</span><span>${a.energy}%</span></div>
          <div class="h-1.5 bg-slate-800 rounded-full mb-3 overflow-hidden"><div class="h-full rounded-full" style="width:${a.energy}%;background:${bar};transition:width .4s"></div></div>
          <button class="w-full py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-lg text-center btn-inspect" data-agent="${a.id}">Open monitor</button>
        </div>`;
      })
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
