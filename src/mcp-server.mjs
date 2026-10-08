// src/mcp-server.mjs - Model Context Protocol Stdio Server for Pixel Workroom
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { stateManager } from './state.mjs';
import { agentCoordinator } from './agent-coordinator.mjs';

// Create the MCP server instance
const server = new McpServer({
  name: 'pixel-workroom-mcp',
  version: '1.0.0'
});

// Re-read shared state before every tool call so the stdio process stays in sync with the web UI
const _tool = server.tool.bind(server);
server.tool = (...args) => {
  const h = args.pop();
  return _tool(...args, async (...a) => { stateManager.reloadFromFile(); return h(...a); });
};

// Tool 1: Broadcast message to workroom
server.tool(
  'workroom_broadcast',
  'Broadcast an announcement or instruction to all agents in the pixel workroom intercom',
  {
    message: z.string().describe('Message to broadcast to the entire workroom'),
    sender: z.string().optional().describe('Name of the sender (defaults to "lead")')
  },
  async ({ message, sender = 'lead' }) => {
    const msg = stateManager.broadcast(message, sender);
    return {
      content: [
        {
          type: 'text',
          text: `[MCP Broadcast Sent] ID: ${msg.id} | Timestamp: ${msg.timestamp}\n"${message}"\nAll agents notified.`
        }
      ]
    };
  }
);

// Tool 2: Send direct message to a specific agent
server.tool(
  'workroom_send_agent_message',
  'Send a direct message or prompt to a specific agent (alice, bob, charlie, diana, echo) in the pixel workroom',
  {
    recipient: z.enum(['alice', 'bob', 'charlie', 'diana', 'echo']).describe('Target agent ID'),
    message: z.string().describe('Message or prompt to send to the agent'),
    sender: z.string().optional().describe('Sender name (defaults to "lead")')
  },
  async ({ recipient, message, sender = 'lead' }) => {
    const sentMsg = stateManager.sendMessage(recipient, message, sender);

    // Wait slightly to let the agent process and respond
    await new Promise((res) => setTimeout(res, 1500));

    const agent = stateManager.agents[recipient];
    const recentReplies = stateManager.intercomMessages.filter(
      (m) => m.sender === recipient && (m.recipient === sender || m.recipient === 'all')
    );
    const latestReply = recentReplies.length > 0 ? recentReplies[recentReplies.length - 1].text : '(thinking...)';

    return {
      content: [
        {
          type: 'text',
          text: `[MCP Message Delivered to ${agent.name} (${agent.role})]\nAgent Status: ${agent.status} (State: ${agent.state})\nAgent Screen Thoughts: "${agent.screen.thoughts}"\nAgent Response: "${latestReply}"`
        }
      ]
    };
  }
);

// Tool 3: Get first-person screen content of an agent
server.tool(
  'workroom_get_screen',
  "Inspect what an agent is currently doing on their CRT monitor in first-person view (code editor, terminal logs, thoughts)",
  {
    agent_id: z.enum(['alice', 'bob', 'charlie', 'diana', 'echo']).describe('Agent identifier')
  },
  async ({ agent_id }) => {
    const data = stateManager.getAgentScreen(agent_id);
    const screenText = [
      `======================================================`,
      `[FIRST-PERSON MONITOR VIEW: ${data.agent.name.toUpperCase()} (${data.agent.role})]`,
      `Status: ${data.agent.status} | State: ${data.agent.state}`,
      `Current File: ${data.screen.file} (${data.screen.title})`,
      `------------------------------------------------------`,
      `EDITOR BUFFER:`,
      ...data.screen.lines.map((l, i) => `${(i + 1).toString().padStart(2, ' ')} | ${l}`),
      `------------------------------------------------------`,
      `INTERNAL THOUGHTS:`,
      `"${data.screen.thoughts}"`,
      `------------------------------------------------------`,
      `RECENT TERMINAL OUTPUT:`,
      ...data.screen.logs.slice(-6),
      `======================================================`
    ].join('\n');

    return {
      content: [{ type: 'text', text: screenText }]
    };
  }
);

// Tool 4: Update an agent's screen buffer
server.tool(
  'workroom_update_agent_screen',
  "Directly write new code lines, terminal logs, or thoughts to an agent's CRT screen in the workroom",
  {
    agent_id: z.enum(['alice', 'bob', 'charlie', 'diana', 'echo']).describe('Agent identifier'),
    lines: z.array(z.string()).optional().describe('New lines of code or content for editor'),
    logs: z.array(z.string()).optional().describe('Terminal log entries to append'),
    thoughts: z.string().optional().describe('New thought string for the agent'),
    status: z.string().optional().describe('Updated agent status line')
  },
  async ({ agent_id, lines, logs, thoughts, status }) => {
    const updated = stateManager.updateAgentScreen(agent_id, { lines, logs, thoughts, status });
    return {
      content: [
        {
          type: 'text',
          text: `[Screen Updated for ${updated.name}]\nStatus: ${updated.status}\nEditor Lines: ${updated.screen.lines.length} lines\nThoughts: "${updated.screen.thoughts}"`
        }
      ]
    };
  }
);

// Tool 5: Assign task to agent
server.tool(
  'workroom_assign_task',
  'Assign a new task to an agent in the workroom and add it to the central whiteboard',
  {
    agent_id: z.enum(['alice', 'bob', 'charlie', 'diana', 'echo']).describe('Target agent'),
    title: z.string().describe('Task title'),
    description: z.string().optional().describe('Task description or acceptance criteria'),
    category: z.string().optional().describe('Task category (e.g. Frontend, Backend, QA, Architecture)')
  },
  async ({ agent_id, title, description, category }) => {
    const result = stateManager.assignTask(agent_id, title, description, category);
    return {
      content: [
        {
          type: 'text',
          text: `[Task Assigned]\nID: ${result.task.id}\nAssignee: ${result.agent.name}\nTitle: "${result.task.title}"\nStatus: ${result.task.status}`
        }
      ]
    };
  }
);

// Tool 6: List all agents and their status
server.tool(
  'workroom_list_agents',
  'List all agents in the pixel workroom, their coordinates, roles, energy, and current tasks',
  {},
  async () => {
    const agents = stateManager.listAgents();
    const rows = agents.map(
      (a) =>
        `- ${a.name} (${a.role}): State=${a.state}, Energy=${a.energy}%, Coffee=${a.coffeeCups} cups, Pos=(${a.pos.x}, ${a.pos.z})\n  Current Task: "${a.currentTask}"\n  Status: "${a.status}"`
    );
    return {
      content: [
        {
          type: 'text',
          text: `=== PIXEL WORKROOM AGENTS (${agents.length} active) ===\n${rows.join('\n\n')}`
        }
      ]
    };
  }
);

// Tool 7: View the whiteboard
server.tool(
  'workroom_get_whiteboard',
  'View the central office whiteboard showing all tasks and their progress',
  {},
  async () => {
    const wb = stateManager.whiteboard;
    const cards = wb.map(
      (t) => `[${t.status}] [${t.category}] ${t.title} -> Assigned: @${t.assignee} (${t.progress}%)`
    );
    return {
      content: [
        {
          type: 'text',
          text: `=== CENTRAL WORKROOM WHITEBOARD ===\n${cards.join('\n')}`
        }
      ]
    };
  }
);

// Tool 9: Get intercom history
server.tool(
  'workroom_intercom_history',
  'Retrieve recent conversation and message logs from the MCP intercom bus',
  {
    limit: z.number().optional().describe('Maximum number of messages to return')
  },
  async ({ limit = 10 }) => {
    const msgs = stateManager.intercomMessages.slice(-limit);
    const formatted = msgs.map((m) => `[${m.timestamp}] <${m.sender} -> ${m.recipient}>: ${m.text}`);
    return {
      content: [
        {
          type: 'text',
          text: `=== MCP INTERCOM HISTORY ===\n${formatted.join('\n')}`
        }
      ]
    };
  }
);

// Start server on stdio transport
async function main() {
  // Start the background agent life simulation
  if (process.env.WORKROOM_DEMO === '1') agentCoordinator.startSimulationLoop();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so stdout remains clean for MCP JSON-RPC
  console.error('[PixelWorkroom MCP Server] Running on stdio transport.');
}

main().catch((err) => {
  console.error('[PixelWorkroom MCP Server] Fatal error:', err);
  process.exit(1);
});
