// public/js/goal-panel.js - "What should the team build?" dock: goal in, working result out
const ICON = { PENDING: '⚪', RUNNING: '🟡', DONE: '✅', FAILED: '❌' };
const EXAMPLES = ['A snake game', 'A pixel-art drawing app', 'A to-do list with local storage', 'A tiny pixel-art desktop OS'];

export class GoalPanel {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('goal-dock');
    if (!this.el) return;
    this.mode = 'solo';
    this.collapsed = false;
    this.timer = null;
    this.status = null;
    this.draft = '';
    this.flash = null;
    this.render();
    this.poll();
  }

  async api(path, body) {
    const opts = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined;
    const r = await fetch(path, opts);
    return r.json();
  }

  async poll() {
    try {
      this.status = await this.api('/api/run');
    } catch {
      this.status = null;
    }
    this.render();
    clearTimeout(this.timer);
    if (this.status?.running) this.timer = setTimeout(() => this.poll(), 1500);
  }

  async start() {
    const input = this.el.querySelector('#goal-input');
    const goal = input.value.trim();
    if (!goal) {
      input.focus();
      return;
    }
    this.draft = '';
    const r = await this.api('/api/run', { goal, mode: this.mode });
    if (!r.ok) this.flash = r.error;
    await this.poll();
  }

  esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  render() {
    const s = this.status;
    const keepFocus = document.activeElement?.id === 'goal-input';
    const draft = this.el.querySelector('#goal-input')?.value ?? this.draft;
    let body = '';

    if (this.collapsed) {
      body = `<button id="goal-expand" class="px-3 py-1 text-xs text-cyan-300">🎯 ${s?.running ? 'Team is working…' : 'New goal'} ▾</button>`;
    } else if (s?.running) {
      const chips = s.steps
        .map((st, i) => {
          const border = i === s.current ? 'border-amber-400 text-amber-200' : 'border-slate-700 text-slate-300';
          return `<button data-agent="${st.agent}" class="goal-step px-2 py-1 rounded border text-[11px] ${border} bg-slate-900 hover:bg-slate-800" title="Open monitor">${ICON[st.status] || '⚪'} ${this.esc(st.agent)} · ${this.esc(st.label)}</button>`;
        })
        .join('');
      body = `
        <div class="flex items-center justify-between mb-1.5">
          <div class="text-xs text-slate-200 truncate">🎯 <strong>${this.esc(s.goal)}</strong></div>
          <button id="goal-stop" class="ml-2 px-2 py-0.5 rounded bg-rose-900/80 hover:bg-rose-700 text-rose-100 text-[11px]">■ Stop</button>
        </div>
        <div class="flex flex-wrap gap-1.5">${chips}</div>
        <div class="text-[10px] text-slate-500 mt-1.5">Click an agent to watch their screen. Files appear in the workspace folder.</div>`;
    } else {
      const done = s && s.goal && !s.error && s.steps.length > 0 && s.current >= s.steps.length;
      const hasIndex = s?.files?.includes('index.html');
      const origin = `http://127.0.0.1:${location.port}`;
      const result = done
        ? `<div class="flex items-center justify-between mb-2 p-2 rounded bg-emerald-950/60 border border-emerald-700 text-xs text-emerald-200">
            <span>✅ Done: <strong>${this.esc(s.goal)}</strong> · ${s.files.length} file(s)</span>
            ${hasIndex ? `<a href="${origin}/workspace/index.html" target="_blank" rel="noopener" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">▶ Open result</a>` : ''}
          </div>`
        : '';
      const err = s?.error
        ? `<div class="mb-2 p-2 rounded bg-rose-950/70 border border-rose-700 text-xs text-rose-200">⚠️ ${this.esc(s.error)}</div>`
        : '';
      const flash = this.flash ? `<div class="mb-2 text-xs text-amber-300">${this.esc(this.flash)}</div>` : '';
      this.flash = null;
      const solo = this.mode === 'solo' ? 'bg-cyan-700 text-white' : 'bg-slate-900 text-slate-400';
      const team = this.mode === 'team' ? 'bg-cyan-700 text-white' : 'bg-slate-900 text-slate-400';
      const examples = EXAMPLES.map(
        (e) => `<button class="goal-ex px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 hover:text-cyan-300">${this.esc(e)}</button>`
      ).join('');
      body = `${result}${err}${flash}
        <div class="flex items-center gap-1.5">
          <input id="goal-input" type="text" maxlength="300" placeholder="What should the team build? e.g. a snake game" class="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500">
          <div class="flex rounded overflow-hidden border border-slate-700 text-[11px]">
            <button id="goal-solo" class="px-2 py-2 ${solo}" title="Only Bob builds it (cheapest)">Solo</button>
            <button id="goal-team" class="px-2 py-2 ${team}" title="Alice plans, Bob builds, Charlie, Diana and Echo improve (about 5x the cost)">Team</button>
          </div>
          <button id="goal-run" class="px-3 py-2 rounded bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold">▶ Build</button>
        </div>
        <div class="flex flex-wrap gap-1 mt-1.5 items-center">${examples}
          <button id="goal-refill" class="text-[10px] text-slate-500 hover:text-emerald-300 ml-auto" title="Reset every agent's token health bar to full">🔋 refill</button>
          <span class="text-[10px] text-slate-600">${this.mode === 'solo' ? '1 agent · fastest' : '5 agents · about 5x tokens'}</span>
        </div>`;
    }

    const collapse = this.collapsed
      ? ''
      : '<button id="goal-collapse" class="absolute -top-1 right-0 text-slate-500 hover:text-slate-300 text-xs" title="Hide">▴</button>';
    this.el.innerHTML = `<div class="relative">${collapse}${body}</div>`;
    this.bind();
    const input = this.el.querySelector('#goal-input');
    if (input) {
      input.value = draft;
      if (keepFocus) input.focus();
    }
  }

  bind() {
    const q = (sel) => this.el.querySelector(sel);
    q('#goal-run')?.addEventListener('click', () => this.start());
    q('#goal-input')?.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep WASD / hotkeys out of the text box
      if (e.key === 'Enter') this.start();
    });
    q('#goal-input')?.addEventListener('input', (e) => (this.draft = e.target.value));
    q('#goal-solo')?.addEventListener('click', () => {
      this.mode = 'solo';
      this.render();
    });
    q('#goal-team')?.addEventListener('click', () => {
      this.mode = 'team';
      this.render();
    });
    q('#goal-refill')?.addEventListener('click', async () => {
      const st = await this.api('/api/tokens/refill', {});
      this.app.state.agents = st.agents;
    });
    q('#goal-stop')?.addEventListener('click', async () => {
      await this.api('/api/run/stop', {});
      this.poll();
    });
    q('#goal-collapse')?.addEventListener('click', () => {
      this.collapsed = true;
      this.render();
    });
    q('#goal-expand')?.addEventListener('click', () => {
      this.collapsed = false;
      this.render();
    });
    this.el.querySelectorAll('.goal-ex').forEach((b) =>
      b.addEventListener('click', () => {
        const i = q('#goal-input');
        i.value = b.textContent;
        this.draft = b.textContent;
        i.focus();
      })
    );
    this.el.querySelectorAll('.goal-step').forEach((b) =>
      b.addEventListener('click', () => this.app.openMonitorCockpit(b.dataset.agent))
    );
  }
}
