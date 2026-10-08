// public/js/app.js - Main Application Orchestrator
import { PixelAssetManager } from './pixel-assets.js';
import { Workroom3DEngine } from './engine3d.js';
import { IntercomController } from './intercom.js';
import { audioSynth } from './audio.js';
import { GoalPanel } from './goal-panel.js';

export class PixelWorkroomApp {
  constructor() {
    this.canvas = document.getElementById('render-canvas');
    this.assets = new PixelAssetManager();
    this.state = this.getInitialFallbackState();

    this.engine = new Workroom3DEngine(this.canvas, this.assets, this.state);
    this.intercom = new IntercomController(this);
    this.goalPanel = new GoalPanel(this);

    this.ws = null;
    this.lastTime = performance.now();

    this.initWebSocket();
    this.setupUIControls();
    this.startLoop();
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
        if (this.intercom.currentMonitorAgentId === payload.id) {
          this.intercom.updateMonitorContent(payload.id);
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
      const nextMode = modes[nextIdx];
      this.engine.setResolution(nextMode);
      
      const labels = { retro: '📐 320p Retro', crisp: '📐 640p Crisp', hd: '📐 960p HD' };
      resBtn.textContent = labels[nextMode];
      audioSynth.playBleep();
    });

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

  startLoop() {
    setInterval(() => this.updateTokenHud(), 2000);
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;

      this.engine.update(dt);
      this.engine.render();

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

// Instantiate upon window load
window.addEventListener('DOMContentLoaded', () => {
  window.workroomApp = new PixelWorkroomApp();
});
