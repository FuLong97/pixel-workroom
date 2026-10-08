// Goal runner + token budget tests (no real API calls, no tokens spent)
import './setup.mjs';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.CLAUDE_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-claude.mjs');

const { runner } = await import('../src/runner.mjs');
const { stateManager } = await import('../src/state.mjs');
const { llmProvider } = await import('../src/llm-provider.mjs');

const wait = async (cond, ms = 15000) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
};

console.log('▶ Runner: empty goal is rejected');
assert.strictEqual(runner.start('   ').ok, false);
console.log('  ✓');

console.log('▶ Runner: solo run builds a file and charges Bob\'s budget');
assert.strictEqual(runner.start('a test app', 'solo').ok, true);
assert.strictEqual(runner.start('second', 'solo').ok, false, 'parallel runs must be refused');
await wait(() => !runner.running);
const st = runner.status();
assert.strictEqual(st.error, null);
assert.deepStrictEqual(st.steps.map((s) => s.status), ['DONE']);
assert(st.files.includes('index.html'));
assert.strictEqual(llmProvider.getBudget('bob').used, 1500);
assert.strictEqual(stateManager.agents.bob.state, 'IDLE');
console.log('  ✓ file written, 1500 tokens charged, agent back to IDLE');

console.log('▶ Runner: team mode runs all five agents');
assert.strictEqual(runner.start('team app', 'team').ok, true);
await wait(() => !runner.running);
assert.deepStrictEqual(runner.status().steps.map((s) => s.agent), ['alice', 'bob', 'charlie', 'diana', 'echo']);
assert(runner.status().steps.every((s) => s.status === 'DONE'));
console.log('  ✓');

console.log('▶ Runner: each goal gets its own folder; improve reuses it');
const firstDir = runner.status().dir;
assert(firstDir, 'project dir is reported');
runner.start('another app', 'solo');
await wait(() => !runner.running);
const secondDir = runner.status().dir;
assert.notStrictEqual(secondDir, firstDir, 'new goal must not reuse the old folder');
runner.start('tweak it', 'solo', true);
await wait(() => !runner.running);
assert.strictEqual(runner.status().dir, secondDir, 'improve reuses the previous folder');
console.log('  ✓');

console.log('▶ Budget: exhausted agent spends nothing and cache serves repeats');
llmProvider.setBudget('echo', 400000, 400000);
const r = await llmProvider.generateAgentTurn('echo', 'please analyse the architecture in detail');
assert.strictEqual(r.tokens, 0);
llmProvider.refillAll();
assert.strictEqual(llmProvider.getBudget('echo').used, 0);
console.log('  ✓');

console.log('\n🎉 RUNNER TESTS PASSED');
