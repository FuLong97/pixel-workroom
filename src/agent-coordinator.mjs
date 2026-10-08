// src/agent-coordinator.mjs - Autonomous Agent Lifecycle & Collaboration Coordinator
import { stateManager } from './state.mjs';
import { llmProvider } from './llm-provider.mjs';

export class AgentCoordinator {
  constructor(state = stateManager) {
    this.state = state;
    this.simulationTimer = null;
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

    // Only people get an automatic answer. If the sender is another agent (an MCP tool, demo
    // chatter) the message is just shown: answering it would make the
    // two agents reply to each other forever, spending tokens on every round.
    if (this.state.agents[String(msg.sender).toLowerCase()]) {
      // they glance at it, then go back to what they were doing
      setTimeout(() => {
        if (agent.state !== 'CHATTING') return;
        agent.state = /^Idle/.test(agent.currentTask || '') ? 'IDLE' : 'CODING';
        this.state.emit('state_change', { type: 'agent_update', data: agent });
      }, 1500);
      return;
    }

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

  // A message to everyone: ONE agent answers it, in turn, so a person always gets an answer but the
  // room does not babble. Messages from agents and the room's own announcements ('system') get no answer,
  // otherwise agents would keep answering each other.
  async handleBroadcast(msg) {
    const sender = String(msg.sender).toLowerCase();
    if (sender === 'all' || sender === 'system' || this.state.agents[sender]) return;

    const ids = Object.keys(this.state.agents);
    this.nextResponder = (this.nextResponder ?? -1) + 1;
    const responder = ids[this.nextResponder % ids.length];
    const agent = this.state.agents[responder];

    agent.state = 'THINKING';
    agent.status = `Answering ${msg.sender}...`;
    this.state.emit('state_change', { type: 'agent_update', data: agent });

    setTimeout(async () => {
      let text;
      try {
        const turn = await llmProvider.generateAgentTurn(responder, msg.text, this.state.intercomMessages);
        this.syncBudget(agent);
        agent.screen.thoughts = turn.thoughts;
        text = turn.text;
      } catch {
        text = `${agent.name} here: I heard you.`;
      }
      const hasJob = !/^Idle/.test(agent.currentTask || '');
      agent.state = hasJob ? 'CODING' : 'IDLE';
      agent.status = hasJob ? `Active on ${agent.currentTask}` : 'Idle — Ready for task assignment';
      this.state.broadcast(text, responder);   // the answer goes to the public channel
      this.state.emit('state_change', { type: 'agent_update', data: agent });
    }, 1000);
  }

}

export const agentCoordinator = new AgentCoordinator();
