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

console.log('▶ Telegram: plain text asks Solo or Team, a tap starts the build, screenshot + phone link come back');
await bot.handle(msg(42, 'a snake game'));
const ask = calls.at(-1);
assert(ask.payload.reply_markup, 'a keyboard must be offered');
const labels = ask.payload.reply_markup.inline_keyboard.flat().map((b) => b.text).join('|');
assert(labels.includes('Solo') && labels.includes('Team') && labels.includes('Cancel'));
assert.strictEqual(runner.running, false, 'nothing starts before a choice is made');
const solo = ask.payload.reply_markup.inline_keyboard.flat().find((b) => b.text.startsWith('👤')).callback_data;
await bot.handleChoice({ id: 'cb1', data: solo, message: { chat: { id: 42 } } });
assert(calls.some((c) => c.method === 'answerCallbackQuery'));
assert(calls.some((c) => c.payload?.text?.startsWith('On it (solo')));
assert.strictEqual(runner.running, true);
await wait(() => calls.some((c) => c.method === 'sendPhoto'));
const photo = calls.find((c) => c.method === 'sendPhoto');
assert.strictEqual(String(photo.payload.chat_id), '42');
assert.strictEqual(photo.files.photo.path, 'C:/fake/shot.png');
assert(calls.some((c) => c.payload?.text?.startsWith('Done:')));
console.log('  ✓');

console.log('▶ Telegram: Cancel, expired and foreign taps do nothing');
await bot.handle(msg(42, 'something else'));
const ask2 = calls.at(-1).payload.reply_markup.inline_keyboard.flat();
const cancel = ask2.find((b) => b.text.includes('Cancel')).callback_data;
await bot.handleChoice({ id: 'cb2', data: cancel, message: { chat: { id: 42 } } });
assert.strictEqual(calls.at(-1).payload.text, 'Cancelled.');
await bot.handleChoice({ id: 'cb3', data: cancel, message: { chat: { id: 42 } } });
assert(calls.at(-1).payload.text.includes('expired'));
const before = calls.length;
await bot.handleChoice({ id: 'cb4', data: ask2[0].callback_data, message: { chat: { id: 99 } } });
assert.strictEqual(runner.running, false, 'a stranger cannot start builds by tapping buttons');
assert(calls.slice(before).every((c) => c.method === 'answerCallbackQuery'));
console.log('  ✓');

console.log('▶ Telegram: improve-previous option appears once a project exists');
await bot.handle(msg(42, 'make it blue'));
const kb = calls.at(-1).payload.reply_markup.inline_keyboard.flat();
assert(kb.some((b) => b.text.includes('improve previous')));
await bot.handleChoice({ id: 'cb5', data: kb.find((b) => b.text.startsWith('🔁 Solo')).callback_data, message: { chat: { id: 42 } } });
assert(calls.at(-1).payload.text.includes('improving the previous project'));
await wait(() => !runner.running);
await wait(() => bot.watching === null);
console.log('  ✓');

console.log('▶ Telegram: /status and /shot when idle');
await bot.handle(msg(42, '/status'));
assert(calls.at(-1).payload.text.startsWith('Idle'));
const photosBefore = calls.filter((c) => c.method === 'sendPhoto').length;
await bot.handle(msg(42, '/shot'));
assert.strictEqual(calls.filter((c) => c.method === 'sendPhoto').length, photosBefore + 1);
console.log('  ✓');

console.log('▶ Telegram: /team starts the five-agent pipeline');
await bot.handle(msg(42, '/team a todo app'));
assert.strictEqual(runner.status().steps.length, 5);
await wait(() => !runner.running);
await wait(() => bot.watching === null);
console.log('  ✓');

console.log('\n🎉 TELEGRAM TESTS PASSED');
process.exit(0);
