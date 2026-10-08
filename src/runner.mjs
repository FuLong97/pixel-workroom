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
import { backendOrder, backendName, buildArgs, isQuotaError, resolveBackend } from './backends.mjs';
import { detectLocal, pickToolModel } from './local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WORKSPACE = process.env.WORKROOM_WORKSPACE || path.join(__dirname, '..', 'workspace');

// Team mode is orchestrated: Alice (the strongest model) writes the plan and splits the work into
// one section per worker; the workers (cheaper models) each do only their own section. The expensive
// model writes a few lines, the cheap ones do the bulk, so quality stays high and token use stays low.
const SECTION = (name) => `Read PLAN.md first and do ONLY the section titled "## ${name}". Follow the shared rules at the top of the plan; do not redo other people's work.`;
const ROLES = {
  alice: { label: 'Plan', category: 'Core', mustWrite: true, tier: ['CLAUDE_PLAN_MODEL', 'opus'], prompt: (g) => `You are Alice, the lead who orchestrates a team of cheaper workers. Goal: "${g}". Write ONE file, PLAN.md (max 45 lines): (1) a short product description and the exact file list (index.html plus optional style.css/app.js, no build step, no network); (2) shared rules the workers must all follow (ids, function names, CSS classes, data shapes); (3) four sections titled exactly "## Bob", "## Charlie", "## Diana", "## Echo", each with 3-6 concrete checklist items for that worker. Bob builds all the files. Charlie improves logic, state and persistence. Diana finds and fixes real bugs. Echo writes README.md. Write nothing except PLAN.md.` },
  bob: { label: 'Build', category: 'Frontend', mustWrite: true, tier: ['CLAUDE_RUN_MODEL', 'sonnet'], prompt: (g, team) => `You are Bob, frontend engineer. Goal: "${g}". ${team ? SECTION('Bob') + ' ' : ''}Build it as a working, self-contained browser app: index.html plus optional style.css/app.js, no external build step, no network dependencies. Keep it compact and polished. Open-ready: index.html must run by double-clicking. It MUST also work on an iPhone (Safari): include <meta name="viewport" content="width=device-width, initial-scale=1">, a responsive layout, touch controls for any game (on-screen buttons or swipe, no keyboard-only input), tap targets of at least 44px, and no hover-only features.` },
  charlie: { label: 'Logic', category: 'Backend', tier: ['CLAUDE_CHECK_MODEL', 'haiku'], prompt: (g) => `You are Charlie, logic/backend engineer. Goal: "${g}". ${SECTION('Charlie')} Review the existing files and improve the core logic and state handling (persistence via localStorage if useful, no bugs, clean structure). Edit existing files; do not rewrite from scratch.` },
  diana: { label: 'Test', category: 'QA', tier: ['CLAUDE_CHECK_MODEL', 'haiku'], prompt: (g) => `You are Diana, QA auditor. Goal: "${g}". ${SECTION('Diana')} Read the code carefully, find real bugs or broken flows, and fix them with minimal edits. Do not add features.` },
  echo: { label: 'Docs', category: 'Research', mustWrite: true, tier: ['CLAUDE_CHECK_MODEL', 'haiku'], prompt: (g) => `You are Echo, documentation specialist. Goal: "${g}". ${SECTION('Echo')} Write a concise README.md (what it is, how to open it, controls). Do not change code.` }
};

// One readable line for a tool call. Shell commands are shown in full, because that is what
// people want to check. In Claude runs only file tools are allowed, so a shell attempt is marked as blocked.
export function describeTool(call) {
  const i = call.input || {};
  if (/^(bash|shell|powershell|exec|run_command)$/i.test(call.name || '')) {
    const cmd = String(i.command ?? i.cmd ?? JSON.stringify(i)).replace(/\s+$/, '').slice(0, 2000);
    return `$ ${cmd}  (blocked: this runner only allows file tools)`;
  }
  const where = i.file_path ? path.basename(i.file_path) : i.path || i.pattern || '';
  return `${call.name} ${where}`.trim();
}

// Which Claude model does this step use? Solo and ORCHESTRATE=0 use one model for everything.
function modelFor(agent, team) {
  const single = process.env.CLAUDE_RUN_MODEL || 'sonnet';
  if (!team || process.env.ORCHESTRATE === '0') return single;
  const [envName, fallback] = ROLES[agent].tier;
  return process.env[envName] || fallback;
}

const COOLDOWN_MS = (parseFloat(process.env.BACKEND_COOLDOWN_MIN) || 30) * 60 * 1000;
export const MAX_QUEUE = 5;        // goals waiting in total
export const MAX_PER_OWNER = 2;    // goals one person may have waiting

const MODE_STEPS = { solo: ['bob'], team: ['alice', 'bob', 'charlie', 'diana', 'echo'] };

class Runner extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.job = null;
    this.seq = 0;
    this.cooldown = new Map(); // backend -> time until it is tried again after running out of tokens
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
    this.via = null;
    // keep the last project folder so the next goal can opt in to improving it
    this.dir = this.dir || null;
  }

  // What the browser needs to draw the progress bar (no file listing: that is slow)
  lite() {
    return {
      running: this.running,
      goal: this.goal,
      mode: this.mode,
      dir: this.dir,
      owner: this.job?.owner ?? null,
      via: this.via,
      resting: [...this.cooldown].filter(([, t]) => t > Date.now()).map(([k, t]) => ({ backend: k, until: t })),
      queue: this.queue.map((j) => ({ id: j.id, goal: j.goal, mode: j.mode, owner: j.owner })),
      steps: this.steps,
      current: this.current,
      error: this.error
    };
  }

  // Push progress to every open browser the moment it changes (throttled to 4 per second)
  pushRun(force = false) {
    const now = Date.now();
    if (!force && now - (this.lastRunPush || 0) < 250) return;
    this.lastRunPush = now;
    stateManager.emit('state_change', { type: 'run_update', data: force ? this.status() : this.lite() });
  }

  pushTask(task, force = false) {
    const now = Date.now();
    if (!force && now - (task.lastPush || 0) < 250) return;
    task.lastPush = now;
    stateManager.emit('state_change', { type: 'task_update', data: { id: task.id, progress: task.progress, status: task.status } });
  }

  status() {
    return {
      running: this.running,
      goal: this.goal,
      mode: this.mode,
      dir: this.dir,
      owner: this.job?.owner ?? null,
      via: this.via,
      resting: [...this.cooldown].filter(([, t]) => t > Date.now()).map(([k, t]) => ({ backend: k, until: t })),
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
    this.steps = MODE_STEPS[this.mode].map((id) => ({ agent: id, label: ROLES[id].label, status: 'PENDING', model: modelFor(id, this.mode === 'team') }));

    stateManager.stats.activeGoal = goal;
    stateManager.broadcast(`🎯 New goal: "${goal}" (${this.mode === 'team' ? 'full team' : 'solo: Bob'})`, 'system');
    this.pushRun(true);
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
    this.pushRun(true);
    stateManager.broadcast(`⚠️ Run stopped: ${msg}`, 'system');
    this.finishJob(msg);
  }

  async loop() {
    for (let i = 0; i < this.steps.length; i++) {
      if (this.cancelled) return this.fail('Cancelled.');
      this.current = i;
      const step = this.steps[i];
      step.status = 'RUNNING';
      this.pushRun(true);
      const ok = await this.runStep(step);
      if (!ok) return;
      step.status = 'DONE';
      this.pushRun(true);
      this.emit('step', { owner: this.job?.owner, goal: this.goal, done: i + 1, total: this.steps.length, agent: step.agent, label: step.label });
    }
    this.running = false;
    this.current = this.steps.length;
    stateManager.broadcast(`✅ Goal finished. Open the result from the goal bar. Files: ${this.listFiles().join(', ') || 'none'}`, 'system');
    stateManager.saveStateToFile();
    this.finishJob(null);
  }

  // File names with their change time, to prove a step really changed something
  snapshot() {
    const out = new Map();
    try {
      for (const d of fs.readdirSync(this.cwd, { recursive: true, withFileTypes: true })) {
        if (!d.isFile()) continue;
        const f = path.join(d.parentPath || d.path, d.name);
        out.set(f, fs.statSync(f).mtimeMs);
      }
    } catch { /* empty folder */ }
    return out;
  }

  changedSince(before) {
    const now = this.snapshot();
    for (const [f, t] of now) if (before.get(f) !== t) return true;
    return false;
  }

  coolingDown(kind) {
    return (this.cooldown.get(kind) || 0) > Date.now();
  }

  // Try the models in order. Only "out of tokens" or "not available" moves on to the next one;
  // a real error is reported as it is instead of being hidden behind another model.
  async runStep(step) {
    const agent = stateManager.agents[step.agent];
    const role = ROLES[step.agent];
    const prompt = role.prompt(this.goal, this.mode === 'team');
    const { task } = stateManager.assignTask(step.agent, `${role.label}: ${this.goal.slice(0, 50)}`, prompt.slice(0, 120), role.category);
    agent.screen.lines = [`// ${agent.name} is starting...`];
    agent.screen.thoughts = 'Reading the goal...';
    this.refreshAgent(agent);

    const before = this.snapshot();
    const all = backendOrder();
    // models that ran dry recently are skipped; if every one is resting, try them all again
    const order = all.filter((k) => !this.coolingDown(k));
    const list = order.length ? order : all;
    const problems = [];
    let previous = null;

    for (const kind of list) {
      if (this.cancelled) break;
      const target = resolveBackend(kind);
      if (!target) {
        problems.push(`${backendName(kind)} is not installed`);
        continue;
      }
      if (previous) {
        const msg = `${backendName(previous)} is out of tokens, continuing with ${backendName(kind)}.`;
        this.push(agent, msg);
        stateManager.broadcast(`🔁 ${msg}`, 'system');
        this.emit('fallback', { owner: this.job?.owner, goal: this.goal, from: previous, to: kind });
        previous = null;
      }
      // the local model needs a running server and a model that Codex can drive
      let opts = {};
      if (kind === 'local') {
        const info = await detectLocal();
        if (!info.available) { problems.push(`no local model (${info.reason})`); continue; }
        if (!['ollama', 'lmstudio'].includes(info.kind)) { problems.push('the local server is chat-only; builds need Ollama or LM Studio'); continue; }
        opts = { provider: info.kind, model: pickToolModel(info) };
        this.push(agent, `Using local model ${opts.model} (free, but slower and less capable)`);
      }
      this.via = kind;
      this.pushRun();
      opts.model = opts.model || step.model;
      const r = await this.execBackend(kind, target, step, agent, task, prompt, opts);
      if (r.ok && role.mustWrite && !this.changedSince(before)) {
        // exit code 0 is not enough: small models sometimes "describe" the code without writing any file
        const hint = kind === 'local' ? ' (small local models often cannot use tools; try a larger one with LOCAL_RUN_MODEL)' : '';
        problems.push(`${backendName(kind)} finished but wrote no file${hint}`);
        continue;
      }
      if (r.ok) {
        this.finishStep(agent, task, true);
        return true;
      }
      if (this.cancelled) break;
      if (r.quota) {
        this.cooldown.set(kind, Date.now() + COOLDOWN_MS);
        problems.push(`${backendName(kind)} is out of tokens`);
        previous = kind;
        continue;
      }
      if (r.unavailable) {
        problems.push(r.error);
        continue;
      }
      this.finishStep(agent, task, false);
      this.fail(r.error);
      return false;
    }

    this.finishStep(agent, task, false);
    if (this.cancelled) {
      this.fail('Cancelled.');
    } else {
      this.fail(`No model could do this step: ${problems.join('; ') || 'none configured'}.`);
    }
    return false;
  }

  finishStep(agent, task, ok) {
    task.status = ok ? 'DONE' : 'BLOCKED';
    if (ok) task.progress = 100;
    this.pushTask(task, true);
    agent.state = 'IDLE';
    agent.currentTask = 'Idle — Awaiting instructions from lead';
    agent.status = ok ? 'Finished my part' : 'Stopped';
    this.refreshAgent(agent);
    stateManager.saveStateToFile();
  }

  // Runs one CLI for one step. Resolves { ok } or { quota } / { unavailable } / { error }.
  execBackend(kind, target, step, agent, task, prompt, opts = {}) {
    const args = [...target.prefix, ...buildArgs(kind, prompt, this.cwd, opts)];
    const name = backendName(kind);
    const logFile = path.join(WORKSPACE, '..', 'run.log');
    const log = (text) => { try { fs.appendFileSync(logFile, text); } catch { /* logging is best effort */ } };
    log(`\n=== ${new Date().toISOString()} ${step.agent} via ${kind} ===\n`);

    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(target.cmd, args, { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        return resolve({ unavailable: true, error: `${name} could not start: ${e.message}` });
      }
      this.child = child;

      let buf = '';
      let tail = '';          // last output, used to tell "out of tokens" apart from a real error
      let failedMsg = null;   // set by Claude's result event when it reports an error
      let authFailed = false;
      let lastText = '';
      let lines = [];
      let spawnFailed = false;

      const handleClaude = (ev) => {
        if (ev.type === 'assistant') {
          for (const c of ev.message?.content || []) {
            if (c.type === 'text' && c.text) {
              if (/Failed to authenticate|Not logged in|Invalid API key/i.test(c.text)) authFailed = true;
              agent.screen.thoughts = c.text.slice(0, 280);
              lastText = c.text;
            } else if (c.type === 'tool_use') {
              const inp = c.input || {};
              const file = inp.file_path ? path.basename(inp.file_path) : '';
              if (c.name === 'Write' || c.name === 'Edit') {
                agent.screen.file = file;
                agent.screen.lines = (inp.content || inp.new_string || '').split('\n').slice(0, 40);
                this.push(agent, `${c.name} ${file}`);
              } else {
                this.push(agent, describeTool(c));
              }
              task.progress = Math.min(90, (task.progress || 10) + 8);
              this.pushTask(task);
            }
          }
          this.refreshAgent(agent);
        } else if (ev.type === 'result') {
          const u = ev.usage || {};
          const used = (u.input_tokens || 0) + (u.output_tokens || 0);
          llmProvider.getBudget(step.agent).used += used;
          this.push(agent, `Finished (${used.toLocaleString()} tokens, ${ev.num_turns || '?'} turns)`);
          if (ev.is_error) {
            const why = {
              error_max_turns: 'Claude Code ran out of turns (raise CLAUDE_RUN_MAX_TURNS in .env).',
              error_during_execution: 'Claude Code failed while working.'
            }[ev.subtype];
            failedMsg = String(ev.result || lastText || why || `Claude Code error (${ev.subtype || 'unknown'})`).slice(0, 240);
          }
        }
      };

      let afterExec = false;
      const COMMAND_LINE = /^(\$ |> |exec\b|bash\b|sh -c|powershell|pwsh|cmd(\.exe)?\b|node |npm |npx |git |python)/i;
      const handleText = (line) => {
        // Codex prints "exec" and then the command it runs; other CLIs print the command directly.
        // Commands go to the terminal log in full.
        if (afterExec || COMMAND_LINE.test(line)) {
          if (!/^exec$/i.test(line)) {
            this.push(agent, line.startsWith('$') ? line : '$ ' + line.replace(/^exec\s+/i, ''));
          }
        }
        afterExec = /^exec$/i.test(line);
        lines.push(line);
        if (lines.length > 40) lines.shift();
        agent.screen.lines = lines.slice(-30);
        agent.screen.thoughts = line.slice(0, 280);
        task.progress = Math.min(90, (task.progress || 10) + 1);
        this.pushTask(task);
        this.refreshAgent(agent);
      };

      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          log(line.slice(0, 600) + '\n');
          tail = (tail + '\n' + line).slice(-1500);
          if (kind === 'claude') {
            try { handleClaude(JSON.parse(line)); } catch { /* not JSON */ }
          } else {
            handleText(line);
          }
        }
      });
      child.stderr.on('data', (d) => {
        log('[stderr] ' + d);
        tail = (tail + '\n' + d).slice(-1500);
      });
      child.on('error', (e) => {
        spawnFailed = true;
        this.child = null;
        resolve({ unavailable: true, error: e.code === 'ENOENT' ? `${name} is not installed (command not found)` : `${name}: ${e.message}` });
      });
      child.on('close', (code) => {
        this.child = null;
        if (spawnFailed) return;
        if (code === 0 && !failedMsg && !authFailed) return resolve({ ok: true });
        if (authFailed) return resolve({ unavailable: true, error: `${name} is not logged in (run "${kind}" once in a terminal)` });
        const detail = failedMsg || `${name} exited with code ${code}. ${tail.trim().slice(-240)}`;
        // quota wording is only trusted in an error context, never in normal model output
        if (isQuotaError(failedMsg || tail)) return resolve({ quota: true, error: detail });
        resolve({ error: detail });
      });
    });
  }
}

export const runner = new Runner();

