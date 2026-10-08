// A runaway chat must never come back: bounded messages, an emergency brake, a self-healing state file,
// and a real server that stays quiet after it starts (the "I start the server and they are still chatting" case)
import './setup.mjs';
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. a bloated state file from an older, looping version ----
const huge = 'Architecture blueprint established for "' + 'Frontend raycasting buffer allocated for '.repeat(3000) + '"';
const agent = (id) => ({
  id, name: id, role: 'x', color: '#ffffff', pos: { x: 1, y: 0, z: 1 }, state: 'IDLE', energy: 100, coffeeCups: 0,
  currentTask: 'Idle', status: 'Idle',
  screen: { title: 't', file: 'f', lines: [huge], logs: Array.from({ length: 25 }, () => 'Intercom msg: "' + huge + '"'), thoughts: huge }
});
const bloated = {
  agents: Object.fromEntries(['alice', 'bob', 'charlie', 'diana', 'echo'].map((id) => [id, agent(id)])),
  intercomMessages: Array.from({ length: 50 }, (_, i) => ({ id: 'm' + i, timestamp: '00:00:00', sender: 'alice', recipient: 'bob', text: huge, type: 'direct' })),
  whiteboard: [],
  stats: {}
};
fs.writeFileSync(process.env.WORKROOM_STATE_FILE, JSON.stringify(bloated));
const bigSize = fs.statSync(process.env.WORKROOM_STATE_FILE).size;
assert(bigSize > 5 * 1024 * 1024, 'the test file really is huge (' + bigSize + ' bytes)');

console.log('▶ A bloated saved state is shortened when it is loaded');
const { stateManager, clip, MAX_TEXT } = await import('../src/state.mjs');
assert(fs.statSync(process.env.WORKROOM_STATE_FILE).size < 400 * 1024, 'the file on disk was rewritten small');
assert(stateManager.intercomMessages.every((m) => m.text.length <= MAX_TEXT + 20), 'messages are short again');
assert(Object.values(stateManager.agents).every((a) => a.screen.logs.every((l) => l.length <= 520) && a.screen.thoughts.length <= 520));
console.log('  ✓ ' + (bigSize / 1048576).toFixed(1) + ' MB -> ' + (fs.statSync(process.env.WORKROOM_STATE_FILE).size / 1024).toFixed(0) + ' KB');

console.log('▶ A single message can never be huge');
const m = stateManager.sendMessage('bob', 'x'.repeat(100000), 'player');
assert(m.text.length <= MAX_TEXT + 20 && clip('y'.repeat(50000)).length <= MAX_TEXT + 20);
stateManager.broadcast('z'.repeat(100000), 'lead');
assert(stateManager.intercomMessages.at(-1).text.length <= MAX_TEXT + 20);
console.log('  ✓');

console.log('▶ Canned replies quote only a short topic, so replies to replies do not grow');
const { llmProvider } = await import('../src/llm-provider.mjs');
let text = 'Please review the architecture of the intercom bus';
let longest = 0;
for (let i = 0; i < 40; i++) {
  text = llmProvider.generateLocalSimulation(['alice', 'bob', 'charlie', 'diana', 'echo'][i % 5], 'x', text).text;
  longest = Math.max(longest, text.length);
}
assert(longest < 300, 'forty replies in a row stayed short, longest ' + longest);
console.log('  ✓ longest reply ' + longest + ' characters');

console.log('▶ Without a model, small talk and questions get an honest friendly answer');
const hello = llmProvider.generateLocalSimulation('alice', 'Systems Architect', 'HELLO FOLKS').text;
const question = llmProvider.generateLocalSimulation('bob', 'Frontend Engineer', 'no answer for me?').text;
assert(hello.startsWith('Hi! Alice here') && hello.includes('goal bar'), hello);
assert(question.startsWith('Bob:') && question.includes('Ollama') && !question.includes('no answer for me'), question);
console.log('  ✓');

console.log('▶ Emergency brake: a message storm between agents is stopped, people are not affected');
const before = stateManager.intercomMessages.length;
let dropped = 0;
for (let i = 0; i < 60; i++) {
  const r = stateManager.sendMessage(i % 2 ? 'alice' : 'bob', 'ping ' + i, i % 2 ? 'bob' : 'alice');
  if (r.dropped) dropped++;
}
assert(dropped >= 50, 'most of the storm was dropped, dropped ' + dropped);
assert(stateManager.intercomMessages.length - before <= 8, 'at most 8 agent-to-agent messages were stored');
const human = stateManager.sendMessage('alice', 'hello from a person', 'player');
assert(!human.dropped, 'a person can still talk to an agent during a storm');
console.log('  ✓ ' + dropped + ' of 60 dropped');

// ---- 2. the real server, started on top of the bloated file ----
console.log('▶ A real server started on a bloated file stays quiet and heals the file');
fs.writeFileSync(process.env.WORKROOM_STATE_FILE, JSON.stringify(bloated));
const PORT = 3380 + Math.floor(Math.random() * 9);
const server = spawn(process.execPath, [path.join(here, '..', 'src', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), LAN_SHARE: '0', LOCAL_LLM: '0', TELEGRAM_BOT_TOKEN: '', WORKROOM_WORKSPACE: path.join(os.tmpdir(), 'heal-ws-' + Date.now()) },
  stdio: 'ignore'
});
const api = (p, init) => fetch(`http://localhost:${PORT}${p}`, init).then((r) => r.json());
for (let i = 0; i < 40; i++) { try { await api('/api/state'); break; } catch { await wait(250); } }

const msgs = async () => (await api('/api/state')).intercomMessages;
const first = await msgs();
assert(first.every((x) => x.text.length <= MAX_TEXT + 20), 'the page receives short messages');
await wait(5000);
const later = await msgs();
assert.strictEqual(later.length, first.length, 'nobody is talking after the server started');
assert(fs.statSync(process.env.WORKROOM_STATE_FILE).size < 400 * 1024, 'the state file did not grow');

// one agent talks to another through the real API: exactly one message, no ping-pong
const n = later.length;
await api('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: 'bob', message: 'Bob, please check the raycaster', sender: 'alice' }) });
await wait(5000);
const after = await msgs();
assert.strictEqual(after.length - n, 1, 'one message, no replies, got ' + (after.length - n));
assert(fs.statSync(process.env.WORKROOM_STATE_FILE).size < 400 * 1024);
console.log('  ✓');

server.kill();
await wait(500);
console.log('\n🎉 HEAL TESTS PASSED');
process.exit(0);
