// src/cli.mjs - Command-Line Interface to interact with Workroom & MCP
import { stateManager } from './state.mjs';
import { agentCoordinator } from './agent-coordinator.mjs';

const [,, cmd, ...args] = process.argv;

async function run() {
  switch (cmd) {
    case 'broadcast': {
      const text = args.join(' ') || 'Status check from Antigravity CLI!';
      const msg = stateManager.broadcast(text, 'antigravity-cli');
      console.log(`[MCP Broadcast Sent] "${msg.text}" (ID: ${msg.id})`);
      break;
    }
    case 'send': {
      const recipient = args[0] || 'alice';
      const text = args.slice(1).join(' ') || 'Hello from terminal!';
      const msg = stateManager.sendMessage(recipient, text, 'antigravity-cli');
      console.log(`[Message Sent to ${recipient}] "${msg.text}"`);
      await new Promise(r => setTimeout(r, 1500));
      const agent = stateManager.agents[recipient.toLowerCase()];
      console.log(`[Agent Thoughts]: "${agent?.screen?.thoughts}"`);
      break;
    }
    case 'screen': {
      const agentId = args[0] || 'alice';
      const screen = stateManager.getAgentScreen(agentId);
      console.log(`=== FIRST-PERSON MONITOR: ${screen.agent.name.toUpperCase()} (${screen.agent.role}) ===`);
      console.log(`Status: ${screen.agent.status} | State: ${screen.agent.state}`);
      console.log(`Editor file: ${screen.screen.file}`);
      console.log('--- Lines ---');
      screen.screen.lines.forEach((l, i) => console.log(`${(i+1).toString().padStart(2, ' ')} | ${l}`));
      console.log('--- Logs ---');
      screen.screen.logs.slice(-5).forEach(l => console.log(l));
      console.log(`Thoughts: "${screen.screen.thoughts}"`);
      break;
    }
    case 'list': {
      const agents = stateManager.listAgents();
      console.log('=== WORKROOM AGENTS ===');
      agents.forEach(a => {
        console.log(`- ${a.name} (${a.role}) [${a.state}] @ Desk #${a.pos.x},${a.pos.z} - ${a.status}`);
      });
      break;
    }
    case 'whiteboard': {
      console.log('=== WORKROOM WHITEBOARD ===');
      stateManager.whiteboard.forEach(t => {
        console.log(`[${t.status}] ${t.title} (Assignee: @${t.assignee}, Progress: ${t.progress}%)`);
      });
      break;
    }
    case 'task': {
      const agentId = args[0] || 'alice';
      const title = args[1] || 'Optimize rendering pipeline';
      const desc = args.slice(2).join(' ') || 'Assigned via terminal';
      const result = stateManager.assignTask(agentId, title, desc, 'Engineering');
      console.log(`[Job Assigned to @${result.agent.name}] Title: "${result.task.title}" (Status: ${result.task.status})`);
      console.log(`Whiteboard updated. Agent desk screen notified.`);
      break;
    }
    case 'eco': {
      const mode = args[0]?.toLowerCase();
      const { llmProvider } = await import('./llm-provider.mjs');
      if (mode === 'on') llmProvider.setEcoMode(true);
      else if (mode === 'off') llmProvider.setEcoMode(false);
      else llmProvider.setEcoMode(!llmProvider.ecoMode);
      
      const stats = llmProvider.getStats();
      console.log(`🌱 Token-Saver Mode: ${stats.ecoMode ? 'ACTIVE (Savings Enabled)' : 'OFF (Full LLM Calls)'}`);
      console.log(`   Tokens Used: ${stats.totalTokensUsed} | Tokens Saved: ${stats.tokensSaved} (~${stats.savingsPercentage}% saved)`);
      break;
    }
    case 'models': {
      const { llmProvider } = await import('./llm-provider.mjs');
      console.log('=== CONNECTED LLM MODELS & PROVIDERS ===');
      Object.entries(llmProvider.agentModels).forEach(([id, c]) => {
        console.log(`- @${id} (${c.persona}): Provider = [${c.provider.toUpperCase()}], Primary = ${c.model}, Eco = ${c.fallbackModel}`);
      });
      console.log('\nSupported API Keys: GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY');
      const stats = llmProvider.getStats();
      console.log(`Token-Saver Mode: ${stats.ecoMode ? 'ON' : 'OFF'} | Est. Tokens Saved: ${stats.tokensSaved}`);
      break;
    }
    default: {
      console.log(`
Usage: node src/cli.mjs <command> [arguments]

Commands:
  task <agent> <title> [desc] Give an agent a job (e.g. node src/cli.mjs task bob "Refactor Shader")
  eco [on|off]               Toggle Token-Saver Mode or view token savings
  models                     Show LLM providers (Gemini, Claude, Codex) and agent mappings
  list                       List all agents and status
  screen <agent>             Inspect first-person monitor of an agent (alice, bob, charlie, diana, echo)
  broadcast <text>           Send an intercom broadcast to all agents
  send <agent> <text>        Send a direct message to an agent over MCP
  whiteboard                 View the central office whiteboard
`);
    }
  }
}

run().catch(console.error);
