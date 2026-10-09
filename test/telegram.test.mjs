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
// 42 is the owner/admin, 43 is a friend
const bot = new TelegramBot({ token: 'x', allowed: ['42', '43'], port: 3333, api, shoot });
const msg = (chat, text) => ({ chat: { id: chat }, text });
const texts = (chat) => calls.filter((c) => String(c.payload?.chat_id) === String(chat) && c.payload?.text).map((c) => c.payload.text);
const photos = (chat) => calls.filter((c) => c.method === 'sendPhoto' && String(c.payload.chat_id) === String(chat)).length;
const wait = async (cond, ms = 25000) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
};
const tap = async (chat, text, label) => {
  await bot.handle(msg(chat, text));
  const kb = calls.at(-1).payload.reply_markup.inline_keyboard.flat();
  const btn = kb.find((b) => b.text.includes(label));
  await bot.handleChoice({ id: 'cb', data: btn.callback_data, message: { chat: { id: chat } } });
};
const idle = () => wait(() => !runner.running && runner.queue.length === 0);

console.log('▶ strangers are refused and nothing is started');
await bot.handle(msg(99, 'build me a virus'));
assert(calls.at(-1).payload.text.includes('TELEGRAM_ALLOWED_CHAT_IDS=99'));
assert.strictEqual(runner.running, false);
console.log('  ✓');

console.log('▶ /help and unknown command');
await bot.handle(msg(42, '/help'));
assert(calls.at(-1).payload.text.includes('/queue'));
await bot.handle(msg(42, '/nonsense'));
assert(calls.at(-1).payload.text.startsWith('Unknown command'));
console.log('  ✓');

console.log('▶ plain text asks Solo or Team; a tap starts it; screenshot + phone link come back');
await bot.handle(msg(42, 'a snake game'));
const ask = calls.at(-1);
const labels = ask.payload.reply_markup.inline_keyboard.flat().map((b) => b.text).join('|');
assert(labels.includes('Solo') && labels.includes('Team') && labels.includes('Cancel'));
assert.strictEqual(runner.running, false, 'nothing starts before a choice is made');
await bot.handleChoice({ id: 'c1', data: ask.payload.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 42 } } });
assert(texts(42).some((t) => t.startsWith('On it (solo')));
await wait(() => photos(42) === 1);
assert(texts(42).some((t) => t.startsWith('Done:')));
await idle();
console.log('  ✓');

console.log('▶ Cancel, expired and foreign taps do nothing');
await bot.handle(msg(42, 'something else'));
const ask2 = calls.at(-1).payload.reply_markup.inline_keyboard.flat();
const cancel = ask2.find((b) => b.text.includes('Cancel')).callback_data;
await bot.handleChoice({ id: 'c2', data: cancel, message: { chat: { id: 42 } } });
assert.strictEqual(calls.at(-1).payload.text, 'Cancelled.');
await bot.handleChoice({ id: 'c3', data: cancel, message: { chat: { id: 42 } } });
assert(calls.at(-1).payload.text.includes('expired'));
const n = calls.length;
await bot.handleChoice({ id: 'c4', data: ask2[0].callback_data, message: { chat: { id: 99 } } });
assert.strictEqual(runner.running, false);
assert(calls.slice(n).every((c) => c.method === 'answerCallbackQuery'));
console.log('  ✓');

console.log('▶ queue: a friend\'s goal waits, gets its place, starts by itself, and each person gets their own screenshot');
const shots42 = photos(42);
await bot.handle(msg(42, '/team a todo app'));            // runs now (5 steps)
assert(runner.running);
await tap(43, 'a pixel art editor', 'Solo (Bob');          // must wait
const queued = texts(43).find((t) => t.startsWith('Queued'));
assert(queued && queued.includes('you are number 2'), `friend sees position, got: ${queued}`);
await bot.handle(msg(43, '/status'));
assert(texts(43).at(-1).includes('number 2'));
await bot.handle(msg(42, '/queue'));
assert(texts(42).at(-1).includes('1. running') && texts(42).at(-1).includes('2. waiting'));
await wait(() => texts(43).some((t) => t.startsWith('Your turn')));
await wait(() => photos(43) === 1);
await wait(() => photos(42) === shots42 + 1);
await idle();
assert.strictEqual(photos(43), 1, 'friend got exactly their own screenshot');
assert.strictEqual(photos(42), shots42 + 1, 'owner did not get the friend\'s screenshot');
console.log('  ✓');

console.log('▶ queue limits, /cancel and /stop permissions');
await bot.handle(msg(42, '/team long job'));
await tap(43, 'first friend goal', 'Solo (Bob');
await tap(43, 'second friend goal', 'Solo (Bob');
await tap(43, 'third friend goal', 'Solo (Bob');
assert(texts(43).at(-1).includes('already have 2'), `per-person limit, got: ${texts(43).at(-1)}`);
await bot.handle(msg(43, '/stop'));
assert(texts(43).at(-1).includes('belongs to someone else'), 'a friend cannot stop the owner\'s run');
assert(runner.running);
await bot.handle(msg(43, '/cancel'));
assert(texts(43).at(-1).startsWith('Removed 2'));
assert.strictEqual(runner.queue.length, 0);
await bot.handle(msg(42, '/stop'));
await idle();
console.log('  ✓');

console.log('▶ a model switch is announced to the person who asked');
runner.emit('fallback', { owner: '43', goal: 'x', from: 'claude', to: 'codex' });
await wait(() => texts(43).at(-1)?.includes('Claude Code is out of tokens, so Codex takes over'));
const msgs = calls.length;
runner.emit('fallback', { owner: 'web', goal: 'x', from: 'claude', to: 'codex' });   // web goals are not announced on Telegram
await new Promise((r) => setTimeout(r, 100));
assert.strictEqual(calls.length, msgs, 'nothing sent for a web goal');
console.log('  ✓');

console.log('▶ the result says whether the page ran in a browser: clean, with problems, or not checked');
const done = (verify) => runner.emit('finished', { owner: '43', goal: 'a game', ok: true, files: ['index.html', 'app.js'], dir: 'a-game', verify });
// the screenshot and the phone link follow the verdict, so look for the verdict by its text instead of taking the last message
const said = (re) => texts(43).filter((t) => re.test(t));
const fresh = async (verify, re) => {
  const n = said(re).length;
  done(verify);
  await wait(() => said(re).length > n);
  return said(re).at(-1);
};

assert.strictEqual(await fresh({ state: 'clean', problems: [] }, /^Done: "a game"/), 'Done: "a game" (2 files). ✓ It ran clean in a browser.');
const bad = await fresh({ state: 'problems', problems: ['Uncaught TypeError: x is null (app.js:9)', 'Could not load hero.png (ERR_FILE_NOT_FOUND)'] }, /^⚠️ Built/);
assert.strictEqual(bad, '⚠️ Built "a game" (2 files), but it still has 2 problems when opened in a browser:\n1. Uncaught TypeError: x is null (app.js:9)\n2. Could not load hero.png (ERR_FILE_NOT_FOUND)');
const many = await fresh({ state: 'problems', problems: ['a', 'b', 'c', 'd', 'e'] }, /still has 5 problems/);
assert(many.endsWith('3. c\n...and 2 more') && !many.includes('4. d'), 'the first three, then a count');
assert(/it still has 1 problem when/.test(await fresh({ state: 'problems', problems: ['only one'] }, /only one/)), 'singular');

// a page with problems is never announced as done; a page nobody looked at gets no claim either way
const doneBefore = said(/^Done: "a game" \(2 files\)\.$/).length;
for (const verify of [{ state: 'unchecked', reason: 'no Chrome', problems: [] }, null]) {
  const n = said(/^Done: "a game" \(2 files\)\.$/).length;
  done(verify);
  await wait(() => said(/^Done: "a game" \(2 files\)\.$/).length > n);
}
assert.strictEqual(said(/^Done: "a game" \(2 files\)\.$/).length, doneBefore + 2);
assert.strictEqual(said(/^Done: .*(problem|⚠️)/).length, 0, 'no "Done" message mentions problems');
console.log('  ✓');

console.log('\n🎉 TELEGRAM TESTS PASSED');
bot.stop();
process.exit(0);
