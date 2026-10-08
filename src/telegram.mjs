// src/telegram.mjs - Telegram remote control: send a goal from your phone, get a screenshot back.
// Long polling, no dependencies. Only chats listed in TELEGRAM_ALLOWED_CHAT_IDS may give orders.
import fs from 'fs';
import { runner } from './runner.mjs';
import { screenshot } from './screenshot.mjs';
import { phoneBase } from './network.mjs';

const HELP = [
  'Send me what to build and I will build it, then send you a screenshot.',
  '',
  'Any text   I ask: Solo or Team?',
  '/team <goal>      full team (about 5x the tokens)',
  '/improve <text>   keep working on the previous project',
  '/shot             screenshot of the latest project',
  '/status           your goals and where they are in line',
  '/queue            everything running and waiting',
  '/cancel           remove your waiting goals',
  '/stop             cancel the running goal (yours only)',
  '',
  'Tip: be concrete, e.g. "a snake game with score and speed levels".'
].join('\n');

export class TelegramBot {
  /**
   * @param {object} o
   * @param {string} o.token            bot token from @BotFather
   * @param {string[]} o.allowed        allowed chat ids (strings)
   * @param {number} o.port             port the workroom serves on (for screenshots)
   * @param {Function} [o.api]          injectable (method, payload, files) => result, for tests
   * @param {Function} [o.shoot]        injectable (url) => png path, for tests
   * @param {object} [o.run]            injectable runner, for tests
   */
  constructor({ token, allowed = [], port = 3333, api, shoot = screenshot, run = runner }) {
    this.token = token;
    this.allowed = new Set(allowed.map(String));
    this.port = port;
    this.shoot = shoot;
    this.run = run;
    this.api = api || this.realApi.bind(this);
    this.offset = 0;
    this.stopped = false;
    this.admin = [...this.allowed][0] || null; // the first allowed chat may stop anyone's run
    this.pending = new Map(); // id -> { chat, goal } waiting for the Solo/Team choice
    this.nextId = 1;
    // The runner tells us when a goal starts, progresses and ends, so each person gets their own results
    this.listeners = {
      started: (e) => this.onStarted(e),
      step: (e) => this.onStep(e),
      finished: (e) => this.onFinished(e)
    };
    if (this.run.on) for (const [ev, fn] of Object.entries(this.listeners)) this.run.on(ev, fn);
  }

  async realApi(method, payload = {}, files = null) {
    const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
    const url = `${base}/bot${this.token}/${method}`;
    let res;
    if (files) {
      const form = new FormData();
      for (const [k, v] of Object.entries(payload)) form.append(k, String(v));
      for (const [k, f] of Object.entries(files)) form.append(k, new Blob([fs.readFileSync(f.path)]), f.name);
      res = await fetch(url, { method: 'POST', body: form });
    } else {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    const json = await res.json();
    if (!json.ok) throw new Error(json.description || `Telegram ${method} failed`);
    return json.result;
  }

  say(chat, text) {
    return this.api('sendMessage', { chat_id: chat, text: String(text).slice(0, 3800) }).catch((e) => console.warn('[telegram]', e.message));
  }

  async start() {
    const me = await this.api('getMe');
    console.log(`[telegram] Bot @${me.username} online. ${this.allowed.size ? `${this.allowed.size} chat(s) allowed.` : 'No allowed chat yet: message the bot to get your chat id.'}`);
    this.loop();
  }

  stop() {
    this.stopped = true;
    if (this.run.off) for (const [ev, fn] of Object.entries(this.listeners)) this.run.off(ev, fn);
  }

  async loop() {
    while (!this.stopped) {
      try {
        const updates = await this.api('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          if (u.message?.text) await this.handle(u.message).catch((e) => console.warn('[telegram]', e.message));
          else if (u.callback_query) await this.handleChoice(u.callback_query).catch((e) => console.warn('[telegram]', e.message));
        }
      } catch (e) {
        console.warn('[telegram] polling error:', e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  async handle(msg) {
    const chat = String(msg.chat.id);
    const text = msg.text.trim();

    if (!this.allowed.has(chat)) {
      // Never run anything for strangers; only tell them how to be added by the owner.
      return this.say(chat, `Not authorised. To allow this chat, add this line to .env and restart the workroom:\nTELEGRAM_ALLOWED_CHAT_IDS=${chat}`);
    }

    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, '');
    const arg = rest.join(' ').trim();

    if (cmd === '/start' || cmd === '/help') return this.say(chat, HELP);
    if (cmd === '/status') return this.say(chat, this.statusText(chat));
    if (cmd === '/queue') return this.say(chat, this.queueText(chat));
    if (cmd === '/cancel') {
      const n = this.run.cancelQueued(chat);
      return this.say(chat, n ? `Removed ${n} waiting goal(s).` : 'You have nothing waiting.');
    }
    if (cmd === '/stop') {
      const s = this.run.status();
      if (!s.running) return this.say(chat, 'Nothing is running.');
      if (s.owner !== chat && chat !== this.admin) return this.say(chat, 'That goal belongs to someone else, so I will not stop it.');
      this.run.stop();
      return this.say(chat, 'Stopping...');
    }
    if (cmd === '/shot') return this.sendShot(chat);

    let goal = text, mode = 'solo', improve = false;
    if (cmd === '/team') { goal = arg; mode = 'team'; }
    else if (cmd === '/improve') { goal = arg; improve = true; }
    else if (cmd.startsWith('/')) return this.say(chat, 'Unknown command.\n\n' + HELP);

    if (!goal) return this.say(chat, 'Please add a goal, e.g. /team a pixel-art drawing app');

    // /team and /improve already say what they want; plain text asks first
    if (cmd === '/team' || cmd === '/improve') return this.begin(chat, goal, mode, improve);
    return this.askMode(chat, goal);
  }

  async begin(chat, goal, mode, improve) {
    const r = this.run.submit({ goal, mode, improve, owner: chat });
    if (!r.ok) return this.say(chat, `Cannot start: ${r.error}`);
    const what = `${mode === 'team' ? 'full team' : 'solo: Bob'}${improve ? ', improving the previous project' : ''}`;
    if (r.queued) {
      return this.say(chat, `Queued (${what}): "${goal.slice(0, 120)}"
${r.ahead} goal(s) ahead of you, you are number ${r.ahead + 1}. I will message you when it starts.`);
    }
    return this.say(chat, `On it (${what}): "${goal.slice(0, 120)}"
I will send a screenshot when it is done.`);
  }

  askMode(chat, goal) {
    const id = this.nextId++;
    this.pending.set(id, { chat, goal });
    if (this.pending.size > 20) this.pending.delete(this.pending.keys().next().value);
    const rows = [
      [
        { text: '👤 Solo (Bob, fastest)', callback_data: `pick:${id}:solo` },
        { text: '👥 Team (5 agents)', callback_data: `pick:${id}:team` }
      ]
    ];
    if (this.run.status().dir) {
      rows.push([
        { text: '🔁 Solo: improve previous', callback_data: `pick:${id}:solo+` },
        { text: '🔁 Team: improve previous', callback_data: `pick:${id}:team+` }
      ]);
    }
    rows.push([{ text: '✖ Cancel', callback_data: `pick:${id}:cancel` }]);
    return this.api('sendMessage', {
      chat_id: chat,
      text: `"${goal.slice(0, 160)}"\n\nHow should I build it?\nSolo = one agent, fast and cheap. Team = plan, build, logic, QA, docs (about 5x the tokens).`,
      reply_markup: { inline_keyboard: rows }
    });
  }

  async handleChoice(q) {
    const chat = String(q.message?.chat?.id ?? q.from?.id);
    await this.api('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    if (!this.allowed.has(chat)) return;
    const m = /^pick:(\d+):(solo|team|cancel)(\+?)$/.exec(q.data || '');
    if (!m) return;
    const entry = this.pending.get(Number(m[1]));
    if (!entry || entry.chat !== chat) return this.say(chat, 'That request expired. Please send your goal again.');
    this.pending.delete(Number(m[1]));
    if (m[2] === 'cancel') return this.say(chat, 'Cancelled.');
    return this.begin(chat, entry.goal, m[2], m[3] === '+');
  }

  statusText(chat) {
    const s = this.run.status();
    const lines = [];
    if (s.running) {
      const step = s.steps[s.current];
      const mine = s.owner === chat ? ' (yours)' : '';
      lines.push(`Running${mine}: "${s.goal}"
Step ${s.current + 1}/${s.steps.length}: ${step?.agent} (${step?.label})`);
    }
    s.queue.forEach((j, i) => {
      if (j.owner === chat) lines.push(`Your goal "${j.goal.slice(0, 60)}" is number ${i + 2} in line.`);
    });
    if (s.queue.length) lines.push(`${s.queue.length} waiting in total.`);
    if (lines.length) return lines.join('\n');
    if (s.error) return `Last run stopped: ${s.error}`;
    if (s.dir) return `Idle. Latest project: ${s.dir} (${s.files.length} files). Send /shot for a screenshot.`;
    return 'Idle. Send me a goal.';
  }

  queueText(chat) {
    const s = this.run.status();
    if (!s.running && !s.queue.length) return 'Nothing running and nothing waiting.';
    const who = (o) => (o === chat ? ' (you)' : '');
    const lines = [];
    if (s.running) lines.push(`1. running${who(s.owner)}: ${s.goal.slice(0, 70)}`);
    s.queue.forEach((j, i) => lines.push(`${i + 2}. waiting${who(j.owner)}: ${j.goal.slice(0, 70)}`));
    return lines.join('\n');
  }

  // --- runner events: every person gets their own progress and result ---
  isMine(owner) {
    return this.allowed.has(String(owner));
  }

  onStarted(e) {
    if (e.wasQueued && this.isMine(e.owner)) this.say(e.owner, `Your turn: starting "${e.goal.slice(0, 120)}" now.`);
  }

  onStep(e) {
    if (this.isMine(e.owner) && e.total > 1 && e.done < e.total) {
      this.say(e.owner, `Progress ${e.done}/${e.total}: ${e.agent} finished (${e.label}).`);
    }
  }

  async onFinished(e) {
    if (!this.isMine(e.owner)) return;
    if (!e.ok) return this.say(e.owner, `Stopped: ${e.error}`);
    await this.say(e.owner, `Done: "${e.goal.slice(0, 120)}" (${e.files.length} files).`);
    await this.sendShot(e.owner, e);
  }

  phoneBase() {
    return phoneBase(this.port);
  }

  async sendShot(chat, snap = null) {
    const s = snap || this.run.status();
    if (!s.dir || !s.files.includes('index.html')) return this.say(chat, 'Nothing to show yet: there is no project with an index.html.');
    try {
      const png = await this.shoot(`http://127.0.0.1:${this.port}/workspace/${encodeURIComponent(s.dir)}/index.html`);
      const sent = await this.api('sendPhoto', { chat_id: chat, caption: s.goal.slice(0, 200) }, { photo: { path: png, name: 'result.png' } });
      console.log(`[telegram] screenshot delivered to chat ${chat} (message_id ${sent?.message_id ?? '?'})`);
      const base = this.phoneBase();
      if (base) await this.say(chat, `📱 Open it on your iPhone (same Wi-Fi):
${base}/workspace/${encodeURIComponent(s.dir)}/index.html`);
    } catch (e) {
      await this.say(chat, `Built it, but the screenshot failed: ${e.message}`);
    }
  }
}

export function startTelegramFromEnv(port) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const bot = new TelegramBot({ token, allowed, port });
  bot.start().catch((e) => console.warn('[telegram] could not start:', e.message));
  return bot;
}
