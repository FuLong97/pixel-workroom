// src/telegram.mjs - Telegram remote control: send a goal from your phone, get a screenshot back.
// Long polling, no dependencies. Only chats listed in TELEGRAM_ALLOWED_CHAT_IDS may give orders.
import fs from 'fs';
import { runner } from './runner.mjs';
import { screenshot } from './screenshot.mjs';

const HELP = [
  'Send me what to build and I will build it, then send you a screenshot.',
  '',
  'Any text   build it solo (Bob)',
  '/team <goal>      full team (about 5x the tokens)',
  '/improve <text>   keep working on the previous project',
  '/shot             screenshot of the latest project',
  '/status           what is happening now',
  '/stop             cancel the current run',
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
    this.watching = null; // chat currently waiting for a result
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
  }

  async loop() {
    while (!this.stopped) {
      try {
        const updates = await this.api('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message'] });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          if (u.message?.text) await this.handle(u.message).catch((e) => console.warn('[telegram]', e.message));
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
    if (cmd === '/status') return this.say(chat, this.statusText());
    if (cmd === '/stop') {
      this.run.stop();
      return this.say(chat, 'Stopping...');
    }
    if (cmd === '/shot') return this.sendShot(chat);

    let goal = text, mode = 'solo', improve = false;
    if (cmd === '/team') { goal = arg; mode = 'team'; }
    else if (cmd === '/improve') { goal = arg; improve = true; }
    else if (cmd.startsWith('/')) return this.say(chat, 'Unknown command.\n\n' + HELP);

    if (!goal) return this.say(chat, 'Please add a goal, e.g. /team a pixel-art drawing app');

    const r = this.run.start(goal, mode, improve);
    if (!r.ok) return this.say(chat, `Cannot start: ${r.error}`);
    await this.say(chat, `On it (${mode === 'team' ? 'full team' : 'solo: Bob'}): "${goal.slice(0, 120)}"\nI will send a screenshot when it is done.`);
    this.watch(chat);
  }

  statusText() {
    const s = this.run.status();
    if (s.running) {
      const step = s.steps[s.current];
      return `Working on "${s.goal}"\nStep ${s.current + 1}/${s.steps.length}: ${step?.agent} (${step?.label})`;
    }
    if (s.error) return `Last run stopped: ${s.error}`;
    if (s.dir) return `Idle. Latest project: ${s.dir} (${s.files.length} files). Send /shot for a screenshot.`;
    return 'Idle. Send me a goal.';
  }

  // Report progress per finished step, then the screenshot
  watch(chat) {
    if (this.watching) return;
    this.watching = chat;
    let lastDone = 0;
    const tick = async () => {
      const s = this.run.status();
      const done = s.steps.filter((x) => x.status === 'DONE').length;
      if (s.running && s.steps.length > 1 && done > lastDone) {
        lastDone = done;
        await this.say(chat, `Progress ${done}/${s.steps.length}: ${s.steps[done - 1].agent} finished (${s.steps[done - 1].label}).`);
      }
      if (s.running) return setTimeout(tick, 3000);
      this.watching = null;
      if (s.error) return this.say(chat, `Stopped: ${s.error}`);
      await this.say(chat, `Done: "${s.goal}" (${s.files.length} files).`);
      await this.sendShot(chat);
    };
    setTimeout(tick, 3000);
  }

  async sendShot(chat) {
    const s = this.run.status();
    if (!s.dir || !s.files.includes('index.html')) return this.say(chat, 'Nothing to show yet: there is no project with an index.html.');
    try {
      const png = await this.shoot(`http://127.0.0.1:${this.port}/workspace/${encodeURIComponent(s.dir)}/index.html`);
      await this.api('sendPhoto', { chat_id: chat, caption: s.goal.slice(0, 200) }, { photo: { path: png, name: 'result.png' } });
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
