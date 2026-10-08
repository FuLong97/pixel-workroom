// src/state.mjs - Workroom Shared State & Event Bus
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = process.env.WORKROOM_STATE_FILE || path.join(__dirname, '..', 'workroom-state.json');

// Nothing in the room needs more than a few lines of text; this keeps a runaway message from
// ever filling the screen or the state file.
export const MAX_TEXT = 2000;
export const clip = (text, max = MAX_TEXT) => {
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max) + ' … [shortened]' : s;
};

// Shrink a saved state that grew out of hand (older versions could loop and write megabytes)
export function compactState(data) {
  for (const m of data.intercomMessages || []) m.text = clip(m.text);
  for (const a of Object.values(data.agents || {})) {
    const sc = a.screen;
    if (!sc) continue;
    sc.logs = (sc.logs || []).slice(-25).map((l) => clip(l, 500));
    sc.lines = (sc.lines || []).slice(0, 80).map((l) => clip(l, 300));
    sc.thoughts = clip(sc.thoughts, 500);
  }
  return data;
}

export class WorkroomStateManager extends EventEmitter {
  constructor() {
    super();
    this.agents = {
      alice: {
        id: 'alice',
        name: 'Alice',
        role: 'Systems Architect',
        color: '#60a5fa',
        pos: { x: 6.5, y: 0, z: 8.5 },
        dir: Math.PI / 2, // Facing East (into room)
        deskId: 1,
        status: 'Designing Microservice Topology',
        state: 'CODING', // CODING, THINKING, CHATTING, COFFEE, IDLE, TESTING
        energy: 94,
        coffeeCups: 3,
        currentTask: 'Architecture specification & MCP tool contract definition',
        screen: {
          type: 'architecture',
          title: "Alice's Studio // ArchCraft 2.0",
          file: 'system-design.puml',
          lines: [
            '@startuml',
            'actor User',
            'node "MCP Gateway" as Gateway {',
            '  [Stdio Transport] --> [JSON-RPC Router]',
            '  [JSON-RPC Router] --> [Agent State Broker]',
            '}',
            'database "In-Memory Bus" as Bus',
            'Gateway --> Bus : Pub/Sub Events',
            'Bus --> [Pixel Workroom 3D] : WebSockets (60 FPS)',
            '@enduml'
          ],
          logs: [
            '[Alice 14:48:10] Decomposing epic: Distributed Agent Consensus',
            '[Alice 14:49:02] Defining tool contracts for MCP v1.32',
            '[Alice 14:50:35] Validating JSON schema specifications for workroom tools...',
            '[Alice 14:51:20] Architecture diagram compiled successfully.'
          ],
          thoughts: 'Clean decoupling between Stdio MCP and WebSocket ensures sub-10ms UI latency for the first-person view.'
        }
      },
      bob: {
        id: 'bob',
        name: 'Bob',
        role: 'Pixel & Frontend Engineer',
        color: '#f472b6',
        pos: { x: 6.5, y: 0, z: 14.0 },
        dir: Math.PI / 2,
        deskId: 2,
        status: 'Rendering Raycaster Ray Buffers',
        state: 'CODING',
        energy: 88,
        coffeeCups: 4,
        currentTask: 'Realtime First-Person 3D Raycasting Engine with CRT phosphor scanlines',
        screen: {
          type: 'code',
          title: "Bob's Workstation // VSCode Pixel Edition",
          file: 'raycaster-pipeline.ts',
          lines: [
            'export function renderWallSlice(ray: Ray, x: number, ctx: CanvasRenderingContext2D) {',
            '  const wallHeight = Math.floor(CANVAS_HEIGHT / ray.perpDistance);',
            '  const drawStart = Math.max(0, -wallHeight / 2 + CANVAS_HEIGHT / 2);',
            '  const drawEnd = Math.min(CANVAS_HEIGHT - 1, wallHeight / 2 + CANVAS_HEIGHT / 2);',
            '  const texX = Math.floor(ray.wallHitX * TEXTURE_WIDTH) % TEXTURE_WIDTH;',
            '  ctx.drawImage(wallTex, texX, 0, 1, TEXTURE_HEIGHT, x, drawStart, 1, drawEnd - drawStart);',
            '}'
          ],
          logs: [
            '[Bob 14:48:40] DDA ray step loop tuned to 60 FPS on canvas',
            '[Bob 14:49:55] CRT phosphor scanline shader activated',
            '[Bob 14:51:12] Sprite z-sorting depth buffer verified',
            '[Bob 14:52:00] Billboard agent sprites reacting to camera angle.'
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
        dir: -Math.PI / 2, // Facing West (into room)
        deskId: 3,
        status: 'Managing JSON-RPC Message Bus',
        state: 'CHATTING',
        energy: 91,
        coffeeCups: 2,
        currentTask: 'Model Context Protocol Stdio & WebSocket bridge',
        screen: {
          type: 'mcp',
          title: "Charlie's Terminal // MCP Inspector",
          file: 'mcp-server.mjs',
          lines: [
            '// MCP Protocol Tool Dispatcher',
            'server.setRequestHandler(CallToolRequestSchema, async (req) => {',
            '  const { name, arguments: args } = req.params;',
            '  console.log(`[MCP_BUS] Invoking ${name}`, args);',
            '  const tool = registeredTools.get(name);',
            '  if (!tool) throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);',
            '  return await tool.execute(args);',
            '});'
          ],
          logs: [
            '[Charlie 14:47:50] MCP Stdio transport handshake established',
            '[Charlie 14:49:15] Registered 8 MCP tools into Antigravity catalog',
            '[Charlie 14:50:40] Broadcast channel sync: 0 dropped frames',
            '[Charlie 14:52:10] Tool workroom_send_agent_message ready for calls.'
          ],
          thoughts: 'MCP allows any agent in Antigravity to talk, assign tasks, and inspect monitors seamlessly.'
        }
      },
      diana: {
        id: 'diana',
        name: 'Diana',
        role: 'Security & QA Auditor',
        color: '#fbbf24',
        pos: { x: 15.5, y: 0, z: 14.0 },
        dir: -Math.PI / 2,
        deskId: 4,
        status: 'Auditing MCP Tool Boundaries & Tests',
        state: 'TESTING',
        energy: 97,
        coffeeCups: 1,
        currentTask: 'Automated test suites & boundary checks for MCP tools',
        screen: {
          type: 'tests',
          title: "Diana's Suite // Vitest Security Runner",
          file: 'workroom.test.ts',
          lines: [
            '✓ test/mcp/stdio.test.ts > Stdio handshake > protocol negotiated (12ms)',
            '✓ test/mcp/tools.test.ts > workroom_broadcast > broadcasted to all (8ms)',
            '✓ test/mcp/tools.test.ts > workroom_send_agent_message > delivered (5ms)',
            '✓ test/security/boundary.test.ts > sandboxing > boundaries enforced (18ms)',
            'Tests: 18 passed, 0 failed (100% code coverage)'
          ],
          logs: [
            '[Diana 14:48:30] Running automated fuzz tests on MCP packet receiver',
            '[Diana 14:50:00] Memory leak check: In-memory bus bounded at 200 items',
            '[Diana 14:51:40] All boundary validations passed without violations',
            '[Diana 14:52:25] Ready for production deployment!'
          ],
          thoughts: 'All 18 security and integration tests passed. The MCP bridge is watertight.'
        }
      },
      echo: {
        id: 'echo',
        name: 'Echo',
        role: 'Autonomous Research Agent',
        color: '#a78bfa',
        pos: { x: 11.0, y: 0, z: 19.5 },
        dir: Math.PI, // Facing North (into room)
        deskId: 5,
        status: 'Synthesizing MCP Specifications',
        state: 'RESEARCHING',
        energy: 85,
        coffeeCups: 5,
        currentTask: 'Indexing agent collaboration patterns and benchmarks',
        screen: {
          type: 'research',
          title: "Echo's Desk // Knowledge Navigator",
          file: 'research_notes.md',
          lines: [
            '# MCP Spec (2024-11-05 Release Notes)',
            '- JSON-RPC 2.0 base with bidirectional capabilities',
            '- Dynamic tool injection enables live agent reconfiguration',
            '- Resources protocol allows reading agent screens as URI targets',
            '- Low-overhead stdio communication minimizes IPC overhead'
          ],
          logs: [
            '[Echo 14:48:00] Queried official MCP documentation',
            '[Echo 14:49:30] Extracted raycasting DDA math formulas for Bob',
            '[Echo 14:51:00] Indexed 42 papers on multi-agent collaboration patterns',
            '[Echo 14:52:15] Synthesized optimal team communication topology.'
          ],
          thoughts: 'Multi-agent coordination is 3.4x faster when agents communicate over structured MCP tool calls.'
        }
      }
    };

    this.player = {
      pos: { x: 10.0, y: 0, z: 4.5 },
      dir: 0, // Facing South (looking down the aisle)
      mode: 'fpv', // 'fpv' (walking), 'cockpit' (seated at desk), 'monitor' (inspecting)
      focusedAgent: null
    };

    this.whiteboard = [
      { id: 'wb-1', title: 'Pixel Workroom 3D Engine', assignee: 'bob', status: 'DONE', progress: 100, category: 'Frontend' },
      { id: 'wb-2', title: 'Model Context Protocol Stdio Server', assignee: 'charlie', status: 'DONE', progress: 100, category: 'MCP' },
      { id: 'wb-3', title: 'Agent First-Person Screen Streaming', assignee: 'alice', status: 'IN_PROGRESS', progress: 85, category: 'Core' },
      { id: 'wb-4', title: 'Multi-Agent Security & Boundary Audit', assignee: 'diana', status: 'DONE', progress: 100, category: 'QA' },
      { id: 'wb-5', title: 'Dynamic Task Orchestration Protocol', assignee: 'echo', status: 'IN_PROGRESS', progress: 70, category: 'Research' }
    ];

    this.intercomMessages = [
      {
        id: 'msg-1',
        timestamp: new Date(Date.now() - 1000 * 60 * 12).toLocaleTimeString(),
        sender: 'alice',
        recipient: 'all',
        text: 'Morning team! Let’s initialize the 3D pixel workroom with live first-person views and MCP connectivity.',
        type: 'broadcast'
      },
      {
        id: 'msg-2',
        timestamp: new Date(Date.now() - 1000 * 60 * 9).toLocaleTimeString(),
        sender: 'bob',
        recipient: 'alice',
        text: 'Canvas raycasting pipeline is locked at 60 FPS. Adding phosphor CRT scanlines now.',
        type: 'direct'
      },
      {
        id: 'msg-3',
        timestamp: new Date(Date.now() - 1000 * 60 * 6).toLocaleTimeString(),
        sender: 'charlie',
        recipient: 'all',
        text: 'MCP server is live over Stdio and WebSockets. Antigravity can now send tool calls directly.',
        type: 'broadcast'
      },
      {
        id: 'msg-4',
        timestamp: new Date(Date.now() - 1000 * 60 * 3).toLocaleTimeString(),
        sender: 'diana',
        recipient: 'charlie',
        text: 'Running vitest on all 8 MCP tools. Stdio handshake and message broadcast pass with 0 errors.',
        type: 'direct'
      },
      {
        id: 'msg-5',
        timestamp: new Date(Date.now() - 1000 * 60 * 1).toLocaleTimeString(),
        sender: 'echo',
        recipient: 'all',
        text: 'Knowledge base updated with Model Context Protocol specs. Agents can query screen state via MCP resources.',
        type: 'broadcast'
      }
    ];

    this.stats = {
      mcpToolCalls: 24,
      packetsTransferred: 1420,
      uptimeSeconds: 3600,
      activeGoal: 'None'
    };

    // Start blank unless demo mode is requested (WORKROOM_DEMO=1)
    if (process.env.WORKROOM_DEMO !== '1') this.resetToBlank();

    this.loadStateFromFile();
  }

  loadStateFromFile() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const data = compactState(JSON.parse(raw));
        // a bloated file is rewritten small right away, so the next start is fast and clean
        if (raw.length > 1000000) this.healFile = true;
        if (data.agents) {
          for (const [id, a] of Object.entries(data.agents)) {
            const existing = this.agents[id];
            if (existing?.tokenBudget) {
              // the token bar lives in this process; an older copy from another process must not roll it back
              const { tokenBudget, energy, ...rest } = a;
              Object.assign(existing, rest);
            } else {
              this.agents[id] = Object.assign(existing || {}, a);
            }
          }
        }
        if (data.intercomMessages) this.intercomMessages = data.intercomMessages;
        if (data.whiteboard) {
          // Keep the card objects we already have: a running job holds references to them and keeps
          // updating their progress. Cards that only exist in the file (added elsewhere) are taken over.
          const mine = new Map(this.whiteboard.map((c) => [c.id, c]));
          this.whiteboard = data.whiteboard.map((c) => mine.get(c.id) || c);
        }
        if (data.stats) this.stats = { ...this.stats, ...data.stats };
        if (this.healFile) {
          this.healFile = false;
          const before = fs.statSync(STATE_FILE).size;
          this.saveStateToFile();
          console.log(`[StateManager] The saved state was bloated (${(before / 1048576).toFixed(1)} MB). Shortened it to ${(fs.statSync(STATE_FILE).size / 1024).toFixed(0)} KB.`);
        }
      }
    } catch (err) {
      console.warn('[StateManager] Could not load persisted state:', err.message);
    }
  }

  // Pick up changes written by another process (e.g. the stdio MCP server)
  reloadFromFile() { this.loadStateFromFile(); }

  saveStateToFile() {
    try {
      const data = {
        agents: this.agents,
        intercomMessages: this.intercomMessages.slice(-50),
        whiteboard: this.whiteboard,
        stats: this.stats
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
      // remember our own write so the file watcher does not "reload" what we just saved
      this.lastWrittenMtime = fs.statSync(STATE_FILE).mtimeMs;
    } catch (err) {
      console.warn('[StateManager] Could not save state:', err.message);
    }
  }

  // --- MCP Tool Handlers & State Actions ---

  broadcast(message, sender = 'lead') {
    const msg = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toLocaleTimeString(),
      sender,
      recipient: 'all',
      text: clip(message),
      type: 'broadcast'
    };
    this.intercomMessages.push(msg);
    if (this.intercomMessages.length > 100) this.intercomMessages.shift();
    this.stats.mcpToolCalls++;
    this.saveStateToFile();

    this.emit('broadcast', msg);
    this.emit('state_change', { type: 'broadcast', data: msg });
    return msg;
  }

  // Emergency brake: agents talking to each other faster than people ever would means a loop.
  // More than 8 agent-to-agent messages within 10 seconds are dropped until it calms down.
  agentChatTooBusy() {
    const now = Date.now();
    this.agentChatTimes = (this.agentChatTimes || []).filter((t) => now - t < 10000);
    if (this.agentChatTimes.length >= 8) return true;
    this.agentChatTimes.push(now);
    return false;
  }

  sendMessage(recipient, message, sender = 'lead') {
    const msg = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toLocaleTimeString(),
      sender,
      recipient,
      text: clip(message),
      type: 'direct'
    };
    message = msg.text;

    const bothAgents = this.agents[String(sender).toLowerCase()] && this.agents[String(recipient).toLowerCase()];
    if (bothAgents && this.agentChatTooBusy()) {
      if (!this.loopWarned || Date.now() - this.loopWarned > 10000) {
        this.loopWarned = Date.now();
        console.warn(`[StateManager] Agents are messaging each other too fast (${sender} -> ${recipient}). Dropping messages to stop a loop.`);
      }
      return { ...msg, dropped: true };
    }
    this.intercomMessages.push(msg);
    if (this.intercomMessages.length > 100) this.intercomMessages.shift();
    this.stats.mcpToolCalls++;

    const targetAgent = this.agents[recipient.toLowerCase()];
    if (targetAgent) {
      targetAgent.state = 'CHATTING';
      targetAgent.screen.logs.push(`[${new Date().toLocaleTimeString()}] Intercom msg from ${sender}: "${message}"`);
      if (targetAgent.screen.logs.length > 25) targetAgent.screen.logs.shift();
    }

    this.saveStateToFile();
    this.emit('message', msg);
    this.emit('state_change', { type: 'message', data: msg });
    return msg;
  }

  getAgentScreen(agentId) {
    const id = agentId.toLowerCase();
    const agent = this.agents[id];
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found. Available: ${Object.keys(this.agents).join(', ')}`);
    }
    return {
      agent: { id: agent.id, name: agent.name, role: agent.role, status: agent.status, state: agent.state },
      screen: agent.screen
    };
  }

  updateAgentScreen(agentId, { lines, logs, thoughts, status, state }) {
    const id = agentId.toLowerCase();
    const agent = this.agents[id];
    if (!agent) throw new Error(`Agent '${agentId}' not found.`);

    if (lines && Array.isArray(lines)) agent.screen.lines = lines;
    if (logs && Array.isArray(logs)) {
      agent.screen.logs.push(...logs);
      if (agent.screen.logs.length > 25) agent.screen.logs = agent.screen.logs.slice(-25);
    }
    if (thoughts) agent.screen.thoughts = thoughts;
    if (status) agent.status = status;
    if (state) agent.state = state;

    this.saveStateToFile();
    this.emit('agent_update', agent);
    this.emit('state_change', { type: 'agent_update', data: agent });
    return agent;
  }

  assignTask(agentId, title, description, category = 'General') {
    const id = agentId.toLowerCase();
    const agent = this.agents[id];
    if (!agent) throw new Error(`Agent '${agentId}' not found.`);

    agent.currentTask = title;
    agent.status = `Working on: ${title}`;
    agent.state = 'CODING';
    agent.screen.logs.push(`[${new Date().toLocaleTimeString()}] Assigned new task: ${title} (${description || ''})`);

    const taskCard = {
      id: `wb-${Date.now()}`,
      title,
      description,
      assignee: id,
      status: 'IN_PROGRESS',
      progress: 10,
      category
    };
    this.whiteboard.unshift(taskCard);
    if (this.whiteboard.length > 20) this.whiteboard.pop();

    this.saveStateToFile();
    this.emit('task_assigned', { agent, task: taskCard });
    this.emit('state_change', { type: 'task_assigned', data: { agent, task: taskCard } });
    return { agent, task: taskCard };
  }

  listAgents() {
    return Object.values(this.agents).map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      state: a.state,
      energy: a.energy,
      tokenBudget: a.tokenBudget,
      coffeeCups: a.coffeeCups,
      pos: a.pos,
      currentTask: a.currentTask
    }));
  }

  clearAllJobs() {
    this.resetToBlank();
    this.saveStateToFile();
    this.emit('state_change', { type: 'jobs_cleared', data: this.getFullState() });
    return this.getFullState();
  }

  resetToBlank() {
    this.whiteboard = [];
    this.intercomMessages = [];
    this.stats.activeGoal = 'None';
    Object.values(this.agents).forEach((a) => {
      a.currentTask = 'Idle — Awaiting instructions from lead';
      a.status = 'Idle — Ready for task assignment';
      a.state = 'IDLE';
      a.screen.lines = [
        `// ${a.name}'s Workspace (${a.role})`,
        `// Standing by for your first task assignment...`,
        `// Use [Assign Job] in [T] Intercom or run: node src/cli.mjs task ${a.id} "Task Name"`
      ];
      a.screen.thoughts = 'Ready for assignment. Clean workspace initialized.';
      a.screen.logs = [`[${new Date().toLocaleTimeString()}] Workspace cleared. Ready for your jobs!`];
    });
  }

  getFullState() {
    return {
      agents: this.agents,
      intercomMessages: this.intercomMessages,
      whiteboard: this.whiteboard,
      stats: this.stats,
      player: this.player
    };
  }
}

export const stateManager = new WorkroomStateManager();
