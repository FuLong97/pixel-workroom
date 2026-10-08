// Local models: list, choose and download from the Models tab (fake Ollama, nothing is really downloaded)
import './setup.mjs';
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { startFakeLocal } from './fixtures/fake-local-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const settingsFile = path.join(os.tmpdir(), `models-settings-${Date.now()}.json`);
process.env.WORKROOM_SETTINGS_FILE = settingsFile;
process.env.GPU_VRAM_GB = '8';                  // pretend the card has 8 GB (no real nvidia-smi in tests)
delete process.env.LOCAL_LLM;                       // setup.mjs turns local models off for the other tests
const ollama = await startFakeLocal({ models: ['tiny-a', 'tiny-b', 'big-tools'], ollama: true });
process.env.LOCAL_LLM_URL = ollama.base;
process.env.LOCAL_LLM_KIND = 'ollama';

const lm = await import('../src/local-models.mjs');
const { resetLocalCache, detectLocal } = await import('../src/local.mjs');
const { resetSettingsCache } = await import('../src/settings.mjs');

console.log('▶ The overview lists installed models with size, tools and the current choice');
let o = await lm.overview();
assert(o.available && o.kind === 'ollama' && o.canPull && o.canBuild);
assert.deepStrictEqual(o.installed.map((m) => m.name), ['tiny-a', 'tiny-b', 'big-tools']);
assert(o.installed.every((m) => m.gb > 0), 'sizes are shown');
assert.strictEqual(o.installed.find((m) => m.name === 'big-tools').tools, true);
assert.strictEqual(o.chatModel, 'tiny-a', 'smallest model answers chat by default');
assert.strictEqual(o.buildModel, 'big-tools', 'a model that can use tools builds by default');
// families with several sizes, including uncensored ("abliterated") ones
assert(o.families.length >= 6, 'several model families, got ' + o.families.length);
assert(o.families.every((f) => f.name && f.label && f.why && f.sizes.length >= 1));
assert(o.families.filter((f) => f.uncensored).length >= 2, 'uncensored variants are offered');
assert(o.families.filter((f) => f.uncensored).every((f) => f.name.includes('abliterated')), 'and they are the abliterated ones');
const qwen = o.families.find((f) => f.name === 'qwen3');
assert(qwen.sizes.length >= 5, 'a ladder of sizes: ' + qwen.sizes.map((s) => s.tag).join(','));
assert(qwen.sizes.every((s, i) => i === 0 || s.gb >= qwen.sizes[i - 1].gb), 'sizes grow with the B number');
assert(o.families.every((f) => f.sizes.every((s) => s.model.endsWith(':' + s.tag) && s.gb > 0 && s.vram > s.gb && ['fits', 'tight', 'toobig'].includes(s.fit))));
assert(o.families.every((f) => f.sizes.every((s) => s.installed === false)));
console.log('  ✓ ' + o.families.length + ' families, ' + o.families.reduce((n, f) => n + f.sizes.length, 0) + ' sizes');

console.log('▶ Video memory: estimate, comparison with the card, and what is really loaded');
assert.strictEqual(o.gpu.totalGB, 8, 'the configured card size');
const near = (a, b, d) => Math.abs(a - b) <= d;
assert(near(lm.estimateVram(5.2), 5.6, 0.5), 'a 5.2 GB model measured 5.6 GB on real Ollama, estimate ' + lm.estimateVram(5.2));
assert.strictEqual(lm.fitOf(5, { totalGB: 8 }), 'fits');
assert.strictEqual(lm.fitOf(7.5, { totalGB: 8 }), 'tight');
assert.strictEqual(lm.fitOf(9, { totalGB: 8 }), 'toobig');
assert.strictEqual(lm.fitOf(5, null), 'unknown');
const fits = Object.fromEntries(qwen.sizes.map((s) => [s.tag, s.fit]));
assert.strictEqual(fits['4b'], 'fits');
assert.strictEqual(fits['14b'], 'toobig', '14b does not fit on an 8 GB card: ' + JSON.stringify(fits));
assert(o.installed.every((m) => m.vram > 0 && m.fit), 'installed models show their VRAM too');
assert.deepStrictEqual(o.loaded.map((m) => m.name), ['tiny-b'], 'Ollama says which model is in memory');
assert.strictEqual(o.installed.find((m) => m.name === 'tiny-b').loadedVram, 1.5, 'and its real video memory use');
console.log('  ✓');
console.log('  ✓');

console.log('▶ Choosing a model for chat and for builds is saved and used');
o = await lm.select('chat', 'tiny-b');
assert.strictEqual(o.chatModel, 'tiny-b');
assert(o.installed.find((m) => m.name === 'tiny-b').chat && !o.installed.find((m) => m.name === 'tiny-a').chat);
await lm.select('build', 'tiny-a');
assert.strictEqual((await lm.overview()).buildModel, 'tiny-a');
assert.deepStrictEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')), { localChat: 'tiny-b', localBuild: 'tiny-a' }, 'saved to disk');
// it survives a restart (fresh cache)
resetSettingsCache();
resetLocalCache();
assert.strictEqual((await lm.overview()).chatModel, 'tiny-b');
// and the chat really talks to the chosen model
const { localChat } = await import('../src/local.mjs');
ollama.hits.length = 0;
await localChat({ persona: 'x', prompt: 'hello there' });
assert.strictEqual(ollama.hits.find((h) => h.url.endsWith('/chat/completions')).body.model, 'tiny-b');
console.log('  ✓');

console.log('▶ Bad choices are refused');
await assert.rejects(() => lm.select('chat', 'not-installed'), /not installed/);
await assert.rejects(() => lm.select('dance', 'tiny-a'), /role/);
console.log('  ✓');

console.log('▶ "Try" asks one model for a hello and reports the time');
ollama.hits.length = 0;
const t = await lm.tryModel('big-tools');
assert(t.text.length > 0 && t.ms >= 0 && t.model === 'big-tools');
assert.strictEqual(ollama.hits.find((h) => h.url.endsWith('/chat/completions')).body.model, 'big-tools', 'the model you tried is the one that answered');
await assert.rejects(() => lm.tryModel('nope'), /not installed/);
console.log('  ✓');

console.log('▶ Only plain model names are accepted for downloads');
for (const bad of ['', '../etc/passwd', 'a b', 'x;rm -rf /', 'a..b', 'y'.repeat(100), null, 42, '-flag']) {
  assert.strictEqual(lm.isValidModelName(bad), false, `rejects ${JSON.stringify(bad)}`);
  await assert.rejects(() => lm.startPull(bad), /valid model name/);
}
for (const good of ['qwen3:8b', 'llama3.2:3b', 'library/phi4-mini', 'qwen2.5-coder:7b']) assert.strictEqual(lm.isValidModelName(good), true, good);
console.log('  ✓');

console.log('▶ A download reports progress, finishes, and the model shows up');
const seen = [];
const result = await lm.startPull('qwen3:8b', (s) => seen.push({ ...s }));
assert.strictEqual(result.done, true);
assert.strictEqual(result.error, null);
assert.strictEqual(result.percent, 100);
const percents = seen.map((s) => s.percent);
assert(percents.length >= 4, 'several progress updates, got ' + percents.length);
assert(percents.every((p, i) => i === 0 || p >= percents[i - 1]), 'progress never goes backwards: ' + percents.join(','));
assert(seen.some((s) => s.percent > 0 && s.percent < 100), 'it passed through the middle');
o = await lm.overview();
assert(o.installed.some((m) => m.name === 'qwen3:8b'), 'the new model is listed');
assert.strictEqual(o.families.find((f) => f.name === 'qwen3').sizes.find((x) => x.tag === '8b').installed, true, 'and marked installed in its family');
console.log('  ✓ ' + percents.join('% -> ') + '%');

console.log('▶ A failed download shows Ollama\'s reason and installs nothing');
const failed = await lm.startPull('broken-model');
assert(failed.error && failed.error.includes('does not exist'), failed.error);
assert(!(await lm.overview()).installed.some((m) => m.name === 'broken-model'));
console.log('  ✓');

console.log('▶ Only one download at a time, and it can be cancelled');
const running = lm.startPull('slow-model');
await wait(300);
await assert.rejects(() => lm.startPull('qwen3:4b'), /Already downloading slow-model/);
assert.strictEqual(lm.cancelPull(), true);
const cancelled = await running;
assert(cancelled.cancelled && cancelled.done);
assert(!(await lm.overview()).installed.some((m) => m.name === 'slow-model'), 'nothing is installed from a cancelled download');
assert.strictEqual(lm.cancelPull(), false, 'nothing left to cancel');
console.log('  ✓');

console.log('▶ Servers other than Ollama cannot download (they manage their models themselves)');
process.env.LOCAL_LLM_KIND = 'lmstudio';
resetLocalCache();
assert.strictEqual((await lm.overview()).canPull, false);
await assert.rejects(() => lm.startPull('qwen3:8b'), /Downloads work with Ollama/);
process.env.LOCAL_LLM_KIND = 'ollama';
resetLocalCache();
console.log('  ✓');

// ---------------------------------------------------------------- through the real server and a WebSocket
console.log('▶ The real server: choose, download with live progress over the WebSocket');
const PORT = 3360 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), LAN_SHARE: '0', TELEGRAM_BOT_TOKEN: '', WORKROOM_SETTINGS_FILE: path.join(os.tmpdir(), `srv-settings-${Date.now()}.json`), WORKROOM_WORKSPACE: path.join(os.tmpdir(), 'models-ws-' + Date.now()) },
  stdio: 'ignore'
});
const api = (p, body) => fetch(`http://localhost:${PORT}${p}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined).then(async (r) => ({ status: r.status, json: await r.json() }));
for (let i = 0; i < 40; i++) { try { await api('/api/state'); break; } catch { await wait(250); } }

const ws = new WebSocket(`ws://localhost:${PORT}`);
const pulls = [];
ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'state_change' && m.change.type === 'local_pull') pulls.push(m.change.data); });
await new Promise((r) => ws.on('open', r));

let r = await api('/api/local/models');
assert.strictEqual(r.status, 200);
assert(r.json.available && r.json.installed.length >= 3);

r = await api('/api/local/select', { role: 'chat', model: 'tiny-a' });
assert.strictEqual(r.json.chatModel, 'tiny-a');
r = await api('/api/local/select', { role: 'chat', model: 'ghost' });
assert.strictEqual(r.status, 400);

r = await api('/api/local/pull', { model: '../../etc' });
assert.strictEqual(r.status, 400, 'a bad name is refused before anything starts');

r = await api('/api/local/pull', { model: 'gemma3:4b' });
assert.strictEqual(r.status, 202);
for (let i = 0; i < 60 && !pulls.some((p) => p?.done); i++) await wait(100);
assert(pulls.length >= 3, 'the page was told about the progress, got ' + pulls.length);
assert(pulls.at(-1).done && pulls.at(-1).percent === 100 && pulls.at(-1).model === 'gemma3:4b');
r = await api('/api/local/models');
assert(r.json.installed.some((m) => m.name === 'gemma3:4b'));

r = await api('/api/local/pull', { model: 'slow-model' });
assert.strictEqual(r.status, 202);
await wait(300);
r = await api('/api/local/pull', { model: 'qwen3:4b' });
assert.strictEqual(r.status, 409, 'a second download is refused while one runs');
r = await api('/api/local/pull/cancel', {});
assert.strictEqual(r.json.cancelled, true);
console.log('  ✓ ' + pulls.length + ' live progress messages reached the page');

ws.close();
server.kill();
ollama.close();
await wait(500);
console.log('\n🎉 MODELS TESTS PASSED');
process.exit(0);
