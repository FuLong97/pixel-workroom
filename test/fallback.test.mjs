// Model fallback: when one CLI is out of tokens the next one takes over
import './setup.mjs';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const fx = (n) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', n);
const counter = path.join(os.tmpdir(), `fallback-count-${Date.now()}.txt`);
process.env.COUNTER_FILE = counter;
process.env.RUN_BACKENDS = 'claude,codex';
const calls = () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').trim().split('\n').filter(Boolean) : []);

const { runner } = await import('../src/runner.mjs');
const { stateManager } = await import('../src/state.mjs');
const wait = async (cond, ms = 20000) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
};
const finished = [];
const fallbacks = [];
runner.on('finished', (e) => finished.push(e));
runner.on('fallback', (e) => fallbacks.push(e));
const run = async (goal) => {
  const n = finished.length;
  assert(runner.submit({ goal, owner: 'x' }).ok);
  await wait(() => finished.length > n);
  return finished.at(-1);
};

console.log('▶ Claude out of tokens -> Codex takes over and finishes the build');
process.env.CLAUDE_BIN = fx('fake-claude-quota.mjs');
process.env.CODEX_BIN = fx('fake-codex.mjs');
let r = await run('first app');
assert.strictEqual(r.ok, true, r.error);
assert(r.files.includes('index.html'), 'Codex wrote the project');
assert.deepStrictEqual(calls(), ['claude', 'codex']);
assert.strictEqual(fallbacks.length, 1);
assert.deepStrictEqual([fallbacks[0].from, fallbacks[0].to], ['claude', 'codex']);
assert(runner.status().resting.some((x) => x.backend === 'claude'), 'Claude is resting');
assert(stateManager.intercomMessages.some((m) => m.text.includes('Claude Code is out of tokens, continuing with Codex')));
console.log('  ✓ fell back, announced it, normal "rate limit" wording in Codex output was not mistaken for a quota error');

console.log('▶ A resting model is not retried (no wasted call)');
r = await run('second app');
assert.strictEqual(r.ok, true, r.error);
assert.deepStrictEqual(calls(), ['claude', 'codex', 'codex'], 'Claude was skipped while resting');
assert.strictEqual(fallbacks.length, 1, 'no new fallback announcement');
console.log('  ✓');

console.log('▶ Every model out of tokens -> clear message');
runner.cooldown.clear();
process.env.CODEX_BIN = fx('fake-codex-quota.mjs');
r = await run('third app');
assert.strictEqual(r.ok, false);
assert(r.error.includes('No model could do this step'), r.error);
assert(r.error.includes('Claude Code is out of tokens') && r.error.includes('Codex is out of tokens'), r.error);
console.log('  ✓', r.error);

console.log('▶ A real error is shown, not hidden behind another model');
runner.cooldown.clear();
process.env.CLAUDE_BIN = fx('fake-claude-broken.mjs');
process.env.CODEX_BIN = fx('fake-codex.mjs');
const before = calls().length;
r = await run('fourth app');
assert.strictEqual(r.ok, false);
assert(r.error.includes('path outside project'), r.error);
assert.deepStrictEqual(calls().slice(before), ['claude'], 'Codex must not be asked after a real error');
console.log('  ✓');

console.log('▶ Missing model is skipped, next one used');
runner.cooldown.clear();
process.env.CLAUDE_BIN = path.join(os.tmpdir(), 'definitely-not-here.mjs');   // script that does not exist -> node fails, so use a bad command instead
process.env.CLAUDE_BIN = 'definitely-not-a-real-command-xyz';
const b2 = calls().length;
r = await run('fifth app');
assert.strictEqual(r.ok, true, r.error);
assert.deepStrictEqual(calls().slice(b2), ['codex']);
console.log('  ✓');
console.log('▶ Exit code 0 is not enough: a step that must write files but wrote none is a failure');
runner.cooldown.clear();
process.env.RUN_BACKENDS = 'codex';
process.env.CODEX_BIN = fx('fake-codex-silent.mjs');
r = await run('silent app');
assert.strictEqual(r.ok, false);
assert(r.error.includes('finished but wrote no file'), r.error);
console.log('  ✓');

console.log('▶ Local model as the last resort: driven by Codex in --oss mode');
const { startFakeLocal } = await import('./fixtures/fake-local-server.mjs');
const { resetLocalCache } = await import('../src/local.mjs');
const local = await startFakeLocal({ models: ['tiny-model'] });
delete process.env.LOCAL_LLM;                       // setup.mjs turns local models off by default
process.env.LOCAL_LLM_URL = local.base;
process.env.LOCAL_LLM_KIND = 'ollama';
resetLocalCache();
const argsFile = path.join(os.tmpdir(), `codex-args-${Date.now()}.json`);
process.env.ARGS_FILE = argsFile;
process.env.RUN_BACKENDS = 'claude,local';
process.env.CLAUDE_BIN = fx('fake-claude-quota.mjs');
process.env.CODEX_BIN = fx('fake-codex-args.mjs');
runner.cooldown.clear();
r = await run('local app');
assert.strictEqual(r.ok, true, r.error);
const args = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
assert(args.includes('--oss') && args.includes('ollama') && args.includes('tiny-model'), args.join(' '));
assert(args.includes('workspace-write'), 'local builds stay in the sandbox');
assert.deepStrictEqual([fallbacks.at(-1).from, fallbacks.at(-1).to], ['claude', 'local']);
console.log('  ✓ Claude dry -> local model (' + args.slice(0, 6).join(' ') + ' ...)');

console.log('▶ No local server -> clear message');
process.env.LOCAL_LLM = '0';
resetLocalCache();
runner.cooldown.clear();
r = await run('no local app');
assert.strictEqual(r.ok, false);
assert(r.error.includes('no local model'), r.error);
console.log('  ✓');
local.close();
await new Promise((res) => setTimeout(res, 500));


console.log('\n🎉 FALLBACK TESTS PASSED');
process.exit(0);
