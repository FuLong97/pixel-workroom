// public/js/app.js - Main Application Orchestrator
import { PixelAssetManager } from './pixel-assets.js';
import { Workroom3DEngine } from './engine3d.js';
import { IntercomController } from './intercom.js';
import { audioSynth } from './audio.js';
import { GoalPanel } from './goal-panel.js';
import { TouchControls } from './touch-controls.js';

export class PixelWorkroomApp {
  constructor() {
    this.canvas = document.getElementById('render-canvas');
    this.assets = new PixelAssetManager();
    this.state = this.getInitialFallbackState();

    this.engine = new Workroom3DEngine(this.canvas, this.assets, this.state);
    this.intercom = new IntercomController(this);
    this.goalPanel = new GoalPanel(this);
    this.touch = new TouchControls(this.engine, this.canvas.parentElement);
    const hint = document.getElementById('view-hint');
    if (hint) hint.dataset.fpv = hint.innerHTML;

    this.ws = null;
    this.lastTime = performance.now();

    this.initWebSocket();
    this.setupUIControls();
    this.startLoop();
    this.applyShotMode();
    this.watchServerVersion();
  }

  // Screenshot mode for docs: ?shot=fpv|top|monitor|intercom  (+ x, y, a, res, dock, agent, tab)
  // Used by scripts/make-screenshots.mjs; does nothing without the parameter.
  applyShotMode() {
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (!shot) return;
    this.shotFreezeAt = performance.now() + 2500;
    const e = this.engine;
    if (q.get('res')) e.setResolution(q.get('res'));
    if (q.get('dock') === '0') { this.goalPanel.collapsed = true; this.goalPanel.render(); }
    e.showMinimap = q.get('minimap') !== '0';
    if (q.get('x')) {
      const a = parseFloat(q.get('a') || '1.57');
      e.player.x = parseFloat(q.get('x'));
      e.player.y = parseFloat(q.get('y'));
      e.player.dirX = Math.cos(a);
      e.player.dirY = Math.sin(a);
      const fov = parseFloat(q.get('fov') || '0.66');   // camera plane length, bigger = wider view
      e.player.planeX = -Math.sin(a) * fov;
      e.player.planeY = Math.cos(a) * fov;
    }
    if (shot === 'top') e.setViewMode('top');
    if (shot === 'monitor') setTimeout(() => this.openMonitorCockpit(q.get('agent') || 'bob'), 400);
    if (shot === 'intercom') setTimeout(() => this.intercom.openIntercom(q.get('tab') || 'whiteboard'), 400);
  }

  // ---------------------------------------------------------------- things you can use in the room
  toast(message, ms = 2800) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  showInfo(title, html) {
    const modal = document.getElementById('info-modal');
    if (!modal) return;
    document.getElementById('info-title').textContent = title;
    document.getElementById('info-body').innerHTML = html;
    modal.classList.remove('hidden');
    if (!this.infoBound) {
      this.infoBound = true;
      document.getElementById('info-close').addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    }
  }

  // Pressing E at a piece of furniture (or clicking it in the top view) ends up here
  runAction(act) {
    const ic = this.intercom;
    switch (act) {
      case 'jobs': return ic.openIntercom('whiteboard');
      case 'chat': return ic.openIntercom('chat');
      case 'assign': return ic.openIntercom('jobs');
      case 'library': return ic.openIntercom('library');
      case 'models': return ic.openIntercom('models');
      case 'settings': return ic.openIntercom('apikeys');
      case 'lights': {
        const on = this.engine.toggleLights();
        return this.toast(on ? '💡 Lights on' : '🌙 Lights off');
      }
      case 'print': return this.printReport();
      case 'water': return this.waterPlants();
      case 'share': return this.showShare();
      case 'bin':
        if (confirm('Empty the bin?\n\nThis clears the chat and all jobs on the whiteboard.')) {
          this.sendWebSocketAction({ type: 'clear_jobs' });
          this.toast('🗑 Chat and jobs cleared');
        }
        return;
      default:
        return this.toast('Nothing to do here yet');
    }
  }

  // Printer: save a Markdown report of the jobs, the team and the latest chat
  printReport() {
    const s = this.state;
    const lines = [`# Pixel Workroom report`, `_${new Date().toLocaleString()}_`, '', '## Jobs'];
    for (const t of s.whiteboard || []) lines.push(`- ${t.status === 'DONE' ? '[x]' : '[ ]'} ${t.title} (@${t.assignee}, ${t.progress}%)`);
    if (!(s.whiteboard || []).length) lines.push('- none');
    lines.push('', '## Team');
    for (const a of Object.values(s.agents || {})) lines.push(`- ${a.name} (${a.role}): ${a.state}, ${a.energy}% tokens left. ${a.currentTask}`);
    lines.push('', '## Latest chat');
    for (const m of (s.intercomMessages || []).slice(-30)) lines.push(`- [${m.timestamp}] ${m.sender} -> ${m.recipient}: ${String(m.text).slice(0, 300)}`);
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `workroom-report-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    this.toast('🖨 Report saved to your downloads');
  }

  // Watering the ficus refills every agent's token bar (the health bar)
  async waterPlants() {
    try {
      const st = await (await fetch('/api/tokens/refill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
      if (st.agents) {
        this.state.agents = st.agents;
        this.engine.state = this.state;
        this.updateTokenHud();
      }
      this.toast('🪴 Watered! All token bars are full again');
    } catch {
      this.toast('The plant could not be watered (server offline)');
    }
  }

  // Water cooler: where to reach the room from a phone or Telegram
  async showShare() {
    let share = {};
    let run = {};
    try { share = await (await fetch('/api/share')).json(); } catch { /* offline */ }
    try { run = await (await fetch('/api/run')).json(); } catch { /* offline */ }
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const link = share.base && run.dir ? `${share.base}/workspace/${encodeURIComponent(run.dir)}/` : null;
    const tg = share.telegram || {};
    this.showInfo('💧 Water cooler: phone and Telegram', `
      <div><strong>📱 Open the latest result on your iPhone</strong> (same Wi-Fi)</div>
      ${link ? `<div class="p-2 rounded bg-slate-950 border border-slate-700 break-all select-text"><code>${esc(link)}</code></div>
                <button id="copy-link" class="px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white">Copy link</button>`
             : '<div class="text-slate-400">Nothing built yet, or sharing is off (LAN_SHARE=0). Build something first.</div>'}
      <div class="pt-2"><strong>✈️ Telegram</strong></div>
      <div>${tg.running ? `🟢 Your bot is running, ${tg.allowed} chat(s) may give orders.` : '⚪ Not set up. Run <code>npm run telegram:setup</code> after putting a bot token in <code>.env</code>.'}</div>
    `);
    document.getElementById('copy-link')?.addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = 'Select and copy it by hand'; }
    });
  }

  // Warn when the code on disk is newer than the server that is running (an old server keeps old bugs alive)
  watchServerVersion() {
    const check = async () => {
      try {
        const v = await (await fetch('/api/version')).json();
        document.getElementById('stale-banner')?.classList.toggle('hidden', !v.stale);
      } catch { /* offline or standalone: nothing to compare */ }
    };
    check();
    setInterval(check, 20000);
  }

  getInitialFallbackState() {
    return {
      agents: {
        alice: {
          id: 'alice',
          name: 'Alice',
          role: 'Systems Architect',
          color: '#60a5fa',
          pos: { x: 4.5, y: 0, z: 8.5 },
          status: 'Designing Microservices Architecture',
          state: 'CODING',
          energy: 95,
          coffeeCups: 3,
          currentTask: 'Architecture specification & MCP tool contract definition',
          screen: {
            title: "Alice's Studio // ArchCraft 2.0",
            file: 'system-design.puml',
            lines: [
              '@startuml',
              'node "MCP Gateway" as Gateway {',
              '  [Stdio Transport] --> [JSON-RPC Router]',
              '}',
              'Gateway --> [Pixel Workroom 3D] : WebSockets (60 FPS)',
              '@enduml'
            ],
            logs: [
              '[Alice] Validating JSON schema specifications for workroom tools...',
              '[Alice] Architecture diagram compiled successfully.'
            ],
            thoughts: 'Clean decoupling between Stdio MCP and WebSocket ensures sub-10ms UI latency.'
          }
        },
        bob: {
          id: 'bob',
          name: 'Bob',
          role: 'Pixel & Frontend Engineer',
          color: '#f472b6',
          pos: { x: 4.5, y: 0, z: 14.5 },
          status: 'Rendering Raycaster Ray Buffers',
          state: 'CODING',
          energy: 90,
          coffeeCups: 4,
          currentTask: 'Realtime First-Person 3D Raycasting Engine with CRT phosphor scanlines',
          screen: {
            title: "Bob's Workstation // VSCode Pixel Edition",
            file: 'raycaster-pipeline.ts',
            lines: [
              'export function renderWallSlice(ray: Ray, x: number) {',
              '  const wallHeight = Math.floor(CANVAS_HEIGHT / ray.perpDistance);',
              '  ctx.drawImage(wallTex, texX, 0, 1, 64, x, drawStart, 1, drawEnd - drawStart);',
              '}'
            ],
            logs: [
              '[Bob] DDA ray step loop tuned to 60 FPS on canvas',
              '[Bob] Billboard agent sprites reacting to camera angle.'
            ],
            thoughts: 'The first-person view feels authentic retro! You can walk right up to every desk.'
          }
        },
        charlie: {
          id: 'charlie',
          name: 'Charlie',
          role: 'MCP Protocols & Backend',
          color: '#34d399',
          pos: { x: 15.5, y: 0, z: 8.5 },
          status: 'Managing JSON-RPC Message Bus',
          state: 'CHATTING',
          energy: 92,
          coffeeCups: 2,
          currentTask: 'Model Context Protocol Stdio & WebSocket bridge',
          screen: {
            title: "Charlie's Terminal // MCP Inspector",
            file: 'mcp-server.mjs',
            lines: [
              'server.setRequestHandler(CallToolRequestSchema, async (req) => {',
              '  const { name, arguments: args } = req.params;',
              '  return await tool.execute(args);',
              '});'
            ],
            logs: ['[Charlie] MCP Stdio transport handshake established', '[Charlie] Broadcast channel sync active'],
            thoughts: 'MCP allows any agent in Antigravity to talk, assign tasks, and inspect monitors seamlessly.'
          }
        },
        diana: {
          id: 'diana',
          name: 'Diana',
          role: 'Security & QA Auditor',
          color: '#fbbf24',
          pos: { x: 15.5, y: 0, z: 14.5 },
          status: 'Auditing MCP Tool Boundaries & Tests',
          state: 'TESTING',
          energy: 98,
          coffeeCups: 1,
          currentTask: 'Automated test suites & boundary checks for MCP tools',
          screen: {
            title: "Diana's Suite // Vitest Security Runner",
            file: 'workroom.test.ts',
            lines: [
              '✓ test/mcp/stdio.test.ts > Stdio handshake > protocol negotiated (12ms)',
              '✓ test/mcp/tools.test.ts > workroom_broadcast > broadcasted to all (8ms)',
              'Tests: 18 passed, 0 failed (100% code coverage)'
            ],
            logs: ['[Diana] Memory leak check: In-memory bus bounded at 200 items', '[Diana] Ready for production!'],
            thoughts: 'All 18 security and integration tests passed. The MCP bridge is watertight.'
          }
        },
        echo: {
          id: 'echo',
          name: 'Echo',
          role: 'Autonomous Research Agent',
          color: '#a78bfa',
          pos: { x: 10.0, y: 0, z: 20.5 },
          status: 'Synthesizing MCP Specifications',
          state: 'RESEARCHING',
          energy: 87,
          coffeeCups: 5,
          currentTask: 'Indexing agent collaboration patterns and benchmarks',
          screen: {
            title: "Echo's Desk // Knowledge Navigator",
            file: 'research_notes.md',
            lines: [
              '# MCP Spec (2024-11-05 Release Notes)',
              '- JSON-RPC 2.0 base with bidirectional capabilities',
              '- Dynamic tool injection enables live agent reconfiguration'
            ],
            logs: ['[Echo] Extracted raycasting DDA math formulas for Bob', '[Echo] Indexed collaboration patterns'],
            thoughts: 'Multi-agent coordination is 3.4x faster when agents communicate over structured MCP tool calls.'
          }
        }
      },
      intercomMessages: [],
      whiteboard: [
        { id: 'wb-1', title: 'Pixel Workroom 3D Engine', assignee: 'bob', status: 'DONE', progress: 100, category: 'Frontend' },
        { id: 'wb-2', title: 'Model Context Protocol Stdio Server', assignee: 'charlie', status: 'DONE', progress: 100, category: 'MCP' },
        { id: 'wb-3', title: 'Agent First-Person Screen Streaming', assignee: 'alice', status: 'IN_PROGRESS', progress: 85, category: 'Core' }
      ]
    };
  }

  initWebSocket() {
    try {
      const loc = window.location;
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${loc.host}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected to Workroom backend');
        this.updateStatusBadge('CONNECTED', '#22c55e');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (e) {
          console.error('[WebSocket] Parse error:', e);
        }
      };

      this.ws.onerror = () => {
        this.updateStatusBadge('LOCAL SIM', '#f59e0b');
      };

      this.ws.onclose = () => {
        this.updateStatusBadge('RECONNECTING', '#ef4444');
        setTimeout(() => this.initWebSocket(), 3000);
      };
    } catch (e) {
      console.warn('[WebSocket] Running in offline / standalone mode');
      this.updateStatusBadge('STANDALONE', '#38bdf8');
    }
  }

  handleServerMessage(data) {
    if (data.type === 'init') {
      this.state = data.state;
      this.engine.state = this.state;
      this.intercom.renderChatFeed();
    } else if (data.type === 'state_change') {
      const { type, data: payload } = data.change;
      if (type === 'broadcast' || type === 'message') {
        if (!this.state.intercomMessages) this.state.intercomMessages = [];
        this.state.intercomMessages.push(payload);
        this.intercom.renderChatFeed();
        audioSynth.playBleep();
      } else if (type === 'agent_update') {
        this.state.agents[payload.id] = payload;
        this.updateTokenHud();
        if (this.intercom.activeTab === 'agents') this.intercom.renderAgentsGrid();
        if (this.intercom.currentMonitorAgentId === payload.id) {
          this.intercom.updateMonitorContent(payload.id);
        }
      } else if (type === 'local_pull') {
        this.intercom.onPull(payload);
      } else if (type === 'jobs_cleared') {
        // the bin: chat and jobs were emptied on the server
        this.state.agents = payload.agents;
        this.state.whiteboard = payload.whiteboard || [];
        this.state.intercomMessages = payload.intercomMessages || [];
        this.engine.state = this.state;
        this.intercom.renderChatFeed();
        this.intercom.renderWhiteboard();
        this.updateTokenHud();
      } else if (type === 'run_update') {
        // progress arrives the moment it happens instead of waiting for the next poll
        this.goalPanel.applyStatus(payload);
      } else if (type === 'task_update') {
        const card = (this.state.whiteboard || []).find((t) => t.id === payload.id);
        if (card) {
          card.progress = payload.progress;
          card.status = payload.status;
          this.intercom.updateWhiteboardCard(card);
        }
      } else if (type === 'task_assigned') {
        this.state.whiteboard.unshift(payload.task);
        this.intercom.renderWhiteboard();
        audioSynth.playChime();
      }
    }
  }

  sendWebSocketAction(action) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(action));
    } else {
      // Offline fallback: update local state directly
      if (action.type === 'broadcast') {
        const msg = {
          id: `msg-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          sender: action.sender || 'player',
          recipient: 'all',
          text: action.text
        };
        this.state.intercomMessages.push(msg);
        this.intercom.renderChatFeed();
      } else if (action.type === 'send_message') {
        const msg = {
          id: `msg-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          sender: action.sender || 'player',
          recipient: action.recipient,
          text: action.text
        };
        this.state.intercomMessages.push(msg);
        this.intercom.renderChatFeed();
      }
    }
  }

  setupUIControls() {
    // Camera Presets
    document.getElementById('btn-cam-fpv')?.addEventListener('click', () => {
      this.engine.player.x = 10.0;
      this.engine.player.y = 4.5;
      this.engine.player.dirX = 0;
      this.engine.player.dirY = 1;
      this.engine.player.planeX = 0.66;
      this.engine.player.planeY = 0;
    });

    document.getElementById('btn-cam-alice')?.addEventListener('click', () => {
      this.openMonitorCockpit('alice');
    });
    document.getElementById('btn-cam-bob')?.addEventListener('click', () => {
      this.openMonitorCockpit('bob');
    });
    document.getElementById('btn-cam-charlie')?.addEventListener('click', () => {
      this.openMonitorCockpit('charlie');
    });
    document.getElementById('btn-cam-diana')?.addEventListener('click', () => {
      this.openMonitorCockpit('diana');
    });
    document.getElementById('btn-cam-echo')?.addEventListener('click', () => {
      this.openMonitorCockpit('echo');
    });

    document.getElementById('btn-view-toggle')?.addEventListener('click', () => {
      this.engine.setViewMode(this.engine.viewMode === 'top' ? 'fpv' : 'top');
      audioSynth.playBleep();
    });

    // Resolution Switcher
    const resBtn = document.getElementById('btn-res-toggle');
    resBtn?.addEventListener('click', () => {
      const modes = ['retro', 'crisp', 'hd'];
      const current = this.engine.resolutionMode;
      const nextIdx = (modes.indexOf(current) + 1) % modes.length;
      this.setPictureSize(modes[nextIdx]);
      this.resPinned = true;           // a choice made by hand is never overridden by the automatic step-down
      audioSynth.playBleep();
    });
    if (new URLSearchParams(location.search).get('res')) this.resPinned = true;

    // Audio toggle
    document.getElementById('btn-audio-toggle')?.addEventListener('click', (e) => {
      const on = audioSynth.toggle();
      e.target.textContent = on ? '🔊 Sound: ON' : '🔇 Sound: OFF';
    });

    // Scanlines toggle
    document.getElementById('btn-scanlines-toggle')?.addEventListener('click', (e) => {
      this.engine.showScanlines = !this.engine.showScanlines;
      e.target.textContent = this.engine.showScanlines ? '📺 CRT: ON' : '📺 CRT: OFF';
    });
  }

  openMonitorCockpit(agentId) {
    this.intercom.openMonitor(agentId);
  }

  updateStatusBadge(text, color) {
    const badge = document.getElementById('status-indicator');
    if (badge) {
      badge.textContent = text;
      badge.style.borderColor = color;
      badge.style.color = color;
    }
  }

  updateTokenHud() {
    const agents = Object.values(this.state.agents || {});
    let used = 0, limit = 0;
    for (const a of agents) {
      if (a.tokenBudget) { used += a.tokenBudget.used; limit += a.tokenBudget.limit; }
    }
    const pct = limit ? Math.max(0, Math.round(100 * (1 - used / limit))) : 100;
    const bar = document.getElementById('token-hud-bar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
    }
    const txt = document.getElementById('token-hud-text');
    if (txt) txt.textContent = limit ? `${Math.max(0, limit - used).toLocaleString()} left` : '100%';
    fetch('/api/tokens').then((r) => r.json()).then((t) => {
      const el = document.getElementById('token-hud-saved');
      if (el) el.textContent = t.tokensSaved ? `+${t.tokensSaved} saved` : '';
    }).catch(() => {});
  }

  setPictureSize(mode) {
    this.engine.setResolution(mode);
    const labels = { retro: '📐 320p Retro', crisp: '📐 640p Crisp', hd: '📐 960p HD' };
    const btn = document.getElementById('btn-res-toggle');
    if (btn) btn.textContent = labels[mode];
    this.costSamples = [];
  }

  // Slow device? Watch what a first-person frame costs the processor. If the typical frame is too
  // slow for about 30 frames per second, step the picture down one size (960 -> 640 -> 320 wide)
  // instead of stuttering. It only ever steps down, and never overrides a size chosen with the
  // 📐 button or ?res=.
  watchFrameCost(ms) {
    if (this.resPinned || this.shotFreezeAt || this.engine.viewMode !== 'fpv' || document.hidden) return;
    const samples = this.costSamples || (this.costSamples = []);
    samples.push(ms);
    if (samples.length < 120) return;
    const typical = samples.slice(30).sort((a, b) => a - b)[45];     // the first frames are still warming up
    this.costSamples = [];
    if (typical <= 22) return;
    const smaller = { hd: 'crisp', crisp: 'retro' }[this.engine.resolutionMode];
    if (!smaller) return;
    this.setPictureSize(smaller);
    this.toast(`Slow device (${typical.toFixed(0)} ms per frame): picture set to ${smaller === 'retro' ? '320p Retro' : '640p Crisp'}. The 📐 button changes it back.`, 4500);
  }

  startLoop() {
    setInterval(() => this.updateTokenHud(), 2000);
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;

      const t0 = performance.now();
      this.engine.update(dt);
      this.engine.render();
      this.watchFrameCost(performance.now() - t0);

      // screenshot mode: stop animating after a moment so a headless browser can finish
      if (this.shotFreezeAt && now > this.shotFreezeAt) return;
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

// Instantiate upon window load
window.addEventListener('DOMContentLoaded', () => {
  window.workroomApp = new PixelWorkroomApp();
});
