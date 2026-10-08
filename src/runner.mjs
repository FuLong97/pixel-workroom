// src/runner.mjs - Runs a team goal through the local Claude Code CLI inside ./workspace
// Each agent gets a role-specific prompt; output streams to their in-world monitor.
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stateManager } from './state.mjs';
import { agentCoordinator } from './agent-coordinator.mjs';
import { llmProvider } from './llm-provider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WORKSPACE = process.env.WORKROOM_WORKSPACE || path.join(__dirname, '..', 'workspace');

const ROLES = {
  alice: { label: 'Plan', category: 'Core', prompt: (g) => `You are Alice, systems architect. Goal: "${g}". Write a SHORT PLAN.md (max 25 lines): file list, features, how it runs in a browser with no build step. Do not write any other file.` },
  bob: { label: 'Build', category: 'Frontend', prompt: (g, team) => `You are Bob, frontend engineer. Goal: "${g}". ${team ? 'Follow PLAN.md. ' : ''}Build it as a working, self-contained browser app: index.html plus optional style.css/app.js, no external build step, no network dependencies. Keep it compact and polished. Open-ready: index.html must run by double-clicking. It MUST also work on an iPhone (Safari): include <meta name="viewport" content="width=device-width, initial-scale=1">, a responsive layout, touch controls for any game (on-screen buttons or swipe, no keyboard-only input), tap targets of at least 44px, and no hover-only features.` },
  charlie: { label: 'Logic', category: 'Backend', prompt: (g) => `You are Charlie, logic/backend engineer. Goal: "${g}". Review the existing files and improve the core logic and state handling (persistence via localStorage if useful, no bugs, clean structure). Edit existing files; do not rewrite from scratch.` },
  diana: { label: 'Test', category: 'QA', prompt: (g) => `You are Diana, QA auditor. Goal: "${g}". Read the code carefully, find real bugs or broken flows, and fix them with minimal edits. Do not add features.` },
  echo: { label: 'Docs', category: 'Research', prompt: (g) => `You are Echo, documentation specialist. Goal: "${g}". Write a concise README.md (what it is, how to open it, controls). Do not change code.` }
};

export const MAX_QUEUE = 5;        // goals waiting in total
export const MAX_PER_OWNER = 2;    // goals one person may have waiting

const MODE_STEPS = { solo: ['bob'], team: ['alice', 'bob', 'charlie', 'diana', 'echo'] };

class Runner extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.job = null;
    this.seq = 0;
    this.reset();
    this.dir = this.newestProject();
  }

  // After a restart, offer the most recently modified project for "improve"
  newestProject() {
    try {
      return fs.readdirSync(WORKSPACE, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, t: fs.statSync(path.join(WORKSPACE, d.name)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0]?.name || null;
    } catch {
      return null;
    }
  }

  reset() {
    this.running = false;
    this.child = null;
    this.goal = '';
    this.mode = 'solo';
    this.steps = [];
    this.current = -1;
    this.error = null;
    this.cancelled = false;
    // keep the last project folder so the next goal can opt in to improving it
    this.dir = this.dir || null;
  }

  status() {
    return {
      running: this.running,
      goal: this.goal,
      mode: this.mode,
      dir: this.dir,
      owner: this.job?.owner ?? null,
      queue: this.queue.map((j) => ({ id: j.id, goal: j.goal, mode: j.mode, owner: j.owner })),
      steps: this.steps,
      current: this.current,
      error: this.error,
      files: this.listFiles()
    };
  }

  get cwd() {
    return path.join(WORKSPACE, this.dir || '');
  }

  listFiles() {
    if (!this.dir) return [];
    try {
      return fs.readdirSync(this.cwd, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => path.relative(this.cwd, path.join(d.parentPath || d.path, d.name)).replace(/\\/g, '/'))
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  push(agent, line) {
    agent.screen.logs.push(`[${new Date().toLocaleTimeString()}] ${line}`);
    if (agent.screen.logs.length > 25) agent.screen.logs.shift();
  }

  refreshAgent(agent) {
    agentCoordinator.syncBudget(agent);
    stateManager.emit('state_change', { type: 'agent_update', data: agent });
  }

  // Legacy single-shot start: refuses while busy. Use submit() to queue instead.
  start(goal, mode = 'solo', improve = false) {
    if (this.running) return { ok: false, error: 'A run is already in progress.' };
    const r = this.submit({ goal, mode, improve });
    return r.ok ? { ok: true } : r;
  }

  // Starts now if idle, otherwise waits in line. "ahead" = goals that run before this one.
  submit({ goal, mode = 'solo', improve = false, owner = 'web' }) {
    goal = String(goal || '').trim().slice(0, 600);
    if (!goal) return { ok: false, error: 'Please describe a goal.' };
    const job = { id: ++this.seq, goal, mode: mode === 'team' ? 'team' : 'solo', improve: !!improve, owner: String(owner), wasQueued: false };

    if (!this.running) {
      this.startJob(job);
      return { ok: true, started: true, ahead: 0, job };
    }
    if (this.queue.length >= MAX_QUEUE) return { ok: false, error: `The queue is full (${MAX_QUEUE} waiting). Try again in a while.` };
    const mine = this.queue.filter((j) => j.owner === job.owner).length;
    if (mine >= MAX_PER_OWNER) return { ok: false, error: `You already have ${mine} goals waiting. Wait for one to start or /cancel.` };
    job.wasQueued = true;
    this.queue.push(job);
    return { ok: true, queued: true, ahead: this.queue.length, job };
  }

  // Remove waiting goals of one owner (or all). Returns how many were removed.
  cancelQueued(owner = null) {
    const before = this.queue.length;
    this.queue = owner == null ? [] : this.queue.filter((j) => j.owner !== String(owner));
    return before - this.queue.length;
  }

  next() {
    if (this.running) return;
    const job = this.queue.shift();
    if (job) this.startJob(job);
  }

  startJob(job) {
    const { goal, mode, improve } = job;
    // Every goal gets its own folder so earlier projects are never overwritten.
    // "improve" reuses the previous project's folder on purpose.
    const reuse = improve && this.dir && fs.existsSync(path.join(WORKSPACE, this.dir)) ? this.dir : null;
    const slug = goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'project';
    const stamp = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, '');
    const dir = reuse || `${slug}-${stamp}`;
    fs.mkdirSync(path.join(WORKSPACE, dir), { recursive: true });

    this.reset();
    this.dir = dir;
    this.job = job;
    this.running = true;
    this.goal = goal;
    this.mode = mode;
    this.steps = MODE_STEPS[this.mode].map((id) => ({ agent: id, label: ROLES[id].label, status: 'PENDING' }));

    stateManager.stats.activeSprint = goal;
    stateManager.broadcast(`🎯 New goal: "${goal}" (${this.mode === 'team' ? 'full team' : 'solo: Bob'})`, 'lead');
    this.emit('started', { id: job.id, owner: job.owner, goal, mode, dir, wasQueued: job.wasQueued });
    this.loop().catch((e) => this.fail(e.message));
  }

  // Tell listeners (Telegram) the job is over, then start whoever is next in line
  finishJob(error = null) {
    const job = this.job;
    this.job = null;
    if (job) {
      this.emit('finished', { id: job.id, owner: job.owner, goal: job.goal, mode: job.mode, dir: this.dir, files: this.listFiles(), ok: !error, error });
    }
    setImmediate(() => this.next());
  }

  stop() {
    this.cancelled = true;
    if (this.child) this.child.kill();
    return { ok: true };
  }

  fail(msg) {
    if (!this.running) return;
    this.error = msg;
    this.running = false;
    const step = this.steps[this.current];
    if (step) step.status = 'FAILED';
    stateManager.broadcast(`⚠️ Run stopped: ${msg}`, 'lead');
    this.finishJob(msg);
  }

  async loop() {
    for (let i = 0; i < this.steps.length; i++) {
      if (this.cancelled) return this.fail('Cancelled.');
      this.current = i;
      const step = this.steps[i];
      step.status = 'RUNNING';
      const ok = await this.runStep(step);
      if (!ok) return;
      step.status = 'DONE';
      this.emit('step', { owner: this.job?.owner, goal: this.goal, done: i + 1, total: this.steps.length, agent: step.agent, label: step.label });
    }
    this.running = false;
    this.current = this.steps.length;
    stateManager.broadcast(`✅ Goal finished. Open the result from the goal bar. Files: ${this.listFiles().join(', ') || 'none'}`, 'lead');
    stateManager.saveStateToFile();
    this.finishJob(null);
  }

  runStep(step) {
    const agent = stateManager.agents[step.agent];
    const role = ROLES[step.agent];
    const prompt = role.prompt(this.goal, this.mode === 'team');
    const { task } = stateManager.assignTask(step.agent, `${role.label}: ${this.goal.slice(0, 50)}`, prompt.slice(0, 120), role.category);
    agent.screen.lines = [`// ${agent.name} is starting...`];
    agent.screen.thoughts = 'Reading the goal...';
    this.refreshAgent(agent);

    const model = process.env.CLAUDE_RUN_MODEL || (llmProvider.ecoMode ? 'sonnet' : 'opus');
    const args = [
      '-p', prompt,
      '--model', model,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read,Write,Edit,Glob,Grep',
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', process.env.CLAUDE_RUN_MAX_TURNS || '30'
    ];

    return new Promise((resolve) => {
      let child;
      try {
        const bin = process.env.CLAUDE_BIN || 'claude';
        // CLAUDE_BIN may point at a .mjs script (used for testing without spending tokens)
        child = /.m?js$/.test(bin)
          ? spawn(process.execPath, [bin, ...args], { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
          : spawn(bin, args, { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        this.fail(`Could not start Claude Code: ${e.message}`);
        return resolve(false);
      }
      this.child = child;
      let buf = '';
      let stderr = '';
      let failedMsg = null;
      let lastText = '';
      const logFile = path.join(WORKSPACE, '..', 'run.log');
      fs.appendFileSync(logFile, `
=== ${new Date().toISOString()} ${step.agent} ===
`);

      const handle = (ev) => {
        if (ev.type === 'assistant') {
          for (const c of ev.message?.content || []) {
            if (c.type === 'text' && c.text) {
              if (/Failed to authenticate|401|Not logged in|Invalid API key/i.test(c.text)) {
                failedMsg = 'Claude Code is not logged in. Open a terminal, run "claude" once, sign in, then try again.';
              }
              agent.screen.thoughts = c.text.slice(0, 280);
              lastText = c.text;
            } else if (c.type === 'tool_use') {
              const inp = c.input || {};
              const file = inp.file_path ? path.basename(inp.file_path) : '';
              if (c.name === 'Write' || c.name === 'Edit') {
                const text = inp.content || inp.new_string || '';
                agent.screen.file = file;
                agent.screen.lines = text.split('\n').slice(0, 40);
                this.push(agent, `${c.name} ${file}`);
              } else {
                this.push(agent, `${c.name} ${file || inp.pattern || ''}`.trim());
              }
              task.progress = Math.min(90, (task.progress || 10) + 8);
            }
          }
          this.refreshAgent(agent);
        } else if (ev.type === 'result') {
          const u = ev.usage || {};
          const used = (u.input_tokens || 0) + (u.output_tokens || 0);
          llmProvider.getBudget(step.agent).used += used;
          this.push(agent, `Finished (${used.toLocaleString()} tokens, ${ev.num_turns || '?'} turns)`);
          if (ev.is_error && !failedMsg) {
            const why = {
              error_max_turns: 'Claude Code ran out of turns (raise CLAUDE_RUN_MAX_TURNS in .env).',
              error_during_execution: 'Claude Code failed while working.'
            }[ev.subtype];
            failedMsg = String(ev.result || lastText || why || `Claude Code error (${ev.subtype || 'unknown'})`).slice(0, 240);
          }
        }
      };

      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try { fs.appendFileSync(logFile, line.slice(0, 600) + '\n'); } catch {}
          try { handle(JSON.parse(line)); } catch { /* ignore non-JSON */ }
        }
      });
      child.stderr.on('data', (d) => { stderr += d; try { fs.appendFileSync(logFile, '[stderr] ' + d); } catch {} });
      child.on('error', (e) => {
        this.fail(e.code === 'ENOENT' ? 'Claude Code CLI not found. Install it and make sure "claude" runs in a terminal.' : e.message);
        resolve(false);
      });
      child.on('close', (code) => {
        this.child = null;
        task.status = failedMsg || code ? 'BLOCKED' : 'DONE';
        task.progress = failedMsg || code ? task.progress : 100;
        agent.state = failedMsg || code ? 'IDLE' : 'IDLE';
        agent.currentTask = 'Idle — Awaiting instructions from lead';
        agent.status = failedMsg || code ? 'Stopped' : 'Finished my part';
        this.refreshAgent(agent);
        stateManager.saveStateToFile();
        if (this.cancelled) { this.fail('Cancelled.'); return resolve(false); }
        if (failedMsg || code) {
          this.fail(failedMsg || `Claude Code exited with code ${code}. ${stderr.trim().slice(0, 240)}`);
          return resolve(false);
        }
        resolve(true);
      });
    });
  }
}

export const runner = new Runner();
