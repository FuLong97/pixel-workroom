// Telegram bot tests with a fake Telegram API, fake screenshot and fake Claude CLI
import './setup.mjs';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.CLAUDE_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-claude.mjs');

const { TelegramBot } = await import('../src/telegram.mjs');
const { runner } = await import('../src/runner.mjs');

const calls = [];
const api = async (method, payload, files) => { calls.push({ method, payload, files }); return {}; };
const shoot = async () => 'C:/fake/shot.png';
const bot = new TelegramBot({ token: 'x', allowed: ['42'], port: 3333, api, shoot });
const msg = (chat, text) => ({ chat: { id: chat }, text });
const wait = async (cond, ms = 20000) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
};

console.log('▶ Telegram: strangers are refused and nothing is started');
await bot.handle(msg(99, 'build me a virus'));
assert(calls.at(-1).payload.text.includes('TELEGRAM_ALLOWED_CHAT_IDS=99'));
assert.strictEqual(runner.running, false);
assert.strictEqual(runner.status().goal, '');
console.log('  ✓');

console.log('▶ Telegram: /help and unknown command for the owner');
await bot.handle(msg(42, '/help'));
assert(calls.at(-1).payload.text.includes('/team'));
await bot.handle(msg(42, '/nonsense'));
assert(calls.at(-1).payload.text.startsWith('Unknown command'));
console.log('  ✓');

console.log('▶ Telegram: goal text runs a build and a screenshot comes back');
await bot.handle(msg(42, 'a snake game'));
assert(calls.some((c) => c.payload?.text?.startsWith('On it')));
assert.strictEqual(runner.running, true);
await wait(() => calls.some((c) => c.method === 'sendPhoto'));
const photo = calls.find((c) => c.method === 'sendPhoto');
assert.strictEqual(String(photo.payload.chat_id), '42');
assert.strictEqual(photo.files.photo.path, 'C:/fake/shot.png');
assert(calls.some((c) => c.payload?.text?.startsWith('Done:')));
console.log('  ✓');

console.log('▶ Telegram: /status and /shot when idle');
await bot.handle(msg(42, '/status'));
assert(calls.at(-1).payload.text.startsWith('Idle'));
await bot.handle(msg(42, '/shot'));
assert.strictEqual(calls.at(-1).method, 'sendPhoto');
console.log('  ✓');

console.log('▶ Telegram: /team starts the five-agent pipeline');
await bot.handle(msg(42, '/team a todo app'));
assert.strictEqual(runner.status().steps.length, 5);
await wait(() => !runner.running);
await wait(() => bot.watching === null);
console.log('  ✓');

console.log('\n🎉 TELEGRAM TESTS PASSED');
process.exit(0);
