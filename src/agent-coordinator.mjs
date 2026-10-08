// src/agent-coordinator.mjs - Autonomous Agent Lifecycle & Collaboration Coordinator
import { stateManager } from './state.mjs';
import { llmProvider } from './llm-provider.mjs';

export class AgentCoordinator {
  constructor(state = stateManager) {
    this.state = state;
    this.simulationTimer = null;
    this.sprintInProgress = false;
    for (const a of Object.values(this.state.agents)) this.syncBudget(a);

    // Listen to messages addressed to agents
    this.state.on('message', (msg) => this.handleDirectMessage(msg));
    this.state.on('broadcast', (msg) => this.handleBroadcast(msg));
  }

  // Energy bar == share of the agent's token budget still unspent
  syncBudget(agent) {
    // Seed the provider from persisted state once; after that the provider is the source of truth
    this.seeded ??= new Set();
    if (!this.seeded.has(agent.id)) {
      this.seeded.add(agent.id);
      if (agent.tokenBudget) llmProvider.setBudget(agent.id, agent.tokenBudget.used);
    }
    const b = llmProvider.getBudget(agent.id);
    agent.tokenBudget = { used: b.used, limit: b.limit };
    agent.energy = Math.max(0, Math.round(100 * (1 - b.used / b.limit)));
  }

  startSimulationLoop(intervalMs = 7000) {
    if (this.simulationTimer) clearInterval(this.simulationTimer);

    this.simulationTimer = setInterval(() => {
      if (this.sprintInProgress) return;
      this.tickAgentLife();
    }, intervalMs);
  }

  stopSimulationLoop() {
    if (this.simulationTimer) clearInterval(this.simulationTimer);
  }

  tickAgentLife() {
    const agentKeys = Object.keys(this.state.agents);
    const chosenKey = agentKeys[Math.floor(Math.random() * agentKeys.length)];
    const agent = this.state.agents[chosenKey];

    const actions = [
      () => {
        // Code / Test update
        const timeStr = new Date().toLocaleTimeString();
        if (agent.id === 'bob') {
          agent.screen.logs.push(`[Bob ${timeStr}] Canvas sub-pixel rasterization pass complete.`);
          agent.screen.lines[2] = `  const wallHeight = Math.floor(CANVAS_HEIGHT / Math.max(0.1, ray.perpDistance)); // DDA safe`;
        } else if (agent.id === 'alice') {
          agent.screen.logs.push(`[Alice ${timeStr}] Schema check passed: JSON-RPC 2.0 tool definitions.`);
        } else if (agent.id === 'charlie') {
          agent.screen.logs.push(`[Charlie ${timeStr}] Ping latency across MCP bus: 1.4ms`);
          this.state.stats.packetsTransferred += Math.floor(Math.random() * 20) + 5;
        } else if (agent.id === 'diana') {
          agent.screen.logs.push(`[Diana ${timeStr}] Vitest suite: 18/18 assertions green.`);
        } else if (agent.id === 'echo') {
          agent.screen.logs.push(`[Echo ${timeStr}] Cached 12 context vectors for agent fast-recall.`);
        }
        if (agent.screen.logs.length > 25) agent.screen.logs.shift();
        this.state.updateAgentScreen(agent.id, { logs: [] });
      },
      () => {
        // Coffee break
        if (agent.state !== 'COFFEE') {
          const oldState = agent.state;
          agent.state = 'COFFEE';
          agent.coffeeCups++;
          agent.status = 'Grabbing a fresh espresso';
          this.state.emit('state_change', { type: 'agent_update', data: agent });
          setTimeout(() => {
            agent.state = oldState;
            agent.status = `Back at desk (${agent.currentTask})`;
            this.state.emit('state_change', { type: 'agent_update', data: agent });
          }, 4000);
        }
      },
      () => {
        // Agent inter-communication
        const targets = agentKeys.filter((k) => k !== chosenKey);
        const target = targets[Math.floor(Math.random() * targets.length)];
        const chatter = [
          { from: 'bob', to: 'alice', text: 'Hey Alice, the raycaster viewport is rendering at ultra-crisp 320x240 pixel resolution!' },
          { from: 'charlie', to: 'diana', text: 'Diana, just pushed new test assertions for the MCP tool dispatcher.' },
          { from: 'diana', to: 'charlie', text: 'Checked them! Boundary tests passed without warnings.' },
          { from: 'alice', to: 'bob', text: 'Looks great Bob! Make sure monitor phosphor bloom stays under 15% opacity.' },
          { from: 'echo', to: 'all', text: 'Knowledge tip: Antigravity can call workroom tools natively via mcp_config.json!' }
        ];

        const match = chatter.find((c) => c.from === chosenKey && (c.to === target || c.to === 'all'));
        if (match) {
          if (match.to === 'all') {
            this.state.broadcast(match.text, chosenKey);
          } else {
            this.state.sendMessage(match.to, match.text, chosenKey);
          }
        }
      }
    ];

    const chosenAction = actions[Math.floor(Math.random() * actions.length)];
    chosenAction();
  }

  async handleDirectMessage(msg) {
    if (msg.sender === msg.recipient) return;
    const recipient = msg.recipient.toLowerCase();
    const agent = this.state.agents[recipient];
    if (!agent) return;

    // React visually: change state to THINKING
    agent.state = 'THINKING';
    agent.status = `Processing query from ${msg.sender}...`;
    this.state.emit('state_change', { type: 'agent_update', data: agent });

    setTimeout(async () => {
      try {
        const turnResult = await llmProvider.generateAgentTurn(recipient, msg.text, this.state.intercomMessages);
        
        this.syncBudget(agent);
        agent.screen.thoughts = turnResult.thoughts;
        if (turnResult.code) {
          agent.screen.lines = turnResult.code;
        }
        const hasJob = !/^Idle/.test(agent.currentTask || '');
        agent.state = hasJob ? 'CODING' : 'IDLE';
        agent.status = hasJob ? `Active on ${agent.currentTask}` : 'Idle — Ready for task assignment';

        this.state.sendMessage(msg.sender, turnResult.text, recipient);
      } catch (err) {
        agent.state = 'IDLE';
        this.state.sendMessage(msg.sender, `[Fallback] Acknowledged: "${msg.text}". Ready for next task.`, recipient);
      }
    }, 1000);
  }

  async handleBroadcast(msg) {
    if (msg.sender === 'all') return;
    // When lead sends a broadcast, an agent acknowledges
    if (msg.sender === 'lead' || msg.sender === 'user') {
      setTimeout(() => {
        const acknowledgers = ['alice', 'charlie', 'bob'];
        const responder = acknowledgers[Math.floor(Math.random() * acknowledgers.length)];
        this.state.sendMessage(
          'all',
          `Acknowledged lead broadcast: "${msg.text}". Agents standing by on MCP bus.`,
          responder
        );
      }, 1500);
    }
  }

  async triggerSprint(featureName = 'Pixel Retro Arcade Mini-Game') {
    if (this.sprintInProgress) return { status: 'already_running' };
    this.sprintInProgress = true;

    this.state.stats.activeSprint = `Sprint: ${featureName}`;
    this.state.broadcast(`🚀 Starting Collaborative Sprint: "${featureName}"! All agents report in.`, 'alice');

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Phase 1: Alice breaks down the architecture
    await sleep(2000);
    this.state.agents.alice.state = 'CODING';
    this.state.agents.alice.status = `Architecting: ${featureName}`;
    this.state.assignTask('bob', `Implement rendering for ${featureName}`, 'Canvas sprites & animations', 'Frontend');
    this.state.assignTask('charlie', `Build backend state & MCP bridge for ${featureName}`, 'JSON-RPC handlers', 'Backend');
    this.state.assignTask('diana', `Write Vitest unit & E2E suite for ${featureName}`, 'Security & QA', 'QA');
    this.state.sendMessage('all', `Architecture spec posted to whiteboard. Bob, Charlie, Diana: sprint tasks assigned!`, 'alice');

    // Phase 2: Bob begins frontend coding
    await sleep(2500);
    this.state.agents.bob.state = 'CODING';
    this.state.agents.bob.status = `Coding pixel sprites for ${featureName}`;
    this.state.updateAgentScreen('bob', {
      lines: [
        `// Sprint Feature: ${featureName}`,
        `export class PixelGameEngine {`,
        `  constructor(public canvas: HTMLCanvasElement) {`,
        `    this.ctx = canvas.getContext('2d')!;`,
        `    this.sprites = new Map();`,
        `    console.log('[Sprint] Initialized 60 FPS rendering pipeline');`,
        `  }`,
        `  renderFrame(state: GameState) {`,
        `    this.ctx.imageSmoothingEnabled = false;`,
        `    this.renderEntities(state.entities);`,
        `  }`,
        `}`
      ],
      logs: [`[Bob] Wrote core game engine loop for ${featureName}`]
    });
    this.state.sendMessage('alice', `Frontend engine skeleton compiled and rendering at 60 FPS!`, 'bob');

    // Phase 3: Charlie writes backend
    await sleep(2500);
    this.state.agents.charlie.state = 'CODING';
    this.state.agents.charlie.status = `Writing MCP tools for ${featureName}`;
    this.state.updateAgentScreen('charlie', {
      lines: [
        `// Backend MCP Dispatcher for ${featureName}`,
        `export function registerSprintTools(server: McpServer) {`,
        `  server.tool('game_action', { action: z.string() }, async ({ action }) => {`,
        `    return { content: [{ type: 'text', text: \`Action '\${action}' executed\` }] };`,
        `  });`,
        `  console.log('[MCP] Registered sprint tools successfully');`,
        `}`
      ],
      logs: [`[Charlie] Integrated sprint tool calls with WebSocket broadcast`]
    });
    this.state.sendMessage('bob', `Backend state synchronization protocol is ready on the local WebSocket bus.`, 'charlie');

    // Phase 4: Diana tests and finds a lint / boundary warning
    await sleep(2500);
    this.state.agents.diana.state = 'TESTING';
    this.state.agents.diana.status = `Running automated test suite`;
    this.state.updateAgentScreen('diana', {
      lines: [
        `RUNNING test/sprint/${featureName.toLowerCase().replace(/\\s+/g, '-')}.test.ts`,
        `✓ should mount game engine canvas (4ms)`,
        `✓ should connect to MCP state stream (6ms)`,
        `⚠ edge-case: boundary collision at x=0 causes subpixel clipping`,
        `PASS: 19 | FAIL: 0 | WARN: 1`
      ],
      logs: [`[Diana] Flagged minor subpixel clipping at boundary for Bob`]
    });
    this.state.sendMessage('bob', `Bob, check boundary clipping when x <= 0 in renderEntities.`, 'diana');

    // Phase 5: Bob patches the issue
    await sleep(2000);
    this.state.agents.bob.screen.lines[9] = `    this.renderEntities(state.entities.map(e => ({ ...e, x: Math.max(0, e.x) }))); // Patched!`;
    this.state.updateAgentScreen('bob', { logs: [`[Bob] Fixed boundary clipping, pushed patch!`] });
    this.state.sendMessage('diana', `Patched! Re-run the assertion suite.`, 'bob');

    // Phase 6: Diana verifies 100% green
    await sleep(1800);
    this.state.agents.diana.screen.lines[3] = `✓ boundary collision clipping resolved (2ms)`;
    this.state.agents.diana.screen.lines[4] = `PASS: 20 | FAIL: 0 | 100% GREEN`;
    this.state.updateAgentScreen('diana', { logs: [`[Diana] All 20 tests verified green!`] });
    this.state.sendMessage('alice', `QA verification complete. Zero defects found. Ready for deployment!`, 'diana');

    // Phase 7: Echo writes release notes
    await sleep(2000);
    this.state.agents.echo.state = 'RESEARCHING';
    this.state.agents.echo.status = `Synthesizing sprint documentation`;
    this.state.updateAgentScreen('echo', {
      lines: [
        `# Release Notes: ${featureName}`,
        `- Engine: 60 FPS pixel rendering with zero subpixel artifacting`,
        `- Protocol: MCP JSON-RPC 2.0 tool endpoints active`,
        `- Quality: 20/20 Vitest assertions passed`,
        `- Ready for Antigravity live orchestration`
      ],
      logs: [`[Echo] Generated release notes and indexed into agent memory`]
    });
    this.state.broadcast(`🎉 SPRINT COMPLETE! "${featureName}" successfully built, tested, and shipped by Alice, Bob, Charlie, Diana & Echo!`, 'alice');

    // Update whiteboard tasks to DONE
    this.state.whiteboard.forEach((task) => {
      if (task.status === 'IN_PROGRESS') {
        task.status = 'DONE';
        task.progress = 100;
      }
    });
    this.state.saveStateToFile();
    this.sprintInProgress = false;

    return { status: 'sprint_completed', feature: featureName };
  }
}

export const agentCoordinator = new AgentCoordinator();
