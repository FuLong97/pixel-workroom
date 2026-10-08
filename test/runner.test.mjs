// Goal runner + token budget tests (no real API calls, no tokens spent)
import './setup.mjs';
import fs from 'fs';
import os from 'os';
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

console.log('▶ Queue: goals wait in order, limits apply, cancel works');
const order = [];
runner.on('finished', (e) => order.push(e.goal));
const r1 = runner.submit({ goal: 'q one', owner: 'a' });
assert(r1.started && r1.ahead === 0);
const r2 = runner.submit({ goal: 'q two', owner: 'b' });
assert(r2.queued && r2.ahead === 1);
const r3 = runner.submit({ goal: 'q three', owner: 'b' });
assert(r3.queued && r3.ahead === 2);
const r4 = runner.submit({ goal: 'q four', owner: 'b' });
assert.strictEqual(r4.ok, false, 'per-owner limit');
assert.strictEqual(runner.status().queue.length, 2);
assert.strictEqual(runner.cancelQueued('b'), 2, 'cancel removes only that owners goals');
runner.submit({ goal: 'q five', owner: 'c' });
runner.submit({ goal: 'q six', owner: 'c' });
await wait(() => !runner.running && runner.queue.length === 0, 30000);
assert.deepStrictEqual(order, ['q one', 'q five', 'q six'], 'runs in submit order, cancelled goals never run');
console.log('  ✓');

console.log('▶ Orchestration: the strongest model plans, a mid model builds, cheap models check');
const argsLog = path.join(os.tmpdir(), `orch-${Date.now()}.log`);
process.env.ARGS_LOG = argsLog;
const runs = () => fs.readFileSync(argsLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const modelOf = (a) => a[a.indexOf('--model') + 1];
const promptOf = (a) => a[a.indexOf('-p') + 1];
const idle = () => wait(() => !runner.running && runner.queue.length === 0, 30000);

assert(runner.submit({ goal: 'orchestrated app', mode: 'team', owner: 'o' }).ok);
await idle();
let rs = runs();
assert.deepStrictEqual(rs.map(modelOf), ['opus', 'sonnet', 'haiku', 'haiku', 'haiku']);
assert(promptOf(rs[0]).includes('## Bob') && promptOf(rs[0]).includes('## Charlie') && promptOf(rs[0]).includes('## Echo'), 'the plan asks for one section per worker');
assert(promptOf(rs[1]).includes('ONLY the section titled "## Bob"'), 'workers only do their own section');
assert(promptOf(rs[3]).includes('"## Diana"') && promptOf(rs[4]).includes('"## Echo"'));
assert.deepStrictEqual(runner.status().steps.map((s) => s.model), ['opus', 'sonnet', 'haiku', 'haiku', 'haiku'], 'the UI can show each step\'s model');
console.log('  ✓ opus plans, sonnet builds, haiku checks');

fs.writeFileSync(argsLog, '');
process.env.ORCHESTRATE = '0';
assert(runner.submit({ goal: 'single model app', mode: 'team', owner: 'o' }).ok);
await idle();
assert.deepStrictEqual(runs().map(modelOf), ['sonnet', 'sonnet', 'sonnet', 'sonnet', 'sonnet'], 'ORCHESTRATE=0 uses one model');
delete process.env.ORCHESTRATE;

fs.writeFileSync(argsLog, '');
process.env.CLAUDE_PLAN_MODEL = 'sonnet';
process.env.CLAUDE_CHECK_MODEL = 'opus';
assert(runner.submit({ goal: 'custom tiers app', mode: 'team', owner: 'o' }).ok);
await idle();
assert.deepStrictEqual(runs().map(modelOf), ['sonnet', 'sonnet', 'opus', 'opus', 'opus'], 'tiers can be overridden');
delete process.env.CLAUDE_PLAN_MODEL;
delete process.env.CLAUDE_CHECK_MODEL;

fs.writeFileSync(argsLog, '');
assert(runner.submit({ goal: 'solo app', mode: 'solo', owner: 'o' }).ok);
await idle();
assert.deepStrictEqual(runs().map(modelOf), ['sonnet'], 'solo is one builder');
console.log('  ✓ ORCHESTRATE=0, tier overrides and solo mode');

console.log('▶ Progress is pushed to the browser as it happens');
const events = [];
// copy at once, like the WebSocket does when it sends the message (the objects keep changing afterwards)
stateManager.on('state_change', (c) => { if (c.type === 'task_update' || c.type === 'run_update') events.push(JSON.parse(JSON.stringify(c))); });
assert(runner.submit({ goal: 'live progress app', mode: 'solo', owner: 'o' }).ok);
await idle();
const runUpdates = events.filter((e) => e.type === 'run_update');
const firstRunning = runUpdates.findIndex((e) => e.data.steps[0]?.status === 'RUNNING');
const firstDone = runUpdates.findIndex((e) => e.data.steps[0]?.status === 'DONE');
assert(firstRunning >= 0 && firstDone > firstRunning, 'the step is announced as RUNNING and later as DONE, without polling');
assert(Array.isArray(runUpdates[firstDone].data.files), 'the finished update carries the file list');
const taskUpdates = events.filter((e) => e.type === 'task_update');
assert(taskUpdates.length >= 2, 'the job card moves while the agent works');
assert(taskUpdates[0].data.progress < taskUpdates.at(-1).data.progress && taskUpdates.at(-1).data.progress === 100);
console.log('  ✓ ' + runUpdates.length + ' run updates, ' + taskUpdates.length + ' job updates');

console.log('▶ A shell command an agent tries is shown in full');
const bobLogs = stateManager.agents.bob.screen.logs.join('\n');
assert(bobLogs.includes('$ cd site && npm run build --silent -- --flag="two words" && rm -rf tmp  (blocked'), 'full command, not just the word Bash');
console.log('  ✓');


console.log('▶ Budget: exhausted agent spends nothing and cache serves repeats');
llmProvider.setBudget('echo', 400000, 400000);
const r = await llmProvider.generateAgentTurn('echo', 'please analyse the architecture in detail');
assert.strictEqual(r.tokens, 0);
llmProvider.refillAll();
assert.strictEqual(llmProvider.getBudget('echo').used, 0);
console.log('  ✓');

console.log('\n🎉 RUNNER TESTS PASSED');
