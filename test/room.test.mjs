// Furniture that does something: every action is wired up, and the library lists the built projects
import './setup.mjs';
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const engine = read('public/js/engine3d.js');
const app = read('public/js/app.js');
const html = read('public/index.html');

console.log('▶ Every piece of furniture with a job points at an action the app handles');
const actsBlock = engine.slice(engine.indexOf('const ACTS = {'), engine.indexOf('};', engine.indexOf('const ACTS = {')));
const acts = [...actsBlock.matchAll(/(\w+): \['([^']+)', '(\w+)', '([^']+)'\]/g)].map(([, key, title, act, hint]) => ({ key, title, act, hint }));
assert(acts.length >= 10, 'at least ten kinds of furniture can be used, got ' + acts.length);
const runAction = app.slice(app.indexOf('runAction(act) {'), app.indexOf('printReport() {'));
const handled = new Set([...runAction.matchAll(/case '(\w+)'/g)].map((m) => m[1]));
for (const a of acts) {
  assert(handled.has(a.act), `"${a.act}" (${a.title}) has no case in runAction`);
  assert(a.title.length > 3 && a.hint.length > 5, `${a.key} has a readable title and hint`);
}
console.log('  ✓ ' + acts.map((a) => a.key + '→' + a.act).join(', '));

console.log('▶ Every kind of furniture in that list exists in the room');
const ids = [...engine.matchAll(/(?:D\(|id: )'([a-z_0-9]+)'/g)].map((m) => m[1]);
for (const a of acts) {
  const found = ids.some((id) => id.replace(/[0-9]+$/, '').replace(/^lamp_.*/, 'lamp') === a.key);
  assert(found, `no furniture with id like "${a.key}" in the layout`);
}
console.log('  ✓ ' + ids.length + ' pieces in the layout');

console.log('▶ The windows the actions open exist');
for (const tab of ['chat', 'jobs', 'whiteboard', 'library', 'models', 'apikeys']) {
  assert(html.includes(`data-tab="${tab}"`) && html.includes(`id="tab-${tab}"`), `tab "${tab}" exists`);
}
for (const id of ['toast', 'info-modal', 'info-title', 'info-body', 'info-close', 'models-body', 'library-body']) assert(html.includes(`id="${id}"`), `#${id} exists`);
console.log('  ✓');

console.log('▶ Bins, lamps and plants no longer fake the token bars');
const coffee = engine.slice(engine.indexOf("item.type === 'coffee_bar'"), engine.indexOf("item.type === 'arcade'"));
assert(!/energy/.test(coffee), 'the coffee bar does not change the (real) token bars any more');
console.log('  ✓');

// ---------------------------------------------------------------- the library API
console.log('▶ The library lists every project folder, newest first');
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'room-ws-'));
const mk = (name, files, title, ageMs) => {
  fs.mkdirSync(path.join(ws, name), { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(ws, name, f), f === 'index.html' ? `<!doctype html><title>${title}</title><h1>x</h1>` : 'x');
  const t = new Date(Date.now() - ageMs);
  for (const f of files) fs.utimesSync(path.join(ws, name, f), t, t);
};
mk('old-game', ['index.html', 'app.js'], 'Old Game', 3 * 3600e3);
mk('new-site', ['index.html', 'style.css', 'app.js'], 'New Site', 60e3);
mk('notes-only', ['README.md'], '', 1800e3);
fs.writeFileSync(path.join(ws, 'stray-file.txt'), 'not a project');

const PORT = 3350 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), LAN_SHARE: '0', LOCAL_LLM: '0', TELEGRAM_BOT_TOKEN: '', WORKROOM_WORKSPACE: ws },
  stdio: 'ignore'
});
const get = (p) => fetch(`http://localhost:${PORT}${p}`).then((r) => r.json());
for (let i = 0; i < 40; i++) { try { await get('/api/state'); break; } catch { await wait(250); } }

const { projects } = await get('/api/projects');
assert.deepStrictEqual(projects.map((p) => p.name), ['new-site', 'notes-only', 'old-game'], 'newest first, stray files ignored');
assert.deepStrictEqual(projects.map((p) => p.title), ['New Site', '', 'Old Game'], 'titles come from index.html');
assert.deepStrictEqual(projects.map((p) => p.hasIndex), [true, false, true]);
assert.deepStrictEqual(projects.map((p) => p.files), [3, 1, 2]);
console.log('  ✓');

console.log('▶ The water cooler can say whether Telegram is running');
const share = await get('/api/share');
assert.deepStrictEqual(share.telegram, { running: false, allowed: 0 });
console.log('  ✓');

server.kill();
await wait(500);
fs.rmSync(ws, { recursive: true, force: true });
console.log('\n🎉 ROOM TESTS PASSED');
process.exit(0);
