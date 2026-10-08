// src/server.mjs - HTTP Web Server & WebSocket Realtime Bridge
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { stateManager } from './state.mjs';
import { agentCoordinator } from './agent-coordinator.mjs';
import { llmProvider } from './llm-provider.mjs';
import { runner, WORKSPACE } from './runner.mjs';
import { startTelegramFromEnv } from './telegram.mjs';
import { phoneBase, isLoopback } from './network.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ENV_FILE = path.join(__dirname, '..', '.env');
const PORT = process.env.PORT || 3333;

// Auto-load .env file if present
function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    const raw = fs.readFileSync(ENV_FILE, 'utf8');
    raw.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] ? match[2].trim() : '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        // real environment wins over .env (tests and CI rely on this)
        if (process.env[match[1]] === undefined) process.env[match[1]] = val;
      }
    });
  }
}
loadEnv();

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

// Start background agent simulation
if (process.env.WORKROOM_DEMO === '1') agentCoordinator.startSimulationLoop(6000);

// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Anything that is not this computer (e.g. your iPhone on the Wi-Fi) may only VIEW generated projects.
  // The control UI, the API and the runner stay local, so nobody on the network can start builds.
  if (!isLoopback(req.socket.remoteAddress)) {
    const viewOnly = (req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/workspace/');
    if (!viewOnly) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Only generated projects are shared on the network.');
      return;
    }
  }

  // Generated apps are served from the 127.0.0.1 origin; the control UI lives on localhost.
  // Refuse any API call whose Origin is not the UI itself so generated pages cannot drive the runner.
  if (pathname.startsWith('/api/') && req.headers.origin && req.headers.origin !== `http://localhost:${PORT}`) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden origin' }));
    return;
  }

  // Result of a team run (read-only static files)
  if (pathname.startsWith('/workspace/')) {
    const rel = decodeURIComponent(pathname.slice('/workspace/'.length)) || 'index.html';
    const wf = path.join(WORKSPACE, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!wf.startsWith(WORKSPACE) || !fs.existsSync(wf) || !fs.statSync(wf).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(wf).toLowerCase()] || 'text/plain' });
    fs.createReadStream(wf).pipe(res);
    return;
  }

  // REST API Routes
  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname, url);
    return;
  }

  // Static file serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA if not found
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

// JSON body helper
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function handleApiRequest(req, res, pathname, url) {
  try {
    if (pathname === '/api/share' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ base: phoneBase(PORT) }));
      return;
    }
    if (pathname === '/api/run' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(runner.status()));
      return;
    }
    if (pathname === '/api/run' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const r = runner.submit({ goal: body.goal, mode: body.mode, improve: !!body.improve, owner: 'web' });
      if (r.job) delete r.job;
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
      return;
    }
    if (pathname === '/api/run/stop' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(runner.stop()));
      return;
    }
    if (pathname === '/api/tokens/refill' && req.method === 'POST') {
      llmProvider.refillAll();
      Object.values(stateManager.agents).forEach((a) => agentCoordinator.syncBudget(a));
      stateManager.saveStateToFile();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stateManager.getFullState()));
      return;
    }
    if (pathname === '/api/tokens' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(llmProvider.getStats()));
      return;
    }
    if (pathname === '/api/eco' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const on = llmProvider.setEcoMode(body.on !== false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ecoMode: on }));
      return;
    }
    if (pathname === '/api/state' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stateManager.getFullState()));
      return;
    }

    if (pathname === '/api/agents' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stateManager.listAgents()));
      return;
    }

    if (pathname.startsWith('/api/agents/') && pathname.endsWith('/screen') && req.method === 'GET') {
      const parts = pathname.split('/');
      const agentId = parts[3];
      const screen = stateManager.getAgentScreen(agentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(screen));
      return;
    }

    if (pathname === '/api/broadcast' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const msg = stateManager.broadcast(body.message, body.sender || 'web');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: msg }));
      return;
    }

    if (pathname === '/api/message' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const msg = stateManager.sendMessage(body.recipient, body.message, body.sender || 'web');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: msg }));
      return;
    }

    if (pathname === '/api/task' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const resData = stateManager.assignTask(body.agentId, body.title, body.description, body.category);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: resData }));
      return;
    }

    if (pathname === '/api/sprint' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      agentCoordinator.triggerSprint(body.feature || 'Pixel Workroom Feature');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, status: 'sprint_started' }));
      return;
    }

    if (pathname === '/api/clear-jobs' && req.method === 'POST') {
      const newState = stateManager.clearAllJobs();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All demo jobs cleared! Ready for fresh work.' }));
      return;
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          hasGemini: !!process.env.GEMINI_API_KEY,
          hasClaude: !!process.env.ANTHROPIC_API_KEY,
          hasOpenAI: !!process.env.OPENAI_API_KEY
        })
      );
      return;
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.geminiKey) process.env.GEMINI_API_KEY = body.geminiKey;
      if (body.claudeKey) process.env.ANTHROPIC_API_KEY = body.claudeKey;
      if (body.openaiKey) process.env.OPENAI_API_KEY = body.openaiKey;

      const lines = [
        `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}`,
        `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
        `OPENAI_API_KEY=${process.env.OPENAI_API_KEY || ''}`
      ];
      fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'API keys saved to .env file!' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// Attach WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  if (!isLoopback(req.socket.remoteAddress)) { ws.close(); return; }
  // Only the control UI may talk to the room over WebSocket
  if (req.headers.origin && req.headers.origin !== `http://localhost:${PORT}`) { ws.close(); return; }
  // Send full initial state upon connection
  ws.send(JSON.stringify({ type: 'init', state: stateManager.getFullState() }));

  ws.on('message', async (data) => {
    try {
      const action = JSON.parse(data.toString());
      if (action.type === 'broadcast') {
        stateManager.broadcast(action.text, action.sender || 'player');
      } else if (action.type === 'send_message') {
        stateManager.sendMessage(action.recipient, action.text, action.sender || 'player');
      } else if (action.type === 'assign_task') {
        stateManager.assignTask(action.agentId, action.title, action.description, action.category);
      } else if (action.type === 'trigger_sprint') {
        agentCoordinator.triggerSprint(action.feature || 'Pixel Quest Arcade Game');
      } else if (action.type === 'update_screen') {
        stateManager.updateAgentScreen(action.agentId, action.data);
      } else if (action.type === 'player_move') {
        stateManager.player.pos = action.pos;
        stateManager.player.dir = action.dir;
      } else if (action.type === 'clear_jobs') {
        stateManager.clearAllJobs();
      } else if (action.type === 'save_keys') {
        if (action.geminiKey) process.env.GEMINI_API_KEY = action.geminiKey;
        if (action.claudeKey) process.env.ANTHROPIC_API_KEY = action.claudeKey;
        if (action.openaiKey) process.env.OPENAI_API_KEY = action.openaiKey;
        const lines = [
          `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}`,
          `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
          `OPENAI_API_KEY=${process.env.OPENAI_API_KEY || ''}`
        ];
        fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
      }
    } catch (e) {
      console.error('[WebSocket] Invalid action received:', e.message);
    }
  });
});

// Live-sync with the stdio MCP server: it writes the state file, we reload and push to browsers
const STATE_PATH = process.env.WORKROOM_STATE_FILE || path.join(__dirname, '..', 'workroom-state.json');
let lastMtime = 0;
fs.watchFile(STATE_PATH, { interval: 500 }, (cur) => {
  if (cur.mtimeMs === lastMtime) return;
  lastMtime = cur.mtimeMs;
  stateManager.reloadFromFile();
  const msg = JSON.stringify({ type: 'init', state: stateManager.getFullState() });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
});

// Broadcast any state change to all connected WebSocket clients
function broadcastWs(msgObj) {
  const payload = JSON.stringify(msgObj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

stateManager.on('state_change', (change) => {
  broadcastWs({ type: 'state_change', change });
});

// Start listening
const HOST = process.env.LAN_SHARE === '0' ? '127.0.0.1' : '0.0.0.0';
server.listen(PORT, HOST, () => {
  startTelegramFromEnv(PORT);
  console.log(`====================================================`);
  console.log(`🎮 Pixel Workroom 3D Server running at: http://localhost:${PORT}`);
  console.log(`🔌 MCP Stdio Bridge active | WebSockets listening`);
  const phone = phoneBase(PORT);
  console.log(phone ? `📱 Phone (same Wi-Fi) opens finished projects at: ${phone}/workspace/<project>/` : '📱 Phone sharing is off (LAN_SHARE=0 or no network found)');
  console.log(`====================================================`);
});
